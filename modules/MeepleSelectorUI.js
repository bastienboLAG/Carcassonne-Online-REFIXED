/**
 * MeepleSelectorUI - Gère le sélecteur de type de meeple
 * CODE COPIÉ EXACTEMENT de afficherSelecteurMeeple et getPlayerColor
 */
export class MeepleSelectorUI {
    constructor(multiplayer, gameState, config = {}) {
        this.multiplayer = multiplayer;
        this.gameState = gameState;
        this.config = config;
    }

    /**
     * Obtenir la couleur du joueur - COPIE EXACTE de getPlayerColor()
     */
    getPlayerColor() {
        if (!this.gameState || !this.multiplayer) return 'Blue';
        const player = this.gameState.players.find(p => p.id === this.multiplayer.playerId);
        return player ? player.color.charAt(0).toUpperCase() + player.color.slice(1) : 'Blue';
    }

    /**
     * Afficher le sélecteur de meeple - COPIE EXACTE de afficherSelecteurMeeple()
     */
    show(x, y, position, zoneType, mouseX, mouseY, onMeepleSelected) {
        const player = this.gameState.players.find(p => p.id === this.multiplayer.playerId);
        console.log('📋 Sélecteur meeple — zone:', zoneType, '— hasAbbot:', player?.hasAbbot, '— meeples:', player?.meeples, '— config.extensions.abbot:', this.config?.extensions?.abbot);
        console.log('📋 playerId recherché:', this.multiplayer.playerId, '— joueurs dispo:', this.gameState.players.map(p => p.id + ':hasAbbot=' + p.hasAbbot));
        
        // Nettoyer l'ancien sélecteur
        const oldSelector = document.getElementById('meeple-selector');
        if (oldSelector) oldSelector.remove();
        
        // Créer le sélecteur
        const selector = document.createElement('div');
        selector.id = 'meeple-selector';
        selector.style.position = 'fixed';
        selector.style.left = `${mouseX}px`;
        selector.style.top = `${mouseY - 80}px`;
        selector.style.transform = 'translateX(-50%)';
        selector.style.zIndex = '1000';
        selector.style.display = 'flex';
        selector.style.gap = '0px';
        selector.style.padding = '2px';
        selector.style.background = 'rgba(44, 62, 80, 0.5)';
        selector.style.borderRadius = '8px';
        selector.style.border = '2px solid gold';
        selector.style.boxShadow = '0 4px 20px rgba(0,0,0,0.5)';
        
        // ✅ Proposer les meeples selon le type de zone
        let meepleTypes = [];
        
        if (zoneType === 'field') {
            // Field → Farmer uniquement
            meepleTypes = [
                { type: 'Farmer', image: `./assets/Meeples/${this.getPlayerColor()}/Farmer.png` }
            ];
        } else if (zoneType === 'road' || zoneType === 'city') {
            // Road ou City → Normal uniquement
            meepleTypes = [
                { type: 'Normal', image: `./assets/Meeples/${this.getPlayerColor()}/Normal.png` }
            ];
        } else if (zoneType === 'garden') {
            // Garden → Abbé uniquement (si disponible)
            const player = this.gameState.players.find(p => p.id === this.multiplayer.playerId);
            if (player?.hasAbbot) {
                meepleTypes = [
                    { type: 'Abbot', image: `./assets/Meeples/${this.getPlayerColor()}/Abbot.png` }
                ];
            }
        } else if (zoneType === 'abbey') {
            // Abbey → Normal + Abbé si disponible
            const player = this.gameState.players.find(p => p.id === this.multiplayer.playerId);
            meepleTypes = [
                { type: 'Normal', image: `./assets/Meeples/${this.getPlayerColor()}/Normal.png` }
            ];
            if (player?.hasAbbot) {
                meepleTypes.push(
                    { type: 'Abbot', image: `./assets/Meeples/${this.getPlayerColor()}/Abbot.png` }
                );
            }
        } else {
            // Par défaut → Normal
            meepleTypes = [
                { type: 'Normal', image: `./assets/Meeples/${this.getPlayerColor()}/Normal.png` }
            ];
        }
        
        meepleTypes.forEach(meeple => {
            const option = document.createElement('div');
            option.style.cursor = 'pointer';
            option.style.padding = '2px';
            option.style.borderRadius = '5px';
            option.style.transition = 'background 0.2s';
            
            const img = document.createElement('img');
            img.src = meeple.image;
            img.style.width = '30px';
            img.style.height = '30px';
            img.style.display = 'block';
            
            option.appendChild(img);
            
            option.onmouseenter = () => {
                option.style.background = 'rgba(255, 215, 0, 0.2)';
            };
            
            option.onmouseleave = () => {
                option.style.background = 'transparent';
            };
            
            option.onclick = (e) => {
                e.stopPropagation();
                onMeepleSelected(x, y, position, meeple.type);
                setTimeout(() => selector.remove(), 0);
            };
            
            selector.appendChild(option);
        });
        
        // Fermer quand on clique ailleurs
        setTimeout(() => {
            const closeOnClickOutside = (e) => {
                if (!selector.contains(e.target)) {
                    selector.remove();
                    document.removeEventListener('click', closeOnClickOutside);
                }
            };
            document.addEventListener('click', closeOnClickOutside);
        }, 10);
        
        document.body.appendChild(selector);
    }

    /**
     * Cacher le sélecteur
     */
    hide() {
        const selector = document.getElementById('meeple-selector');
        if (selector) selector.remove();
    }

    /**
     * Détruire le module et nettoyer
     */
    destroy() {
        console.log('🧹 MeepleSelectorUI: cleanup');
        this.hide();
    }
}
