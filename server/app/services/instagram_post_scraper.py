import time
import random
import threading
import traceback
from datetime import datetime, timedelta
from typing import Optional
from sqlalchemy.orm import Session
from app.models import instagram_model
from app.services import instagram_service
from app.database import SessionLocal
from seleniumwire import webdriver
from selenium.webdriver.firefox.service import Service as FirefoxService
from selenium.webdriver.common.by import By
from webdriver_manager.firefox import GeckoDriverManager

from scraper.instagram.browser_utils import verify_login_status
from scraper.instagram.scrape_metadata import scrape_single_user, inject_cookies
from scraper.instagram.download_media import download_media_for_user
from scraper.instagram.import_data_to_db import import_data_for_specific_user


class InstagramPostScraper:
    def __init__(self):
        self._stop_event = threading.Event()
        self._thread = None
        self.driver = None
        self.current_cred_username = None
        self.current_cred_id = None

        # Configuration
        self.scrape_counter = 0
        self.RESTART_BROWSER_EVERY = 5  # Restart browser after N users to prevent memory leaks
        self.USER_COOLDOWN_HOURS = 24  # Cooldown before re-scraping a user

    def start(self):
        """Starts the background post scraper scraping thread."""
        if self._thread and self._thread.is_alive():
            return

        print("[PostScraper] Starting auto-scraper service...")
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._run_loop, daemon=True)
        self._thread.start()

    def stop(self):
        """Signals the thread to stop and waits for it to finish."""
        print("[PostScraper] Stopping auto-scraper service...")
        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=10)
        self._close_browser()
        print("[PostScraper] Auto-scraper stopped.")

    def _ensure_browser_for_credential(self, cred_id: Optional[int] = None):
        """
        Ensures the browser is open and logged in with the desired credential.
        1. If cred_id is None, and we have a browser open, keep using it.
        2. If cred_id is None, and no browser, pick random.
        3. If cred_id is provided, and current browser matches, keep using it.
        4. If cred_id is provided, but current browser differs, RESTART with desired.
        """

        # Browser exists and matches requirement
        if self.driver is not None:
            if cred_id is None and verify_login_status(self.driver):
                return True
            if self.current_cred_id == cred_id and verify_login_status(self.driver):
                return True

        # Need to switch or start fresh
        self._close_browser()

        db = SessionLocal()
        cred_obj = None
        try:
            if cred_id:
                # Try to get the specific sticky credential
                cred_obj = instagram_service.get_credential_by_id(db, cred_id)
                if not cred_obj:
                    print(f"[PostScraper] ⚠ Sticky credential ID {cred_id} not found/inactive.")

            # Fallback or Random request
            if not cred_obj:
                cred_obj = instagram_service.get_random_available_credential(db)

        finally:
            db.close()

        if not cred_obj:
            print("[PostScraper] ✗ No active credentials available!")
            return False

        # Start Selenium
        self.current_cred_id = cred_obj.id
        self.current_cred_username = cred_obj.username
        user_agent = cred_obj.user_agent

        print(f"[PostScraper] Initializing Browser with identity: {self.current_cred_username}")
        try:
            service = FirefoxService(GeckoDriverManager().install())
            options = webdriver.FirefoxOptions()
            # options.add_argument("--headless")
            if user_agent:
                options.set_preference("general.useragent.override", user_agent)
            options.set_preference("dom.webdriver.enabled", False)
            options.set_preference("useAutomationExtension", False)

            self.driver = webdriver.Firefox(service=service, options=options)

            cookies = cred_obj.cookies if cred_obj.cookies else []
            if not inject_cookies(self.driver, "https://www.instagram.com/", cookies) or not verify_login_status(
                self.driver
            ):
                print(f"[PostScraper] Login failed for {self.current_cred_username}.")
                with SessionLocal() as db:
                    instagram_service.update_credential_status(
                        db, self.current_cred_id, status=instagram_model.CredentialStatus.PENDING
                    )
                self._close_browser()
                return False

            if not user_agent:
                current_user_agent = self.driver.execute_script("return navigator.userAgent;")
                current_cookies = self.driver.get_cookies()
                with SessionLocal() as db:
                    instagram_service.update_credential_session(
                        db, self.current_cred_id, {"user_agent": current_user_agent, "cookies": current_cookies}
                    )

            return True

        except Exception as e:
            print(f"[PostScraper] Browser launch failed: {e}")
            self._close_browser()
            return False

    def _update_cookies_in_db(self):
        if not self.driver or not self.current_cred_id:
            return
        try:
            db = SessionLocal()
            current_cookies = self.driver.get_cookies()
            instagram_service.update_credential_session(db, self.current_cred_id, current_cookies)
            db.close()
        except Exception as e:
            print(f"[PostScraper] Failed to update cookies in DB: {e}")

    def _close_browser(self):
        """Safely closes the browser instance."""
        if self.driver:
            try:
                self.driver.quit()
            except Exception:
                pass
            finally:
                self.driver = None
                self.current_cred_id = None
                self.current_cred_username = None

    def _get_next_user_to_scrape(self, db: Session) -> Optional[instagram_model.InstagramUser]:
        """
        Determines the next user to scrape based on 'last_scraped_at' timestamp.
        Priority:
        1. Users never scraped (last_scraped_at is None).
        2. Users scraped longer than USER_COOLDOWN_HOURS ago.
        """
        cooldown_time = datetime.utcnow() - timedelta(hours=self.USER_COOLDOWN_HOURS)

        # New users
        user = (
            db.query(instagram_model.InstagramUser)
            .filter(instagram_model.InstagramUser.last_scraped_at.is_(None))
            .first()
        )

        if not user:
            # Oldest scraped users outside cooldown
            user = (
                db.query(instagram_model.InstagramUser)
                .filter(instagram_model.InstagramUser.last_scraped_at < cooldown_time)
                .order_by(instagram_model.InstagramUser.last_scraped_at.asc())
                .first()
            )

        return user

    def _run_loop(self):
        """The execution loop for the background post scraper service."""
        print("[PostScraper] Post scraper service started.")

        while not self._stop_event.is_set():
            db = SessionLocal()
            try:
                target_user = self._get_next_user_to_scrape(db)

                if not target_user:
                    print("[PostScraper] No users need to scrape. Sleep 1 min.")
                    self._wait(60)
                    continue

                username = target_user.username
                sticky_cred_id = instagram_service.get_last_successful_credential_id(db, target_user.id)

                if sticky_cred_id:
                    print(f"\n[PostScraper] >>> Processing Task: {username} (Credential ID: {sticky_cred_id}) <<<")
                else:
                    print(f"\n[PostScraper] >>> Processing Task: {username} (Any Credential) <<<")

                # Prepare Browser (Switches only if necessary)
                if not self._ensure_browser_for_credential(sticky_cred_id):
                    print("[PostScraper] Could not initialize browser. Sleeping 5 mins.")
                    self._wait(300)
                    continue

                # Perform Scrape
                scraped_user_info = None
                try:
                    scraped_user_info = scrape_single_user(self.driver, username, num_posts_to_fetch=5)
                    self._update_cookies_in_db()
                except Exception as e:
                    print(f"[PostScraper] Error scraping {username}: {e}")
                    # Log failure
                    if target_user.id:
                        instagram_service.create_scrape_log(
                            db, target_user.id, self.current_cred_id, status=instagram_model.ScrapeStatus.FAILED
                        )

                    # Force browser close on error to be safe
                    self._close_browser()
                    self._wait(10)
                    continue

                # Sync user
                if scraped_user_info and scraped_user_info.get("pk"):
                    print(f"[PostScraper] Syncing user data for @{scraped_user_info.get('username')}...")
                    target_user = instagram_service.update_user_from_data(db, scraped_user_info)
                else:
                    print(
                        f"[PostScraper] ⚠ Scrape did not return user info for {username}. Might be a private/empty identity. Skipping download."
                    )
                    if target_user.id:
                        instagram_service.create_scrape_log(
                            db, target_user.id, self.current_cred_id, status=instagram_model.ScrapeStatus.FAILED
                        )
                    continue

                # Download and Import Media (Using PK)
                if target_user and target_user.pk:
                    print(f"[PostScraper] Downloading media for {target_user.username} (PK: {target_user.pk})...")
                    download_media_for_user(target_user.pk)

                    print("[PostScraper] Import posts and media paths...")
                    import_data_for_specific_user(db, target_user.pk)

                    # Update timestamp
                    target_user.last_scraped_at = datetime.utcnow()
                    instagram_service.create_scrape_log(
                        db, target_user.id, self.current_cred_id, status=instagram_model.ScrapeStatus.SUCCESS
                    )
                    db.commit()
                    print(f"[PostScraper] ✓ Task complete for {target_user.username}.")
                else:
                    print(f"[PostScraper] ⚠ Could not determine PK for {username}. Updating timestamp to skip.")
                    target_user.last_scraped_at = datetime.utcnow()

                    if target_user.id:
                        instagram_service.create_scrape_log(
                            db, target_user.id, self.current_cred_id, status=instagram_model.ScrapeStatus.NO_PK_FOUND
                        )

                    db.commit()

                # Cleanup and Sleep
                self.scrape_counter += 1
                if self.scrape_counter >= self.RESTART_BROWSER_EVERY:
                    print("[PostScraper] Restarting browser to free resources...")
                    self._close_browser()
                    self.scrape_counter = 0

                sleep_time = random.uniform(45, 90)
                print(f"[PostScraper] Sleeping for {sleep_time:.1f}s...")
                self._wait(sleep_time)

            except Exception as e:
                print(f"[PostScraper] Unexpected error in loop: {e}")
                traceback.print_exc()
                self._wait(60)
            finally:
                db.close()

    def _wait(self, seconds):
        """Sleep wrapper that can be interrupted by the stop event."""
        self._stop_event.wait(seconds)


instagram_post_scraper = InstagramPostScraper()
