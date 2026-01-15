import os
import sys
import json
import glob
from sqlalchemy.orm import Session

# --- Path Setup ---
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SERVER_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "../.."))
if SERVER_ROOT not in sys.path:
    sys.path.append(SERVER_ROOT)

from app.database import SessionLocal, engine
from app.models import instagram_model

def import_credentials():
    print("--- Starting Credential Import ---")
    
    # Ensure database tables are created
    instagram_model.Base.metadata.create_all(bind=engine)
    
    db = SessionLocal()
    
    # Define JSON file paths
    # Assuming structure is server/scraper/instagram/ins_cred_*.json
    json_pattern = os.path.join(SCRIPT_DIR, "ins_cred_*.json")
    
    files = glob.glob(json_pattern)
    
    if not files:
        print(f"No credential files found in: {SCRIPT_DIR}")
        return

    print(f"Found {len(files)} credential files.")
    
    imported_count = 0
    updated_count = 0

    try:
        for filepath in files:
            filename = os.path.basename(filepath)
            
            # Parse username from filename: "ins_cred_abc.json" -> "abc"
            username = filename.replace("ins_cred_", "").replace(".json", "")
            
            try:
                with open(filepath, "r", encoding="utf-8") as f:
                    data = json.load(f)
                
                cookies = data.get("cookies_for_selenium")
                user_agent = data.get("user_agent")
                
                if not cookies or not user_agent:
                    print(f"  - [Skipped] {filename}: Missing cookies or user_agent.")
                    continue
                
                # Check if credential already exists in database
                existing_cred = db.query(instagram_model.InstagramCredential).filter(
                    instagram_model.InstagramCredential.username == username
                ).first()
                
                if existing_cred:
                    # Update existing data
                    existing_cred.cookies = cookies
                    existing_cred.user_agent = user_agent
                    existing_cred.is_active = True # Set to Active upon re-import
                    print(f"  - [Updated] {username}")
                    updated_count += 1
                else:
                    # Create new data (Insert)
                    new_cred = instagram_model.InstagramCredential(
                        username=username,
                        cookies=cookies,
                        user_agent=user_agent,
                        is_active=True
                    )
                    db.add(new_cred)
                    print(f"  - [Imported] {username}")
                    imported_count += 1
                    
            except Exception as e:
                print(f"  - [Error] Failed to process {filename}: {e}")

        db.commit()
        print("\n--- Import Finished ---")
        print(f"New Imported: {imported_count}")
        print(f"Updated: {updated_count}")
        
    except Exception as e:
        print(f"Critical Error during import: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    import_credentials()