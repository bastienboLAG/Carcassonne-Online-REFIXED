/**
 * Gère l'état partagé du jeu entre tous les joueurs
 */
export class GameState {
    constructor() {
        this.players = []; // Liste des joueurs
        this.currentPlayerIndex = 0; // Index du joueur actuel
        this.placedTiles = {}; // Tuiles posées sur le plateau
        this.deck = []; // Pioche (seulement côté hôte)
    }

    /**
     * Ajouter un joueur
     */
    addPlayer(playerId, playerName, color) {
        this.players.push({
            id: playerId,
            name: playerName,
            color: color,
            score: 0,
            meeples: 7,
            hasAbbot: false, // Initialisé à false, mis à true si extension Abbé activée
            scoreDetail: {
                cities: 0,
                roads: 0,
                monasteries: 0,
                fields: 0
            }
        });
    }

    /**
     * Retirer un joueur
     */
    removePlayer(playerId) {
        this.players = this.players.filter(p => p.id !== playerId);
    }

    /**
     * Obtenir le joueur actuel
     */
    getCurrentPlayer() {
        return this.players[this.currentPlayerIndex];
    }

    /**
     * Passer au joueur suivant
     */
    nextPlayer() {
        this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
    }

    /**
     * Vérifier si c'est le tour d'un joueur
     */
    isPlayerTurn(playerId) {
        const currentPlayer = this.getCurrentPlayer();
        return currentPlayer && currentPlayer.id === playerId;
    }

    /**
     * Sérialiser l'état pour l'envoyer
     */
    serialize() {
        return {
            players: this.players,
            currentPlayerIndex: this.currentPlayerIndex,
            placedTiles: this.placedTiles
        };
    }

    /**
     * Restaurer l'état depuis des données reçues
     */
    deserialize(data) {
        // Copier les joueurs (objets plain)
        this.players = (data.players || []).map(p => ({
            id: p.id,
            name: p.name,
            color: p.color,
            score: p.score || 0,
            meeples: p.meeples ?? 7,
            hasAbbot: p.hasAbbot ?? false,
            scoreDetail: p.scoreDetail || {
                cities: 0,
                roads: 0,
                monasteries: 0,
                fields: 0
            }
        }));
        this.currentPlayerIndex = data.currentPlayerIndex || 0;
        this.placedTiles = data.placedTiles || {};
    }
}
