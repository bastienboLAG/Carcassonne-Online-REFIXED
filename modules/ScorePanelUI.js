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
        this.eventBus.on('turn-changed',         this._onTurnChanged);
        this.eventBus.on('meeple-count-updated', this._onMeepleCountUpdated);
    }

    onScoreUpdated()       { this.update(); }
    onTurnChanged()        { this.update(); }
    onMeepleCountUpdated() { this.update(); }

    update() {
        const playersScoresDiv = document.getElementById('players-scores');
        if (!playersScoresDiv || !this.gameState) return;

        playersScoresDiv.innerHTML = '';
        const currentPlayer = this.gameState.getCurrentPlayer();

        this.gameState.players.forEach(player => {
            const isCurrentPlayer = currentPlayer && player.id === currentPlayer.id;

            const card = document.createElement('div');
            card.className = 'player-score-card';
            if (isCurrentPlayer) card.classList.add('active');

            const header = document.createElement('div');
            header.className = 'player-score-header';

            if (isCurrentPlayer) {
                const indicator = document.createElement('span');
                indicator.className = 'turn-indicator';
                indicator.textContent = '▶';
                header.appendChild(indicator);
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

            for (let i = 0; i < 7; i++) {
                const meeple = document.createElement('img');
                meeple.src = `./assets/Meeples/${colorCap}/Normal.png`;
                meeple.alt = 'Meeple';
                if (i >= player.meeples) meeple.classList.add('unavailable');
                meeplesDisplay.appendChild(meeple);
            }

            // Abbé (si extension activée)
            if (this.config?.extensions?.abbot) {
                const abbot = document.createElement('img');
                abbot.src = `./assets/Meeples/${colorCap}/Abbot.png`;
                abbot.alt = 'Abbé';
                abbot.style.marginLeft = '6px';
                abbot.style.width  = '25px';
                abbot.style.height = '25px';
                abbot.style.objectFit = 'contain';
                if (!player.hasAbbot) abbot.classList.add('unavailable');
                meeplesDisplay.appendChild(abbot);
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
        this.eventBus.off('turn-changed',         this._onTurnChanged);
        this.eventBus.off('meeple-count-updated', this._onMeepleCountUpdated);
    }
}
