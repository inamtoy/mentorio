"""Local-disk storage for uploaded files, recorded in foundation.File.

Files live under settings.MEDIA_ROOT, which is never served as a public
/media/ URL — every download goes through a view that checks who may see
the file (e.g. homework.views.HomeworkAttachmentDownloadView). The type is
decided by the extension *and* the file's leading bytes, never by the
client-sent Content-Type, so a renamed .html or .exe can't slip through.
`storage_provider="local"` leaves room for an S3 backend later; callers only
ever see File rows and `stored_file_path()`.
"""

from __future__ import annotations

import hashlib
import uuid
from datetime import timedelta
from pathlib import Path

from django.conf import settings
from django.db.models import Count, Sum
from django.utils import timezone

from foundation.models import File

MAX_UPLOAD_BYTES = 10 * 1024 * 1024

_JPEG = (b"\xff\xd8\xff",)
# extension -> (mime type stored on the File row, accepted leading bytes).
# None means "check the ISO-BMFF 'ftyp' box" (HEIC/HEIF photos from iPhones).
ALLOWED_TYPES: dict[str, tuple[str, tuple[bytes, ...] | None]] = {
    ".jpg": ("image/jpeg", _JPEG),
    ".jpeg": ("image/jpeg", _JPEG),
    ".png": ("image/png", (b"\x89PNG\r\n\x1a\n",)),
    ".heic": ("image/heic", None),
    ".heif": ("image/heif", None),
    ".pdf": ("application/pdf", (b"%PDF",)),
    ".doc": ("application/msword", (b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1",)),
    ".docx": ("application/vnd.openxmlformats-officedocument.wordprocessingml.document", (b"PK\x03\x04",)),
}


# Per-user cap over a rolling 24 hours. Without it one account (even a
# student's) could fill the server's disk with 10 MB files in a loop — the
# daily cleanup only removes files never attached to homework. Generous for
# real use: a teacher attaching worksheets to every group, or a student
# photographing a few pages per assignment, stays far below it.
DAILY_UPLOAD_MAX_FILES = 100
DAILY_UPLOAD_MAX_BYTES = 300 * 1024 * 1024


class UploadRejected(ValueError):
    """The upload breaks a rule; the message is shown to the user as-is."""


def _enforce_daily_quota(uploaded_by, size: int) -> None:
    if uploaded_by is None:
        return
    # all_objects: deleted files still used the bandwidth and disk once, and
    # counting them stops an upload-delete-upload loop from resetting this.
    recent = File.all_objects.filter(uploaded_by=uploaded_by, created_at__gte=timezone.now() - timedelta(hours=24))
    totals = recent.aggregate(count=Count("id"), bytes=Sum("size_bytes"))
    if totals["count"] >= DAILY_UPLOAD_MAX_FILES or (totals["bytes"] or 0) + size > DAILY_UPLOAD_MAX_BYTES:
        raise UploadRejected(
            "You've reached today's upload limit "
            f"({DAILY_UPLOAD_MAX_FILES} files or {DAILY_UPLOAD_MAX_BYTES // (1024 * 1024)} MB in 24 hours). "
            "Try again tomorrow, or ask your center's administrator if you need more."
        )


def _content_matches(ext: str, head: bytes) -> bool:
    signatures = ALLOWED_TYPES[ext][1]
    if signatures is None:
        return head[4:8] == b"ftyp"
    return any(head.startswith(sig) for sig in signatures)


def store_upload(uploaded, *, organization_id, uploaded_by, category: str) -> File:
    """Validates and writes one Django UploadedFile, returning its File row."""
    original_name = Path(uploaded.name or "").name
    ext = Path(original_name).suffix.lower()
    if ext not in ALLOWED_TYPES:
        raise UploadRejected("This file type isn't allowed. Upload a photo (JPG, PNG, HEIC), a PDF or a Word document.")
    if not uploaded.size:
        raise UploadRejected("The file is empty. Choose the file again.")
    if uploaded.size > MAX_UPLOAD_BYTES:
        raise UploadRejected("The file is larger than 10 MB. Compress it or split it into smaller files.")

    head = uploaded.read(16)
    uploaded.seek(0)
    if not _content_matches(ext, head):
        raise UploadRejected(f"The file's content doesn't match its {ext} extension. Save it again in that format and retry.")

    _enforce_daily_quota(uploaded_by, uploaded.size)

    file_id = uuid.uuid4()
    stored_name = f"{file_id}{ext}"
    now = timezone.localtime()
    relative = Path(category) / str(organization_id) / f"{now:%Y}" / f"{now:%m}" / stored_name
    target = Path(settings.MEDIA_ROOT) / relative
    target.parent.mkdir(parents=True, exist_ok=True)

    checksum = hashlib.sha256()
    partial = target.with_suffix(target.suffix + ".part")
    with open(partial, "wb") as out:
        for chunk in uploaded.chunks():
            checksum.update(chunk)
            out.write(chunk)
    partial.replace(target)

    try:
        return File.objects.create(
            id=file_id,
            organization_id=organization_id,
            uploaded_by=uploaded_by,
            category=category,
            original_name=original_name[:500],
            stored_name=stored_name,
            mime_type=ALLOWED_TYPES[ext][0],
            size_bytes=uploaded.size,
            storage_path=relative.as_posix(),
            storage_provider="local",
            checksum=checksum.hexdigest(),
        )
    except Exception:
        # No row means nothing references the bytes — don't leave them behind.
        target.unlink(missing_ok=True)
        raise


def stored_file_path(file: File) -> Path:
    """Absolute path of a local File, refusing anything outside MEDIA_ROOT."""
    root = Path(settings.MEDIA_ROOT).resolve()
    path = (root / file.storage_path).resolve()
    if root not in path.parents:
        raise FileNotFoundError(file.storage_path)
    return path
