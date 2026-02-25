"""
setup_dog_photos.py
-------------------
1. Clears images/thumbs/ and images/medium/
2. Copies dog photos from source, resizes to thumb (400px wide) and medium (1400px wide)
3. Reads EXIF DateTimeOriginal and sorts newest-first
4. Writes js/photos.json
"""
import json
import shutil
from datetime import datetime
from pathlib import Path

from PIL import Image, ExifTags

# --- Paths ---
SOURCE_DIR = Path(r"C:\Users\kjawo\Downloads\Konrad Jaworski - Dog Photography-3-001\Konrad Jaworski - Dog Photography")
ROOT = Path(__file__).resolve().parent.parent
THUMBS_DIR = ROOT / "images" / "thumbs"
MEDIUM_DIR = ROOT / "images" / "medium"
MANIFEST = ROOT / "js" / "photos.json"

SUPPORTED = {".jpg", ".jpeg", ".png", ".webp", ".tiff", ".bmp", ".JPG", ".JPEG"}

THUMB_WIDTH = 400
MEDIUM_WIDTH = 1400

# --- Step 1: Clear existing images ---
print("Clearing old images...")
for d in (THUMBS_DIR, MEDIUM_DIR):
    if d.exists():
        shutil.rmtree(d)
    d.mkdir(parents=True, exist_ok=True)
print("  Done.")

# --- Step 2: Collect source images ---
sources = sorted(
    [f for f in SOURCE_DIR.iterdir() if f.is_file() and f.suffix in SUPPORTED],
    key=lambda f: f.name.lower()
)
print(f"Found {len(sources)} source images.")

def get_exif_date(img: Image.Image):
    try:
        exif_data = img._getexif()
        if exif_data:
            for tag_id in (36867, 36868, 306):  # DateTimeOriginal, DateTimeDigitized, DateTime
                val = exif_data.get(tag_id)
                if val:
                    return datetime.strptime(val, "%Y:%m:%d %H:%M:%S")
    except Exception:
        pass
    return None

def resize_and_save(img: Image.Image, target_path: Path, max_width: int):
    """Resize image preserving aspect ratio, save as JPEG."""
    w, h = img.size
    if w > max_width:
        ratio = max_width / w
        new_size = (max_width, int(h * ratio))
        img = img.resize(new_size, Image.LANCZOS)
    # Ensure RGB (no alpha channel for JPEG)
    if img.mode in ("RGBA", "P", "LA"):
        img = img.convert("RGB")
    img.save(target_path, "JPEG", quality=88, optimize=True)

# --- Step 3: Process images ---
entries = []  # List of (date, entry_dict)

for i, src in enumerate(sources, 1):
    # Normalize filename to lowercase .jpg
    out_name = src.stem.lower().replace(" ", "_") + ".jpg"
    thumb_path = THUMBS_DIR / out_name
    medium_path = MEDIUM_DIR / out_name

    print(f"  [{i}/{len(sources)}] {src.name} -> {out_name}")

    try:
        with Image.open(src) as img:
            # Auto-rotate based on EXIF orientation
            try:
                exif = img._getexif()
                if exif:
                    orientation_key = next(
                        (k for k, v in ExifTags.TAGS.items() if v == "Orientation"), None
                    )
                    if orientation_key and orientation_key in exif:
                        orientation = exif[orientation_key]
                        rotations = {3: 180, 6: 270, 8: 90}
                        if orientation in rotations:
                            img = img.rotate(rotations[orientation], expand=True)
            except Exception:
                pass

            exif_date = get_exif_date(img)
            if exif_date is None:
                exif_date = datetime.fromtimestamp(src.stat().st_mtime)
                has_exif = False
            else:
                has_exif = True

            # Save thumb
            resize_and_save(img.copy(), thumb_path, THUMB_WIDTH)
            # Save medium
            resize_and_save(img.copy(), medium_path, MEDIUM_WIDTH)

        entries.append((has_exif, exif_date, {
            "thumb": f"images/thumbs/{out_name}",
            "medium": f"images/medium/{out_name}",
            "alt": src.stem.replace("-", " ").replace("_", " ").replace("~", "")
        }))
    except Exception as e:
        print(f"    ERROR: {e}")

# --- Step 4: Sort newest-first ---
entries.sort(key=lambda x: (not x[0], -x[1].timestamp()))
photos = [e[2] for e in entries]

exif_count = sum(1 for e in entries if e[0])
print(f"\nSorted {len(photos)} photos ({exif_count} with EXIF dates, {len(photos)-exif_count} by file date).")

# --- Step 5: Write manifest ---
with open(MANIFEST, "w", encoding="utf-8") as f:
    json.dump(photos, f, indent=2)

print(f"Written: {MANIFEST}")
print("Done! Run your local server and open index.html.")
