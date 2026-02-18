/**
 * BaseRules - Règles de base de Carcassonne
 * Toujours actif, gère les mécaniques fondamentales du jeu
 */
export class BaseRules {
    constructor(eventBus, config = {}) {
        this.eventBus = eventBus;
        this.config = config;
        this.enabled = false;
    }

    /**
     * Activer les règles de base
     */
    register() {
        if (this.enabled) {
            console.warn('⚠️ BaseRules déjà activées');
            return;
        }

        this.enabled = true;
        console.log('✅ BaseRules activées');

        // Écouter les événements du jeu
        this.eventBus.on('tile-placement-check', this.validateTilePlacement.bind(this));
        this.eventBus.on('meeple-placement-check', this.validateMeeplePlacement.bind(this));
        this.eventBus.on('zone-completed', this.onZoneCompleted.bind(this));
    }

    /**
     * Désactiver les règles de base (normalement jamais appelé)
     */
    unregister() {
        if (!this.enabled) return;

        this.enabled = false;
        console.log('🔴 BaseRules désactivées');

        // Se désabonner des événements
        this.eventBus.off('tile-placement-check', this.validateTilePlacement);
        this.eventBus.off('meeple-placement-check', this.validateMeeplePlacement);
        this.eventBus.off('zone-completed', this.onZoneCompleted);
    }

    /**
     * Valider le placement d'une tuile
     * Les règles de base vérifient que les bords correspondent
     */
    validateTilePlacement(data) {
        // Cette logique est déjà dans Board.canPlaceTile()
        // Pour l'instant on ne fait rien ici, c'est un placeholder
        // pour quand on refactorisera la validation
        console.log('🔍 BaseRules: validation placement tuile', data);
    }

    /**
     * Valider le placement d'un meeple
     * Les règles de base vérifient qu'il n'y a pas déjà un meeple dans la zone
     */
    validateMeeplePlacement(data) {
        // Cette logique est déjà dans MeepleCursorsUI
        // Pour l'instant on ne fait rien ici, c'est un placeholder
        console.log('🔍 BaseRules: validation placement meeple', data);
    }

    /**
     * Quand une zone est complétée
     */
    onZoneCompleted(data) {
        console.log('✅ BaseRules: zone complétée', data);
        // Le scoring est déjà géré par Scoring.js
        // On pourrait émettre des événements supplémentaires ici si nécessaire
    }
}
