import json
import os
import sys
import time
import random
import argparse
from typing import List, Dict, Optional
import pathlib

from seleniumwire import webdriver
from seleniumwire.utils import decode
from selenium.webdriver.firefox.service import Service as FirefoxService
from webdriver_manager.firefox import GeckoDriverManager
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.append(CURRENT_DIR)

from logger_utils import log_home_feed_relationship

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


def inject_cookies(driver: webdriver.Firefox, url: str, cookies: list) -> bool:
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

        time.sleep(random.uniform(0.5, 1))

        # Check if page height has changed
        new_height = driver.execute_script("return document.body.scrollHeight")
        if new_height > last_height:
            # print(f"  - Page height increased (from {last_height}px -> {new_height}px), stopping scroll.")
            return True


def click_button_by_text(driver, text_list):
    """
    Search for buttons containing specific keywords.
    """
    for label in text_list:
        try:
            xpath = f"//button[contains(text(), '{label}')]"
            btn = driver.find_element(By.XPATH, xpath)

            if btn.is_displayed():
                btn.click()
                print(f"  - [UI] Clicked button with label: '{label}'")
                return True
        except NoSuchElementException:
            continue

    return False


def save_posts_as_individual_files(posts_data: list, target_username: str):
    """Saves scraped posts into individual JSON files."""
    if not posts_data:
        print("No post data provided to save.")
        return

    user_pk = None
    first_post = posts_data[0]

    if "user" in first_post and "pk" in first_post["user"]:
        user_pk = first_post["user"]["pk"]
    elif "owner" in first_post and "id" in first_post["owner"]:
        user_pk = first_post["owner"]["id"]

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


def scrape_single_user(driver, target_username: str, num_posts_to_fetch: int) -> Optional[Dict]:
    """
    Scrapes a single user using the EXISTING driver instance.
    """

    print(f"\n=== Starting Scrape for User: @{target_username} ===")

    del driver.requests

    profile_url = f"https://www.instagram.com/{target_username}/"
    driver.get(profile_url)

    try:
        WebDriverWait(driver, 15).until(EC.presence_of_element_located((By.XPATH, "//header")))
        # print(f"  - Profile page loaded: {target_username}")
    except TimeoutException:
        print("  - Error: Timed out waiting for page to load. User may not exist or page structure changed.")
        return

    time.sleep(random.uniform(3, 5))

    all_posts = []
    processed_post_pks = set()
    processed_request_ids = set()
    scroll_attempts = 0

    reached_bottom = False
    scraped_user_info = None
    while len(all_posts) < num_posts_to_fetch and not reached_bottom:
        # print(f"\nScroll attempt #{scroll_attempts + 1} | Posts collected: {len(all_posts)}/{num_posts_to_fetch}")

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

                        if not scraped_user_info:
                            user_data = node.get("user")
                            if user_data and user_data.get("pk"):
                                scraped_user_info = user_data
            # print(
            #     f"  - Parsed requests, found {new_posts_in_loop} new posts in this loop. Total unique posts: {len(all_posts)}."
            # )

            if len(all_posts) >= num_posts_to_fetch:
                # print("  - Target number of posts reached.")
                break

        except Exception as e:
            print(f"  - An error occurred while processing requests: {e}")

        scroll_attempts += 1

    final_posts = all_posts
    print(f"--- Scraping finished! Successfully collected metadata for {len(final_posts)} posts. ---")

    # Save the collected posts to files
    save_posts_as_individual_files(final_posts, target_username)
    return scraped_user_info


def save_home_feed_nodes(nodes, cred_username):
    """
    Saves nodes from the home feed into individual JSON files.
    """
    if not nodes:
        return

    for node in nodes:
        try:
            # Identify the media body to extract PKs
            # Checks for Regular Media, Ads, and Explore Stories
            media_data = (
                node.get("media")
                or (node.get("ad") or {}).get("items", [{}])[0]
                or (node.get("explore_story") or {}).get("media")
            )

            if not media_data:
                print(f"  - [Warning] Could not find media body in node: {node.get('__typename')}")
                continue

            # Extract User PK using your preferred logic (user.pk or owner.id)
            user_pk = None
            user_info = media_data.get("user") or media_data.get("owner")

            if user_info:
                user_pk = str(user_info.get("pk") or user_info.get("id"))

            if not user_pk:
                print(f"  - [Warning] Skipping node: Could not find user_pk.")
                continue

            # Path: data/instagram/<user_pk>/posts/
            posts_dir = os.path.join(DATA_FOLDER_PATH, user_pk, "posts")
            os.makedirs(posts_dir, exist_ok=True)

            # Save the FULL node as <post_pk>.json
            post_pk = media_data.get("pk")
            file_path = os.path.join(posts_dir, f"{post_pk}.json")

            with open(file_path, "w", encoding="utf-8") as f:
                json.dump(node, f, ensure_ascii=False, indent=4)

            # Optional: Log the success (can be removed for performance)
            # print(f"    - [Saved] Node {post_pk} to {user_pk}/")
            log_dir = os.path.join(DATA_FOLDER_PATH, "logs")
            log_home_feed_relationship(log_dir, cred_username, post_pk, user_pk)

        except Exception as e:
            print(f"  - [Error] Failed to save node: {str(e)}")

    print(f"--- Finished saving {len(nodes)} nodes ---")


def scrape_home_feed(driver, num_posts_to_fetch, cred_username) -> List[Dict]:
    """
    Scrapes the home feed (timeline) for the currently logged-in account.
    """
    print("\n=== Starting Scrape for Home Feed ===")
    del driver.requests
    driver.get("https://www.instagram.com/")

    try:
        # Wait for the feed articles to load
        WebDriverWait(driver, 15).until(EC.presence_of_element_located((By.XPATH, "//article")))
    except TimeoutException:
        print("  - Error: Home feed didn't load in time.")
        return []

    time.sleep(random.uniform(3, 5))
    click_button_by_text(driver, ["稍後再說", "Not Now"])
    time.sleep(random.uniform(3, 5))

    all_nodes = []
    processed_pks = set()
    processed_request_ids = set()

    while len(all_nodes) < num_posts_to_fetch:
        scroll_down(driver)
        time.sleep(random.uniform(3, 5))

        for req in driver.requests:
            if req.id in processed_request_ids:
                continue
            processed_request_ids.add(req.id)

            # Match the graphql query for timeline connection
            if (
                req.url.startswith("https://www.instagram.com/graphql/query")
                and req.response
                and "xdt_api__v1__feed__timeline__connection" in req.headers.get("x-root-field-name", "")
            ):
                try:
                    response_body = decode(
                        req.response.body, req.response.headers.get("Content-Encoding", "identity")
                    ).decode("utf-8")
                    data = json.loads(response_body)

                    feed_conn = data.get("data", {}).get("xdt_api__v1__feed__timeline__connection", {})
                    edges = feed_conn.get("edges", [])

                    for edge in edges:
                        node = edge.get("node", {})

                        # Identify the media part to get PK and User for storage purposes
                        media_data = (
                            node.get("media")
                            or (node.get("ad") or {}).get("items", [{}])[0]
                            or (node.get("explore_story") or {}).get("media")
                        )

                        if media_data:
                            post_pk = str(media_data.get("pk"))
                            if post_pk and post_pk not in processed_pks:
                                all_nodes.append(node)
                                processed_pks.add(post_pk)

                except Exception:
                    continue

        if len(all_nodes) >= num_posts_to_fetch:
            break

    save_home_feed_nodes(all_nodes, cred_username)

    print(f"--- Scraping finished! Collected {len(all_nodes)} posts from home feed. ---")
    return all_nodes


def run_batch_scrape(usernames: List[str], num_posts: int, credentials_path: str, do_home_feed: bool = False):
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
        if not inject_cookies(driver, "https://www.instagram.com/", credentials.get("cookies_for_selenium", [])):
            print("Login failed. Aborting.")
            return

        base_name = os.path.splitext(os.path.basename(credentials_path))[0]
        cred_username = base_name.replace("ins_cred_", "")
        if do_home_feed:
            print(f"\n[Action] Starting Home Feed scraping (Target: {num_posts} nodes)...")
            try:
                scrape_home_feed(driver, num_posts, cred_username)
                print(f"  - ✓ Home Feed scraping completed for @{cred_username}.")
            except Exception as e:
                print(f"  - ✗ Error during Home Feed scraping @{cred_username}: {e}")

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

    parser.add_argument("-u", "--usernames", nargs="+", help="List of Instagram usernames")
    parser.add_argument("-f", "--file", type=str, help="Path to a text file containing usernames")
    parser.add_argument("-hf", "--home", action="store_true", help="Enable Home Feed (Timeline) scraping")
    parser.add_argument("-n", "--num-posts", type=int, default=12, help="Number of posts to fetch")
    parser.add_argument(
        "-c",
        "--credentials",
        type=str,
        required=True,
        help="Path to the selenium credentials JSON file (e.g., 'ins_cred_user.json').",
    )
    args = parser.parse_args()

    if not args.usernames and not args.file and not args.home:
        parser.error("At least one of --usernames, --file, or --home must be provided.")

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

    print(f"Targets loaded: {len(target_users)} users. Home Feed mode: {args.home}")

    try:
        run_batch_scrape(target_users, args.num_posts, args.credentials, do_home_feed=args.home)
    except KeyboardInterrupt:
        print("\nProcess interrupted by user.")
    except Exception as e:
        print(f"\nAn unexpected error occurred: {e}")
