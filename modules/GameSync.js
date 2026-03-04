/**
 * Gère la synchronisation du jeu en multijoueur
 */
export class GameSync {
    constructor(multiplayer, gameState, originalHandler = null) {
        this.multiplayer = multiplayer;
        this.gameState = gameState;
        this.isHost = multiplayer.isHost;
        this.originalHandler = originalHandler; // Handler du lobby à préserver
        
        // Callbacks pour les actions de jeu
        this.onDeckReceived = null;
        this.onTileRotated = null;
        this.onTilePlaced = null;
        this.onTurnEnded        = null;
        this.onGameStarted = null;
        this.onTileDrawn = null;
        this.onMeeplePlaced = null;
        this.onScoreUpdate = null;
        this.onTurnUndo = null;
        this.onGameEnded = null;
        this.onPlayerDisconnected = null;
        this.onTileDestroyed = null;
        this.onDeckReshuffled = null;
    }

    /**
     * Initialiser les listeners pour les messages réseau
     */
    init() {
        // Utiliser le handler original sauvegardé, sinon l'actuel
        const previousHandler = this.originalHandler || this.multiplayer.onDataReceived;
        
        this.multiplayer.onDataReceived = (data, from) => {
            // D'abord essayer de gérer comme message de jeu
            if (this._isGameMessage(data.type)) {
                this._handleGameMessage(data, from);
            } else if (previousHandler) {
                // Sinon appeler l'ancien handler (pour game-starting, etc.)
                previousHandler(data, from);
            }
        };
    }
    
    /**
     * Vérifier si un message est un message de jeu (géré par GameSync)
     */
    _isGameMessage(type) {
        const gameMessages = [
            'game-start', 'tile-rotated', 'tile-placed', 'turn-ended',
            'tile-drawn', 'meeple-placed', 'meeple-count-update', 'score-update',
            'turn-undo', 'game-ended', 'tile-destroyed', 'deck-reshuffled', 'player-disconnected',
            'game-paused', 'game-resumed', 'full-state-sync', 'rejoin-accepted', 'rejoin-rejected',
            'abbe-recalled', 'abbe-recalled-undo',
            'turn-end-request'
            // NOTE: 'return-to-lobby', 'player-order-update' et 'game-starting' 
            //       sont gérés par le lobby handler
        ];
        return gameMessages.includes(type);
    }

    /**
     * [HÔTE] Démarrer la partie et envoyer la pioche à tous
     */
    startGame(deck) {
        if (!this.isHost) return;

        const deckData = {
            tiles: deck.tiles,
            currentIndex: deck.currentIndex,
            totalTiles: deck.totalTiles
        };

        console.log('🎮 [HÔTE] Envoi de la pioche aux joueurs...');
        
        this.multiplayer.broadcast({
            type: 'game-start',
            deck: deckData,
            gameState: this.gameState.serialize()
        });
    }

    /**
     * Synchroniser la rotation d'une tuile
     */
    syncTileRotation(rotation) {
        console.log('🔄 Sync rotation:', rotation);
        this.multiplayer.broadcast({
            type: 'tile-rotated',
            rotation: rotation,
            playerId: this.multiplayer.playerId
        });
    }

    /**
     * Synchroniser le placement d'une tuile
     */
    syncTilePlacement(x, y, tile, zoneMerger) {
        console.log('📍 Sync placement:', x, y, tile.id, tile.rotation);
        this.multiplayer.broadcast({
            type: 'tile-placed',
            x: x,
            y: y,
            tileId: tile.id,
            rotation: tile.rotation,
            playerId: this.multiplayer.playerId,
            zoneRegistry: zoneMerger ? zoneMerger.registry.serialize() : null,
            tileToZone:   zoneMerger ? Array.from(zoneMerger.tileToZone.entries()) : null
        });
    }

    /**
     * Synchroniser la fin du tour
     */
    syncTurnEnd(isBonusTurn = false, nextTileId = null) {
        console.log('⏭️ Sync fin de tour — isBonusTurn:', isBonusTurn, 'nextTileId:', nextTileId);

        this.multiplayer.broadcast({
            type: 'turn-ended',
            playerId: this.multiplayer.playerId,
            nextPlayerIndex: this.gameState.currentPlayerIndex,
            gameState: this.gameState.serialize(),
            isBonusTurn: isBonusTurn,
            nextTileId: nextTileId
        });

        return true;
    }

    /**
     * Invité → hôte : demande de fin de tour
     */
    syncTurnEndRequest(isBonusTurn = false) {
        console.log('⏭️ [INVITÉ] Demande fin de tour — isBonusTurn:', isBonusTurn);
        const hostConn = this.multiplayer.connections[0];
        if (hostConn && hostConn.open) {
            hostConn.send({
                type: 'turn-end-request',
                playerId: this.multiplayer.playerId,
                nextPlayerIndex: this.gameState.currentPlayerIndex,
                gameState: this.gameState.serialize(),
                isBonusTurn: isBonusTurn
            });
        }
    }

    /**
     * Synchroniser la pioche d'une nouvelle tuile
     */
    syncTileDraw(tileId, rotation) {
        console.log('🎲 Sync pioche tuile:', tileId);
        this.multiplayer.broadcast({
            type: 'tile-drawn',
            tileId: tileId,
            rotation: rotation,
            playerId: this.multiplayer.playerId
        });
    }

    /**
     * Synchroniser le placement d'un meeple
     */
    syncMeeplePlacement(x, y, position, meepleType, color) {
        console.log('🎭 Sync placement meeple:', x, y, position, meepleType);
        this.multiplayer.broadcast({
            type: 'meeple-placed',
            x: x,
            y: y,
            position: position,
            meepleType: meepleType,
            color: color,
            playerId: this.multiplayer.playerId
        });
    }

    /**
     * Synchroniser la mise à jour des scores
     */
    syncScoreUpdate(scoringResults, meeplesToReturn, goodsResults = [], zoneMerger = null) {
        console.log('💰 Sync score update:', scoringResults);
        this.multiplayer.broadcast({
            type: 'score-update',
            scoringResults:  scoringResults,
            meeplesToReturn: meeplesToReturn,
            goodsResults:    goodsResults,
            // Registry post-scoring : goods déjà vidés, état cohérent pour l'invité
            zoneRegistry: zoneMerger ? zoneMerger.registry.serialize() : null,
            tileToZone:   zoneMerger ? Array.from(zoneMerger.tileToZone.entries()) : null,
            playerId: this.multiplayer.playerId
        });
    }

    /**
     * Synchroniser une annulation
     */
    syncAbbeRecall(x, y, key, playerId, points) {
        this.multiplayer.broadcast({
            type: 'abbe-recalled',
            x, y, key, playerId, points
        });
    }

    syncAbbeRecallUndo(x, y, key, playerId) {
        this.multiplayer.broadcast({
            type: 'abbe-recalled-undo',
            x, y, key, playerId
        });
    }

    syncUndo(undoneAction) {
        console.log('⏪ Sync annulation:', undoneAction);
        this.multiplayer.broadcast({
            type: 'turn-undo',
            action: undoneAction,
            playerId: this.multiplayer.playerId
        });
    }

    /**
     * Synchroniser la destruction d'une tuile
     */
    syncTileDestroyed(tileId, playerName, action, count = 1) {
        console.log('🗑️ Sync tile destroyed:', tileId);
        this.multiplayer.broadcast({
            type: 'tile-destroyed',
            tileId: tileId,
            playerName: playerName,
            action: action,
            count: count,
            playerId: this.multiplayer.playerId
        });
    }

    /**
     * Synchroniser le remélange du deck
     */
    syncDeckReshuffle(tiles, currentIndex) {
        console.log('🔀 Sync deck reshuffle, currentIndex:', currentIndex);
        this.multiplayer.broadcast({
            type: 'deck-reshuffled',
            tiles: tiles,
            currentIndex: currentIndex,
            playerId: this.multiplayer.playerId
        });
    }

    /**
     * Synchroniser la fin de partie
     */
    syncPlayerDisconnected(peerId, playerName, nextPlayerIndex) {
        console.log('👋 Sync player disconnected:', playerName);
        this.multiplayer.broadcast({
            type: 'player-disconnected',
            peerId,
            playerName,
            nextPlayerIndex,
            playerId: this.multiplayer.playerId
        });
    }

    /**
     * Broadcaster la pause de partie (joueur déconnecté)
     */
    syncGamePaused(disconnectedName, timeoutMs) {
        this.multiplayer.broadcast({
            type: 'game-paused',
            disconnectedName,
            timeoutMs,
            playerId: this.multiplayer.playerId
        });
    }

    /**
     * Broadcaster la reprise de partie
     */
    syncGameResumed(reason) {
        this.multiplayer.broadcast({
            type: 'game-resumed',
            reason, // 'reconnected' | 'timeout'
            playerId: this.multiplayer.playerId
        });
    }

    /**
     * Envoyer l'état complet à un nouveau joueur/reconnexion (hôte → invité ciblé)
     */
    syncFullState(targetPeerId, { gameState, deck, plateau, zoneRegistry, tileToZone, placedMeeples, tuileEnMain, tuilePosee, gameConfig, timerElapsed }) {
        this.multiplayer.sendTo(targetPeerId, {
            type: 'full-state-sync',
            gameState:    gameState.serialize(),
            deck:         { tiles: deck.tiles, currentIndex: deck.currentIndex, totalTiles: deck.totalTiles },
            plateau:      plateau.placedTiles,
            zoneRegistry: zoneRegistry.serialize(),
            tileToZone:   Array.from(tileToZone.entries()),
            placedMeeples,
            tuileEnMain:  tuileEnMain ? { id: tuileEnMain.id, rotation: tuileEnMain.rotation } : null,
            tuilePosee:   tuilePosee ?? false,
            gameConfig,
            timerElapsed: timerElapsed ?? 0
        });
    }

    syncGameEnded(detailedScores, destroyedTilesCount = 0) {
        console.log('🏁 Sync game ended:', detailedScores);
        this.multiplayer.broadcast({
            type: 'game-ended',
            scores: detailedScores,
            destroyedTilesCount: destroyedTilesCount,
            playerId: this.multiplayer.playerId
        });
    }

    /**
     * Gérer les messages reçus
     * @private
     */
    _handleGameMessage(data, from) {
        console.log('📨 [SYNC] Message reçu:', data.type);

        // ✅ RELAIS HÔTE : si on est l'hôte et que le message vient d'un invité,
        // le re-broadcaster aux autres joueurs (topologie étoile, invités non connectés entre eux)
        const relayTypes = [
            'tile-rotated', 'tile-placed', 'tile-drawn',
            'meeple-placed', 'meeple-count-update', 'score-update', 'turn-undo',
            'tile-destroyed', 'deck-reshuffled', 'abbe-recalled', 'abbe-recalled-undo',
            'game-ended'
        ];
        if (this.isHost && from && from !== this.multiplayer.playerId && relayTypes.includes(data.type)) {
            console.log(`🔀 [HÔTE] Relais message ${data.type} de ${from} vers les autres`);
            this.multiplayer.broadcastExcept(data, from);
        }

        switch (data.type) {
            case 'game-start':
                if (!this.isHost && this.onGameStarted) {
                    console.log('🎮 [INVITÉ] Réception de la pioche');
                    this.onGameStarted(data.deck, data.gameState);
                }
                break;

            case 'tile-rotated':
                if (this.onTileRotated && data.playerId !== this.multiplayer.playerId) {
                    console.log('🔄 [SYNC] Rotation reçue:', data.rotation);
                    this.onTileRotated(data.rotation);
                }
                break;

            case 'tile-placed':
                if (this.onTilePlaced && data.playerId !== this.multiplayer.playerId) {
                    console.log('📍 [SYNC] Placement reçu:', data.x, data.y, data.tileId);
                    this.onTilePlaced(data.x, data.y, data.tileId, data.rotation, data.zoneRegistry, data.tileToZone);
                }
                break;

            case 'turn-ended':
                if (this.onTurnEnded && data.playerId !== this.multiplayer.playerId) {
                    console.log('⏭️ [SYNC] Fin de tour reçue — nextTileId:', data.nextTileId);
                    this.onTurnEnded(data.nextPlayerIndex, data.gameState, data.isBonusTurn ?? false, data.nextTileId ?? null);
                }
                break;

            case 'turn-end-request':
                // Un invité demande à l'hôte de clore son tour
                if (this.isHost && this.onTurnEndRequest) {
                    console.log('⏭️ [HÔTE] Demande fin de tour reçue de:', data.playerId);
                    this.onTurnEndRequest(data.playerId, data.nextPlayerIndex, data.gameState, data.isBonusTurn ?? false);
                }
                break;

            case 'tile-drawn':
                if (this.onTileDrawn && data.playerId !== this.multiplayer.playerId) {
                    console.log('🎲 [SYNC] Pioche tuile reçue:', data.tileId);
                    this.onTileDrawn(data.tileId, data.rotation, data.playerId);
                }
                break;

            case 'meeple-placed':
                if (this.onMeeplePlaced && data.playerId !== this.multiplayer.playerId) {
                    console.log('🎭 [SYNC] Meeple placé reçu:', data.x, data.y, data.position);
                    this.onMeeplePlaced(data.x, data.y, data.position, data.meepleType, data.color, data.playerId);
                }
                break;


            case 'meeple-count-update':
                if (this.onMeepleCountUpdate) {
                    console.log('🎭 [SYNC] Mise à jour compteur meeples:', data.playerId, data.meeples);
                    this.onMeepleCountUpdate(data.playerId, data.meeples, data.hasAbbot, data.hasLargeMeeple, data.hasPig);
                }
                break;
            case 'score-update':
                if (this.onScoreUpdate && data.playerId !== this.multiplayer.playerId) {
                    console.log('💰 [SYNC] Mise à jour des scores reçue');
                    this.onScoreUpdate(data.scoringResults, data.meeplesToReturn, data.goodsResults ?? [], data.zoneRegistry ?? null, data.tileToZone ?? null);
                }
                break;
            
            case 'turn-undo':
                if (this.onTurnUndo && data.playerId !== this.multiplayer.playerId) {
                    console.log('⏪ [SYNC] Annulation reçue:', data.action);
                    this.onTurnUndo(data.action);
                }
                break;
            
            case 'game-ended':
                if (this.onGameEnded && data.playerId !== this.multiplayer.playerId) {
                    console.log('🏁 [SYNC] Fin de partie reçue');
                    this.onGameEnded(data.scores, data.destroyedTilesCount ?? 0);
                }
                break;
            
            case 'game-paused':
                if (this.onGamePaused && data.playerId !== this.multiplayer.playerId) {
                    this.onGamePaused(data.disconnectedName, data.timeoutMs);
                }
                break;

            case 'game-resumed':
                if (this.onGameResumed && data.playerId !== this.multiplayer.playerId) {
                    this.onGameResumed(data.reason);
                }
                break;

            case 'full-state-sync':
                if (this.onFullStateSync) {
                    this.onFullStateSync(data);
                }
                break;

            case 'rejoin-accepted':
                if (this.onRejoinAccepted) {
                    this.onRejoinAccepted(data);
                }
                break;

            case 'rejoin-rejected':
                if (this.onRejoinRejected) {
                    this.onRejoinRejected(data.reason);
                }
                break;

            case 'player-disconnected':
                if (this.onPlayerDisconnected && data.playerId !== this.multiplayer.playerId) {
                    console.log('👋 [SYNC] Joueur déconnecté reçu:', data.playerName);
                    this.onPlayerDisconnected(data.peerId, data.playerName, data.nextPlayerIndex);
                }
                break;

            case 'tile-destroyed':
                if (this.onTileDestroyed && data.playerId !== this.multiplayer.playerId) {
                    console.log('🗑️ [SYNC] Tuile détruite reçue:', data.tileId);
                    this.onTileDestroyed(data.tileId, data.playerName, data.action, data.count ?? 1);
                }
                break;
            
            case 'deck-reshuffled':
                if (this.onDeckReshuffled && data.playerId !== this.multiplayer.playerId) {
                    console.log('🔀 [SYNC] Deck remélangé reçu');
                    this.onDeckReshuffled(data.tiles, data.currentIndex);
                }
                break;

            case 'abbe-recalled':
                if (this.onAbbeRecalled && data.playerId !== this.multiplayer.playerId) {
                    console.log('↩️ [SYNC] Rappel Abbé reçu:', data.key);
                    this.onAbbeRecalled(data.x, data.y, data.key, data.playerId, data.points);
                }
                break;

            case 'abbe-recalled-undo':
                if (this.onAbbeRecalledUndo && data.playerId !== this.multiplayer.playerId) {
                    console.log('↩️ [SYNC] Undo rappel Abbé reçu');
                    this.onAbbeRecalledUndo(data.x, data.y, data.key, data.playerId);
                }
                break;
        }
    }
}
