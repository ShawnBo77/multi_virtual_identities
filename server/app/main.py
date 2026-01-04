import os
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from .database import engine
from .models import client_model, follow_model, instagram_model
from .routers import client_router, follow_router, instagram_router

# Create all tables
client_model.Base.metadata.create_all(bind=engine)
follow_model.Base.metadata.create_all(bind=engine)
instagram_model.Base.metadata.create_all(bind=engine)

app = FastAPI()

APP_DIR = os.path.dirname(os.path.abspath(__file__))

SERVER_ROOT = os.path.dirname(APP_DIR)

STATIC_FILES_DIR = os.path.join(SERVER_ROOT, "media")

app.mount("/media", StaticFiles(directory=STATIC_FILES_DIR), name="media")

print(f"--- Serving media files from: {STATIC_FILES_DIR} ---")

origins = ["https://www.instagram.com"]

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
