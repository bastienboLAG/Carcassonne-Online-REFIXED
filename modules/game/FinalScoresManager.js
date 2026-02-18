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
        const tbody = document.getElementById('final-scores-body');
        tbody.innerHTML = '';

        detailedScores.forEach(player => {
            const row     = document.createElement('tr');
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

        modal.style.display = 'flex';
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
