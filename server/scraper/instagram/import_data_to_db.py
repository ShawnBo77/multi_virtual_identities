import os
import json
import sys
import argparse
import csv
from sqlalchemy.orm import Session
from typing import List, Dict, Optional
from datetime import datetime

# --- Setup paths and imports ---
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))
from app.database import SessionLocal, engine
from app.services import instagram_service
from app.models import instagram_model, client_model, follow_model

from json_utils import extract_media_payload

# --- Path Configuration ---
SERVER_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
DATA_FOLDER_PATH = os.path.join(SERVER_ROOT, "data", "instagram")
MEDIA_FOLDER_PATH = os.path.join(SERVER_ROOT, "media", "instagram")
LOG_FILE_PATH = os.path.join(DATA_FOLDER_PATH, "logs", "home_feed_discovery.csv")


def initialize_database():
    """Initializes the database and creates all tables."""
    print("Initializing database and creating tables...")
    instagram_model.Base.metadata.create_all(bind=engine)
    client_model.Base.metadata.create_all(bind=engine)
    follow_model.Base.metadata.create_all(bind=engine)
    print("Tables created successfully.")


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


def reconstruct_home_feed_from_log(db: Session):
    """
    Reconstructs the relationship between Credentials and Posts using the discovery log CSV.
    """
    if not os.path.exists(LOG_FILE_PATH):
        print(f"\n--- [Skip] Discovery log not found at {LOG_FILE_PATH} ---")
        return

    with open(LOG_FILE_PATH, mode="r", encoding="utf-8") as f:
        reader = csv.DictReader(f)

        for row in reader:
            try:
                username = row["credential_username"]
                post_pk = row["post_pk"]

                # Find Credential
                cred = (
                    db.query(instagram_model.InstagramCredential)
                    .filter((instagram_model.InstagramCredential.username == username))
                    .first()
                )
                if not cred:
                    print(f"Cred {row['credential_username']} not found!")

                # Find Post
                post = db.query(instagram_model.InstagramPost).filter_by(pk=post_pk).first()
                if not post:
                    print(f"Post {row['post_pk']} not found!")

                instagram_service.link_post_to_home_feed(db, cred.id, post.id)

            except Exception as e:
                print(f"  - ✗ Error reconstructing relationship for post {post_pk}: {e}")
                db.rollback()

    db.commit()
    print(f"--- Successfully restored the Home Feed relationships. ---")


def import_data_for_specific_user(db_session: Session, user_pk: str):
    """
    Imports data for a single specific user PK.
    """
    user_data_dir = os.path.join(DATA_FOLDER_PATH, user_pk)
    posts_json_dir = os.path.join(user_data_dir, "posts")

    if not os.path.isdir(posts_json_dir):
        print(f"  - ✗ Warning: Data directory not found for user PK {user_pk} at {posts_json_dir}")
        return

    print(f"--- Importing data for user: {user_pk} ---")

    post_files = [f for f in os.listdir(posts_json_dir) if f.endswith(".json")]
    if not post_files:
        print(f"  - No JSON post files found for user {user_pk}.")
        return

    is_first_post_for_user = True

    # Iterate through post files
    for filename in post_files:
        post_pk = os.path.splitext(filename)[0]

        try:
            json_filepath = os.path.join(posts_json_dir, filename)
            with open(json_filepath, "r", encoding="utf-8") as f:
                post_data = json.load(f)
                post_data = extract_media_payload(post_data)

            # Create User in DB if not exists
            if is_first_post_for_user:
                try:
                    user_info = post_data.get("user")
                    user_info["profile_pic_local_path"] = find_local_profile_pic(user_pk)
                    user = instagram_service.get_user_by_username(db_session, user_info.get("username"))
                    if user:
                        instagram_service.update_user_from_data(db_session, user_info)
                    elif user_info:
                        instagram_service.create_user_by_data(db_session, user_info)
                    db_session.commit()
                except Exception as e:
                    print(f"  - ✗ ERROR reading first post JSON for user creation: {e}")
                is_first_post_for_user = False

            if instagram_service.get_post_by_pk(db_session, post_pk):
                # Already imported
                continue

            print(f"  - Preparing to import post: {post_pk}")

            # Process Media and Create Post
            media_items_in_json = post_data.get("carousel_media") or [post_data]
            expected_media_count = len(media_items_in_json)

            # Find local media files and extract URLs from the post_data
            media_for_db = find_local_media_for_post(user_pk, post_data)

            if len(media_for_db) == expected_media_count:
                instagram_service.create_post_from_data(db_session, post_data, media_for_db)
                print(f"    - ✓ Successfully imported post {post_pk} to database.")
            else:
                print(
                    f"    - ✗ Skipping post {post_pk}: Media file count mismatch. Expected {expected_media_count}, found {len(media_for_db)}."
                )

        except Exception as e:
            print(f"    - ✗ CRITICAL ERROR importing post {post_pk}: {e}")
            db_session.rollback()


def import_all_data_to_database():
    """
    Scan the data folder and import ALL users' data.
    """
    print("--- Starting Database Import Process for all users ---")

    db_session = SessionLocal()
    try:
        if not os.path.exists(DATA_FOLDER_PATH):
            print(f"Error: Data folder not found at '{DATA_FOLDER_PATH}'.")
            return

        print(f"\nScanning for users in '{DATA_FOLDER_PATH}'...")
        for user_pk in os.listdir(DATA_FOLDER_PATH):
            if user_pk == "logs" or not os.path.isdir(os.path.join(DATA_FOLDER_PATH, user_pk)):
                continue
            import_data_for_specific_user(db_session, user_pk)

    finally:
        db_session.close()

    print("\n--- Database import process finished. ---")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Import scraped JSON data and downloaded media into the database.")
    parser.add_argument("-u", "--user_pk", type=str, help="Specific User PK to import (Optional).")
    parser.add_argument("-rc", "--reconstruct", action="store_true", help="Only reconstruct Home Feed links from CSV.")
    args = parser.parse_args()

    initialize_database()

    if args.reconstruct:
        db = SessionLocal()
        try:
            reconstruct_home_feed_from_log(db)
        finally:
            db.close()
    elif args.user_pk:
        # Import single user
        db = SessionLocal()
        try:
            import_data_for_specific_user(db, args.user_pk)
        finally:
            db.close()
    else:
        # Import all
        import_all_data_to_database()
