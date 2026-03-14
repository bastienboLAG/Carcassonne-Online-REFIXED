/**
 * DragonConfig — Configuration de l'extension Princesse & Dragon
 *
 * DRAGON_EDIBLE_MEEPLES   : types de meeples que le dragon peut manger
 * FAIRY_ATTACHABLE_MEEPLES : types de meeples sur lesquels la fée peut s'attacher
 */

export const DRAGON_EDIBLE_MEEPLES = new Set([
    'Normal',
    'Farmer',
    'Large',
    'Large-Farmer',
    'Abbot',
    'Builder',
    'Pig',
]);

export const FAIRY_ATTACHABLE_MEEPLES = new Set([
    'Normal',
    'Farmer',
    'Large',
    'Large-Farmer',
    'Abbot',
    'Builder',
    'Pig',
]);

/**
 * Indique si un type de meeple peut être mangé par le dragon.
 * @param {string} type
 * @returns {boolean}
 */
export function isDragonEdible(type) {
    return DRAGON_EDIBLE_MEEPLES.has(type);
}

/**
 * Indique si la fée peut s'attacher à un type de meeple.
 * @param {string} type
 * @returns {boolean}
 */
export function isFairyAttachable(type) {
    return FAIRY_ATTACHABLE_MEEPLES.has(type);
}
