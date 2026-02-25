/**
 * Gallery — Masonry Grid with Lazy Loading & Lightbox
 * Uses shared Masonry engine. Items within each batch are placed
 * in sequential order (JSON order).
 */
(function () {
    const INITIAL_BATCH_SIZE = 15;
    const BATCH_SIZE = 20;

    let allPhotos = [];
    let loadedCount = 0;
    let currentLightboxIndex = -1;
    let visiblePhotos = [];

    // DOM
    const grid = document.getElementById('galleryGrid');
    const loadMoreBtn = document.getElementById('loadMore');
    const galleryCount = document.getElementById('galleryCount');
    const lightbox = document.getElementById('lightbox');
    const lightboxImg = document.getElementById('lightboxImg');
    const lightboxClose = document.getElementById('lightboxClose');
    const lightboxPrev = document.getElementById('lightboxPrev');
    const lightboxNext = document.getElementById('lightboxNext');
    const lightboxCounter = document.getElementById('lightboxCounter');

    // Init shared masonry
    Masonry.init(grid);

    // Debounced resize handler
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => Masonry.reflowAll(), 150);
    });

    /* =============================================
       PHOTO LOADING
       ============================================= */

    async function loadPhotoManifest() {
        try {
            const res = await fetch('js/photos.json');
            if (!res.ok) throw new Error('No photos.json found');
            allPhotos = await res.json();
        } catch (e) {
            console.warn('photos.json not found, using placeholder images.');
            allPhotos = generatePlaceholders(48);
        }

        if (galleryCount) galleryCount.textContent = `${allPhotos.length} zdjęć`;

        // Reset masonry state
        Masonry.reset();

        loadBatch();
    }

    function generatePlaceholders(count) {
        const placeholders = [];
        const heights = [300, 350, 400, 450, 500, 550, 250, 600];
        for (let i = 1; i <= count; i++) {
            const h = heights[i % heights.length];
            placeholders.push({
                thumb: `https://picsum.photos/400/${h}?random=${i}`,
                medium: `https://picsum.photos/1200/${Math.round(h * 3)}?random=${i}`,
                alt: `Zdjęcie ${i}`
            });
        }
        return placeholders;
    }

    /* =============================================
       PROGRESSIVE IMAGE LOADING
       ============================================= */
    const MAX_CONCURRENT_UPLOADS = 3;
    let currentUploads = 0;
    const upgradeQueue = [];

    function processUpgradeQueue() {
        if (currentUploads >= MAX_CONCURRENT_UPLOADS || upgradeQueue.length === 0) return;
        
        const { img, item, photo } = upgradeQueue.shift();
        currentUploads++;

        const mediumImg = new Image();
        mediumImg.src = photo.medium;
        mediumImg.onload = () => {
            img.src = photo.medium;
            img.classList.remove('gallery__img--thumb');
            img.classList.add('gallery__img--upgraded');
            item.dataset.upgraded = 'true';
            currentUploads--;
            processUpgradeQueue();
        };
        mediumImg.onerror = () => {
            currentUploads--;
            processUpgradeQueue();
        };
    }

    const imageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const item = entry.target;
                const img = item.querySelector('img');
                const index = item.dataset.index;
                const photo = allPhotos[index];

                if (item.dataset.upgraded !== 'true' && !item.dataset.upgrading) {
                    item.dataset.upgrading = 'true';
                    upgradeQueue.push({ img, item, photo });
                    processUpgradeQueue();
                }
                observer.unobserve(item);
            }
        });
    }, { rootMargin: '200px' });

    /**
     * Load next batch of images.
     * All images in the batch load eagerly, but placement is sequential
     * to preserve the JSON ordering (top picks first).
     */
    function loadBatch() {
        const isFirstBatch = loadedCount === 0;
        const batchSize = isFirstBatch ? INITIAL_BATCH_SIZE : BATCH_SIZE;
        const batchStart = loadedCount;
        const end = Math.min(batchStart + batchSize, allPhotos.length);

        const batchItems = [];   // items in this batch, in JSON order
        const loaded = new Set(); // indices of items whose images have loaded
        let nextToPlace = 0;     // index within batchItems of next item to place

        /**
         * Try to place items sequentially. Called every time an image loads.
         * Only places items in order: won't place item #3 until #0, #1, #2 are placed.
         */
        function tryPlaceSequential() {
            while (nextToPlace < batchItems.length && loaded.has(nextToPlace)) {
                const item = batchItems[nextToPlace];
                // Remove skeleton class before placing
                item.classList.remove('gallery__item--skeleton');
                Masonry.layoutItem(item);
                
                // Observe for progressive upgrade
                imageObserver.observe(item);
                
                nextToPlace++;
            }
        }

        for (let i = batchStart; i < end; i++) {
            const photo = allPhotos[i];
            const batchIdx = i - batchStart;

            const item = document.createElement('div');
            item.className = 'gallery__item gallery__item--skeleton';
            item.dataset.index = i;

            const img = document.createElement('img');
            img.alt = photo.alt || `Zdjęcie ${i + 1}`;
            img.style.opacity = '0';
            img.style.transition = 'opacity 0.4s ease';

            // When image loads, mark it ready and try sequential placement
            img.onload = (function (idx) {
                return function () {
                    loaded.add(idx);
                    tryPlaceSequential();
                };
            })(batchIdx);

            // On error, still mark as loaded so the batch queue isn't stalled
            img.onerror = (function (idx, element) {
                return function () {
                    console.warn(`Failed to load image: ${this.src}`);
                    element.style.display = 'none';
                    loaded.add(idx);
                    tryPlaceSequential();
                };
            })(batchIdx, item);

            // Load eagerly — batch sizes are small (15-20 thumbs)
            img.src = photo.thumb;
            img.classList.add('gallery__img--thumb');

            item.appendChild(img);
            item.addEventListener('click', () => openLightbox(i));
            grid.appendChild(item);
            batchItems.push(item);
        }

        loadedCount = end;
        visiblePhotos = allPhotos.slice(0, loadedCount);

        // Hide load more if all loaded
        if (loadedCount >= allPhotos.length) {
            loadMoreBtn.classList.add('gallery__load-more--hidden');
        } else {
            loadMoreBtn.classList.remove('gallery__load-more--hidden');
        }
    }

    /* =============================================
       LIGHTBOX
       ============================================= */

    function openLightbox(index) {
        currentLightboxIndex = index;
        updateLightboxImage();
        lightbox.classList.add('lightbox--active');
        document.body.classList.add('no-scroll');
    }

    function closeLightbox() {
        lightbox.classList.remove('lightbox--active');
        document.body.classList.remove('no-scroll');
        currentLightboxIndex = -1;
    }

    function updateLightboxImage() {
        if (currentLightboxIndex < 0 || currentLightboxIndex >= allPhotos.length) return;
        const photo = allPhotos[currentLightboxIndex];

        // Fade out current image
        lightboxImg.style.opacity = '0';
        lightboxImg.style.transform = 'scale(0.95)';

        // Set up onload BEFORE setting src to avoid race condition
        const newSrc = photo.medium || photo.thumb;
        const newAlt = photo.alt || `Zdjęcie ${currentLightboxIndex + 1}`;

        lightboxImg.onload = function () {
            lightboxImg.style.opacity = '1';
            lightboxImg.style.transform = 'scale(1)';
        };

        // Small delay for the fade-out to be visible
        setTimeout(() => {
            lightboxImg.src = newSrc;
            lightboxImg.alt = newAlt;
        }, 150);

        lightboxCounter.textContent = `${currentLightboxIndex + 1} / ${allPhotos.length}`;
    }

    function lightboxPrevPhoto() {
        if (currentLightboxIndex > 0) {
            currentLightboxIndex--;
        } else {
            currentLightboxIndex = allPhotos.length - 1;
        }
        updateLightboxImage();
    }

    function lightboxNextPhoto() {
        if (currentLightboxIndex < allPhotos.length - 1) {
            currentLightboxIndex++;
        } else {
            currentLightboxIndex = 0;
        }
        updateLightboxImage();
    }

    /* =============================================
       EVENT LISTENERS
       ============================================= */

    loadMoreBtn.addEventListener('click', loadBatch);
    lightboxClose.addEventListener('click', closeLightbox);
    lightboxPrev.addEventListener('click', lightboxPrevPhoto);
    lightboxNext.addEventListener('click', lightboxNextPhoto);

    lightbox.addEventListener('click', (e) => {
        if (e.target === lightbox || e.target.classList.contains('lightbox__content')) {
            closeLightbox();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (!lightbox.classList.contains('lightbox--active')) return;
        switch (e.key) {
            case 'Escape':
                closeLightbox();
                break;
            case 'ArrowLeft':
                lightboxPrevPhoto();
                break;
            case 'ArrowRight':
                lightboxNextPhoto();
                break;
        }
    });

    // Touch swipe support
    let touchStartX = 0;
    let touchStartY = 0;

    lightbox.addEventListener('touchstart', (e) => {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
    }, { passive: true });

    lightbox.addEventListener('touchend', (e) => {
        const deltaX = e.changedTouches[0].clientX - touchStartX;
        const deltaY = e.changedTouches[0].clientY - touchStartY;

        if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
            if (deltaX > 0) {
                lightboxPrevPhoto();
            } else {
                lightboxNextPhoto();
            }
        }
    }, { passive: true });

    // Init
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadPhotoManifest);
    } else {
        loadPhotoManifest();
    }
})();
