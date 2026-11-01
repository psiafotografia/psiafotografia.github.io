#!/usr/bin/env python3
"""
Sync new photos from a public Google Photos shared album
=======================================================

Downloads only the photos that are not already on the site, creates the
same optimized thumbnails / medium versions as ``process_photos.py`` and
updates ``js/photos.json``. Existing entries, their order and their alt
texts are left untouched.

Usage:
    pip install -r requirements.txt
    python scripts/sync_photos.py                 # add new photos at the top
    python scripts/sync_photos.py --dry-run       # only show what would be added
    python scripts/sync_photos.py --insert-at bottom
    python scripts/sync_photos.py --deploy        # commit + push after syncing

The album link must be a public "shared album" link (Anyone with the link
can view). Photos are de-duplicated visually (perceptual hash), so photos
that were already downloaded from the album are never added twice.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

try:
    from PIL import Image, ImageOps
except ImportError:
    sys.exit(
        "Error: Pillow is required.\n"
        "Install it with: pip install -r requirements.txt"
    )

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

PROJECT_ROOT = Path(__file__).resolve().parent.parent
THUMBS_DIR = PROJECT_ROOT / "images" / "thumbs"
MEDIUM_DIR = PROJECT_ROOT / "images" / "medium"
MANIFEST_PATH = PROJECT_ROOT / "js" / "photos.json"

DEFAULT_ALBUM_URL = "https://photos.app.goo.gl/bYWFbXo7h8d5qz8f7"

THUMB_WIDTH = 400
THUMB_QUALITY = 70
MEDIUM_WIDTH = 1200
MEDIUM_QUALITY = 85

# Enough resolution for the 1200 px medium image, without downloading the
# full 25-50 MP original for every photo.
DOWNLOAD_WIDTH = 2048

# dHash distance at or below this value means "same photo, different size".
# Measured on this portfolio: already published photos score 0-5, while
# genuinely different photos score 16+.
DUPLICATE_THRESHOLD = 6

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/126.0.0.0 Safari/537.36"
)

ALT_TEMPLATES = [
    "Portret psa - portfolio psiej fotografii",
    "Psia sesja zdjęciowa - portfolio psiej fotografii",
    "Artystyczna fotografia psa - portfolio psiej fotografii",
    "Pies w obiektywie - portfolio psiej fotografii",
    "Naturalny portret psa - portfolio psiej fotografii",
    "Psia fotografia - portret czworonoga",
]

# ---------------------------------------------------------------------------
# HTTP
# ---------------------------------------------------------------------------


def http_get(url: str, timeout: int = 90, retries: int = 3) -> bytes:
    """GET a URL with a browser UA and a few retries."""
    last_error: Exception | None = None
    for attempt in range(1, retries + 1):
        request = urllib.request.Request(
            url,
            headers={
                "User-Agent": USER_AGENT,
                "Accept": "text/html,application/xhtml+xml,image/jpeg,*/*",
                "Accept-Language": "en-US,en;q=0.9,pl;q=0.8",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return response.read()
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            last_error = exc
            if attempt < retries:
                print(f"  ! Download failed ({exc}); retrying {attempt}/{retries - 1}...")
                time.sleep(2 * attempt)

    raise RuntimeError(f"Could not download {url}: {last_error}")


# ---------------------------------------------------------------------------
# Google Photos share-page parsing
# ---------------------------------------------------------------------------


def _is_photo_item(value) -> bool:
    """A photo entry in the share page looks like:
    ["AF1Qip...", ["https://lh3...", width, height, ...], timestamp, ...]
    """
    return (
        isinstance(value, list)
        and len(value) >= 7
        and isinstance(value[0], str)
        and value[0].startswith("AF1Qip")
        and isinstance(value[1], list)
        and len(value[1]) >= 3
        and isinstance(value[1][0], str)
        and value[1][0].startswith("https://lh3.googleusercontent.com/")
    )


def _find_photo_items(node) -> list:
    """Return the longest list of photo entries found in a JSON blob."""
    if isinstance(node, list):
        if _is_photo_item(node):
            return [node]

        # The album is normally a flat list of photo entries. Return it
        # directly so we do not keep only the single longest child.
        direct = [child for child in node if _is_photo_item(child)]
        if direct:
            return direct

        best: list = []
        for child in node:
            found = _find_photo_items(child)
            if len(found) > len(best):
                best = found
        return best

    return []


def parse_album(html: str) -> tuple[str, list[dict]]:
    """Extract album title and photo entries from a shared album page."""
    title_match = re.search(r"<title>(.*?)</title>", html, re.S)
    title = "Google Photos album"
    if title_match:
        title = re.sub(r"\s*-\s*Google Photos\s*$", "", title_match.group(1)).strip()

    # The page embeds its data in AF_initDataCallback({key: 'ds:N', data: ...})
    blocks = re.findall(
        r"AF_initDataCallback\((\{.*?\})\);</script>",
        html,
        re.S,
    )

    best_items: list = []
    for block in blocks:
        data_match = re.search(r"\bdata:\s*(\[.*\])\s*,\s*sideChannel:", block, re.S)
        if not data_match:
            continue
        try:
            data = json.loads(data_match.group(1))
        except json.JSONDecodeError:
            continue

        items = _find_photo_items(data)
        if len(items) > len(best_items):
            best_items = items

    if not best_items:
        raise RuntimeError(
            "Could not find photos in the album page. Google may have changed "
            "the share page. As a fallback, download the album as a ZIP from "
            "Google Photos and run: python scripts/process_photos.py <folder>"
        )

    photos = []
    for raw in best_items:
        try:
            photo_id = raw[0]
            base_url = raw[1][0]
            width = int(raw[1][1])
            height = int(raw[1][2])
            timestamp = int(raw[2]) if isinstance(raw[2], int) else 0
            timezone_offset = int(raw[4]) if isinstance(raw[4], int) else 0
        except (IndexError, TypeError, ValueError):
            continue

        # Convert the UTC timestamp plus the album's timezone offset to the
        # local wall-clock date used in the filename.
        taken_at = datetime.fromtimestamp(
            (timestamp + timezone_offset) / 1000,
            tz=timezone.utc,
        )

        photos.append(
            {
                "id": photo_id,
                "base_url": base_url,
                "width": width,
                "height": height,
                "taken_at": taken_at,
                "url": f"{base_url}=w{min(DOWNLOAD_WIDTH, max(width, 1))}",
            }
        )

    # Newest first, so new work appears at the top of the gallery.
    photos.sort(key=lambda photo: photo["taken_at"], reverse=True)
    return title, photos


# ---------------------------------------------------------------------------
# Perceptual hashing / de-duplication
# ---------------------------------------------------------------------------


def dhash(image: Image.Image, size: int = 8) -> int:
    """64-bit difference hash. Robust to resizing and JPEG re-compression."""
    image = image.convert("L").resize((size + 1, size), Image.LANCZOS)
    pixels = image.tobytes()
    bits = 0
    for row in range(size):
        offset = row * (size + 1)
        for col in range(size):
            left = pixels[offset + col]
            right = pixels[offset + col + 1]
            bits = (bits << 1) | (left > right)
    return bits


def hamming_distance(first: int, second: int) -> int:
    return (first ^ second).bit_count()


def existing_photo_hashes(manifest: list[dict]) -> list[tuple[dict, int]]:
    """Hash the thumbnails that are already published on the site."""
    hashes = []
    for entry in manifest:
        thumb_path = PROJECT_ROOT / entry.get("thumb", "")
        if not thumb_path.is_file():
            print(f"  ! Missing thumbnail, skipping de-dupe check: {thumb_path}")
            continue
        try:
            with Image.open(thumb_path) as image:
                hashes.append((entry, dhash(image)))
        except Exception as exc:  # noqa: BLE001 - a broken thumb must not stop sync
            print(f"  ! Could not read {thumb_path.name}: {exc}")
    return hashes


def album_thumbnail_hash(photo: dict) -> int:
    data = http_get(f"{photo['base_url']}=w320", timeout=60)
    with Image.open(io.BytesIO(data)) as image:
        return dhash(image)


# ---------------------------------------------------------------------------
# Image processing
# ---------------------------------------------------------------------------


def process_photo(photo: dict) -> dict | None:
    """Download one photo and write its thumb + medium versions."""
    digest = hashlib.sha1(photo["id"].encode("utf-8")).hexdigest()[:8]
    filename = f"{photo['taken_at']:%Y-%m-%d}_{digest}.jpg"

    thumb_path = THUMBS_DIR / filename
    medium_path = MEDIUM_DIR / filename

    # A previous interrupted run may already have written both files.
    if not (thumb_path.is_file() and medium_path.is_file()):
        try:
            data = http_get(photo["url"])
            with Image.open(io.BytesIO(data)) as image:
                image = ImageOps.exif_transpose(image)
                if image.mode not in ("RGB", "L"):
                    image = image.convert("RGB")

                width, height = image.size

                thumb_height = max(1, round(height * THUMB_WIDTH / width))
                thumb = image.resize((THUMB_WIDTH, thumb_height), Image.LANCZOS)
                _save_jpeg(thumb, thumb_path, THUMB_QUALITY)

                if width > MEDIUM_WIDTH:
                    medium_height = max(1, round(height * MEDIUM_WIDTH / width))
                    medium = image.resize((MEDIUM_WIDTH, medium_height), Image.LANCZOS)
                else:
                    medium = image.copy()
                _save_jpeg(medium, medium_path, MEDIUM_QUALITY)
        except Exception as exc:  # noqa: BLE001 - keep syncing other photos
            print(f"  ✗ {photo['taken_at']:%Y-%m-%d} {photo['id'][:12]}: {exc}")
            return None

    alt_index = int(hashlib.sha1(photo["id"].encode("utf-8")).hexdigest(), 16)
    alt_index %= len(ALT_TEMPLATES)

    return {
        "thumb": f"images/thumbs/{filename}",
        "medium": f"images/medium/{filename}",
        "alt": ALT_TEMPLATES[alt_index],
    }


def _save_jpeg(image: Image.Image, path: Path, quality: int) -> None:
    """Write atomically so an interrupted run never leaves a broken JPEG."""
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    image.save(temporary, "JPEG", quality=quality, optimize=True)
    os.replace(temporary, path)


# ---------------------------------------------------------------------------
# Manifest
# ---------------------------------------------------------------------------


def load_manifest() -> list[dict]:
    if not MANIFEST_PATH.is_file():
        return []
    with MANIFEST_PATH.open(encoding="utf-8") as file:
        manifest = json.load(file)
    if not isinstance(manifest, list):
        raise RuntimeError(f"{MANIFEST_PATH} does not contain a JSON list")
    return manifest


def save_manifest(manifest: list[dict]) -> None:
    temporary = MANIFEST_PATH.with_name(MANIFEST_PATH.name + ".tmp")
    with temporary.open("w", encoding="utf-8") as file:
        json.dump(manifest, file, ensure_ascii=False, indent=2)
        file.write("\n")
    os.replace(temporary, MANIFEST_PATH)


# ---------------------------------------------------------------------------
# Git
# ---------------------------------------------------------------------------


def deploy(added_count: int) -> None:
    """Commit only the synced files and push to the current branch."""
    paths = ["images/thumbs", "images/medium", "js/photos.json"]

    def git(*args: str, check: bool = True) -> subprocess.CompletedProcess:
        return subprocess.run(
            ["git", "-C", str(PROJECT_ROOT), *args],
            check=check,
            text=True,
            capture_output=True,
        )

    branch = git("rev-parse", "--abbrev-ref", "HEAD").stdout.strip()
    if branch == "HEAD":
        raise RuntimeError("Not on a branch; cannot deploy.")

    git("add", "--", *paths)
    staged = git("diff", "--cached", "--quiet", "--", *paths, check=False)
    if staged.returncode == 0:
        print("Nothing to commit.")
        return

    git(
        "commit",
        "-m",
        f"Sync {added_count} new photo{'s' if added_count != 1 else ''} from Google Photos",
        "--",
        *paths,
    )
    print(f"Committed {added_count} new photo(s) on {branch}.")

    push = git("push", check=False)
    if push.returncode != 0:
        print(push.stderr.strip())
        raise RuntimeError("git push failed - resolve the conflict and push manually.")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Sync new photos from a public Google Photos shared album.",
    )
    parser.add_argument(
        "--album",
        default=DEFAULT_ALBUM_URL,
        help=f"Public shared album URL (default: {DEFAULT_ALBUM_URL})",
    )
    parser.add_argument(
        "--insert-at",
        choices=("top", "bottom"),
        default="top",
        help="Where to put new photos in photos.json (default: top)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Add at most N new photos (useful for testing)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be added without downloading or writing anything",
    )
    parser.add_argument(
        "--deploy",
        action="store_true",
        help="Commit and push the synced files after a successful run",
    )
    args = parser.parse_args()

    print(f"Album: {args.album}")
    html = http_get(args.album).decode("utf-8", "replace")
    title, album_photos = parse_album(html)
    print(f"Album title: {title}")
    print(f"Photos in album: {len(album_photos)}")

    manifest = load_manifest()
    print(f"Photos already on the site: {len(manifest)}")

    print("Checking which photos are already published...")
    existing = existing_photo_hashes(manifest)
    with ThreadPoolExecutor(max_workers=6) as pool:
        album_hashes = list(pool.map(album_thumbnail_hash, album_photos))

    # One-to-one matching: each published thumbnail can "consume" only one
    # album photo, so two similar new photos are not both skipped.
    available = list(range(len(existing)))
    new_photos = []
    for photo, photo_hash in zip(album_photos, album_hashes):
        if not available:
            new_photos.append(photo)
            continue

        best_index, best_distance = min(
            (
                (index, hamming_distance(photo_hash, existing[index][1]))
                for index in available
            ),
            key=lambda pair: pair[1],
        )
        if best_distance <= DUPLICATE_THRESHOLD:
            available.remove(best_index)
        else:
            new_photos.append(photo)

    print(
        f"Already on the site: {len(album_photos) - len(new_photos)}"
        f" | New: {len(new_photos)}"
    )

    if args.limit is not None:
        new_photos = new_photos[: args.limit]
        print(f"Limiting this run to {len(new_photos)} new photo(s).")

    if not new_photos:
        print("Everything is up to date. Nothing to do.")
        return

    print("\nNew photos (newest first):")
    for photo in new_photos:
        print(f"  {photo['taken_at']:%Y-%m-%d}  {photo['width']}x{photo['height']}  {photo['id'][:14]}")

    if args.dry_run:
        print("\nDry run: nothing was downloaded or written.")
        return

    print("\nProcessing photos...")
    new_entries = []
    for index, photo in enumerate(new_photos, 1):
        print(
            f"  [{index}/{len(new_photos)}] {photo['taken_at']:%Y-%m-%d} "
            f"{photo['id'][:14]}",
            end="",
            flush=True,
        )
        entry = process_photo(photo)
        if entry:
            new_entries.append(entry)
            print(" ✓")
        else:
            print(" ✗")

    if not new_entries:
        print("No photos were processed successfully. Manifest left unchanged.")
        return

    if args.insert_at == "top":
        merged = new_entries + manifest
    else:
        merged = manifest + new_entries

    save_manifest(merged)
    print(
        f"\n✓ Added {len(new_entries)} photo(s) at the {args.insert_at}."
        f"\n  photos.json now has {len(merged)} entries."
    )

    if args.deploy:
        deploy(len(new_entries))


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit("\nCancelled.")
    except Exception as error:  # noqa: BLE001 - user-friendly CLI error
        sys.exit(f"\nError: {error}")
