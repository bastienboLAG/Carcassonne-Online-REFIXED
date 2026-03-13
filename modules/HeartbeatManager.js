/**
 * HeartbeatManager - Détecte les pertes de connexion silencieuses
 * Envoie un ping toutes les 5s, alerte après 30s sans réponse
 */
export class HeartbeatManager {
    constructor({ multiplayer, onPeerTimeout }) {
        this.multiplayer    = multiplayer;
        this.onPeerTimeout  = onPeerTimeout; // (peerId) => void
        this._interval      = null;
        this._lastPong      = {}; // { peerId: timestamp }
        this._timedOut      = new Set(); // peers déjà signalés
        this._PING_INTERVAL = 5000;  // 5s (tests: 3s, prod: 5s)
        this._TIMEOUT       = 30000; // 30s (tests: 15s, prod: 30s)
    }

    start() {
        if (this._interval) return;
        console.log('💓 HeartbeatManager démarré');

        this._interval = setInterval(() => {
            const now = Date.now();

            // Envoyer un ping à tous
            this.multiplayer.broadcast({ type: 'heartbeat-ping' });

            // Vérifier les timeouts
            for (const peerId of this.multiplayer._connectedPeers) {
                const last = this._lastPong[peerId];
                if (!last) {
                    // Initialiser au démarrage
                    this._lastPong[peerId] = now;
                } else if (now - last > this._TIMEOUT && !this._timedOut.has(peerId)) {
                    this._timedOut.add(peerId);
                    console.warn(`💔 Timeout détecté pour ${peerId}`);
                    if (this.onPeerTimeout) this.onPeerTimeout(peerId);
                }
            }
        }, this._PING_INTERVAL);
    }

    stop() {
        if (this._interval) {
            clearInterval(this._interval);
            this._interval = null;
            this._lastPong = {};
            console.log('💓 HeartbeatManager arrêté');
        }
    }

    /**
     * Appelé quand on reçoit un pong (réponse à notre ping)
     */
    receivePong(peerId) {
        this._lastPong[peerId] = Date.now();
    }

    /**
     * Appelé quand on reçoit un ping — on répond avec un pong
     */
    receivePing() {
        this.multiplayer.broadcast({ type: 'heartbeat-pong' });
    }
}
