def provider_error_to_human(error: object) -> str:
    value = str(error or "").lower()
    if "401" in value or "unauthorized" in value:
        return "API key дұрыс емес немесе provider қабылдамады."
    if "402" in value or "credit" in value or "balance" in value:
        return "Provider credits/balance керек."
    if "429" in value or "rate limit" in value:
        return "Rate limit. Аздап күтіп қайтала."
    if "timeout" in value:
        return "Генерация ұзақ жүріп кетті. Poll/timeout көбейту керек."
    return str(error or "Unknown error")
