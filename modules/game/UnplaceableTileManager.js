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

        // Tuiles rivière vues comme implaçables depuis le dernier placement réussi
        this._seenImplacableRiver = new Set();
        // IDs des tuiles rivière à tester (capturés à la première alerte)
        this._riverTilesToTest = null;
    }

    /**
     * Réinitialiser le suivi des tuiles implaçables (appelé après chaque placement réussi)
     */
    resetSeenImplacable() {
        this._seenImplacableRiver.clear();
        this._riverTilesToTest = null;
    }

    /**
     * Vérifie si une tuile peut être posée quelque part sur le plateau
     */
    isTilePlaceable(tile, plateau, isRiverPhase = false) {
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
                    if (plateau.isFree(nx, ny) && plateau.canPlaceTile(nx, ny, tile, isRiverPhase)) {
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
    showTileDestroyedModal(tileId, playerName, isActivePlayer, action, isRiver = false, extraMessage = null) {
        const modal = document.getElementById('tile-destroyed-modal');
        const text  = document.getElementById('tile-destroyed-text');
        const title = modal.querySelector('h2');

        const riverNote = isRiver ? ' (tuile rivière)' : '';

        if (extraMessage) {
            title.textContent = '🌊 Rivière bloquée';
            text.textContent  = extraMessage;
        } else if (action === 'reshuffle') {
            title.textContent = '🎲 Tuile remélangée';
            text.textContent  = isActivePlayer
                ? `La tuile ${tileId}${riverNote} était impossible à placer, elle a été remise dans la rivière. Cliquez sur Repiocher pour continuer.`
                : `La tuile ${tileId}${riverNote} était impossible à placer, elle a été remise dans la rivière. ${playerName} va repiocher.`;
        } else {
            title.textContent = '🗑️ Tuile détruite';
            text.textContent  = isActivePlayer
                ? `La tuile ${tileId}${riverNote} était impossible à placer, elle a été détruite. Cliquez sur Repiocher pour continuer.`
                : `La tuile ${tileId}${riverNote} était impossible à placer, elle a été détruite. ${playerName} va repiocher.`;
        }

        modal.style.display = 'flex';
    }

    /**
     * Détruire une tuile dans le deck (la retirer physiquement + décrémenter total)
     */
    _destroyTileAtIndex(idx) {
        this.deck.tiles.splice(idx, 1);
        this.deck.totalTiles--;
        if (this.gameState) this.gameState.destroyedTilesCount++;
        // currentIndex ne change pas — la prochaine tuile prend la place de l'ancienne
    }

    /**
     * Vérifier si toutes les tuiles rivière restantes (sauf river-12) ont été vues comme implaçables
     * Si oui, déclencher la destruction en chaîne
     */
    _checkRiverAllImplacable(currentTileId, gameSync) {
        const idx = this.deck.currentIndex - 1;

        // À la première alerte, capturer les IDs des tuiles rivière restantes (sans river-12)
        if (!this._riverTilesToTest) {
            this._riverTilesToTest = new Set(
                this.deck.tiles.slice(idx, 11).map(t => t.id)
            );
            console.log('🌊 Capture des tuiles rivière à tester:', [...this._riverTilesToTest]);
        }

        // Ajouter la tuile courante aux vues
        this._seenImplacableRiver.add(currentTileId);

        // Vérifier si toutes les tuiles capturées ont été vues
        const allSeen = [...this._riverTilesToTest].every(id => this._seenImplacableRiver.has(id));

        if (!allSeen) return false;

        // Toutes vues → destruction en chaîne jusqu'à river-12
        const currentPlayer = this.gameState?.getCurrentPlayer();
        const playerName    = currentPlayer?.name || '?';
        const count         = riverRemaining.length;

        console.log(`🌊 Toutes les tuiles rivière implaçables — destruction de ${count} tuile(s)`);

        // Détruire toutes les tuiles entre idx et 10 inclus
        // On supprime depuis la fin pour ne pas décaler les indices
        for (let i = 10; i >= idx; i--) {
            if (this.deck.tiles[i] && this.deck.tiles[i].id !== 'river-12') {
                this.deck.tiles.splice(i, 1);
                this.deck.totalTiles--;
                if (this.gameState) this.gameState.destroyedTilesCount++;
            }
        }
        // currentIndex pointe maintenant sur river-12
        this.deck.currentIndex = idx;

        if (gameSync) gameSync.syncDeckReshuffle(this.deck.tiles, this.deck.currentIndex);

        const msg = isActivePlayer =>
            isActivePlayer
                ? `La rivière était complètement bloquée. ${count} tuile(s) rivière ont été détruites. River-12 (embouchure) va maintenant être piochée.`
                : `La rivière était complètement bloquée. ${count} tuile(s) rivière ont été détruites. ${playerName} va piocher l'embouchure.`;

        this.showTileDestroyedModal('?', playerName, true, 'destroy', true, msg(true));
        if (gameSync) gameSync.syncTileDestroyed(`[${count} tuiles rivière]`, playerName, 'destroy');

        this._seenImplacableRiver.clear();
        this._riverTilesToTest = null;
        this.setRedrawMode(true);
        return true;
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

        const idx     = (this.deck?.currentIndex ?? 1) - 1;
        const isRiver = idx < 12 && tuileEnMain?.id?.startsWith('river-');

        if (action === 'reshuffle' && this.deck && tuileEnMain) {
            const idx     = this.deck.currentIndex - 1;
            const isRiver = idx < 12 && tuileEnMain.id?.startsWith('river-');

            if (isRiver) {
                // Vérifier si river-12 → traitement spécial
                if (tuileEnMain.id === 'river-12') {
                    // River-12 implaçable → destruction forcée, message adapté
                    console.log('🌊 river-12 implaçable — détruite, fin de rivière');
                    this._destroyTileAtIndex(idx);
                    if (gameSync) gameSync.syncDeckReshuffle(this.deck.tiles, this.deck.currentIndex);
                    const msg = `L'embouchure (river-12) était impossible à placer et a été détruite. La rivière se termine sans embouchure. Cliquez sur Repiocher pour continuer avec les tuiles normales.`;
                    this.showTileDestroyedModal(tileId, playerName, true, 'destroy', true, msg);
                    if (gameSync) gameSync.syncTileDestroyed(tileId, playerName, 'destroy');
                    this._seenImplacableRiver.clear();
                    this._riverTilesToTest = null;
                    this.setRedrawMode(true);
                    return;
                }

                // Vérifier si toutes les tuiles rivière ont été vues → destruction en chaîne
                if (this._checkRiverAllImplacable(tileId, gameSync)) return;

                // Remélange normal dans la rivière
                console.log('🌊 Tuile rivière implaçable — remélange dans la rivière');
                const sub = this.deck.tiles.slice(idx, 11);
                for (let i = sub.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [sub[i], sub[j]] = [sub[j], sub[i]];
                }
                this.deck.tiles.splice(idx, sub.length, ...sub);
                this.deck.currentIndex--;
                if (gameSync) gameSync.syncDeckReshuffle(this.deck.tiles, this.deck.currentIndex);

            } else {
                // Phase normale : mélanger toutes les tuiles restantes
                console.log('🔀 Remise de la tuile dans la pioche + mélange');
                const tileData = { id: tuileEnMain.id, zones: tuileEnMain.zones, imagePath: tuileEnMain.imagePath };
                const remaining = this.deck.tiles.slice(idx);
                for (let i = remaining.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
                }
                this.deck.tiles.splice(idx, remaining.length, ...remaining);
                this.deck.currentIndex--;
                if (gameSync) gameSync.syncDeckReshuffle(this.deck.tiles, this.deck.currentIndex);
            }

        } else if (action === 'destroy' && this.deck && tuileEnMain) {
            const idx     = this.deck.currentIndex - 1;
            const isRiver = idx < 12 && tuileEnMain.id?.startsWith('river-');

            if (isRiver) {
                if (tuileEnMain.id === 'river-12') {
                    console.log('🌊 river-12 implaçable — détruite, fin de rivière');
                    const msg = `L'embouchure (river-12) était impossible à placer et a été détruite. La rivière se termine sans embouchure. Cliquez sur Repiocher pour continuer avec les tuiles normales.`;
                    this._destroyTileAtIndex(idx);
                    this.deck.currentIndex--;
                    if (gameSync) gameSync.syncDeckReshuffle(this.deck.tiles, this.deck.currentIndex);
                    this.showTileDestroyedModal(tileId, playerName, true, 'destroy', true, msg);
                    if (gameSync) gameSync.syncTileDestroyed(tileId, playerName, 'destroy');
                    this._seenImplacableRiver.clear();
                    this._riverTilesToTest = null;
                    this.setRedrawMode(true);
                    return;
                }
                // Destroy rivière : détruire la tuile courante
                // currentIndex-- car splice décale les tuiles suivantes d'un cran
                console.log('🌊 Tuile rivière implaçable — détruite, rivière continue');
                this._destroyTileAtIndex(idx);
                this.deck.currentIndex--;
                if (gameSync) gameSync.syncDeckReshuffle(this.deck.tiles, this.deck.currentIndex);
            } else {
                // Destroy normal : détruire la tuile du deck
                // currentIndex-- car splice décale les tuiles suivantes d'un cran
                this._destroyTileAtIndex(idx);
                this.deck.currentIndex--;
            }
        }

        this.showTileDestroyedModal(tileId, playerName, true, action, isRiver);
        if (gameSync) gameSync.syncTileDestroyed(tileId, playerName, action);
        this.setRedrawMode(true);
    }
}
