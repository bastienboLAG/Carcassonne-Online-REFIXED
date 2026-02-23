import { Tile } from '../Tile.js';

/**
 * GameSyncCallbacks - Factorise les callbacks réseau communs à l'hôte et aux invités
 * Évite la duplication entre startGame() et startGameForInvite()
 */
export class GameSyncCallbacks {
    constructor({
        gameSync,
        gameState,
        deck,
        turnManager,
        tilePreviewUI,
        meepleDisplayUI,
        undoManager,
        scoring,
        zoneMerger,
        slotsUI,
        eventBus,
        getPlacedMeeples,
        onRemoteUndo,
        onFinalScores,
        onTileDestroyed,
        onDeckReshuffled,
        onAbbeRecalled,
        onAbbeRecalledUndo,
        updateTurnDisplay,
        poserTuileSync,
    }) {
        this.gameSync        = gameSync;
        this.gameState       = gameState;
        this.deck            = deck;
        this.turnManager     = turnManager;
        this.tilePreviewUI   = tilePreviewUI;
        this.meepleDisplayUI = meepleDisplayUI;
        this.undoManager     = undoManager;
        this.scoring         = scoring;
        this.zoneMerger      = zoneMerger;
        this.slotsUI         = slotsUI;
        this.eventBus        = eventBus;

        // Accesseurs / callbacks vers home.js
        this.getPlacedMeeples  = getPlacedMeeples;   // () => placedMeeples
        this.onRemoteUndo      = onRemoteUndo;        // (action) => void
        this.onFinalScores     = onFinalScores;       // (scores) => void
        this.onTileDestroyed   = onTileDestroyed;     // (id, name, action) => void
        this.onDeckReshuffled  = onDeckReshuffled;    // (tiles, idx) => void
        this.onAbbeRecalled    = onAbbeRecalled;      // (x, y, key, playerId, points) => void
        this.onAbbeRecalledUndo = onAbbeRecalledUndo; // (x, y, key, playerId) => void
        this.updateTurnDisplay = updateTurnDisplay;   // () => void
        this.poserTuileSync    = poserTuileSync;      // (x, y, tile) => void
    }

    /**
     * Attacher tous les callbacks sur gameSync
     * @param {boolean} isHost
     */
    attach(isHost) {
        const gs = this.gameSync;

        // ── Réception du deck (invité seulement) ──────────────────────────────
        gs.onGameStarted = (deckData, gameStateData) => {
            console.log('🎮 [INVITÉ] Pioche reçue !');
            this.deck.tiles        = deckData.tiles;
            this.deck.currentIndex = deckData.currentIndex;
            this.deck.totalTiles   = deckData.totalTiles;
            this.gameState.deserialize(gameStateData);
            this.eventBus.emit('deck-updated', {
                remaining: this.deck.remaining(),
                total:     this.deck.total()
            });
            this.updateTurnDisplay();
            this.slotsUI.createCentralSlot();
        };

        // ── Rotation d'une tuile ──────────────────────────────────────────────
        gs.onTileRotated = (rotation) => {
            const currentImg = document.getElementById('current-tile-img');
            if (currentImg) {
                const currentDeg = parseInt(
                    currentImg.style.transform.match(/rotate\((\d+)deg\)/)?.[1] || '0'
                );
                currentImg.style.transform = `rotate(${currentDeg + 90}deg)`;
            }
            this.eventBus.emit('tile-rotated', { rotation });
        };

        // ── Placement d'une tuile ─────────────────────────────────────────────
        gs.onTilePlaced = (x, y, tileId, rotation, zoneRegistryData, tileToZoneData) => {
            console.log('📍 [SYNC] Placement reçu:', x, y, tileId, rotation);
            const tileData = this.deck.tiles.find(t => t.id === tileId);
            if (tileData) {
                const tile = new Tile(tileData);
                tile.rotation = rotation;
                // Passer skipZoneMerger=true si l'hôte fournit l'état des zones
                this.poserTuileSync(x, y, tile, zoneRegistryData ? { skipZoneMerger: true } : {});
                // Appliquer l'état des zones de l'hôte directement
                if (zoneRegistryData && tileToZoneData) {
                    this.zoneMerger.registry.deserialize(zoneRegistryData);
                    this.zoneMerger.tileToZone = new Map(tileToZoneData);
                    console.log('✅ [SYNC] ZoneRegistry appliqué depuis hôte');
                }
                // ✅ Sauvegarder le snapshot APRÈS application des zones
                // (ne pas le faire dans poserTuileSync qui s'exécute avant)
                if (this.undoManager) {
                    this.undoManager.saveAfterTilePlaced(x, y, tile, this.getPlacedMeeples());
                }
            }
        };

        // ── Fin de tour ───────────────────────────────────────────────────────
        gs.onTurnEnded = (nextPlayerIndex, gameStateData) => {
            this.turnManager.receiveTurnEnded(nextPlayerIndex, gameStateData);
        };

        // ── Pioche d'une tuile ────────────────────────────────────────────────
        gs.onTileDrawn = (tileId, rotation) => {
            this.turnManager.receiveTileDrawn(tileId, rotation);
        };

        // ── Placement d'un meeple ─────────────────────────────────────────────
        gs.onMeeplePlaced = (x, y, position, meepleType, color, playerId) => {
            console.log('🎭 [SYNC] Meeple placé par un autre joueur');
            const placedMeeples = this.getPlacedMeeples();
            const key = `${x},${y},${position}`;
            placedMeeples[key] = { type: meepleType, color, playerId };
            this.meepleDisplayUI.showMeeple(x, y, position, meepleType, color);
        };

        // ── Mise à jour du compteur de meeples ───────────────────────────────
        gs.onMeepleCountUpdate = (playerId, meeples, hasAbbot) => {
            console.log('🎭 [SYNC] Mise à jour compteur reçue:', playerId, meeples, 'hasAbbot:', hasAbbot);
            const player = this.gameState.players.find(p => p.id === playerId);
            if (player) {
                player.meeples = meeples;
                if (hasAbbot !== undefined) player.hasAbbot = hasAbbot;
                this.eventBus.emit('meeple-count-updated', { playerId, meeples });
            }
        };

        // ── Mise à jour des scores ────────────────────────────────────────────
        gs.onScoreUpdate = (scoringResults, meeplesToReturn) => {
            console.log('💰 [SYNC] Mise à jour des scores reçue');
            const placedMeeples = this.getPlacedMeeples();

            scoringResults.forEach(({ playerId, points, zoneType }) => {
                const player = this.gameState.players.find(p => p.id === playerId);
                if (player) {
                    player.score += points;
                    if (zoneType === 'city')       player.scoreDetail.cities      += points;
                    else if (zoneType === 'road')  player.scoreDetail.roads       += points;
                    else if (zoneType === 'abbey') player.scoreDetail.monasteries += points;
                }
            });

            meeplesToReturn.forEach(key => {
                document.querySelectorAll(`.meeple[data-key="${key}"]`).forEach(el => el.remove());
                delete placedMeeples[key];
            });

            this.updateTurnDisplay();
        };

        // ── Annulation distante ───────────────────────────────────────────────
        gs.onTurnUndo = (undoneAction) => {
            console.log('⏪ [SYNC] Annulation distante reçue');
            this.onRemoteUndo(undoneAction);
        };

        // ── Fin de partie ─────────────────────────────────────────────────────
        gs.onGameEnded = (detailedScores, destroyedTilesCount = 0) => {
            console.log('🏁 [SYNC] Fin de partie reçue');
            this.onFinalScores(detailedScores, destroyedTilesCount);
        };

        // ── Tuile détruite ────────────────────────────────────────────────────
        gs.onTileDestroyed = (tileId, playerName, action) => {
            console.log('🗑️ [SYNC] Tuile détruite:', tileId, 'par', playerName);
            if (this.tilePreviewUI) this.tilePreviewUI.showBackside();
            this.onTileDestroyed(tileId, playerName, action);
        };

        // ── Deck remélangé ────────────────────────────────────────────────────
        gs.onAbbeRecalled = (x, y, key, playerId, points) => {
            if (this.onAbbeRecalled) this.onAbbeRecalled(x, y, key, playerId, points);
        };

        gs.onAbbeRecalledUndo = (x, y, key, playerId) => {
            if (this.onAbbeRecalledUndo) this.onAbbeRecalledUndo(x, y, key, playerId);
        };

        gs.onDeckReshuffled = (tiles, currentIndex) => {
            console.log('🔀 [SYNC] Réception deck remélangé, currentIndex:', currentIndex);
            this.deck.tiles        = tiles;
            this.deck.currentIndex = currentIndex;
            this.onDeckReshuffled(tiles, currentIndex);
        };
    }
}
