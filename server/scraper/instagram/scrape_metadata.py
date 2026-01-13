import json
import os
import time
import random
import argparse
from typing import List

from seleniumwire import webdriver
from seleniumwire.utils import decode
from selenium.webdriver.firefox.service import Service as FirefoxService
from webdriver_manager.firefox import GeckoDriverManager
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException

SERVER_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
DATA_FOLDER_PATH = os.path.join(SERVER_ROOT, "data", "instagram")


def load_selenium_credentials(filepath):
    """Loads credentials from a JSON file."""
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            creds = json.load(f)
        if not creds.get("cookies_for_selenium") or not creds.get("user_agent"):
            raise ValueError("Credential file is missing 'cookies_for_selenium' or 'user_agent'.")
        return creds
    except FileNotFoundError:
        print(f"Error: Credential file not found at '{filepath}'.")
        return None
    except (json.JSONDecodeError, ValueError) as e:
        print(f"Error: Failed to parse credential file: {e}")
        return None


def inject_cookies_and_login(driver: webdriver.Firefox, url: str, cookies: list) -> bool:
    """Injects cookies into the WebDriver."""
    try:
        driver.get(url)
        if not cookies:
            print("  - Warning: No cookies provided.")
            return False
        for cookie in cookies:
            if "name" in cookie and "value" in cookie:
                driver.add_cookie(cookie)
        print("  - Cookies injected successfully, simulating login state.")
        return True
    except Exception as e:
        print(f"  - Error: An exception occurred while injecting cookies: {e}")
        return False


def scroll_down(driver):
    last_height = driver.execute_script("return document.body.scrollHeight")
    viewport_height = driver.execute_script("return window.innerHeight")  # Viewport height
    new_height = 0
    while True:
        scroll_increment = viewport_height * random.uniform(0.2, 0.5)
        current_scroll_y = driver.execute_script("return window.scrollY")  # Current scroll position

        if current_scroll_y + viewport_height >= last_height - 10:
            print("  - Reached the bottom of the page, no new content found.")
            return False

        next_scroll_y = min(current_scroll_y + scroll_increment, last_height - viewport_height - 10)
        driver.execute_script(f"window.scrollTo(0, {next_scroll_y});")

        time.sleep(random.uniform(0.4, 0.9))

        # Check if page height has changed
        new_height = driver.execute_script("return document.body.scrollHeight")
        if new_height > last_height:
            print(f"  - Page height increased (from {last_height}px -> {new_height}px), stopping scroll.")
            return True


def save_posts_as_individual_files(posts_data: list, target_username: str):
    """Saves scraped posts into individual JSON files."""
    if not posts_data:
        print("No post data provided to save.")
        return

    user_pk = None
    first_post = posts_data[0]

    if "user" in first_post and "pk" in first_post["user"]:
        user_pk = first_post["user"]["pk"]
    elif "owner" in first_post and "pk" in first_post["owner"]:
        user_pk = first_post["owner"]["pk"]

    target_folder_name = user_pk if user_pk else target_username
    print(f"\n--- Saving posts to individual files (Folder: {target_folder_name}) ---")

    posts_dir = os.path.join(DATA_FOLDER_PATH, target_folder_name, "posts")
    os.makedirs(posts_dir, exist_ok=True)
    print(f"  - Posts will be saved in: {posts_dir}")

    new_files_saved = 0
    for post_node in posts_data:
        post_pk = post_node.get("pk")
        if not post_pk:
            print("  - Warning: Found a post without a 'pk', skipping.")
            continue

        post_filename = os.path.join(posts_dir, f"{post_pk}.json")

        try:
            with open(post_filename, "w", encoding="utf-8") as f:
                json.dump(post_node, f, ensure_ascii=False, indent=4)
            new_files_saved += 1
        except Exception as e:
            print(f"  - Error: Failed to save file {post_filename}: {e}")

    print(f"--- Saved {new_files_saved} new post files. ---")


def scrape_single_user(driver, target_username: str, num_posts_to_fetch: int):
    """
    Scrapes a single user using the EXISTING driver instance.
    """

    print(f"\n=== Starting Scrape for User: @{target_username} ===")

    del driver.requests

    profile_url = f"https://www.instagram.com/{target_username}/"
    driver.get(profile_url)

    try:
        WebDriverWait(driver, 15).until(EC.presence_of_element_located((By.XPATH, "//header")))
        print(f"  - Profile page loaded: {target_username}")
    except TimeoutException:
        print("  - Error: Timed out waiting for page to load. User may not exist or page structure changed.")
        return

    time.sleep(random.uniform(3, 5))

    all_posts = []
    processed_post_pks = set()
    processed_request_ids = set()
    scroll_attempts = 0

    reached_bottom = False
    while len(all_posts) < num_posts_to_fetch and not reached_bottom:
        print(f"\nScroll attempt #{scroll_attempts + 1} | Posts collected: {len(all_posts)}/{num_posts_to_fetch}")

        if scroll_attempts > 0:
            if not scroll_down(driver):
                reached_bottom = True

        scroll_pause_time = random.uniform(3, 5.5)
        # print(f"  - Pausing for {scroll_pause_time:.2f} seconds to let content load...")
        time.sleep(scroll_pause_time)

        try:
            new_posts_in_loop = 0
            for req in driver.requests:
                if req.id in processed_request_ids:
                    continue

                processed_request_ids.add(req.id)

                if (
                    req.url.startswith("https://www.instagram.com/graphql/query")
                    and req.response
                    and "xdt_api__v1__feed__user_timeline_graphql_connection"
                    in req.headers.get("x-root-field-name", "")
                ):
                    response_body = decode(
                        req.response.body, req.response.headers.get("Content-Encoding", "identity")
                    ).decode("utf-8")
                    data = json.loads(response_body)
                    feed_data = data.get("data", {}).get("xdt_api__v1__feed__user_timeline_graphql_connection", {})
                    edges = feed_data.get("edges", [])

                    for edge in edges:
                        node = edge.get("node", {})
                        if not node:
                            continue

                        post_pk = node.get("pk")
                        if not post_pk or post_pk in processed_post_pks:
                            continue

                        all_posts.append(node)
                        processed_post_pks.add(post_pk)
                        new_posts_in_loop += 1

            print(
                f"  - Parsed requests, found {new_posts_in_loop} new posts in this loop. Total unique posts: {len(all_posts)}."
            )

            if len(all_posts) >= num_posts_to_fetch:
                print("  - Target number of posts reached.")
                break

        except Exception as e:
            print(f"  - An error occurred while processing requests: {e}")

        scroll_attempts += 1

    final_posts = all_posts
    print(f"\n--- Scraping finished! Successfully collected metadata for {len(final_posts)} posts. ---")

    # Save the collected posts to files
    save_posts_as_individual_files(final_posts, target_username)


def run_batch_scrape(usernames: List[str], num_posts: int, credentials_path: str):
    """
    Main controller for batch scraping.
    """
    credentials = load_selenium_credentials(credentials_path)
    if not credentials:
        return

    print("--- Initializing Selenium WebDriver ---")
    service = FirefoxService(GeckoDriverManager().install())
    options = webdriver.FirefoxOptions()
    # options.add_argument("--headless")
    options.set_preference("general.useragent.override", credentials["user_agent"])

    driver = webdriver.Firefox(service=service, options=options)

    try:
        if not inject_cookies_and_login(
            driver, "https://www.instagram.com/", credentials.get("cookies_for_selenium", [])
        ):
            print("Login failed. Aborting.")
            return

        total_users = len(usernames)
        for i, username in enumerate(usernames):
            username = username.strip()
            if not username:
                continue

            print(f"\n[{i + 1}/{total_users}] Processing user: {username}")

            try:
                scrape_single_user(driver, username, num_posts)
            except Exception as e:
                print(f"  - ✗ CRITICAL ERROR scraping {username}: {e}")

            if i < total_users - 1:
                delay = random.uniform(10, 20)
                print(f"\n--- Cooling down for {delay:.1f} seconds before next user... ---")
                time.sleep(delay)

    finally:
        print("\n--- Batch scraping finished. Closing browser. ---")
        driver.quit()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Scrape Instagram posts for multiple users.")

    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("-u", "--usernames", nargs="+", help="List of Instagram usernames (separated by space)")
    group.add_argument("-f", "--file", type=str, help="Path to a text file containing usernames (one per line)")
    parser.add_argument("-n", "--num-posts", type=int, default=5, help="Number of posts to fetch")
    parser.add_argument(
        "-c",
        "--credentials",
        type=str,
        required=True,
        help="Path to the selenium credentials JSON file (e.g., 'ins_cred_user.json').",
    )
    args = parser.parse_args()

    target_users = []
    if args.usernames:
        target_users = args.usernames
    elif args.file:
        if os.path.exists(args.file):
            with open(args.file, "r", encoding="utf-8") as f:
                target_users = [line.strip() for line in f if line.strip()]
        else:
            print(f"Error: User list file '{args.file}' not found.")
            exit(1)

    print(f"Targets loaded: {len(target_users)} users.")

    try:
        run_batch_scrape(target_users, args.num_posts, args.credentials)
    except KeyboardInterrupt:
        print("\nProcess interrupted by user.")
    except Exception as e:
        print(f"\nAn unexpected error occurred: {e}")
