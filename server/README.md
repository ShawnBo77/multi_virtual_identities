# Backend Server

This system is a backend framework built with FastAPI and integrated with Selenium Wire automated scrapers. It acts as a centralized database for caching Instagram post data, downloading raw media files (images/videos) to local storage, and tracking targets anonymously.

## ⚠️ Disclaimer & Warnings

1.  **Ban Risk**: Scraping violates Instagram's Terms of Service. **ALWAYS use a testing account .** Do not use your primary personal account.
2.  **Rate Limits**: Do not scrape too much data at once. High-frequency requests will lead to account locking or forced logout.
3.  **Maintenance**: Instagram frequently updates its web architecture. This scraper may break and require updates.

## 📂 Project Structure

```text
server
│  pyproject.toml
│  README.md
│  requirements.txt
│  sql_app.db
│
├─app
│  │  database.py
│  │  main.py                <-- Server Entry Point (Enable background scraper here)
│  │
│  ├─models/                 <-- SQLAlchemy Database Models
│  ├─routers/                <-- API Endpoints
│  ├─schemas/                <-- Pydantic Schemas
│  └─services/               <-- Business Logic & Background Scraper Class
│
└─scraper
    └─instagram
           download_media.py      <-- Download Images/Videos
           import_creds_to_db.py  <-- Import JSON Cookies to DB
           import_data_to_db.py   <-- Import Scraped Data to DB
           ins_cookie_catcher.py  <-- Login & Capture Cookies
           scrape_metadata.py     <-- Scrape Post JSON Data
```

## 📥 Installation & Setup

Ensure you have the Firefox browser installed on your machine, as the automated Selenium scripts utilize Firefox defaults.

Install all required packages:

```bash
pip install -r requirements.txt
```

**Dependency Issues**:

```bash
pip freeze > installation.txt
pip uninstall -r installation.txt -y
pip install -r requirements.txt
```

---

## ⚡ Start the FastAPI Server

Run the following command in your terminal:

```bash
uvicorn app.main:app --reload
```

- **Host Address**: The server launches locally at `http://127.0.0.1:8000`.
- **Swagger UI Docs**: Open [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs) to visually review and test database API routers.
- **Proxy Server**: Spawns automatically on port `8888` via the lifespan thread setup.

---

## Part A: Automated Background Workflow

This option allows the system to completely automate session cookie extraction, cookie lifecycle maintenance, and scheduled post scraping.

### 1. Enable Background Services

Open `app/main.py`. Locate the server `lifespan` definition and uncomment the execution handles to let the server manage their lifecycles:

```python
@contextlib.asynccontextmanager
async def lifespan(app: FastAPI):
    print("--- Server Starting: Launching Background Scraper ---")
    proxy_task = asyncio.create_task(start_proxy_server(host="0.0.0.0", port=8888))

    # UNCOMMENT THESE LINES TO ENABLE AUTO-BACKGROUND WORK:
    instagram_credential_scraper.start()
    instagram_post_scraper.start()
    instagram_home_feed_scraper.start()

    yield

    print("--- Server Stopping: Shutting down Scraper ---")
    proxy_task.cancel()
    # UNCOMMENT THESE LINES FOR GRACEFUL SHUTDOWNS:
    instagram_credential_scraper.stop()
    instagram_post_scraper.stop()
    instagram_home_feed_scraper.stop()

```

### 2. How the Automated Cookie Extraction Works

Once the server is running with `instagram_credential_scraper.start()` active:

- **Automatic Detection**: When a new credential row with a password is added to the database, or an existing session expires, its status becomes **PENDING**. The background service detects it every 60 seconds and launches a Firefox browser window to handle the login.

- **Manual Intervention**: If Instagram triggers a CAPTCHA or 2FA checkpoint during this auto-login, the terminal will pause. Simply complete the login manually inside the popped-up Firefox window until you see the Home feed, then press **[Enter]** in the terminal prompt (`>>> Once you are on the Home page, press [Enter] here to continue <<<`). The service will automatically grab the new cookies and update the database token status to SUCCESS.

---

## Part B: Manual Workflow

If you prefer granular control over execution without background server automation loops, you can chain these standalone command-line utilities step-by-step. (Go to `scraper/instagram/`)

### 1. Extract Session Cookies Manually (`ins_cookie_catcher.py`)

- **Execution**:

```bash
  python ins_cookie_catcher.py
```

- **Workflow**: Enter your dummy account credentials. If flagged by checkpoints, complete the login manually in the Firefox window, then press **[Enter]** in your terminal to output the `ins_cred_{username}.json` file.

### 2. Import Local Credentials to DB (`import_creds_to_db.py`)

- **Execution**:

```bash
  python import_creds_to_db.py
```

- **Arguments**:
    - `--shared`: Marks the identity as a shared identity usable by general query tasks.
    - `--client-id [ID]`: Explicitly links the credentials to a specific client profile.

### 3. Scrape Post Metadata (`scrape_metadata.py`)

- **Purpose**: Uses your active database credentials to access target public profiles and intercepts underlying GraphQL network payloads to capture post.

- **Commands**:

```bash
  # Example: Scrape the latest posts from a specific target user
  python scrape_metadata.py -u target_user_abc -c ins_cred_example.json

  # Example: Scrape your own account feed timeline
  python scrape_metadata.py -hf -c ins_cred_example.json
```

- **Arguments**:
- `-u, --usernames`: One or more target handles to parse.
- `-f, --file`: Path to a text file containing target usernames (one per line).
- `-hf, --home`: Enables Home Feed Mode to scrape the account's own timeline feed.
- `-n, --num-posts`: Max count of unique posts to pull (default is 12).
- `-c, --credentials`: Path to your captured credential file from Step 2.

- **Output Destination**: `data/instagram/{user_pk}/posts/{post_pk}.json`.

### 4. Download Static Assets (`download_media.py`)

- **Purpose**: Instagram image/video source URLs in JSON metadata expire quickly. This script reads the saved JSON directories and downloads permanent physical files to your local disk.

- **Commands**:

```bash
  # Example: Download all video/image files and profile pictures for a specific User PK folder
  python download_media.py 34575745

  # Example: Download all media in data/instagram/
  python download_media.py --all
```

- **Arguments**:
- `target_user_pk`: Matches the unique User ID folder name inside data/instagram/.
- `-p, --posts`: Narrows downloading explicitly to specific listed post PK keys.
- `-a, --all`: Global Sync Mode. Automatically loops through all user directories to download missing assets.

- **Output Destination**: Saved under static directory paths: `media/instagram/{user_pk}/{post_pk}/`.

### 5. Database Sync (`import_data_to_db.py`)

- **Commands**:

```bash
  # Example: Full directory scan to build index records for all items
  python import_data_to_db.py

  # Example: Reconstruct the relation of the credentials and home feeds
  python import_data_to_db.py -rc
```

- **Arguments**:
- `-u, --user_pk`: Syncs entries exclusively for a chosen user UID directory.
- `-rc, --reconstruct`: Reads local discovery CSV parameters to map structural home feed history configurations.

## 🛠 Tech Stack

- **Framework**: FastAPI
- **ORM**: SQLAlchemy
- **Database**: SQLite
- **Validation**: Pydantic
- **Server**: Uvicorn
