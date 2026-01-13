import os
import json
import sys
import argparse
from sqlalchemy.orm import Session
from typing import List, Dict, Optional

# --- Setup paths and imports ---
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))
from app.database import SessionLocal, engine
from app.services import instagram_service
from app.models import instagram_model, client_model, follow_model
from app.schemas import instagram_schema

# --- Path Configuration ---
SERVER_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
DATA_FOLDER_PATH = os.path.join(SERVER_ROOT, "data", "instagram")
MEDIA_FOLDER_PATH = os.path.join(SERVER_ROOT, "media", "instagram")


def initialize_database():
    """Initializes the database and creates all tables."""
    print("Initializing database and creating tables...")
    instagram_model.Base.metadata.create_all(bind=engine)
    client_model.Base.metadata.create_all(bind=engine)
    follow_model.Base.metadata.create_all(bind=engine)
    print("Tables created successfully.")


def create_user_if_not_exists(db: Session, username: str, user_data: dict, profile_pic_local_path: str):
    """
    Checks if a user exists in the DB. If not, creates them with all available info.
    """
    if instagram_service.get_user_by_username(db, username):
        return  # User already exists, do nothing.

    print(f"  - User @{username} not found in DB. Creating now...")

    try:
        user_to_create = instagram_schema.InstagramUserCreate(
            pk=user_data.get("pk"),
            username=user_data.get("username"),
            full_name=user_data.get("full_name"),
            profile_pic_url=user_data.get("profile_pic_url"),
            is_verified=user_data.get("is_verified", False),
            profile_pic_local_path=profile_pic_local_path,
        )

        db_user = instagram_model.InstagramUser(**user_to_create.model_dump(exclude_none=True))
        db.add(db_user)
        db.commit()
        print(f"    - ✓ User @{username} created successfully.")
    except Exception as e:
        print(f"    - ✗ ERROR creating user @{username}: {e}")
        db.rollback()


def find_local_profile_pic(user_pk: str) -> Optional[str]:
    """
    Scans the media directory for a user's downloaded profile picture (by PK folder).
    """
    user_media_dir = os.path.join(MEDIA_FOLDER_PATH, user_pk)
    if not os.path.isdir(user_media_dir):
        return None

    try:
        iterator = os.scandir(user_media_dir)

        # Find the first entry that is a file and starts with "profile_pic"
        found_entry = next(entry for entry in iterator if entry.name.startswith("profile_pic") and entry.is_file())

        if found_entry:
            return os.path.join("media", "instagram", user_pk, found_entry.name).replace("\\", "/")

    except StopIteration:
        pass

    return None


def find_local_media_for_post(user_pk: str, post_data: Dict) -> List[Dict]:
    """
    For a given post's data, finds all corresponding downloaded media files (images, videos, covers)
    and maps them to the new dual-path database schema.
    """
    post_pk = str(post_data.get("pk"))
    post_media_dir = os.path.join(MEDIA_FOLDER_PATH, user_pk, post_pk)

    if not os.path.isdir(post_media_dir):
        return []

    # Get a list of all downloaded files for this post
    files_on_disk = os.listdir(post_media_dir)
    if not files_on_disk:
        return []

    db_ready_media_list = []
    media_items_to_process = post_data.get("carousel_media") or [post_data]

    for item_meta in media_items_to_process:
        item_pk = str(item_meta.get("pk"))
        item_media_type = item_meta.get("media_type")

        # --- Initialize paths and URLs ---
        img_url: Optional[str] = None
        vid_url: Optional[str] = None
        image_local_path: Optional[str] = None
        video_local_path: Optional[str] = None

        # --- Extract original URLs from JSON for reference ---
        image_versions = item_meta.get("image_versions2", {})
        if isinstance(image_versions, dict):
            candidates = image_versions.get("candidates")
            if isinstance(candidates, list) and candidates:
                img_url = candidates[0].get("url")

        video_versions = item_meta.get("video_versions")
        if isinstance(video_versions, list) and video_versions:
            vid_url = video_versions[0].get("url")

        # --- Find corresponding local files on disk ---

        # video, a video and a cover
        if item_media_type == 2:
            # Find the video
            video_filename = next((f for f in files_on_disk if item_pk in f and "_cover" not in f), None)
            if video_filename:
                video_local_path = os.path.join("media", "instagram", user_pk, post_pk, video_filename)

            # Find the cover image
            cover_filename = next((f for f in files_on_disk if item_pk in f and "_cover" in f), None)
            if cover_filename:
                image_local_path = os.path.join("media", "instagram", user_pk, post_pk, cover_filename)

        # image
        elif item_media_type == 1:
            # Find the image
            image_filename = next((f for f in files_on_disk if item_pk in f), None)
            if image_filename:
                image_local_path = os.path.join("media", "instagram", user_pk, post_pk, image_filename)

        if image_local_path or video_local_path:
            db_ready_media_list.append(
                {
                    "pk": item_pk,
                    "media_type": item_media_type,
                    "image_url": img_url,
                    "video_url": vid_url,
                    "image_local_path": image_local_path.replace("\\", "/") if image_local_path else None,
                    "video_local_path": video_local_path.replace("\\", "/") if video_local_path else None,
                }
            )

    return db_ready_media_list


def import_data_to_database():
    """
    Main function to import all processed data into the database.
    """
    print("--- Starting Database Import Process ---")

    db_session = SessionLocal()
    try:
        imported_count = 0
        skipped_count = 0

        if not os.path.exists(DATA_FOLDER_PATH):
            print(f"Error: Data folder not found at '{DATA_FOLDER_PATH}'.")
            return

        print(f"\nScanning for users in '{DATA_FOLDER_PATH}'...")
        for user_pk in os.listdir(DATA_FOLDER_PATH):
            user_data_dir = os.path.join(DATA_FOLDER_PATH, user_pk)
            posts_json_dir = os.path.join(user_data_dir, "posts")

            if not os.path.isdir(posts_json_dir):
                continue

            print(f"\n--- Processing user: {user_pk} ---")

            post_files = [f for f in os.listdir(posts_json_dir) if f.endswith(".json")]
            if not post_files:
                continue

            is_first_post_for_user = True

            extracted_username = None
            try:
                first_json_path = os.path.join(posts_json_dir, post_files[0])
                with open(first_json_path, "r", encoding="utf-8") as f:
                    first_data = json.load(f)
                    if "user" in first_data:
                        extracted_username = first_data["user"].get("username")
                    elif "owner" in first_data:
                        extracted_username = first_data["owner"].get("username")
            except Exception as e:
                print(f"  - Error reading metadata for username extraction: {e}")
                continue

            if not extracted_username:
                print(f"  - Warning: Could not extract username from JSON in {user_pk}. Skipping.")
                continue

            print(f"  - Identified Username: @{extracted_username} (PK: {user_pk})")

            for filename in post_files:
                post_pk = os.path.splitext(filename)[0]

                if instagram_service.get_post_by_pk(db_session, post_pk):
                    skipped_count += 1
                    continue

                print(f"  - Preparing to import post: {post_pk}")

                try:
                    json_filepath = os.path.join(posts_json_dir, filename)
                    with open(json_filepath, "r", encoding="utf-8") as f:
                        post_data = json.load(f)

                    # --- User Creation on First Iteration ---
                    if is_first_post_for_user and not instagram_service.get_user_by_pk(db_session, user_pk):
                        try:
                            user_info = post_data.get("user") or post_data.get("owner")
                            if user_info:
                                create_user_if_not_exists(
                                    db_session, user_pk, post_data["user"], find_local_profile_pic(user_pk)
                                )
                        except Exception as e:
                            print(f"  - ✗ ERROR reading first post JSON for user creation: {e}")
                        is_first_post_for_user = False

                    # Determine the expected number of media items for this post
                    media_items_in_json = post_data.get("carousel_media") or [post_data]
                    expected_media_count = len(media_items_in_json)

                    # Find local media files and extract URLs from the post_data
                    media_for_db = find_local_media_for_post(user_pk, post_data)

                    # Check if the number of found files matches the number of items in JSON
                    if len(media_for_db) == expected_media_count:
                        instagram_service.create_post_from_data(db_session, post_data, media_for_db)
                        print(f"    - ✓ Successfully imported post {post_pk} to database.")
                        imported_count += 1
                    else:
                        print(
                            f"    - ✗ Skipping post {post_pk}: Media file count mismatch. Expected {expected_media_count}, found {len(media_for_db)}."
                        )

                except Exception as e:
                    print(f"    - ✗ CRITICAL ERROR importing post {post_pk}: {e}")
                    print("    - Rolling back session to continue with the next post.")
                    db_session.rollback()

    finally:
        db_session.close()

    print("\n--- Database import process finished. ---")
    print(f"New posts imported: {imported_count}")
    print(f"Posts skipped (already in DB): {skipped_count}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Import scraped JSON data and downloaded media into the database.")
    args = parser.parse_args()

    initialize_database()
    import_data_to_database()
