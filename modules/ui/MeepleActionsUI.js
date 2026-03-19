/**
 * MeepleActionsUI — UI des actions meeple sur le plateau
 * (rappel abbé, fée, princesse, portail magique)
 *
 * Dépendances injectées via initMeepleActionsUI()
 */

let _deps = null;

export function initMeepleActionsUI(deps) {
    _deps = deps;
}

// ── Helpers internes ───────────────────────────────────────────────────────

function _gs()            { return _deps.getGameState(); }
function _mp()            { return _deps.getMultiplayer(); }
function _pm()            { return _deps.getPlacedMeeples(); }
function _plateau()       { return _deps.getPlateau(); }

// ── Curseurs ───────────────────────────────────────────────────────────────

export function clearFairyCursors() {
    document.querySelectorAll('.fairy-cursor,.fairy-cursor-overlay,.meeple-action-cursor,.meeple-action-overlay').forEach(el => el.remove());
}

export function hideAllCursors() {
    _deps.getMeepleCursorsUI()?.hideCursors();
    clearFairyCursors();
}

export function showFairyTargets() {
    showMeepleActionCursors();
}

// ── Placement fée ──────────────────────────────────────────────────────────

export function handleFairyPlacement(meepleKey) {
    clearFairyCursors();
    const dragonRules = _deps.getDragonRules();
    if (!dragonRules) return;

    const multiplayer = _mp();
    dragonRules.placeFairy(multiplayer.playerId, meepleKey);
    _deps.renderFairyPiece(meepleKey);
    const undoManager = _deps.getUndoManager();
    if (undoManager) undoManager.markFairyPlaced();

    const gameSync = _deps.getGameSync();
    if (gameSync) {
        multiplayer.broadcast({
            type: 'fairy-placed-sync',
            ownerId:   multiplayer.playerId,
            meepleKey,
        });
    }

    hideAllCursors();
    _deps.updateTurnDisplay();
}


export function countAbbePoints(x, y) {
    let count = 1;
    const dirs = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
    dirs.forEach(([dx, dy]) => {
        if (_plateau().placedTiles[`${x+dx},${y+dy}`]) count++;
    });
    return count;
}

// ── Rappel abbé ────────────────────────────────────────────────────────────

export function handleAbbeRecall(x, y, key, meeple) {
    console.log('↩️ Rappel Abbé:', key);

    const points       = countAbbePoints(x, y);
    const placedMeeples = _pm();
    const gameState    = _gs();
    const eventBus     = _deps.getEventBus();
    const undoManager  = _deps.getUndoManager();
    const gameSync     = _deps.getGameSync();

    // Retirer l'Abbé du plateau visuellement
    document.querySelectorAll(`.meeple[data-key="${key}"]`).forEach(el => el.remove());

    // Mettre à jour placedMeeples
    delete placedMeeples[key];
    _deps.releaseFairyIfDetached(key);

    // Rendre l'Abbé au joueur
    const player = gameState.players.find(p => p.id === meeple.playerId);
    if (player) {
        player.hasAbbot = true;
        eventBus.emit('meeple-count-updated', { playerId: meeple.playerId });
    }

    // Cacher les overlays
    _deps.hideAllCursors();

    // Marquer dans UndoManager
    if (undoManager) undoManager.markAbbeRecalled(x, y, key, meeple.playerId, points);

    // Stocker les points à ajouter en fin de tour
    _deps.setPendingAbbePoints({ playerId: meeple.playerId, points });

    // Sync réseau
    if (gameSync) gameSync.syncAbbeRecall(x, y, key, meeple.playerId, points);

    _deps.updateTurnDisplay();
    _deps.updateMobileButtons();
    eventBus.emit('score-updated');
}
