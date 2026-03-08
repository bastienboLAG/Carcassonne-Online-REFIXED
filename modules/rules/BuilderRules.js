/**
 * BuilderRules - Règles de l'extension Marchands & Bâtisseurs
 *
 * Gère :
 * - Validation du placement du bâtisseur (city ou road, zone avec meeple du joueur)
 * - Validation du placement du cochon (field, zone avec meeple du joueur)
 * - Détection du tour bonus (tuile posée étend la zone du bâtisseur)
 * - Retour du bâtisseur quand sa zone est scorée
 * - getPigZones() pour le bonus cochon en fin de partie (Scoring.js)
 */
export class BuilderRules {
    constructor(eventBus, gameState, zoneMerger, config = {}) {
        this.eventBus   = eventBus;
        this.gameState  = gameState;
        this.zoneMerger = zoneMerger;
        this.config     = config;
        this.enabled    = false;

        // Référence partagée aux meeples placés (injectée depuis home.js)
        this.placedMeeples = {};

        // Tuile posée ce tour (pour la vérification du tour bonus bâtisseur)
        this._lastPlacedTile = null;

        this._onTilePlaced           = this._checkBonusTrigger.bind(this);
        this._onMeeplePlacementCheck = this._validateMeeplePlacement.bind(this);
        this._onZoneCompleted        = this._onZoneCompleted.bind(this);
    }

    register() {
        if (this.enabled) return;
        this.enabled = true;
        this.eventBus.on('tile-placed',             this._onTilePlaced);
        this.eventBus.on('meeple-placement-check',  this._onMeeplePlacementCheck);
        this.eventBus.on('zone-completed',          this._onZoneCompleted);
        console.log('✅ BuilderRules activées (bâtisseur + cochon)');
    }

    unregister() {
        if (!this.enabled) return;
        this.enabled = false;
        this.eventBus.off('tile-placed',            this._onTilePlaced);
        this.eventBus.off('meeple-placement-check', this._onMeeplePlacementCheck);
        this.eventBus.off('zone-completed',         this._onZoneCompleted);
        console.log('🔴 BuilderRules désactivées');
    }

    // Alias pour PigRules.init() — compatibilité si appelé avec eventBus en param
    init(eventBus) {
        if (eventBus) this.eventBus = eventBus;
        this.register();
    }

    destroy(eventBus) {
        this.unregister();
    }

    setPlacedMeeples(ref) {
        this.placedMeeples = ref;
    }

    // ─────────────────────────────────────────────────────────────
    // Validation placement (bâtisseur + cochon)
    // ─────────────────────────────────────────────────────────────

    /**
     * Dispatcher : délègue au validateur approprié selon le type de meeple.
     * Écouté sur 'meeple-placement-check' ET 'validate-meeple-placement'.
     */
    _validateMeeplePlacement(data) {
        if (data.meepleType === 'Builder') this._validateBuilder(data);
        if (data.meepleType === 'Pig')     this._validatePig(data);
    }

    // Alias public utilisé par home.js (ancienne signature)
    validateMeeplePlacement(data) {
        this._validateMeeplePlacement(data);
    }

    /**
     * Bâtisseur : city ou road, joueur déjà présent dans la zone.
     */
    _validateBuilder(data) {
        const { x, y, position, playerId, result } = data;
        const player = this.gameState.players.find(p => p.id === playerId);

        if (!player?.hasBuilder) {
            result.allowed = false;
            result.reason  = 'builder_not_available';
            return;
        }

        const mergedZone = this.zoneMerger.findMergedZoneForPosition(x, y, position);
        if (!mergedZone || (mergedZone.type !== 'city' && mergedZone.type !== 'road')) {
            result.allowed = false;
            result.reason  = 'builder_wrong_zone_type';
            return;
        }

        const zoneMeeples  = this.zoneMerger.getZoneMeeples(mergedZone, this.placedMeeples);
        const hasOwnMeeple = zoneMeeples.some(m =>
            m.playerId === playerId &&
            m.type !== 'Builder' &&
            m.type !== 'Farmer' &&
            m.type !== 'Large-Farmer'
        );

        if (!hasOwnMeeple) {
            result.allowed = false;
            result.reason  = 'builder_no_own_meeple_in_zone';
        }
    }

    /**
     * Cochon : field uniquement, joueur déjà présent dans la zone (Normal/Farmer/Large/Large-Farmer).
     */
    _validatePig(data) {
        const { x, y, position, playerId, result } = data;
        const player = this.gameState.players.find(p => p.id === playerId);

        if (!player?.hasPig) {
            result.allowed = false;
            result.reason  = 'pig_not_available';
            return;
        }

        const mergedZone = this.zoneMerger.findMergedZoneForPosition(x, y, position);
        if (!mergedZone || mergedZone.type !== 'field') {
            result.allowed = false;
            result.reason  = 'pig_wrong_zone_type';
            return;
        }

        const zoneMeeples  = this.zoneMerger.getZoneMeeples(mergedZone, this.placedMeeples);
        const hasOwnMeeple = zoneMeeples.some(m =>
            m.playerId === playerId &&
            (m.type === 'Normal' || m.type === 'Farmer' ||
             m.type === 'Large'  || m.type === 'Large-Farmer')
        );

        if (!hasOwnMeeple) {
            result.allowed = false;
            result.reason  = 'pig_no_own_meeple_in_zone';
        }
    }


    // ─────────────────────────────────────────────────────────────
    // Marchandises : distribution et scoring final
    // ─────────────────────────────────────────────────────────────

    /**
     * Appelé depuis Scoring.scoreClosedZones quand une ville est fermée.
     * Le joueur actif reçoit les jetons cloth/wheat/wine de cette ville,
     * même si la ville est vide de meeples.
     * @param {object} mergedZone  - Zone fermée (type === 'city')
     * @param {string} currentPlayerId
     * @param {object} gameState
     * @returns {{ playerId, cloth, wheat, wine }|null}  Résultat à broadcaster, ou null
     */
    distributeGoods(mergedZone, currentPlayerId, gameState) {
        if (!this.config?.extensions?.merchants) return null;
        if (mergedZone.type !== 'city') return null;
        if (!currentPlayerId || !gameState) return null;
        // Guard : goods déjà distribués pour cette ville fermée


        // Calculer les goods à la volée en parcourant les tuiles de la zone
        // (rien n'est stocké sur la zone, zéro risque de double-distribution)
        const board = this.zoneMerger.board;
        let cloth = 0, wheat = 0, wine = 0;

        for (const { x, y, zoneIndex } of mergedZone.tiles) {
            const tile = board.placedTiles[`${x},${y}`];
            if (!tile?.zones?.[zoneIndex]?.features) continue;
            const features = Array.isArray(tile.zones[zoneIndex].features)
                ? tile.zones[zoneIndex].features
                : [tile.zones[zoneIndex].features];
            if (features.includes('cloth')) cloth++;
            if (features.includes('wheat')) wheat++;
            if (features.includes('wine'))  wine++;
        }

        if (!cloth && !wheat && !wine) return null;

        const player = gameState.players.find(p => p.id === currentPlayerId);
        if (!player) return null;

        player.goods        = player.goods || { cloth: 0, wheat: 0, wine: 0 };
        player.goods.cloth += cloth;
        player.goods.wheat += wheat;
        player.goods.wine  += wine;

        console.log(`🧺 ${player.name} reçoit marchandises : cloth=${cloth} wheat=${wheat} wine=${wine}`);
        return { playerId: currentPlayerId, cloth, wheat, wine };
    }

    /**
     * Appelé depuis Scoring.applyAndGetFinalScores.
     * Attribue 10 pts par catégorie (cloth/wheat/wine) au(x) joueur(s) majoritaire(s).
     * @param {object} gameState
     */
    applyMerchandiseFinalScores(gameState) {
        if (!this.config?.extensions?.merchants) return;

        ['cloth', 'wheat', 'wine'].forEach(good => {
            const max = Math.max(...gameState.players.map(p => p.goods?.[good] ?? 0));
            if (max === 0) return;
            gameState.players
                .filter(p => (p.goods?.[good] ?? 0) === max)
                .forEach(p => {
                    p.score += 10;
                    p.scoreDetail.goods = (p.scoreDetail.goods || 0) + 10;
                    console.log(`🏅 ${p.name} +10 pts (majorité ${good} : ${max} jetons)`);
                });
        });
    }

    // ─────────────────────────────────────────────────────────────
    // Cochon : zones pour le bonus scoring
    // ─────────────────────────────────────────────────────────────

    /**
     * Retourne une Map<zoneId, playerId> des fields où un cochon est posé.
     * Utilisé par Scoring.calculateFinalScores pour appliquer ×4 au lieu de ×3.
     */
    getPigZones() {
        const pigZones = new Map();
        Object.entries(this.placedMeeples).forEach(([key, meeple]) => {
            if (meeple.type !== 'Pig') return;
            const [x, y, pos] = key.split(',').map(Number);
            const zone = this.zoneMerger.findMergedZoneForPosition(x, y, pos);
            if (zone) pigZones.set(zone.id, meeple.playerId);
        });
        return pigZones;
    }

    // ─────────────────────────────────────────────────────────────
    // Détection tour bonus bâtisseur
    // ─────────────────────────────────────────────────────────────

    _checkBonusTrigger(data) {
        if (data.fromUndo) return; // skipSync ne doit PAS bloquer — c'est juste un flag réseau
        this._lastPlacedTile = { x: data.x, y: data.y };
    }

    checkBonusTrigger(playerId) {
        console.log('🔍 [BuilderRules] checkBonusTrigger — playerId:', playerId, '— _lastPlacedTile:', this._lastPlacedTile);

        if (!this._lastPlacedTile) return false;
        const { x, y } = this._lastPlacedTile;

        const allBuilders = Object.entries(this.placedMeeples)
            .filter(([, m]) => m.type === 'Builder')
            .map(([k, m]) => `${k}(${m.playerId})`);
        console.log('🔍 [BuilderRules] Bâtisseurs en jeu:', allBuilders);

        const builderEntry = Object.entries(this.placedMeeples).find(([, m]) =>
            m.type === 'Builder' && m.playerId === playerId
        );
        if (!builderEntry) {
            console.log('⭐ [BuilderRules] Pas de bonus : aucun bâtisseur pour', playerId);
            return false;
        }

        const [builderKey] = builderEntry;
        const [bx, by, bpos] = builderKey.split(',').map(Number);

        if (bx === x && by === y) {
            console.log('⭐ [BuilderRules] Pas de bonus : bâtisseur posé ce tour');
            return false;
        }

        const builderZone = this.zoneMerger.findMergedZoneForPosition(bx, by, bpos);
        if (!builderZone) return false;

        const tileInZone = builderZone.tiles.some(t => t.x === x && t.y === y);
        if (tileInZone) console.log('⭐ [BuilderRules] Tour bonus confirmé pour', playerId);
        return tileInZone;
    }

    resetLastPlacedTile() {
        console.log('🔄 [BuilderRules] resetLastPlacedTile');
        this._lastPlacedTile = null;
    }

    // ─────────────────────────────────────────────────────────────
    // Retour du bâtisseur quand sa zone est scorée
    // ─────────────────────────────────────────────────────────────

    _onZoneCompleted(data) {
        const { meeples } = data;
        if (!meeples) return;

        meeples.forEach(m => {
            if (m.type === 'Builder') {
                const player = this.gameState.players.find(p => p.id === m.playerId);
                if (player) {
                    player.hasBuilder = true;
                    this.eventBus.emit('meeple-count-updated', { playerId: m.playerId });
                    console.log(`🔨 Bâtisseur retourné à ${player.name}`);
                }
            }
            // Note : le cochon ne revient pas en cours de partie (reste sur le plateau)
        });
    }

    // ─────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────


}
