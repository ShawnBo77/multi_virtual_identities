from sqlalchemy.orm import Session
from fastapi import HTTPException
from datetime import datetime
from ..models import follow_model, instagram_model
from . import client_service
from . import instagram_service


def get_followings_detail(db: Session, client_id: int, platform: str) -> list[follow_model.Following]:
    client = client_service.get_client(db, client_id=client_id)

    results = []
    if platform == "instagram":
        results = (
            db.query(follow_model.Following, instagram_model.InstagramUser.username)
            .outerjoin(
                instagram_model.InstagramUser,
                follow_model.Following.followed_user_id == instagram_model.InstagramUser.id,
            )
            .filter(follow_model.Following.client_id == client.id, follow_model.Following.platform == platform)
            .all()
        )

    response_data = []
    for following_record, username in results:
        following_record.followed_username = username
        response_data.append(following_record)

    return response_data


def follow_by_username(db: Session, client_id: int, platform: str, username: str) -> follow_model.Following:
    client = client_service.get_client(db, client_id=client_id)
    if not client:
        raise HTTPException(status_code=401, detail="Client not found.")

    try:
        target_user = None
        if platform == "instagram":
            target_user = instagram_service.get_user_by_username(
                db, username=username
            ) or instagram_service.create_user_by_username(db, username=username)

        if not target_user:
            raise HTTPException(status_code=404, detail=f"Could not find or create user '{username}'.")

        existing_following = (
            db.query(follow_model.Following)
            .filter_by(client_id=client.id, platform=platform, followed_user_id=target_user.id)
            .first()
        )

        if existing_following:
            if not existing_following.is_following:
                existing_following.is_following = True
            existing_following.followed_username = target_user.username
            existing_following.updated_at = datetime.utcnow()

            db.commit()
            db.refresh(existing_following)
            return existing_following

        new_following = follow_model.Following(
            platform=platform, followed_user_id=target_user.id, client_id=client.id, is_following=True
        )
        db.add(new_following)

        db.commit()
        db.refresh(new_following)

        new_following.followed_username = target_user.username
        return new_following

    except Exception as e:
        print(f"  - An error occurred during add_following: {e}. Rolling back transaction.")
        db.rollback()
        raise e


def unfollow_by_username(db: Session, client_id: int, platform: str, username: str) -> bool:
    target_user = instagram_service.get_user_by_username(db, username=username)

    if not target_user:
        return False

    following_to_update = (
        db.query(follow_model.Following)
        .filter_by(client_id=client_id, platform=platform, followed_user_id=target_user.id)
        .first()
    )

    if following_to_update:
        following_to_update.is_following = False
        following_to_update.updated_at = datetime.utcnow()
        db.commit()

        return True
    else:
        return False


def unfollow_by_id(db: Session, client_id: int, following_id: int) -> bool:
    following_to_update = db.query(follow_model.Following).filter_by(id=following_id, client_id=client_id).first()

    if following_to_update:
        following_to_update.is_following = False
        following_to_update.updated_at = datetime.utcnow()
        db.commit()
        return True

    return False
