/**
 * EventBus - Système de pub/sub pour communication entre modules
 * Pattern : Observer
 * Usage : Tous les modules communiquent via EventBus au lieu de s'appeler directement
 */
export class EventBus {
    constructor() {
        this.events = {};
        this.debug = false; // Activer pour voir tous les événements
    }

    /**
     * S'abonner à un événement
     * @param {string} event - Nom de l'événement
     * @param {Function} callback - Fonction appelée quand l'événement est émis
     */
    on(event, callback) {
        if (!this.events[event]) {
            this.events[event] = [];
        }
        this.events[event].push(callback);
        
        if (this.debug) {
            console.log(`📡 EventBus: Listener ajouté pour "${event}"`);
        }
    }

    /**
     * Se désabonner d'un événement
     * @param {string} event - Nom de l'événement
     * @param {Function} callback - Fonction à retirer
     */
    off(event, callback) {
        if (!this.events[event]) return;
        
        this.events[event] = this.events[event].filter(cb => cb !== callback);
        
        if (this.debug) {
            console.log(`📡 EventBus: Listener retiré pour "${event}"`);
        }
    }

    /**
     * Émettre un événement
     * @param {string} event - Nom de l'événement
     * @param {*} data - Données à passer aux listeners
     */
    emit(event, data) {
        if (!this.events[event] || this.events[event].length === 0) {
            if (this.debug) {
                console.log(`📡 EventBus: Aucun listener pour "${event}"`);
            }
            return;
        }

        if (this.debug) {
            console.log(`📡 EventBus: Émission "${event}"`, data);
        }

        this.events[event].forEach(callback => {
            try {
                callback(data);
            } catch (error) {
                console.error(`❌ EventBus: Erreur dans listener "${event}":`, error);
            }
        });
    }

    /**
     * S'abonner à un événement une seule fois
     * @param {string} event - Nom de l'événement
     * @param {Function} callback - Fonction appelée une fois
     */
    once(event, callback) {
        const onceCallback = (data) => {
            callback(data);
            this.off(event, onceCallback);
        };
        this.on(event, onceCallback);
    }

    /**
     * Retirer tous les listeners d'un événement
     * @param {string} event - Nom de l'événement
     */
    clear(event) {
        if (event) {
            delete this.events[event];
            if (this.debug) {
                console.log(`📡 EventBus: Tous les listeners retirés pour "${event}"`);
            }
        } else {
            this.events = {};
            if (this.debug) {
                console.log(`📡 EventBus: Tous les événements nettoyés`);
            }
        }
    }

    /**
     * Obtenir la liste des événements enregistrés (debug)
     */
    getEvents() {
        return Object.keys(this.events).map(event => ({
            event,
            listeners: this.events[event].length
        }));
    }

    /**
     * Activer/désactiver le mode debug
     */
    setDebug(enabled) {
        this.debug = enabled;
        console.log(`📡 EventBus: Debug ${enabled ? 'activé' : 'désactivé'}`);
    }
}
