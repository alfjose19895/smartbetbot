import httpx
import pytest

from app.core.errors import RateLimitExceededError, ServiceUnavailableError
from app.core.rate_limit import UpstashApiRateLimiter


def limiter(
    handler: httpx.AsyncBaseTransport,
    *,
    request_limit: int = 120,
    fail_closed: bool = True,
) -> tuple[UpstashApiRateLimiter, httpx.AsyncClient]:
    client = httpx.AsyncClient(transport=handler)
    return (
        UpstashApiRateLimiter(
            rest_url="https://redis.example.test",
            token="secret-token",
            request_limit=request_limit,
            window_seconds=60,
            fail_closed=fail_closed,
            http_client=client,
        ),
        client,
    )


@pytest.mark.anyio
async def test_distributed_rate_limit_allows_requests_within_window() -> None:
    async def respond(request: httpx.Request) -> httpx.Response:
        assert request.headers["Authorization"] == "Bearer secret-token"
        assert b"smartbetbot:rate:api:user-id" in await request.aread()
        return httpx.Response(200, json={"result": [120, 31]})

    instance, client = limiter(httpx.MockTransport(respond))
    try:
        await instance.check("user-id")
    finally:
        await client.aclose()


@pytest.mark.anyio
async def test_distributed_rate_limit_rejects_with_retry_after() -> None:
    transport = httpx.MockTransport(
        lambda _request: httpx.Response(200, json={"result": [121, 42]})
    )
    instance, client = limiter(transport)
    try:
        with pytest.raises(RateLimitExceededError) as raised:
            await instance.check("user-id")
        assert raised.value.headers == {"Retry-After": "42"}
    finally:
        await client.aclose()


@pytest.mark.anyio
async def test_rate_limit_failure_policy_is_environment_aware() -> None:
    transport = httpx.MockTransport(lambda _request: httpx.Response(503))
    closed, closed_client = limiter(transport, fail_closed=True)
    opened, opened_client = limiter(transport, fail_closed=False)
    try:
        with pytest.raises(ServiceUnavailableError):
            await closed.check("user-id")
        await opened.check("user-id")
    finally:
        await closed_client.aclose()
        await opened_client.aclose()
