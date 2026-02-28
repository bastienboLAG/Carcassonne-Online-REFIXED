import { getMeepleSize, getGoodsSize } from './MeepleConfig.js';

/**
 * ScorePanelUI - Affichage des joueurs : panel PC + barre mobile
 *
 * Toute la logique de rendu des meeples est centralisée dans
 * _buildMeeplesDisplay(), appelée par les deux rendus (PC et mobile).
 */
export class ScorePanelUI {
    constructor(eventBus, gameState, config = {}) {
        this.eventBus  = eventBus;
        this.gameState = gameState;
        this.config    = config;

        this._onScoreUpdated       = this.onScoreUpdated.bind(this);
        this._onMeepleCountUpdated = this.onMeepleCountUpdated.bind(this);

        this.eventBus.on('score-updated',        this._onScoreUpdated);
        this.eventBus.on('meeple-count-updated', this._onMeepleCountUpdated);

        this._isBonusTurn = false;
    }

    onScoreUpdated()           { this.update(this._isBonusTurn); }
    onTurnChanged(isBonusTurn) { this._isBonusTurn = isBonusTurn ?? false; this.update(this._isBonusTurn); }
    onMeepleCountUpdated()     { this.update(this._isBonusTurn); }

    // ─────────────────────────────────────────────────────────────
    // Point d'entrée unique — met à jour PC ET mobile
    // ─────────────────────────────────────────────────────────────

    update(isBonusTurn = false) {
        this._updateDesktop(isBonusTurn);
        this._updateMobile(isBonusTurn);
    }

    // Alias public pour home.js (compatibilité)
    updateMobile() { this._updateMobile(this._isBonusTurn); }

    // ─────────────────────────────────────────────────────────────
    // Rendu PC
    // ─────────────────────────────────────────────────────────────

    _updateDesktop(isBonusTurn) {
        const container = document.getElementById('players-scores');
        if (!container || !this.gameState) return;

        container.innerHTML = '';
        const currentPlayer = this.gameState.getCurrentPlayer();

        this.gameState.players.forEach(player => {
            const isActive = currentPlayer && player.id === currentPlayer.id;

            const card = document.createElement('div');
            card.className = 'player-score-card';
            if (isActive) card.classList.add(isBonusTurn ? 'active-bonus' : 'active');

            // En-tête : indicateur tour + nom + score
            const header = document.createElement('div');
            header.className = 'player-score-header';

            if (isActive) {
                const indicator = document.createElement('span');
                indicator.className   = isBonusTurn ? 'turn-indicator bonus' : 'turn-indicator';
                indicator.textContent = '▶';
                header.appendChild(indicator);
                if (isBonusTurn) {
                    const star = document.createElement('span');
                    star.className   = 'bonus-star';
                    star.textContent = '⭐';
                    header.appendChild(star);
                }
            }

            const name = document.createElement('span');
            name.className   = 'player-score-name';
            name.textContent = player.name;
            header.appendChild(name);

            const points = document.createElement('span');
            points.className   = 'player-score-points';
            points.textContent = `${player.score} point${player.score > 1 ? 's' : ''}`;
            header.appendChild(points);

            card.appendChild(header);

            // Meeples
            const meeplesDisplay = document.createElement('div');
            meeplesDisplay.className = 'player-meeples-display';
            this._buildMeeplesDisplay(meeplesDisplay, player, 'panel');

            card.appendChild(meeplesDisplay);
            container.appendChild(card);
        });
    }

    // ─────────────────────────────────────────────────────────────
    // Rendu mobile
    // ─────────────────────────────────────────────────────────────

    _updateMobile(isBonusTurn) {
        const container = document.getElementById('mobile-players-scores');
        if (!container || !this.gameState) return;

        container.innerHTML = '';
        const currentPlayer = this.gameState.getCurrentPlayer();

        this.gameState.players.forEach(player => {
            const isActive = currentPlayer && player.id === currentPlayer.id;

            const card = document.createElement('div');
            card.className = 'mobile-player-card' + (isActive ? (isBonusTurn ? ' active active-bonus' : ' active') : '');
            card.dataset.playerId = player.id;

            const name = document.createElement('div');
            name.className   = 'mobile-player-name';
            name.textContent = player.name;
            card.appendChild(name);

            const score = document.createElement('div');
            score.className   = 'mobile-player-score';
            score.textContent = player.score + ' pts';
            card.appendChild(score);

            const meeplesDiv = document.createElement('div');
            meeplesDiv.className = 'mobile-player-meeples';
            this._buildMeeplesDisplay(meeplesDiv, player, 'panelMobile');

            card.appendChild(meeplesDiv);
            container.appendChild(card);
        });
    }

    // ─────────────────────────────────────────────────────────────
    // Méthode partagée : construit les meeples dans un container
    // context : 'panel' (PC) | 'panelMobile' (mobile)
    // ─────────────────────────────────────────────────────────────

    _buildMeeplesDisplay(container, player, context) {
        const colorCap = player.color.charAt(0).toUpperCase() + player.color.slice(1);

        const applySize = (el, type) => {
            const { width, height } = getMeepleSize(type, context);
            el.style.width     = width;
            el.style.height    = height;
            el.style.objectFit = 'contain';
        };

        // 7 meeples normaux
        for (let i = 0; i < 7; i++) {
            const img = document.createElement('img');
            img.src = `./assets/Meeples/${colorCap}/Normal.png`;
            img.alt = 'Meeple';
            applySize(img, 'Normal');
            if (i >= player.meeples) img.classList.add('unavailable');
            container.appendChild(img);
        }

        // Abbé
        if (this.config?.extensions?.abbot) {
            const img = document.createElement('img');
            img.src = `./assets/Meeples/${colorCap}/Abbot.png`;
            img.alt = 'Abbé';
            applySize(img, 'Abbot');
            if (!player.hasAbbot) img.classList.add('unavailable');
            container.appendChild(img);
        }

        // Grand meeple
        if (this.config?.extensions?.largeMeeple) {
            const img = document.createElement('img');
            img.src = `./assets/Meeples/${colorCap}/Large.png`;
            img.alt = 'Grand Meeple';
            applySize(img, 'Large');
            if (!player.hasLargeMeeple) img.classList.add('unavailable');
            container.appendChild(img);
        }

        // Bâtisseur
        if (this.config?.extensions?.tradersBuilders) {
            const img = document.createElement('img');
            img.src = `./assets/Meeples/${colorCap}/Builder.png`;
            img.alt = 'Bâtisseur';
            applySize(img, 'Builder');
            if (!player.hasBuilder) img.classList.add('unavailable');
            container.appendChild(img);
        }

        // Cochon
        if (this.config?.extensions?.pig) {
            const img = document.createElement('img');
            img.src = `./assets/Meeples/${colorCap}/Pig.png`;
            img.alt = 'Cochon';
            applySize(img, 'Pig');
            if (!player.hasPig) img.classList.add('unavailable');
            container.appendChild(img);
        }

        // Jetons marchandises (PC uniquement — trop petit sur mobile)
        if (context === 'panel' && this.config?.extensions?.merchants) {
            const goods     = player.goods || { cloth: 0, wheat: 0, wine: 0 };
            const goodsSize = getGoodsSize('panel');

            const separator = document.createElement('span');
            separator.style.cssText = 'display:inline-block;width:1px;background:rgba(255,255,255,0.2);height:20px;margin:0 6px;vertical-align:middle;align-self:center;';
            container.appendChild(separator);

            [
                { key: 'cloth', src: './assets/Misc/C2/Cloth.png', alt: 'Tissu' },
                { key: 'wheat', src: './assets/Misc/C2/Wheat.png', alt: 'Blé'   },
                { key: 'wine',  src: './assets/Misc/C2/Wine.png',  alt: 'Vin'   },
            ].forEach(({ key, src, alt }) => {
                const wrap = document.createElement('span');
                wrap.style.cssText = 'display:inline-flex;align-items:center;gap:2px;';

                const img = document.createElement('img');
                img.src          = src;
                img.alt          = alt;
                img.style.width  = goodsSize.width;
                img.style.height = goodsSize.height;
                img.style.objectFit = 'contain';
                wrap.appendChild(img);

                const count = document.createElement('span');
                count.textContent = goods[key] ?? 0;
                count.style.cssText = 'color:white;font-size:11px;font-weight:bold;min-width:10px;';
                wrap.appendChild(count);

                container.appendChild(wrap);
            });
        }
    }

    destroy() {
        console.log('🧹 ScorePanelUI: cleanup');
        const desktopDiv = document.getElementById('players-scores');
        if (desktopDiv) desktopDiv.innerHTML = '';
        const mobileDiv = document.getElementById('mobile-players-scores');
        if (mobileDiv) mobileDiv.innerHTML = '';

        this.eventBus.off('score-updated',        this._onScoreUpdated);
        this.eventBus.off('meeple-count-updated', this._onMeepleCountUpdated);
    }
}
