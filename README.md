# Konrad Jaworski Photography Portfolio

Dark, minimal photography portfolio with constellation particle effects and masonry grid gallery.

🔗 **Live:** [konradjaworskiphoto.github.io](https://konradjaworskiphoto.github.io)

## Setup

### 1. Process Photos

Download all photos from the [Google Photos album](https://photos.app.goo.gl/wz1RvDjhbJG3K62r8) into a local folder, then run:

```bash
pip install Pillow
python scripts/process_photos.py "C:/path/to/downloaded/photos"
```

This generates optimized thumbnails and medium-res images, plus a `js/photos.json` manifest.

### 2. Preview Locally

```bash
python -m http.server 8000
```

Open [http://localhost:8000](http://localhost:8000)

### 3. Deploy to GitHub Pages

1. Create a repo named `konradjaworskiphoto.github.io` on GitHub
2. Push this code to the `main` branch
3. Go to **Settings → Pages** → set source to `main` branch
4. Site will be live at `https://konradjaworskiphoto.github.io`

### 4. Contact Form

1. Sign up at [formspree.io](https://formspree.io)
2. Create a new form
3. Replace `YOUR_FORM_ID` in `index.html` with your Formspree form ID

## Tech Stack

- Vanilla HTML / CSS / JavaScript
- JavaScript absolute-positioning masonry layout
- Canvas-based particle system
- Formspree for contact form
- GitHub Pages hosting
