/**
 * ReconnectionManager — Gestion de la pause et de la reconnexion
 *
 * Responsabilités :
 *  - Pause/reprise de partie lors d'une déconnexion
 *  - Exclusion d'un joueur déconnecté
 *  - Auto-reconnexion invité (retry loop)
 *  - Overlays pause et reconnexion
 */
export class ReconnectionManager {
    /**
     * @param {object} deps — dépendances injectées depuis home.js
     * @param {object}   deps.multiplayer
     * @param {object}   deps.gameSync
     * @param {object}   deps.turnManager
     * @param {object}   deps.eventBus
     * @param {Function} deps.getGameState       — () => gameState
     * @param {Function} deps.getPlayers         — () => players
     * @param {Function} deps.setPlayers         — (players) => void
     * @param {Function} deps.getIsHost          — () => boolean
     * @param {Function} deps.getGameCode        — () => string
     * @param {Function} deps.getPlayerName      — () => string
     * @param {Function} deps.hostDrawAndSend    — () => tile|null
     * @param {Function} deps.buildPlayersForBroadcast — () => players[]
     * @param {Function} deps.afficherToast      — (msg, type?) => void
     * @param {Function} deps.onGameSyncInit     — () => void  (rebrancher gameSync après reconnexion)
     */
    constructor(deps) {
        this.multiplayer             = deps.multiplayer;
        this.gameSync                = deps.gameSync;
        this.turnManager             = deps.turnManager;
        this.eventBus                = deps.eventBus;
        this._getGameState           = deps.getGameState;
        this._getPlayers             = deps.getPlayers;
        this._setPlayers             = deps.setPlayers;
        this._getIsHost              = deps.getIsHost;
        this._getGameCode            = deps.getGameCode;
        this._getPlayerName          = deps.getPlayerName;
        this._hostDrawAndSend        = deps.hostDrawAndSend;
        this._buildPlayersForBroadcast = deps.buildPlayersForBroadcast;
        this._afficherToast          = deps.afficherToast;
        this._onGameSyncInit         = deps.onGameSyncInit;

        this.gamePaused         = false;
        this.pauseTimerInterval = null;
        this.pauseTimerEnd      = null;
        this._autoReconnectTimer = null;
    }

    // ── Getters pratiques ────────────────────────────────────────────────────

    get _gameState() { return this._getGameState(); }
    get _isHost()    { return this._getIsHost(); }
    get _gameCode()  { return this._getGameCode(); }

    // ── Pause ────────────────────────────────────────────────────────────────

    pauseGame(disconnectedName) {
        if (!this._isHost || this.gamePaused) return;
        this.gamePaused = true;
        if (this.gameSync) this.gameSync.syncGamePaused(disconnectedName, 0);
        this._showPauseOverlay(disconnectedName);
    }

    resumeGame(reason = 'reconnected') {
        if (!this.gamePaused) return;
        this.gamePaused = false;
        clearInterval(this.pauseTimerInterval);
        this.pauseTimerInterval = null;
        this.pauseTimerEnd      = null;
        this._hidePauseOverlay();
        if (this._isHost && this.gameSync) this.gameSync.syncGameResumed(reason);
    }

    excludeDisconnectedPlayer(disconnectedName) {
        if (!this._isHost) return;
        this.gamePaused = false;
        this._hidePauseOverlay();

        const gameState = this._gameState;
        if (gameState) {
            const idx = gameState.players.findIndex(p => p.name === disconnectedName && p.disconnected);
            if (idx !== -1) {
                const wasCurrentPlayer  = (idx === gameState.currentPlayerIndex);
                const peerId            = gameState.players[idx].id;
                const isSpectatorPlayer = gameState.players[idx]?.color === 'spectator';

                if (isSpectatorPlayer) {
                    gameState.players.splice(idx, 1);
                    if (gameState.currentPlayerIndex >= gameState.players.length) {
                        gameState.currentPlayerIndex = 0;
                    }
                } else {
                    gameState.players[idx].kicked = true;
                    if (wasCurrentPlayer) {
                        let next     = (idx + 1) % gameState.players.length;
                        let attempts = 0;
                        while (gameState.players[next]?.disconnected && attempts < gameState.players.length) {
                            next = (next + 1) % gameState.players.length;
                            attempts++;
                        }
                        gameState.currentPlayerIndex = next;
                    }
                }

                this._setPlayers(this._getPlayers().filter(p => p.id !== peerId));
                this.multiplayer.broadcast({ type: 'players-update', players: this._buildPlayersForBroadcast() });

                if (this.gameSync) this.gameSync.syncGameResumed('timeout');

                if (this.turnManager) {
                    this.turnManager.updateTurnState();
                    if (wasCurrentPlayer) {
                        const _t = this._hostDrawAndSend();
                        if (_t) this.turnManager.receiveYourTurn(_t.id);
                        if (this.gameSync) this.gameSync.syncTurnEnd(false, _t?.id ?? null);
                    }
                    this.eventBus.emit('turn-changed', {
                        isMyTurn:      this.turnManager.isMyTurn,
                        currentPlayer: this.turnManager.getCurrentPlayer()
                    });
                }
            } else {
                if (this.gameSync) this.gameSync.syncGameResumed('timeout');
            }
        }
        this._afficherToast(`👋 ${disconnectedName} a été exclu(e) de la partie.`);
    }

    // ── Auto-reconnexion ─────────────────────────────────────────────────────

    startAutoReconnect() {
        this.stopAutoReconnect();
        window._isAutoReconnecting = true;
        this._showReconnectOverlay();
        this._tryReconnect();
    }

    stopAutoReconnect() {
        if (this._autoReconnectTimer) {
            clearTimeout(this._autoReconnectTimer);
            this._autoReconnectTimer = null;
        }
        window._isAutoReconnecting = false;
    }

    async _tryReconnect() {
        const gameCode   = this._getGameCode();
        const playerName = this._getPlayerName();
        if (!gameCode || !playerName || !this._gameState) return;
        console.log('🔄 Tentative de reconnexion à:', gameCode);

        try {
            this.multiplayer.onHostDisconnected = null;

            if (this.multiplayer.peer) {
                try { this.multiplayer.peer.destroy(); } catch(e) {}
                this.multiplayer.peer = null;
            }
            this.multiplayer.connections = [];
            this.multiplayer._connectedPeers.clear();

            await this.multiplayer.joinGame(gameCode);

            console.log('✅ Reconnexion réussie');
            if (this._autoReconnectTimer) { clearTimeout(this._autoReconnectTimer); this._autoReconnectTimer = null; }

            if (this._onGameSyncInit) this._onGameSyncInit();

            this.multiplayer.onHostDisconnected = () => {
                if (!this._gameState) return;
                console.log('🔌 Connexion hôte perdue — nouvelle tentative...');
                this.startAutoReconnect();
            };

        } catch (err) {
            console.log('⚠️ Reconnexion échouée, nouvelle tentative dans 5s:', err.message);
            this._autoReconnectTimer = setTimeout(() => this._tryReconnect(), 5000);
        }
    }

    // ── Overlays ─────────────────────────────────────────────────────────────

    _showPauseOverlay(name) {
        let overlay = document.getElementById('pause-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'pause-overlay';
            overlay.style.cssText = `
                position:fixed; inset:0; background:rgba(0,0,0,0.7);
                display:flex; flex-direction:column; align-items:center; justify-content:center;
                z-index:9000; color:#fff; font-family:inherit;
            `;
            document.body.appendChild(overlay);
        }

        const hostBtn = this._isHost
            ? `<button id="exclude-player-btn" style="
                margin-top:20px; padding:10px 24px; font-size:15px; font-weight:bold;
                background:#e74c3c; color:#fff; border:none; border-radius:8px; cursor:pointer;">
                Continuer sans ${name}
              </button>`
            : '';

        overlay.innerHTML = `
            <div style="background:rgba(30,40,55,0.97);border-radius:16px;padding:32px 40px;text-align:center;max-width:380px;box-shadow:0 8px 32px rgba(0,0,0,0.5);">
                <div style="font-size:48px;margin-bottom:12px;">⏸</div>
                <h2 style="margin:0 0 8px;font-size:22px;">Partie en pause</h2>
                <p style="margin:0 0 8px;color:#aaa;font-size:15px;"><strong style="color:#fff">${name}</strong> s'est déconnecté(e).</p>
                <p style="margin:0 0 4px;color:#aaa;font-size:13px;">En attente de reconnexion…</p>
                ${this._gameCode ? `<p style="margin:12px 0 0;font-size:13px;color:#aaa;">Code de la partie : <strong style="color:#fff;letter-spacing:2px;">${this._gameCode}</strong></p>` : ''}
                ${hostBtn}
            </div>
        `;
        overlay.style.display = 'flex';

        if (this._isHost) {
            document.getElementById('exclude-player-btn')?.addEventListener('click', () => {
                this.excludeDisconnectedPlayer(name);
            });
        }
    }

    _hidePauseOverlay() {
        const overlay = document.getElementById('pause-overlay');
        if (overlay) overlay.style.display = 'none';
    }

    _showReconnectOverlay() {
        let overlay = document.getElementById('reconnect-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'reconnect-overlay';
            overlay.style.cssText = `
                position:fixed; inset:0; background:rgba(0,0,0,0.75);
                display:flex; flex-direction:column; align-items:center; justify-content:center;
                z-index:9500; color:#fff; font-family:inherit;
            `;
            document.body.appendChild(overlay);
        }
        const codeHtml = this._gameCode
            ? `<p style="margin:20px 0 0;font-size:13px;color:#aaa;">Code : <strong style="color:#fff;letter-spacing:2px;">${this._gameCode}</strong></p>`
            : '';
        overlay.innerHTML = `
            <div style="background:rgba(30,40,55,0.97);border-radius:16px;padding:32px 40px;text-align:center;max-width:340px;box-shadow:0 8px 32px rgba(0,0,0,0.5);">
                <div style="font-size:48px;margin-bottom:12px;">🔌</div>
                <h2 style="margin:0 0 8px;font-size:22px;">Connexion perdue</h2>
                <p style="margin:0 0 16px;color:#aaa;font-size:15px;">Reconnexion en cours…</p>
                <div style="display:flex;justify-content:center;gap:8px;">
                    <span style="width:10px;height:10px;border-radius:50%;background:#4a90e2;animation:rc-bounce 1.2s infinite ease-in-out;"></span>
                    <span style="width:10px;height:10px;border-radius:50%;background:#4a90e2;animation:rc-bounce 1.2s infinite ease-in-out 0.2s;"></span>
                    <span style="width:10px;height:10px;border-radius:50%;background:#4a90e2;animation:rc-bounce 1.2s infinite ease-in-out 0.4s;"></span>
                </div>
                ${codeHtml}
            </div>
            <style>
                @keyframes rc-bounce {
                    0%,80%,100% { transform:scale(0.6); opacity:0.5; }
                    40%          { transform:scale(1.0); opacity:1;   }
                }
            </style>
        `;
        this._hidePauseOverlay();
        overlay.style.display = 'flex';
    }

    hideReconnectOverlay() {
        const overlay = document.getElementById('reconnect-overlay');
        if (overlay) overlay.style.display = 'none';
    }

    /**
     * Nettoyage complet (retour au lobby)
     */
    destroy() {
        this.stopAutoReconnect();
        clearInterval(this.pauseTimerInterval);
        this.pauseTimerInterval = null;
        this.pauseTimerEnd      = null;
        this.gamePaused         = false;
        this._hidePauseOverlay();
        this.hideReconnectOverlay();
    }
}
