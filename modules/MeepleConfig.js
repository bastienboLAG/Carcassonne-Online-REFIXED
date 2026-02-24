/**
 * MeepleConfig - Dimensions naturelles et facteur de réduction par type de meeple
 * 
 * scale : facteur appliqué aux dimensions naturelles pour l'affichage sur le plateau
 * Pour le sélecteur et le panel, un facteur supplémentaire est appliqué dans chaque module.
 * 
 * Pour ajouter un nouveau type : { w: largeur_naturelle, h: hauteur_naturelle, scale: 0.87 }
 */
export const MEEPLE_CONFIG = {
    'Normal':       { w: 69, h: 70, scale: 0.87 },
    'Farmer':       { w: 70, h: 69, scale: 0.87 },
    'Large':        { w: 79, h: 80, scale: 0.87 },
    'Large-Farmer': { w: 80, h: 79, scale: 0.87 },
    'Abbot':        { w: 62, h: 80, scale: 0.87 },
};

/**
 * Retourne les dimensions CSS à appliquer pour un type de meeple
 * @param {string} type - Type de meeple
 * @param {number} extraScale - Facteur supplémentaire (ex: 0.5 pour le sélecteur)
 * @returns {{ width: string, height: string }}
 */
export function getMeepleSize(type, extraScale = 1) {
    const cfg = MEEPLE_CONFIG[type] ?? MEEPLE_CONFIG['Normal'];
    return {
        width:  `${Math.round(cfg.w * cfg.scale * extraScale)}px`,
        height: `${Math.round(cfg.h * cfg.scale * extraScale)}px`,
    };
}
