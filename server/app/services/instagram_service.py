from sqlalchemy import and_
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
from ..models import client_model, instagram_model, follow_model
from ..schemas import instagram_schema
from sqlalchemy.sql.expression import func


def get_user_by_pk(db: Session, pk: str):
    return db.query(instagram_model.InstagramUser).filter(instagram_model.InstagramUser.pk == pk).first()


def get_user_by_username(db: Session, username: str):
    return db.query(instagram_model.InstagramUser).filter(instagram_model.InstagramUser.username == username).first()


def create_user_by_data(db: Session, user_data: str) -> instagram_model.InstagramUser:
    """
    Creates a new record for the user with user data.
    """

    profile_pic_url = user_data.get("profile_pic_url")
    if not profile_pic_url and "hd_profile_pic_url_info" in user_data:
        profile_pic_url = user_data["hd_profile_pic_url_info"].get("url")

    user_to_create = instagram_schema.InstagramUserCreate(
        pk=str(user_data.get("pk")),
        username=user_data.get("username"),
        full_name=user_data.get("full_name"),
        profile_pic_url=profile_pic_url,
        profile_pic_local_path=user_data.get("profile_pic_local_path"),
        is_verified=user_data.get("is_verified", False),
    )

    new_user = instagram_model.InstagramUser(**user_to_create.model_dump(exclude_none=True))
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return new_user


def create_user_by_username(db: Session, username: str) -> instagram_model.InstagramUser:
    """
    Creates a new record for the user with a NULL pk.
    """
    new_user_data = instagram_schema.InstagramUserCreate(username=username)

    new_user = instagram_model.InstagramUser(**new_user_data.model_dump(exclude_unset=True))

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

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
    user_data = post_data.get("user") or post_data.get("owner")
    if not user_data:
        raise ValueError("User data not found")

    db_user = get_user_by_pk(db, str(user_data.get("pk"))) or get_user_by_username(db, user_data.get("username"))
    if not db_user:
        create_user_by_data(db, user_data)

    # Create the Post
    caption_obj = post_data.get("caption")
    post_to_create = instagram_schema.InstagramPostCreate(
        pk=post_pk,
        code=post_data["code"],
        caption_text=caption_obj.get("text") if caption_obj else None,
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
                pk=str(item_info.get("pk")),
                media_type=item_info.get("media_type"),
                image_url=item_info.get("image_url"),
                video_url=item_info.get("video_url"),
                image_local_path=item_info.get("image_local_path"),
                video_local_path=item_info.get("video_local_path"),
            )
            media_objects.append(db_media_item)

        db_post.media_items = media_objects

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


def update_user_from_data(db: Session, user_data: dict) -> instagram_model.InstagramUser:
    """
    Takes raw JSON dictionary, and Updates the user.
    """

    profile_pic_url = user_data.get("profile_pic_url")
    if not profile_pic_url and "hd_profile_pic_url_info" in user_data:
        profile_pic_url = user_data["hd_profile_pic_url_info"].get("url")

    updated_user = update_user(
        db,
        pk=str(user_data.get("pk")),
        username=user_data.get("username"),
        full_name=user_data.get("full_name"),
        profile_pic_url=profile_pic_url,
        profile_pic_local_path=user_data.get("profile_pic_local_path"),
        is_verified=user_data.get("is_verified"),
    )

    return updated_user


def get_unsent_posts(
    db: Session, client_id: int, usernames: Optional[List[str]] = None, limit: int = 10
) -> List[instagram_model.InstagramPost]:
    """
    Retrieves the latest Instagram posts that have NOT been sent to the specified client yet.
    """

    client = db.query(client_model.Client).filter(client_model.Client.id == client_id).first()
    if not client:
        return []

    query = db.query(instagram_model.InstagramPost)

    query = query.join(
        instagram_model.InstagramUser, instagram_model.InstagramPost.owner_id == instagram_model.InstagramUser.id
    )

    query = query.join(
        follow_model.Following,
        and_(
            follow_model.Following.followed_user_id == instagram_model.InstagramUser.id,
            follow_model.Following.client_id == client.id,
            follow_model.Following.platform == "instagram",
            follow_model.Following.is_following,
        ),
    )

    if usernames:
        query = query.filter(instagram_model.InstagramUser.username.in_(usernames))

    query = query.outerjoin(
        instagram_model.InstagramFeedHistory,
        and_(
            instagram_model.InstagramFeedHistory.post_id == instagram_model.InstagramPost.id,
            instagram_model.InstagramFeedHistory.client_id == client.id,
        ),
    )
    query = query.filter(instagram_model.InstagramFeedHistory.id.is_(None))

    posts = query.order_by(instagram_model.InstagramPost.taken_at.desc()).limit(limit).all()

    # Mark as sent
    if posts:
        new_history_records = [
            instagram_model.InstagramFeedHistory(client_id=client.id, post_id=post.id) for post in posts
        ]
        db.add_all(new_history_records)
        db.commit()

    return posts


def get_random_active_credential(db: Session) -> Optional[instagram_model.InstagramCredential]:
    return (
        db.query(instagram_model.InstagramCredential)
        .filter(instagram_model.InstagramCredential.is_active)
        .order_by(func.random())
        .first()
    )


def get_credential_by_id(db: Session, cred_id: int) -> Optional[instagram_model.InstagramCredential]:
    return (
        db.query(instagram_model.InstagramCredential)
        .filter(instagram_model.InstagramCredential.id == cred_id, instagram_model.InstagramCredential.is_active)
        .first()
    )


def update_credential_cookies(db: Session, cred_id: int, new_cookies: list):
    cred = (
        db.query(instagram_model.InstagramCredential).filter(instagram_model.InstagramCredential.id == cred_id).first()
    )

    if cred:
        cred.cookies = new_cookies
        cred.last_used_at = datetime.utcnow()
        db.commit()
        print(f"    - [DB] Updated cookies for credential ID: {cred_id} ({cred.username})")


def mark_credential_inactive(db: Session, cred_id: int):
    cred = (
        db.query(instagram_model.InstagramCredential).filter(instagram_model.InstagramCredential.id == cred_id).first()
    )

    if cred:
        cred.is_active = False
        db.commit()
        print(f"    - [DB] Marked credential ID {cred_id} ({cred.username}) as INACTIVE.")


def create_scrape_log(db: Session, target_user_id: int, credential_id: int, status: instagram_model.ScrapeStatus):
    new_log = instagram_model.InstagramScrapeLog(
        target_user_id=target_user_id, credential_id=credential_id, status=status, created_at=datetime.utcnow()
    )
    db.add(new_log)
    db.commit()
    return new_log


def get_last_successful_credential_id(db: Session, target_user_id: int) -> Optional[int]:
    """
    Finds the ID of the credential that successfully scraped this target.
    """
    log = (
        db.query(instagram_model.InstagramScrapeLog)
        .join(
            instagram_model.InstagramCredential,
            instagram_model.InstagramScrapeLog.credential_id == instagram_model.InstagramCredential.id,
        )
        .filter(
            instagram_model.InstagramScrapeLog.target_user_id == target_user_id,
            instagram_model.InstagramScrapeLog.status == instagram_model.ScrapeStatus.SUCCESS,
            instagram_model.InstagramCredential.is_active.is_(True),
        )
        .order_by(instagram_model.InstagramScrapeLog.created_at.desc())
        .first()
    )

    if log:
        return log.credential_id
    return None


def get_credential_by_username(db: Session, username: str) -> Optional[instagram_model.InstagramCredential]:
    """
    Retrieves a specific credential object by username.
    """
    return (
        db.query(instagram_model.InstagramCredential)
        .filter(instagram_model.InstagramCredential.username == username, instagram_model.InstagramCredential.is_active)
        .first()
    )
