from typing import Annotated

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncConnection

from app.api.v1.schemas.accounts import (
    MeResponse,
    PreferencesPatch,
    PushDeleteRequest,
    PushRegistrationRequest,
    PushSubscriptionResponse,
)
from app.api.v1.schemas.common import ERROR_RESPONSES
from app.core.database import get_connection
from app.core.errors import NotFoundError
from app.core.security import CurrentUser, get_current_user
from app.repositories.accounts import AccountRepository

router = APIRouter(tags=["account"], responses=ERROR_RESPONSES)


@router.get("/me", response_model=MeResponse, operation_id="get_me")
async def get_me(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    connection: Annotated[AsyncConnection, Depends(get_connection)],
) -> MeResponse:
    account = await AccountRepository(connection).get_me(user_id=user.id, email=user.email)
    if account is None:
        raise NotFoundError("Profile")
    return MeResponse.model_validate(account)


@router.patch("/me/preferences", response_model=MeResponse, operation_id="update_preferences")
async def update_preferences(
    payload: PreferencesPatch,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    connection: Annotated[AsyncConnection, Depends(get_connection)],
) -> MeResponse:
    changes = payload.model_dump(exclude_unset=True)
    account = await AccountRepository(connection).update_preferences(
        user_id=user.id,
        changes=changes,
        email=user.email,
    )
    if account is None:
        raise NotFoundError("Profile")
    return MeResponse.model_validate(account)


@router.post(
    "/push/register",
    response_model=PushSubscriptionResponse,
    status_code=status.HTTP_201_CREATED,
    operation_id="register_push_subscription",
)
async def register_push_subscription(
    payload: PushRegistrationRequest,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    connection: Annotated[AsyncConnection, Depends(get_connection)],
) -> PushSubscriptionResponse:
    subscription = await AccountRepository(connection).register_push(
        user_id=user.id,
        payload=payload.model_dump(),
    )
    return PushSubscriptionResponse.model_validate(subscription)


@router.delete(
    "/push/register",
    status_code=status.HTTP_204_NO_CONTENT,
    operation_id="delete_push_subscription",
)
async def delete_push_subscription(
    payload: PushDeleteRequest,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    connection: Annotated[AsyncConnection, Depends(get_connection)],
) -> Response:
    deleted = await AccountRepository(connection).delete_push(
        user_id=user.id,
        fcm_token=payload.fcm_token,
    )
    if not deleted:
        raise NotFoundError("Push subscription")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
