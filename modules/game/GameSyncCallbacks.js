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
        unplaceableManager,
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
        onUnplaceableHandled,
        updateTurnDisplay,
        poserTuileSync,
        afficherMessage,
        onUpdateMobileTilePreview = null,
        isHost = false,
    }) {
        this.gameSync        = gameSync;
        this.gameState       = gameState;
        this.deck            = deck;
        this.turnManager     = turnManager;
        this.tilePreviewUI   = tilePreviewUI;
        this.meepleDisplayUI     = meepleDisplayUI;
        this.undoManager         = undoManager;
        this.unplaceableManager  = unplaceableManager ?? null;
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
        this.onUnplaceableHandled = onUnplaceableHandled ?? null; // (tileId, name, action, isRiver, isActivePlayer) => void
        this.updateTurnDisplay = updateTurnDisplay;   // () => void
        this.poserTuileSync    = poserTuileSync;      // (x, y, tile) => void
        this.afficherMessage   = afficherMessage;     // (msg) => void
        this.onUpdateMobileTilePreview = onUpdateMobileTilePreview; // () => void — preview mobile
        this.isHost            = isHost;
        this.onGamePaused      = null; // (name) => void
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
            // Accumule le CSS +90 pour éviter l'animation à rebours (270°→0° via CSS absolu)
            const currentImg = document.getElementById('current-tile-img');
            if (currentImg) {
                const currentDeg = parseInt(currentImg.style.transform.match(/rotate\((\d+)deg\)/)?.[1] || '0');
                currentImg.style.transform = `rotate(${currentDeg + 90}deg)`;
            }
            this.eventBus.emit('tile-rotated', { rotation });
        };

        // ── Demande de placement d'une tuile (invité → hôte, étape 2) ──────────
        gs.onTilePlacedRequest = (x, y, tileId, rotation, fromPlayerId) => {
            console.log('📍 [HÔTE] tile-placed-request de:', fromPlayerId, x, y, tileId);
            const tileData = this.deck.tiles.find(t => t.id === tileId);
            if (!tileData) return;
            const tile = new Tile(tileData);
            tile.rotation = rotation;

            // Appliquer côté hôte
            this.poserTuileSync(x, y, tile, { skipValidation: false });
            this.undoManager?.saveAfterTilePlaced(x, y, tile, this.getPlacedMeeples());

            // Marquer la tuile comme posée côté hôte (sinon full-state-sync enverrait tuilePosee:false)
            this.gameState.currentTilePlaced = true;

            // Broadcast tile-placed à tous (y compris l'émetteur)
            gs.multiplayer.broadcast({
                type: 'tile-placed',
                x, y,
                tileId: tile.id,
                rotation: tile.rotation,
                playerId: fromPlayerId,
                zoneRegistry: this.zoneMerger.registry.serialize(),
                tileToZone:   Array.from(this.zoneMerger.tileToZone.entries())
            });
        };

        // ── Placement d'une tuile (broadcast reçu) ───────────────────────────
        gs.onTilePlaced = (x, y, tileId, rotation, zoneRegistryData, tileToZoneData) => {
            console.log('📍 [SYNC] Placement reçu:', x, y, tileId, rotation);
            this.gameState.currentTilePlaced = true;
            const tileData = this.deck.tiles.find(t => t.id === tileId);
            if (!tileData) return;

            const tile = new Tile(tileData);
            tile.rotation = rotation;

            this.poserTuileSync(x, y, tile, {
                skipValidation: true,
                ...(zoneRegistryData ? { skipZoneMerger: true } : {})
            });

            if (zoneRegistryData && tileToZoneData) {
                this.zoneMerger.registry.deserialize(zoneRegistryData);
                this.zoneMerger.tileToZone = new Map(tileToZoneData);
                console.log('✅ [SYNC] ZoneRegistry appliqué depuis hôte');
            }

            if (this.undoManager && this.isHost) {
                this.undoManager.saveAfterTilePlaced(x, y, tile, this.getPlacedMeeples());
            }

            // ✅ Émettre tile-placed-own APRÈS la désérialisation du zoneRegistry
            // pour que la détection princesse/fée ait accès aux zones fusionnées.
            if (!this.isHost && this.turnManager?.isMyTurn) {
                console.log('📍 [INVITÉ] Echo reçu — affichage curseurs meeple');
                this.eventBus.emit('tile-placed-own', { x, y, tile });
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

        // ── Placement d'un meeple (broadcast reçu) ───────────────────────────
        gs.onMeeplePlaced = (x, y, position, meepleType, color, playerId) => {
            console.log('🎭 [SYNC] Meeple placé reçu');
            const placedMeeples = this.getPlacedMeeples();
            const key = `${x},${y},${position}`;
            placedMeeples[key] = { type: meepleType, color, playerId };
            this.meepleDisplayUI.showMeeple(x, y, position, meepleType, color);

            // ✅ Étape 3 : si c'est notre propre echo, mettre à jour état local + cacher curseurs
            if (!this.isHost && playerId === gs.multiplayer.playerId) {
                const player = this.gameState.players.find(p => p.id === playerId);
                if (player) {
                    // Le meeple-count-update arrivera juste après et mettra à jour les compteurs
                }
                this.eventBus.emit('meeple-placed-own', { x, y, position, meepleType });
            }
        };

        // ── Mise à jour du compteur de meeples ───────────────────────────────
        gs.onMeepleCountUpdate = (playerId, meeples, hasAbbot, hasLargeMeeple, hasBuilder, hasPig) => {
            console.log('🎭 [SYNC] Mise à jour compteur reçue:', playerId, meeples, 'hasAbbot:', hasAbbot, 'hasLarge:', hasLargeMeeple, 'hasBuilder:', hasBuilder, 'hasPig:', hasPig);
            const player = this.gameState.players.find(p => p.id === playerId);
            if (player) {
                player.meeples = meeples;
                if (hasAbbot       !== undefined) player.hasAbbot       = hasAbbot;
                if (hasLargeMeeple !== undefined) player.hasLargeMeeple = hasLargeMeeple;
                if (hasBuilder     !== undefined) player.hasBuilder     = hasBuilder;
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
                    player.scoreDetail = player.scoreDetail || {};
                    if (zoneType === 'city')             player.scoreDetail.cities      = (player.scoreDetail.cities      || 0) + points;
                    else if (zoneType === 'road')        player.scoreDetail.roads       = (player.scoreDetail.roads       || 0) + points;
                    else if (zoneType === 'abbey')       player.scoreDetail.monasteries = (player.scoreDetail.monasteries || 0) + points;
                    else if (zoneType === 'fairy-turn'
                          || zoneType === 'fairy')      player.scoreDetail.fairy        = (player.scoreDetail.fairy        || 0) + points;
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
                            if (player.meeples < 7) player.meeples++;
                        }
                        this.eventBus.emit('meeple-count-updated', { playerId: meeple.playerId });
                    }
                }
                delete placedMeeples[key];
            });

            this.updateTurnDisplay();

            // Si la fée est maintenant seule sur le plateau (son meeple vient d'être rendu),
            // réafficher les curseurs de la fée pour que le joueur puisse la réassigner.
            if (this.gameState.fairyState?.meepleKey === null
                && this.gameState.fairyState?.ownerId === null) {
                // La fée vient d'être détachée — réafficher les cibles si c'est notre tour
                this.eventBus.emit('fairy-detached-show-targets');
            }
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

        gs.onGamePaused  = (name) => { if (this.onGamePaused)  this.onGamePaused(name); };
        gs.onGameResumed = (reason)   => { if (this.onGameResumed) this.onGameResumed(reason); };
        gs.onFullStateSync = (data)   => { if (this.onFullStateSync) this.onFullStateSync(data); };

        gs.onGameEnded = (detailedScores, destroyedTilesCount = 0) => {
            console.log('🏁 [SYNC] Fin de partie reçue');
            this.onFinalScores(detailedScores, destroyedTilesCount);
        };

        // ── Tuile détruite ────────────────────────────────────────────────────
        gs.onTileDestroyed = (tileId, playerName, action, count, playerId) => {
            console.log('🗑️ [SYNC] Tuile détruite:', tileId, 'par', playerName);
            if (this.tilePreviewUI) this.tilePreviewUI.showBackside();
            if (this.onUpdateMobileTilePreview) this.onUpdateMobileTilePreview();
            this.onTileDestroyed(tileId, playerName, action, count, playerId);
        };

        // ── Tuile donnée directement par l'hôte (après implaçable) ─────────
        gs.onYourTurn = (tileId) => {
            console.log('🎲 [INVITÉ] your-turn reçu:', tileId);
            this.turnManager.receiveYourTurn(tileId);
        };

        // ── Tuile implaçable traitée par l'hôte ───────────────────────────────
        gs.onUnplaceableHandled = (tileId, playerName, action, isRiver, activePeerId) => {
            console.log('🚫 [SYNC] Tuile implaçable traitée:', tileId);
            // Fermer la modale implaçable (badge + modale confirmer)
            if (this.unplaceableManager) this.unplaceableManager.hideUnplaceableBadge();
            // Afficher le verso dans la preview
            if (this.tilePreviewUI) this.tilePreviewUI.showBackside();
            // Si c'est notre tour (invité actif) → modale avec repiocher, sinon info
            const isActivePlayer = activePeerId === this.gameSync?.multiplayer?.playerId;
            if (this.onUnplaceableHandled) this.onUnplaceableHandled(tileId, playerName, action, isRiver, isActivePlayer);
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
