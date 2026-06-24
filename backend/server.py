"""DJ Light Templates - FastAPI backend.

Public endpoints:
- GET  /api/templates            list templates (?type=free|premium)
- GET  /api/templates/{id}       get single template metadata
- GET  /api/templates/{id}/file  get the file (base64 payload) for download

Admin endpoints (JWT):
- POST /api/admin/login          form-encoded username/password
- GET  /api/admin/me             current admin profile
- POST /api/admin/templates      create a template
- DELETE /api/admin/templates/{id} delete a template
- GET  /api/admin/notifications  list new-template notifications
"""

from datetime import datetime, timedelta, timezone
from pathlib import Path
import asyncio
import base64
import logging
import os
import re
import subprocess
import tempfile
import uuid
from typing import List, Optional

from fastapi import Depends, FastAPI, APIRouter, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from dotenv import load_dotenv
from jose import jwt, JWTError
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
from pydantic import BaseModel, Field
from starlette.middleware.cors import CORSMiddleware


# ----- Env / boot -----
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ["JWT_SECRET_KEY"]
JWT_ALGO = os.environ.get("JWT_ALGORITHM", "HS256")
ADMIN_EMAIL = os.environ["ADMIN_EMAIL"]
ADMIN_PASSWORD = os.environ["ADMIN_PASSWORD"]
ACCESS_TOKEN_DAYS = int(os.environ.get("ACCESS_TOKEN_DAYS", "7"))

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/admin/login")

app = FastAPI(title="DJ Light Templates API")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)


# ----- Models -----
class AdminOut(BaseModel):
    email: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TemplateCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=120)
    category: str = "AV Player Template"
    template_type: str = Field(..., pattern="^(free|premium)$")
    price: float = 0.0
    description: Optional[str] = ""
    download_link: str = Field(..., min_length=1)
    media_type: str = Field(..., pattern="^(image|video)$")
    thumbnail_base64: Optional[str] = ""
    video_base64: Optional[str] = ""
    video_url: Optional[str] = ""


class TemplateUpdate(BaseModel):
    title: Optional[str] = None
    category: Optional[str] = None
    template_type: Optional[str] = Field(default=None, pattern="^(free|premium)$")
    price: Optional[float] = None
    description: Optional[str] = None
    download_link: Optional[str] = None
    media_type: Optional[str] = Field(default=None, pattern="^(image|video)$")
    thumbnail_base64: Optional[str] = None
    video_base64: Optional[str] = None
    video_url: Optional[str] = None


class TemplateMeta(BaseModel):
    id: str
    title: str
    category: str = "AV Player Template"
    template_type: str
    price: float
    description: Optional[str] = ""
    download_link: str = ""
    media_type: str = "image"
    thumbnail_base64: str = ""
    video_base64: str = ""
    video_url: str = ""
    downloads: int = 0
    created_at: str


class NotificationOut(BaseModel):
    id: str
    title: str
    body: str
    template_id: str
    created_at: str


# ----- Helpers -----
def hash_password(p: str) -> str:
    return pwd_ctx.hash(p)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_ctx.verify(plain, hashed)


def create_token(email: str) -> str:
    exp = datetime.now(timezone.utc) + timedelta(days=ACCESS_TOKEN_DAYS)
    return jwt.encode({"sub": email, "exp": exp}, JWT_SECRET, algorithm=JWT_ALGO)


async def get_current_admin(token: str = Depends(oauth2_scheme)):
    creds_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
        email = payload.get("sub")
        if not email:
            raise creds_exc
    except JWTError:
        raise creds_exc
    admin = await db.admins.find_one({"email": email}, {"_id": 0})
    if not admin:
        raise creds_exc
    return admin


def template_to_meta(doc: dict) -> TemplateMeta:
    return TemplateMeta(
        id=doc["id"],
        title=doc["title"],
        category=doc.get("category", "AV Player Template"),
        template_type=doc["template_type"],
        price=doc.get("price", 0.0),
        description=doc.get("description", ""),
        download_link=doc.get("download_link", ""),
        media_type=doc.get("media_type", "image"),
        thumbnail_base64=doc.get("thumbnail_base64", ""),
        video_base64=doc.get("video_base64", ""),
        video_url=doc.get("video_url", ""),
        downloads=doc.get("downloads", 0),
        created_at=doc.get("created_at", ""),
    )


# ----- Server-side video thumbnail generation -----
# Resolve Google Drive share/view URLs to direct-download URLs so ffmpeg
# can fetch the video bytes without following Drive's interstitial HTML.
_DRIVE_PATTERNS = [
    re.compile(r"https?://(?:drive|docs)\.google\.com/file/d/([a-zA-Z0-9_-]+)"),
    re.compile(r"https?://(?:drive|docs)\.google\.com/(?:open|uc)\?id=([a-zA-Z0-9_-]+)"),
]


def _resolve_video_url(url: str) -> str:
    url = (url or "").strip()
    if not url:
        return url
    for pat in _DRIVE_PATTERNS:
        m = pat.search(url)
        if m:
            return f"https://drive.google.com/uc?export=download&id={m.group(1)}"
    return url


def _is_usable_b64_thumb(b64: Optional[str]) -> bool:
    """Mirror of the frontend `isUsableThumb`. Rejects too-short or empty
    base64 payloads (corrupt / placeholder uploads)."""
    if not b64:
        return False
    payload = b64.split(",", 1)[1] if b64.startswith("data:") else b64
    return len(payload) >= 400


def _ffmpeg_extract_jpeg_b64(video_url: str, time_sec: float = 1.0) -> Optional[str]:
    """Use ffmpeg to grab a single JPEG frame from `video_url` at `time_sec`.
    Returns a base64 string (no data URI prefix) or None on any failure.
    Safe to call from a thread (uses subprocess + tempfile)."""
    resolved = _resolve_video_url(video_url)
    if not resolved:
        return None

    # Write to a unique temp file we own and clean up afterwards.
    fd, out_path = tempfile.mkstemp(suffix=".jpg", prefix="djl_thumb_")
    os.close(fd)
    try:
        cmd = [
            "ffmpeg",
            "-y",
            "-loglevel", "error",
            "-ss", f"{max(0.0, time_sec):.2f}",
            "-i", resolved,
            "-frames:v", "1",
            "-q:v", "5",
            "-vf", "scale='min(720,iw)':-2",
            out_path,
        ]
        proc = subprocess.run(
            cmd,
            capture_output=True,
            timeout=45,
        )
        if proc.returncode != 0:
            logger.warning(
                "ffmpeg thumbnail failed (rc=%s) for %s: %s",
                proc.returncode,
                resolved[:120],
                (proc.stderr or b"")[:300].decode(errors="ignore"),
            )
            return None
        try:
            size = os.path.getsize(out_path)
        except OSError:
            return None
        if size < 200:
            return None
        with open(out_path, "rb") as fh:
            data = fh.read()
        return base64.b64encode(data).decode("ascii")
    except subprocess.TimeoutExpired:
        logger.warning("ffmpeg thumbnail timed out for %s", resolved[:120])
        return None
    except Exception as e:  # pragma: no cover - defensive
        logger.warning("ffmpeg thumbnail crashed for %s: %s", resolved[:120], e)
        return None
    finally:
        try:
            os.unlink(out_path)
        except OSError:
            pass


async def generate_video_thumbnail_b64(video_url: str) -> Optional[str]:
    """Async wrapper around the blocking ffmpeg extractor. Tries a few
    different timestamps in case the first frame is black."""
    if not video_url:
        return None
    loop = asyncio.get_running_loop()
    # Try a few common seek times; the first non-empty hit wins.
    for ts in (1.0, 0.25, 0.0, 2.0):
        result = await loop.run_in_executor(None, _ffmpeg_extract_jpeg_b64, video_url, ts)
        if result:
            return result
    return None


# ----- Routes: public -----
@api.get("/")
async def root():
    return {"name": "DJ Light Templates API", "ok": True}


@api.get("/templates", response_model=List[TemplateMeta])
async def list_templates(type: Optional[str] = None):
    q: dict = {}
    if type in ("free", "premium"):
        q["template_type"] = type
    cursor = db.templates.find(q, {"_id": 0}).sort("created_at", -1).limit(500)
    docs = await cursor.to_list(500)
    return [template_to_meta(d) for d in docs]


@api.get("/templates/{template_id}", response_model=TemplateMeta)
async def get_template(template_id: str):
    doc = await db.templates.find_one({"id": template_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Template not found")
    return template_to_meta(doc)


@api.post("/templates/{template_id}/track-download")
async def track_download(template_id: str):
    res = await db.templates.update_one(
        {"id": template_id}, {"$inc": {"downloads": 1}}
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Template not found")
    return {"ok": True}


@api.get("/notifications", response_model=List[NotificationOut])
async def list_notifications():
    cursor = db.notifications.find({}, {"_id": 0}).sort("created_at", -1).limit(50)
    docs = await cursor.to_list(50)
    return [NotificationOut(**d) for d in docs]


# ----- Routes: admin -----
@api.post("/admin/login", response_model=Token)
async def admin_login(form_data: OAuth2PasswordRequestForm = Depends()):
    # username field carries the email
    admin = await db.admins.find_one({"email": form_data.username})
    if not admin or not verify_password(form_data.password, admin["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return Token(access_token=create_token(admin["email"]))


@api.get("/admin/me", response_model=AdminOut)
async def admin_me(admin=Depends(get_current_admin)):
    return AdminOut(email=admin["email"])


@api.post("/admin/templates", response_model=TemplateMeta)
async def create_template(payload: TemplateCreate, admin=Depends(get_current_admin)):
    if payload.media_type == "image" and not (payload.thumbnail_base64 or "").strip():
        raise HTTPException(status_code=400, detail="thumbnail_base64 required for image media_type")
    if payload.media_type == "video":
        # A video template needs either an inline base64 OR a video URL.
        has_b64 = bool((payload.video_base64 or "").strip())
        has_url = bool((payload.video_url or "").strip())
        if not (has_b64 or has_url):
            raise HTTPException(
                status_code=400,
                detail="Provide either video_base64 or video_url for video media_type",
            )

    # For video templates, auto-generate a first-frame thumbnail from the
    # video URL when the admin did not provide a usable one. This ensures
    # the home grid always has a real preview image for every video — we
    # never fall back to the app logo on the client.
    thumb_in = (payload.thumbnail_base64 or "")
    if payload.media_type == "video" and not _is_usable_b64_thumb(thumb_in):
        v_url = (payload.video_url or "").strip()
        if v_url:
            gen = await generate_video_thumbnail_b64(v_url)
            if gen:
                thumb_in = gen
                logger.info("Auto-generated thumbnail for video template '%s'", payload.title)

    now_iso = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "title": payload.title.strip(),
        "category": (payload.category or "AV Player Template").strip(),
        "template_type": payload.template_type,
        "price": float(payload.price) if payload.template_type == "premium" else 0.0,
        "description": (payload.description or "").strip(),
        "download_link": payload.download_link.strip(),
        "media_type": payload.media_type,
        # Thumbnail is always kept: used as the grid poster for both image and
        # video templates. For video templates we auto-generated above when
        # missing.
        "thumbnail_base64": thumb_in,
        "video_base64": (payload.video_base64 or "") if payload.media_type == "video" else "",
        "video_url": (payload.video_url or "").strip() if payload.media_type == "video" else "",
        "downloads": 0,
        "created_at": now_iso,
    }
    await db.templates.insert_one(doc)

    notif = {
        "id": str(uuid.uuid4()),
        "title": "New template available",
        "body": f"{doc['title']} is now live in the {doc['template_type'].title()} collection",
        "template_id": doc["id"],
        "created_at": now_iso,
    }
    await db.notifications.insert_one(notif)
    return template_to_meta(doc)


@api.patch("/admin/templates/{template_id}", response_model=TemplateMeta)
async def update_template(
    template_id: str, payload: TemplateUpdate, admin=Depends(get_current_admin)
):
    update: dict = {}
    data = payload.dict(exclude_unset=True)

    # Handle media swap atomically: if media_type changed, ensure the right
    # field is set and the inactive ones are cleared. Thumbnail is preserved
    # in both modes — it doubles as the grid poster for video templates.
    new_media_type = data.get("media_type")
    if new_media_type == "image":
        if "thumbnail_base64" in data and data["thumbnail_base64"] is not None:
            update["thumbnail_base64"] = data["thumbnail_base64"]
        update["video_base64"] = ""
        update["video_url"] = ""
    elif new_media_type == "video":
        update["video_base64"] = (data.get("video_base64") or "").strip()
        update["video_url"] = (data.get("video_url") or "").strip()
        if "thumbnail_base64" in data and data["thumbnail_base64"] is not None:
            update["thumbnail_base64"] = data["thumbnail_base64"]

    for key in (
        "title",
        "category",
        "template_type",
        "price",
        "description",
        "download_link",
        "media_type",
    ):
        if key in data and data[key] is not None:
            update[key] = data[key]

    # If only thumbnail/video updated (without changing media_type), allow direct patch.
    if "media_type" not in data:
        if "thumbnail_base64" in data and data["thumbnail_base64"] is not None:
            update["thumbnail_base64"] = data["thumbnail_base64"]
        if "video_base64" in data and data["video_base64"] is not None:
            update["video_base64"] = data["video_base64"]
        if "video_url" in data and data["video_url"] is not None:
            update["video_url"] = data["video_url"]

    if not update:
        raise HTTPException(status_code=400, detail="No fields to update")

    if update.get("template_type") == "free":
        update["price"] = 0.0

    # If this update leaves the row as a video template without a usable
    # thumbnail, auto-generate one from the (new or existing) video_url.
    # This keeps the rule "video cards always show real video content".
    current = await db.templates.find_one({"id": template_id}, {"_id": 0})
    if not current:
        raise HTTPException(status_code=404, detail="Template not found")
    merged = {**current, **update}
    if merged.get("media_type") == "video":
        merged_thumb = merged.get("thumbnail_base64") or ""
        merged_url = (merged.get("video_url") or "").strip()
        if merged_url and not _is_usable_b64_thumb(merged_thumb):
            gen = await generate_video_thumbnail_b64(merged_url)
            if gen:
                update["thumbnail_base64"] = gen
                logger.info("Auto-generated thumbnail on update for template %s", template_id)

    result = await db.templates.find_one_and_update(
        {"id": template_id},
        {"$set": update},
        return_document=True,
        projection={"_id": 0},
    )
    if not result:
        raise HTTPException(status_code=404, detail="Template not found")
    return template_to_meta(result)


@api.get("/admin/templates", response_model=List[TemplateMeta])
async def admin_list_templates(admin=Depends(get_current_admin)):
    cursor = db.templates.find({}, {"_id": 0}).sort("created_at", -1).limit(1000)
    docs = await cursor.to_list(1000)
    return [template_to_meta(d) for d in docs]


@api.delete("/admin/templates/{template_id}")
async def delete_template(template_id: str, admin=Depends(get_current_admin)):
    result = await db.templates.delete_one({"id": template_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Template not found")
    return {"ok": True}


@api.post("/admin/templates/{template_id}/regenerate-thumbnail", response_model=TemplateMeta)
async def regenerate_thumbnail(template_id: str, admin=Depends(get_current_admin)):
    """Force re-extraction of the first-frame thumbnail from `video_url`.
    Useful for fixing templates whose original auto-gen failed (network
    blip, slow source, etc.)."""
    doc = await db.templates.find_one({"id": template_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Template not found")
    if doc.get("media_type") != "video":
        raise HTTPException(status_code=400, detail="Only video templates have generated thumbnails")
    v_url = (doc.get("video_url") or "").strip()
    if not v_url:
        raise HTTPException(status_code=400, detail="Template has no video_url to extract from")
    gen = await generate_video_thumbnail_b64(v_url)
    if not gen:
        raise HTTPException(status_code=502, detail="Could not extract a frame from the video URL")
    updated = await db.templates.find_one_and_update(
        {"id": template_id},
        {"$set": {"thumbnail_base64": gen}},
        return_document=True,
        projection={"_id": 0},
    )
    return template_to_meta(updated)


async def _backfill_video_thumbnails():
    """One-shot pass at startup: any existing video template that has a
    `video_url` but no usable `thumbnail_base64` gets one generated.
    Runs in the background so app boot is not blocked."""
    cursor = db.templates.find(
        {"media_type": "video"},
        {"_id": 0, "id": 1, "title": 1, "video_url": 1, "thumbnail_base64": 1},
    )
    docs = await cursor.to_list(1000)
    targets = [
        d for d in docs
        if (d.get("video_url") or "").strip()
        and not _is_usable_b64_thumb(d.get("thumbnail_base64") or "")
    ]
    if not targets:
        logger.info("Thumbnail backfill: nothing to do")
        return
    logger.info("Thumbnail backfill: generating for %d video template(s)", len(targets))
    for d in targets:
        try:
            gen = await generate_video_thumbnail_b64(d["video_url"])
            if gen:
                await db.templates.update_one(
                    {"id": d["id"]},
                    {"$set": {"thumbnail_base64": gen}},
                )
                logger.info("  ✓ thumbnail saved for '%s'", d.get("title", d["id"]))
            else:
                logger.warning("  ✗ extraction failed for '%s'", d.get("title", d["id"]))
        except Exception as e:
            logger.warning("  ✗ backfill error for %s: %s", d["id"], e)


# ----- Startup -----
@app.on_event("startup")
async def startup():
    await db.admins.create_index("email", unique=True)
    await db.templates.create_index("id", unique=True)
    await db.notifications.create_index("id", unique=True)

    existing = await db.admins.find_one({"email": ADMIN_EMAIL})
    if not existing:
        await db.admins.insert_one(
            {
                "email": ADMIN_EMAIL,
                "password_hash": hash_password(ADMIN_PASSWORD),
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        logger.info("Seeded admin %s", ADMIN_EMAIL)
    else:
        logger.info("Admin already exists: %s", ADMIN_EMAIL)

    # Idempotent demo template seeding so a fresh DB boots with content.
    if await db.templates.count_documents({}) == 0:
        import base64

        placeholder = (
            "data:image/svg+xml;base64,"
            + base64.b64encode(
                b'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500">'
                b'<defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1">'
                b'<stop offset="0%" stop-color="#c4fb6d"/>'
                b'<stop offset="100%" stop-color="#1f2c0d"/></linearGradient></defs>'
                b'<rect width="400" height="500" fill="url(#g)"/>'
                b'<circle cx="200" cy="250" r="80" fill="#0a0a0a" opacity="0.5"/>'
                b'<text x="50%" y="52%" font-family="sans-serif" font-size="28" '
                b'font-weight="800" fill="#c4fb6d" text-anchor="middle">DJ LIGHT</text></svg>'
            ).decode()
        )
        samples = [
            ("Neon Pulse Pack", "free", 0.0,
             "12 reactive light cues for AV Player - high-energy festival vibe.",
             "https://example.com/downloads/neon-pulse-pack.zip"),
            ("Festival Strobe FX", "free", 0.0,
             "Strobe + chase sequences. Perfect for build-ups and drops.",
             "https://example.com/downloads/festival-strobe.zip"),
            ("Avee Visualizer Studio", "premium", 2.99,
             "Premium AV Player template with 8 custom visualizer skins.",
             "https://example.com/downloads/avee-visualizer.zip"),
            ("Crystal Bass Drops", "premium", 4.99,
             "Beat-matched glass refraction overlays. Royalty-free.",
             "https://example.com/downloads/crystal-bass.zip"),
        ]
        now_iso = datetime.now(timezone.utc).isoformat()
        for title, typ, price, desc, link in samples:
            await db.templates.insert_one(
                {
                    "id": str(uuid.uuid4()),
                    "title": title,
                    "category": "AV Player Template",
                    "template_type": typ,
                    "price": price,
                    "description": desc,
                    "download_link": link,
                    "media_type": "image",
                    "thumbnail_base64": placeholder,
                    "video_base64": "",
                    "downloads": 0,
                    "created_at": now_iso,
                }
            )
        logger.info("Seeded %d demo templates", len(samples))

    # Kick off the thumbnail backfill in the background so app boot is not
    # blocked. Any video templates without a usable thumbnail but with a
    # valid `video_url` will get a real first-frame poster generated.
    asyncio.create_task(_backfill_video_thumbnails())


@app.on_event("shutdown")
async def shutdown():
    client.close()


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
