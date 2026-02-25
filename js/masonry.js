/**
 * Shared Masonry Layout Engine
 * Used by both gallery.js and admin.js
 */
const Masonry = (function () {
    const GAP = 16; // px gap between items

    let columnHeights = [];
    let placedItems = []; // ordered list of placed {element, col}
    let grid = null;

    function init(gridElement) {
        grid = gridElement;
    }

    function getColumnCount() {
        const style = getComputedStyle(grid);
        return parseInt(style.getPropertyValue('--gallery-columns')) || 3;
    }

    function getColumnWidth() {
        const cols = getColumnCount();
        const gridWidth = grid.clientWidth;
        return (gridWidth - GAP * (cols - 1)) / cols;
    }

    /**
     * Place a single item into the shortest column.
     * Assumes the image is already loaded (naturalWidth/Height available).
     */
    function layoutItem(item) {
        const cols = getColumnCount();
        const colWidth = getColumnWidth();

        // Ensure columnHeights array matches current column count
        while (columnHeights.length < cols) columnHeights.push(0);

        // Find shortest column
        let minCol = 0;
        let minHeight = columnHeights[0];
        for (let c = 1; c < cols; c++) {
            if (columnHeights[c] < minHeight) {
                minHeight = columnHeights[c];
                minCol = c;
            }
        }

        const left = minCol * (colWidth + GAP);
        const top = columnHeights[minCol];

        item.style.width = colWidth + 'px';
        item.style.left = left + 'px';
        item.style.top = top + 'px';

        // Get natural image dimensions to calculate rendered height
        const img = item.querySelector('img');
        const naturalW = img.naturalWidth || 1;
        const naturalH = img.naturalHeight || 1;
        const renderedHeight = (naturalH / naturalW) * colWidth;

        // Update column height
        columnHeights[minCol] = top + renderedHeight + GAP;

        // Track for resize
        placedItems.push({ element: item, col: minCol });

        // Update container height
        grid.style.height = Math.max(...columnHeights) + 'px';

        // Make visible & interactive
        item.classList.add('gallery__item--visible');
        img.style.opacity = '1';
    }

    /**
     * Full re-layout of all placed items (used on resize).
     */
    function reflowAll() {
        const cols = getColumnCount();
        const colWidth = getColumnWidth();

        // Reset column heights
        columnHeights = new Array(cols).fill(0);

        for (const entry of placedItems) {
            const item = entry.element;
            const img = item.querySelector('img');
            const naturalW = img.naturalWidth || 1;
            const naturalH = img.naturalHeight || 1;
            const renderedHeight = (naturalH / naturalW) * colWidth;

            // Find shortest column
            let minCol = 0;
            let minHeight = columnHeights[0];
            for (let c = 1; c < cols; c++) {
                if (columnHeights[c] < minHeight) {
                    minHeight = columnHeights[c];
                    minCol = c;
                }
            }

            const left = minCol * (colWidth + GAP);
            const top = columnHeights[minCol];

            item.style.width = colWidth + 'px';
            item.style.left = left + 'px';
            item.style.top = top + 'px';

            columnHeights[minCol] = top + renderedHeight + GAP;
            entry.col = minCol;
        }

        grid.style.height = (columnHeights.length ? Math.max(...columnHeights) : 0) + 'px';
    }

    /**
     * Reset masonry state for a fresh layout.
     */
    function reset() {
        columnHeights = new Array(getColumnCount()).fill(0);
        placedItems = [];
    }

    /**
     * Get the GAP constant.
     */
    function getGap() {
        return GAP;
    }

    return {
        init,
        getColumnCount,
        getColumnWidth,
        layoutItem,
        reflowAll,
        reset,
        getGap,
    };
})();
