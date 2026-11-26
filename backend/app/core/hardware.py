import torch

def should_use_acceleration(min_vram_gb=2.0) -> bool:
    if not torch.cuda.is_available():
        return False
    try:
        props = torch.cuda.get_device_properties(torch.cuda.current_device())
    except Exception:
        return False
    return props.total_memory / (1024**3) >= min_vram_gb
