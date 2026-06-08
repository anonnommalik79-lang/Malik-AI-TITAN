INCIDENTS = []

def report(title: str, message: str, severity: str = "medium"):
    item = {"title": title, "message": message, "severity": severity}
    INCIDENTS.append(item)
    return item

def list_incidents():
    return INCIDENTS[-80:]
