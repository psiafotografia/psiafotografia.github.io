/**
 * Admin — Drag-and-Drop Photo Reorder Tool
 * Uses the shared Masonry layout engine so you see
 * an authentic live preview of how photos will appear on the site.
 */
(function () {
    let photos = [];
    let dragSrcIndex = null;

    // DOM
    const grid = document.getElementById('galleryGrid');
    const countEl = document.getElementById('photoCount');
    const toast = document.getElementById('toast');
    const resetBtn = document.getElementById('btnReset');
    const copyBtn = document.getElementById('btnCopy');
    const downloadBtn = document.getElementById('btnDownload');

    // Init shared masonry
    Masonry.init(grid);

    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => Masonry.reflowAll(), 150);
    });

    // ========================
    // INIT
    // ========================
    async function init() {
        try {
            const res = await fetch('js/photos.json');
            if (!res.ok) throw new Error('Failed to load');
            photos = await res.json();
        } catch (e) {
            grid.innerHTML = '<p style="padding:40px;color:#ef4444;">Could not load photos.json. Make sure you are running a local server.</p>';
            return;
        }

        countEl.textContent = `${photos.length} photos`;
        renderAll();
    }

    // ========================
    // RENDER ALL PHOTOS
    // ========================
    function renderAll() {
        grid.innerHTML = '';
        Masonry.reset();

        const items = [];
        const loaded = new Set();
        let nextToPlace = 0;

        function tryPlaceSequential() {
            while (nextToPlace < items.length && loaded.has(nextToPlace)) {
                Masonry.layoutItem(items[nextToPlace]);
                nextToPlace++;
            }
        }

        photos.forEach((photo, i) => {
            const item = document.createElement('div');
            item.className = 'gallery__item';
            item.dataset.index = i;
            item.draggable = true;

            const img = document.createElement('img');
            img.alt = photo.alt || `Photo ${i + 1}`;
            img.style.opacity = '0';
            img.style.transition = 'opacity 0.4s ease';

            // Index badge
            const badge = document.createElement('span');
            badge.className = 'photo-index';
            badge.textContent = i + 1;

            // Filename overlay
            const filename = document.createElement('span');
            filename.className = 'photo-filename';
            const fname = photo.thumb.split('/').pop();
            filename.textContent = fname;
            filename.title = fname;

            // Sequential placement (same as gallery.js)
            const idx = i;
            img.onload = function () {
                loaded.add(idx);
                tryPlaceSequential();
            };
            img.onerror = function () {
                console.warn(`Failed to load image: ${this.src}`);
                item.style.display = 'none';
                loaded.add(idx);
                tryPlaceSequential();
            };
            img.src = photo.thumb;

            item.appendChild(img);
            item.appendChild(badge);
            item.appendChild(filename);

            // Drag events
            item.addEventListener('dragstart', onDragStart);
            item.addEventListener('dragend', onDragEnd);
            item.addEventListener('dragover', onDragOver);
            item.addEventListener('dragenter', onDragEnter);
            item.addEventListener('dragleave', onDragLeave);
            item.addEventListener('drop', onDrop);

            grid.appendChild(item);
            items.push(item);
        });
    }

    // ========================
    // DRAG & DROP
    // ========================
    function onDragStart(e) {
        dragSrcIndex = parseInt(this.dataset.index);
        this.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', dragSrcIndex);
    }

    function onDragEnd() {
        this.classList.remove('dragging');
        clearDragStates();
    }

    function onDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    }

    function onDragEnter(e) {
        e.preventDefault();
        clearDragStates();
        const card = e.target.closest('.gallery__item');
        if (card && parseInt(card.dataset.index) !== dragSrcIndex) {
            card.classList.add('drag-over');
        }
    }

    function onDragLeave(e) {
        const card = e.target.closest('.gallery__item');
        if (card) card.classList.remove('drag-over');
    }

    function onDrop(e) {
        e.preventDefault();
        const card = e.target.closest('.gallery__item');
        if (!card) return;

        const dropIndex = parseInt(card.dataset.index);
        if (dragSrcIndex === null || dragSrcIndex === dropIndex) return;

        // Reorder: remove from old position, insert at new
        const [moved] = photos.splice(dragSrcIndex, 1);
        photos.splice(dropIndex, 0, moved);

        dragSrcIndex = null;
        renderAll();
        showToast(`Moved to position ${dropIndex + 1}`);
    }

    function clearDragStates() {
        grid.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    }

    // ========================
    // EXPORT
    // ========================
    function copyJSON() {
        const json = JSON.stringify(photos, null, 2);
        navigator.clipboard.writeText(json).then(() => {
            showToast('✓ JSON copied to clipboard!', 'success');
        }).catch(() => {
            const ta = document.createElement('textarea');
            ta.value = json;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            showToast('✓ JSON copied to clipboard!', 'success');
        });
    }

    function downloadJSON() {
        const json = JSON.stringify(photos, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'photos.json';
        a.click();
        URL.revokeObjectURL(url);
        showToast('✓ photos.json downloaded!', 'success');
    }

    async function resetOrder() {
        try {
            const res = await fetch('js/photos.json');
            photos = await res.json();
            renderAll();
            showToast('Order reset to original');
        } catch {
            showToast('Could not reload photos.json');
        }
    }

    // ========================
    // TOAST
    // ========================
    let toastTimer;
    function showToast(msg, type) {
        clearTimeout(toastTimer);
        toast.textContent = msg;
        toast.className = 'toast toast--visible' + (type === 'success' ? ' toast--success' : '');
        toastTimer = setTimeout(() => {
            toast.className = 'toast';
        }, 2500);
    }

    // ========================
    // BIND TOOLBAR BUTTONS
    // ========================
    if (resetBtn) resetBtn.addEventListener('click', resetOrder);
    if (copyBtn) copyBtn.addEventListener('click', copyJSON);
    if (downloadBtn) downloadBtn.addEventListener('click', downloadJSON);

    // Start
    init();
})();
