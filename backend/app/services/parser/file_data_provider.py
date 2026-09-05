import os
import hashlib
from app.services.parser.pdf_parser import PDFExtractor
from app import logger

_PARSERS = {".pdf": PDFExtractor()}

def iter_documents(data_dir: str, file_paths: list = None):
    """Parse files into indexer-ready dicts. ``file_paths`` limits the scan; ``None`` walks ``data_dir``."""
    paths = (
        file_paths
        if file_paths is not None
        else [os.path.join(data_dir, f) for f in os.listdir(data_dir)]
    )
    for filepath in paths:
        filename = os.path.basename(filepath)
        parser = _PARSERS.get(os.path.splitext(filepath)[1].lower())
        if parser is None:
            logger.info(f"Skipping unsupported file: {filename}")
            continue

        try:
            raw_data = parser.extract(filepath)
            if not raw_data:
                continue

            raw_meta = raw_data["metadata"]
            yield {
                "id": hashlib.md5(filename.encode()).hexdigest(),
                "title": raw_data["title"],
                "page_data": raw_data["page_data"],
                "metadata": {
                    **raw_meta,
                    "filename": raw_meta.get("filename") or filename,
                },
            }
        except Exception as e:
            logger.exception(f"Error reading {filename}: {e}")
