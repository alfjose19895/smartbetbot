from __future__ import annotations


class SportsDataProviderError(Exception):
    """Safe provider failure that never contains credentials or complete response bodies."""

    def __init__(
        self,
        message: str,
        *,
        provider: str,
        operation: str,
        retryable: bool,
        status_code: int | None = None,
    ) -> None:
        super().__init__(message)
        self.provider = provider
        self.operation = operation
        self.retryable = retryable
        self.status_code = status_code


class ProviderAuthenticationError(SportsDataProviderError):
    def __init__(self, *, provider: str, operation: str) -> None:
        super().__init__(
            "The sports-data provider rejected its server credentials.",
            provider=provider,
            operation=operation,
            retryable=False,
            status_code=401,
        )


class ProviderRateLimitError(SportsDataProviderError):
    def __init__(
        self,
        *,
        provider: str,
        operation: str,
        retry_after_seconds: float | None = None,
    ) -> None:
        super().__init__(
            "The sports-data provider rate limit was reached.",
            provider=provider,
            operation=operation,
            retryable=True,
            status_code=429,
        )
        self.retry_after_seconds = retry_after_seconds


class ProviderUnavailableError(SportsDataProviderError):
    def __init__(self, *, provider: str, operation: str) -> None:
        super().__init__(
            "The sports-data provider is temporarily unavailable.",
            provider=provider,
            operation=operation,
            retryable=True,
        )


class ProviderPayloadError(SportsDataProviderError):
    def __init__(self, *, provider: str, operation: str) -> None:
        super().__init__(
            "The sports-data provider returned an invalid payload.",
            provider=provider,
            operation=operation,
            retryable=False,
        )


class ProviderConfigurationError(SportsDataProviderError):
    def __init__(self, message: str, *, provider: str) -> None:
        super().__init__(
            message,
            provider=provider,
            operation="configure",
            retryable=False,
        )


class UnsupportedCapabilityError(SportsDataProviderError):
    def __init__(self, *, provider: str, capability: str) -> None:
        super().__init__(
            f"Provider '{provider}' does not support capability '{capability}'.",
            provider=provider,
            operation=capability,
            retryable=False,
        )
