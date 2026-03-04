/**
 * MeepleUtils — utilitaires génériques sur les meeples
 * Indépendant de toute règle ou module de scoring.
 */

export class MeepleUtils {

    /**
     * Poids d'un meeple pour le calcul de majorité dans une zone.
     *  - Grand Meeple (Large / Large-Farmer) : 2
     *  - Bâtisseur / Cochon : 0 (ne comptent pas pour la majorité)
     *  - Meeple normal / Abbé : 1
     *
     * @param {Object} meeple  — objet { type, playerId, ... }
     * @returns {number}
     */
    static getMeepleWeight(meeple) {
        if (meeple.type === 'Builder' || meeple.type === 'Pig') return 0;
        return (meeple.type === 'Large' || meeple.type === 'Large-Farmer') ? 2 : 1;
    }
}
