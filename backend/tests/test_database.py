import pytest

from app.core.database import _async_database_url


@pytest.mark.parametrize(
    ("source", "expected"),
    [
        (
            "postgresql://user@db.test/postgres",
            "postgresql+psycopg://user@db.test/postgres",
        ),
        (
            "postgres://user@db.test/postgres",
            "postgresql+psycopg://user@db.test/postgres",
        ),
        (
            "postgresql+psycopg://user@db.test/postgres",
            "postgresql+psycopg://user@db.test/postgres",
        ),
    ],
)
def test_async_database_url(source: str, expected: str) -> None:
    assert _async_database_url(source) == expected


def test_async_database_url_rejects_non_postgres_scheme() -> None:
    with pytest.raises(ValueError, match="PostgreSQL"):
        _async_database_url("sqlite:///test.db")
