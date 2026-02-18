export class Deck {
    constructor() {
        this.tiles = [];
        this.currentIndex = 0;
        this.totalTiles = 0;
    }

    async loadAllTiles(testMode = false) {
        // ✅ Deck de test : tuile 24 en 1ère, tuile 03 en 2ème, puis le reste
        const tileIds = testMode 
            ? ['24', '03', '01', '02', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14']
            : Array.from({ length: 24 }, (_, i) => String(i + 1).padStart(2, '0'));
        
        const allTileData = [];

        for (const id of tileIds) {
            try {
                const response = await fetch(`./data/Base/${id}.json`);
                const data = await response.json();
                allTileData.push(data);
            } catch (error) {
                console.error(`Erreur lors du chargement de la tuile ${id}:`, error);
            }
        }

        // ✅ CORRECTION : Calculer le total en tenant compte du mode test
        if (testMode) {
            this.totalTiles = allTileData.length; // 1 de chaque = nombre de tuiles différentes
        } else {
            this.totalTiles = allTileData.reduce((sum, data) => sum + data.quantity, 0);
        }

        // Créer la pioche avec toutes les tuiles
        for (const data of allTileData) {
            // ✅ En mode test, prendre seulement 1 exemplaire de chaque tuile
            const quantity = testMode ? 1 : data.quantity;
            
            // Construire l'ID unique avec le préfixe de l'extension
            const uniqueId = `${data.extension}-${data.id}`;
            
            for (let i = 0; i < quantity; i++) {
                this.tiles.push({
                    id: uniqueId, // ex: "base-01"
                    zones: data.zones,
                    imagePath: data.image // Utiliser le champ "image" du JSON
                });
            }
        }

        if (testMode) {
            // ✅ En mode test : pas de mélange, ordre fixé (24 → 03 → 02 → 01 → ...)
            // Inverser base-01 et base-02 pour les tests de repioche
            const idx01 = this.tiles.findIndex(t => t.id === 'base-01');
            const idx02 = this.tiles.findIndex(t => t.id === 'base-02');
            if (idx01 !== -1 && idx02 !== -1) {
                [this.tiles[idx01], this.tiles[idx02]] = [this.tiles[idx02], this.tiles[idx01]];
            }
            console.log('🧪 Mode test : ordre des tuiles fixé (24 → 03 → 02 → 01 → reste)');
        } else {
            // Mélanger la pioche
            this.shuffle();
            
            // Forcer la tuile base-04 en première position
            const index04 = this.tiles.findIndex(t => t.id === "base-04");
            if (index04 !== -1) {
                const tile04 = this.tiles.splice(index04, 1)[0];
                this.tiles.unshift(tile04);
            }
        }
        
        console.log(`📦 Deck chargé: ${this.tiles.length} tuiles (total: ${this.totalTiles})`);
    }

    shuffle() {
        for (let i = this.tiles.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.tiles[i], this.tiles[j]] = [this.tiles[j], this.tiles[i]];
        }
    }

    draw() {
        if (this.currentIndex >= this.tiles.length) {
            return null;
        }
        return this.tiles[this.currentIndex++];
    }

    remaining() {
        return this.tiles.length - this.currentIndex;
    }

    total() {
        return this.totalTiles;
    }

    /**
     * Obtenir les tuiles restantes groupées par type avec leur quantité
     * @returns {Array} Liste des tuiles avec {id, imagePath, count}
     */
    getRemainingTilesByType() {
        // Compter les tuiles restantes par ID
        const counts = {};
        
        for (let i = this.currentIndex; i < this.tiles.length; i++) {
            const tile = this.tiles[i];
            if (!counts[tile.id]) {
                counts[tile.id] = {
                    id: tile.id,
                    imagePath: tile.imagePath,
                    count: 0
                };
            }
            counts[tile.id].count++;
        }
        
        // Convertir en tableau et trier par quantité décroissante
        return Object.values(counts)
            .sort((a, b) => b.count - a.count);
    }
}
