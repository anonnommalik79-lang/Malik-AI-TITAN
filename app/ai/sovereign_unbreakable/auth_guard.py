def is_refresh_token_error(error: object):
    value = str(error or "").lower()
    return "refresh token" in value or "already used" in value or "invalid refresh" in value
