/**
 * MeepleDisplayUI - Gère l'affichage des meeples sur le plateau
 * CODE COPIÉ EXACTEMENT de afficherMeeple
 */
export class MeepleDisplayUI {
    constructor() {
        this.boardElement = null;
    }

    init() {
        this.boardElement = document.getElementById('board');
    }

    /**
     * Afficher un meeple sur le plateau - COPIE EXACTE de afficherMeeple()
     */
    showMeeple(x, y, position, meepleType, color) {
        // ✅ 1) Créer un conteneur sur la tuile, pas directement le meeple
        let container = document.querySelector(`.meeple-container[data-pos="${x},${y}"]`);
        if (!container) {
            container = document.createElement('div');
            container.className = 'meeple-container';
            container.dataset.pos = `${x},${y}`;
            container.style.gridColumn = x;
            container.style.gridRow = y;
            container.style.position = 'relative';
            container.style.width = '208px';
            container.style.height = '208px';
            container.style.pointerEvents = 'none';
            container.style.zIndex = '50';
            this.boardElement.appendChild(container);
        }
        
        const meeple = document.createElement('img');
        meeple.src = `./assets/Meeples/${color}/${meepleType}.png`;
        meeple.className = 'meeple';
        meeple.dataset.key = `${x},${y},${position}`; // ✅ Pour pouvoir retirer le meeple
        meeple.dataset.position = position;
        
        // Calculer la position dans la grille 5x5
        const row = Math.floor((position - 1) / 5);
        const col = (position - 1) % 5;
        
        const offsetX = 20.8 + (col * 41.6);
        const offsetY = 20.8 + (row * 41.6);
        
        meeple.style.position = 'absolute';
        meeple.style.left = `${offsetX}px`;
        meeple.style.top = `${offsetY}px`;
        meeple.style.width = '60px'; // ✅ Doublé de 30px à 60px
        meeple.style.height = '60px';
        meeple.style.transform = 'translate(-50%, -50%)';
        meeple.style.pointerEvents = 'none';
        
        container.appendChild(meeple);
    }

    /**
     * Retirer un meeple du plateau
     */
    removeMeeple(key) {
        const meeple = document.querySelector(`[data-key="${key}"]`);
        if (meeple) {
            meeple.remove();
        }
    }

    /**
     * Retirer tous les meeples d'une tuile
     */
    removeMeeplesFromTile(x, y) {
        const container = document.querySelector(`.meeple-container[data-pos="${x},${y}"]`);
        if (container) {
            container.remove();
        }
    }

    /**
     * Détruire le module et nettoyer
     */
    destroy() {
        console.log('🧹 MeepleDisplayUI: cleanup');
        
        // Supprimer tous les meeples et conteneurs
        document.querySelectorAll('.meeple-container').forEach(el => el.remove());
        document.querySelectorAll('.meeple').forEach(el => el.remove());
    }
}
