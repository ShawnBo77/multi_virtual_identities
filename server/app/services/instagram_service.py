from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
from ..models import instagram_model
from ..schemas import instagram_schema


def get_user_by_pk(db: Session, pk: str):
    return db.query(instagram_model.InstagramUser).filter(instagram_model.InstagramUser.pk == pk).first()


def get_user_by_username(db: Session, username: str):
    return db.query(instagram_model.InstagramUser).filter(instagram_model.InstagramUser.username == username).first()


def create_user_by_username(db: Session, username: str) -> instagram_model.InstagramUser:
    """
    Creates a new record for the user with a NULL pk.
    """
    new_user_data = instagram_schema.InstagramUserCreate(username=username)

    new_user = instagram_model.InstagramUser(**new_user_data.model_dump(exclude_unset=True))

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    print(f"    - ✓ Created new user @{username} with DB ID: {new_user.id}.")

    return new_user


def get_post_by_pk(db: Session, pk: str):
    return db.query(instagram_model.InstagramPost).filter(instagram_model.InstagramPost.pk == pk).first()


def get_post_by_code(db: Session, code: str):
    return db.query(instagram_model.InstagramPost).filter(instagram_model.InstagramPost.code == code).first()


def get_posts_by_user_pk(
    db: Session, user_pk: str, skip: int = 0, limit: int = 10
) -> List[instagram_model.InstagramPost]:
    """
    Retrieves a list of posts for a specific user by their Instagram PK.
    """
    user = get_user_by_pk(db, pk=user_pk)

    if not user:
        return []

    return (
        db.query(instagram_model.InstagramPost)
        .filter(instagram_model.InstagramPost.owner_id == user.id)
        .order_by(instagram_model.InstagramPost.taken_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


def create_post_from_data(db: Session, post_data: dict, media_paths: list = None):
    """
    Parses raw JSON data and saves it to the database.
    This function handles User, Post, and Media creation with relationships.
    """
    # Check if the post already exists to avoid duplicates
    post_pk = post_data.get("pk")
    if not post_pk:
        raise ValueError("Post PK not found in data")

    if get_post_by_pk(db, pk=post_pk):
        return None

    # Handle the User (Create or Get Existing)
    user_data = post_data.get("user")
    if not user_data:
        raise ValueError("User data not found")

    db_user = get_user_by_pk(db, pk=user_data["pk"])
    if not db_user:
        profile_pic_url = user_data.get("profile_pic_url")
        if not profile_pic_url and "hd_profile_pic_url_info" in user_data:
            profile_pic_url = user_data["hd_profile_pic_url_info"].get("url")

        user_to_create = instagram_schema.InstagramUserCreate(
            pk=user_data["pk"],
            username=user_data["username"],
            full_name=user_data.get("full_name"),
            profile_pic_url=profile_pic_url,
            profile_pic_local_path=user_data.get("profile_pic_local_path"),
            is_verified=user_data.get("is_verified", False),
        )
        db_user = instagram_model.InstagramUser(**user_to_create.model_dump())
        db.add(db_user)
        db.commit()
        db.refresh(db_user)

    # Create the Post
    caption_obj = post_data.get("caption")
    post_to_create = instagram_schema.InstagramPostCreate(
        pk=post_pk,
        code=post_data["code"],
        caption_text=caption_obj["text"] if caption_obj else None,
        taken_at=datetime.fromtimestamp(post_data["taken_at"]),
        like_count=post_data.get("like_count", 0),
        comment_count=post_data.get("comment_count", 0),
        media_type=post_data["media_type"],
    )
    db_post = instagram_model.InstagramPost(**post_to_create.model_dump(), owner_id=db_user.id)

    # Create Media Items and associate them with the Post
    if media_paths:
        media_objects = []
        for item_info in media_paths:
            db_media_item = instagram_model.InstagramMedia(
                pk=item_info.get("pk"),
                media_type=item_info.get("media_type"),
                image_url=item_info.get("image_url"),
                video_url=item_info.get("video_url"),
                image_local_path=item_info.get("image_local_path"),
                video_local_path=item_info.get("video_local_path"),
            )
            media_objects.append(db_media_item)

        db_post.media_items = media_objects
    else:
        pass

    db.add(db_post)
    db.commit()
    db.refresh(db_post)

    return db_post


def update_user_scrape_time(db: Session, pk: str):
    """
    Updates the 'last_scraped_at' timestamp for a user to the current time.
    """
    user_to_update = get_user_by_pk(db, pk=pk)
    if user_to_update:
        user_to_update.last_scraped_at = datetime.utcnow()
        db.commit()
        db.refresh(user_to_update)
        print(f"  - Updated last_scraped_at for user {pk}.")
        return user_to_update
    return None


def update_user(
    db: Session,
    pk: str,
    username: str,
    full_name: Optional[str] = None,
    profile_pic_url: Optional[str] = None,
    profile_pic_local_path: Optional[str] = None,
    is_verified: Optional[bool] = None,
) -> Optional[instagram_model.InstagramUser]:
    user_to_update = get_user_by_pk(db, pk=pk) or get_user_by_username(db, username=username)

    if not user_to_update:
        print(f"  - ✗ Update failed: User with PK {pk} or username {username} not found in the database.")
        return None

    # print(f"  - User found (DB ID: {user_to_update.id}). Staging updates...")

    if pk and user_to_update.pk != pk:
        user_to_update.pk = pk

    if username and user_to_update.username != username:
        user_to_update.username = username

    if full_name and user_to_update.full_name != full_name:
        user_to_update.full_name = full_name

    if profile_pic_url and user_to_update.profile_pic_url != profile_pic_url:
        user_to_update.profile_pic_url = profile_pic_url

    if profile_pic_local_path and user_to_update.profile_pic_local_path != profile_pic_local_path:
        user_to_update.profile_pic_local_path = profile_pic_local_path

    if is_verified is not None and user_to_update.is_verified != is_verified:
        user_to_update.is_verified = is_verified

    # The calling function is responsible for the db.commit().
    return user_to_update
