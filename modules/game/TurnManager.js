/**
 * TurnManager - Gère la logique des tours de jeu
 * Responsabilités :
 * - Déterminer à qui c'est le tour
 * - Gérer le passage au joueur suivant
 * - Pioche de tuiles
 * - Déclencher le calcul des scores en fin de tour
 */
export class TurnManager {
    constructor(eventBus, gameState, deck, multiplayer, isHost = false) {
        this.eventBus = eventBus;
        this.gameState = gameState;
        this.deck = deck;
        this.multiplayer = multiplayer;
        this.isHost = isHost;
        
        // État du tour
        this.isMyTurn   = false;
        this.tilePlaced = false;
        this.currentTile = null;

        // Tour bonus (bâtisseur)
        this.isBonusTurn            = false; // true pendant le tour bonus
        this.bonusAlreadyUsedThisTurn = false; // empêche le cumul
        this.builderRules           = null;  // injecté depuis home.js
        
        // S'abonner aux événements
        this.eventBus.on('tile-placed', (data) => this.onTilePlaced(data));
    }

    /**
     * Initialiser le tour (appelé au début de la partie)
     */
    init() {
        this.updateTurnState();
        this.eventBus.emit('turn-changed', { 
            isMyTurn: this.isMyTurn,
            currentPlayer: this.getCurrentPlayer()
        });
    }

    /**
     * Mettre à jour l'état du tour (qui joue)
     */
    updateTurnState() {
        if (!this.gameState || this.gameState.players.length === 0) {
            this.isMyTurn = false;
            return;
        }
        
        const currentPlayer = this.gameState.getCurrentPlayer();
        const mePlayer = this.gameState.players.find(p => p.id === this.multiplayer.playerId);
        const iAmSpectator = mePlayer?.color === 'spectator';
        const iAmDisconnected = mePlayer?.disconnected === true || mePlayer?.kicked === true;
        this.isMyTurn = currentPlayer.id === this.multiplayer.playerId && !iAmSpectator && !iAmDisconnected;
        
        console.log('🔄 Mise à jour isMyTurn:', this.isMyTurn, 'Tour de:', currentPlayer.name);
    }

    /**
     * Obtenir le joueur actuel
     */
    getCurrentPlayer() {
        if (!this.gameState) return null;
        return this.gameState.getCurrentPlayer();
    }

    /**
     * Vérifier si c'est notre tour
     */
    getIsMyTurn() {
        return this.isMyTurn;
    }

    /**
     * Piocher une nouvelle tuile
     */
    drawTile() {
        console.log('🎲 Pioche d\'une nouvelle tuile...');
        console.log('📦 Index AVANT draw():', this.deck.currentIndex);
        const tileData = this.deck.draw();
        console.log('📦 Index APRÈS draw():', this.deck.currentIndex);
        
        if (!tileData) {
            console.log('⚠️ Pioche vide !');
            this.eventBus.emit('deck-empty');
            return null;
        }

        console.log('🃏 Tuile piochée:', tileData.id);
        
        // Créer une instance Tile (pas juste les data brutes)
        // Note: On assume que Tile est importé dans le contexte appelant
        // Pour que ce module soit indépendant, on stocke juste tileData
        this.currentTile = tileData;
        this.currentTile.rotation = 0;
        this.tilePlaced = false;
        
        // Émettre événements
        this.eventBus.emit('tile-drawn', { 
            tileData: tileData
        });
        
        this.eventBus.emit('deck-updated', { 
            remaining: this.deck.remaining(), 
            total: this.deck.total() 
        });
        
        return tileData;
    }

    /**
     * Quand une tuile est placée
     */
    onTilePlaced(data) {
        this.tilePlaced = true;
        this.currentTile = null;
        console.log('✅ Tuile placée, tour peut se terminer');
    }

    /**
     * Terminer le tour
     * @returns {Object} { success: boolean, scoringResults?, meeplesToReturn? }
     */
    /**
     * Terminer le tour
     * @param {boolean} builderBonusTriggered - pré-calculé par home.js avant le scoring
     */
    endTurn(builderBonusTriggered = false) {
        if (!this.isMyTurn) {
            console.error('❌ Ce n\'est pas votre tour');
            return { success: false, error: 'not_your_turn' };
        }
        if (!this.tilePlaced) {
            console.error('❌ Vous devez poser la tuile avant de terminer votre tour');
            return { success: false, error: 'tile_not_placed' };
        }

        console.log('⏭️ Fin de tour');

        this.eventBus.emit('turn-ending', { playerId: this.multiplayer.playerId });

        // Le bonus est pré-calculé par home.js avant le scoring (état le plus fiable)
        const bonusTriggered = builderBonusTriggered &&
                               !this.bonusAlreadyUsedThisTurn &&
                               !this.isBonusTurn;

        if (bonusTriggered) {
            console.log('⭐ Déclenchement du tour bonus bâtisseur');
            this.isBonusTurn = true;
            this.bonusAlreadyUsedThisTurn = true;
            this.tilePlaced = false;
            return { success: true, bonusTurnStarted: true };
        } else {
            this.isBonusTurn = false;
            this.bonusAlreadyUsedThisTurn = false;
            this.nextPlayer();
            return { success: true, bonusTurnStarted: false };
        }
    }

    /**
     * Passer au joueur suivant
     */
    nextPlayer() {
        if (!this.gameState) return;

        // Incrémenter l'index du joueur en sautant spectateurs et déconnectés
        let attempts = 0;
        do {
            this.gameState.currentPlayerIndex = (this.gameState.currentPlayerIndex + 1) % this.gameState.players.length;
            attempts++;
        } while (
            (this.gameState.players[this.gameState.currentPlayerIndex]?.color === 'spectator' ||
             this.gameState.players[this.gameState.currentPlayerIndex]?.disconnected === true ||
             this.gameState.players[this.gameState.currentPlayerIndex]?.kicked === true) &&
            attempts < this.gameState.players.length
        );
        
        // Mettre à jour l'état
        this.updateTurnState();
        
        // Émettre événement
        this.eventBus.emit('turn-ended', {
            previousPlayer: this.multiplayer.playerId,
            currentPlayerIndex: this.gameState.currentPlayerIndex
        });
        
        this.eventBus.emit('turn-changed', {
            isMyTurn: this.isMyTurn,
            currentPlayer: this.getCurrentPlayer()
        });
        
        // La pioche est gérée par l'hôte via receiveYourTurn
    }

    /**
     * Recevoir une fin de tour depuis le réseau (multijoueur)
     */
    /**
     * Gérer la déconnexion d'un invité (hôte uniquement)
     * @param {string} peerId - ID du joueur déconnecté
     * @param {Object} options - { tuileEnMain, gameSync, afficherMessage }
     */
    handlePlayerDisconnected(peerId, { tuileEnMain, gameSync, afficherMessage, onPlayerRemoved } = {}) {
        if (!this.gameState) return;

        console.log('🔍 [DECO] peerId reçu:', peerId);
        console.log('🔍 [DECO] gameState.players ids:', this.gameState.players.map(p => p.id));
        const playerIndex = this.gameState.players.findIndex(p => p.id === peerId);
        if (playerIndex === -1) {
            console.warn('🔍 [DECO] Joueur non trouvé dans gameState.players');
            return;
        }

        const playerName     = this.gameState.players[playerIndex].name;
        const wasCurrentTurn = playerIndex === this.gameState.currentPlayerIndex;

        console.log(`👋 Joueur déconnecté: ${playerName} (index ${playerIndex}), son tour: ${wasCurrentTurn}`);

        // Retirer le joueur
        this.gameState.players.splice(playerIndex, 1);
        if (this.gameState.players.length === 0) return;

        // Ajuster currentPlayerIndex
        if (playerIndex < this.gameState.currentPlayerIndex) {
            // Le joueur était avant le joueur actuel → décaler d'un cran
            this.gameState.currentPlayerIndex--;
        } else if (wasCurrentTurn) {
            // C'était son tour → currentPlayerIndex pointe maintenant sur le joueur suivant
            // (le splice a décalé les indices)
            this.gameState.currentPlayerIndex = playerIndex % this.gameState.players.length;
        }

        // Broadcaster la déco aux invités
        if (gameSync) gameSync.syncPlayerDisconnected(peerId, playerName, this.gameState.currentPlayerIndex);

        afficherMessage?.(`💔 ${playerName} s'est déconnecté.`);
        onPlayerRemoved?.(peerId);

        // Si c'était son tour et qu'il n'avait pas encore posé sa tuile → donner la tuile au suivant
        if (wasCurrentTurn && tuileEnMain) {
            console.log(`🃏 Transmission de la tuile ${tuileEnMain.id} au joueur suivant`);
            this.updateTurnState();
            this.eventBus.emit('turn-changed', {
                isMyTurn: this.isMyTurn,
                currentPlayer: this.getCurrentPlayer()
            });
            // La tuile reste en main — le joueur suivant la joue directement
            this.eventBus.emit('tile-drawn', {
                tileData: { id: tuileEnMain.id, zones: tuileEnMain.zones, imagePath: tuileEnMain.imagePath, rotation: tuileEnMain.rotation },
                fromDisconnect: true
            });
            return;
        }

        // Sinon mettre à jour le tour normalement
        this.updateTurnState();
        this.eventBus.emit('turn-changed', {
            isMyTurn: this.isMyTurn,
            currentPlayer: this.getCurrentPlayer()
        });

        // La pioche est gérée par l'hôte
    }

    receiveTurnEnded(nextPlayerIndex, gameStateData, isBonusTurn = false, nextTileId = null) {
        console.log('⏭️ [SYNC] Fin de tour reçue — isBonusTurn:', isBonusTurn);
        
        // Restaurer uniquement currentPlayerIndex depuis le gameState de l'hôte
        // (on ne touche PAS aux meeples/flags : ils sont à jour via meeple-count-update)
        if (gameStateData) {
            this.gameState.currentPlayerIndex = gameStateData.currentPlayerIndex ?? this.gameState.currentPlayerIndex;
            // S'assurer que currentPlayerIndex ne pointe pas sur un spectateur
            let attempts = 0;
            while (
                (this.gameState.players[this.gameState.currentPlayerIndex]?.color === 'spectator' ||
                 this.gameState.players[this.gameState.currentPlayerIndex]?.disconnected === true ||
                 this.gameState.players[this.gameState.currentPlayerIndex]?.kicked === true) &&
                attempts < this.gameState.players.length
            ) {
                this.gameState.currentPlayerIndex = (this.gameState.currentPlayerIndex + 1) % this.gameState.players.length;
                attempts++;
            }
        }
        
        // Propager l'état de tour bonus
        this.isBonusTurn = isBonusTurn;
        if (isBonusTurn) {
            // Tour bonus : on ne change pas de joueur, pas de pioche pour nous
            this.updateTurnState();
        } else {
            // Tour normal : remettre à zéro les flags bonus
            this.bonusAlreadyUsedThisTurn = false;
            this.updateTurnState();
            // La pioche arrive via receiveYourTurn après ce bloc
        }
        
        // ✅ Un seul emit turn-changed pour rafraîchir TOUS les joueurs
        this.eventBus.emit('turn-changed', {
            isMyTurn: this.isMyTurn,
            currentPlayer: this.getCurrentPlayer(),
            isBonusTurn: this.isBonusTurn
        });

        // Si l'hôte a inclus la prochaine tuile et que c'est notre tour → l'afficher
        if (this.isMyTurn && nextTileId) {
            this.receiveYourTurn(nextTileId);
        }
    }

    /**
     * L'hôte avance le tour suite à un turn-end-request d'un invité
     * (sans pioche — la pioche est faite séparément par _hostDrawAndSend)
     */
    endTurnRemote(isBonusTurn = false) {
        if (!isBonusTurn) {
            this.bonusAlreadyUsedThisTurn = false;
            this.isBonusTurn = false;
            this.nextPlayer();
        } else {
            // ✅ Tour bonus d'un invité : marquer explicitement isBonusTurn
            this.isBonusTurn = true;
        }
        this.updateTurnState();
        this.eventBus.emit('turn-changed', {
            isMyTurn: this.isMyTurn,
            currentPlayer: this.getCurrentPlayer(),
            isBonusTurn: this.isBonusTurn
        });
    }

    /**
     * Recevoir sa tuile depuis l'hôte
     */
    receiveYourTurn(tileId) {
        console.log('🎲 [SYNC] Réception your-turn:', tileId);
        const tileData = this.deck.tiles.find(t => t.id === tileId);
        if (!tileData) {
            console.error('❌ Tuile introuvable dans le deck:', tileId);
            return;
        }
        this.currentTile = { ...tileData, rotation: 0 };
        this.tilePlaced = false;

        this.eventBus.emit('tile-drawn', {
            tileData: this.currentTile,
            fromNetwork: true,
            fromYourTurn: true
        });

        this.eventBus.emit('deck-updated', {
            remaining: this.deck.remaining(),
            total: this.deck.total()
        });
    }

    /**
     * Recevoir une tuile piochée depuis le réseau (multijoueur)
     */
    receiveTileDrawn(tileId, rotation) {
        console.log('🎲 [SYNC] Tuile piochée:', tileId);
        console.log('📦 [SYNC] Index AVANT draw():', this.deck.currentIndex);
        
        // Piocher localement pour synchroniser l'index
        const tileData = this.deck.draw();
        console.log('📦 [SYNC] Index APRÈS draw():', this.deck.currentIndex);
        
        if (tileData) {
            this.currentTile = { ...tileData, rotation };
            this.tilePlaced = false;
            
            this.eventBus.emit('tile-drawn', { 
                tileData: this.currentTile,
                fromNetwork: true
            });
            
            this.eventBus.emit('deck-updated', { 
                remaining: this.deck.remaining(), 
                total: this.deck.total() 
            });
        }
    }

    /**
     * Vérifier si le deck est vide
     */
    isDeckEmpty() {
        return this.deck.currentIndex >= this.deck.totalTiles;
    }

    /**
     * Réinitialiser pour une nouvelle partie
     */
    reset() {
        this.isMyTurn   = false;
        this.tilePlaced = false;
        this.currentTile = null;
        this.isBonusTurn = false;
        this.bonusAlreadyUsedThisTurn = false;
    }
}
