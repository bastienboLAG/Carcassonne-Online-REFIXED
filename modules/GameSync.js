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
        this.onTurnEnded = null;
        this.onGameStarted = null;
        this.onTileDrawn = null;
        this.onMeeplePlaced = null;
        this.onScoreUpdate = null;
        this.onTurnUndo = null;
        this.onGameEnded = null;
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
            'turn-undo', 'game-ended', 'tile-destroyed', 'deck-reshuffled'
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
    syncTilePlacement(x, y, tile) {
        console.log('📍 Sync placement:', x, y, tile.id, tile.rotation);
        this.multiplayer.broadcast({
            type: 'tile-placed',
            x: x,
            y: y,
            tileId: tile.id,
            rotation: tile.rotation,
            playerId: this.multiplayer.playerId
        });
    }

    /**
     * Synchroniser la fin du tour
     */
    syncTurnEnd() {
        console.log('⏭️ Sync fin de tour');
        
        // Passer au joueur suivant
        this.gameState.nextPlayer();
        
        // Diffuser aux autres joueurs
        this.multiplayer.broadcast({
            type: 'turn-ended',
            playerId: this.multiplayer.playerId,
            nextPlayerIndex: this.gameState.currentPlayerIndex,
            gameState: this.gameState.serialize()
        });
        
        return true;
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
    syncScoreUpdate(scoringResults, meeplesToReturn) {
        console.log('💰 Sync score update:', scoringResults);
        this.multiplayer.broadcast({
            type: 'score-update',
            scoringResults: scoringResults,
            meeplesToReturn: meeplesToReturn,
            playerId: this.multiplayer.playerId
        });
    }

    /**
     * Synchroniser une annulation
     */
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
    syncTileDestroyed(tileId, playerName, action) {
        console.log('🗑️ Sync tile destroyed:', tileId);
        this.multiplayer.broadcast({
            type: 'tile-destroyed',
            tileId: tileId,
            playerName: playerName,
            action: action,
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
    syncGameEnded(detailedScores) {
        console.log('🏁 Sync game ended:', detailedScores);
        this.multiplayer.broadcast({
            type: 'game-ended',
            scores: detailedScores,
            playerId: this.multiplayer.playerId
        });
    }

    /**
     * Gérer les messages reçus
     * @private
     */
    _handleGameMessage(data, from) {
        console.log('📨 [SYNC] Message reçu:', data.type);

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
                    this.onTilePlaced(data.x, data.y, data.tileId, data.rotation);
                }
                break;

            case 'turn-ended':
                if (this.onTurnEnded && data.playerId !== this.multiplayer.playerId) {
                    console.log('⏭️ [SYNC] Fin de tour reçue');
                    this.onTurnEnded(data.nextPlayerIndex, data.gameState);
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
                    this.onMeepleCountUpdate(data.playerId, data.meeples);
                }
                break;
            case 'score-update':
                if (this.onScoreUpdate && data.playerId !== this.multiplayer.playerId) {
                    console.log('💰 [SYNC] Mise à jour des scores reçue');
                    this.onScoreUpdate(data.scoringResults, data.meeplesToReturn);
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
                    this.onGameEnded(data.scores);
                }
                break;
            
            case 'tile-destroyed':
                if (this.onTileDestroyed && data.playerId !== this.multiplayer.playerId) {
                    console.log('🗑️ [SYNC] Tuile détruite reçue:', data.tileId);
                    this.onTileDestroyed(data.tileId, data.playerName, data.action);
                }
                break;
            
            case 'deck-reshuffled':
                if (this.onDeckReshuffled && data.playerId !== this.multiplayer.playerId) {
                    console.log('🔀 [SYNC] Deck remélangé reçu');
                    this.onDeckReshuffled(data.tiles, data.currentIndex);
                }
                break;
        }
    }
}
