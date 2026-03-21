/**
 * GameMenuUI — Configure la visibilité des boutons du menu en cours de partie.
 * Appelé une fois au démarrage (initGameMenu), puis à chaque fois que
 * la visibilité doit être recalculée (ex: retour lobby → repart à zéro).
 */

/**
 * Initialise l'affichage du menu de jeu.
 * @param {{ getGameConfig, getIsHost, getGameCode, getIsSpectator }} deps
 */
export function initGameMenu({ getGameConfig, getIsHost, getGameCode, getIsSpectator }) {
    const gameConfig = getGameConfig();
    const isHost     = getIsHost();
    const gameCode   = getGameCode();

    // Bouton debug
    const testBtn = document.getElementById('test-modal-btn');
    if (testBtn) testBtn.style.display = gameConfig.enableDebug ? 'block' : 'none';

    // Retour lobby : hôte uniquement
    const backBtn  = document.getElementById('back-to-lobby-btn');
    const lobbySep = document.querySelector('.menu-lobby-separator');
    if (backBtn)  backBtn.style.display  = isHost ? 'block' : 'none';
    if (lobbySep) lobbySep.style.display = isHost ? 'block' : 'none';

    // Quitter : invités uniquement
    const leaveBtn = document.getElementById('menu-leave-btn');
    const leaveSep = document.querySelector('.menu-leave-separator');
    if (leaveBtn) leaveBtn.style.display = !isHost ? 'block' : 'none';
    if (leaveSep) leaveSep.style.display = !isHost ? 'block' : 'none';

    // Tuiles restantes
    const remBtn = document.getElementById('menu-remaining-btn');
    if (remBtn) remBtn.style.display = gameConfig.showRemainingTiles ? 'block' : 'none';

    // Code de partie
    const codeDisplay = document.getElementById('menu-code-display');
    if (codeDisplay) codeDisplay.textContent = `Code : ${gameCode || '—'}`;

    // Spectateur : masquer les contrôles d'action
    if (getIsSpectator()) {
        ['end-turn-btn', 'undo-btn', 'mobile-end-turn-btn', 'mobile-undo-btn'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
        const tileTitle = document.querySelector('#current-tile-container h3');
        if (tileTitle) tileTitle.style.display = 'none';
    }
}
