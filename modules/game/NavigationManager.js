import { ZoomManager } from './ZoomManager.js';

/**
 * NavigationManager — Gestion du zoom et du drag sur le plateau
 *
 * Encapsule :
 *  - ZoomManager (molette PC + pinch mobile)
 *  - Drag souris PC
 *  - Drag tactile 1 doigt mobile
 *  - Centrage initial du plateau
 */
export class NavigationManager {
    /**
     * @param {HTMLElement}  container  — élément scrollable (#board-container)
     * @param {HTMLElement}  board      — élément transformé (#board)
     * @param {object}       options
     * @param {Function}     options.isMobile   — () => boolean
     * @param {object}       options.zoom       — options passées à ZoomManager
     */
    constructor(container, board, options = {}) {
        this.container  = container;
        this.board      = board;
        this.isMobile   = options.isMobile ?? (() => false);
        this.zoomOptions = options.zoom ?? {};

        this.zoomManager = null;

        // État drag souris
        this._isDragging  = false;
        this._startX      = 0;
        this._startY      = 0;
        this._scrollLeft  = 0;
        this._scrollTop   = 0;
    }

    /**
     * Initialise le zoom, le drag et centre le plateau.
     * Idempotent — peut être appelé plusieurs fois sans effet.
     */
    init() {
        if (this.zoomManager) this.zoomManager.destroy();

        this.zoomManager = new ZoomManager(this.container, this.board, {
            min:           0.2,
            max:           3,
            stepWheel:     0.1,
            isMobile:      this.isMobile,
            initialPC:     1,
            initialMobile: 0.5,
            ...this.zoomOptions,
        });
        this.zoomManager.init();

        this._setupMouseDrag();
        this._setupTouchDrag();

        this._centerBoard();
    }

    /**
     * Recentre le plateau sur le centre de la grille (50,50).
     */
    _centerBoard() {
        this.container.scrollLeft = 10400 - this.container.clientWidth  / 2;
        this.container.scrollTop  = 10400 - this.container.clientHeight / 2;
    }

    /**
     * Branche les événements drag souris sur le container.
     */
    _setupMouseDrag() {
        const c = this.container;

        c.addEventListener('mousedown', (e) => {
            if (e.target.classList.contains('tile') || e.target.classList.contains('slot')) return;
            this._isDragging = true;
            c.style.cursor   = 'grabbing';
            this._startX     = e.pageX - c.offsetLeft;
            this._startY     = e.pageY - c.offsetTop;
            this._scrollLeft = c.scrollLeft;
            this._scrollTop  = c.scrollTop;
        });

        c.addEventListener('mouseleave', () => { this._isDragging = false; c.style.cursor = 'grab'; });
        c.addEventListener('mouseup',    () => { this._isDragging = false; c.style.cursor = 'grab'; });

        c.addEventListener('mousemove', (e) => {
            if (!this._isDragging) return;
            e.preventDefault();
            const x = e.pageX - c.offsetLeft;
            const y = e.pageY - c.offsetTop;
            c.scrollLeft = this._scrollLeft - (x - this._startX) * 2;
            c.scrollTop  = this._scrollTop  - (y - this._startY) * 2;
        });
    }

    /**
     * Branche les événements drag tactile 1 doigt sur le container.
     * Le pinch est géré par ZoomManager.
     */
    _setupTouchDrag() {
        const c = this.container;
        let lastTouchX = null;
        let lastTouchY = null;

        c.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                lastTouchX = e.touches[0].clientX;
                lastTouchY = e.touches[0].clientY;
            }
        }, { passive: true });

        c.addEventListener('touchmove', (e) => {
            if (e.touches.length !== 1 || lastTouchX === null) return;
            // non-passive + preventDefault : empêche le scroll natif du navigateur
            // de conflicier avec notre scroll manuel (cause principale du saccad)
            e.preventDefault();

            const dx = e.touches[0].clientX - lastTouchX;
            const dy = e.touches[0].clientY - lastTouchY;
            lastTouchX = e.touches[0].clientX;
            lastTouchY = e.touches[0].clientY;

            // Appliquer immédiatement — sans RAF pour éviter la latence d'une frame
            const zoom = this.zoomManager?.zoomLevel ?? 1;
            c.scrollLeft -= dx / zoom;
            c.scrollTop  -= dy / zoom;
        }, { passive: false });

        c.addEventListener('touchend', () => {
            lastTouchX = null;
            lastTouchY = null;
        }, { passive: true });
    }

    /**
     * Détruit le ZoomManager et libère les ressources.
     */
    destroy() {
        if (this.zoomManager) {
            this.zoomManager.destroy();
            this.zoomManager = null;
        }
    }

    /**
     * Niveau de zoom courant (délégué au ZoomManager).
     */
    get zoomLevel() {
        return this.zoomManager?.zoomLevel ?? 1;
    }
}
