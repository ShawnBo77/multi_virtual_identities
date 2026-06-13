import os
import contextlib
import asyncio
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from .database import engine
from .models import client_model, follow_model, instagram_model
from .routers import client_router, follow_router, instagram_router
from .services.instagram_credential_scraper import instagram_credential_scraper
from .services.instagram_post_scraper import instagram_post_scraper
from .services.instagram_home_feed_scraper import instagram_home_feed_scraper
from app.proxy_service import start_proxy_server

# Create all tables
client_model.Base.metadata.create_all(bind=engine)
follow_model.Base.metadata.create_all(bind=engine)
instagram_model.Base.metadata.create_all(bind=engine)


@contextlib.asynccontextmanager
async def lifespan(app: FastAPI):
    print("--- Server Starting: Launching Background Scraper ---")
    proxy_task = asyncio.create_task(start_proxy_server(host="0.0.0.0", port=8888))
    # instagram_credential_scraper.start()
    # instagram_post_scraper.start()
    # instagram_home_feed_scraper.start()

    yield

    print("--- Server Stopping: Shutting down Scraper ---")
    proxy_task.cancel()
    # instagram_credential_scraper.stop()
    # instagram_post_scraper.stop()
    # instagram_home_feed_scraper.stop()


app = FastAPI(lifespan=lifespan)

APP_DIR = os.path.dirname(os.path.abspath(__file__))

SERVER_ROOT = os.path.dirname(APP_DIR)

STATIC_FILES_DIR = os.path.join(SERVER_ROOT, "media")

app.mount("/media", StaticFiles(directory=STATIC_FILES_DIR), name="media")

print(f"--- Serving media files from: {STATIC_FILES_DIR} ---")

origins = ["*"]

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

# Include routers
app.include_router(instagram_router.router, prefix="/instagram", tags=["Instagram"])
app.include_router(client_router.router, prefix="", tags=["Client"])
app.include_router(follow_router.router, prefix="", tags=["Followings"])


@app.get("/")
def read_root():
    return {"message": "Server is running"}
