/**
 * ZoomManager — Gestion du zoom plateau (PC molette + Mobile pinch)
 *
 * Problème résolu : l'événement 'wheel' peut se déclencher des dizaines de fois
 * par seconde (trackpad, molette rapide), accumulant le delta et atteignant les
 * limites min/max en une fraction de seconde.
 *
 * Solution : throttle par requestAnimationFrame — un seul step de zoom appliqué
 * par frame (≈16ms), peu importe la vitesse de la molette.
 *
 * Sur mobile : le pinch est naturellement cadencé par les événements touch,
 * on applique le même verrou RAF pour éviter les sauts.
 */
export class ZoomManager {
    /**
     * @param {HTMLElement} container  — élément scrollable qui contient le board
     * @param {HTMLElement} board      — élément transformé (scale)
     * @param {object}      options
     * @param {number}      options.min        — zoom minimum (défaut 0.2)
     * @param {number}      options.max        — zoom maximum (défaut 3)
     * @param {number}      options.stepWheel  — pas par cran de molette (défaut 0.1)
     * @param {number}      options.initialPC  — zoom initial PC (défaut 1)
     * @param {number}      options.initialMobile — zoom initial mobile (défaut 0.5)
     * @param {Function}    options.isMobile   — () => boolean
     */
    constructor(container, board, options = {}) {
        this.container = container;
        this.board     = board;

        this.min        = options.min        ?? 0.2;
        this.max        = options.max        ?? 3;
        this.stepWheel  = options.stepWheel  ?? 0.1;
        this._isMobile  = options.isMobile   ?? (() => false);

        this.level = this._isMobile() ? (options.initialMobile ?? 0.5)
                                      : (options.initialPC     ?? 1);

        // RAF throttle
        this._rafPending  = false;
        this._pendingDelta = 0;

        // Pinch state
        this._lastTouchDist = null;
        this._rafPinchPending = false;
        this._pendingPinchDelta = 0;

        this._onWheel      = this._onWheel.bind(this);
        this._onTouchStart = this._onTouchStart.bind(this);
        this._onTouchMove  = this._onTouchMove.bind(this);
        this._onTouchEnd   = this._onTouchEnd.bind(this);
    }

    /** Attache les listeners et applique le zoom initial */
    init() {
        // PC — bloquer le scroll natif en capture avant tout le monde
        this._onWheelCapture = (e) => e.preventDefault();
        this.container.addEventListener('wheel', this._onWheelCapture, { passive: false, capture: true });

        // PC — molette
        this.container.addEventListener('wheel', this._onWheel, { passive: false });

        // Mobile — pinch
        this.container.addEventListener('touchstart', this._onTouchStart, { passive: true });
        this.container.addEventListener('touchmove',  this._onTouchMove,  { passive: false });
        this.container.addEventListener('touchend',   this._onTouchEnd,   { passive: true });

        this._apply();
    }

    destroy() {
        this.container.removeEventListener('wheel', this._onWheelCapture, { capture: true });
        this.container.removeEventListener('wheel',      this._onWheel);
        this.container.removeEventListener('touchstart', this._onTouchStart);
        this.container.removeEventListener('touchmove',  this._onTouchMove);
        this.container.removeEventListener('touchend',   this._onTouchEnd);
    }

    /** Retourne le niveau de zoom courant */
    get zoomLevel() { return this.level; }

    /** Forcer un niveau de zoom donné */
    setZoom(value) {
        this.level = Math.max(this.min, Math.min(this.max, value));
        this._apply();
    }

    // ─────────────────────────────────────────────────────────────
    // PC — molette avec throttle RAF
    // ─────────────────────────────────────────────────────────────

    _onWheel(e) {
        e.preventDefault();

        this._pendingDelta += e.deltaY > 0 ? -this.stepWheel : this.stepWheel;
        // Mémoriser la position souris pour centrer le zoom dessus
        if (!this._rafPending) {
            this._mouseX = e.clientX;
            this._mouseY = e.clientY;
        }

        if (!this._rafPending) {
            this._rafPending = true;
            requestAnimationFrame(() => {
                const prevLevel = this.level;
                this.level = Math.max(this.min, Math.min(this.max, this.level + this._pendingDelta));
                this._pendingDelta = 0;
                this._rafPending   = false;
                this._applyAtPoint(prevLevel, this._mouseX, this._mouseY);
            });
        }
    }

    // ─────────────────────────────────────────────────────────────
    // Mobile — pinch avec throttle RAF
    // ─────────────────────────────────────────────────────────────

    _onTouchStart(e) {
        if (e.touches.length === 2) {
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            this._lastTouchDist = Math.hypot(dx, dy);
        } else {
            this._lastTouchDist = null;
        }
    }

    _onTouchMove(e) {
        if (e.touches.length !== 2 || this._lastTouchDist === null) return;
        e.preventDefault();

        const dx   = e.touches[0].clientX - e.touches[1].clientX;
        const dy   = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.hypot(dx, dy);

        this._pendingPinchDelta += (dist - this._lastTouchDist) * 0.01;
        this._lastTouchDist = dist;

        if (!this._rafPinchPending) {
            this._rafPinchPending = true;
            requestAnimationFrame(() => {
                const prevLevel = this.level;
                this.level = Math.max(this.min, Math.min(this.max, this.level + this._pendingPinchDelta));
                this._pendingPinchDelta = 0;
                this._rafPinchPending   = false;
                this._apply(prevLevel);
            });
        }
    }

    _onTouchEnd(e) {
        if (e.touches.length < 2) this._lastTouchDist = null;
    }

    // ─────────────────────────────────────────────────────────────
    // Application du transform
    // ─────────────────────────────────────────────────────────────

    _apply(prevLevel) {
        if (prevLevel && prevLevel !== this.level) {
            const boardCenter = 10400;
            const viewCX = this.container.scrollLeft + this.container.clientWidth  / 2;
            const viewCY = this.container.scrollTop  + this.container.clientHeight / 2;
            const dxBefore = viewCX - boardCenter;
            const dyBefore = viewCY - boardCenter;
            const ratio    = this.level / prevLevel;
            this.board.style.transform = `scale(${this.level})`;
            this.container.scrollLeft  = boardCenter + dxBefore * ratio - this.container.clientWidth  / 2;
            this.container.scrollTop   = boardCenter + dyBefore * ratio - this.container.clientHeight / 2;
        } else {
            this.board.style.transform = `scale(${this.level})`;
        }
    }

    /**
     * Applique le zoom en gardant le point sous (clientX, clientY) immobile.
     */
    _applyAtPoint(prevLevel, clientX, clientY) {
        if (!prevLevel || prevLevel === this.level) {
            this.board.style.transform = `scale(${this.level})`;
            return;
        }

        const boardCenter = 10400;
        const rect        = this.container.getBoundingClientRect();

        // Position du pointeur dans le repère CSS du board (avant zoom)
        const pointerInContainer = {
            x: clientX - rect.left + this.container.scrollLeft,
            y: clientY - rect.top  + this.container.scrollTop,
        };
        // Distance du pointeur au centre du board
        const dxBoard = pointerInContainer.x - boardCenter;
        const dyBoard = pointerInContainer.y - boardCenter;

        const ratio = this.level / prevLevel;

        this.board.style.transform = `scale(${this.level})`;

        // Après zoom, le pointeur doit rester au même pixel écran
        // → ajuster le scroll pour que boardCenter + dxBoard*ratio - scrollLeft = pointerInContainer.x
        this.container.scrollLeft = boardCenter + dxBoard * ratio - (clientX - rect.left);
        this.container.scrollTop  = boardCenter + dyBoard * ratio - (clientY - rect.top);
    }
}
