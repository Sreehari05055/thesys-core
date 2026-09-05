from app import logger
from transformers import AutoTokenizer

class TokenizerManager:
    """Token counts via a local gpt2 tokenizer (proxy; not the embedding API tokenizer)."""
    def __init__(self):
        self._tokenizer = AutoTokenizer.from_pretrained("gpt2")

    def count_tokens(self, text: str) -> int:
        try:
            return len(self._tokenizer.encode(text, add_special_tokens=False))
        except Exception as e:
            logger.error(f"Error counting tokens: {e}")
            return len(text.split()) // 3

tokenizer_manager = TokenizerManager()