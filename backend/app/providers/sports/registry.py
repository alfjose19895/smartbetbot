from __future__ import annotations

from collections.abc import Callable

from app.providers.sports.base import SportsDataProvider
from app.providers.sports.errors import ProviderConfigurationError

ProviderFactory = Callable[[], SportsDataProvider]


class SportsDataProviderRegistry:
    def __init__(self) -> None:
        self._factories: dict[str, ProviderFactory] = {}

    @property
    def names(self) -> tuple[str, ...]:
        return tuple(sorted(self._factories))

    def register(self, name: str, factory: ProviderFactory, *, replace: bool = False) -> None:
        normalized_name = name.strip().lower()
        if not normalized_name:
            raise ValueError("Provider name cannot be empty")
        if normalized_name in self._factories and not replace:
            raise ProviderConfigurationError(
                f"Provider '{normalized_name}' is already registered.",
                provider=normalized_name,
            )
        self._factories[normalized_name] = factory

    def create(self, name: str) -> SportsDataProvider:
        normalized_name = name.strip().lower()
        factory = self._factories.get(normalized_name)
        if factory is None:
            raise ProviderConfigurationError(
                f"Provider '{normalized_name}' is not registered.",
                provider=normalized_name,
            )
        provider = factory()
        if provider.name != normalized_name:
            raise ProviderConfigurationError(
                "Registered provider name does not match the adapter name.",
                provider=normalized_name,
            )
        return provider
