"""Re-sort photos.json by reading EXIF dates from the original source images."""
import json
from datetime import datetime
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parent.parent
manifest_path = root / 'js' / 'photos.json'
originals_dir = Path(r"C:\Users\kjawo\Downloads\Konrad Jaworski - Portfolio-3-001\Konrad Jaworski - Portfolio")

SUPPORTED_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp', '.tiff', '.bmp'}

with open(manifest_path, 'r') as f:
    photos = json.load(f)

# Build a lookup: normalized filename -> original path
originals = {}
for f in originals_dir.iterdir():
    if f.is_file() and f.suffix.lower() in SUPPORTED_EXTENSIONS:
        key = f.name.lower().replace(' ', '_')
        if not key.endswith('.jpg'):
            key = key.rsplit('.', 1)[0] + '.jpg'
        originals[key] = f

def get_date(entry):
    """Returns (has_exif: bool, date: datetime) so non-EXIF images sort last."""
    filename = entry['thumb'].split('/')[-1]
    orig = originals.get(filename)
    if orig:
        try:
            with Image.open(orig) as img:
                exif = img._getexif()
                if exif:
                    for tag_id in (36867, 36868, 306):
                        date_str = exif.get(tag_id)
                        if date_str:
                            return (True, datetime.strptime(date_str, '%Y:%m:%d %H:%M:%S'))
        except Exception:
            pass
        return (False, datetime.fromtimestamp(orig.stat().st_mtime))
    img_path = root / entry['medium']
    return (False, datetime.fromtimestamp(img_path.stat().st_mtime))

print(f'Reading EXIF dates from {len(photos)} original images...')
dated = [(get_date(p), p) for p in photos]

exif_count = sum(1 for (has, _), _ in dated if has)
print(f'  Found EXIF dates in {exif_count}/{len(photos)} images')

# Sort: EXIF photos newest-first, then non-EXIF at the end
dated.sort(key=lambda x: (not x[0][0], -x[0][1].timestamp()))
sorted_photos = [p for _, p in dated]

with open(manifest_path, 'w', encoding='utf-8') as f:
    json.dump(sorted_photos, f, indent=2)

print(f'Sorted {len(sorted_photos)} photos newest to oldest.')
print(f'Newest: {dated[0][0]}')
print(f'Oldest: {dated[-1][0]}')
