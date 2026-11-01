# Konrad Jaworski Photography Portfolio

Dark, minimal photography portfolio with constellation particle effects and masonry grid gallery.

🔗 **Live:** [psiafotografia.github.io](https://psiafotografia.github.io)
📷 **Photo album:** [Google Photos](https://photos.app.goo.gl/bYWFbXo7h8d5qz8f7)

## Adding new photos

The shared [Google Photos album](https://photos.app.goo.gl/bYWFbXo7h8d5qz8f7) is the source
of truth. Add new photos there, then sync them to the site.

The sync is **incremental and safe**:

- only photos that are not already on the site are downloaded;
- duplicates are detected visually, not by filename;
- existing photos, their order and their alt texts are never changed;
- new photos are optimized (400 px thumbs + 1200 px medium) and added at the top;
- nothing is ever deleted automatically.

### Option A — GitHub Actions (no local setup)

1. Add photos to the Google Photos album.
2. Open **Actions → “Sync photos from Google Photos” → Run workflow**.
3. Wait ~1–3 minutes. The workflow commits the new images and `photos.json`;
   GitHub Pages publishes the site automatically.

Choose `top` or `bottom` in the workflow input to control where new photos appear.

### Option B — locally

```bash
pip install -r requirements.txt

# Preview what would be added (nothing is written)
python scripts/sync_photos.py --dry-run

# Download, optimize and update js/photos.json
python scripts/sync_photos.py

# Preview the site
python -m http.server 8000
```

Then commit and push:

```bash
git add images/thumbs images/medium js/photos.json
git commit -m "Add new photos from Google Photos"
git push
```

Or let the script do it:

```bash
python scripts/sync_photos.py --deploy
```

Useful options:

```bash
python scripts/sync_photos.py --insert-at bottom   # add new photos at the end
python scripts/sync_photos.py --limit 5            # add at most 5 new photos
python scripts/sync_photos.py --album <share-url>  # use a different album
```

### Reordering photos

Open [`admin.html`](https://psiafotografia.github.io/admin.html) locally through a server,
drag photos into the order you want, then download the generated `photos.json` and replace
`js/photos.json`.

## Initial setup / full rebuild

If you want to rebuild the whole gallery from a folder of originals (for example a ZIP
downloaded from Google Photos), run:

```bash
pip install -r requirements.txt
python scripts/process_photos.py "C:/path/to/downloaded/photos"
```

This regenerates every thumbnail, medium image and the complete `photos.json` manifest.

## Preview locally

```bash
python -m http.server 8000
```

Open [http://localhost:8000](http://localhost:8000)

## Deploy to GitHub Pages

1. Push to the `main` branch of `psiafotografia/psiafotografia.github.io`
2. Go to **Settings → Pages** → source: `main` branch
3. The site is live at [https://psiafotografia.github.io](https://psiafotografia.github.io)

## Contact form

1. Sign up at [formspree.io](https://formspree.io)
2. Create a new form
3. Replace the Formspree ID in `index.html`

## Tech stack

- Vanilla HTML / CSS / JavaScript
- JavaScript absolute-positioning masonry layout
- Canvas-based particle system
- Formspree for contact form
- GitHub Pages hosting
- Pillow-based photo pipeline
- Optional GitHub Actions sync from a public Google Photos album

## Notes

- The Google Photos album must stay shared as **“Anyone with the link can view”**.
- The sync reads the public share page, not the official Google Photos API.
  If Google changes that page, use the ZIP + `process_photos.py` fallback.
- Sync only adds photos. To remove a photo, delete its entry from `js/photos.json`
  and remove the two image files.
