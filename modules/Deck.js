export class Deck {
    constructor() {
        this.tiles = [];
        this.currentIndex = 0;
        this.totalTiles = 0;
    }

    /**
     * Charger les tuiles selon la config
     * config.testDeck       : mode test 15 tuiles Base uniquement
     * config.tileGroups     : { base: true, abbot: false, river: false }
     * config.startType      : 'unique' | 'river'
     */
    async loadAllTiles(testMode = false, tileGroups = {}, startType = 'unique') {
        const riverTiles = [];
        const normalTiles = [];

        // ── Groupe River (chargé en premier si activé) ─────────────────
        if (startType === 'river') {
            const riverIds = ['01','02','03','04','05','06','07','08','09','10','11','12'];
            for (const id of riverIds) {
                try {
                    const res  = await fetch(`./data/River/${id}.json`);
                    const data = await res.json();
                    riverTiles.push(data);
                } catch (e) {
                    console.error(`Erreur tuile River/${id}:`, e);
                }
            }
        }

        // ── Groupe Base ─────────────────────────────────────────────────
        const baseIds = testMode
            ? ['24', '03', '01', '02', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14']
            : Array.from({ length: 24 }, (_, i) => String(i + 1).padStart(2, '0'));

        for (const id of baseIds) {
            try {
                const res  = await fetch(`./data/Base/${id}.json`);
                const data = await res.json();
                normalTiles.push(data);
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
                    normalTiles.push(data);
                } catch (e) {
                    console.error(`Erreur tuile Abbot/${id}:`, e);
                }
            }
        }

        // ── Calcul du total ─────────────────────────────────────────────
        const allTileData = [...riverTiles, ...normalTiles];
        if (testMode) {
            this.totalTiles = allTileData.length;
        } else {
            this.totalTiles = allTileData.reduce((sum, d) => sum + d.quantity, 0);
        }

        // ── Création des tuiles river ────────────────────────────────────
        const riverDeck = [];
        for (const data of riverTiles) {
            riverDeck.push({
                id:        `${data.extension.toLowerCase()}-${data.id}`,
                zones:     data.zones,
                imagePath: data.image
            });
        }

        // ── Création du deck normal ──────────────────────────────────────
        const normalDeck = [];
        for (const data of normalTiles) {
            const quantity = testMode ? 1 : data.quantity;
            const uniqueId = `${data.extension.toLowerCase()}-${data.id}`;
            for (let i = 0; i < quantity; i++) {
                normalDeck.push({
                    id:        uniqueId,
                    zones:     data.zones,
                    imagePath: data.image
                });
            }
        }

        // ── Ordre / mélange ──────────────────────────────────────────────
        if (startType === 'river') {
            // River : source fixe, 2-11 shufflées, embouchure fixe
            const source      = riverDeck.find(t => t.id === 'river-01');
            const embouchure  = riverDeck.find(t => t.id === 'river-12');
            const middle      = riverDeck.filter(t => t.id !== 'river-01' && t.id !== 'river-12');
            this._shuffleArray(middle);

            // Deck normal shufflé sans forcer base-04
            this._shuffleArray(normalDeck);

            this.tiles = [source, ...middle, embouchure, ...normalDeck];
            console.log(`🌊 Mode rivière : ${riverDeck.length} tuiles river + ${normalDeck.length} tuiles normales`);

        } else if (testMode) {
            this._shuffleArray(normalDeck);
            // Forcer base-04 en première position en mode test
            const index04 = normalDeck.findIndex(t => t.id === 'base-04');
            if (index04 !== -1) {
                const tile04 = normalDeck.splice(index04, 1)[0];
                normalDeck.unshift(tile04);
            }
            this.tiles = normalDeck;
            console.log('🧪 Mode test : ordre aléatoire (' + this.tiles.length + ' tuiles)');

        } else {
            // Tuile unique : shuffle + base-04 en premier
            this._shuffleArray(normalDeck);
            const index04 = normalDeck.findIndex(t => t.id === 'base-04');
            if (index04 !== -1) {
                const tile04 = normalDeck.splice(index04, 1)[0];
                normalDeck.unshift(tile04);
            }
            this.tiles = normalDeck;
        }

        console.log(`📦 Deck chargé: ${this.tiles.length} tuiles (total: ${this.totalTiles})`);
    }

    _shuffleArray(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
    }

    // Garde pour compatibilité
    shuffle() { this._shuffleArray(this.tiles); }

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
