/**
 * BuilderRules - Règles de l'extension Marchands & Bâtisseurs (bâtisseur uniquement)
 *
 * Gère :
 * - Validation du placement du bâtisseur (city ou road, zone avec meeple du joueur)
 * - Détection du tour bonus (tuile posée étend la zone du bâtisseur)
 * - Retour du bâtisseur quand sa zone est scorée
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

        // Flag : une tuile posée ce tour a étendu la zone d'un bâtisseur
        this._bonusPending = false;
        // Tuile posée ce tour (pour la vérification)
        this._lastPlacedTile = null;

        this._onTilePlaced           = this._checkBonusTrigger.bind(this);
        this._onMeeplePlacementCheck = this.validateMeeplePlacement.bind(this);
        this._onZoneCompleted        = this._onZoneCompleted.bind(this);
    }

    register() {
        if (this.enabled) return;
        this.enabled = true;
        this.eventBus.on('tile-placed',             this._onTilePlaced);
        this.eventBus.on('meeple-placement-check',  this._onMeeplePlacementCheck);
        this.eventBus.on('zone-completed',          this._onZoneCompleted);
        console.log('✅ BuilderRules activées');
    }

    unregister() {
        if (!this.enabled) return;
        this.enabled = false;
        this.eventBus.off('tile-placed',            this._onTilePlaced);
        this.eventBus.off('meeple-placement-check', this._onMeeplePlacementCheck);
        this.eventBus.off('zone-completed',         this._onZoneCompleted);
        console.log('🔴 BuilderRules désactivées');
    }

    setPlacedMeeples(ref) {
        this.placedMeeples = ref;
    }

    // ─────────────────────────────────────────────────────────────
    // Validation placement
    // ─────────────────────────────────────────────────────────────

    /**
     * Le bâtisseur est placeable sur city ou road,
     * uniquement si le joueur a déjà un meeple (Normal ou Large) dans cette zone.
     * Il ne peut pas y avoir deux bâtisseurs dans la même zone.
     */
    validateMeeplePlacement(data) {
        if (data.meepleType !== 'Builder') return;

        const { x, y, position, playerId, result } = data;
        const player = this.gameState.players.find(p => p.id === playerId);

        // Bâtisseur disponible ?
        if (!player?.hasBuilder) {
            result.allowed = false;
            result.reason  = 'builder_not_available';
            return;
        }

        // Zone doit être city ou road
        const mergedZone = this.zoneMerger.findMergedZoneForPosition(x, y, position);
        if (!mergedZone || (mergedZone.type !== 'city' && mergedZone.type !== 'road')) {
            result.allowed = false;
            result.reason  = 'builder_wrong_zone_type';
            return;
        }

        // Le joueur doit avoir un meeple normal/grand dans cette zone
        const zoneMeeples = this.zoneMerger.getZoneMeeples(mergedZone, this.placedMeeples);
        const hasOwnMeeple = zoneMeeples.some(m =>
            m.playerId === playerId &&
            m.type !== 'Builder' &&
            m.type !== 'Farmer' &&
            m.type !== 'Large-Farmer'
        );

        if (!hasOwnMeeple) {
            result.allowed = false;
            result.reason  = 'builder_no_own_meeple_in_zone';
            return;
        }

        // Plusieurs bâtisseurs peuvent coexister dans la même zone
    }

    // ─────────────────────────────────────────────────────────────
    // Détection tour bonus
    // ─────────────────────────────────────────────────────────────

    /**
     * Appelé après chaque tile-placed.
     * Stocke la position de la tuile posée pour le check synchrone dans checkBonusTrigger().
     * N'utilise PAS de flag _bonusPending pour éviter les désynchronisations réseau.
     */
    _checkBonusTrigger(data) {
        if (data.skipSync || data.fromUndo) return;
        this._lastPlacedTile = { x: data.x, y: data.y };
    }

    /**
     * Vérifie en temps réel si la dernière tuile posée étend la zone du bâtisseur du joueur.
     * Appelé depuis home.js AVANT le scoring (builders toujours présents dans placedMeeples).
     * @param {string} playerId - Joueur dont on vérifie le bâtisseur
     * @returns {boolean}
     */
    checkBonusTrigger(playerId) {
        console.log('🔍 [BuilderRules] checkBonusTrigger — playerId:', playerId, '— _lastPlacedTile:', this._lastPlacedTile);

        if (!this._lastPlacedTile) {
            console.log('⭐ [BuilderRules] Pas de bonus : _lastPlacedTile est null');
            return false;
        }

        const { x, y } = this._lastPlacedTile;

        // Chercher le bâtisseur du joueur dans placedMeeples
        const allBuilders = Object.entries(this.placedMeeples)
            .filter(([, m]) => m.type === 'Builder')
            .map(([k, m]) => `${k}(${m.playerId})`);
        console.log('🔍 [BuilderRules] Tous les bâtisseurs en jeu:', allBuilders);

        const builderEntry = Object.entries(this.placedMeeples).find(([, m]) =>
            m.type === 'Builder' && m.playerId === playerId
        );
        if (!builderEntry) {
            console.log('⭐ [BuilderRules] Pas de bonus : aucun bâtisseur trouvé pour', playerId);
            return false;
        }

        const [builderKey] = builderEntry;
        const [bx, by, bpos] = builderKey.split(',').map(Number);
        console.log('🔍 [BuilderRules] Bâtisseur trouvé en', bx, by, bpos, '— tuile posée:', x, y);

        // Si le bâtisseur est sur la tuile posée CE TOUR, il vient d'être placé → pas de bonus
        if (bx === x && by === y) {
            console.log('⭐ [BuilderRules] Pas de bonus : bâtisseur posé sur la tuile de ce tour');
            return false;
        }

        // Zone du bâtisseur
        const builderZone = this.zoneMerger.findMergedZoneForPosition(bx, by, bpos);
        console.log('🔍 [BuilderRules] Zone du bâtisseur:', builderZone?.id, '—', builderZone?.tiles?.length, 'tuiles');
        if (!builderZone) {
            console.log('⭐ [BuilderRules] Pas de bonus : zone du bâtisseur introuvable');
            return false;
        }

        // La tuile posée est-elle dans cette zone ?
        const tileInZone = builderZone.tiles.some(t => t.x === x && t.y === y);
        console.log('🔍 [BuilderRules] Tuile', x, y, 'dans la zone ?', tileInZone,
            '— tuiles de la zone:', builderZone.tiles.map(t => `(${t.x},${t.y})`).join(' '));

        if (tileInZone) console.log('⭐ [BuilderRules] Tour bonus confirmé pour', playerId);
        return tileInZone;
    }

    /**
     * Réinitialise l'état en début de tour.
     * Appelé depuis tile-drawn (tour local) et après démarrage du tour bonus.
     */
    resetLastPlacedTile() {
        console.log('🔄 [BuilderRules] resetLastPlacedTile');
        this._lastPlacedTile = null;
    }

    // ─────────────────────────────────────────────────────────────
    // Retour du bâtisseur quand la zone est scorée
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
        });
    }

    // ─────────────────────────────────────────────────────────────
    // Helpers statiques
    // ─────────────────────────────────────────────────────────────

    /**
     * Le bâtisseur compte comme poids 0 pour la majorité — il ne sert qu'au tour bonus
     */
    static getMeepleWeight(meeple) {
        return 0;
    }
}
