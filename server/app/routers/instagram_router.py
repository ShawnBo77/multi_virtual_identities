from fastapi import APIRouter, Depends, HTTPException, Header, Query, Response, status
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


@router.get(
    "/saved-posts",
    response_model=List[instagram_schema.InstagramSavedPostResponse],
    response_model_exclude={"__all__": {"thumbnail_local_path"}},
    summary="Get All Saved Posts for a Client",
)
def get_all_saved_posts(client_id: int = Header(..., alias="Client-ID"), db: Session = Depends(get_db)):
    """
    Retrieves a list of all posts saved by the client.
    Returns a lightweight response with post code and a thumbnail URL.
    """
    db_posts = instagram_service.get_saved_posts_for_client(db, client_id=client_id)

    response_posts = []
    for post in db_posts:
        thumbnail = None
        if post.media_items:
            # Find the first available image URL to use as a thumbnail
            first_media = post.media_items[0]
            thumbnail = first_media.image_local_path

        response_posts.append(
            instagram_schema.InstagramSavedPostResponse(id=post.id, code=post.code, thumbnail_local_path=thumbnail)
        )

    return response_posts


@router.post("/posts/{post_id}/save", status_code=status.HTTP_201_CREATED, summary="Save a Post for the Client")
def save_post_for_client(post_id: int, client_id: int = Header(..., alias="Client-ID"), db: Session = Depends(get_db)):
    """
    Saves a specific post for the requesting client.
    """
    saved_post = instagram_service.save_post(db=db, client_id=client_id, post_id=post_id)
    if not saved_post:
        # This case is now handled by the service, but as a fallback
        raise HTTPException(status_code=400, detail="Could not save post")
    return {"message": "Post saved successfully"}


@router.delete("/posts/{post_id}/save", status_code=status.HTTP_204_NO_CONTENT, summary="Unsave a Post for the Client")
def unsave_post_for_client(
    post_id: int, client_id: int = Header(..., alias="Client-ID"), db: Session = Depends(get_db)
):
    """
    Removes a saved post for the requesting client.
    """
    success = instagram_service.unsave_post(db=db, client_id=client_id, post_id=post_id)
    if not success:
        raise HTTPException(status_code=404, detail="Saved post record not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/credentials", response_model=instagram_schema.CredentialResponse)
def register_credential(
    payload: instagram_schema.CredentialCreate,
    client_id: int = Header(..., alias="Client-ID"),
    db: Session = Depends(get_db),
):
    try:
        return instagram_service.register_credential_for_client(
            db, client_id=client_id, username=payload.username, password=payload.password, is_global=payload.is_global
        )
    except HTTPException as http_ex:
        raise http_ex
    except Exception as e:
        print(f"Error registering credential: {e}")
        raise HTTPException(status_code=500, detail="Internal Server Error processing credential.")


@router.get(
    "/credentials",
    response_model=List[instagram_schema.CredentialResponse],
    summary="List accounts linked to this client",
)
def get_credentials(client_id: int = Header(..., alias="Client-ID"), db: Session = Depends(get_db)):
    """
    Returns a list of Instagram accounts specifically linked to the requesting Client-ID.
    """
    creds = instagram_service.get_credentials_by_client(db, client_id)

    return creds


@router.delete("/credentials/{username}", status_code=204, summary="Unlink an Instagram Account from a Client")
def unlink_credential(username: str, client_id: int = Header(..., alias="Client-ID"), db: Session = Depends(get_db)):
    """
    Removes the link between the requesting client and the specified Instagram account.
    If the account becomes orphaned (no other clients are linked to it), it will be deleted.
    """
    success = instagram_service.unlink_credential_from_client(db, client_id=client_id, username=username)
    if not success:
        raise HTTPException(status_code=404, detail="Link between client and credential not found.")

    return
