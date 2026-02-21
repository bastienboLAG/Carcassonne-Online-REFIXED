/**
 * LobbyUI - Gère l'interface du lobby
 * Responsabilités :
 * - Affichage de la liste des joueurs
 * - Drag & drop pour réordonner les joueurs
 * - Sélection des couleurs
 * - Affichage du code de partie
 * - Synchronisation réseau de l'état du lobby
 */
export class LobbyUI {
    constructor(multiplayer) {
        this.multiplayer = multiplayer;
        
        // Données
        this.players = [];
        this.takenColors = [];
        this.isHost = false;
        this.onKickPlayer  = null; // callback(playerId) — hôte kick un invité
        this.onLeaveGame   = null; // callback() — invité quitte volontairement
        
        // Éléments DOM
        this.playersListEl = null;
        this.gameCodeContainerEl = null;
        this.gameCodeTextEl = null;
        this.colorGridEl = null;
        
        // Images des couleurs
        this.colorImages = {
            'black': './assets/Meeples/Black/Normal.png',
            'red': './assets/Meeples/Red/Normal.png',
            'pink': './assets/Meeples/Pink/Normal.png',
            'green': './assets/Meeples/Green/Normal.png',
            'blue': './assets/Meeples/Blue/Normal.png',
            'yellow': './assets/Meeples/Yellow/Normal.png'
        };
        
        this.allColors = ['black', 'red', 'pink', 'green', 'blue', 'yellow'];
    }

    /**
     * Initialiser l'UI du lobby
     */
    init() {
        this.playersListEl = document.getElementById('players-list');
        this.gameCodeContainerEl = document.getElementById('game-code-container');
        this.gameCodeTextEl = document.getElementById('game-code-text');
        this.colorGridEl = document.getElementById('color-grid');
        
        console.log('✅ LobbyUI initialisé');
    }

    /**
     * Définir les joueurs
     */
    setPlayers(players) {
        this.players = players;
        this.updatePlayersList();
    }

    /**
     * Définir si on est l'hôte
     */
    setIsHost(isHost) {
        this.isHost = isHost;
    }

    /**
     * Afficher le code de partie
     */
    showGameCode(code) {
        if (this.gameCodeTextEl) {
            this.gameCodeTextEl.textContent = `Code: ${code}`;
            this.gameCodeContainerEl.style.display = 'block';
        }
    }

    /**
     * Mettre à jour la liste des joueurs avec drag & drop
     */
    updatePlayersList() {
        if (!this.playersListEl) return;
        
        this.playersListEl.innerHTML = '';
        this.takenColors = this.players.map(p => p.color);
        this.updateAvailableColors();
        
        if (this.players.length === 0) {
            this.playersListEl.innerHTML = '<div class="player-slot empty"><span class="player-name">En attente de joueurs...</span></div>';
            return;
        }
        
        this.players.forEach((player, index) => {
            const slot = document.createElement('div');
            slot.className = 'player-slot';
            
            // Rendre draggable seulement pour l'hôte
            if (this.isHost) {
                slot.draggable = true;
                slot.style.cursor = 'grab';
                slot.dataset.playerIndex = index;
                
                slot.addEventListener('dragstart', (e) => {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', index);
                    slot.style.opacity = '0.5';
                });
                
                slot.addEventListener('dragend', () => {
                    slot.style.opacity = '1';
                });
                
                slot.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    slot.style.borderTop = '2px solid gold';
                });
                
                slot.addEventListener('dragleave', () => {
                    slot.style.borderTop = '';
                });
                
                slot.addEventListener('drop', (e) => {
                    e.preventDefault();
                    slot.style.borderTop = '';
                    
                    const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
                    const toIndex = parseInt(slot.dataset.playerIndex);
                    
                    if (fromIndex !== toIndex) {
                        this.movePlayer(fromIndex, toIndex);
                    }
                });
            }
            
            const nameSpan = document.createElement('span');
            nameSpan.className   = 'player-name';
            nameSpan.textContent = player.name + (player.isHost ? ' 👑' : '');
            slot.appendChild(nameSpan);

            const meepleImg = document.createElement('img');
            meepleImg.src       = this.colorImages[player.color];
            meepleImg.className = 'player-meeple-img';
            meepleImg.alt       = player.color;
            slot.appendChild(meepleImg);

            // Croix kick (hôte sur les invités) ou quitter (invité sur soi-même)
            const myId = this.multiplayer?.playerId;
            const showKick  = this.isHost && !player.isHost;
            const showLeave = !this.isHost && player.id === myId;

            if (showKick || showLeave) {
                const closeBtn = document.createElement('button');
                closeBtn.className   = 'lobby-kick-btn';
                closeBtn.textContent = '✕';
                closeBtn.title       = showKick ? 'Retirer ce joueur' : 'Quitter le salon';
                closeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (showKick && this.onKickPlayer) this.onKickPlayer(player.id);
                    if (showLeave && this.onLeaveGame)  this.onLeaveGame();
                });
                slot.appendChild(closeBtn);
            }

            this.playersListEl.appendChild(slot);
        });
        
        // Ajouter les slots vides
        for (let i = this.players.length; i < 6; i++) {
            const slot = document.createElement('div');
            slot.className = 'player-slot empty';
            slot.innerHTML = '<span class="player-name">En attente...</span>';
            this.playersListEl.appendChild(slot);
        }
    }

    /**
     * Déplacer un joueur dans la liste
     */
    movePlayer(fromIndex, toIndex) {
        const [movedPlayer] = this.players.splice(fromIndex, 1);
        this.players.splice(toIndex, 0, movedPlayer);
        
        // Synchroniser avec les autres joueurs
        if (this.multiplayer && this.multiplayer.peer && this.multiplayer.peer.open) {
            this.multiplayer.broadcast({
                type: 'player-order-update',
                players: this.players
            });
        }
        
        this.updatePlayersList();
    }

    /**
     * Mettre à jour les couleurs disponibles
     */
    updateAvailableColors() {
        const colorOptions = document.querySelectorAll('.color-option');
        const currentPlayerColor = this.getCurrentPlayerColor();
        
        colorOptions.forEach(option => {
            const color = option.dataset.color;
            const input = option.querySelector('input');
            
            if (this.takenColors.includes(color) && color !== currentPlayerColor) {
                option.classList.add('disabled');
                input.disabled = true;
            } else {
                option.classList.remove('disabled');
                input.disabled = false;
            }
        });
    }

    /**
     * Obtenir la couleur du joueur actuel
     */
    getCurrentPlayerColor() {
        if (!this.multiplayer) return null;
        const me = this.players.find(p => p.id === this.multiplayer.playerId);
        return me ? me.color : null;
    }

    /**
     * Ajouter un joueur
     */
    addPlayer(player) {
        this.players.push(player);
        this.updatePlayersList();
    }

    /**
     * Retirer un joueur
     */
    removePlayer(playerId) {
        this.players = this.players.filter(p => p.id !== playerId);
        this.updatePlayersList();
    }

    /**
     * Mettre à jour la couleur d'un joueur
     */
    updatePlayerColor(playerId, color) {
        const player = this.players.find(p => p.id === playerId);
        if (player) {
            player.color = color;
            this.updatePlayersList();
        }
    }

    /**
     * Afficher le lobby
     */
    show() {
        document.getElementById('lobby-page').style.display = 'flex';
        document.getElementById('game-page').style.display = 'none';
    }

    /**
     * Masquer le lobby
     */
    hide() {
        document.getElementById('lobby-page').style.display = 'none';
        document.getElementById('game-page').style.display = 'flex';
    }

    /**
     * Réinitialiser le lobby (pour retour après partie)
     */
    reset() {
        this.players       = [];
        this.onKickPlayer  = null;
        this.onLeaveGame   = null;
        this.isHost        = false;
        this.updatePlayersList();
    }

    /**
     * Obtenir la liste des joueurs
     */
    getPlayers() {
        return this.players;
    }
}
