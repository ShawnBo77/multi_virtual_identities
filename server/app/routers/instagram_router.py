from fastapi import APIRouter, Depends, HTTPException, Header, Query
from sqlalchemy.orm import Session
from typing import List

from ..services import instagram_service
from ..schemas import instagram_schema
from ..database import SessionLocal

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.post("/posts/", response_model=instagram_schema.InstagramPost, summary="Create Instagram Post")
def create_post(payload: dict, db: Session = Depends(get_db)):
    try:
        return instagram_service.create_post_from_data(db=db, post_data=payload)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {e}")


@router.get(
    "/posts/{identifier}",  # identifier means code or pk
    response_model=instagram_schema.InstagramPost,
    summary="Get Post by Code/PK",
)
def read_post_by_identifier(identifier: str, db: Session = Depends(get_db)):
    db_post = instagram_service.get_post_by_code(db, identifier) or instagram_service.get_post_by_pk(db, identifier)
    if db_post is None:
        raise HTTPException(status_code=404, detail="Post not found")
    return db_post


@router.get(
    "/users/{identifier}/posts",  # identifier means username or pk
    response_model=List[instagram_schema.InstagramPostBrief],
    response_model_exclude={
        "__all__": {
            "owner": {"profile_pic_url": True, "profile_pic_local_path": True},
            "media_items": {"__all__": {"image_local_path": True, "video_local_path": True}},
        }
    },
    summary="Get User's Latest Posts",
)
def read_user_posts(identifier: str, skip: int = 0, limit: int = 5, db: Session = Depends(get_db)):
    db_user = instagram_service.get_user_by_username(db, username=identifier) or instagram_service.get_user_by_pk(
        db, pk=identifier
    )
    if db_user is None:
        raise HTTPException(status_code=404, detail=f"User '{identifier}' not found")
    return instagram_service.get_posts_by_user_pk(db, user_pk=db_user.pk, skip=skip, limit=limit)


# http://127.0.0.1:8000/instagram/feed?usernames={userA}&usernames={userB}&limit=10
@router.get(
    "/feed",
    response_model=List[instagram_schema.InstagramPostBrief],
    response_model_exclude={
        "__all__": {
            "owner": {"profile_pic_url": True, "profile_pic_local_path": True},
            "media_items": {"__all__": {"image_local_path": True, "video_local_path": True}},
        }
    },
    summary="Get Unsent Feed Posts",
)
def get_instagram_feed(
    usernames: List[str] = Query(
        None, description="Filter by specific followed usernames (e.g. ?usernames=user1&usernames=user2)"
    ),
    limit: int = Query(2, ge=1, le=50),
    client_id: int = Header(..., alias="Client-ID"),
    db: Session = Depends(get_db),
):
    """
    Retrieves the latest Instagram posts from followed users that have NOT been sent to this client yet.
    Returns posts sorted by 'taken_at' (newest first).
    """
    return instagram_service.get_unsent_posts(db=db, client_id=client_id, usernames=usernames, limit=limit)
