/**
 * MeepleConfig - Dimensions naturelles et scales par contexte d'affichage
 *
 * Contextes :
 *   plate       — sur le plateau de jeu
 *   panel       — player-info desktop
 *   panelMobile — player-info mobile
 *   selector    — sélecteur de meeple
 *
 * Pour ajouter un nouveau type : renseigner w, h et les 4 scales.
 */
export const MEEPLE_CONFIG = {
    'Normal': {
        w: 69, h: 70,
        plate:       0.87,
        panel:       0.35,
        panelMobile: 0.28,
        selector:    0.44,
    },
    'Farmer': {
        w: 70, h: 69,
        plate:       0.87,
        panel:       0.35,
        panelMobile: 0.28,
        selector:    0.44,
    },
    'Large': {
        w: 79, h: 80,
        plate:       0.87,
        panel:       0.35,
        panelMobile: 0.28,
        selector:    0.44,
    },
    'Large-Farmer': {
        w: 80, h: 79,
        plate:       0.87,
        panel:       0.35,
        panelMobile: 0.28,
        selector:    0.44,
    },
    'Abbot': {
        w: 62, h: 80,
        plate:       0.87,
        panel:       0.35,
        panelMobile: 0.28,
        selector:    0.44,
    },
    'Builder': {
        w: 60, h: 80,
        plate:       0.87,
        panel:       0.35,
        panelMobile: 0.28,
        selector:    0.44,
    },
};

/**
 * Retourne les dimensions CSS pour un type et un contexte donnés.
 * @param {string} type    - Type de meeple (ex: 'Normal', 'Large')
 * @param {string} context - Contexte ('plate' | 'panel' | 'panelMobile' | 'selector')
 * @returns {{ width: string, height: string }}
 */
export function getMeepleSize(type, context) {
    const cfg = MEEPLE_CONFIG[type];
    if (!cfg) {
        console.warn(`getMeepleSize: type inconnu "${type}"`);
        return { width: '30px', height: '30px' };
    }
    const scale = cfg[context];
    if (scale === undefined) {
        console.warn(`getMeepleSize: contexte inconnu "${context}" pour "${type}"`);
        return { width: '30px', height: '30px' };
    }
    return {
        width:  `${Math.round(cfg.w * scale)}px`,
        height: `${Math.round(cfg.h * scale)}px`,
    };
}
