/**
 * AbbeRules - Règles de l'extension L'Abbé
 *
 * Gère :
 * - Validation du placement de l'Abbé (abbey + garden uniquement)
 * - Validation du placement de meeples normaux sur garden (interdit)
 * - Scoring des zones garden (identique aux abbayes)
 * - Scoring de fin de partie pour les Abbés non rappelés
 */
export class AbbeRules {
    constructor(eventBus, config = {}) {
        this.eventBus = eventBus;
        this.config   = config;
        this.enabled  = false;

        // Bindings pour pouvoir se désabonner
        this._onMeeplePlacementCheck = this.validateMeeplePlacement.bind(this);
        this._onTilePlacementCheck   = this.validateTilePlacement.bind(this);
        this._onZoneCompleted        = this.onZoneCompleted.bind(this);
    }

    register() {
        if (this.enabled) {
            console.warn('⚠️ AbbeRules déjà activées');
            return;
        }
        this.enabled = true;
        console.log('✅ AbbeRules activées');

        this.eventBus.on('meeple-placement-check', this._onMeeplePlacementCheck);
        this.eventBus.on('tile-placement-check',   this._onTilePlacementCheck);
        this.eventBus.on('zone-completed',         this._onZoneCompleted);
    }

    unregister() {
        if (!this.enabled) return;
        this.enabled = false;
        console.log('🔴 AbbeRules désactivées');

        this.eventBus.off('meeple-placement-check', this._onMeeplePlacementCheck);
        this.eventBus.off('tile-placement-check',   this._onTilePlacementCheck);
        this.eventBus.off('zone-completed',         this._onZoneCompleted);
    }

    /**
     * Validation placement meeple :
     * - Meeple normal interdit sur garden
     * - Abbé autorisé sur garden et abbey uniquement
     * - Meeple normal autorisé sur abbey (règle existante inchangée)
     */
    validateMeeplePlacement(data) {
        const { zoneType, meepleType, result } = data;

        if (zoneType === 'garden') {
            if (meepleType !== 'abbot') {
                console.log('🚫 AbbeRules: meeple normal interdit sur garden');
                if (result) result.valid = false;
            }
        }

        if (meepleType === 'abbot') {
            if (zoneType !== 'garden' && zoneType !== 'abbey') {
                console.log('🚫 AbbeRules: Abbé interdit hors abbey/garden');
                if (result) result.valid = false;
            }
        }
    }

    /**
     * Validation placement tuile (placeholder)
     */
    validateTilePlacement(data) {
        // Pas de contrainte supplémentaire pour les tuiles Abbé
    }

    /**
     * Zone complétée : si c'est un garden, scorer comme une abbaye
     */
    onZoneCompleted(data) {
        if (data?.zone?.type === 'garden') {
            console.log('✅ AbbeRules: jardin complété — scorer comme abbaye');
            // Le scoring est déjà délégué à Scoring.js via scoreClosedZones
            // On s'assure juste que garden est bien reconnu
        }
    }
}
