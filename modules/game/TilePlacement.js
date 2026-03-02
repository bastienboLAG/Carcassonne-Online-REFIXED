/**
 * TilePlacement - Gère la logique de placement des tuiles
 * Responsabilités :
 * - Valider si une tuile peut être placée
 * - Placer une tuile sur le plateau
 * - Gérer l'affichage visuel des tuiles
 * - Émettre les événements de placement
 */
export class TilePlacement {
    constructor(eventBus, plateau, zoneMerger) {
        this.eventBus = eventBus;
        this.plateau = plateau;
        this.zoneMerger = zoneMerger;
        
        // État
        this.firstTilePlaced = false;
        this.lastPlacedTile = null;
        
        // Écouter les événements pour se synchroniser
        this.eventBus.on('tile-placed', (data) => {
            if (data.isFirst) {
                this.firstTilePlaced = true;
                console.log('🔄 TilePlacement: firstTilePlaced = true');
            }
        });
    }

    /**
     * Vérifier si une tuile peut être placée à une position
     */
    canPlace(x, y, tile) {
        // Première tuile : toujours au centre
        if (!this.firstTilePlaced) {
            return x === 50 && y === 50;
        }
        
        // Autres tuiles : vérifier avec le plateau
        return this.plateau.canPlaceTile(x, y, tile);
    }

    /**
     * Placer une tuile
     * @returns {boolean} true si placement réussi
     */
    placeTile(x, y, tile, options = {}) {
        const { isFirst = false, skipSync = false, skipValidation = false } = options;
        
        console.log('🎯 TilePlacement: placement tuile', { x, y, tile: tile.id, isFirst });
        
        if (!tile) {
            console.error('❌ tile est null/undefined');
            return false;
        }
        
        // Valider le placement (sauf reconstruction)
        if (!skipValidation && !this.canPlace(x, y, tile)) {
            console.warn('⚠️ Impossible de placer la tuile ici');
            return false;
        }

        // Afficher visuellement
        this.displayTile(x, y, tile);
        
        // Ajouter au plateau (logique)
        const copy = tile.clone();
        this.plateau.addTile(x, y, copy);

        // Mettre à jour l'état
        if (isFirst || !this.firstTilePlaced) {
            this.firstTilePlaced = true;
        }
        
        this.lastPlacedTile = { x, y };
        
        // Merger les zones (sauf si l'état est fourni par l'hôte)
        if (this.zoneMerger && !options.skipZoneMerger) {
            this.newlyClosedZones = this.zoneMerger.updateZonesForNewTile(x, y) || [];
        } else {
            this.newlyClosedZones = [];
        }
        
        // Émettre événement
        this.eventBus.emit('tile-placed', { 
            x, 
            y, 
            tile,
            isFirst: isFirst || !this.firstTilePlaced,
            skipSync
        });
        
        console.log('✅ Tuile placée avec succès');
        return true;
    }

    /**
     * Afficher visuellement une tuile sur le plateau
     */
    displayTile(x, y, tile) {
        const boardElement = document.getElementById('board');
        if (!boardElement) {
            console.error('❌ Board element introuvable');
            return;
        }
        
        const img = document.createElement('img');
        img.src = tile.imagePath;
        img.className = "tile";
        img.dataset.pos = `${x},${y}`; // Pour retrouver la tuile lors de l'annulation
        img.style.gridColumn = x;
        img.style.gridRow = y;
        img.style.transform = `rotate(${tile.rotation}deg)`;
        boardElement.appendChild(img);
    }

    /**
     * Obtenir la dernière tuile placée
     */
    getLastPlacedTile() {
        return this.lastPlacedTile;
    }

    /**
     * Vérifier si c'est la première tuile
     */
    isFirstTile() {
        return !this.firstTilePlaced;
    }

    /**
     * Réinitialiser pour une nouvelle partie
     */
    reset() {
        this.firstTilePlaced = false;
        this.lastPlacedTile = null;
    }
}
