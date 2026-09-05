import psutil
import torch

class HardwareDetector:
    @staticmethod
    def get_gpu_info():
        if torch.cuda.is_available():
            try:
                device_id = torch.cuda.current_device()
                props = torch.cuda.get_device_properties(device_id)
                vram_gb = props.total_memory / (1024**3)
                return True, vram_gb, props.name
            except Exception:
                return False, 0, "Error detecting GPU"
        return False, 0, "None"

    @staticmethod
    def get_cpu_info():
        return psutil.virtual_memory().total / (1024**3)

    @staticmethod
    def should_use_acceleration(min_vram_gb=2.0):
        has_gpu, vram, _ = HardwareDetector.get_gpu_info()
        return has_gpu and vram >= min_vram_gb
