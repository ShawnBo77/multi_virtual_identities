from fastapi import APIRouter, Depends, Header, HTTPException, Response
from sqlalchemy.orm import Session
from typing import List
from ..services import follow_service
from ..schemas import follow_schema
from ..database import SessionLocal

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_client_id(client_id: int = Header(..., alias="Client-ID")):
    if not client_id:
        raise HTTPException(status_code=400, detail="Client-ID header is required")
    return client_id


@router.post(
    "/{platform}/followings", response_model=follow_schema.Following, summary="Follow a new user on a specific platform"
)
def follow_user(
    platform: str,
    following_data: follow_schema.FollowingData,
    client_id: int = Depends(get_client_id),
    db: Session = Depends(get_db),
):
    """
    Adds a username to the client's following list for the specified platform.
    """
    return follow_service.follow_by_username(
        db, client_id=client_id, platform=platform, username=following_data.followed_username
    )


@router.get("/{platform}/followings", response_model=List[follow_schema.FollowedUser])
def get_following_list(platform: str, client_id: int = Depends(get_client_id), db: Session = Depends(get_db)):
    return follow_service.get_followings_detail(db, client_id=client_id, platform=platform)


@router.delete("/{platform}/followings/{username}", status_code=204, summary="Unfollow a user by username")
def unfollow_user_by_username(
    platform: str, username: str, client_id: int = Depends(get_client_id), db: Session = Depends(get_db)
):
    """
    Deletes a following relationship using the username.
    """
    success = follow_service.unfollow_by_username(db, client_id=client_id, platform=platform, username=username)
    if not success:
        raise HTTPException(status_code=404, detail=f"Following relationship for user '{username}' not found.")
    return Response(status_code=204)
