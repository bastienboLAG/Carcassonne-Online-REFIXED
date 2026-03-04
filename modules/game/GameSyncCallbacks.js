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
        onBonusTurnStarted,
        updateTurnDisplay,
        poserTuileSync,
        afficherMessage,
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
        this.onAbbeRecalledUndo  = onAbbeRecalledUndo;  // (x, y, key, playerId) => void
        this.onBonusTurnStarted  = onBonusTurnStarted ?? null; // (playerId) => void
        this.updateTurnDisplay = updateTurnDisplay;   // () => void
        this.poserTuileSync    = poserTuileSync;      // (x, y, tile) => void
        this.afficherMessage   = afficherMessage;     // (msg) => void
        this.onGamePaused      = null; // (name, ms) => void
        this.onGameResumed     = null; // (reason) => void
        this.onFullStateSync   = null; // (data) => void
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
            this.gameState.currentTilePlaced = true;
            const tileData = this.deck.tiles.find(t => t.id === tileId);
            if (tileData) {
                const tile = new Tile(tileData);
                tile.rotation = rotation;
                // skipValidation=true : l'hôte a déjà validé, on ne revalide pas côté invité
                // skipZoneMerger=true si l'hôte fournit l'état des zones
                this.poserTuileSync(x, y, tile, {
                    skipValidation: true,
                    ...(zoneRegistryData ? { skipZoneMerger: true } : {})
                });
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
        gs.onTurnEnded = (nextPlayerIndex, gameStateData, isBonusTurn = false, nextTileId = null) => {
            this.gameState.currentTilePlaced = false;
            this.turnManager.receiveTurnEnded(nextPlayerIndex, gameStateData, isBonusTurn, nextTileId);
            // Si tour bonus : afficher le toast ici — plus besoin du message bonus-turn-started séparé
            if (isBonusTurn && this.onBonusTurnStarted) {
                const currentPlayer = this.gameState.getCurrentPlayer();
                this.onBonusTurnStarted(currentPlayer?.id);
            }
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
        gs.onMeepleCountUpdate = (playerId, meeples, hasAbbot, hasLargeMeeple, hasPig) => {
            console.log('🎭 [SYNC] Mise à jour compteur reçue:', playerId, meeples, 'hasAbbot:', hasAbbot, 'hasLarge:', hasLargeMeeple, 'hasPig:', hasPig);
            const player = this.gameState.players.find(p => p.id === playerId);
            if (player) {
                player.meeples = meeples;
                if (hasAbbot       !== undefined) player.hasAbbot       = hasAbbot;
                if (hasLargeMeeple !== undefined) player.hasLargeMeeple = hasLargeMeeple;
                if (hasPig         !== undefined) player.hasPig         = hasPig;
                this.eventBus.emit('meeple-count-updated', { playerId, meeples });
            }
        };

        // ── Mise à jour des scores ────────────────────────────────────────────
        gs.onScoreUpdate = (scoringResults, meeplesToReturn, goodsResults = [], zoneRegistryData = null, tileToZoneData = null) => {
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

            // Appliquer les jetons de marchandises
            goodsResults.forEach(({ playerId, cloth, wheat, wine }) => {
                const player = this.gameState.players.find(p => p.id === playerId);
                if (player) {
                    player.goods = player.goods || { cloth: 0, wheat: 0, wine: 0 };
                    player.goods.cloth += cloth;
                    player.goods.wheat += wheat;
                    player.goods.wine  += wine;
                }
            });

            // Appliquer le zoneRegistry post-scoring (goods vidés) envoyé par l'hôte
            if (zoneRegistryData) {
                this.zoneMerger.registry.deserialize(zoneRegistryData);
                if (tileToZoneData) {
                    this.zoneMerger.tileToZone = new Map(tileToZoneData);
                }
                console.log('✅ [SYNC] ZoneRegistry post-scoring appliqué (goods mis à jour)');
            }

            meeplesToReturn.forEach(key => {
                document.querySelectorAll(`.meeple[data-key="${key}"]`).forEach(el => el.remove());
                const meeple = placedMeeples[key];
                if (meeple) {
                    const player = this.gameState.players.find(p => p.id === meeple.playerId);
                    if (player) {
                        if (meeple.type === 'Abbot') {
                            player.hasAbbot = true;
                        } else if (meeple.type === 'Large' || meeple.type === 'Large-Farmer') {
                            player.hasLargeMeeple = true;
                        } else if (meeple.type === 'Builder') {
                            player.hasBuilder = true;
                        } else if (meeple.type === 'Pig') {
                            player.hasPig = true;
                        } else {
                            player.meeples = (player.meeples || 0) + 1;
                        }
                        this.eventBus.emit('meeple-count-updated', { playerId: meeple.playerId });
                    }
                }
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
        gs.onPlayerDisconnected = (peerId, playerName, nextPlayerIndex) => {
            console.log('👋 [SYNC] Joueur déconnecté:', playerName);
            // Marquer déconnecté (sans supprimer) côté invité
            if (this.gameState) {
                this.gameState.markDisconnected(peerId);
                this.gameState.currentPlayerIndex = nextPlayerIndex;
            }
            if (this.afficherMessage) this.afficherMessage(`💔 ${playerName} s'est déconnecté.`);
            if (this.onGamePaused) this.onGamePaused(playerName, null);
            // Mettre à jour le tour
            if (this.turnManager) {
                this.turnManager.updateTurnState();
                this.turnManager.eventBus.emit('turn-changed', {
                    isMyTurn: this.turnManager.isMyTurn,
                    currentPlayer: this.turnManager.getCurrentPlayer()
                });
            }
        };

        gs.onGamePaused  = (name, ms) => { if (this.onGamePaused)  this.onGamePaused(name, ms); };
        gs.onGameResumed = (reason)   => { if (this.onGameResumed) this.onGameResumed(reason); };
        gs.onFullStateSync = (data)   => { if (this.onFullStateSync) this.onFullStateSync(data); };

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
