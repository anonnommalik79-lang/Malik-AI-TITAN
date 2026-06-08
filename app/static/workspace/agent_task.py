import platform
import psutil

print(f"Operating System: {platform.system()} {platform.release()}")
print(f"Processor: {platform.processor()}")
print(f"RAM: {psutil.virtual_memory().total / 10**9} GB")
print(f"CPU Cores: {psutil.cpu_count()}")