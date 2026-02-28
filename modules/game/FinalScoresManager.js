/**
 * FinalScoresManager - Gère les scores finaux et la modale associée
 * Extrait de home.js pour alléger le fichier principal
 */
export class FinalScoresManager {
    constructor({ gameState, scoring, zoneMerger, gameSync, eventBus, updateTurnDisplay, gameConfig = null }) {
        this.gameState       = gameState;
        this.scoring         = scoring;
        this.zoneMerger      = zoneMerger;
        this.gameSync        = gameSync;
        this.eventBus        = eventBus;
        this.updateTurnDisplay = updateTurnDisplay;
        this.gameConfig      = gameConfig;

        this.gameEnded       = false;
        this.finalScoresData = null;
    }

    /**
     * Calcul et application des scores finaux (appelé par l'hôte)
     */
    computeAndApply(placedMeeples) {
        if (!this.scoring || !this.zoneMerger) return null;

        const detailedScores = this.scoring.applyAndGetFinalScores(placedMeeples, this.gameState);
        console.log('💰 Scores finaux détaillés:', detailedScores);

        this.gameEnded       = true;
        this.finalScoresData = detailedScores;

        this.eventBus.emit('score-updated');
        this.updateTurnDisplay();
        this.showModal(detailedScores);

        if (this.gameSync) this.gameSync.syncGameEnded(detailedScores, this.gameState?.destroyedTilesCount ?? 0);

        return detailedScores;
    }

    /**
     * Réception des scores finaux depuis le réseau (invité)
     */
    receiveFromNetwork(detailedScores, destroyedTilesCount = 0) {
        console.log('🏁 [SYNC] Fin de partie reçue');
        this.gameEnded       = true;
        this.finalScoresData = detailedScores;
        if (this.gameState) this.gameState.destroyedTilesCount = destroyedTilesCount;

        detailedScores.forEach(playerScore => {
            const player = this.gameState.players.find(p => p.id === playerScore.id);
            if (player) {
                player.score       = playerScore.total;
                player.scoreDetail = {
                    cities:       playerScore.cities,
                    roads:        playerScore.roads,
                    monasteries:  playerScore.monasteries,
                    fields:       playerScore.fields,
                    goods:        playerScore.goods ?? 0
                };
                player.goods = playerScore.goodsTokens ?? { cloth: 0, wheat: 0, wine: 0 };
            }
        });

        this.eventBus.emit('score-updated');
        this.updateTurnDisplay();
        this.showModal(detailedScores);
    }

    /**
     * Afficher la modale des scores finaux
     */
    showModal(detailedScores) {
        const modal = document.getElementById('final-scores-modal');
        const isMobile = window.innerWidth < 768;

        // Arrêter le timer de partie et afficher le temps final dans la modale
        if (typeof stopGameTimer === 'function') stopGameTimer();
        const timerEl = document.getElementById('game-timer');
        const timerText = timerEl ? timerEl.textContent : '';
        if (timerEl) timerEl.style.display = 'none';
        const finalTimerEl = document.getElementById('final-scores-timer');
        if (finalTimerEl && timerText) {
            finalTimerEl.textContent = `Durée de la partie : ${timerText.replace('⏱ ', '')}`;
        }

        if (isMobile) {
            this._showModalMobile(detailedScores, modal);
        } else {
            this._showModalDesktop(detailedScores, modal);
        }

        modal.style.display = 'flex';
    }

    _showModalDesktop(detailedScores, modal) {
        const tbody = document.getElementById('final-scores-body');
        tbody.innerHTML = '';
        document.getElementById('final-scores-table').style.display = '';
        const cardsContainer = document.getElementById('final-scores-cards');
        if (cardsContainer) cardsContainer.style.display = 'none';

        detailedScores.forEach(player => {
            if (player.color === 'spectator') return; // spectateur exclu du tableau
            const row      = document.createElement('tr');
            const colorCap = player.color.charAt(0).toUpperCase() + player.color.slice(1);
            const imgSrc   = player.color === 'spectator'
                ? 'assets/Meeples/Spectator.png'
                : `assets/Meeples/${colorCap}/Normal.png`;

            const nameCell = document.createElement('td');
            nameCell.innerHTML = `
                <div class="player-name-cell">
                    <img src="${imgSrc}" alt="${player.color}">
                    <span>${player.name}</span>
                </div>`;
            row.appendChild(nameCell);

            const hasMerchants = this.gameConfig?.extensions?.merchants;
            const vals = hasMerchants
                ? [player.cities, player.roads, player.monasteries, player.fields, player.goods ?? 0, player.total]
                : [player.cities, player.roads, player.monasteries, player.fields, player.total];
            const totalIdx = vals.length - 1;
            vals.forEach((val, i) => {
                const td = document.createElement('td');
                td.textContent = val;
                if (i === totalIdx) td.style.fontWeight = 'bold';
                row.appendChild(td);
            });

            tbody.appendChild(row);
        });

        // Ligne tuiles détruites
        const destroyed = this.gameState?.destroyedTilesCount ?? 0;
        if (destroyed > 0) {
            const footerRow = document.createElement('tr');
            footerRow.style.cssText = 'border-top: 2px solid rgba(255,255,255,0.2); color: rgba(255,255,255,0.6); font-size: 13px;';
            const td = document.createElement('td');
            td.colSpan = 6;
            td.style.textAlign = 'center';
            td.style.padding = '8px 0 4px';
            td.textContent = `🗑️ ${destroyed} tuile${destroyed > 1 ? 's' : ''} détruite${destroyed > 1 ? 's' : ''} durant la partie`;
            footerRow.appendChild(td);
            tbody.appendChild(footerRow);
        }
    }

    _showModalMobile(detailedScores, modal) {
        document.getElementById('final-scores-table').style.display = 'none';

        let cardsContainer = document.getElementById('final-scores-cards');
        if (!cardsContainer) {
            cardsContainer = document.createElement('div');
            cardsContainer.id = 'final-scores-cards';
            document.getElementById('final-scores-table').parentNode.insertBefore(
                cardsContainer,
                document.getElementById('final-scores-table')
            );
        }
        cardsContainer.innerHTML = '';
        cardsContainer.style.display = 'flex';
        cardsContainer.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 10px;
            width: 100%;
            margin-bottom: 16px;
        `;

        const hasMerchantsMobile = this.gameConfig?.extensions?.merchants;
        const labels = hasMerchantsMobile
            ? ['Villes', 'Routes', 'Abbayes', 'Champs', 'Marchandises']
            : ['Villes', 'Routes', 'Abbayes', 'Champs'];
        const keys = hasMerchantsMobile
            ? ['cities', 'roads', 'monasteries', 'fields', 'goods']
            : ['cities', 'roads', 'monasteries', 'fields'];

        detailedScores.forEach((player, index) => {
            if (player.color === 'spectator') return;
            const colorCap = player.color.charAt(0).toUpperCase() + player.color.slice(1);
            const isWinner = index === 0;

            const card = document.createElement('div');
            card.style.cssText = `
                background: ${isWinner ? 'rgba(241,196,15,0.2)' : 'rgba(52,73,94,0.7)'};
                border: 1px solid ${isWinner ? 'rgba(241,196,15,0.5)' : 'rgba(255,255,255,0.1)'};
                border-radius: 10px;
                padding: 12px 14px;
            `;

            // En-tête : meeple + nom + total
            const header = document.createElement('div');
            header.style.cssText = `
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin-bottom: 8px;
            `;
            header.innerHTML = `
                <div style="display:flex;align-items:center;gap:8px;">
                    <img src="assets/Meeples/${colorCap}/Normal.png" style="width:28px;height:28px;">
                    <span style="color:white;font-weight:bold;font-size:15px;">${player.name}</span>
                    ${isWinner ? '<span style="font-size:16px;">🏆</span>' : ''}
                </div>
                <span style="color:${isWinner ? '#f1c40f' : 'white'};font-weight:bold;font-size:20px;">${player.total} pts</span>
            `;
            card.appendChild(header);

            // Détails
            const details = document.createElement('div');
            details.style.cssText = `
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 4px 16px;
            `;
            keys.forEach((key, i) => {
                const row = document.createElement('div');
                row.style.cssText = 'display:flex;justify-content:space-between;color:rgba(255,255,255,0.75);font-size:13px;';
                row.innerHTML = `<span>${labels[i]}</span><span>${player[key]}</span>`;
                details.appendChild(row);
            });
            card.appendChild(details);

            cardsContainer.appendChild(card);
        });

        // Ligne tuiles détruites
        const destroyed = this.gameState?.destroyedTilesCount ?? 0;
        if (destroyed > 0) {
            const footer = document.createElement('div');
            footer.style.cssText = 'text-align:center;color:rgba(255,255,255,0.5);font-size:13px;padding:4px 0 8px;';
            footer.textContent = `🗑️ ${destroyed} tuile${destroyed > 1 ? 's' : ''} détruite${destroyed > 1 ? 's' : ''} durant la partie`;
            cardsContainer.appendChild(footer);
        }
    }

    /**
     * Afficher les scores courants en mode debug
     */
    showDebugModal() {
        if (this.finalScoresData) {
            this.showModal(this.finalScoresData);
            return;
        }
        if (this.gameState && this.gameState.players.length > 0) {
            const currentScores = this.gameState.players
                .map(p => ({
                    id: p.id, name: p.name, color: p.color,
                    cities:      p.scoreDetail?.cities      || 0,
                    roads:       p.scoreDetail?.roads       || 0,
                    monasteries: p.scoreDetail?.monasteries || 0,
                    fields:      p.scoreDetail?.fields      || 0,
                    goods:       p.scoreDetail?.goods       || 0,
                    goodsTokens: p.goods || { cloth: 0, wheat: 0, wine: 0 },
                    total:       p.score
                }))
                .sort((a, b) => b.total - a.total);
            this.showModal(currentScores);
        }
    }
}
