import time
import random
import threading
from app.models import instagram_model
from app.services import instagram_service
from app.database import SessionLocal
from seleniumwire import webdriver
from selenium.webdriver.firefox.service import Service as FirefoxService
from webdriver_manager.firefox import GeckoDriverManager

from scraper.instagram.browser_utils import verify_login_status
from scraper.instagram.scrape_metadata import scrape_home_feed, inject_cookies
from scraper.instagram.download_media import download_specific_posts_for_user
from scraper.instagram.import_data_to_db import import_data_for_specific_user
from scraper.instagram.json_utils import extract_media_payload

FAIL_KEYWORDS = ["login", "challenge", "two_factor", "checkpoint", "suspend", "consent", "contact", "reset"]


class InstagramHomeFeedScraper:
    def __init__(self):
        self._stop_event = threading.Event()
        self._thread = None
        self.driver = None
        self.SCRAPE_INTERVAL = 3600  # Scrape each eligible identity once per hour

    def start(self):
        if self._thread and self._thread.is_alive():
            return
        print("[HomeScraper] Starting background Home Feed service...")
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._run_loop, daemon=True)
        self._thread.start()

    def stop(self):
        """Signals the thread to stop and cleans up resources."""
        print("[HomeScraper] Stopping service and releasing resources...")
        self._stop_event.set()

        self._close_browser()

        if self._thread:
            self._thread.join(timeout=10)
            print("[HomeScraper] Thread joined.")

    def _close_browser(self):
        """Safely closes the browser instance."""
        if self.driver:
            try:
                self.driver.quit()
            except Exception as e:
                print(f"  - [Error] Failed to close WebDriver: {e}")
            finally:
                self.driver = None

    def _ensure_browser(self, cred):
        """
        Maintains the browser instance and performs authentication.
        Returns a status string indicating the result of the operation.
        """
        try:
            # Check if the current driver is still alive
            if self.driver:
                try:
                    _ = self.driver.current_url
                except Exception:
                    # Reset driver if it's no longer responsive
                    self.driver = None

            # Launch a new instance if necessary
            if not self.driver:
                service = FirefoxService(GeckoDriverManager().install())
                options = webdriver.FirefoxOptions()
                # options.add_argument("--headless")

                if cred.user_agent:
                    options.set_preference("general.useragent.override", cred.user_agent)
                options.set_preference("dom.webdriver.enabled", False)
                options.set_preference("useAutomationExtension", False)

                self.driver = webdriver.Firefox(service=service, options=options)

            # Inject cookies for the target identity
            cookies = cred.cookies or []
            if not inject_cookies(self.driver, "https://www.instagram.com/", cookies) or not verify_login_status(
                self.driver
            ):
                print(f"[HomeScraper] Login failed for {cred.username}.")
                with SessionLocal() as db:
                    instagram_service.update_credential_status(
                        db, self.current_cred_id, status=instagram_model.CredentialStatus.PENDING
                    )
                return False

            if not cred.user_agent:
                current_user_agent = self.driver.execute_script("return navigator.userAgent;")
                current_cookies = self.driver.get_cookies()
                with SessionLocal() as db:
                    instagram_service.update_credential_session(
                        db, cred.id, {"user_agent": current_user_agent, "cookies": current_cookies}
                    )

            return True

        except Exception as e:
            # Log any driver-related critical errors
            print(f"  - [Critical] Browser error for @{cred.username}: {e}")
            if self.driver:
                try:
                    self.driver.quit()
                except:
                    pass
                self.driver = None
            return False

    def _run_loop(self):
        """The execution loop for the background home feed scraper service."""
        print("[HomeScraper] Home feed scraper service started.")
        try:
            while not self._stop_event.is_set():
                db = SessionLocal()
                try:
                    # Get identities where at least one user has enabled 'Sync Feed'
                    eligible_creds = (
                        db.query(instagram_model.InstagramCredential)
                        .join(instagram_model.ClientInstagramCredential)
                        .filter(
                            instagram_model.InstagramCredential.status == instagram_model.CredentialStatus.SUCCESS,
                            instagram_model.ClientInstagramCredential.fetch_feed == True,
                        )
                        .distinct()
                        .all()
                    )

                    for cred in eligible_creds:
                        if self._stop_event.is_set():
                            break

                        print(f"[HomeScraper] >>> Scraping Home Feed for @{cred.username}")

                        if not self._ensure_browser(cred):
                            print("[HomeScraper] Could not initialize browser. Sleeping 3 mins.")
                            self._wait(180)
                            continue

                        posts = scrape_home_feed(self.driver, 1, cred.username)
                        self._process_posts(db, cred.id, posts)

                        time.sleep(random.uniform(60, 120))  # Delay between identities

                finally:
                    db.close()
                print("[HomeScraper] Home feed scraper sleep for 5 mins.")
                self._stop_event.wait(300)
        finally:
            self._close_browser()

    def _process_posts(self, db, cred_id, posts):
        """Reuses existing download and import services."""
        for post_data in posts:
            media_payload = extract_media_payload(post_data)
            user_info = media_payload.get("user") or media_payload.get("owner")
            user_pk = str(user_info.get("pk")) or str(user_info.get("id"))

            # Download media to local storage
            download_specific_posts_for_user(user_pk, [media_payload.get("pk")])

            # Import into SQL database
            import_data_for_specific_user(db, user_pk)

            # Associate post with the Home Feed of this specific credential
            post = instagram_service.get_post_by_pk(db, media_payload.get("pk"))
            instagram_service.link_post_to_home_feed(db, cred_id, post.id)


instagram_home_feed_scraper = InstagramHomeFeedScraper()
