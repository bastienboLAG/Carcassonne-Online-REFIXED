import { getMeepleSize, getGoodsSize } from './MeepleConfig.js';

/**
 * ScorePanelUI - Affichage du tableau de scores avec les meeples
 * CONNECTÉ À EVENTBUS
 */
export class ScorePanelUI {
    constructor(eventBus, gameState, config = {}) {
        this.eventBus  = eventBus;
        this.gameState = gameState;
        this.config    = config;

        // ✅ Binder pour que off() retrouve la même référence
        this._onScoreUpdated      = this.onScoreUpdated.bind(this);
        this._onTurnChanged       = this.onTurnChanged.bind(this);
        this._onMeepleCountUpdated = this.onMeepleCountUpdated.bind(this);

        this.eventBus.on('score-updated',        this._onScoreUpdated);
        // turn-changed géré par updateTurnDisplay() via onTurnChanged(isBonusTurn) direct
        this.eventBus.on('meeple-count-updated', this._onMeepleCountUpdated);

        this._isBonusTurn = false;
    }

    onScoreUpdated()              { this.update(this._isBonusTurn); }
    onTurnChanged(isBonusTurn)    { this._isBonusTurn = isBonusTurn ?? false; this.update(this._isBonusTurn); }
    onMeepleCountUpdated()        { this.update(this._isBonusTurn); }

    update(isBonusTurn = false) {
        const playersScoresDiv = document.getElementById('players-scores');
        if (!playersScoresDiv || !this.gameState) return;

        playersScoresDiv.innerHTML = '';
        const currentPlayer = this.gameState.getCurrentPlayer();

        this.gameState.players.forEach(player => {
            const isCurrentPlayer = currentPlayer && player.id === currentPlayer.id;

            const card = document.createElement('div');
            card.className = 'player-score-card';
            if (isCurrentPlayer) card.classList.add(isBonusTurn ? 'active-bonus' : 'active');

            const header = document.createElement('div');
            header.className = 'player-score-header';

            if (isCurrentPlayer) {
                const indicator = document.createElement('span');
                indicator.className = isBonusTurn ? 'turn-indicator bonus' : 'turn-indicator';
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

            // Affichage des meeples
            const meeplesDisplay = document.createElement('div');
            meeplesDisplay.className = 'player-meeples-display';
            const colorCap = player.color.charAt(0).toUpperCase() + player.color.slice(1);

            const applySize = (el, type) => {
                const { width, height } = getMeepleSize(type, 'panel');
                el.style.width  = width;
                el.style.height = height;
            };

            for (let i = 0; i < 7; i++) {
                const meeple = document.createElement('img');
                meeple.src = `./assets/Meeples/${colorCap}/Normal.png`;
                meeple.alt = 'Meeple';
                applySize(meeple, 'Normal');
                if (i >= player.meeples) meeple.classList.add('unavailable');
                meeplesDisplay.appendChild(meeple);
            }

            // Abbé (si extension activée)
            if (this.config?.extensions?.abbot) {
                const abbot = document.createElement('img');
                abbot.src = `./assets/Meeples/${colorCap}/Abbot.png`;
                abbot.alt = 'Abbé';
                abbot.style.marginLeft = '6px';
                applySize(abbot, 'Abbot');
                abbot.style.objectFit = 'contain';
                if (!player.hasAbbot) abbot.classList.add('unavailable');
                meeplesDisplay.appendChild(abbot);
            }

            // Grand meeple (si extension activée)
            if (this.config?.extensions?.largeMeeple) {
                const large = document.createElement('img');
                large.src = `./assets/Meeples/${colorCap}/Large.png`;
                large.alt = 'Grand Meeple';
                large.style.marginLeft = '6px';
                applySize(large, 'Large');
                large.style.objectFit = 'contain';
                if (!player.hasLargeMeeple) large.classList.add('unavailable');
                meeplesDisplay.appendChild(large);
            }

            if (this.config?.extensions?.tradersBuilders) {
                const builder = document.createElement('img');
                builder.src = `./assets/Meeples/${colorCap}/Builder.png`;
                builder.alt = 'Bâtisseur';
                builder.style.marginLeft = '6px';
                applySize(builder, 'Builder');
                builder.style.objectFit = 'contain';
                if (!player.hasBuilder) builder.classList.add('unavailable');
                meeplesDisplay.appendChild(builder);
            }

            // Jetons marchands (si extension activée)
            if (this.config?.extensions?.merchants) {
                const goods = player.goods || { cloth: 0, wheat: 0, wine: 0 };
                const goodsSize = getGoodsSize('panel');
                const separator = document.createElement('span');
                separator.style.cssText = 'display:inline-block;width:1px;background:rgba(255,255,255,0.2);height:20px;margin:0 6px;vertical-align:middle;';
                meeplesDisplay.appendChild(separator);

                [
                    { key: 'cloth', src: './assets/Misc/C2/Cloth.png',  alt: 'Tissu'  },
                    { key: 'wheat', src: './assets/Misc/C2/Wheat.png',  alt: 'Blé'    },
                    { key: 'wine',  src: './assets/Misc/C2/Wine.png',   alt: 'Vin'    },
                ].forEach(({ key, src, alt }) => {
                    const wrap = document.createElement('span');
                    wrap.style.cssText = 'display:inline-flex;align-items:center;margin-left:4px;gap:2px;';

                    const img = document.createElement('img');
                    img.src = src;
                    img.alt = alt;
                    img.style.width  = goodsSize.width;
                    img.style.height = goodsSize.height;
                    img.style.objectFit = 'contain';
                    wrap.appendChild(img);

                    const count = document.createElement('span');
                    count.textContent = goods[key] ?? 0;
                    count.style.cssText = 'color:white;font-size:11px;font-weight:bold;min-width:10px;';
                    wrap.appendChild(count);

                    meeplesDisplay.appendChild(wrap);
                });
            }

            card.appendChild(meeplesDisplay);
            playersScoresDiv.appendChild(card);
        });
    }

    destroy() {
        console.log('🧹 ScorePanelUI: cleanup');
        const div = document.getElementById('players-scores');
        if (div) div.innerHTML = '';

        // ✅ Même référence → désabonnement effectif
        this.eventBus.off('score-updated',        this._onScoreUpdated);
        this.eventBus.off('meeple-count-updated', this._onMeepleCountUpdated);
    }
}
