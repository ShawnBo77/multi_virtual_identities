import os
import sys
import json
import glob
import argparse
from sqlalchemy.orm import Session
from datetime import datetime

# --- Setup paths and imports ---
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))
from app.database import SessionLocal, engine
from app.models import instagram_model, client_model, follow_model

# --- Path Setup ---
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SERVER_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "../.."))
if SERVER_ROOT not in sys.path:
    sys.path.append(SERVER_ROOT)


def import_credentials(as_shared: bool, link_to_client_id: int = None):
    """
    Imports credential JSON files into the database.

    Args:
        as_shared (bool): If True, sets 'is_shared' flag on all imported credentials.
        link_to_client_id (int, optional): If provided, links all imported credentials
                                           to this client ID.
    """
    print("--- Starting Credential Import ---")

    # Ensure database tables are created
    instagram_model.Base.metadata.create_all(bind=engine)
    client_model.Base.metadata.create_all(bind=engine)

    db = SessionLocal()

    # Check if client exists if client_id is provided
    target_client = None
    if link_to_client_id:
        target_client = db.query(client_model.Client).filter_by(id=link_to_client_id).first()
        if not target_client:
            print(f"Error: Client with ID {link_to_client_id} not found. Aborting.")
            db.close()
            return

    # Define JSON file paths
    # Assuming structure is server/scraper/instagram/ins_cred_*.json
    json_pattern = os.path.join(SCRIPT_DIR, "ins_cred_*.json")

    files = glob.glob(json_pattern)

    if not files:
        print(f"No credential files matching 'ins_cred_*.json' found in: {SCRIPT_DIR}")
        db.close()
        return

    print(f"Found {len(files)} credential files.")

    imported_count = 0
    updated_count = 0
    linked_count = 0

    try:
        for filepath in files:
            filename = os.path.basename(filepath)

            # Parse username from filename: "ins_cred_test_user.json" -> "test_user"
            username = filename.replace("ins_cred_", "").replace(".json", "")

            try:
                with open(filepath, "r", encoding="utf-8") as f:
                    data = json.load(f)

                cookies = data.get("cookies_for_selenium")
                user_agent = data.get("user_agent")

                if not cookies or not user_agent:
                    print(f"  - [Skipped] {filename}: Missing 'cookies_for_selenium' or 'user_agent'.")
                    continue

                # Check if credential already exists
                existing_cred = db.query(instagram_model.InstagramCredential).filter_by(username=username).first()

                if existing_cred:
                    # Update existing data
                    existing_cred.cookies = cookies
                    existing_cred.user_agent = user_agent
                    # Since we are importing a valid cookie, mark it as SUCCESS
                    existing_cred.status = instagram_model.CredentialStatus.SUCCESS
                    existing_cred.last_used_at = datetime.utcnow()
                    existing_cred.is_shared = as_shared  # Update shared status

                    print(f"  - [Updated] {username}")
                    updated_count += 1
                    cred_to_link = existing_cred
                else:
                    # Create new data (Insert)
                    new_cred = instagram_model.InstagramCredential(
                        username=username,
                        cookies=cookies,
                        user_agent=user_agent,
                        status=instagram_model.CredentialStatus.SUCCESS,  # Assume valid since file exists
                        is_shared=as_shared,
                        last_used_at=datetime.utcnow(),
                    )
                    db.add(new_cred)
                    db.flush()  # Flush to get the ID for linking
                    print(f"  - [Imported] {username}")
                    imported_count += 1
                    cred_to_link = new_cred

                # Link to client if requested
                if target_client and cred_to_link not in target_client.instagram_accounts:
                    target_client.instagram_accounts.append(cred_to_link)
                    print(f"    - [Linked] to Client ID {link_to_client_id}")
                    linked_count += 1

            except Exception as e:
                print(f"  - [Error] Failed to process {filename}: {e}")

        db.commit()
        print("\n--- Import Finished ---")
        print(f"New Imported: {imported_count}")
        print(f"Updated: {updated_count}")
        if link_to_client_id:
            print(f"Linked to Client {link_to_client_id}: {linked_count}")

    except Exception as e:
        print(f"Critical Error during import: {e}")
        db.rollback()
    finally:
        db.close()


if __name__ == "__main__":
    # Setup command-line argument parsing
    parser = argparse.ArgumentParser(description="Import Instagram credential JSON files to the database.")
    parser.add_argument(
        "--shared", dest="as_shared", action="store_true", help="Set all imported credentials as shared accounts."
    )
    parser.add_argument("--client-id", type=int, help="Link all imported credentials to a specific client ID.")
    args = parser.parse_args()

    import_credentials(as_shared=args.as_shared, link_to_client_id=args.client_id)
