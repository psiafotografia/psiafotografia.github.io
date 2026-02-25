"""
Photo Processing Script for Konrad Jaworski Photography Portfolio
=================================================================
Resizes and compresses photos from a source folder, generating:
  - Thumbnails (400px wide, 70% JPEG quality) → images/thumbs/
  - Medium versions (1200px wide, 85% JPEG quality) → images/medium/
  - A photos.json manifest → js/photos.json

Usage:
    pip install Pillow
    python scripts/process_photos.py <source_folder>

Example:
    python scripts/process_photos.py "C:/Users/kjawo/Downloads/GooglePhotos"
"""

import os
import sys
import json
from datetime import datetime
from pathlib import Path

try:
    from PIL import Image, ImageOps
    from PIL.ExifTags import Base as ExifBase
except ImportError:
    print("Error: Pillow is required. Install it with: pip install Pillow")
    sys.exit(1)

# Config
THUMB_WIDTH = 400
THUMB_QUALITY = 70
MEDIUM_WIDTH = 1200
MEDIUM_QUALITY = 85
SUPPORTED_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp', '.tiff', '.bmp'}

# Paths (relative to project root)
PROJECT_ROOT = Path(__file__).resolve().parent.parent
THUMBS_DIR = PROJECT_ROOT / 'images' / 'thumbs'
MEDIUM_DIR = PROJECT_ROOT / 'images' / 'medium'
MANIFEST_PATH = PROJECT_ROOT / 'js' / 'photos.json'


def get_photo_date(img_path: Path) -> datetime:
    """Extract date from EXIF data, falling back to file modification time."""
    try:
        with Image.open(img_path) as img:
            exif = img._getexif()
            if exif:
                # Try DateTimeOriginal (36867), then DateTimeDigitized (36868), then DateTime (306)
                for tag_id in (36867, 36868, 306):
                    date_str = exif.get(tag_id)
                    if date_str:
                        return datetime.strptime(date_str, "%Y:%m:%d %H:%M:%S")
    except Exception:
        pass
    # Fallback: file modification time
    return datetime.fromtimestamp(img_path.stat().st_mtime)


def process_image(source_path: Path, filename: str) -> dict | None:
    """Process a single image: create thumbnail and medium version."""
    try:
        with Image.open(source_path) as img:
            # Fix orientation based on EXIF
            img = ImageOps.exif_transpose(img)

            # Convert to RGB if necessary (handles RGBA, palette, etc.)
            if img.mode not in ('RGB', 'L'):
                img = img.convert('RGB')

            w, h = img.size

            # Generate thumbnail
            thumb_height = int(h * (THUMB_WIDTH / w))
            thumb = img.resize((THUMB_WIDTH, thumb_height), Image.LANCZOS)
            thumb_path = THUMBS_DIR / filename
            thumb.save(thumb_path, 'JPEG', quality=THUMB_QUALITY, optimize=True)

            # Generate medium
            if w > MEDIUM_WIDTH:
                medium_height = int(h * (MEDIUM_WIDTH / w))
                medium = img.resize((MEDIUM_WIDTH, medium_height), Image.LANCZOS)
            else:
                medium = img.copy()
            medium_path = MEDIUM_DIR / filename
            medium.save(medium_path, 'JPEG', quality=MEDIUM_QUALITY, optimize=True)

            return {
                'thumb': f'images/thumbs/{filename}',
                'medium': f'images/medium/{filename}',
                'alt': filename.rsplit('.', 1)[0].replace('_', ' ').replace('-', ' ')
            }

    except Exception as e:
        print(f"  ⚠ Error processing {source_path.name}: {e}")
        return None


def main():
    if len(sys.argv) < 2:
        print("Usage: python process_photos.py <source_folder>")
        print("Example: python process_photos.py \"C:/Users/kjawo/Downloads/GooglePhotos\"")
        sys.exit(1)

    source_dir = Path(sys.argv[1]).resolve()
    if not source_dir.is_dir():
        print(f"Error: '{source_dir}' is not a valid directory.")
        sys.exit(1)

    # Collect image files
    all_images = [
        f for f in source_dir.iterdir()
        if f.is_file() and f.suffix.lower() in SUPPORTED_EXTENSIONS
    ]

    # Sort newest to oldest by EXIF date (fallback: file mod time)
    print("Reading dates for sorting...")
    images = sorted(all_images, key=get_photo_date, reverse=True)

    if not images:
        print(f"No supported images found in '{source_dir}'.")
        print(f"Supported formats: {', '.join(SUPPORTED_EXTENSIONS)}")
        sys.exit(1)

    print(f"Found {len(images)} images in '{source_dir}'")
    print(f"Project root: {PROJECT_ROOT}")
    print()

    # Create output directories
    THUMBS_DIR.mkdir(parents=True, exist_ok=True)
    MEDIUM_DIR.mkdir(parents=True, exist_ok=True)

    manifest = []
    for i, img_path in enumerate(images, 1):
        # Normalize filename: lowercase, replace spaces
        filename = img_path.name.lower().replace(' ', '_')
        # Ensure .jpg extension
        if not filename.endswith('.jpg'):
            filename = filename.rsplit('.', 1)[0] + '.jpg'

        print(f"  [{i}/{len(images)}] Processing {img_path.name}...", end='')

        entry = process_image(img_path, filename)
        if entry:
            manifest.append(entry)
            print(" ✓")
        else:
            print(" ✗")

    # Write manifest
    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(MANIFEST_PATH, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2)

    print()
    print(f"✓ Processed {len(manifest)}/{len(images)} images")
    print(f"  Thumbnails: {THUMBS_DIR}")
    print(f"  Medium:     {MEDIUM_DIR}")
    print(f"  Manifest:   {MANIFEST_PATH}")

    # Show estimated sizes
    thumb_size = sum(f.stat().st_size for f in THUMBS_DIR.iterdir()) / (1024 * 1024)
    medium_size = sum(f.stat().st_size for f in MEDIUM_DIR.iterdir()) / (1024 * 1024)
    print(f"  Total size: {thumb_size:.1f} MB (thumbs) + {medium_size:.1f} MB (medium) = {thumb_size + medium_size:.1f} MB")


if __name__ == '__main__':
    main()
