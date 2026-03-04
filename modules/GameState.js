/**
 * Gère l'état partagé du jeu entre tous les joueurs
 */
export class GameState {
    constructor() {
        this.players = []; // Liste des joueurs
        this.currentPlayerIndex = 0; // Index du joueur actuel
        this.disconnectedPlayers = {}; // { peerId: { player, index, disconnectedAt } }
        this.placedTiles = {}; // Tuiles posées sur le plateau
        this.deck = []; // Pioche (seulement côté hôte)
        this.destroyedTilesCount = 0; // Compteur global de tuiles détruites
        this.currentTilePlaced = false; // Le joueur courant a-t-il posé sa tuile ce tour ?
    }

    /**
     * Marquer un joueur comme déconnecté (sans le supprimer)
     */
    markDisconnected(peerId) {
        const index = this.players.findIndex(p => p.id === peerId);
        if (index === -1) return null;
        const player = { ...this.players[index] };
        this.disconnectedPlayers[peerId] = {
            player,
            index,
            disconnectedAt: Date.now()
        };
        this.players[index].disconnected = true;
        return { player, index };
    }

    /**
     * Reconnecter un joueur (par pseudo)
     */
    findDisconnectedByName(name) {
        return Object.entries(this.disconnectedPlayers).find(
            ([, data]) => data.player.name === name
        );
    }

    reconnectPlayer(oldPeerId, newPeerId) {
        const entry = this.disconnectedPlayers[oldPeerId];
        if (!entry) return false;
        const player = this.players.find(p => p.id === oldPeerId);
        if (player) {
            player.id = newPeerId;
            player.disconnected = false;
        }
        delete this.disconnectedPlayers[oldPeerId];
        return true;
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
            hasAbbot:       false, // Initialisé à false, mis à true si extension Abbé activée
            hasLargeMeeple: false, // Grand meeple (Auberges & Cathédrales)
            hasBuilder:     false, // Bâtisseur (Marchands & Bâtisseurs)
            hasPig:         false, // Cochon (Marchands & Bâtisseurs)
            goods: { cloth: 0, wheat: 0, wine: 0 }, // Jetons marchandises
            scoreDetail: {
                cities: 0,
                roads: 0,
                monasteries: 0,
                fields: 0,
                goods: 0
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
        let attempts = 0;
        do {
            this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
            attempts++;
        } while (
            this.players[this.currentPlayerIndex]?.color === 'spectator' &&
            attempts < this.players.length
        );
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
            placedTiles: this.placedTiles,
            disconnectedPlayers: this.disconnectedPlayers,
            currentTilePlaced: this.currentTilePlaced
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
            hasAbbot:       p.hasAbbot       ?? false,
            hasLargeMeeple: p.hasLargeMeeple ?? false,
            hasBuilder:     p.hasBuilder     ?? false,
            hasPig:         p.hasPig         ?? false,
            goods: p.goods ?? { cloth: 0, wheat: 0, wine: 0 },
            scoreDetail: p.scoreDetail || {
                cities: 0,
                roads: 0,
                monasteries: 0,
                fields: 0,
                goods: 0
            }
        }));
        this.currentPlayerIndex = data.currentPlayerIndex || 0;
        this.placedTiles = data.placedTiles || {};
        this.disconnectedPlayers = data.disconnectedPlayers || {};
        this.currentTilePlaced = data.currentTilePlaced ?? false;
    }
}
