import { Multiplayer }            from './modules/Multiplayer.js';
import { Tile }                   from './modules/Tile.js';
import { Board }                  from './modules/Board.js';
import { Deck }                   from './modules/Deck.js';
import { GameState }              from './modules/GameState.js';
import { GameSync }               from './modules/GameSync.js';
import { ZoneMerger }             from './modules/ZoneMerger.js';
import { Scoring }                from './modules/Scoring.js';

import { EventBus }               from './modules/core/EventBus.js';
import { RuleRegistry }           from './modules/core/RuleRegistry.js';
import { BaseRules }              from './modules/rules/BaseRules.js';
import { AbbeRules }              from './modules/rules/AbbeRules.js';
import { InnsRules }              from './modules/rules/InnsRules.js';
import { BuilderRules }          from './modules/rules/BuilderRules.js';
import { ZoomManager }           from './modules/game/ZoomManager.js';
import { NavigationManager }      from './modules/game/NavigationManager.js';
import { ReconnectionManager }    from './modules/game/ReconnectionManager.js';
import { startGameTimer, startGameTimerFrom, stopGameTimer, getElapsedSeconds } from './modules/game/GameTimer.js';
import {
    initDragonUI,
    tileHasDragonZone, tileHasVolcanoZone, tileHasPortalZone,
    broadcastDragonState,
    updateDragonOverlay, clearDragonCursors, showDragonMoveCursors,
    startDragonTurnUI, onDragonMoveConfirm, executeDragonMoveHost,
    onDragonPhaseEnded, advanceDragonTurnHost,
    renderDragonPiece, renderFairyPiece, removeFairyPiece, releaseFairyIfDetached,
} from './modules/game/DragonUI.js';
import {
    initTurnUI,
    updateTurnDisplay, updateMobileButtons, updateMobileTilePreview,
    afficherMessage, afficherToast, hideToast,
} from './modules/ui/TurnUI.js';
import {
    initMeepleActionsUI, initNetworkMeepleListeners,
    handleAbbeRecall, countAbbePoints,
    clearFairyCursors, hideAllCursors, showFairyTargets,
    handleFairyPlacement, showMeepleActionCursors,
    handlePortalActivate, placeMeepleViaPortal,
    handlePrincessEject,
    afficherSelecteurMeeple, placerMeeple,
} from './modules/ui/MeepleActionsUI.js';
import {
    initLobbyOptions,
    applyPreset,
    saveLobbyOptions,
    syncAllOptions,
    updateOptionsAccess,
    updateColorPickerVisibility,
    updateLobbyUI as _updateLobbyUI,
    loadPresets,
    updateAllAvailability,
    updateMasterCheckboxes,
} from './modules/LobbyOptions.js';
import { TurnManager }            from './modules/game/TurnManager.js';
import { UndoManager }            from './modules/game/UndoManager.js';
import { TilePlacement }          from './modules/game/TilePlacement.js';
import { MeeplePlacement }        from './modules/game/MeeplePlacement.js';
import { GameSyncCallbacks }      from './modules/game/GameSyncCallbacks.js';
import { GameStarter }            from './modules/game/GameStarter.js';
import { initGameMenu }           from './modules/ui/GameMenuUI.js';
import { UnplaceableTileManager } from './modules/game/UnplaceableTileManager.js';
import { HeartbeatManager }       from './modules/HeartbeatManager.js';
import { FinalScoresManager }     from './modules/game/FinalScoresManager.js';

import { ScorePanelUI }    from './modules/ScorePanelUI.js';
import { SlotsUI }         from './modules/SlotsUI.js';
import { TilePreviewUI }   from './modules/TilePreviewUI.js';
import { MeepleCursorsUI } from './modules/MeepleCursorsUI.js';
import { MeepleSelectorUI }from './modules/MeepleSelectorUI.js';
import { MeepleDisplayUI } from './modules/MeepleDisplayUI.js';
import { LobbyUI }         from './modules/ui/LobbyUI.js';
import { DragonRules }      from './modules/rules/DragonRules.js';
import { getMeepleSize }    from './modules/MeepleConfig.js';
import { ModalUI }         from './modules/ui/ModalUI.js';

// ═══════════════════════════════════════════════════════
// DÉTECTION MOBILE
// ═══════════════════════════════════════════════════════
const isMobile = () => window.matchMedia('(max-width: 768px)').matches;

// ═══════════════════════════════════════════════════════
// VARIABLES LOBBY
// ═══════════════════════════════════════════════════════
const multiplayer = new Multiplayer();
// Callbacks heartbeat assignés dès le départ — heartbeatManager peut être null avant le démarrage
multiplayer.onHeartbeatPing = () => heartbeatManager?.receivePing();
multiplayer.onHeartbeatPong = (peerId) => heartbeatManager?.receivePong(peerId);

/**
 * Démarrer (ou redémarrer) le heartbeat avec le bon handler selon le contexte
 * @param {Function} onTimeout - callback(peerId) en cas de timeout
 */
function _startHeartbeat(onTimeout) {
    if (!multiplayer?.peer) return;
    if (heartbeatManager) { heartbeatManager.stop(); heartbeatManager = null; }
    heartbeatManager = new HeartbeatManager({ multiplayer, onPeerTimeout: onTimeout });
    heartbeatManager.start();
}
const lobbyUI     = new LobbyUI(multiplayer);
const modalUI     = new ModalUI();
let gameCode      = null;
let playerName    = '';
let playerColor   = 'blue';
let players       = [];
let takenColors   = [];
let inLobby       = false;
let isHost        = false;
let eventListenersInstalled = false;

let gameConfig = {
    playFields:         true,
    showRemainingTiles: true,
    extensions: { base: true, abbot: false, largeMeeple: false, cathedrals: true, inns: true },
    tileGroups: { base: true, abbot: false, inns_cathedrals: false, dragon: false }
};

// ═══════════════════════════════════════════════════════
// VARIABLES JEU
// ═══════════════════════════════════════════════════════
const plateau = new Board();
const deck    = new Deck();
let gameState = null;

// ═══════════════════════════════════════════════════════
// EVENTBUS & RULE REGISTRY
// ═══════════════════════════════════════════════════════
const eventBus     = new EventBus();
const ruleRegistry = new RuleRegistry(eventBus);
eventBus.setDebug(true);

let turnManager    = null;
let undoManager    = null;
let meeplePlacement = null;
let tilePlacement  = null;
let gameSync       = null;
let zoneMerger     = null;
let scoring        = null;

let scorePanelUI    = null;
let slotsUI         = null;
let tilePreviewUI   = null;
let meepleCursorsUI = null;
let meepleSelectorUI = null;
let meepleDisplayUI = null;

let unplaceableManager = null;
let dragonRules = null;   // Extension Princesse & Dragon
let finalScoresManager = null;

// ── Reconnexion / Pause ──────────────────────────────────────────────────────
const PAUSE_TIMEOUT_MS = 60_000;  // 1 min (tests) → 3 min (prod)
let reconnectionManager = null;   // instancié dans _postStartSetup
const _voluntaryLeaves = new Set(); // peerIds ayant quitté volontairement (leave-game)

function _isSpectator() {
    if (!gameState || !multiplayer) return false;
    const me = gameState.players.find(p => p.id === multiplayer.playerId);
    return me?.color === 'spectator';
}

let originalLobbyHandler = null;

// ═══════════════════════════════════════════════════════
// ÉTAT DU JEU
// ═══════════════════════════════════════════════════════
let tuileEnMain    = null;
let currentTileForPlayer = null; // Tuile piochée pour le joueur courant (hôte ou invité)
let tuilePosee     = false;
let waitingToRedraw   = false;
let pendingAbbePoints = null; // { playerId, points } — points abbé à attribuer en fin de tour
let firstTilePlaced = false;
let isMyTurn       = false;
let lastPlacedTile = null;
let placedMeeples  = {};

let zoomLevel  = 1;
let navigationManager = null; // instance NavigationManager (zoom + drag)
let heartbeatManager = null;

const allColors   = ['black', 'red', 'pink', 'green', 'blue', 'yellow'];
const colorImages = {
    black:  './assets/Meeples/Black/Normal.png',
    red:    './assets/Meeples/Red/Normal.png',
    pink:   './assets/Meeples/Pink/Normal.png',
    green:  './assets/Meeples/Green/Normal.png',
    blue:   './assets/Meeples/Blue/Normal.png',
    yellow: './assets/Meeples/Yellow/Normal.png'
};

// ═══════════════════════════════════════════════════════
// EVENTBUS — abonnements globaux
// ═══════════════════════════════════════════════════════
eventBus.on('tile-drawn', (data) => {
    if (!data.tileData) return;

    tuileEnMain          = new Tile(data.tileData);
    tuileEnMain.rotation = data.tileData.rotation || 0;
    tuilePosee           = false;
    updateTurnDisplay(); // corriger l'état du bouton dès la réception de la tuile

    // Mettre à jour isRiverPhase : true si la tuile courante est une tuile river
    if (slotsUI) slotsUI.isRiverPhase = tuileEnMain.id.startsWith('river-');

    // Ne pas afficher la tuile dans le preview si :
    // - bug 1 : invité attend sa tuile de remplacement (waitingToRedraw) et ce tile-drawn n'est pas la sienne
    // - bug 2 : tile-drawn réseau d'un autre joueur alors que la tuile est déjà posée (déco passive)
    const _guestWaiting = waitingToRedraw && !isHost && !data.fromYourTurn;
    const _hostWaiting  = waitingToRedraw && isHost && !data.fromYourTurn;
    const _otherPlayerTile = data.fromNetwork && !data.fromYourTurn && !data.fromUndo
        && !isMyTurn && gameState?.currentTilePlaced && !_isSpectator();
    const _skipPreview = _guestWaiting || _hostWaiting || _otherPlayerTile;
    if (tilePreviewUI && !_skipPreview) tilePreviewUI.showTile(tuileEnMain);
    if (!_skipPreview) updateMobileTilePreview();

    // Invité : quand sa tuile de remplacement arrive (fromYourTurn), remettre waitingToRedraw à false
    if (waitingToRedraw && !isHost && data.fromYourTurn) {
        waitingToRedraw = false;
        updateTurnDisplay();
    }

    // Snapshot + reset builder : au début de notre propre tour (local ou via your-turn réseau)
    const isOwnTurnStart = !data.fromUndo && (!data.fromNetwork || data.fromYourTurn);
    // Nouveau tour — effacer les pending du tour précédent
    if (isOwnTurnStart && gameState) {
        gameState._pendingPrincessTile = null;
        gameState._pendingPortalTile = null;
    }
    // Invité : reset des flags de placement du tour précédent
    // (l'hôte le fait via undoManager.reset(), le guest doit le faire ici)
    if (isOwnTurnStart && !isHost && undoManager) {
        undoManager.meeplePlacedThisTurn = false;
        undoManager.tilePlacedThisTurn   = false;
        undoManager.abbeRecalledThisTurn = false;
        undoManager.lastMeeplePlaced     = null;
    }
    // L'hôte sauvegarde le snapshot début de tour pour tout le monde (undo centralisé)
    // isOwnTurnStart = notre propre tour ; fromNetwork sans fromYourTurn = tour d'un invité reçu par l'hôte
    const isNewTurnSnapshot = isHost && !data.fromUndo &&
        (isOwnTurnStart || (data.fromNetwork && !data.fromYourTurn));
    if (undoManager && isNewTurnSnapshot) {
        undoManager.setLastPlacedTileBeforeTurn(lastPlacedTile);
        undoManager.saveTurnStart(placedMeeples);
    }
    if (isOwnTurnStart && gameConfig?.extensions?.tradersBuilders) {
        ruleRegistry.rules?.get('builders')?.resetLastPlacedTile?.();
    }

    // Fix 1 — Fée : +1 point au début du tour du propriétaire de la fée
    // Seul l'hôte applique et synchronise — l'invité reçoit via score-update
    // Pas appliqué lors d'un tour bonus (bâtisseur)
    const _isBonusTurnStart = turnManager?.isBonusTurn ?? false;
    if (isHost && isOwnTurnStart && !_isBonusTurnStart && gameConfig?.extensions?.fairyScoreTurn
        && gameState?.fairyState?.ownerId) {
        // Vérifier que c'est bien le tour du propriétaire de la fée
        const currentPlayer = gameState.getCurrentPlayer();
        if (currentPlayer?.id === gameState.fairyState.ownerId) {
            const fairyPlayer = gameState.players.find(p => p.id === gameState.fairyState.ownerId);
            if (fairyPlayer) {
                fairyPlayer.score += 1;
                fairyPlayer.scoreDetail = fairyPlayer.scoreDetail || {};
                fairyPlayer.scoreDetail.fairy = (fairyPlayer.scoreDetail.fairy || 0) + 1;
                console.log(`🧚 [Fée] +1 point début de tour pour ${fairyPlayer.name} (score: ${fairyPlayer.score})`);
                if (gameSync) gameSync.syncScoreUpdate(
                    [{ playerId: fairyPlayer.id, points: 1, zoneType: 'fairy-turn' }],
                    [], [], zoneMerger
                );
                eventBus.emit('score-updated');
            }
        }
    }


    if (isOwnTurnStart && isMyTurn && tilePlacement && unplaceableManager) {
        const isRiverPhase = tuileEnMain?.id?.startsWith('river-') ?? false;
        const placeable = unplaceableManager.isTilePlaceable(tuileEnMain, tilePlacement.plateau, isRiverPhase);
        if (!placeable) {
            const actionText = gameConfig?.unplaceableAction === 'reshuffle'
                ? 'remise dans la pioche'
                : 'détruite';
            unplaceableManager.showUnplaceableBadge(tuileEnMain, actionText);
        }
    }
});

eventBus.on('deck-updated', (data) => {
    const counter = document.getElementById('mobile-tile-counter');
    if (counter) counter.textContent = `${data.remaining} / ${data.total}`;
});

eventBus.on('turn-changed', (data) => {
    isMyTurn = data.isMyTurn && !_isSpectator();
    console.log('🔄 Sync isMyTurn global:', isMyTurn, '— isBonusTurn:', data.isBonusTurn ?? false);
    // Synchroniser isBonusTurn sur turnManager si transmis par receiveTurnEnded
    if (turnManager && data.isBonusTurn !== undefined) {
        turnManager.isBonusTurn = data.isBonusTurn;
    }
    updateTurnDisplay();
});

eventBus.on('turn-ended', (data) => {
    console.log('⏭️ Turn ended - recalcul isMyTurn pour tous');
    if (gameState && multiplayer) {
        const currentPlayer = gameState.getCurrentPlayer();
        const newIsMyTurn   = currentPlayer && currentPlayer.id === multiplayer.playerId;
        eventBus.emit('turn-changed', { isMyTurn: newIsMyTurn, currentPlayer });
    }
});

// ✅ Étape 3 : echo du placement meeple invité
eventBus.on('meeple-placed-own', (data) => {
    hideAllCursors();
    updateMobileButtons();
    updateTurnDisplay();
});

// ✅ Étape 2 : echo du placement invité — déclencher curseurs meeple
eventBus.on('tile-placed-own', (data) => {
    const { x, y, tile } = data;
    tuilePosee = true;
    lastPlacedTile = { x, y };
    gameState.currentTilePlaced = true;
    currentTileForPlayer = null;
    if (unplaceableManager) unplaceableManager.resetSeenImplacable();
    updateMobileButtons();
    updateTurnDisplay();
    const _isVolcanoTileOwn = !!(gameConfig?.tileGroups?.dragon && gameConfig?.extensions?.dragon && tileHasVolcanoZone(tile));

    // Détection princesse — ici le zoneRegistry est déjà désérialisé
    if (gameConfig?.tileGroups?.dragon && gameConfig?.extensions?.princess && dragonRules) {
        const _hasPrincess = tile.zones?.some(z => z.type === 'city' && z.features?.includes?.('princess'));
        if (_hasPrincess) {
            const targets = dragonRules.getPrincessTargets(x, y, tile, multiplayer.playerId, zoneMerger);
            console.log(`👸 [tile-placed-own] targets:`, targets);
            if (targets.length > 0) {
                gameState._pendingPrincessTile = { x, y, targets };
            }
        }
    }

    // Détection portail — ici le zoneRegistry est déjà désérialisé
    if (gameConfig?.tileGroups?.dragon && gameConfig?.extensions?.portal && dragonRules && tileHasPortalZone(tile)) {
        const portalZoneIdx = tile.zones?.findIndex(z => z.type === 'portal');
        if (portalZoneIdx !== -1) {
            const rawPos = tile.zones[portalZoneIdx].meeplePosition;
            if (rawPos != null) {
                const rotatedPos = zoneMerger ? zoneMerger._rotatePosition(rawPos, tile.rotation) : Number(rawPos);
                gameState._pendingPortalTile = { x, y, zoneIndex: portalZoneIdx, position: rotatedPos };
            }
        }
    }

    if (meepleCursorsUI && !undoManager?.abbeRecalledThisTurn) {
        if (!_isVolcanoTileOwn) {
            meepleCursorsUI.showCursors(x, y, gameState, placedMeeples, afficherSelecteurMeeple);
        }
        showMeepleActionCursors();
    }
});

eventBus.on('tile-rotated', (data) => {
    // ✅ Mettre à jour tuileEnMain.rotation pour que SlotsUI recalcule
    // avec la bonne rotation (important côté joueur inactif qui reçoit la rotation via réseau)
    if (tuileEnMain) {
        tuileEnMain.rotation = data.rotation;
    }
    updateMobileTilePreview();
});

eventBus.on('meeple-placed', (data) => {
    if (meepleDisplayUI) {
        meepleDisplayUI.showMeeple(data.x, data.y, data.position, data.meepleType, data.playerColor);
    }
    if (!data.skipSync && gameSync) {
        gameSync.syncMeeplePlacement(data.x, data.y, data.position, data.meepleType, data.playerColor);
    }
});

// Nettoyer pendingAbbePoints côté invité quand le tour change
// (les scores sont déjà dans gameStateData reçu via deserialize)
eventBus.on('turn-changed', () => {
    hideToast();
    if (!isMyTurn && pendingAbbePoints) {
        console.log('🧹 pendingAbbePoints nettoyé côté invité au changement de tour');
        pendingAbbePoints = null;
    }
});

eventBus.on('meeple-count-updated', (data) => {
    // ✅ Seul l'hôte broadcast son propre compte — l'invité le reçoit via meeple-count-update de l'hôte
    if (gameSync && isHost && data.playerId === multiplayer.playerId) {
        // Toujours lire depuis gameState pour éviter de broadcaster null
        const player = gameState?.players.find(p => p.id === data.playerId);
        gameSync.multiplayer.broadcast({
            type: 'meeple-count-update',
            playerId:       data.playerId,
            meeples:        player ? player.meeples        : data.meeples,
            hasAbbot:       player ? player.hasAbbot       : undefined,
            hasLargeMeeple: player ? player.hasLargeMeeple : undefined,
            hasBuilder:     player ? player.hasBuilder     : undefined,
            hasPig:         player ? player.hasPig         : undefined
        });
    }
    // Panel mobile mis à jour via ScorePanelUI
    if (scorePanelUI) scorePanelUI.updateMobile();
});

// ── Extension Dragon : affichage pion dragon ─────────────────────────
eventBus.on('dragon-moved', (data) => {
    renderDragonPiece(data.x, data.y);
});

eventBus.on('dragon-phase-ended', () => {
    renderDragonPiece(gameState?.dragonPos?.x, gameState?.dragonPos?.y);
});

// ── Extension Fée : affichage pion fée ───────────────────────────────
eventBus.on('fairy-placed', (data) => {
    renderFairyPiece(data.meepleKey);
});

eventBus.on('fairy-removed', () => {
    removeFairyPiece();
});

// ═══════════════════════════════════════════════════════
// LOBBY — helpers
// ═══════════════════════════════════════════════════════
document.getElementById('pseudo-input').addEventListener('input', (e) => {
    playerName = e.target.value.trim();
});

function getAvailableColor() {
    return allColors.find(c => !takenColors.includes(c)) || 'blue';
}

function updateAvailableColors() {
    document.querySelectorAll('.color-option').forEach(option => {
        const color = option.dataset.color;
        const input = option.querySelector('input');
        const taken = takenColors.includes(color) && color !== playerColor;
        option.classList.toggle('disabled', taken);
        input.disabled = taken;
    });
}

// Lobby options — géré par modules/LobbyOptions.js
// updateColorPickerVisibility, updateOptionsAccess, updateLobbyUI,
// applyPreset, saveLobbyOptions, syncAllOptions, loadPresets
// sont importées en haut du fichier.

function updateLobbyUI() {
    _updateLobbyUI(
        document.getElementById('create-game-btn'),
        document.getElementById('join-game-btn')
    );
}


// ✅ Bouton retour Android — interception pendant la partie
let _handlingPopstate = false;
window.addEventListener('popstate', (e) => {
    if (!gameState) return;
    if (_handlingPopstate) { _handlingPopstate = false; return; }
    _handlingPopstate = true;
    history.go(1);
    setTimeout(() => {
        const quitter = confirm('Voulez-vous vraiment quitter la partie ?');
        if (quitter) {
            location.reload();
        }
    }, 50);
});

// Sélection de couleur
const colorOptions = document.querySelectorAll('.color-option');
colorOptions.forEach(option => {
    option.addEventListener('click', () => {
        if (option.classList.contains('disabled')) return;
        colorOptions.forEach(opt => opt.classList.remove('selected'));
        option.classList.add('selected');
        const input = option.querySelector('input');
        input.checked = true;
        playerColor = input.value;

        if (multiplayer.peer?.open) {
            const me = players.find(p => p.id === multiplayer.playerId);
            if (me) { me.color = playerColor; lobbyUI.updatePlayersList(); }
            multiplayer.broadcast({ type: 'color-change', playerId: multiplayer.playerId, color: playerColor });
        }
    });
});

// ═══════════════════════════════════════════════════════
// LOBBY — créer une partie
// ═══════════════════════════════════════════════════════
document.getElementById('create-game-btn').addEventListener('click', async () => {
    if (!playerName) { alert('Veuillez entrer un pseudo !'); return; }

    try {
        gameCode = await multiplayer.createGame();
        inLobby  = true;
        isHost   = true;
        updateLobbyUI();

        document.getElementById('game-code-container').style.display = 'block';
        document.getElementById('game-code-text').textContent = `Code: ${gameCode}`;

        players.push({ id: multiplayer.playerId, name: playerName, color: playerColor, isHost: true });
        lobbyUI.setIsHost(true);
        lobbyUI.setPlayers(players);

        // Sync temps réel de toutes les options vers les invités
        ['base-fields', 'list-remaining', 'use-test-deck', 'enable-debug', 'ext-abbot', 'tiles-abbot', 'ext-large-meeple', 'ext-cathedrals', 'ext-inns', 'tiles-inns-cathedrals', 'tiles-traders-builders', 'ext-builder', 'ext-merchants', 'ext-pig', 'tiles-dragon', 'ext-dragon', 'ext-princess', 'ext-portal', 'ext-fairy-protection', 'ext-fairy-score-turn', 'ext-fairy-score-zone'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('change', (e) => {
                multiplayer.broadcast({ type: 'option-change', option: id, value: e.target.checked });
            });
        });
        // Sync des radios (unplaceable + start)
        document.querySelectorAll('input[name="unplaceable"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                if (e.target.checked) multiplayer.broadcast({ type: 'option-change', option: 'unplaceable', value: e.target.value });
            });
        });
        document.querySelectorAll('input[name="start"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                if (e.target.checked) multiplayer.broadcast({ type: 'option-change', option: 'start', value: e.target.value });
            });
        });

        const _lobbyHeartbeatTimeout = (peerId) => {
            players = players.filter(p => p.id !== peerId);
            lobbyUI.setPlayers(players);
            multiplayer.broadcast({ type: 'players-update', players });
            console.warn(`💔 Joueur ${peerId} retiré du lobby (timeout heartbeat)`);
        };

        multiplayer.onPlayerJoined = (playerId) => {
            console.log('👤 Nouveau joueur connecté:', playerId);
            if (heartbeatManager) {
                // Heartbeat déjà actif : juste enregistrer le nouveau peer
                heartbeatManager._lastPong[playerId] = Date.now();
            } else {
                // Premier joueur : démarrer le heartbeat
                _startHeartbeat(_lobbyHeartbeatTimeout);
            }
        };

        // ✅ Retrait immédiat si un invité déconnecte dans le lobby
        multiplayer.onPlayerLeft = (peerId) => {
            console.log('👋 [LOBBY] Joueur déconnecté:', peerId);
            players = players.filter(p => p.id !== peerId);
            lobbyUI.setPlayers(players);
            multiplayer.broadcast({ type: 'players-update', players });
        };

        multiplayer._lobbyHostHandler = null; // sera set après définition
        const _hostLobbyHandler = (data, from) => {
            console.log('📨 [HÔTE] Reçu:', data);

            if (data.type === 'player-info') {
                if (!players.find(p => p.id === from)) {
                    const taken    = players.map(p => p.color);
                    const assigned = taken.includes(data.color)
                        ? (allColors.find(c => !taken.includes(c)) || 'blue')
                        : data.color;
                    players.push({ id: from, name: data.name, color: assigned, isHost: false });
                    lobbyUI.setPlayers(players);
                }
                multiplayer.broadcast({ type: 'players-update', players });

                // ✅ Envoyer l'état courant des options directement au nouvel invité
                // (les broadcasts précédents ne l'avaient pas encore, il les a manqués)
                const currentOptions = {
                    'base-fields':           document.getElementById('base-fields')?.checked           ?? true,
                    'list-remaining':        document.getElementById('list-remaining')?.checked        ?? true,
                    'use-test-deck':         document.getElementById('use-test-deck')?.checked         ?? false,
                    'enable-debug':          document.getElementById('enable-debug')?.checked          ?? false,
                    'unplaceable':           document.querySelector('input[name="unplaceable"]:checked')?.value ?? 'reshuffle',
                    'ext-abbot':             document.getElementById('ext-abbot')?.checked             ?? false,
                    'tiles-abbot':           document.getElementById('tiles-abbot')?.checked           ?? false,
                    'ext-large-meeple':      document.getElementById('ext-large-meeple')?.checked      ?? false,
                    'ext-cathedrals':        document.getElementById('ext-cathedrals')?.checked        ?? false,
                    'ext-inns':              document.getElementById('ext-inns')?.checked              ?? false,
                    'tiles-inns-cathedrals': document.getElementById('tiles-inns-cathedrals')?.checked ?? false,
                    'tiles-traders-builders':document.getElementById('tiles-traders-builders')?.checked ?? false,
                    'ext-builder':           document.getElementById('ext-builder')?.checked           ?? false,
                    'ext-merchants':         document.getElementById('ext-merchants')?.checked         ?? false,
                    'ext-pig':               document.getElementById('ext-pig')?.checked               ?? false,
                    'tiles-dragon':          document.getElementById('tiles-dragon')?.checked          ?? false,
                    'ext-dragon':            document.getElementById('ext-dragon')?.checked            ?? false,
                    'ext-princess':          document.getElementById('ext-princess')?.checked          ?? false,
                    'ext-portal':            document.getElementById('ext-portal')?.checked            ?? false,
                    'ext-fairy-protection':  document.getElementById('ext-fairy-protection')?.checked  ?? false,
                    'ext-fairy-score-turn':  document.getElementById('ext-fairy-score-turn')?.checked  ?? false,
                    'ext-fairy-score-zone':  document.getElementById('ext-fairy-score-zone')?.checked  ?? false,
                    'start':                 document.querySelector('input[name="start"]:checked')?.value ?? 'unique',
                };
                multiplayer.sendTo(from, { type: 'options-sync', options: currentOptions });
            }

            if (data.type === 'color-change') {
                const player     = players.find(p => p.id === data.playerId);
                const colorTaken = players.some(p => p.id !== data.playerId && p.color === data.color);
                if (player && !colorTaken) {
                    player.color = data.color;
                    lobbyUI.updatePlayersList();
                    multiplayer.broadcast({ type: 'players-update', players });
                }
            }

            if (data.type === 'player-order-update') {
                players = data.players;
                lobbyUI.setPlayers(players);
            }

            if (data.type === 'player-left') {
                // Un invité quitte volontairement
                players = players.filter(p => p.id !== from);
                lobbyUI.setPlayers(players);
                multiplayer.broadcast({ type: 'players-update', players });
            }
        };
        multiplayer.onDataReceived = _hostLobbyHandler;
        multiplayer._lobbyHostHandler = _hostLobbyHandler;

        // Hôte : kick un invité
        lobbyUI.onKickPlayer = (playerId) => {
            multiplayer.sendTo(playerId, { type: 'you-are-kicked' });
            players = players.filter(p => p.id !== playerId);
            lobbyUI.setPlayers(players);
            multiplayer.broadcast({ type: 'players-update', players });
        };

        // Hôte : quitter le lobby (kick général + retour menu)
        lobbyUI.onHostLeave = () => {
            const invites = players.filter(p => !p.isHost);
            if (invites.length > 0) multiplayer.broadcast({ type: 'you-are-kicked' });
            returnToInitialLobby();
        };

    } catch (error) {
        console.error('❌ Erreur:', error);
        alert('Erreur lors de la création de la partie: ' + error.message);
        inLobby = false; isHost = false;
        updateLobbyUI();
    }
});

document.getElementById('copy-code-btn').addEventListener('click', () => {
    navigator.clipboard.writeText(gameCode).then(() => {
        const btn = document.getElementById('copy-code-btn');
        btn.textContent = '✅ Copié !';
        setTimeout(() => { btn.textContent = '📋 Copier'; }, 2000);
    });
});

// ═══════════════════════════════════════════════════════
// LOBBY — rejoindre une partie
// ═══════════════════════════════════════════════════════
document.getElementById('join-game-btn').addEventListener('click', () => {
    if (!playerName) { alert('Veuillez entrer un pseudo !'); return; }
    document.getElementById('join-modal').style.display = 'flex';
    document.getElementById('join-code-input').value    = '';
    document.getElementById('join-error').style.display = 'none';
    document.getElementById('join-code-input').focus();
});

async function _doJoin(isSpectator = false) {
    const code = document.getElementById('join-code-input').value.trim();
    if (!code) { showJoinError('Veuillez entrer un code !'); return; }

    try {
        const lobbyHandler = (data, from) => {
            console.log('📨 [INVITÉ] Reçu:', data);

            if (data.type === 'welcome') {
                console.log('🎉', data.message);
                gameCode = code;
                document.getElementById('game-code-container').style.display = 'block';
                document.getElementById('game-code-text').textContent = `Code: ${code}`;
                _startHeartbeat((peerId) => {
                    returnToInitialLobby("L'hote ne repond plus.");
                });
            }
            if (data.type === 'game-in-progress') {
                clearTimeout(window._pendingPlayerInfoTimer);
                if (window._isAutoReconnecting) {
                    // Auto-reconnexion : on sait qu'on est joueur, pas besoin de choisir
                    window._isAutoReconnecting = false;
                    multiplayer.broadcast({ type: 'player-info', name: playerName, color: playerColor, isSpectator: false });
                } else {
                    // Connexion manuelle : demander joueur ou spectateur
                    window._waitingForRoleChoice = true;
                    _showRoleChoiceModal((chosenIsSpectator) => {
                        window._waitingForRoleChoice = false;
                        multiplayer.broadcast({ type: 'player-info', name: playerName, color: playerColor, isSpectator: chosenIsSpectator });
                    });
                }
            }
            if (data.type === 'players-update') {
                // Si le jeu est déjà initialisé (rejoindre en cours de partie),
                // ignorer ce message — il sera traité par le handler de jeu
                if (turnManager) return;
                players = data.players;
                lobbyUI.setPlayers(players);
                const me = players.find(p => p.id === multiplayer.playerId);
                if (me && me.color !== playerColor) {
                    playerColor = me.color;
                    const opt = document.querySelector(`.color-option[data-color="${playerColor}"]`);
                    if (opt) {
                        colorOptions.forEach(o => o.classList.remove('selected'));
                        opt.classList.add('selected');
                        opt.querySelector('input').checked = true;
                    }
                }
            }
            if (data.type === 'color-change') {
                const player = players.find(p => p.id === data.playerId);
                if (player) { player.color = data.color; lobbyUI.updatePlayersList(); }
            }
            if (data.type === 'player-order-update') {
                players = data.players; lobbyUI.setPlayers(players);
            }
            if (data.type === 'return-to-lobby') {
                // Mettre à jour players avec la liste propre de l'hôte avant retour au lobby
                if (data.players) players = data.players;
                returnToLobby();
            }
            if (data.type === 'option-change') {
                if (data.option === 'unplaceable' || data.option === 'start') {
                    const radio = document.querySelector(`input[name="${data.option}"][value="${data.value}"]`);
                    if (radio) radio.checked = true;
                } else {
                    const checkbox = document.getElementById(data.option);
                    if (checkbox) checkbox.checked = data.value;
                }
                // Mettre à jour disponibilités, accès invité, puis coches maîtres
                updateAllAvailability();
                updateOptionsAccess();
                updateMasterCheckboxes();
            }
            if (data.type === 'options-sync') {
                // ✅ Réception de l'état complet des options
                const opts = data.options;
                ['base-fields', 'list-remaining', 'use-test-deck', 'enable-debug', 'ext-abbot', 'tiles-abbot', 'ext-large-meeple', 'ext-cathedrals', 'ext-inns', 'tiles-inns-cathedrals', 'tiles-traders-builders', 'ext-builder', 'ext-merchants', 'ext-pig', 'tiles-dragon', 'ext-dragon', 'ext-princess', 'ext-portal', 'ext-fairy-protection', 'ext-fairy-score-turn', 'ext-fairy-score-zone'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el && opts[id] !== undefined) el.checked = opts[id];
                });
                if (opts['unplaceable']) {
                    const radio = document.querySelector(`input[name="unplaceable"][value="${opts['unplaceable']}"]`);
                    if (radio) radio.checked = true;
                }
                if (opts['start']) {
                    const radio = document.querySelector(`input[name="start"][value="${opts['start']}"]`);
                    if (radio) radio.checked = true;
                }
                updateAllAvailability();
                updateOptionsAccess();
                updateMasterCheckboxes();
            }
            if (data.type === 'game-starting') {
                console.log("🎮 [INVITÉ] L'hôte démarre la partie !");
                if (data.config) { gameConfig = data.config; }
                startGameForInvite();
            }
            if (data.type === 'full-state-sync') {
                // Rejoindre ou se reconnecter à une partie déjà en cours
                console.log('🔄 [INVITÉ] Réception état complet de la partie en cours...');
                if (data.gameConfig) gameConfig = data.gameConfig;
                // Initialiser les structures de base si pas encore fait
                if (!turnManager) {
                    startGameForInvite(data);
                } else {
                    reconnectionManager.applyFullStateSync(data);
                }
            }
            if (data.type === 'rejoin-rejected') {
                returnToInitialLobby(data.reason || 'Impossible de rejoindre la partie.');
            }
            if (data.type === 'you-are-kicked') {
                returnToInitialLobby('Vous avez été retiré du salon.');
            }
        };

        // Invité : quitter volontairement
        lobbyUI.onLeaveGame = () => {
            multiplayer.broadcast({ type: 'player-left' });
            returnToInitialLobby();
        };

        originalLobbyHandler          = lobbyHandler;
        multiplayer.onDataReceived     = lobbyHandler;

        await multiplayer.joinGame(code);
        document.getElementById('join-modal').style.display = 'none';
        inLobby = true; isHost = false;
        updateLobbyUI();

        // player-info sera envoyé soit après 500ms (lobby normal),
        // soit après choix dans la modale (partie en cours — game-in-progress)
        window._pendingPlayerInfoTimer = setTimeout(() => {
            if (!window._waitingForRoleChoice) {
                multiplayer.broadcast({ type: 'player-info', name: playerName, color: playerColor, isSpectator });
            }
        }, 500);

    } catch (error) {
        console.error('❌ Erreur de connexion:', error);
        // Rouvrir la modale de saisie du code pour afficher l'erreur
        document.getElementById('join-modal').style.display = 'flex';
        showJoinError("Impossible de rejoindre: " + error.message);
    }
}

// ── Menu bouton (global) ────────────────────────────────────────────────────
function _openCloseMenu(btnEl) {
    const popover = document.getElementById('game-menu-popover');
    if (!popover) return;
    const isOpen = popover.style.display !== 'none';
    if (isOpen) {
        popover.style.display = 'none';
        return;
    }
    // Déplacer dans body si pas déjà fait (parent display:none empêche le rendu sur mobile)
    if (popover.parentElement !== document.body) {
        document.body.appendChild(popover);
    }
    const rect = btnEl.getBoundingClientRect();
    popover.style.visibility = 'hidden';
    popover.style.display    = 'block';
    const pw = popover.offsetWidth;
    const ph = popover.offsetHeight;
    let left = Math.max(8, Math.min(rect.left, window.innerWidth - pw - 8));
    let top  = Math.max(8, rect.top - ph - 8);
    popover.style.left       = left + 'px';
    popover.style.top        = top + 'px';
    popover.style.bottom     = '';
    popover.style.visibility = '';
}

document.getElementById('menu-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    _openCloseMenu(e.currentTarget);
});
// mobile-menu-btn branché via mobileBtn(touchend) dans setupEventListeners


// Clic "Rejoindre" → connexion directe (le choix joueur/spectateur se fait
// après connexion via modale si la partie est déjà en cours)
document.getElementById('join-confirm-btn').addEventListener('click', () => _doJoin(false));

document.getElementById('join-cancel-btn').addEventListener('click', () => {
    document.getElementById('join-modal').style.display = 'none';
});

function _showRoleChoiceModal(callback) {
    const modal = document.getElementById('join-role-modal');
    if (!modal) return;
    modal.style.display = 'flex';

    const onPlayer = () => {
        modal.style.display = 'none';
        cleanup();
        callback(false);
    };
    const onSpectator = () => {
        modal.style.display = 'none';
        cleanup();
        callback(true);
    };
    const cleanup = () => {
        document.getElementById('join-as-player-btn').removeEventListener('click', onPlayer);
        document.getElementById('join-as-spectator-btn').removeEventListener('click', onSpectator);
    };

    document.getElementById('join-as-player-btn').addEventListener('click', onPlayer);
    document.getElementById('join-as-spectator-btn').addEventListener('click', onSpectator);
}

function showJoinError(message) {
    const el       = document.getElementById('join-error');
    el.textContent = message;
    el.style.display = 'block';
}

// ═══════════════════════════════════════════════════════
// LOBBY — démarrer la partie
// ═══════════════════════════════════════════════════════
document.getElementById('start-game-btn').addEventListener('click', async () => {
    if (!inLobby) return;

    gameConfig = {
        playFields:         document.getElementById('base-fields').checked,
        showRemainingTiles: document.getElementById('list-remaining').checked,
        testDeck:           document.getElementById('use-test-deck').checked,
        enableDebug:        document.getElementById('enable-debug').checked,
        unplaceableAction:  document.querySelector('input[name="unplaceable"]:checked')?.value || 'destroy',
        startType: document.querySelector('input[name="start"]:checked')?.value || 'unique',
        extensions: {
            base:  true,
            abbot:           document.getElementById('ext-abbot')?.checked          ?? false,
            largeMeeple:     document.getElementById('ext-large-meeple')?.checked    ?? false,
            cathedrals:      document.getElementById('ext-cathedrals')?.checked      ?? true,
            inns:            document.getElementById('ext-inns')?.checked            ?? true,
            tradersBuilders: document.getElementById('ext-builder')?.checked         ?? false,
            merchants:       document.getElementById('ext-merchants')?.checked       ?? false,
            pig:             document.getElementById('ext-pig')?.checked             ?? false,
            dragon:          document.getElementById('ext-dragon')?.checked              ?? false,
            princess:        document.getElementById('ext-princess')?.checked            ?? false,
            portal:          document.getElementById('ext-portal')?.checked              ?? false,
            fairyProtection: document.getElementById('ext-fairy-protection')?.checked     ?? false,
            fairyScoreTurn:  document.getElementById('ext-fairy-score-turn')?.checked     ?? false,
            fairyScoreZone:  document.getElementById('ext-fairy-score-zone')?.checked     ?? false
        },
        tileGroups: {
            base:  true,
            abbot:            document.getElementById('tiles-abbot')?.checked             ?? false,
            inns_cathedrals:  document.getElementById('tiles-inns-cathedrals')?.checked   ?? false,
            traders_builders: document.getElementById('tiles-traders-builders')?.checked  ?? false,
            dragon:           document.getElementById('tiles-dragon')?.checked            ?? false,
            river: document.querySelector('input[name="start"]:checked')?.value === 'river'
        }
    };

    console.log('🔧 gameConfig construit:', JSON.stringify(gameConfig.extensions), '— tileGroups:', JSON.stringify(gameConfig.tileGroups));

    if (isHost) {
        multiplayer.broadcast({ type: 'game-starting', message: "L'hôte démarre la partie !", config: gameConfig });
    }

    await startGame();
});

// ═══════════════════════════════════════════════════════
// INITIALISATION COMMUNE DES MODULES
// ═══════════════════════════════════════════════════════
function initializeGameModules() {
    console.log('🔧 Initialisation des modules de jeu...');

    scorePanelUI   = new ScorePanelUI(eventBus, gameState, gameConfig);
    slotsUI        = new SlotsUI(plateau, gameSync, eventBus, () => tuileEnMain);
    slotsUI.init();
    slotsUI.setSlotClickHandler((x, y, tile, isFirst) => tilePlacement.handlePlace(x, y, tile, isFirst));
    slotsUI.isMyTurn        = isMyTurn;
    slotsUI.firstTilePlaced = firstTilePlaced;

    tilePreviewUI = new TilePreviewUI(eventBus);
    tilePreviewUI.init();

    zoneMerger = new ZoneMerger(plateau);
    scoring    = new Scoring(zoneMerger, gameConfig);

    tilePlacement  = new TilePlacement(eventBus, plateau, zoneMerger);
    tilePlacement.initHandlers({
        getGameState:          () => gameState,
        getGameConfig:         () => gameConfig,
        getMultiplayer:        () => multiplayer,
        getGameSync:           () => gameSync,
        getZoneMerger:         () => zoneMerger,
        getDragonRules:        () => dragonRules,
        getUndoManager:        () => undoManager,
        getMeepleCursorsUI:    () => meepleCursorsUI,
        getPlacedMeeples:      () => placedMeeples,
        getTilePreviewUI:      () => tilePreviewUI,
        getUnplaceableManager: () => unplaceableManager,
        getIsHost:             () => isHost,
        getIsMyTurn:           () => isMyTurn,
        getFirstTilePlaced:    () => firstTilePlaced,
        setTuileEnMain:        (v) => { tuileEnMain = v; },
        setTuilePosee:         (v) => { tuilePosee = v; },
        setFirstTilePlaced:    (v) => { firstTilePlaced = v; if (slotsUI) slotsUI.firstTilePlaced = v; if (tilePlacement) tilePlacement.firstTilePlaced = v; },
        setLastPlacedTile:     (v) => { lastPlacedTile = v; },
        setCurrentTileForPlayer: (v) => { currentTileForPlayer = v; },
        tileHasVolcanoZone,
        tileHasDragonZone,
        tileHasPortalZone,
        afficherSelecteurMeeple,
        showMeepleActionCursors,
        updateTurnDisplay,
        updateMobileButtons,
        updateMobileTilePreview,
    });
    meeplePlacement = new MeeplePlacement(eventBus, gameState, zoneMerger);
    meeplePlacement.setPlacedMeeples(placedMeeples);

    meepleCursorsUI  = new MeepleCursorsUI(multiplayer, zoneMerger, plateau, gameConfig);
    meepleCursorsUI.init();
    meepleSelectorUI = new MeepleSelectorUI(multiplayer, gameState, gameConfig);
    meepleSelectorUI.zoneMerger    = zoneMerger;
    meepleSelectorUI.placedMeeples = placedMeeples;
    meepleDisplayUI  = new MeepleDisplayUI();
    meepleDisplayUI.init();

    undoManager = new UndoManager(eventBus, gameState, plateau, zoneMerger);
    undoManager.initVisualHandlers({
        getGameConfig:        () => gameConfig,
        getMultiplayer:       () => multiplayer,
        getPlacedMeeples:     () => placedMeeples,
        getDragonRules:       () => dragonRules,
        getGameSync:          () => gameSync,
        getMeepleCursorsUI:   () => meepleCursorsUI,
        getTilePreviewUI:     () => tilePreviewUI,
        getSlotsUI:           () => slotsUI,
        getTilePlacement:     () => tilePlacement,
        getIsMyTurn:          () => isMyTurn,
        getLastPlacedTile:    () => lastPlacedTile,
        getFirstTilePlaced:   () => firstTilePlaced,
        setLastPlacedTile:    (v) => { lastPlacedTile = v; },
        setTuileEnMain:       (v) => { tuileEnMain = v; },
        setTuilePosee:        (v) => { tuilePosee = v; },
        setFirstTilePlaced:   (v) => { firstTilePlaced = v; if (slotsUI) slotsUI.firstTilePlaced = v; if (tilePlacement) tilePlacement.firstTilePlaced = v; },
        setPendingAbbePoints: (v) => { pendingAbbePoints = v; },
        renderDragonPiece,
        renderFairyPiece,
        removeFairyPiece,
        updateDragonOverlay,
        showDragonMoveCursors,
        tileHasVolcanoZone,
        afficherSelecteurMeeple,
        showMeepleActionCursors,
        hideAllCursors,
        updateTurnDisplay,
    });

    // Extension Princesse & Dragon
    if (gameConfig.extensions?.dragon || gameConfig.tileGroups?.dragon) {
        dragonRules = new DragonRules({
            gameState,
            plateau:      plateau.placedTiles,
            placedMeeples,
            eventBus,
            ruleRegistry
        });
        console.log('🐉 [Dragon] DragonRules initialisé');
    } else {
        dragonRules = null;
    }

    // ✅ Modules extraits de home.js
    unplaceableManager = new UnplaceableTileManager({
        deck, gameState, tilePreviewUI, gameSync, gameConfig, plateau,
        setRedrawMode: (active) => { waitingToRedraw = active; updateTurnDisplay(); },
        triggerEndGame: () => {
            if (deck.remaining() <= 0) {
                if (gameSync) gameSync.syncTurnEnd();
                finalScoresManager.computeAndApply(placedMeeples);
            }
        }
    });
    unplaceableManager.initNetworkListeners(eventBus, () => isHost, () => multiplayer);

    finalScoresManager = new FinalScoresManager({
        gameState, scoring, zoneMerger, gameSync, eventBus, updateTurnDisplay, gameConfig
    });
    // Afficher la colonne Marchands si l'extension est active
    const thMerchants = document.getElementById('th-merchants');
    if (thMerchants) thMerchants.style.display = gameConfig?.extensions?.merchants ? '' : 'none';

    console.log('✅ Tous les modules initialisés');
}

// ═══════════════════════════════════════════════════════
// ATTACHER LES CALLBACKS GAMESYNC (factorisé)
// ═══════════════════════════════════════════════════════
function attachGameSyncCallbacks() {
    new GameSyncCallbacks({
        gameSync, gameState, deck, turnManager, tilePreviewUI, meepleDisplayUI,
        undoManager, unplaceableManager, scoring, zoneMerger, slotsUI, eventBus,
        plateau, gameConfig, ruleRegistry, scorePanelUI, tilePlacement, dragonRules,
        finalScoresManager,
        getPlacedMeeples:  () => placedMeeples,
        getWaitingToRedraw: () => waitingToRedraw,
        setWaitingToRedraw: (v) => { waitingToRedraw = v; updateTurnDisplay(); },
        onRemoteUndo:     (action) => undoManager.applyRemote(action),
        onFinalScores:    (scores, destroyedTilesCount = 0) => finalScoresManager.receiveFromNetwork(scores, destroyedTilesCount),
        onTileDestroyed:  (tileId, pName, action, count = 1, playerId = null) => {
            if (action === 'destroy' && gameState) gameState.destroyedTilesCount = (gameState.destroyedTilesCount || 0) + count;
            const currentPlayer = gameState?.getCurrentPlayer();
            const isMyTileDestroyed = !isHost && action === 'dragon-reshuffle'
                && (playerId === multiplayer.playerId || currentPlayer?.id === multiplayer.playerId);
            if (isMyTileDestroyed) {
                waitingToRedraw = true;
                if (tilePreviewUI) tilePreviewUI.showBackside();
                updateMobileTilePreview();
                updateTurnDisplay();
            }
            unplaceableManager.showTileDestroyedModal(tileId, pName, isMyTileDestroyed, action);
        },
        onDeckReshuffled: (tiles, idx) => { deck.tiles = tiles; deck.currentIndex = idx; },
        onAbbeRecalled: (x, y, key, playerId, points) => {
            document.querySelectorAll(`.meeple[data-key="${key}"]`).forEach(el => el.remove());
            delete placedMeeples[key];
            releaseFairyIfDetached(key);
            const player = gameState.players.find(p => p.id === playerId);
            if (player) player.hasAbbot = true;
            if (isHost && undoManager) undoManager.markAbbeRecalled(x, y, key, playerId, points);
            eventBus.emit('meeple-count-updated', { playerId });
            eventBus.emit('score-updated');
            updateTurnDisplay();
        },
        onAbbeRecalledUndo: (x, y, key, playerId) => {
            pendingAbbePoints = null;
            const player = gameState.players.find(p => p.id === playerId);
            if (player) player.hasAbbot = false;
            eventBus.emit('score-updated');
            updateTurnDisplay();
        },
        onBonusTurnStarted: (playerId) => {
            if (turnManager) turnManager.isBonusTurn = true;
            updateTurnDisplay();
            const player = gameState.players.find(p => p.id === playerId);
            if (player) {
                afficherToast(`⭐ Tour bonus pour ${player.name} !`, 'bonus');
                const _bonusToast = document.getElementById('disconnect-toast');
                if (_bonusToast) _bonusToast.dataset.isBonusToast = 'true';
            }
        },
        onUnplaceableHandled: (tileId, pName, action, isRiver, isActivePlayer) => {
            if (action === 'destroy' && gameState) gameState.destroyedTilesCount = (gameState.destroyedTilesCount || 0) + 1;
            unplaceableManager.showTileDestroyedModal(tileId, pName, isActivePlayer, action, isRiver);
            if (isActivePlayer) { waitingToRedraw = true; updateTurnDisplay(); }
        },
        onGamePaused:  (name)   => { reconnectionManager?._showPauseOverlay(name); },
        onGameResumed: (reason) => {
            reconnectionManager?._hidePauseOverlay();
            if (reason === 'timeout') afficherToast('⏱ Partie reprise (joueur exclu).');
            else afficherToast('✅ Partie reprise !');
        },
        onFullStateSync: (data) => { reconnectionManager.applyFullStateSync(data); },
        updateTurnDisplay,
        poserTuileSync:            (x, y, tile, opts) => tilePlacement.handlePlaceSync(x, y, tile, opts),
        afficherMessage:            (msg) => { afficherToast(msg); },
        onUpdateMobileTilePreview: updateMobileTilePreview,
        updateMobileButtons,
        releaseFairyIfDetached,
        broadcastDragonState,
        startDragonTurnUI,
        hostDrawAndSend:       _hostDrawAndSend,
        executeDragonMoveHost,
        advanceDragonTurnHost,
        handlePrincessEject,
        isHost,
    }).attach(isHost);
}

// Invités : écouter dragon-state-update et dragon-phase-started
eventBus.on('network-dragon-state-update', (data) => {
    if (isHost) return;
    const wasActive = gameState.dragonPhase.active;
    const prevPos = gameState.dragonPos ? `${gameState.dragonPos.x},${gameState.dragonPos.y}` : null;

    gameState.dragonPos   = data.dragonPos;
    gameState.dragonPhase = { ...gameState.dragonPhase, ...data.dragonPhase };
    gameState.fairyState  = data.fairyState;
    if (data.players) {
        data.players.forEach(pd => {
            const p = gameState.players.find(pl => pl.id === pd.id);
            if (p) Object.assign(p, pd);
        });
    }
    // Retirer visuellement les meeples mangés
    if (data.eatenKeys?.length) {
        data.eatenKeys.forEach(key => {
            document.querySelectorAll(`.meeple[data-key="${key}"]`).forEach(el => el.remove());
            delete placedMeeples[key];
            releaseFairyIfDetached(key);
        });
        eventBus.emit('meeple-count-updated', {});
    }
    // Rendu pion dragon
    if (gameState.dragonPos) {
        renderDragonPiece(gameState.dragonPos.x, gameState.dragonPos.y);
    }

    // Détecter si le dragon vient de se déplacer (position changée)
    const newPos = gameState.dragonPos ? `${gameState.dragonPos.x},${gameState.dragonPos.y}` : null;
    const dragonMoved = newPos && newPos !== prevPos;

    if (!gameState.dragonPhase.active) {
        // Phase terminée
        if (wasActive) {
            clearDragonCursors();
            updateDragonOverlay(); // cache l'overlay bandeau rouge
            if (undoManager) { undoManager.dragonMovePlacedThisTurn = false; undoManager.dragonMoveSnapshot = null; }
            updateTurnDisplay();
        }
    } else {
        const mover = gameState.players[gameState.dragonPhase.moverIndex];
        const isMyDragonTurn = mover?.id === multiplayer.playerId;

        if (dragonMoved && isMyDragonTurn) {
            // L'hôte vient de confirmer notre déplacement → marquer "a déplacé" et attendre clic
            if (undoManager) undoManager.dragonMovePlacedThisTurn = true;
            clearDragonCursors();
            updateDragonOverlay();
            updateTurnDisplay();
        } else if (dragonMoved && !isMyDragonTurn) {
            // Un autre joueur a déplacé → on attend que ce joueur clique Terminer
            clearDragonCursors();
            updateDragonOverlay();
            updateTurnDisplay();
        } else if (!dragonMoved) {
            // moverIndex a changé (avancement de tour dragon) → afficher curseurs si c'est notre tour
            if (undoManager) { undoManager.dragonMovePlacedThisTurn = false; undoManager.dragonMoveSnapshot = null; }
            startDragonTurnUI();
        }
    }
    eventBus.emit('score-updated');
});

eventBus.on('network-fairy-placed', (data) => {
    if (!dragonRules || !gameState) return;
    // Mettre à jour l'état fairy dans gameState (hôte ET invité)
    gameState.fairyState.ownerId   = data.ownerId;
    gameState.fairyState.meepleKey = data.meepleKey;
    gameState.players.forEach(p => { p.hasFairy = false; });
    const owner = gameState.players.find(p => p.id === data.ownerId);
    if (owner) owner.hasFairy = true;
    // Afficher la fée
    renderFairyPiece(data.meepleKey);
    // Côté hôte : marquer la fée comme posée ce tour pour que l'undo invité fonctionne
    if (isHost && undoManager) undoManager.markFairyPlaced();
});

// Après une fermeture de zone, si la fée s'est retrouvée seule,
// réafficher les curseurs pour que le joueur puisse la réassigner.
eventBus.on('fairy-detached-show-targets', () => {
    if (!isMyTurn || !gameConfig.extensions?.fairyProtection) return;
    if (undoManager?.meeplePlacedThisTurn) return;
    clearFairyCursors();
    showMeepleActionCursors();
});

// ═══════════════════════════════════════════════════════
// DÉMARRAGE — HÔTE
// ═══════════════════════════════════════════════════════
// ── Pause / Reconnexion ─────────────────────────────────────────────────────────

/**
 * Déclencher la pause (hôte uniquement)
 * Affiche l'overlay, démarre le timer, broadcaster aux invités
 */
/**
 * Construit la liste players enrichie pour le broadcast players-update :
 * inclut les fantômes kicked de gameState afin que les invités puissent
 * afficher l'icône 🚪 et ne pas les effacer de leur gameState.
 */
function buildPlayersForBroadcast() {
    if (!gameState) return players;
    const enriched = [...players];
    gameState.players.forEach(gp => {
        if (gp.kicked && gp.color !== 'spectator') {
            // Ajouter seulement s'il n'est pas déjà dans la liste
            if (!enriched.find(p => p.id === gp.id)) {
                enriched.push({ id: gp.id, name: gp.name, color: gp.color, isHost: false, kicked: true });
            }
        }
    });
    return enriched;
}

function pauseGame(disconnectedName)              { reconnectionManager?.pauseGame(disconnectedName); }
function resumeGame(reason = 'reconnected')       { reconnectionManager?.resumeGame(reason); }
function _excludeDisconnectedPlayer(name)         { reconnectionManager?.excludeDisconnectedPlayer(name); }
function _startAutoReconnect()                    { reconnectionManager?.startAutoReconnect(); }
function _stopAutoReconnect()                     { reconnectionManager?.stopAutoReconnect(); }
function _showPauseOverlay(name)                  { reconnectionManager?._showPauseOverlay(name); }
function _hidePauseOverlay()                      { reconnectionManager?._hidePauseOverlay(); }
function _showReconnectOverlay()                  { reconnectionManager?._showReconnectOverlay(); }
function _hideReconnectOverlay()                  { reconnectionManager?.hideReconnectOverlay(); }


/**
 * Construire et envoyer l'état complet à un joueur qui (re)joint
 */
/**
 * L'hôte pioche la prochaine tuile et la retourne.
 * Broadcaste aussi tile-drawn pour sync le compteur deck côté invités.
 */
function _hostDrawAndSend() {
    if (!deck || !gameSync) return null;
    let tileData = deck.draw();
    if (!tileData) {
        console.log('⚠️ Pioche vide !');
        eventBus.emit('deck-empty');
        return null;
    }

    // ── Extension Dragon : tuile dragon piochée sans volcan ──────────────
    // La tuile n'est PAS implaçable — elle est juste prématurée (pas de volcan).
    // Flow en 2 modales :
    //   Modale 1 (unplaceable-modal) : info "dragon sans volcan" + bouton Confirmer
    //   → clic Confirmer → remélange Fisher-Yates + syncDeck
    //   Modale 2 (tile-destroyed-modal) : "remélangée, cliquez Repiocher"
    if (tileHasDragonZone(tileData)) {
        const volcanoOnBoard = Object.values(plateau.placedTiles ?? {}).some(t => tileHasVolcanoZone(t));
        console.log('🐉 [DIAG] tuile dragon détectée:', tileData.id,
            '| tileGroups.dragon:', gameConfig.tileGroups?.dragon,
            '| extensions.dragon:', gameConfig.extensions?.dragon,
            '| volcanoOnBoard:', volcanoOnBoard,
            '| placedTiles count:', Object.keys(plateau.placedTiles ?? {}).length);
    }
    if (gameConfig.tileGroups?.dragon && gameConfig.extensions?.dragon &&
        tileHasDragonZone(tileData) &&
        !Object.values(plateau.placedTiles ?? {}).some(t => tileHasVolcanoZone(t))) {
        console.log('🐉 [HÔTE] Tuile dragon sans volcan — badge implaçable:', tileData.id);

        tuileEnMain = tileData;
        currentTileForPlayer = tileData;

        const _cp          = gameState.getCurrentPlayer();
        const _cpId        = _cp?.id   ?? null;
        const _cpName      = _cp?.name ?? '?';
        const isHostPlayer = _cpId === multiplayer.playerId;

        if (isHostPlayer) {
            // Tour de l'hôte : afficher tuile + badge comme pour une tuile implaçable normale
            if (tilePreviewUI) tilePreviewUI.showTile(tileData);
            gameSync.syncTileDraw(tileData.id, 0);
            unplaceableManager?.showUnplaceableBadgeDragon(tileData.id);
        } else {
            // Tour d'un invité : envoyer la tuile à l'invité + broadcaster dragon-premature
            if (tilePreviewUI) tilePreviewUI.showBackside();
            gameSync.syncTileDraw(tileData.id, 0);
            // L'invité actif recevra dragon-premature-tile → showUnplaceableBadgeDragon
            gameSync.multiplayer.broadcast({
                type:       'dragon-premature-tile',
                tileId:     tileData.id,
                playerName: _cpName,
                playerId:   _cpId,
            });
        }

        return tileData;
    }

    console.log('🎲 [HÔTE] Pioche:', tileData.id, '→', gameState.getCurrentPlayer()?.name);
    currentTileForPlayer = tileData; // Mémoriser pour reconnexion
    gameSync.syncTileDraw(tileData.id, 0);
    return tileData;
}

/**
 * Indique si une tuile contient une zone dragon (déclencheur de phase dragon).
 */


function _makeStarter() {
    return new GameStarter({
        getGameConfig:           () => gameConfig,
        getPlayers:              () => players,
        getMultiplayer:          () => multiplayer,
        getEventBus:             () => eventBus,
        getDeck:                 () => deck,
        getTurnManager:          () => turnManager,
        getMeepleSelectorUI:     () => meepleSelectorUI,
        getMeepleCursorsUI:      () => meepleCursorsUI,
        getScorePanelUI:         () => scorePanelUI,
        getSlotsUI:              () => slotsUI,
        getLobbyUI:              () => lobbyUI,
        getReconnectionManager:  () => reconnectionManager,
        getOriginalLobbyHandler: () => originalLobbyHandler,
        getZoneMerger:           () => zoneMerger,
        getPlacedMeeples:        () => placedMeeples,
        getScoring:              () => scoring,
        getRuleRegistry:         () => ruleRegistry,
        getGameState:            () => gameState,
        getIsHost:               () => isHost,
        getIsSpectator:          () => _isSpectator(),
        getGameCode:             () => gameCode,
        getBaseRules:            () => BaseRules,
        getAbbeRules:            () => AbbeRules,
        getInnsRules:            () => InnsRules,
        getBuilderRulesClass:    () => BuilderRules,
        setGameState:            (v) => { gameState = v; },
        setGameSync:             (v) => { gameSync  = v; },
        setTurnManager:          (v) => { turnManager = v; },
        setReconnectionManager:  (v) => { reconnectionManager = v; },
        startGameTimer,
        hostDrawAndSend:         _hostDrawAndSend,
        initializeGameModules,
        attachGameSyncCallbacks,
        setupEventListeners,
        setupNavigation:         () => setupNavigation(document.getElementById('board-container'), document.getElementById('board')),
        updateTurnDisplay,
        afficherMessage:         (msg) => afficherToast(msg),
        // deps pour initTurnUI
        getTurnUIDeps: () => ({
            getGameState:          () => gameState,
            getGameConfig:         () => gameConfig,
            getMultiplayer:        () => multiplayer,
            getTurnManager:        () => turnManager,
            getUndoManager:        () => undoManager,
            getFinalScoresManager: () => finalScoresManager,
            getScorePanelUI:       () => scorePanelUI,
            getDeck:               () => deck,
            getIsHost:             () => isHost,
            getIsMyTurn:           () => isMyTurn,
            setIsMyTurn:           (v) => { isMyTurn = v; },
            getIsSpectator:        () => _isSpectator(),
            getWaitingToRedraw:    () => waitingToRedraw,
            getTuilePosee:         () => tuilePosee,
            getTuileEnMain:        () => tuileEnMain,
            getTilePreviewUI:      () => tilePreviewUI,
            getEventBus:           () => eventBus,
            isMobile,
        }),
        // deps pour initDragonUI
        getDragonUIDeps: () => ({
            getGameState:         () => gameState,
            getGameConfig:        () => gameConfig,
            getMultiplayer:       () => multiplayer,
            getGameSync:          () => gameSync,
            getDragonRules:       () => dragonRules,
            getUndoManager:       () => undoManager,
            getZoneMerger:        () => zoneMerger,
            getPlacedMeeples:     () => placedMeeples,
            getMeepleSelectorUI:  () => meepleSelectorUI,
            getDeck:              () => deck,
            getTurnManager:       () => turnManager,
            getFinalScoresManager:() => finalScoresManager,
            getIsHost:            () => isHost,
            getMeepleSize,
            onUpdateTurnDisplay:  () => updateTurnDisplay(),
            onHostDrawAndSend:    () => _hostDrawAndSend(),
        }),
        // deps pour initMeepleActionsUI
        getMeepleActionsUIDeps: () => ({
            getGameState:           () => gameState,
            getMultiplayer:         () => multiplayer,
            getPlacedMeeples:       () => placedMeeples,
            getPlateau:             () => plateau,
            getGameConfig:          () => gameConfig,
            getEventBus:            () => eventBus,
            getUndoManager:         () => undoManager,
            getGameSync:            () => gameSync,
            getDragonRules:         () => dragonRules,
            getMeepleCursorsUI:     () => meepleCursorsUI,
            getMeepleSelectorUI:    () => meepleSelectorUI,
            getMeepleDisplayUI:     () => meepleDisplayUI,
            getScorePanelUI:        () => scorePanelUI,
            getMeeplePlacement:     () => meeplePlacement,
            getZoneMerger:          () => zoneMerger,
            getLastPlacedTile:      () => lastPlacedTile,
            getIsHost:              () => isHost,
            getIsMyTurn:            () => isMyTurn,
            releaseFairyIfDetached,
            renderFairyPiece,
            hideAllCursors:         () => hideAllCursors(),
            setPendingAbbePoints:   (v) => { pendingAbbePoints = v; },
            onHandlePortalActivate: () => handlePortalActivate(),
            onHandlePrincessEject:  (key) => handlePrincessEject(key),
            updateTurnDisplay,
            updateMobileButtons,
        }),
        // deps pour ReconnectionManager
        getReconnectionManagerDeps: () => ({
            multiplayer,
            gameSync,
            turnManager,
            eventBus,
            getGameState:            () => gameState,
            getPlayers:              () => players,
            setPlayers:              (p) => { players = p; },
            getIsHost:               () => isHost,
            getGameCode:             () => gameCode,
            getPlayerName:           () => playerName,
            hostDrawAndSend:         _hostDrawAndSend,
            buildPlayersForBroadcast,
            afficherToast,
            onGameSyncInit:          () => { if (gameSync) gameSync.init(); },
        }),
        // deps pour reconnectionManager.initStateHandlers
        getStateHandlerDeps: () => ({
            getTileClass:            () => Tile,
            getGameConfig:           () => gameConfig,
            getDeck:                 () => deck,
            getPlateau:              () => plateau,
            getZoneMerger:           () => zoneMerger,
            getPlacedMeeples:        () => placedMeeples,
            getSlotsUI:              () => slotsUI,
            getTilePlacement:        () => tilePlacement,
            getMeepleDisplayUI:      () => meepleDisplayUI,
            getTilePreviewUI:        () => tilePreviewUI,
            getTurnManager:          () => turnManager,
            getEventBus:             () => eventBus,
            getPlayerName:           () => playerName,
            getPlayerColor:          () => playerColor,
            getTuileEnMain:          () => tuileEnMain,
            getCurrentTileForPlayer: () => currentTileForPlayer,
            getElapsedSeconds,
            setTuileEnMain:          (v) => { tuileEnMain = v; },
            setTuilePosee:           (v) => { tuilePosee = v; },
            setFirstTilePlaced:      (v) => { firstTilePlaced = v; },
            setPlayerColor:          (v) => { playerColor = v; },
            renderDragonPiece,
            renderFairyPiece,
            startGameTimerFrom,
            updateTurnDisplay,
        }),
        // deps pour reconnectionManager.initInGameNetworkHandler
        getInGameNetworkDeps: () => ({
            getGameState:           () => gameState,
            getGameSync:            () => gameSync,
            getGameConfig:          () => gameConfig,
            getEventBus:            () => eventBus,
            getPlayers:             () => players,
            setPlayers:             (v) => { players = v; },
            getPlacedMeeples:       () => placedMeeples,
            getScorePanelUI:        () => scorePanelUI,
            getTurnManager:         () => turnManager,
            getTuileEnMain:         () => tuileEnMain,
            getHeartbeatManager:    () => heartbeatManager,
            getVoluntaryLeaves:     () => _voluntaryLeaves,
            getPlayerName:          () => playerName,
            getPlayerColorVar:      () => playerColor,
            buildPlayersForBroadcast,
            afficherToast,
            updateTurnDisplay,
            pauseGame,
            resumeGame,
            startHeartbeat:             (cb) => _startHeartbeat(cb),
            startAutoReconnect:          () => _startAutoReconnect(),
            excludeDisconnectedPlayer:   (name) => _excludeDisconnectedPlayer(name),
        }),
    });
}

// ═══════════════════════════════════════════════════════
// DÉMARRAGE — HÔTE
// ═══════════════════════════════════════════════════════
async function startGame() {
    await _makeStarter().startHost();
}

// ═══════════════════════════════════════════════════════
// DÉMARRAGE — INVITÉ
// ═══════════════════════════════════════════════════════
async function startGameForInvite(fullStateData = null) {
    await _makeStarter().startGuest(fullStateData);
}

// ═══════════════════════════════════════════════════════
// MOBILE — Mise à jour de l'UI
// ═══════════════════════════════════════════════════════

/**
 * Met à jour le style de la carte mobile du joueur actif selon le tour bonus
 */



// ═══════════════════════════════════════════════════════
// ABBÉ — Rappel anticipé
// ═══════════════════════════════════════════════════════

/**
 * Rappeler l'Abbé depuis le plateau
 * Appelé quand le joueur clique sur l'Abbé rappelable en phase 2
 */
// ═══════════════════════════════════════════════════════
// MEEPLES
// ═══════════════════════════════════════════════════════
// ── Dragon prématuré : modales 1 et 2 ────────────────────────────────

// Invités : modale dragon prématuré
function incrementPlayerMeeples(playerId) {
    const player = gameState.players.find(p => p.id === playerId);
    if (player && player.meeples < 7) {
        player.meeples++;
        console.log(`🎭 ${player.name} récupère un meeple (${player.meeples}/7)`);
        eventBus.emit('score-updated');
        if (gameSync) {
            gameSync.multiplayer.broadcast({
                type: 'meeple-count-update', playerId, meeples: player.meeples
            });
        }
    }
}

// ═══════════════════════════════════════════════════════
// EVENT LISTENERS DU JEU
// ═══════════════════════════════════════════════════════
function setupEventListeners() {
    if (eventListenersInstalled) {
        console.log('⚠️ Event listeners déjà installés, skip');
        return;
    }

    // Rotation de la tuile au clic sur la preview
    document.getElementById('tile-preview').addEventListener('click', () => {
        if (!isMyTurn && gameSync) { console.log('⚠️ Pas votre tour !'); return; }
        if (!tuileEnMain || tuilePosee) return;

        const currentImg = document.getElementById('current-tile-img');
        const nextRotation = (tuileEnMain.rotation + 90) % 360;
        if (gameSync && !isHost) {
            // ✅ Étape 1 : invité purement réactif — envoie seulement, applique à la réception du broadcast
            gameSync.syncTileRotation(nextRotation);
        } else {
            // Hôte ou solo : applique immédiatement + broadcast
            tuileEnMain.rotation = nextRotation;
            const currentDeg = parseInt(currentImg.style.transform.match(/rotate\((\d+)deg\)/)?.[1] || '0');
            currentImg.style.transform = `rotate(${currentDeg + 90}deg)`;
            eventBus.emit('tile-rotated', { rotation: nextRotation });
            if (gameSync) gameSync.syncTileRotation(nextRotation);
        }
    });

    // Bouton "Terminer mon tour" / "Repiocher" / "Détails des scores"
    // Bouton "Terminer mon tour" / "Repiocher" / "Détails des scores"
    document.getElementById('end-turn-btn').onclick = () => {
        if (finalScoresManager?.gameEnded) {
            finalScoresManager.showModal(finalScoresManager.finalScoresData);
            return;
        }

        if (waitingToRedraw && isMyTurn) {
            document.getElementById('tile-destroyed-modal').style.display = 'none';
            if (isHost) {
                const _t = _hostDrawAndSend();
                if (_t) turnManager.receiveYourTurn(_t.id);
                waitingToRedraw = false; // hôte : reset immédiat car il reçoit sa tuile localement
            } else {
                if (gameSync) gameSync.syncUnplaceableRedraw();
                // invité : waitingToRedraw reste true jusqu'à réception de tile-drawn fromYourTurn
            }
            updateTurnDisplay();
            return;
        }

        // ── Phase dragon : "Terminer mon tour" = passer la main au joueur suivant ──
        const isDragonPhase = !!(gameConfig?.extensions?.dragon && gameState?.dragonPhase?.active);
        if (isDragonPhase) {
            const mover = gameState.players[gameState.dragonPhase.moverIndex];
            const isMyDragonTurn = mover?.id === multiplayer.playerId;
            if (!isMyDragonTurn) return; // pas notre tour dragon
            if (!undoManager?.dragonMovePlacedThisTurn) return; // n'a pas encore déplacé

            clearDragonCursors();

            if (isHost) {
                advanceDragonTurnHost();
            } else {
                // Invité → envoie dragon-end-turn-request à l'hôte
                const hostConn = gameSync?.multiplayer?.connections?.[0];
                if (hostConn?.open) {
                    hostConn.send({ type: 'dragon-end-turn-request', playerId: multiplayer.playerId });
                }
            }
            return;
        }

        if (!isMyTurn && gameSync) { alert("Ce n'est pas votre tour !"); return; }
        if (!tuilePosee && !gameState.currentTilePlaced) { alert('Vous devez poser la tuile avant de terminer votre tour !'); return; }

        // ✅ Étape 4 : invité purement réactif — envoie la request, attend turn-ended de l'hôte
        if (gameSync && !isHost) {
            hideAllCursors();
            // Transmettre les points Abbé en attente à l'hôte via la request
            const _pendingAbbe = pendingAbbePoints ? { ...pendingAbbePoints } : null;
            pendingAbbePoints = null;
            const hostConn = gameSync.multiplayer.connections[0];
            if (hostConn && hostConn.open) {
                hostConn.send({
                    type: 'turn-end-request',
                    playerId: multiplayer.playerId,
                    isBonusTurn: turnManager?.isBonusTurn ?? false,
                    pendingAbbePoints: _pendingAbbe
                });
            }
            return;
        }

        console.log('⏭️ Fin de tour - calcul des scores et passage au joueur suivant');
        gameState.currentTilePlaced = false;

        // ── Extension Dragon : migration volcano en fin de tour ──────────
        if (gameConfig.tileGroups?.dragon && gameConfig.extensions?.dragon && dragonRules && gameState._pendingVolcanoPos) {
            const { x: vx, y: vy } = gameState._pendingVolcanoPos;
            dragonRules.onVolcanoPlaced(vx, vy);
            gameState._pendingVolcanoPos = null;
            broadcastDragonState();
        }

        // ⭐ Vérifier le bonus bâtisseur AVANT le scoring
        // (après scoring le bâtisseur peut être retiré de placedMeeples si zone fermée)
        let builderBonusTriggered = false;
        if (gameConfig.extensions?.tradersBuilders && lastPlacedTile) {
            const builderRulesInst = ruleRegistry.rules?.get('builders');
            if (builderRulesInst) {
                builderBonusTriggered = builderRulesInst.checkBonusTrigger(multiplayer.playerId);
            }
        }

        // Appliquer les points Abbé en attente
        if (pendingAbbePoints) {
            const player = gameState.players.find(p => p.id === pendingAbbePoints.playerId);
            if (player) {
                player.score += pendingAbbePoints.points;
                player.scoreDetail = player.scoreDetail || {};
                player.scoreDetail.monasteries = (player.scoreDetail.monasteries || 0) + pendingAbbePoints.points;
            }
            pendingAbbePoints = null;
        }

        // Calcul des scores des zones fermées
        if (scoring && zoneMerger) {
            const newlyClosed = tilePlacement?.newlyClosedZones ?? null;
            const { scoringResults, meeplesToReturn, goodsResults } = scoring.scoreClosedZones(placedMeeples, multiplayer.playerId, gameState, newlyClosed);
            // Snapshot fée AVANT que _releaseFairyIfDetached vide fairyState
            const fairyMeepleKeySnapshot = gameState.fairyState?.meepleKey ?? null;
            const fairyOwnerIdSnapshot   = gameState.fairyState?.ownerId   ?? null;

            if (scoringResults.length > 0 || goodsResults.length > 0) {
                scoringResults.forEach(({ playerId, points, zoneType }) => {
                    const player = gameState.players.find(p => p.id === playerId);
                    if (player) {
                        player.score += points;
                        if (zoneType === 'city')         player.scoreDetail.cities      += points;
                        else if (zoneType === 'road')    player.scoreDetail.roads       += points;
                        else if (zoneType === 'abbey' || zoneType === 'garden') player.scoreDetail.monasteries += points;
                    }
                });

                meeplesToReturn.forEach(key => {
                    const meeple = placedMeeples[key];
                    if (meeple) {
                        // Retourner le meeple selon son type
                        if (meeple.type === 'Abbot') {
                            const player = gameState.players.find(p => p.id === meeple.playerId);
                            if (player) {
                                player.hasAbbot = true;
                                eventBus.emit('meeple-count-updated', { playerId: meeple.playerId });
                            }
                        } else if (meeple.type === 'Large' || meeple.type === 'Large-Farmer') {
                            const player = gameState.players.find(p => p.id === meeple.playerId);
                            if (player) {
                                player.hasLargeMeeple = true;
                                eventBus.emit('meeple-count-updated', { playerId: meeple.playerId });
                            }
                        } else if (meeple.type === 'Builder') {
                            const player = gameState.players.find(p => p.id === meeple.playerId);
                            if (player) {
                                player.hasBuilder = true;
                                eventBus.emit('meeple-count-updated', { playerId: meeple.playerId });
                            }
                        } else {
                            incrementPlayerMeeples(meeple.playerId);
                        }
                        document.querySelectorAll(`.meeple[data-key="${key}"]`).forEach(el => el.remove());
                        delete placedMeeples[key];
                        releaseFairyIfDetached(key);
                    }
                });

                if (gameSync) gameSync.syncScoreUpdate(scoringResults, meeplesToReturn, goodsResults, zoneMerger);
                updateTurnDisplay();

                // Si la fée s'est retrouvée seule après la fermeture, réafficher les curseurs
                if (gameConfig.extensions?.fairyProtection
                    && fairyMeepleKeySnapshot && !gameState.fairyState?.meepleKey) {
                    eventBus.emit('fairy-detached-show-targets');
                }

                // Fix 2 — Fée : +3 points si le meeple porteur de la fée est dans une zone fermée
                if (gameConfig.extensions?.fairyScoreZone && fairyMeepleKeySnapshot
                    && meeplesToReturn.includes(fairyMeepleKeySnapshot)) {
                    const fp = gameState.players.find(p => p.id === fairyOwnerIdSnapshot);
                    if (fp) {
                        fp.score += 3;
                        fp.scoreDetail = fp.scoreDetail || {};
                        fp.scoreDetail.fairy = (fp.scoreDetail.fairy || 0) + 3;
                        console.log(`🧚 [Fée] +3 points fermeture de zone pour ${fp.name} (score: ${fp.score})`);
                        if (gameSync) gameSync.syncScoreUpdate(
                            [{ playerId: fairyOwnerIdSnapshot, points: 3, zoneType: 'fairy' }],
                            [], [], zoneMerger
                        );
                        eventBus.emit('score-updated');
                    }
                }
            }
        }

        // Nettoyer les curseurs et overlays abbé
        hideAllCursors();
        document.querySelectorAll('.meeple-cursors-container').forEach(c => c.remove());

        // ✅ reset() avant nextPlayer() : on efface les snapshots du tour écoulé
        // AVANT que drawTile() en sauvegarde un nouveau via saveTurnStart()
        gameState._pendingPrincessTile = null;
        gameState._pendingPortalTile = null;
        if (undoManager) undoManager.reset();

        // ── Extension Dragon : démarrer la phase dragon si tuile dragon posée ──
        if (gameConfig.tileGroups?.dragon && gameConfig.extensions?.dragon && dragonRules && gameState._pendingDragonTile) {
            const { playerIndex } = gameState._pendingDragonTile;
            gameState._pendingDragonTile = null;
            const started = dragonRules.onDragonTilePlaced(playerIndex);
            if (started) {
                broadcastDragonState();
                startDragonTurnUI();
                return; // on ne passe pas au joueur suivant — la phase dragon prend le relais
            }
        }

        // ✅ Vérifier fin de partie AVANT nextPlayer() :
        // nextPlayer() appelle drawTile() qui consomme une tuile.
        // Si la pioche est vide maintenant, plus rien à piocher → fin de partie.
        if (deck.remaining() <= 0) {
            if (gameSync) gameSync.syncTurnEnd();
            finalScoresManager.computeAndApply(placedMeeples);
            return;
        }

        // endTurn() gère le tour bonus (bâtisseur) puis passe au joueur suivant si pas de bonus
        if (turnManager) {
            const result = turnManager.endTurn(builderBonusTriggered);
            if (result?.bonusTurnStarted) {
                // Tour bonus : l'hôte pioche pour le même joueur
                if (isHost) {
                    const _bonusTile = _hostDrawAndSend();
                    if (_bonusTile) turnManager.receiveYourTurn(_bonusTile.id);
                    if (gameSync) gameSync.syncTurnEnd(true, _bonusTile?.id ?? null);
                } else {
                    if (gameSync) gameSync.syncTurnEndRequest(true);
                }
                ruleRegistry.rules?.get('builders')?.resetLastPlacedTile?.();
                updateTurnDisplay();
                afficherToast('⭐ Tour bonus ! Votre bâtisseur vous offre un tour supplémentaire.', 'bonus');
                const _bonusToast = document.getElementById('disconnect-toast');
                if (_bonusToast) _bonusToast.dataset.isBonusToast = 'true';
                return;
            }
        }

        if (gameSync) {
            if (isHost) {
                const _nextTile = _hostDrawAndSend();
                if (_nextTile) turnManager.receiveYourTurn(_nextTile.id);
                gameSync.syncTurnEnd(false, _nextTile?.id ?? null);
            } else {
                gameSync.syncTurnEndRequest(false);
            }
        }

        updateTurnDisplay();
    };

    // Recentrer
    document.getElementById('recenter-btn').onclick = () => {
        const container      = document.getElementById('board-container');
        container.scrollLeft = 10400 - container.clientWidth  / 2;
        container.scrollTop  = 10400 - container.clientHeight / 2;
    };

    // Highlight + centrage de la dernière tuile posée
    document.getElementById('highlight-tile-btn').onclick = () => {
        if (!lastPlacedTile) return;
        const { x, y } = lastPlacedTile;

        const container  = document.getElementById('board-container');
        const CELL        = 208;
        const level       = navigationManager ? navigationManager.zoomLevel : 1;
        const boardCenter = 10400; // 50 * 208
        // Avec transform-origin: center, la tuile est décalée depuis le centre du board
        const tileCX = (x - 1) * CELL + CELL / 2; // centre tuile en px non-zoomés
        const tileCY = (y - 1) * CELL + CELL / 2;
        container.scrollLeft = boardCenter + (tileCX - boardCenter) * level - container.clientWidth  / 2;
        container.scrollTop  = boardCenter + (tileCY - boardCenter) * level - container.clientHeight / 2;

        // Flash visuel
        const el = document.querySelector(`.tile[data-pos="${x},${y}"]`);
        if (!el) return;
        el.classList.add('tile-highlight');
        setTimeout(() => el.classList.remove('tile-highlight'), 3000);
    };

    // ── Menu bouton ────────────────────────────────────────────────────────
    function _closeMenu() {
        const popover = document.getElementById('game-menu-popover');
        if (popover) popover.style.display = 'none';
    }

    // Fermer au clic extérieur
    document.addEventListener('click', (e) => {
        const popover = document.getElementById('game-menu-popover');
        const menuBtn = document.getElementById('menu-btn');
        if (popover && popover.style.display !== 'none' && !popover.contains(e.target) && e.target !== menuBtn) {
            popover.style.display = 'none';
        }
    });

    // Copier le code depuis le menu
    document.getElementById('menu-copy-code-btn').addEventListener('click', () => {
        if (!gameCode) return;
        navigator.clipboard.writeText(gameCode).then(() => {
            const btn = document.getElementById('menu-copy-code-btn');
            btn.textContent = '✅ Copié !';
            setTimeout(() => { btn.textContent = '📋 Copier'; }, 2000);
        });
    });

    // Retour au lobby (dans le menu)
    document.getElementById('back-to-lobby-btn').onclick = () => {
        _closeMenu();
        if (confirm('Retourner au lobby ? (La partie sera terminée mais les joueurs resteront connectés)')) {
            returnToLobby();
        }
    };

    // Quitter la partie (invité uniquement)
    const _menuLeaveBtn = document.getElementById('menu-leave-btn');
    if (_menuLeaveBtn) _menuLeaveBtn.onclick = () => {
        _closeMenu();
        if (confirm('Voulez-vous vraiment quitter la partie ?')) {
            // Neutraliser tous les handlers de déconnexion AVANT de couper
            multiplayer.onHostDisconnected = null;
            multiplayer.onPlayerLeft = null;
            _stopAutoReconnect();
            _hideReconnectOverlay();
            const hostId = players.find(p => p.isHost)?.id;
            if (hostId) multiplayer.sendTo(hostId, { type: 'leave-game' });
            returnToInitialLobby();
        }
    };

    // Fermer modale scores finaux
    document.getElementById('close-final-scores-btn').onclick = () => {
        document.getElementById('final-scores-modal').style.display = 'none';
    };

    // Confirmer tuile implaçable
    document.getElementById('unplaceable-confirm-btn').onclick = () => {
        if (!unplaceableManager || !tuileEnMain) return;

        if (isHost) {
            // Hôte : gère le deck + affichage local + broadcast
            const result = unplaceableManager.handleConfirm(tuileEnMain, gameSync);
            if (tilePreviewUI) tilePreviewUI.showBackside(); // toujours afficher verso
            if (!result) {
                // Cas chain-destroy (toutes rivières implaçables) : setRedrawMode déjà appelé
                // dans _checkRiverAllImplacable, mais waitingToRedraw doit être set ici aussi
                waitingToRedraw = true;
                updateTurnDisplay();
                return;
            }
            if (!result.special) {
                // Cas normal : afficher modale active + setRedrawMode
                unplaceableManager.showTileDestroyedModal(result.tileId, result.playerName, true, result.action, result.isRiver);
                gameSync.syncTileDestroyed(result.tileId, result.playerName, result.action, 1, multiplayer.playerId);
                waitingToRedraw = true;
                updateTurnDisplay();
            } else {
                // Cas special (river-12 détruite) : aussi besoin de repiocher
                waitingToRedraw = true;
                updateTurnDisplay();
            }
        } else {
            // Invité : délègue à l'hôte
            const _tileId = tuileEnMain.id;
            unplaceableManager.hideUnplaceableBadge();
            if (tilePreviewUI) tilePreviewUI.showBackside();
            tuileEnMain = null;
            waitingToRedraw = true;
            updateTurnDisplay();
            if (gameSync) gameSync.syncUnplaceableConfirm(_tileId);
        }
    };

    // Examiner le plateau (ferme la modale implaçable)
    document.getElementById('unplaceable-examine-btn').onclick = () => {
        document.getElementById('unplaceable-modal').style.display = 'none';
    };

    // OK modale info destruction
    document.getElementById('tile-destroyed-ok-btn').onclick = () => {
        document.getElementById('tile-destroyed-modal').style.display = 'none';
        updateTurnDisplay(); // rafraîchit le bouton → "Repiocher" si waitingToRedraw && isMyTurn
    };

    // Bouton debug
    document.getElementById('test-modal-btn').onclick = () => {
        if (finalScoresManager) finalScoresManager.showDebugModal();
    };

    // Annuler le coup
    document.getElementById('undo-btn').addEventListener('click', () => {
        // Pendant la phase dragon : l'invité peut annuler son propre déplacement
        // même si isMyTurn === false (ce n'est pas son tour de jeu normal)
        const isDragonPhase = !!(gameConfig?.extensions?.dragon && gameState?.dragonPhase?.active);
        const dragonMover   = isDragonPhase ? gameState.players[gameState.dragonPhase.moverIndex] : null;
        const isMyDragonUndo = isDragonPhase && dragonMover?.id === multiplayer.playerId
                               && !!undoManager?.dragonMovePlacedThisTurn;

        if (!isMyTurn && !isMyDragonUndo) return;

        // Invité : déléguer à l'hôte
        if (!isHost) {
            if (gameSync) gameSync.syncUndoRequest();
            return;
        }
        if (!undoManager || !undoManager.canUndo()) { alert('Rien à annuler'); return; }

        const undoneAction = undoManager.undo(placedMeeples);
        if (!undoneAction) return;

        // Si l'undo annule un meeple portail, restaurer _pendingPortalTile dans gameState
        // AVANT de construire postUndoState (sinon il serait null dans le payload invité)
        if (undoneAction.type === 'meeple' && undoManager.afterTilePlacedSnapshot?.pendingPortalTile !== undefined) {
            gameState._pendingPortalTile = undoManager.afterTilePlacedSnapshot.pendingPortalTile;
        }

        // Enrichir avec l'état post-undo pour que les invités puissent reconstruire
        undoneAction.postUndoState = {
            placedTileKeys:    Object.keys(plateau.placedTiles),
            zones:             zoneMerger.registry.serialize(),
            tileToZone:        Array.from(zoneMerger.tileToZone.entries()),
            placedMeeples:     JSON.parse(JSON.stringify(placedMeeples)),
            playerMeeples:     gameState.players.map(p => ({
                id: p.id, meeples: p.meeples,
                hasAbbot: p.hasAbbot, hasLargeMeeple: p.hasLargeMeeple,
                hasBuilder: p.hasBuilder, hasPig: p.hasPig
            })),
            fairyState:        JSON.parse(JSON.stringify(gameState.fairyState ?? { ownerId: null, meepleKey: null })),
            dragonPos:         JSON.parse(JSON.stringify(gameState.dragonPos ?? null)),
            dragonPhase:       JSON.parse(JSON.stringify(gameState.dragonPhase ?? {})),
            pendingPortalTile: gameState._pendingPortalTile
                ? JSON.parse(JSON.stringify(gameState._pendingPortalTile))
                : null
        };

        undoManager.applyLocally(undoneAction);

        if (gameSync) gameSync.syncUndo(undoneAction);
        gameState.players.forEach(p => eventBus.emit('meeple-count-updated', { playerId: p.id }));
        eventBus.emit('score-updated');
        updateTurnDisplay();
        updateMobileTilePreview();
        scorePanelUI?.updateMobile();
        updateMobileButtons();
    });

    // Tuiles restantes
    document.getElementById('menu-remaining-btn').addEventListener('click', () => {
        _closeMenu();
        if (!deck) { alert('Aucune partie en cours'); return; }
        modalUI.showRemainingTiles(deck.getRemainingTilesByType(), deck.remaining());
    });

    // Règles de la partie
    document.getElementById('menu-rules-btn').addEventListener('click', () => {
        _closeMenu();
        if (!gameConfig) { alert('Aucune partie en cours'); return; }
        modalUI.showGameRules(gameConfig);
    });

    // ── Boutons MOBILE ─────────────────────────────────────────────────────

    if (isMobile()) {
        // Rotation tuile mobile (tap sur la preview)
        document.getElementById('mobile-tile-preview').addEventListener('touchend', (e) => {
            e.preventDefault();
            if (!isMyTurn) return;
            if (!tuileEnMain || tuilePosee) return;
            const nextRot = (tuileEnMain.rotation + 90) % 360;
            if (gameSync && !isHost) {
                // ✅ Étape 1 : invité purement réactif
                gameSync.syncTileRotation(nextRot);
            } else {
                tuileEnMain.rotation = nextRot;
                updateMobileTilePreview();
                eventBus.emit('tile-rotated', { rotation: nextRot });
                if (gameSync) gameSync.syncTileRotation(nextRot);
            }
        }, { passive: false });

        // ✅ Sur mobile, utiliser touchend au lieu de click
        // car touchend est parfois consommé par le board-container et ne génère pas de click
        const mobileBtn = (id, fn) => {
            const el = document.getElementById(id);
            if (!el) return;
            // touchstart vide nécessaire pour que :active CSS fonctionne sur iOS
            el.addEventListener('touchstart', () => {}, { passive: true });
            el.addEventListener('touchend', (e) => {
                e.preventDefault();
                e.stopPropagation();
                fn();
                // Forcer le retrait de l'état actif après l'action
                el.blur();
            }, { passive: false });
        };

        mobileBtn('mobile-end-turn-btn', () => {
            const btn = document.getElementById('end-turn-btn');
            if (btn?.onclick) btn.onclick();
        });
        mobileBtn('mobile-undo-btn', () => {
            document.getElementById('undo-btn').dispatchEvent(new MouseEvent('click'));
        });
        mobileBtn('mobile-recenter-btn', () => {
            document.getElementById('recenter-btn').click();
        });
        mobileBtn('mobile-highlight-btn', () => {
            document.getElementById('highlight-tile-btn').click();
        });


        // Rotation tuile : déjà sur touchend via click — garder tel quel

    }

    // Bouton menu mobile (···)
    const _mobileMenuEl = document.getElementById('mobile-menu-btn');
    if (_mobileMenuEl) {
        _mobileMenuEl.addEventListener('touchstart', () => {}, { passive: true });
        _mobileMenuEl.addEventListener('touchend', (e) => {
            e.preventDefault();
            e.stopPropagation();
            _openCloseMenu(_mobileMenuEl);
        }, { passive: false });
    }

    eventListenersInstalled = true;
    console.log('✅ Event listeners installés');
}

// ═══════════════════════════════════════════════════════
// RETOUR AU LOBBY
// ═══════════════════════════════════════════════════════
function returnToInitialLobby(message = null) {
    console.log('🔙 Retour au lobby initial...');

    // Si une partie est en cours, faire d'abord le cleanup complet
    if (turnManager) {
        returnToLobby();
    }

    _stopAutoReconnect();
    window._isAutoReconnecting = false; // forcer le reset même si reconnectionManager est déjà null
    stopGameTimer();

    // Réinitialiser l'état
    players      = [];
    inLobby      = false;
    isHost       = false;
    gameCode     = '';

    // Cacher le code de partie
    const gameCodeContainer = document.getElementById('game-code-container');
    if (gameCodeContainer) gameCodeContainer.style.display = 'none';

    // Couper immédiatement tout message entrant
    multiplayer.onDataReceived = null;

    // Réinitialiser et afficher le lobby
    lobbyUI.setIsHost(false);
    lobbyUI.setPlayers([]);
    lobbyUI.reset();
    lobbyUI.show();
    updateLobbyUI();

    // Fermer la connexion PeerJS après la mise à jour UI
    if (multiplayer?.peer) {
        setTimeout(() => multiplayer.peer.destroy(), 100);
    }

    if (message) {
        setTimeout(() => alert(message), 200);
    }

    console.log('✅ Retour au lobby initial terminé');
}

function returnToLobby() {
    console.log('🔙 Retour au lobby...');
    _stopAutoReconnect();
    stopGameTimer();
    ['game-timer', 'mobile-game-timer'].forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.textContent = '⏱ 00:00'; el.style.display = 'none'; }
    });

    // Nettoyer les overlays dragon/princesse
    clearDragonCursors();
    document.querySelectorAll('.princess-cursor').forEach(el => el.remove());
    const dragonOverlay = document.getElementById('dragon-phase-overlay');
    if (dragonOverlay) dragonOverlay.style.display = 'none';
    document.getElementById('dragon-piece')?.remove();

    if (isHost && multiplayer.peer?.open) {
        // ✅ Inclure la liste propre pour que les invités ne voient pas les déconnectés
        multiplayer.broadcast({ type: 'return-to-lobby', players });
    }

    document.getElementById('back-to-lobby-btn').style.display = 'none';

    // Reset pause/reconnexion
    if (reconnectionManager) { reconnectionManager.destroy(); reconnectionManager = null; }

    // Restaurer tous les boutons masqués pour le mode spectateur
    ['end-turn-btn', 'undo-btn', 'mobile-end-turn-btn', 'mobile-undo-btn'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = '';
    });
    const tileTitle = document.querySelector('#current-tile-container h3');
    if (tileTitle) tileTitle.style.display = '';

    if (unplaceableManager) unplaceableManager.hideUnplaceableBadge();
    document.getElementById('tile-destroyed-modal').style.display = 'none';

    // Détruire les modules UI
    [tilePreviewUI, slotsUI, meepleCursorsUI, meepleSelectorUI, meepleDisplayUI, scorePanelUI, undoManager]
        .forEach(m => { if (m?.destroy) m.destroy(); });

    tilePreviewUI  = null; slotsUI        = null; meepleCursorsUI  = null;
    meepleSelectorUI = null; meepleDisplayUI = null; scorePanelUI     = null;
    undoManager    = null;

    gameSync         = null;
    zoneMerger       = null;
    scoring          = null;
    tilePlacement    = null;
    meeplePlacement  = null;
    turnManager      = null;
    unplaceableManager = null;
    finalScoresManager = null;
    waitingToRedraw  = false;
    pendingAbbePoints = null;

    ruleRegistry.disable('base');
    ruleRegistry.disable('abbot');   // no-op si non enregistré
    ruleRegistry.disable('inns');     // no-op si non enregistré
    ruleRegistry.disable('builders'); // no-op si non enregistré

    deck.tiles = []; deck.currentIndex = 0; deck.totalTiles = 0;
    plateau.reset();

    gameState      = null;
    tuileEnMain    = null;
    tuilePosee     = false;
    firstTilePlaced = false;
    placedMeeples  = {};
    lastPlacedTile = null;
    isMyTurn       = false;

    document.getElementById('final-scores-modal').style.display = 'none';
    document.getElementById('board').innerHTML = '';

    // ✅ Remettre le zoom et le scroll à zéro pour la prochaine partie
    const boardEl = document.getElementById('board');
    const containerEl = document.getElementById('board-container');
    if (boardEl) boardEl.style.transform = '';
    if (containerEl) { containerEl.scrollLeft = 0; containerEl.scrollTop = 0; }
    zoomLevel = 1;
    if (navigationManager) { navigationManager.destroy(); navigationManager = null; }

    // Relancer le heartbeat lobby avec le bon handler de timeout
    // On initialise _lastPong avec les peers déjà connus pour éviter un faux timeout
    const _existingPeers = new Set(multiplayer._connectedPeers);
    if (heartbeatManager) { heartbeatManager.stop(); heartbeatManager = null; }

    _startHeartbeat((peerId) => {
        players = players.filter(p => p.id !== peerId);
        lobbyUI.setPlayers(players);
        multiplayer.broadcast({ type: 'players-update', players });
    });
    // Initialiser tous les peers existants à now pour éviter timeout immédiat
    _existingPeers.forEach(peerId => {
        if (heartbeatManager) heartbeatManager._lastPong[peerId] = Date.now();
    });

    multiplayer.onPlayerJoined = (playerId) => {
        console.log('👤 Nouveau joueur connecté (lobby post-retour):', playerId);
        if (heartbeatManager) heartbeatManager._lastPong[playerId] = Date.now();
    };

    // ✅ Retrait immédiat si un invité déconnecte dans le lobby post-retour
    multiplayer.onPlayerLeft = (peerId) => {
        console.log('👋 [LOBBY post-retour] Joueur déconnecté:', peerId);
        players = players.filter(p => p.id !== peerId);
        lobbyUI.setPlayers(players);
        multiplayer.broadcast({ type: 'players-update', players });
    };

    // Restaurer onDataReceived au lobbyHandler hôte
    if (isHost) {
        multiplayer.onDataReceived = multiplayer._lobbyHostHandler ?? null;
    } else if (originalLobbyHandler) {
        multiplayer.onDataReceived = originalLobbyHandler;
    }

    lobbyUI.show();
    lobbyUI.reset();

    // ✅ Restaurer isHost et les callbacks après reset()
    if (isHost) {
        lobbyUI.setIsHost(true);
        lobbyUI.onKickPlayer = (playerId) => {
            multiplayer.sendTo(playerId, { type: 'you-are-kicked' });
            players = players.filter(p => p.id !== playerId);
            lobbyUI.setPlayers(players);
            multiplayer.broadcast({ type: 'players-update', players });
        };
        lobbyUI.onHostLeave = () => {
            const invites = players.filter(p => !p.isHost);
            if (invites.length > 0) multiplayer.broadcast({ type: 'you-are-kicked' });
            returnToInitialLobby();
        };
    } else {
        lobbyUI.setIsHost(false);
        lobbyUI.onLeaveGame = () => {
            multiplayer.broadcast({ type: 'player-left' });
            returnToInitialLobby();
        };
    }

    lobbyUI.setPlayers(players);
    updateLobbyUI();

    // Synchroniser le sélecteur de couleur avec playerColor actuel
    // (peut être 'spectator' si le joueur revenait en spec depuis la partie)
    if (!isHost) lobbyUI.selectColor(playerColor);

    console.log('✅ Retour au lobby terminé');
}

// ═══════════════════════════════════════════════════════
// NAVIGATION (zoom + drag)
// ═══════════════════════════════════════════════════════
function setupNavigation(container, board) {
    if (navigationManager) return; // déjà initialisé
    navigationManager = new NavigationManager(container, board, { isMobile });
    navigationManager.init();
    // Synchroniser la variable globale zoomLevel (utilisée ailleurs)
    Object.defineProperty(window, '_zoomLevelProxy', {
        get: () => navigationManager.zoomLevel,
        configurable: true,
    });
}

// ═══════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════
// Initialiser les options du lobby (listeners, presets, localStorage)
initLobbyOptions({
    getIsHost:  () => isHost,
    getInLobby: () => inLobby,
    multiplayer,
});
lobbyUI.init();
console.log('Page chargée');
