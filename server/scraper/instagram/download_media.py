import os
import json
import requests
import shutil
import argparse
import time
import random
import mimetypes
from typing import List, Dict

# --- Global Path Settings ---
SERVER_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
DATA_FOLDER_PATH = os.path.join(SERVER_ROOT, "data", "instagram")
MEDIA_FOLDER_PATH = os.path.join(SERVER_ROOT, "media", "instagram")

USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/119.0"
HEADERS = {"User-Agent": USER_AGENT}

FAILURE_THRESHOLD = 2
STATUS_SUCCESS = 0
STATUS_SKIPPED = 1
STATUS_FAILED_PERMANENT = 2
STATUS_FAILED_TRANSIENT = 3


def get_file_extension_from_url(url: str, fallback_ext: str) -> str:
    """
    Determines the correct file extension by sending a HEAD request and
    checking the 'Content-Type' header.
    """
    try:
        mime_type, _ = mimetypes.guess_type(url)
        fallback_ext = mimetypes.guess_extension(mime_type)

    except requests.exceptions.RequestException as e:
        print(
            f"    - Warning: Could not determine file type via HEAD request for URL. Error: {e}. Using fallback '{fallback_ext}'."
        )

    return fallback_ext


def get_media_urls_from_post(post_data: dict) -> List[Dict[str, str]]:
    """
    Parses post JSON to extract media URLs and generates filenames with order prefixes.
    """
    media_list = []
    post_pk = post_data.get("pk")
    if not post_pk:
        return []

    items_to_parse = post_data.get("carousel_media") or [post_data]
    if not items_to_parse:
        return []

    # --- Use enumerate to get the index for the filename prefix ---
    for index, item_data in enumerate(items_to_parse):
        item_pk = item_data.get("pk")
        item_media_type = item_data.get("media_type")

        # Format index with leading zeros (e.g., 0, 1 -> 00, 01)
        # This ensures correct alphabetical sorting of filenames
        prefix = f"{index:02d}"

        # For videos, download both the video and its cover
        if item_media_type == 2:
            if item_data.get("video_versions"):
                best_video = max(item_data["video_versions"], key=lambda v: v.get("width", 0))
                ext = get_file_extension_from_url(best_video["url"], fallback_ext=".mp4")
                media_list.append({"url": best_video["url"], "filename": f"{prefix}_{item_pk}{ext}"})
            if item_data.get("image_versions2"):
                best_cover = max(item_data["image_versions2"]["candidates"], key=lambda c: c.get("width", 0))
                ext = get_file_extension_from_url(best_cover["url"], fallback_ext=".jpg")
                media_list.append({"url": best_cover["url"], "filename": f"{prefix}_{item_pk}_cover{ext}"})

        # For images
        elif item_media_type == 1:
            if item_data.get("image_versions2"):
                best_image = max(item_data["image_versions2"]["candidates"], key=lambda c: c.get("width", 0))
                ext = get_file_extension_from_url(best_image["url"], fallback_ext=".jpg")
                media_list.append({"url": best_image["url"], "filename": f"{prefix}_{item_pk}{ext}"})

    return media_list


def download_file(url: str, destination_path: str, retries: int = 1) -> bool:
    """
    Downloads a file from a given URL and saves it to a destination path.
    """
    if os.path.exists(destination_path):
        if os.path.getsize(destination_path) == 0:
            os.remove(destination_path)
        else:
            # print(f"    - File already exists, skipping: {os.path.basename(destination_path)}")
            return STATUS_SKIPPED

    temp_path = destination_path + ".tmp"

    for attempt in range(retries):
        try:
            print(f"    - Downloading: {os.path.basename(destination_path)} (Attempt {attempt + 1}/{retries})...")
            with requests.get(url, stream=True, headers=HEADERS, timeout=20) as r:
                r.raise_for_status()
                with open(temp_path, "wb") as f:
                    shutil.copyfileobj(r.raw, f)

            os.rename(temp_path, destination_path)
            print("    - ✓ Download successful")
            return STATUS_SUCCESS

        except requests.exceptions.HTTPError as e:
            print(f"    - ✗ HTTP Error (e.g., 403/404): {e}. URL is likely expired.")
            return STATUS_FAILED_PERMANENT

        except requests.exceptions.RequestException as e:
            retry_delay = random.uniform(0.8, 1.9)
            print(f"    - ✗ Connection Error: {e}. Retrying in {retry_delay:.2f}s...")
            if attempt < retries - 1:
                time.sleep(retry_delay)

        except Exception as e:
            print(f"    - ✗ An unexpected error occurred: {e}.")
            return STATUS_FAILED_PERMANENT

    print(f"    - ✗ Failed to download after {retries} attempts.")
    return STATUS_FAILED_TRANSIENT


def download_profile_picture(target_user_pk: str, posts_json_dir: str, source_json_file: str) -> bool:
    """
    Finds and downloads the user's high-definition profile picture.
    """
    # print(f"--- Attempting to download profile picture for ID: {target_user_pk} ---")
    json_filepath = os.path.join(posts_json_dir, source_json_file)

    if not os.path.exists(json_filepath):
        print(f"  - Warning: Source JSON file '{source_json_file}' not found. Cannot download profile picture.")
        return False

    try:
        with open(json_filepath, "r", encoding="utf-8") as f:
            post_data = json.load(f)

        hd_pic_url = post_data.get("user", {}).get("hd_profile_pic_url_info", {}).get("url") or post_data.get(
            "user", {}
        ).get("profile_pic_url")

        if hd_pic_url:
            ext = get_file_extension_from_url(hd_pic_url, fallback_ext=".jpg")
            destination_path = os.path.join(MEDIA_FOLDER_PATH, target_user_pk, f"profile_pic{ext}")
            # print("  - Found profile picture URL.")
            status = download_file(hd_pic_url, destination_path)
            return status == STATUS_SUCCESS
        else:
            print("  - Warning: Profile picture URL not found in the JSON data.")
            return False
    except (json.JSONDecodeError, KeyError) as e:
        print(f"  - Error processing JSON for profile picture: {e}")
        return False


def process_single_post(target_user_pk: str, post_pk: str) -> bool:
    """
    Processes and downloads media for a single post.
    """
    print(f"--- Processing post: {post_pk} ---")

    json_filepath = os.path.join(DATA_FOLDER_PATH, target_user_pk, "posts", f"{post_pk}.json")
    if not os.path.exists(json_filepath):
        print(f"  - Error: JSON file not found for post {post_pk} at {json_filepath}")
        return False

    any_download_occurred = False

    try:
        with open(json_filepath, "r", encoding="utf-8") as f:
            post_data = json.load(f)

    except (json.JSONDecodeError, FileNotFoundError) as e:
        print(f"  - Error: Could not read or parse JSON file for post {post_pk}: {e}")
        return False

    media_to_download = get_media_urls_from_post(post_data)

    if not media_to_download:
        print("  - No downloadable media found for this post.")
        return False

    media_output_dir_base = os.path.join(MEDIA_FOLDER_PATH, target_user_pk)
    post_media_dir = os.path.join(media_output_dir_base, post_pk)
    os.makedirs(post_media_dir, exist_ok=True)
    # print(f"  - Media will be saved to: {post_media_dir}")

    consecutive_failures = 0
    for j, media_item in enumerate(media_to_download):
        destination_path = os.path.join(post_media_dir, media_item["filename"])
        status = download_file(media_item["url"], destination_path)

        if status == STATUS_SUCCESS:
            any_download_occurred = True
            consecutive_failures = 0
        elif status == STATUS_SKIPPED:
            consecutive_failures = 0
            continue
        elif status == STATUS_FAILED_PERMANENT:
            consecutive_failures += 1
            if consecutive_failures >= FAILURE_THRESHOLD:
                print("    - ✗ Circuit breaker tripped. Aborting this post.")
                return any_download_occurred

        if j < len(media_to_download) - 1:
            short_delay = random.uniform(1, 5)
            # print(f"    - Delaying for {short_delay:.2f}s before next media item...")
            time.sleep(short_delay)

    return any_download_occurred


def download_specific_posts_for_user(target_user_pk: str, post_pks: List[str]):
    """
    Downloads the user's profile picture and media for a specific list of posts.
    """
    print(f"--- Downloading profile picture and {len(post_pks)} specific post(s) for {target_user_pk} ---")

    if not post_pks:
        print("Warning: No post PKs provided to download.")
        return

    posts_json_dir = os.path.join(DATA_FOLDER_PATH, target_user_pk, "posts")
    if not os.path.isdir(posts_json_dir):
        print(f"Error: Could not find post directory for {target_user_pk}: {posts_json_dir}")
        return

    os.makedirs(os.path.join(MEDIA_FOLDER_PATH, target_user_pk), exist_ok=True)

    source_json_for_pic = f"{post_pks[0]}.json"
    any_download_occurred = download_profile_picture(target_user_pk, posts_json_dir, source_json_for_pic)

    for i, post_pk in enumerate(post_pks):
        if any_download_occurred:
            delay = random.uniform(2.5, 5.0)
            print(f"\n--- Delaying for {delay:.2f}s before processing post... ({i + 1}/{len(post_pks)}) ---")
            time.sleep(delay)

        any_download_occurred = process_single_post(target_user_pk, post_pk)

    print("\n--- Specific post download tasks are complete. ---")


def download_media_for_user(target_user_pk: str):
    """
    Downloads the user's profile picture and all their media from available JSON files.
    """
    print(f"\n--- Starting full media download for {target_user_pk} ---")

    posts_json_dir = os.path.join(DATA_FOLDER_PATH, target_user_pk, "posts")
    if not os.path.isdir(posts_json_dir):
        print(f"Error: Could not find post directory for @{target_user_pk}: {posts_json_dir}")
        print("Please run scrape_metadata.py first to fetch the data.")
        return

    os.makedirs(os.path.join(MEDIA_FOLDER_PATH, target_user_pk), exist_ok=True)

    json_files = [f for f in os.listdir(posts_json_dir) if f.endswith(".json")]
    if not json_files:
        print(f"No .json files found in {posts_json_dir}.")
        return

    any_download_occurred = download_profile_picture(target_user_pk, posts_json_dir, json_files[0])

    print(f"Found {len(json_files)} post JSON files. Starting to process posts...")

    total_posts = len(json_files)
    for i, filename in enumerate(sorted(json_files)):
        if any_download_occurred:
            delay = random.uniform(10, 20)
            print(f"\n--- Delaying for {delay:.2f}s before next post... ({i + 1}/{total_posts}) ---")
            time.sleep(delay)

        post_pk = os.path.splitext(filename)[0]
        any_download_occurred = process_single_post(target_user_pk, post_pk)

    print("\n--- All media download tasks are complete. ---")


def main():
    """
    Main function to handle command-line argument parsing and dispatching.
    """
    parser = argparse.ArgumentParser(
        description="Download media and profile picture from saved Instagram JSON files. Can download all media for a user or specific posts."
    )
    parser.add_argument("target_user_pk", type=str, help="Target User PK (ID) - must match the folder name in data/")
    parser.add_argument(
        "-p",
        "--posts",
        nargs="+",
        help="One or more post PKs (IDs) to download specifically. If not provided, all posts will be processed.",
    )
    args = parser.parse_args()

    if args.posts:
        download_specific_posts_for_user(args.target_user_pk, args.posts)
    else:
        download_media_for_user(args.target_user_pk)


if __name__ == "__main__":
    main()
