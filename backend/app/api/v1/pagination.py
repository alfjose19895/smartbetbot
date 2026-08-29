from dataclasses import dataclass
from typing import Annotated

from fastapi import Query


@dataclass(frozen=True, slots=True)
class PaginationParams:
    limit: int
    offset: int


async def get_pagination(
    limit: Annotated[int, Query(ge=1, le=100, description="Maximum items to return")] = 20,
    offset: Annotated[int, Query(ge=0, description="Items to skip")] = 0,
) -> PaginationParams:
    return PaginationParams(limit=limit, offset=offset)
