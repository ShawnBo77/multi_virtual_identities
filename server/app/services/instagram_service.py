from sqlalchemy import and_, exists
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timezone
from ..models import client_model, instagram_model, follow_model
from ..schemas import instagram_schema
from sqlalchemy.sql.expression import func
from fastapi import HTTPException


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


def get_post_by_pk_with_client(db: Session, pk: str, client_id: int):
    """
    Retrieves a single post by its PK, including its saved status for the given client.
    """
    saved_subquery = exists().where(
        and_(
            instagram_model.InstagramSavedPost.client_id == client_id,
            instagram_model.InstagramSavedPost.post_id == instagram_model.InstagramPost.id,
        )
    )
    result = (
        db.query(instagram_model.InstagramPost, saved_subquery.label("is_saved"))
        .filter(instagram_model.InstagramPost.pk == pk)
        .first()
    )

    if not result:
        return None

    post, is_saved = result
    post.is_saved = is_saved
    return post


def get_post_by_code_with_client(db: Session, code: str, client_id: int):
    """
    Retrieves a single post by its code, including its saved status for the given client.
    """
    saved_subquery = exists().where(
        and_(
            instagram_model.InstagramSavedPost.client_id == client_id,
            instagram_model.InstagramSavedPost.post_id == instagram_model.InstagramPost.id,
        )
    )
    result = (
        db.query(instagram_model.InstagramPost, saved_subquery.label("is_saved"))
        .filter(instagram_model.InstagramPost.code == code)
        .first()
    )

    if not result:
        return None

    post, is_saved = result
    post.is_saved = is_saved
    return post


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
        user_to_update.last_scraped_at = datetime.now(timezone.utc)
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


def get_home_feed_posts(db: Session, client_id: int, limit: int = 10) -> List[instagram_model.InstagramPost]:
    """
    Fetch posts from the Home Feed of credentials linked to a specific client,
    excluding posts that the client has already seen (recorded in history).
    """
    # Get all credential IDs linked to this client that have fetch_feed enabled
    active_credentials = (
        db.query(instagram_model.ClientInstagramCredential.credential_id)
        .filter(
            instagram_model.ClientInstagramCredential.client_id == client_id,
            instagram_model.ClientInstagramCredential.fetch_feed == True,
        )
        .all()
    )

    cred_ids = [c[0] for c in active_credentials]
    if not cred_ids:
        return []

    # Build the query joining InstagramPost with the HomeFeed association table
    query = (
        db.query(instagram_model.InstagramPost)
        .join(
            instagram_model.InstagramHomeFeed,
            instagram_model.InstagramPost.id == instagram_model.InstagramHomeFeed.post_id,
        )
        .filter(instagram_model.InstagramHomeFeed.credential_id.in_(cred_ids))
    )

    # Exclude posts already recorded in the client's feed history
    query = query.outerjoin(
        instagram_model.InstagramFeedHistory,
        and_(
            instagram_model.InstagramFeedHistory.post_id == instagram_model.InstagramPost.id,
            instagram_model.InstagramFeedHistory.client_id == client_id,
        ),
    )
    query = query.filter(instagram_model.InstagramFeedHistory.id.is_(None))

    # Order by newest first and apply limit
    posts = query.order_by(instagram_model.InstagramPost.taken_at.desc()).limit(limit).all()

    # Mark these posts as sent in the history table
    if posts:
        new_history_records = [
            instagram_model.InstagramFeedHistory(client_id=client_id, post_id=post.id) for post in posts
        ]
        db.add_all(new_history_records)
        db.commit()

    return posts


def save_post(db: Session, client_id: int, post_id: int):
    # Check if the saved record already exists
    existing_save = db.query(instagram_model.InstagramSavedPost).filter_by(client_id=client_id, post_id=post_id).first()
    if existing_save:
        return existing_save  # Already saved

    # Verify client and post exist
    client = db.query(client_model.Client).filter_by(id=client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    post = db.query(instagram_model.InstagramPost).filter_by(id=post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    new_saved_post = instagram_model.InstagramSavedPost(client_id=client_id, post_id=post_id)
    db.add(new_saved_post)
    db.commit()
    db.refresh(new_saved_post)
    return new_saved_post


def unsave_post(db: Session, client_id: int, post_id: int) -> bool:
    saved_post_to_delete = (
        db.query(instagram_model.InstagramSavedPost).filter_by(client_id=client_id, post_id=post_id).first()
    )

    if saved_post_to_delete:
        db.delete(saved_post_to_delete)
        db.commit()
        return True
    return False  # Not found, so nothing to delete


def get_saved_posts_for_client(db: Session, client_id: int) -> List[instagram_model.InstagramPost]:
    """
    Retrieves all posts saved by a specific client, ordered by when they were saved.
    """
    client = db.query(client_model.Client).filter(client_model.Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    saved_posts_query = (
        db.query(instagram_model.InstagramPost)
        .join(
            instagram_model.InstagramSavedPost,
            instagram_model.InstagramPost.id == instagram_model.InstagramSavedPost.post_id,
        )
        .filter(instagram_model.InstagramSavedPost.client_id == client_id)
        .order_by(instagram_model.InstagramSavedPost.created_at.desc())
        .all()
    )

    return saved_posts_query


def get_random_available_credential(db: Session) -> Optional[instagram_model.InstagramCredential]:
    return (
        db.query(instagram_model.InstagramCredential)
        .filter(instagram_model.InstagramCredential.status == instagram_model.CredentialStatus.SUCCESS)
        .filter(instagram_model.InstagramCredential.is_shared.is_(True))
        .order_by(func.random())
        .first()
    )


def get_credential_by_id(db: Session, cred_id: int) -> Optional[instagram_model.InstagramCredential]:
    return (
        db.query(instagram_model.InstagramCredential)
        .filter(
            instagram_model.InstagramCredential.id == cred_id,
            instagram_model.InstagramCredential.status == instagram_model.CredentialStatus.SUCCESS,
        )
        .first()
    )


def upsert_instagram_credential(
    db: Session, username: str, password: str, is_shared: bool = False
) -> instagram_model.InstagramCredential:
    """
    Creates a new credential record or updates an existing one.
    Sets status to 'PENDING' to trigger the login process.
    """
    cred = db.query(instagram_model.InstagramCredential).filter_by(username=username).first()

    if cred:
        # Update existing credential
        cred.password = password
        cred.status = instagram_model.CredentialStatus.PENDING
        cred.is_shared = is_shared
        print(f"    - [DB] Updated password for {username}.")
    else:
        # Create new credential
        cred = instagram_model.InstagramCredential(
            username=username,
            password=password,
            user_agent=None,
            status=instagram_model.CredentialStatus.PENDING,
            is_shared=is_shared,
        )
        db.add(cred)
        print(f"    - [DB] Created new credential record for {username}.")

    db.flush()
    return cred


def register_credential_for_client(
    db: Session,
    client_id: int,
    username: str,
    password: str,
    is_shared: bool = False,
    fetch_feed: bool = False,
    categories: Optional[List[str]] = None,
) -> instagram_model.InstagramCredential:
    client = db.query(client_model.Client).filter(client_model.Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail=f"Client with ID {client_id} not found")

    # Upsert Credential
    cred = upsert_instagram_credential(db, username, password, is_shared)

    # Handle category tags synchronization (if categories are provided)
    if categories is not None:
        # Clear old category relationships for this credential (overwrite update)
        db.query(instagram_model.InstagramCredentialCategory).filter_by(credential_id=cred.id).delete()

        for cat_name in categories:
            # Find or create category
            cat = db.query(instagram_model.InstagramCategory).filter_by(name=cat_name).first()
            if not cat:
                cat = instagram_model.InstagramCategory(name=cat_name)
                db.add(cat)
                db.flush()  # Flush to get the new category ID

            # Create relationship
            link_cat = instagram_model.InstagramCredentialCategory(credential_id=cred.id, category_id=cat.id)
            db.add(link_cat)

    # Association Process
    link = (
        db.query(instagram_model.ClientInstagramCredential)
        .filter_by(client_id=client_id, credential_id=cred.id)
        .first()
    )

    if not link:
        new_link = instagram_model.ClientInstagramCredential(
            client_id=client_id, credential_id=cred.id, fetch_feed=fetch_feed
        )
        db.add(new_link)
        print(f"    - [DB] Linked credential '{username}' to Client ID {client_id} (Fetch Feed: {fetch_feed}).")
    else:
        link.fetch_feed = fetch_feed
        print(f"    - [DB] Credential '{username}' is already linked to Client ID {client_id}.")

    db.commit()
    db.refresh(cred)

    return cred


def unlink_credential_from_client(db: Session, client_id: int, username: str) -> bool:
    """
    Unlinks a credential from a client.
    If the credential has no other owners after unlinking, it is deleted from the database.
    """
    # Find the credential
    cred = db.query(instagram_model.InstagramCredential).filter_by(username=username).first()
    if not cred:
        # If credential doesn't exist, consider it already unlinked
        return True

    link = (
        db.query(instagram_model.ClientInstagramCredential)
        .filter_by(client_id=client_id, credential_id=cred.id)
        .first()
    )

    # If the link exists, delete it
    if link:
        db.delete(link)
        db.commit()
        print(f"    - [DB] Unlinked '{username}' from Client ID {client_id}.")

        # Orphan Check
        remaining_links_count = (
            db.query(instagram_model.ClientInstagramCredential).filter_by(credential_id=cred.id).count()
        )

        if remaining_links_count == 0:
            print(f"    - [DB] Credential '{username}' is now an orphan. Deleting record.")
            db.delete(cred)
            db.commit()

        return True

    return True


def update_cred_link_settings(db: Session, client_id: int, username: str, fetch_feed: bool) -> bool:
    """
    Updates the 'fetch_feed' preference for a specific client-credential pair.
    """
    # Find the credential by username
    cred = get_credential_by_username(db, username)
    if not cred:
        print(f"  - [DB] Update settings failed: Credential '{username}' not found.")
        return False

    # Find the association record for this client
    link = (
        db.query(instagram_model.ClientInstagramCredential)
        .filter_by(client_id=client_id, credential_id=cred.id)
        .first()
    )

    if link:
        # Update the preference
        link.fetch_feed = fetch_feed
        db.commit()
        print(f"  - [DB] Client {client_id} updated @{username} fetch_feed to: {fetch_feed}")
        return True

    print(f"  - [DB] No link found between Client {client_id} and Credential {username}.")
    return False


def update_credential_session(db: Session, cred_id: int, session_data: dict):
    """
    Updates the session data (cookies, user-agent) and marks the credential status as SUCCESS.
    """
    cred = db.query(instagram_model.InstagramCredential).filter_by(id=cred_id).first()

    if not cred:
        return False

    cookies = session_data.get("cookies_for_selenium") or session_data.get("cookies")
    if cookies:
        cred.cookies = cookies
    user_agent = session_data.get("user_agent")
    if user_agent:
        cred.user_agent = user_agent
    cred.status = instagram_model.CredentialStatus.SUCCESS
    cred.last_used_at = datetime.now(timezone.utc)
    db.commit()
    print(f"    - [DB] Updated for credential ID: {cred_id} ({cred.username})")
    return True


def update_credential_status(db: Session, cred_id: int, status: instagram_model.CredentialStatus):
    cred = db.query(instagram_model.InstagramCredential).filter_by(id=cred_id).first()

    if cred:
        cred.status = status
        db.commit()
        print(f"    - [DB] Credential {cred.username} status changed to {status}")


def create_scrape_log(db: Session, target_user_id: int, credential_id: int, status: instagram_model.ScrapeStatus):
    new_log = instagram_model.InstagramScrapeLog(
        target_user_id=target_user_id, credential_id=credential_id, status=status, created_at=datetime.now(timezone.utc)
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
            instagram_model.InstagramCredential.status == instagram_model.CredentialStatus.SUCCESS,
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
        .filter(instagram_model.InstagramCredential.username == username)
        .first()
    )


def get_credentials_by_client(db: Session, client_id: int) -> List[instagram_model.InstagramCredential]:
    """
    Retrieves all Instagram credentials linked to a specific client.
    """
    links = db.query(instagram_model.ClientInstagramCredential).filter_by(client_id=client_id).all()

    results = []
    for link in links:
        cred = link.credential

        results.append(
            {
                "id": cred.id,
                "username": cred.username,
                "status": cred.status,
                "is_shared": cred.is_shared,
                "last_used_at": cred.last_used_at,
                "fetch_feed": link.fetch_feed,
                "categories": cred.categories,
            }
        )

    return results


def link_post_to_home_feed(db: Session, credential_id: int, post_id: int):
    """
    Records the relationship between a credential and a post found in its home feed.
    """
    try:
        # Check if the association already exists
        exists = (
            db.query(instagram_model.InstagramHomeFeed).filter_by(credential_id=credential_id, post_id=post_id).first()
        )

        if not exists:
            # Create a new link
            new_entry = instagram_model.InstagramHomeFeed(credential_id=credential_id, post_id=post_id)
            db.add(new_entry)
            db.commit()
            # print(f"  - [DB] Linked post {post_id} to credential {credential_id}")

    except Exception as e:
        db.rollback()
        print(f"  - [DB Error] Failed to record feed appearance: {e}")
