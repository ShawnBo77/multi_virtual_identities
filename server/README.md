# Backend Server & Instagram Scraper

This is a backend server built with FastAPI, designed to act as a centralized database for caching Instagram posts and managing an anonymous user following system. It includes a built-in scraper that can run in the background (integrated with the server) or be executed manually via CLI scripts.

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

## 📦 Installation

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

## Step 1: Get Instagram Cookies (Required)

Before using either the automated or manual mode, you must capture a valid login session.

1.  Run the cookie catcher script:
    ```bash
    python scraper/instagram/ins_cookie_catcher.py
    ```
2.  Enter the credentials of your **dummy account** when prompted in the terminal.
3.  A Firefox browser will open and attempt to log in automatically. Once successful, a file named `ins_cred_{username}.json` will be generated.

**⚠️ Troubleshooting / Manual Login:**
If the automated login fails (e.g., due to CAPTCHA, Two-Factor Authentication, or "Suspicious Activity" checkpoints), the script will pause and prompt you in the terminal.
1.  Go to the opened Firefox window.
2.  **Manually complete the login process** (solve the puzzle or enter the 2FA code) until you successfully reach the Instagram Home feed.
3.  Return to your terminal and press **[Enter]** to resume the cookie capture process.
---

## Mode A: Automated Background Scraping

This mode stores credentials in the database and automatically scrapes target users in the background while the server runs.

### 1. Import Credentials to Database
Import the JSON cookie file generated in Step 1 into the SQLite database:

```bash
python scraper/instagram/import_creds_to_db.py
```

### 2. Enable the Background Scraper
Open `app/main.py`. You need to **uncomment** the `lifespan` function and replace the simple `app = FastAPI()` line.

**Change this:**
```python
# @contextlib.asynccontextmanager
# async def lifespan(app: FastAPI):
#     ...
#     instagram_scraper.start()
#     ...
#     instagram_scraper.stop()

# app = FastAPI(lifespan=lifespan)
app = FastAPI() 
```

**To this:**
```python
@contextlib.asynccontextmanager
async def lifespan(app: FastAPI):
    print("--- Server Starting: Launching Background Scraper ---")
    instagram_scraper.start()
    
    yield
    
    print("--- Server Stopping: Shutting down Scraper ---")
    instagram_scraper.stop()

app = FastAPI(lifespan=lifespan)
```

### 3. Start Server
Run the server. The scraper will now run in the background.

```bash
uvicorn app.main:app
```

---

## Mode B: Manual Workflow (CLI)

If you prefer to control the process step-by-step without running the server background task:

**1. Scrape Metadata (JSON)**
Fetch post data for a specific user.
```bash
# Usage: python scraper/instagram/scrape_metadata.py -u [TARGET_USERNAME] -c [CREDENTIAL_FILE]
python scraper/instagram/scrape_metadata.py -u target_user -c scraper/instagram/ins_cred_test.json
```
*   Data saves to: `data/instagram/{user_pk}/posts/`

**2. Download Media**
Download images and videos based on the scraped JSON.
```bash
# Usage: python scraper/instagram/download_media.py [USER_PK_FOLDER_NAME]
python scraper/instagram/download_media.py 123456789
```
*   Media saves to: `media/instagram/{user_pk}/`

**3. Import to Database**
Map the downloaded files and JSON data into the database.
```bash
# Usage: python scraper/instagram/import_data_to_db.py -u [USER_PK]
python scraper/instagram/import_data_to_db.py -u 123456789
```

## ⚡ Start Server

To run the backend server, use `uvicorn`:

```bash
uvicorn app.main:app
```

*   `uvicorn`: The ASGI server that runs your FastAPI application.
*   `app.main`: Specifies the Python module (`main.py` inside the `app` directory).
*   `:app`: Refers to the FastAPI application instance named `app` within the `app.main` module.

For development purposes, you can add the `--reload` flag:

```bash
uvicorn app.main:app --reload
```
*   `--reload`: This flag enables auto-reloading. The server will automatically detect changes in your code and restart.

The server will start running at `http://127.0.0.1:8000`.

## 🧪 Test API

Once the server is running, you can access the interactive documentation:

*   **Swagger UI**: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
*   **ReDoc**: [http://127.0.0.1:8000/redoc](http://127.0.0.1:8000/redoc)

## 🛠 Tech Stack

*   **Framework**: FastAPI
*   **ORM**: SQLAlchemy
*   **Database**: SQLite
*   **Validation**: Pydantic
*   **Server**: Uvicorn