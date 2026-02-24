/**
 * InnsRules - Règles de l'extension Auberges & Cathédrales
 *
 * Gère :
 * - Validation du placement du grand meeple (Large / Large-Farmer)
 * - Modificateurs de scoring : cathédrale (x3 si fermée, x0 si ouverte)
 *   et auberge (x2 si fermée, x0 si ouverte)
 * - Grand meeple compte comme 2 pour la majorité
 */
export class InnsRules {
    constructor(eventBus, config = {}) {
        this.eventBus = eventBus;
        this.config   = config;
        this.enabled  = false;

        // Bindings pour pouvoir se désabonner
        this._onMeeplePlacementCheck = this.validateMeeplePlacement.bind(this);
        this._onZoneCompleted        = this.onZoneCompleted.bind(this);
    }

    register() {
        if (this.enabled) {
            console.warn('⚠️ InnsRules déjà activées');
            return;
        }
        this.enabled = true;
        console.log('✅ InnsRules activées');

        this.eventBus.on('meeple-placement-check', this._onMeeplePlacementCheck);
        this.eventBus.on('zone-completed',         this._onZoneCompleted);
    }

    unregister() {
        if (!this.enabled) return;
        this.enabled = false;
        console.log('🔴 InnsRules désactivées');

        this.eventBus.off('meeple-placement-check', this._onMeeplePlacementCheck);
        this.eventBus.off('zone-completed',         this._onZoneCompleted);
    }

    /**
     * Validation placement meeple :
     * - Large/Large-Farmer interdit si largeMeeple désactivé
     * - Large-Farmer uniquement sur field
     * - Large uniquement sur city, road, abbey
     */
    validateMeeplePlacement(data) {
        const { zoneType, meepleType, result } = data;
        if (meepleType !== 'Large' && meepleType !== 'Large-Farmer') return;

        if (!this.config?.extensions?.largeMeeple) {
            console.log('🚫 InnsRules: grand meeple désactivé');
            if (result) result.valid = false;
            return;
        }

        if (meepleType === 'Large-Farmer' && zoneType !== 'field') {
            console.log('🚫 InnsRules: Large-Farmer interdit hors field');
            if (result) result.valid = false;
        }

        if (meepleType === 'Large' && zoneType === 'field') {
            console.log('🚫 InnsRules: Large interdit sur field (utiliser Large-Farmer)');
            if (result) result.valid = false;
        }

        if (meepleType === 'Large' && (zoneType === 'garden')) {
            console.log('🚫 InnsRules: Large interdit sur garden');
            if (result) result.valid = false;
        }
    }

    /**
     * Zone complétée — placeholder pour extensions futures
     */
    onZoneCompleted(data) {
        // Le scoring cathedral/inn est géré dans Scoring.js via les flags
        // hasCathedral et hasInn posés par ZoneMerger
    }

    /**
     * Calculer le poids d'un meeple pour la majorité
     * Grand meeple → 2, Normal/Farmer → 1
     * @param {Object} meeple
     * @returns {number}
     */
    static getMeepleWeight(meeple) {
        return (meeple.type === 'Large' || meeple.type === 'Large-Farmer') ? 2 : 1;
    }

    /**
     * Modificateur de score ville fermée
     * Cathedral → 3 pts/tuile+blason, sinon 2
     * @param {Object} mergedZone
     * @param {Object} config
     * @returns {number} coefficient
     */
    static getCityCoefficient(mergedZone, config) {
        if (config?.extensions?.cathedrals && mergedZone.hasCathedral) return 3;
        return 2;
    }

    /**
     * Modificateur de score route fermée
     * Inn → 2 pts/tuile, sinon 1
     * @param {Object} mergedZone
     * @param {Object} config
     * @returns {number} coefficient
     */
    static getRoadCoefficient(mergedZone, config) {
        if (config?.extensions?.inns && mergedZone.hasInn) return 2;
        return 1;
    }

    /**
     * Ville non fermée avec cathédrale → 0 pts
     */
    static cityOpenPenalty(mergedZone, config) {
        return config?.extensions?.cathedrals && mergedZone.hasCathedral;
    }

    /**
     * Route non fermée avec auberge → 0 pts
     */
    static roadOpenPenalty(mergedZone, config) {
        return config?.extensions?.inns && mergedZone.hasInn;
    }
}
