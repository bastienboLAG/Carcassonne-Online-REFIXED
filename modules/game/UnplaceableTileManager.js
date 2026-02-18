/**
 * UnplaceableTileManager - Gère la logique de tuile implaçable
 * Extrait de home.js pour alléger le fichier principal
 */
export class UnplaceableTileManager {
    constructor({ deck, gameState, tilePreviewUI, gameSync, gameConfig, setRedrawMode }) {
        this.deck          = deck;
        this.gameState     = gameState;
        this.tilePreviewUI = tilePreviewUI;
        this.gameSync      = gameSync;
        this.gameConfig    = gameConfig;
        this.setRedrawMode = setRedrawMode;
    }

    /**
     * Vérifie si une tuile peut être posée quelque part sur le plateau
     */
    isTilePlaceable(tile, plateau) {
        if (!plateau) return true;

        const placedCount = Object.keys(plateau.placedTiles).length;
        if (placedCount === 0) return true;

        const rotations = [0, 90, 180, 270];
        const originalRotation = tile.rotation;

        for (const rotation of rotations) {
            tile.rotation = rotation;
            for (const coord in plateau.placedTiles) {
                const [x, y] = coord.split(',').map(Number);
                const directions = [{dx:0,dy:-1},{dx:1,dy:0},{dx:0,dy:1},{dx:-1,dy:0}];
                for (const {dx, dy} of directions) {
                    const nx = x + dx, ny = y + dy;
                    if (plateau.isFree(nx, ny) && plateau.canPlaceTile(nx, ny, tile)) {
                        tile.rotation = originalRotation;
                        return true;
                    }
                }
            }
        }

        tile.rotation = originalRotation;
        return false;
    }

    /**
     * Afficher le badge + modale tuile implaçable
     */
    showUnplaceableBadge(tile, actionText) {
        const badge     = document.getElementById('unplaceable-badge');
        const modal     = document.getElementById('unplaceable-modal');
        const modalText = document.getElementById('unplaceable-modal-text');

        modalText.textContent = `Cette tuile ne peut être placée nulle part sur le plateau. Elle va être ${actionText}.`;
        badge.style.display = 'block';
        modal.style.display = 'flex';

        badge.onclick = () => { modal.style.display = 'flex'; };
        document.getElementById('unplaceable-examine-btn').onclick = () => {
            modal.style.display = 'none';
        };
    }

    /**
     * Cacher le badge et la modale implaçable
     */
    hideUnplaceableBadge() {
        document.getElementById('unplaceable-badge').style.display = 'none';
        document.getElementById('unplaceable-modal').style.display = 'none';
    }

    /**
     * Afficher la modale info destruction/remélange
     */
    showTileDestroyedModal(tileId, playerName, isActivePlayer, action) {
        const modal = document.getElementById('tile-destroyed-modal');
        const text  = document.getElementById('tile-destroyed-text');
        const title = modal.querySelector('h2');

        if (action === 'reshuffle') {
            title.textContent = '🎲 Tuile remélangée';
            text.textContent  = isActivePlayer
                ? `La tuile ${tileId} était impossible à placer, elle a été remise dans la pioche. Cliquez sur Repiocher pour continuer.`
                : `La tuile ${tileId} était impossible à placer, elle a été remise dans la pioche. ${playerName} va repiocher.`;
        } else {
            title.textContent = '🗑️ Tuile détruite';
            text.textContent  = isActivePlayer
                ? `La tuile ${tileId} était impossible à placer, elle a été détruite. Cliquez sur Repiocher pour continuer.`
                : `La tuile ${tileId} était impossible à placer, elle a été détruite. ${playerName} va repiocher.`;
        }

        modal.style.display = 'flex';
    }

    /**
     * Gestion du clic "Confirmer" sur la modale implaçable
     */
    handleConfirm(tuileEnMain, gameSync) {
        const currentPlayer = this.gameState?.getCurrentPlayer();
        const tileId        = tuileEnMain?.id || '?';
        const playerName    = currentPlayer?.name || '?';
        const action        = this.gameConfig?.unplaceableAction || 'destroy';

        this.hideUnplaceableBadge();

        if (this.tilePreviewUI) this.tilePreviewUI.showBackside();

        if (action === 'reshuffle' && this.deck && tuileEnMain) {
            console.log('🔀 Remise de la tuile dans la pioche + mélange');
            const tileData = { id: tuileEnMain.id, zones: tuileEnMain.zones, imagePath: tuileEnMain.imagePath };
            this.deck.tiles.splice(this.deck.currentIndex, 0, tileData);

            const remaining = this.deck.tiles.slice(this.deck.currentIndex);
            for (let i = remaining.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
            }
            this.deck.tiles.splice(this.deck.currentIndex, remaining.length, ...remaining);

            if (gameSync) gameSync.syncDeckReshuffle(this.deck.tiles, this.deck.currentIndex);
        }

        this.showTileDestroyedModal(tileId, playerName, true, action);

        if (gameSync) gameSync.syncTileDestroyed(tileId, playerName, action);

        this.setRedrawMode(true);
    }
}
