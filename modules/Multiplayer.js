import Peer from 'https://esm.sh/peerjs@1.5.2';

export class Multiplayer {
    constructor() {
        this.peer = null;
        this.connections = []; // Liste des connexions aux autres joueurs
        this.isHost = false;
        this.playerId = null;
        this.onPlayerJoined = null; // Callback quand un joueur rejoint
        this.onPlayerLeft = null; // Callback quand un joueur part
        this.onDataReceived = null; // Callback pour recevoir des données
        this._recentMsgIds = new Set(); // Pour dédupliquer les messages reçus en double
        this._msgCounter = 0; // Compteur pour générer des IDs uniques
    }

    /**
     * Créer une partie (devenir l'hôte)
     * @returns {Promise<string>} L'ID de la partie (code à partager)
     */
    async createGame() {
        return new Promise((resolve, reject) => {
            // Générer un code à 6 chiffres et créer le peer avec cet ID
            const code = String(Math.floor(100000 + Math.random() * 900000));
            this.peer = new Peer(code);
            this.isHost = true;

            this.peer.on('open', (id) => {
                this.playerId = id;
                console.log('🎮 Partie créée ! Code:', id);
                
                // Écouter les connexions entrantes
                this.peer.on('connection', (conn) => {
                    this._handleConnection(conn);
                });

                resolve(id);
            });

            this.peer.on('error', (err) => {
                console.error('❌ Erreur PeerJS:', err);
                reject(err);
            });
        });
    }

    /**
     * Rejoindre une partie existante
     * @param {string} hostId - L'ID de l'hôte
     * @returns {Promise<void>}
     */
    async joinGame(hostId) {
        return new Promise((resolve, reject) => {
            this.peer = new Peer();
            this.isHost = false;

            this.peer.on('open', (id) => {
                this.playerId = id;
                console.log('🔌 Connexion à la partie:', hostId);

                // Se connecter à l'hôte
                const conn = this.peer.connect(hostId);
                this._handleConnection(conn);

                conn.on('open', () => {
                    console.log('✅ Connecté à l\'hôte !');
                    resolve();
                });
            });

            this.peer.on('error', (err) => {
                console.error('❌ Erreur de connexion:', err);
                reject(err);
            });
        });
    }

    /**
     * Gérer une nouvelle connexion
     * @private
     */
    _handleConnection(conn) {
        // ✅ Dédupliquer : si une connexion vers ce pair existe déjà, l'ignorer
        const alreadyConnected = this.connections.some(c => c.peer === conn.peer);
        if (alreadyConnected) {
            console.warn(`⚠️ Connexion dupliquée ignorée pour: ${conn.peer}`);
            return;
        }

        this.connections.push(conn);

        conn.on('open', () => {
            console.log('👤 Nouveau joueur connecté:', conn.peer);
            if (this.onPlayerJoined) {
                this.onPlayerJoined(conn.peer);
            }

            // Envoyer un message de bienvenue
            conn.send({
                type: 'welcome',
                from: this.playerId,
                message: 'Bienvenue dans la partie !'
            });
        });

        conn.on('data', (data) => {
            // ✅ Dédupliquer les messages avec le même msgId reçus en double
            if (data.msgId) {
                if (this._recentMsgIds.has(data.msgId)) {
                    console.warn(`⚠️ Message dupliqué ignoré: ${data.msgId}`);
                    return;
                }
                this._recentMsgIds.add(data.msgId);
                // Nettoyer après 5 secondes
                setTimeout(() => this._recentMsgIds.delete(data.msgId), 5000);
            }
            console.log('📨 Données reçues:', data);
            if (this.onDataReceived) {
                this.onDataReceived(data, conn.peer);
            }
        });

        conn.on('close', () => {
            console.log('👋 Joueur déconnecté:', conn.peer);
            this.connections = this.connections.filter(c => c !== conn);
            if (this.onPlayerLeft) {
                this.onPlayerLeft(conn.peer);
            }
        });
    }

    /**
     * Envoyer des données à tous les joueurs connectés
     * @param {Object} data - Données à envoyer
     */
    broadcast(data) {
        // ✅ Ajouter un ID unique pour détecter les doublons côté receveur
        data.msgId = `${this.playerId}-${++this._msgCounter}`;
        this.connections.forEach(conn => {
            if (conn.open) {
                conn.send(data);
            }
        });
    }

    /**
     * Envoyer des données à un joueur spécifique
     * @param {string} playerId - ID du joueur
     * @param {Object} data - Données à envoyer
     */
    sendTo(playerId, data) {
        const conn = this.connections.find(c => c.peer === playerId);
        if (conn && conn.open) {
            conn.send(data);
        }
    }

    /**
     * Fermer toutes les connexions
     */
    disconnect() {
        this.connections.forEach(conn => conn.close());
        if (this.peer) {
            this.peer.destroy();
        }
    }
}