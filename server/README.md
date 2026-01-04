# Backend Server

This is a backend server built with FastAPI, designed to support a browser extension. It acts as a centralized database for caching Instagram posts and manages an anonymous user following system.

## ⚡ Start Server

Use `uvicorn` to start the development server with live reloading:

```bash
uvicorn app.main:app --reload
```

The server will start running at `http://127.0.0.1:8000`.

## 🧪 Test API

Once the server is running, you can access the interactive API documentation to test endpoints directly from your browser:

*   **Swagger UI**: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
*   **ReDoc**: [http://127.0.0.1:8000/redoc](http://127.0.0.1:8000/redoc)

## 🛠 Tech Stack

*   **Framework**: FastAPI
*   **ORM**: SQLAlchemy
*   **Database**: SQLite
*   **Validation**: Pydantic
*   **Server**: Uvicorn