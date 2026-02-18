/**
 * TurnManager - Gère la logique des tours de jeu
 * Responsabilités :
 * - Déterminer à qui c'est le tour
 * - Gérer le passage au joueur suivant
 * - Pioche de tuiles
 * - Déclencher le calcul des scores en fin de tour
 */
export class TurnManager {
    constructor(eventBus, gameState, deck, multiplayer) {
        this.eventBus = eventBus;
        this.gameState = gameState;
        this.deck = deck;
        this.multiplayer = multiplayer;
        
        // État du tour
        this.isMyTurn = false;
        this.tilePlaced = false;
        this.currentTile = null;
        
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
            this.isMyTurn = true;
            return;
        }
        
        const currentPlayer = this.gameState.getCurrentPlayer();
        this.isMyTurn = currentPlayer.id === this.multiplayer.playerId;
        
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
    endTurn() {
        // Vérifier que c'est notre tour
        if (!this.isMyTurn) {
            console.error('❌ Ce n\'est pas votre tour');
            return { success: false, error: 'not_your_turn' };
        }

        // Vérifier qu'une tuile a été placée
        if (!this.tilePlaced) {
            console.error('❌ Vous devez poser la tuile avant de terminer votre tour');
            return { success: false, error: 'tile_not_placed' };
        }

        console.log('⏭️ Fin de tour - passage au joueur suivant');
        
        // Émettre événement pour calcul des scores (Scoring écoute cet événement)
        this.eventBus.emit('turn-ending', { 
            playerId: this.multiplayer.playerId 
        });
        
        // Passer au joueur suivant
        this.nextPlayer();
        
        return { success: true };
    }

    /**
     * Passer au joueur suivant
     */
    nextPlayer() {
        if (!this.gameState) return;

        // Incrémenter l'index du joueur
        this.gameState.currentPlayerIndex = (this.gameState.currentPlayerIndex + 1) % this.gameState.players.length;
        
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
        
        // Piocher la tuile suivante si c'est notre tour
        if (this.isMyTurn) {
            this.drawTile();
        }
    }

    /**
     * Recevoir une fin de tour depuis le réseau (multijoueur)
     */
    receiveTurnEnded(nextPlayerIndex, gameStateData) {
        console.log('⏭️ [SYNC] Fin de tour reçue');
        
        // Restaurer le GameState
        if (gameStateData) {
            this.gameState.deserialize(gameStateData);
        }
        
        // Mettre à jour l'état
        this.updateTurnState();
        
        // Piocher si c'est notre tour
        if (this.isMyTurn) {
            this.drawTile();
        }
        
        // ✅ Un seul emit turn-changed pour rafraîchir TOUS les joueurs
        this.eventBus.emit('turn-changed', {
            isMyTurn: this.isMyTurn,
            currentPlayer: this.getCurrentPlayer()
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
        this.isMyTurn = false;
        this.tilePlaced = false;
        this.currentTile = null;
    }
}
