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
        this._connectedPeers = new Set(); // Pour dédupliquer les connexions par peer ID
        this.onHeartbeatPing = null; // Callback quand on reçoit un ping
        this.onHeartbeatPong = null; // Callback quand on reçoit un pong
        this.onHostDisconnected = null; // Callback quand l'hôte se déconnecte (côté invité)
    }

    /**
     * Créer une partie (devenir l'hôte)
     * @returns {Promise<string>} L'ID de la partie (code à partager)
     */
    async createGame() {
        return new Promise((resolve, reject) => {
            // Générer un code à 6 chiffres et créer le peer avec cet ID
            const code = String(Math.floor(100000 + Math.random() * 900000));

        const peerConfig = {
            config: {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                    { urls: 'stun:stun2.l.google.com:19302' },
                ]
            }
        };
            this.peer = new Peer(code, peerConfig);
            this.isHost = true;

            this.peer.on('open', (id) => {
                this.playerId = id;
                console.log('🎮 Partie créée ! Code:', id);
                
                // Écouter les connexions entrantes
                this.peer.on('connection', (conn) => {
                    // PeerJS peut déclencher 'connection' deux fois pour le même pair
                    // (connexion entrante + connexion retour automatique)
                    // On bloque immédiatement si le pair est déjà connu
                    if (conn.peer && this._connectedPeers.has(conn.peer)) {
                        console.warn(`⚠️ [HOST] Connexion entrante ignorée (pair déjà connu): ${conn.peer}`);
                        return;
                    }
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

        const peerConfig = {
            config: {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                    { urls: 'stun:stun2.l.google.com:19302' },
                ]
            }
        };
            this.peer = new Peer(undefined, peerConfig);
            this.isHost = false;

            let _joinResolved = false;

            this.peer.on('open', (id) => {
                this.playerId = id;
                console.log('🔌 Connexion à la partie:', hostId);

                // Se connecter à l'hôte
                const conn = this.peer.connect(hostId);
                // resolve() dans le conn.on('open') de _handleConnection
                conn.once('open', () => {
                    console.log('✅ Connecté à l\'hôte !');
                    _joinResolved = true;
                    resolve();
                });
                this._handleConnection(conn);
            });

            this.peer.on('error', (err) => {
                console.error('❌ Erreur de connexion:', err);
                if (_joinResolved) {
                    // Connexion déjà établie : erreur réseau → déconnexion hôte
                    if (err.type === 'network' || err.type === 'disconnected' || err.type === 'server-error') {
                        if (this.onHostDisconnected) {
                            this.onHostDisconnected();
                        }
                    }
                } else {
                    // Erreur pendant la tentative de connexion initiale
                    reject(err);
                }
            });
        });
    }

    /**
     * Gérer une nouvelle connexion
     * @private
     */
    _handleConnection(conn) {
        // ✅ Utiliser un flag sur conn pour garantir l'initialisation unique
        // même si PeerJS déclenche 'open' plusieurs fois
        conn._initialized = false;

        const onOpen = () => {
            const peerId = conn.peer;

            // ✅ Dédupliquer via Set global — couvre tous les cas
            // (double open, double _handleConnection, deux objets conn pour même pair)
            if (this._connectedPeers.has(peerId)) {
                console.warn(`⚠️ Pair déjà connecté, connexion ignorée: ${peerId}`);
                return;
            }
            this._connectedPeers.add(peerId);

            this.connections.push(conn);
            console.log('👤 Nouveau joueur connecté:', peerId);

            if (this.onPlayerJoined) {
                this.onPlayerJoined(peerId);
            }

            conn.send({
                type: 'welcome',
                from: this.playerId,
                message: 'Bienvenue dans la partie !',
                version: this.appVersion ?? null,
                origin:  this.appOrigin  ?? null,
            });
        };

        const onData = (data) => {
            // Messages heartbeat — traités directement, pas de dédup ni de log
            if (data.type === 'heartbeat-ping') {
                if (this.onHeartbeatPing) this.onHeartbeatPing(conn.peer);
                return;
            }
            if (data.type === 'heartbeat-pong') {
                if (this.onHeartbeatPong) this.onHeartbeatPong(conn.peer);
                return;
            }

            // Dédupliquer les messages broadcast reçus en double
            if (data.msgId) {
                if (this._recentMsgIds.has(data.msgId)) {
                    console.warn(`⚠️ Message dupliqué ignoré: ${data.msgId}`);
                    return;
                }
                this._recentMsgIds.add(data.msgId);
                setTimeout(() => this._recentMsgIds.delete(data.msgId), 5000);
            }
            console.log('📨 Données reçues:', data);
            if (this.onDataReceived) {
                this.onDataReceived(data, conn.peer);
            }
        };

        const onClose = () => {
            const peerId = conn.peer;
            console.log('👋 Joueur déconnecté:', peerId);
            this.connections = this.connections.filter(c => c !== conn);
            this._connectedPeers.delete(peerId);
            if (this.onPlayerLeft) {
                this.onPlayerLeft(peerId);
            }
            // Si on est invité et que c'est l'hôte qui déco → callback dédié
            if (!this.isHost && this.onHostDisconnected) {
                this.onHostDisconnected();
            }
        };

        conn.on('open',  onOpen);
        conn.on('data',  onData);
        conn.on('close', onClose);
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
     * Envoyer à tous sauf un pair spécifique (pour le relais hôte)
     */
    broadcastExcept(data, excludePeerId) {
        this.connections.forEach(conn => {
            if (conn.open && conn.peer !== excludePeerId) {
                conn.send(data);
            }
        });
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