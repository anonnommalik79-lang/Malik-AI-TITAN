def storyboard(prompt: str, duration: int = 5):
    return {"frames": [
        {"time": "00:00", "label": "Hook", "description": prompt[:120]},
        {"time": "00:02", "label": "Core", "description": "main action"},
        {"time": f"00:{duration:02d}", "label": "Final", "description": "clean final frame"},
    ]}
