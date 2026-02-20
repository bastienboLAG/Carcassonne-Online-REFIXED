export class Deck {
    constructor() {
        this.tiles = [];
        this.currentIndex = 0;
        this.totalTiles = 0;
    }

    /**
     * Charger les tuiles selon la config
     * config.testDeck       : mode test 15 tuiles Base uniquement
     * config.tileGroups     : { base: true, abbot: false, ... }
     */
    async loadAllTiles(testMode = false, tileGroups = {}) {
        const allTileData = [];

        // ── Groupe Base (toujours chargé) ──────────────────────────────
        const baseIds = testMode
            ? ['24', '03', '01', '02', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14']
            : Array.from({ length: 24 }, (_, i) => String(i + 1).padStart(2, '0'));

        for (const id of baseIds) {
            try {
                const res  = await fetch(`./data/Base/${id}.json`);
                const data = await res.json();
                allTileData.push(data);
            } catch (e) {
                console.error(`Erreur tuile Base/${id}:`, e);
            }
        }

        // ── Groupe Abbot (optionnel) ────────────────────────────────────
        if (tileGroups.abbot) {
            const abbotIds = ['01','02','03','04','05','06','07','08'];
            for (const id of abbotIds) {
                try {
                    const res  = await fetch(`./data/Abbot/${id}.json`);
                    const data = await res.json();
                    allTileData.push(data);
                } catch (e) {
                    console.error(`Erreur tuile Abbot/${id}:`, e);
                }
            }
        }

        // ── Calcul du total ─────────────────────────────────────────────
        if (testMode) {
            this.totalTiles = allTileData.length;
        } else {
            this.totalTiles = allTileData.reduce((sum, d) => sum + d.quantity, 0);
        }

        // ── Création de la pioche ────────────────────────────────────────
        for (const data of allTileData) {
            const quantity  = testMode ? 1 : data.quantity;
            const uniqueId  = `${data.extension.toLowerCase()}-${data.id}`;
            for (let i = 0; i < quantity; i++) {
                this.tiles.push({
                    id:        uniqueId,
                    zones:     data.zones,
                    imagePath: data.image
                });
            }
        }

        // ── Ordre / mélange ──────────────────────────────────────────────
        if (testMode) {
            this.shuffle();
            // Forcer base-04 en première position même en mode test
            const index04 = this.tiles.findIndex(t => t.id === 'base-04');
            if (index04 !== -1) {
                const tile04 = this.tiles.splice(index04, 1)[0];
                this.tiles.unshift(tile04);
            }
            console.log('🧪 Mode test : ordre aléatoire (' + this.tiles.length + ' tuiles)');
        } else {
            this.shuffle();
            // Forcer base-04 en première position
            const index04 = this.tiles.findIndex(t => t.id === 'base-04');
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
        if (this.currentIndex >= this.tiles.length) return null;
        return this.tiles[this.currentIndex++];
    }

    remaining() { return this.tiles.length - this.currentIndex; }
    total()     { return this.totalTiles; }

    getRemainingTilesByType() {
        const counts = {};
        for (let i = this.currentIndex; i < this.tiles.length; i++) {
            const tile = this.tiles[i];
            if (!counts[tile.id]) {
                counts[tile.id] = { id: tile.id, imagePath: tile.imagePath, count: 0 };
            }
            counts[tile.id].count++;
        }
        return Object.values(counts).sort((a, b) => b.count - a.count);
    }
}
