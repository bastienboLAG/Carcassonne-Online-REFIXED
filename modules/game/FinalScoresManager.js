/**
 * FinalScoresManager - Gère les scores finaux et la modale associée
 * Extrait de home.js pour alléger le fichier principal
 */
export class FinalScoresManager {
    constructor({ gameState, scoring, zoneMerger, gameSync, eventBus, updateTurnDisplay }) {
        this.gameState       = gameState;
        this.scoring         = scoring;
        this.zoneMerger      = zoneMerger;
        this.gameSync        = gameSync;
        this.eventBus        = eventBus;
        this.updateTurnDisplay = updateTurnDisplay;

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

        if (this.gameSync) this.gameSync.syncGameEnded(detailedScores);

        return detailedScores;
    }

    /**
     * Réception des scores finaux depuis le réseau (invité)
     */
    receiveFromNetwork(detailedScores) {
        console.log('🏁 [SYNC] Fin de partie reçue');
        this.gameEnded       = true;
        this.finalScoresData = detailedScores;

        detailedScores.forEach(playerScore => {
            const player = this.gameState.players.find(p => p.id === playerScore.id);
            if (player) {
                player.score       = playerScore.total;
                player.scoreDetail = {
                    cities:       playerScore.cities,
                    roads:        playerScore.roads,
                    monasteries:  playerScore.monasteries,
                    fields:       playerScore.fields
                };
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
            const row      = document.createElement('tr');
            const colorCap = player.color.charAt(0).toUpperCase() + player.color.slice(1);

            const nameCell = document.createElement('td');
            nameCell.innerHTML = `
                <div class="player-name-cell">
                    <img src="assets/Meeples/${colorCap}/Normal.png" alt="${player.color}">
                    <span>${player.name}</span>
                </div>`;
            row.appendChild(nameCell);

            [player.cities, player.roads, player.monasteries, player.fields, player.total].forEach((val, i) => {
                const td = document.createElement('td');
                td.textContent = val;
                if (i === 4) td.style.fontWeight = 'bold';
                row.appendChild(td);
            });

            tbody.appendChild(row);
        });
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

        const labels = ['Villes', 'Routes', 'Abbayes', 'Champs'];
        const keys   = ['cities', 'roads', 'monasteries', 'fields'];

        detailedScores.forEach((player, index) => {
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
                    total:       p.score
                }))
                .sort((a, b) => b.total - a.total);
            this.showModal(currentScores);
        }
    }
}
