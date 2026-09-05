"""Verify remote URLs by downloading the full PDF (%PDF- magic bytes)."""
from __future__ import annotations
import asyncio
import ipaddress
from collections import Counter
from urllib.parse import urlparse
import httpx
from app import logger
from app.core.config import config

PDF_MAGIC = b"%PDF"
DEFAULT_USER_AGENT = "ResearchApp/1.0"
VERIFY_REASON_KEY = "pdf_verify_reason"


def url_is_safe_for_fetch(url: str) -> bool:
    """Block obvious SSRF targets; hostname DNS resolution is not checked here."""
    try:
        parsed = urlparse(url.strip())
    except Exception:
        return False
    if parsed.scheme not in ("http", "https"):
        return False
    host = (parsed.hostname or "").lower()
    if not host or host in ("localhost", "127.0.0.1", "::1"):
        return False
    try:
        addr = ipaddress.ip_address(host)
        if addr.is_private or addr.is_loopback or addr.is_link_local or addr.is_reserved:
            return False
    except ValueError:
        pass
    return True


def _content_type_acceptable(content_type: str | None) -> bool:
    if not content_type:
        return True
    main = content_type.split(";", 1)[0].strip().lower()
    return main in (
        "application/pdf",
        "application/x-pdf",
        "application/octet-stream",
        "binary/octet-stream",
    )

async def _download_full_body(
    http_client,
    url: str,
    timeout: float,
    headers: dict,
) -> tuple[bytes | None, str | None, int, str | None, str | None]:
    """Stream-download the full response body.

    Returns (body, final_url, status_code, content_type, fail_reason).
    ``fail_reason`` is set when body is None (e.g. http_403).
    """

    async def _read_stream(resp: httpx.Response) -> tuple[bytes | None, str | None, int, str | None, str | None]:
        final = str(resp.url)
        ctype = resp.headers.get("content-type")
        if resp.status_code != 200:
            return None, final, resp.status_code, ctype, f"http_{resp.status_code}"

        chunks: list[bytes] = []
        async for chunk in resp.aiter_bytes():
            chunks.append(chunk)
        return b"".join(chunks), final, resp.status_code, ctype, None

    if http_client is not None:
        async with http_client.stream("GET", url, headers=headers, timeout=timeout) as resp:
            return await _read_stream(resp)

    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        async with client.stream("GET", url, headers=headers, timeout=timeout) as resp:
            return await _read_stream(resp)


async def download_pdf_from_url(
    url: str,
    *,
    http_client=None,
    timeout: float | None = None,
) -> tuple[bytes | None, str | None, str | None, str]:
    """Download and validate a remote PDF.

    Returns ``(body, final_url, content_type, reason)``. ``body`` is set when
    ``reason`` is ``verified``.
    """
    if not url:
        return None, None, None, "no_url"
    if not url_is_safe_for_fetch(url):
        logger.info("PDF verify: unsafe or invalid URL scheme/host — %s", url[:120])
        return None, None, None, "unsafe_url"

    timeout = timeout if timeout is not None else config.HTTP_TIMEOUT
    headers = {"User-Agent": DEFAULT_USER_AGENT}

    try:
        body, final_url, status, content_type, download_fail = await _download_full_body(
            http_client, url, timeout, headers
        )
        if download_fail:
            logger.info(
                "PDF verify: %s (content-type=%s) — %s",
                download_fail,
                content_type,
                url[:120],
            )
            return None, final_url, content_type, download_fail

        if not body:
            logger.info("PDF verify: empty body (status=%s) — %s", status, url[:120])
            return None, final_url, content_type, "empty_body"

        if body[:4] != PDF_MAGIC:
            head = body[:32].hex()
            logger.info(
                "PDF verify: not PDF magic (status=%s, type=%s, bytes=%d, head=%s) — %s",
                status,
                content_type,
                len(body),
                head,
                url[:120],
            )
            return None, final_url, content_type, "not_pdf_magic"

        if not _content_type_acceptable(content_type):
            logger.info(
                "PDF verify: PDF magic present but content-type rejected (%s) — %s",
                content_type,
                url[:120],
            )
            return None, final_url, content_type, "content_type_rejected"

        if final_url and final_url != url:
            logger.info("PDF verify: verified (redirect %s -> %s)", url[:80], final_url[:80])
        return body, final_url, content_type, "verified"

    except httpx.TimeoutException:
        logger.info("PDF verify: timeout after %ss — %s", timeout, url[:120])
        return None, None, None, "timeout"
    except Exception as e:
        logger.warning("PDF verify: %s — %s: %s", type(e).__name__, url[:120], e)
        return None, None, None, f"error:{type(e).__name__}"


async def verify_pdf_url(
    url: str,
    *,
    http_client=None,
    timeout: float | None = None,
) -> tuple[bool, str | None, str]:
    """Download the full file; return (verified, final_url_after_redirects, reason)."""
    body, final_url, _content_type, reason = await download_pdf_from_url(
        url,
        http_client=http_client,
        timeout=timeout,
    )
    if reason == "verified" and body:
        return True, final_url, reason
    return False, final_url, reason


def _log_verification_summary(rows: list[dict]) -> None:
    reasons = Counter(r.get(VERIFY_REASON_KEY, "unknown") for r in rows)
    verified = reasons.get("verified", 0)
    logger.info(
        "PDF verification summary: %d/%d verified — breakdown %s",
        verified,
        len(rows),
        dict(reasons),
    )


async def attach_pdf_verification(
    rows: list[dict],
    *,
    url_key: str = "pdf_url",
    verified_key: str = "pdf_verified",
    http_client=None,
) -> list[dict]:
    """Set ``verified_key`` on each row; update ``url_key`` to the final URL when verified."""
    urls = [r.get(url_key) for r in rows if r.get(url_key)]
    if not urls:
        for row in rows:
            row[verified_key] = False
            row[VERIFY_REASON_KEY] = "no_pdf_url_from_openalex"
            work_id = row.get("id", "?")
            title = (row.get("title") or "Untitled")[:80]
            logger.info(
                "PDF verify [%s] %r: no_pdf_url_from_openalex (landing=%s)",
                work_id,
                title,
                (row.get("landing_page_url") or "none")[:100],
            )
        _log_verification_summary(rows)
        return rows

    results = await asyncio.gather(
        *[verify_pdf_url(u, http_client=http_client) for u in urls],
        return_exceptions=True,
    )
    by_url: dict[str, tuple[bool, str | None, str]] = {}
    for url, result in zip(urls, results):
        if isinstance(result, Exception):
            logger.warning("PDF verification error for %s: %s", url[:120], result)
            by_url[url] = (False, None, f"error:{type(result).__name__}")
        else:
            by_url[url] = result

    for row in rows:
        work_id = row.get("id", "?")
        title = (row.get("title") or "Untitled")[:80]
        raw_url = row.get(url_key)
        if not raw_url:
            row[verified_key] = False
            row[VERIFY_REASON_KEY] = "no_pdf_url_from_openalex"
            logger.info(
                "PDF verify [%s] %r: no_pdf_url_from_openalex (landing=%s)",
                work_id,
                title,
                (row.get("landing_page_url") or "none")[:100],
            )
            continue

        verified, final_url, reason = by_url.get(raw_url, (False, None, "unknown"))
        row[verified_key] = verified
        row[VERIFY_REASON_KEY] = reason
        if verified and final_url:
            row[url_key] = final_url
            logger.info(
                "PDF verify [%s] %r: verified — %s",
                work_id,
                title,
                final_url[:120],
            )
        else:
            logger.info(
                "PDF verify [%s] %r: NOT verified (%s) — %s",
                work_id,
                title,
                reason,
                raw_url[:120],
            )

    _log_verification_summary(rows)
    return rows
