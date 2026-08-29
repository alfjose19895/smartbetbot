from collections.abc import AsyncIterator, Iterator
from uuid import UUID

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.database import get_connection
from app.core.security import CurrentUser, get_current_user
from app.main import app

TEST_USER = CurrentUser(
    id=UUID("11111111-1111-4111-8111-111111111111"),
    email="user@example.test",
    auth_role="authenticated",
)


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture(autouse=True)
def clear_dependency_overrides() -> Iterator[None]:
    yield
    app.dependency_overrides.clear()


@pytest.fixture
async def client() -> AsyncIterator[AsyncClient]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as test_client:
        yield test_client


@pytest.fixture
def authenticated_api() -> CurrentUser:
    async def fake_connection() -> AsyncIterator[object]:
        yield object()

    async def fake_current_user() -> CurrentUser:
        return TEST_USER

    app.dependency_overrides[get_current_user] = fake_current_user
    app.dependency_overrides[get_connection] = fake_connection
    return TEST_USER
