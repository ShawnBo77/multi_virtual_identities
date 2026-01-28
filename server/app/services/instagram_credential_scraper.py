import time
import threading
from app.database import SessionLocal
from app.services import instagram_service
from app.models import instagram_model
from scraper.instagram.ins_cookie_catcher import login_and_get_cookies


class InstagramCredentialScraper:
    def __init__(self):
        self._stop_event = threading.Event()
        self._thread = None
        self.CHECK_INTERVAL = 60  # Check every 60 seconds

    def start(self):
        if self._thread and self._thread.is_alive():
            return
        print("[CredScraper] Starting credential maintenance service...")
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._run_loop, daemon=True)
        self._thread.start()

    def stop(self):
        print("[CredScraper] Stopping credential service...")
        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=10)

    def _run_loop(self):
        while not self._stop_event.is_set():
            self._process_pending_accounts()
            self._wait(self.CHECK_INTERVAL)

    def _process_pending_accounts(self):
        db = SessionLocal()
        try:
            # Find all accounts with PENDING status
            pending_creds = (
                db.query(instagram_model.InstagramCredential)
                .filter(instagram_model.InstagramCredential.status == instagram_model.CredentialStatus.PENDING)
                .all()
            )

            if not pending_creds:
                return

            print(f"[CredScraper] Found {len(pending_creds)} accounts needing login...")

            for cred in pending_creds:
                if self._stop_event.is_set():
                    break

                print(f"\n[CredScraper] >>> Catching: {cred.username} <<<")

                if not cred.password:
                    print("  - No password. Marking as LOGIN_FAILED.")
                    instagram_service.update_credential_status(
                        db, cred.id, instagram_model.CredentialStatus.LOGIN_FAILED
                    )
                    continue

                # Login (headless=False to allow manual intervention)
                try:
                    result_data = login_and_get_cookies(
                        username=cred.username, password=cred.password, driver=None, headless=False
                    )

                    if result_data:
                        # Update status to SUCCESS
                        instagram_service.update_credential_session(db, cred.id, result_data)
                        print("  - ✓ Account restored.")
                    else:
                        # Mark status as LOGIN_FAILED
                        print("  - ✗ Login failed.")
                        instagram_service.update_credential_status(
                            db, cred.id, instagram_model.CredentialStatus.LOGIN_FAILED
                        )

                except Exception as e:
                    print(f"  - Error processing {cred.username}: {e}")

                time.sleep(10)

        finally:
            db.close()

    def _wait(self, seconds):
        self._stop_event.wait(seconds)


instagram_credential_scraper = InstagramCredentialScraper()
