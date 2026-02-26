/**
 * MeeplePlacement - Gère la logique de placement des meeples
 * Responsabilités :
 * - Valider si un meeple peut être placé
 * - Placer un meeple sur une tuile
 * - Gérer le compteur de meeples disponibles
 * - Émettre les événements de placement
 */
export class MeeplePlacement {
    constructor(eventBus, gameState, zoneMerger) {
        this.eventBus = eventBus;
        this.gameState = gameState;
        this.zoneMerger = zoneMerger;
        
        // État - référence aux meeples placés (partagée avec home.js)
        this.placedMeeples = {};
    }

    /**
     * Définir la référence aux meeples placés
     */
    setPlacedMeeples(placedMeeplesRef) {
        this.placedMeeples = placedMeeplesRef;
    }

    /**
     * Vérifier si un meeple peut être placé à une position
     */
    canPlace(x, y, position, playerId, meepleType = 'Normal') {
        const key = `${x},${y},${position}`;
        
        // 1. Vérifier si position déjà occupée
        if (this.placedMeeples[key]) {
            console.log('❌ Position déjà occupée');
            return false;
        }
        
        // 2. Vérifier que le joueur a des meeples disponibles
        const player = this.gameState.players.find(p => p.id === playerId);
        if (!player) return false;
        const isAbbot   = meepleType === 'Abbot';
        const isLarge   = meepleType === 'Large' || meepleType === 'Large-Farmer';
        const isBuilder = meepleType === 'Builder';
        if (isAbbot && !player.hasAbbot) {
            console.log('❌ Abbé non disponible');
            return false;
        }
        if (isLarge && !player.hasLargeMeeple) {
            console.log('❌ Grand meeple non disponible');
            return false;
        }
        if (isBuilder && !player.hasBuilder) {
            console.log('❌ Bâtisseur non disponible');
            return false;
        }
        if (!isAbbot && !isLarge && !isBuilder && player.meeples <= 0) {
            console.log('❌ Plus de meeples disponibles');
            return false;
        }
        
        // 3. Vérifier que la zone n'a pas déjà un meeple
        if (this.zoneMerger) {
            const mergedZone = this.zoneMerger.findMergedZoneForPosition(x, y, position);
            if (mergedZone) {
                const meeplesInZone = this.zoneMerger.getZoneMeeples(mergedZone, this.placedMeeples);
                if (meeplesInZone.length > 0) {
                    console.log('❌ Zone déjà occupée par un meeple');
                    return false;
                }
            }
        }
        
        return true;
    }

    /**
     * Placer un meeple
     * @returns {boolean} true si placement réussi
     */
    placeMeeple(x, y, position, meepleType, playerId, options = {}) {
        const { skipSync = false } = options;
        
        console.log('🎭 MeeplePlacement: placement meeple', { x, y, position, meepleType, playerId });
        
        // Valider le placement
        if (!this.canPlace(x, y, position, playerId, meepleType)) {
            console.warn('⚠️ Impossible de placer le meeple ici');
            return false;
        }
        
        // Obtenir la couleur du joueur
        const player = this.gameState.players.find(p => p.id === playerId);
        if (!player) {
            console.error('❌ Joueur introuvable');
            return false;
        }
        
        const playerColor = player.color.charAt(0).toUpperCase() + player.color.slice(1);
        const key = `${x},${y},${position}`;
        
        // Sauvegarder dans le registre
        this.placedMeeples[key] = {
            type: meepleType,
            color: playerColor,
            playerId: playerId
        };
        
        // Décrémenter le compteur selon le type
        if (meepleType === 'Abbot') {
            // Abbé géré via hasAbbot dans home.js
        } else if (meepleType === 'Large' || meepleType === 'Large-Farmer') {
            // Grand meeple géré via hasLargeMeeple dans home.js
        } else if (meepleType === 'Builder') {
            // Bâtisseur géré via hasBuilder dans home.js
        } else {
            this.decrementMeeples(playerId);
        }
        
        // Émettre événement
        this.eventBus.emit('meeple-placed', {
            x,
            y,
            position,
            meepleType,
            playerColor,
            playerId,
            skipSync
        });
        
        console.log('✅ Meeple placé avec succès');
        return true;
    }

    /**
     * Décrémenter le nombre de meeples d'un joueur
     */
    decrementMeeples(playerId) {
        const player = this.gameState.players.find(p => p.id === playerId);
        if (player && player.meeples > 0) {
            player.meeples--;
            console.log(`📉 ${player.name} a maintenant ${player.meeples} meeples`);
            
            // Émettre événement
            this.eventBus.emit('meeple-count-updated', {
                playerId,
                meeples: player.meeples
            });
        }
    }

    /**
     * Retourner des meeples à un joueur
     */
    returnMeeples(playerId, count = 1) {
        const player = this.gameState.players.find(p => p.id === playerId);
        if (player) {
            player.meeples += count;
            console.log(`📈 ${player.name} récupère ${count} meeple(s), total: ${player.meeples}`);
            
            // Émettre événement
            this.eventBus.emit('meeple-count-updated', {
                playerId,
                meeples: player.meeples
            });
        }
    }

    /**
     * Retirer un meeple du plateau
     */
    removeMeeple(key) {
        if (this.placedMeeples[key]) {
            const meeple = this.placedMeeples[key];
            delete this.placedMeeples[key];
            
            // Retourner le meeple au joueur
            this.returnMeeples(meeple.playerId, 1);
            
            // Émettre événement
            this.eventBus.emit('meeple-removed', { key, meeple });
            
            return true;
        }
        return false;
    }

    /**
     * Retirer tous les meeples d'une liste de keys
     */
    removeMeeples(keys) {
        keys.forEach(key => this.removeMeeple(key));
    }

    /**
     * Obtenir tous les meeples placés
     */
    getPlacedMeeples() {
        return this.placedMeeples;
    }

    /**
     * Réinitialiser pour une nouvelle partie
     */
    reset() {
        this.placedMeeples = {};
    }
}
