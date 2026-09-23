"""TypeSafe Jev client for pairwise chunk relations."""
from typesafe_sdk import AsyncTypeSafeClient, Choice
from app.core.config import config

async def classify_pairs(chunks_a: list[dict], chunks_b: list[dict], query: str) -> dict:
    """One Choice per (a_i, b_j) pair. Returns {a{i}_b{j}: {choice, confidence, probabilities}}."""
    if not (config.TYPESAFE_API_KEY or "").strip():
        raise RuntimeError("CompareResearch requires TYPESAFE_API_KEY")
    state = {"query": query}
    for i, chunk in enumerate(chunks_a):
        state[f"a_{i}"] = chunk["content"]
    for j, chunk in enumerate(chunks_b):
        state[f"b_{j}"] = chunk["content"]
    questions = {
        f"a{i}_b{j}": Choice(
            instructions=f"How does `b_{j}` relate to `a_{i}` on the topic of `query`?",
            criteria={
                "corroboratory": f"`b_{j}` supports or agrees with `a_{i}` on the same claim",
                "contradictory": f"`b_{j}` conflicts with `a_{i}` on the same claim",
                "neutral": f"`b_{j}` neither supports nor conflicts with `a_{i}`",
            },
        )
        for i in range(len(chunks_a))
        for j in range(len(chunks_b))
    }

    async with AsyncTypeSafeClient(
        api_key=config.TYPESAFE_API_KEY,
        model="jev-1.13.0",
        timeout=180,
    ) as client:
        response = await client.system_one(state=state, questions=questions)

    return {
        qid: {
            "choice": ans.choice,
            "confidence": ans.confidence,
            "probabilities": dict(ans.probabilities or {}),
        }
        for qid, ans in response.choices.items()
    }