"""DJ Light Templates - Backend tests for ffmpeg auto-thumbnail generation.

Covers iteration_5 changes:
- POST /api/admin/templates with media_type=video + video_url -> auto-extracts first frame
- PATCH /api/admin/templates/{id} -> same auto-gen when leaving record video w/o thumb
- POST /api/admin/templates/{id}/regenerate-thumbnail -> forces re-extraction
- Backfill on startup populated existing video templates
"""
import os
import base64
import pytest

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")

# Public test video — small (1MB) reachable Big Buck Bunny clip
TEST_VIDEO_URL = (
    "https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/"
    "Big_Buck_Bunny_360_10s_1MB.mp4"
)


def _is_real_jpeg_b64(s: str) -> bool:
    """Validate that the base64 string decodes to JPEG (FFD8 magic) and has
    a real (>= 400-char) payload."""
    if not s or len(s) < 400:
        return False
    payload = s.split(",", 1)[1] if s.startswith("data:") else s
    if len(payload) < 400:
        return False
    try:
        raw = base64.b64decode(payload[:120] + "==", validate=False)
        return raw[:2] == b"\xff\xd8"  # JPEG SOI marker
    except Exception:
        return False


# ---- Auto-gen on POST ----
class TestThumbnailAutoGenOnCreate:
    def test_post_video_with_url_auto_generates_thumbnail(self, api_session, auth_headers):
        payload = {
            "title": "TEST_AutoThumb_POST",
            "category": "AV Player Template",
            "template_type": "free",
            "price": 0.0,
            "description": "Auto thumbnail extraction test",
            "download_link": "https://example.com/test.zip",
            "media_type": "video",
            "thumbnail_base64": "",   # empty -> server should auto-generate
            "video_base64": "",
            "video_url": TEST_VIDEO_URL,
        }
        r = api_session.post(
            f"{BASE_URL}/api/admin/templates", json=payload, headers=auth_headers
        )
        assert r.status_code == 200, r.text
        body = r.json()
        try:
            assert body["media_type"] == "video"
            assert body["video_url"] == TEST_VIDEO_URL
            thumb = body["thumbnail_base64"]
            assert len(thumb) >= 400, f"thumbnail too short: len={len(thumb)}"
            assert _is_real_jpeg_b64(thumb), "thumbnail is not a valid JPEG"

            # Verify persistence: GET returns same thumbnail
            g = api_session.get(f"{BASE_URL}/api/templates/{body['id']}")
            assert g.status_code == 200
            assert g.json()["thumbnail_base64"] == thumb
        finally:
            # Cleanup via DELETE endpoint
            d = api_session.delete(
                f"{BASE_URL}/api/admin/templates/{body['id']}",
                headers=auth_headers,
            )
            assert d.status_code == 200

    def test_post_video_with_short_thumb_still_auto_generates(self, api_session, auth_headers):
        """A user-supplied thumb < 400 chars should be treated as unusable
        and replaced by the ffmpeg-extracted one."""
        payload = {
            "title": "TEST_ShortThumb_POST",
            "category": "AV Player Template",
            "template_type": "free",
            "price": 0.0,
            "description": "Short thumb should be replaced",
            "download_link": "https://example.com/test.zip",
            "media_type": "video",
            "thumbnail_base64": "data:image/png;base64,iVBORw0KGgoAAA==",  # < 400
            "video_base64": "",
            "video_url": TEST_VIDEO_URL,
        }
        r = api_session.post(
            f"{BASE_URL}/api/admin/templates", json=payload, headers=auth_headers
        )
        assert r.status_code == 200, r.text
        body = r.json()
        try:
            thumb = body["thumbnail_base64"]
            assert len(thumb) >= 400
            assert _is_real_jpeg_b64(thumb)
        finally:
            api_session.delete(
                f"{BASE_URL}/api/admin/templates/{body['id']}",
                headers=auth_headers,
            )


# ---- Auto-gen on PATCH ----
class TestThumbnailAutoGenOnPatch:
    def test_patch_image_to_video_with_url_auto_generates(self, api_session, auth_headers):
        # Start with an image template
        px_png = (
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAA"
            "C0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
        )
        create = api_session.post(
            f"{BASE_URL}/api/admin/templates",
            json={
                "title": "TEST_PatchAutoThumb",
                "category": "AV Player Template",
                "template_type": "free",
                "price": 0.0,
                "download_link": "https://example.com/x.zip",
                "media_type": "image",
                "thumbnail_base64": px_png,
                "video_base64": "",
            },
            headers=auth_headers,
        )
        assert create.status_code == 200, create.text
        tid = create.json()["id"]
        try:
            # Swap to video with a URL and an empty thumb -> server should
            # auto-extract a fresh first-frame JPEG
            r = api_session.patch(
                f"{BASE_URL}/api/admin/templates/{tid}",
                json={
                    "media_type": "video",
                    "video_url": TEST_VIDEO_URL,
                    "thumbnail_base64": "",
                },
                headers=auth_headers,
            )
            assert r.status_code == 200, r.text
            body = r.json()
            assert body["media_type"] == "video"
            assert body["video_url"] == TEST_VIDEO_URL
            assert len(body["thumbnail_base64"]) >= 400
            assert _is_real_jpeg_b64(body["thumbnail_base64"])
        finally:
            api_session.delete(
                f"{BASE_URL}/api/admin/templates/{tid}", headers=auth_headers
            )


# ---- /regenerate-thumbnail ----
class TestRegenerateThumbnailEndpoint:
    def _create_video_with_url(self, api_session, auth_headers, title):
        r = api_session.post(
            f"{BASE_URL}/api/admin/templates",
            json={
                "title": title,
                "category": "AV Player Template",
                "template_type": "free",
                "price": 0.0,
                "download_link": "https://example.com/x.zip",
                "media_type": "video",
                "thumbnail_base64": "",
                "video_base64": "",
                "video_url": TEST_VIDEO_URL,
            },
            headers=auth_headers,
        )
        assert r.status_code == 200, r.text
        return r.json()

    def test_regenerate_returns_refreshed_thumbnail(self, api_session, auth_headers):
        created = self._create_video_with_url(
            api_session, auth_headers, "TEST_Regen_OK"
        )
        tid = created["id"]
        original_thumb = created["thumbnail_base64"]
        try:
            r = api_session.post(
                f"{BASE_URL}/api/admin/templates/{tid}/regenerate-thumbnail",
                headers=auth_headers,
            )
            assert r.status_code == 200, r.text
            body = r.json()
            assert body["id"] == tid
            assert len(body["thumbnail_base64"]) >= 400
            assert _is_real_jpeg_b64(body["thumbnail_base64"])
            # Same source video -> usually same bytes, but verify it's still real
        finally:
            api_session.delete(
                f"{BASE_URL}/api/admin/templates/{tid}", headers=auth_headers
            )

    def test_regenerate_requires_auth(self, api_session):
        r = api_session.post(
            f"{BASE_URL}/api/admin/templates/any-id/regenerate-thumbnail"
        )
        assert r.status_code == 401

    def test_regenerate_404_for_missing(self, api_session, auth_headers):
        r = api_session.post(
            f"{BASE_URL}/api/admin/templates/does-not-exist-xyz/regenerate-thumbnail",
            headers=auth_headers,
        )
        assert r.status_code == 404

    def test_regenerate_400_for_image_template(self, api_session, auth_headers):
        px_png = (
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAA"
            "C0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
        )
        c = api_session.post(
            f"{BASE_URL}/api/admin/templates",
            json={
                "title": "TEST_Regen_ImageReject",
                "category": "AV Player Template",
                "template_type": "free",
                "price": 0.0,
                "download_link": "https://example.com/x.zip",
                "media_type": "image",
                "thumbnail_base64": px_png,
                "video_base64": "",
            },
            headers=auth_headers,
        )
        tid = c.json()["id"]
        try:
            r = api_session.post(
                f"{BASE_URL}/api/admin/templates/{tid}/regenerate-thumbnail",
                headers=auth_headers,
            )
            assert r.status_code == 400
        finally:
            api_session.delete(
                f"{BASE_URL}/api/admin/templates/{tid}", headers=auth_headers
            )

    def test_regenerate_400_when_no_video_url(self, api_session, auth_headers):
        """A video template created with only video_base64 (no URL) cannot
        be regenerated and should return 400."""
        fake_vid = "data:video/mp4;base64," + base64.b64encode(b"fakevid").decode()
        c = api_session.post(
            f"{BASE_URL}/api/admin/templates",
            json={
                "title": "TEST_Regen_NoURL",
                "category": "AV Player Template",
                "template_type": "free",
                "price": 0.0,
                "download_link": "https://example.com/x.zip",
                "media_type": "video",
                "thumbnail_base64": "",
                "video_base64": fake_vid,
                "video_url": "",
            },
            headers=auth_headers,
        )
        assert c.status_code == 200, c.text
        tid = c.json()["id"]
        try:
            r = api_session.post(
                f"{BASE_URL}/api/admin/templates/{tid}/regenerate-thumbnail",
                headers=auth_headers,
            )
            assert r.status_code == 400
        finally:
            api_session.delete(
                f"{BASE_URL}/api/admin/templates/{tid}", headers=auth_headers
            )


# ---- Backfill verification (state-of-DB) ----
class TestBackfillState:
    def test_existing_video_templates_have_real_thumbnails(self, api_session):
        """After startup backfill, every video template with a reachable
        video_url should have thumbnail_base64 length >= 400 chars."""
        r = api_session.get(f"{BASE_URL}/api/templates")
        assert r.status_code == 200
        templates = r.json()
        videos_with_url = [
            t for t in templates
            if t.get("media_type") == "video" and (t.get("video_url") or "").strip()
        ]
        # At least one such template should exist (Neon Pulse · Sample)
        assert len(videos_with_url) >= 1, "No video templates with video_url in DB"
        for t in videos_with_url:
            thumb = t.get("thumbnail_base64", "")
            assert len(thumb) >= 400, (
                f"Video template '{t.get('title')}' has unusable thumb "
                f"(len={len(thumb)}) after backfill"
            )


# ---- Existing public endpoints still working ----
class TestPublicEndpointsStillWork:
    def test_list_templates_200(self, api_session):
        r = api_session.get(f"{BASE_URL}/api/templates")
        assert r.status_code == 200
        assert isinstance(r.json(), list)
        if r.json():
            t = r.json()[0]
            for f in ("id", "title", "template_type", "media_type",
                      "thumbnail_base64", "video_base64", "video_url",
                      "downloads", "created_at"):
                assert f in t

    def test_get_template_200(self, api_session):
        r = api_session.get(f"{BASE_URL}/api/templates")
        if not r.json():
            pytest.skip("No templates in DB")
        tid = r.json()[0]["id"]
        g = api_session.get(f"{BASE_URL}/api/templates/{tid}")
        assert g.status_code == 200
        assert g.json()["id"] == tid
