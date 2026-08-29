from typing import Any


class ApiError(Exception):
    def __init__(
        self,
        *,
        status_code: int,
        code: str,
        message: str,
        details: list[dict[str, Any]] | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details
        self.headers = headers


class AuthenticationError(ApiError):
    def __init__(self, message: str = "A valid access token is required.") -> None:
        super().__init__(
            status_code=401,
            code="authentication_required",
            message=message,
            headers={"WWW-Authenticate": "Bearer"},
        )


class ForbiddenError(ApiError):
    def __init__(self, message: str = "You do not have permission to perform this action.") -> None:
        super().__init__(status_code=403, code="forbidden", message=message)


class NotFoundError(ApiError):
    def __init__(self, resource: str) -> None:
        super().__init__(
            status_code=404,
            code="not_found",
            message=f"{resource} was not found.",
        )


class ConflictError(ApiError):
    def __init__(self, message: str) -> None:
        super().__init__(status_code=409, code="conflict", message=message)


class ServiceUnavailableError(ApiError):
    def __init__(self, *, code: str, message: str) -> None:
        super().__init__(status_code=503, code=code, message=message)


class RateLimitExceededError(ApiError):
    def __init__(self, retry_after_seconds: int) -> None:
        super().__init__(
            status_code=429,
            code="rate_limit_exceeded",
            message="Too many requests. Try again later.",
            headers={"Retry-After": str(max(1, retry_after_seconds))},
        )
