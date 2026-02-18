import { Tile } from './Tile.js';

/**
 * SlotsUI - Gère l'affichage des slots de placement
 * CONNECTÉ À EVENTBUS
 */
export class SlotsUI {
    constructor(plateau, gameSync, eventBus, getTileEnMain) {
        this.plateau      = plateau;
        this.gameSync     = gameSync;
        this.eventBus     = eventBus;
        this.boardElement = null;
        this.getTileEnMain = getTileEnMain;

        this.isMyTurn       = false;
        this.firstTilePlaced = false;
        this.onSlotClick    = null;

        // ✅ Binder pour que off() retrouve la même référence
        this._onTileDrawn   = this.onTileDrawn.bind(this);
        this._onTilePlaced  = this.onTilePlaced.bind(this);
        this._onTurnChanged = this.onTurnChanged.bind(this);
        this._onTileRotated = this.onTileRotated.bind(this);

        this.eventBus.on('tile-drawn',    this._onTileDrawn);
        this.eventBus.on('tile-placed',   this._onTilePlaced);
        this.eventBus.on('turn-changed',  this._onTurnChanged);
        this.eventBus.on('tile-rotated',  this._onTileRotated);
    }

    init() {
        this.boardElement = document.getElementById('board');
    }

    setSlotClickHandler(callback) {
        this.onSlotClick = callback;
    }

    onTileDrawn(data) {
        console.log('🎴 onTileDrawn appelé avec:', data);
        console.log('  → Vérification refresh: firstTilePlaced =', this.firstTilePlaced);
        if (this.firstTilePlaced) {
            console.log('  → ✅ Appel de refresh()');
            this.refresh();
        } else {
            console.log('  → ❌ Pas de refresh (firstTilePlaced = false)');
        }
    }

    onTilePlaced(data) {
        this.firstTilePlaced = true;
        this.refresh();
    }

    onTileRotated(data) {
        this.refresh();
    }

    onTurnChanged(data) {
        console.log('🔄 SlotsUI.onTurnChanged - isMyTurn:', data.isMyTurn);
        this.isMyTurn = data.isMyTurn;

        const slots = document.querySelectorAll('.slot');
        console.log(`🔄 Mise à jour de ${slots.length} slots existants`);
        slots.forEach(slot => {
            if (!this.isMyTurn) {
                slot.classList.add('slot-readonly');
                slot.style.cursor        = 'default';
                slot.style.pointerEvents = 'none';
            } else {
                slot.classList.remove('slot-readonly');
                slot.style.cursor        = 'pointer';
                slot.style.pointerEvents = 'auto';
            }
        });

        this.refresh();
    }

    refresh() {
        if (this.firstTilePlaced) {
            this.refreshAllSlots();
        }
    }

    createCentralSlot() {
        console.log('🎯 Création du slot central...');
        const board = this.boardElement;

        const slot = document.createElement('div');
        slot.className = 'slot slot-central';
        slot.style.gridColumn = 50;
        slot.style.gridRow    = 50;

        if (!this.isMyTurn) {
            slot.classList.add('slot-readonly');
            slot.style.cursor        = 'default';
            slot.style.pointerEvents = 'none';
            console.log('🔒 Slot central readonly (pas notre tour)');
        } else {
            slot.onclick = () => {
                if (this.getTileEnMain() && !this.firstTilePlaced && this.onSlotClick) {
                    console.log('✅ Clic sur slot central - pose de la tuile');
                    this.onSlotClick(50, 50, this.getTileEnMain(), true);
                }
            };
            console.log('✅ Slot central cliquable (notre tour)');
        }

        board.appendChild(slot);
        console.log('✅ Slot central ajouté au board');
    }

    refreshAllSlots() {
        console.log('═══════════════════════════════════════');
        console.log('🔄 refreshAllSlots appelé');
        console.log('  firstTilePlaced:', this.firstTilePlaced);
        console.log('  isMyTurn:', this.isMyTurn);
        console.log('  plateau.placedTiles:', Object.keys(this.plateau.placedTiles));

        if (this.firstTilePlaced) {
            const slotsToRemove = document.querySelectorAll('.slot:not(.slot-central)');
            console.log('  → Suppression de', slotsToRemove.length, 'slots existants');
            slotsToRemove.forEach(s => s.remove());
        }

        const tile = this.getTileEnMain();
        console.log('  getTileEnMain():', tile?.id || 'null');

        if (!tile) {
            console.log('  ❌ STOP: Pas de tuile');
            console.log('═══════════════════════════════════════');
            return;
        }

        const placedTilesCount = Object.keys(this.plateau.placedTiles).length;
        console.log('  Tuiles sur plateau:', placedTilesCount);

        if (placedTilesCount === 0) {
            console.log('  ❌ STOP: Plateau vide');
            console.log('═══════════════════════════════════════');
            return;
        }

        console.log('  ✅ Génération des slots...');
        for (let coord in this.plateau.placedTiles) {
            const [x, y] = coord.split(',').map(Number);
            this.generateSlotsAround(x, y, tile);
        }
        console.log('═══════════════════════════════════════');
    }

    generateSlotsAround(x, y, tile) {
        const directions = [{dx:0, dy:-1}, {dx:1, dy:0}, {dx:0, dy:1}, {dx:-1, dy:0}];
        directions.forEach(dir => {
            const nx = x + dir.dx, ny = y + dir.dy;
            const isFree   = this.plateau.isFree(nx, ny);
            const canPlace = tile && this.plateau.canPlaceTile(nx, ny, tile);

            if (tile && isFree && canPlace) {
                const slot = document.createElement('div');
                slot.className        = 'slot';
                slot.style.gridColumn = nx;
                slot.style.gridRow    = ny;

                if (!this.isMyTurn) {
                    slot.classList.add('slot-readonly');
                    slot.style.cursor        = 'default';
                    slot.style.pointerEvents = 'none';
                } else {
                    slot.onclick = () => {
                        if (this.onSlotClick) {
                            this.onSlotClick(nx, ny, this.getTileEnMain());
                        }
                    };
                }

                this.boardElement.appendChild(slot);
            }
        });
    }

    destroy() {
        console.log('🧹 SlotsUI: cleanup');
        document.querySelectorAll('.slot').forEach(el => el.remove());

        // ✅ Même référence → désabonnement effectif
        this.eventBus.off('tile-drawn',   this._onTileDrawn);
        this.eventBus.off('tile-placed',  this._onTilePlaced);
        this.eventBus.off('tile-rotated', this._onTileRotated);
        this.eventBus.off('turn-changed', this._onTurnChanged);

        this.onSlotClick = null;
    }
}
