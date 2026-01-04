from fastapi import APIRouter, Depends, HTTPException
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
    response_model=List[instagram_schema.InstagramPost],
    response_model_exclude={
        "__all__": {
            "created_at": True,
            "updated_at": True,
            "owner": {"profile_pic_local_path": True, "created_at": True, "updated_at": True},
            "media_items": {
                "__all__": {"image_local_path": True, "video_local_path": True, "created_at": True, "updated_at": True}
            },
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
