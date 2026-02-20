export class Board {
    constructor() { 
        this.placedTiles = {}; 
    }

    addTile(x, y, tile) { 
        this.placedTiles[`${x},${y}`] = tile; 
    }

    isFree(x, y) { 
        return !this.placedTiles[`${x},${y}`]; 
    }

    /**
     * Vérifie si une tuile peut être placée à une position donnée
     * @param {number} x - Coordonnée X
     * @param {number} y - Coordonnée Y
     * @param {Tile} newTile - La tuile à placer
     * @returns {boolean} - true si le placement est valide
     */
    canPlaceTile(x, y, newTile, riverPhase = false) {
        // Définition des voisins et des positions à vérifier pour chaque bord
        const neighbors = [
            {
                // Voisin du haut (y-1)
                nx: x, 
                ny: y - 1,
                checks: [
                    { newEdge: 'north-left', neighborEdge: 'south-left' },
                    { newEdge: 'north', neighborEdge: 'south' },
                    { newEdge: 'north-right', neighborEdge: 'south-right' }
                ]
            },
            {
                // Voisin de droite (x+1)
                nx: x + 1, 
                ny: y,
                checks: [
                    { newEdge: 'east-top', neighborEdge: 'west-top' },
                    { newEdge: 'east', neighborEdge: 'west' },
                    { newEdge: 'east-bottom', neighborEdge: 'west-bottom' }
                ]
            },
            {
                // Voisin du bas (y+1)
                nx: x, 
                ny: y + 1,
                checks: [
                    { newEdge: 'south-left', neighborEdge: 'north-left' },
                    { newEdge: 'south', neighborEdge: 'north' },
                    { newEdge: 'south-right', neighborEdge: 'north-right' }
                ]
            },
            {
                // Voisin de gauche (x-1)
                nx: x - 1, 
                ny: y,
                checks: [
                    { newEdge: 'west-top', neighborEdge: 'east-top' },
                    { newEdge: 'west', neighborEdge: 'east' },
                    { newEdge: 'west-bottom', neighborEdge: 'east-bottom' }
                ]
            }
        ];

        let hasNeighbor = false;

        // Vérifier chaque voisin
        for (const neighbor of neighbors) {
            const targetTile = this.placedTiles[`${neighbor.nx},${neighbor.ny}`];
            
            if (targetTile) {
                hasNeighbor = true;

                // Vérifier les 3 positions du bord
                for (const check of neighbor.checks) {
                    const newType = newTile.getEdgeType(check.newEdge);
                    const neighborType = targetTile.getEdgeType(check.neighborEdge);

                    // Si les types ne correspondent pas, placement invalide
                    if (newType !== neighborType) {
                        return false;
                    }
                }
            }
        }

        // La tuile doit avoir au moins un voisin
        if (!hasNeighbor) return false;

        // ── Contrainte rivière ─────────────────────────────────────────
        // En phase rivière, la tuile doit connecter au moins un edge river
        if (riverPhase) {
            const riverEdges = ['north', 'east', 'south', 'west'];
            const hasRiverConnection = riverEdges.some(dir => {
                const dirMap = {
                    north: { nx: x,     ny: y - 1, newEdge: 'north', neighborEdge: 'south' },
                    east:  { nx: x + 1, ny: y,     newEdge: 'east',  neighborEdge: 'west'  },
                    south: { nx: x,     ny: y + 1, newEdge: 'south', neighborEdge: 'north' },
                    west:  { nx: x - 1, ny: y,     newEdge: 'west',  neighborEdge: 'east'  }
                };
                const { nx, ny, newEdge, neighborEdge } = dirMap[dir];
                const neighbor = this.placedTiles[`${nx},${ny}`];
                if (!neighbor) return false;
                return newTile.getEdgeType(newEdge) === 'river'
                    && neighbor.getEdgeType(neighborEdge) === 'river';
            });
            if (!hasRiverConnection) return false;
        }

        return true;
    }

    /**
     * Réinitialiser le plateau (retirer toutes les tuiles)
     */
    reset() {
        this.placedTiles = {};
        console.log('🧹 Board: plateau réinitialisé');
    }
}
