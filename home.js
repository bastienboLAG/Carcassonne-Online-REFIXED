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
import { TurnManager }            from './modules/game/TurnManager.js';
import { UndoManager }            from './modules/game/UndoManager.js';
import { TilePlacement }          from './modules/game/TilePlacement.js';
import { MeeplePlacement }        from './modules/game/MeeplePlacement.js';
import { GameSyncCallbacks }      from './modules/game/GameSyncCallbacks.js';
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
let gameTimerInterval  = null;
let gameTimerStart     = null;

// ── Reconnexion / Pause ──────────────────────────────────────────────────────
const PAUSE_TIMEOUT_MS = 60_000;  // 1 min (tests) → 3 min (prod)
let gamePaused         = false;
const _voluntaryLeaves = new Set(); // peerIds ayant quitté volontairement (leave-game)
let pauseTimerInterval = null;
let pauseTimerEnd      = null;

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
let zoomManager = null; // instance ZoomManager
let heartbeatManager = null;
let _navigationSetup = false;
let isDragging = false, startX = 0, startY = 0, scrollLeft = 0, scrollTop = 0;

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

    if (tilePreviewUI) tilePreviewUI.showTile(tuileEnMain);
    updateMobileTilePreview();

    // Snapshot + reset builder : au début de notre propre tour (local ou via your-turn réseau)
    const isOwnTurnStart = !data.fromUndo && (!data.fromNetwork || data.fromYourTurn);
    // Nouveau tour — effacer le pending princesse du tour précédent
    if (isOwnTurnStart && gameState) gameState._pendingPrincessTile = null;
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
    _hideAllCursors();
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
    const _isVolcanoTileOwn = !!(gameConfig?.tileGroups?.dragon && gameConfig?.extensions?.dragon && _tileHasVolcanoZone(tile));

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

    if (meepleCursorsUI && !undoManager?.abbeRecalledThisTurn) {
        if (!_isVolcanoTileOwn) {
            meepleCursorsUI.showCursors(x, y, gameState, placedMeeples, afficherSelecteurMeeple);
        }
        _showMeepleActionCursors();
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
    if (gameSync && data.playerId === multiplayer.playerId) {
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
    _renderDragonPiece(data.x, data.y);
});

eventBus.on('dragon-phase-ended', () => {
    _renderDragonPiece(gameState?.dragonPos?.x, gameState?.dragonPos?.y);
});

// ── Extension Fée : affichage pion fée ───────────────────────────────
eventBus.on('fairy-placed', (data) => {
    _renderFairyPiece(data.meepleKey);
});

eventBus.on('fairy-removed', () => {
    _removeFairyPiece();
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

function updateColorPickerVisibility() {
    document.querySelector('.color-picker').style.display = inLobby ? 'block' : 'none';
}

function updateOptionsAccess() {
    const configInputs  = document.querySelectorAll('.home-right input');
    const configLabels  = document.querySelectorAll('.home-right label');
    const startButton   = document.getElementById('start-game-btn');
    const restricted    = inLobby && !isHost;

    configInputs.forEach(input => { input.disabled = restricted; });
    configLabels.forEach(label => {
        label.style.opacity       = restricted ? '0.5' : '1';
        label.style.pointerEvents = restricted ? 'none' : 'auto';
    });

    if (startButton) {
        startButton.style.pointerEvents = restricted ? 'none' : 'auto';
        startButton.style.opacity       = restricted ? '0.5' : '1';
        startButton.textContent         = restricted ? "En attente de l'hôte..." : 'Démarrer la partie';
    }
}

function updateLobbyUI() {
    const createBtn = document.getElementById('create-game-btn');
    const joinBtn   = document.getElementById('join-game-btn');
    createBtn.style.display = inLobby ? 'none' : 'block';
    joinBtn.style.display   = inLobby ? 'none' : 'block';
    updateColorPickerVisibility();
    updateOptionsAccess();
    if (window.updatePresetButtons) window.updatePresetButtons();
}

// ═══════════════════════════════════════════════════════
// PRESETS & LOCALSTORAGE
// ═══════════════════════════════════════════════════════

const LS_KEY = 'carcassonne_lobby_options';

function applyPreset(preset) {
    // Départ
    const startRadio = document.querySelector(`input[name="start"][value="${preset.start ?? 'unique'}"]`);
    if (startRadio) startRadio.checked = true;

    // Checkboxes
    const map = {
        'play_fields':       'base-fields',
        'show_remaining':    'list-remaining',
        'test_deck':         'use-test-deck',
        'debug':             'enable-debug',
        'abbot_extension':       'ext-abbot',
        'abbot_tiles':           'tiles-abbot',
        'large_meeple':          'ext-large-meeple',
        'cathedrals_extension':  'ext-cathedrals',
        'inns_extension':        'ext-inns',
        'inns_cathedrals_tiles': 'tiles-inns-cathedrals',
        'traders_builders_tiles': 'tiles-traders-builders',
        'ext_builder':           'ext-builder',
        'ext_merchants':         'ext-merchants',
        'ext_pig':               'ext-pig',
        // Dragon & Fée
        'tiles_dragon':          'tiles-dragon',
        'ext_dragon':            'ext-dragon',
        'ext_princess':          'ext-princess',
        'ext_portal':            'ext-portal',
        'ext_fairy_protection':  'ext-fairy-protection',
        'ext_fairy_score_turn':  'ext-fairy-score-turn',
        'ext_fairy_score_zone':  'ext-fairy-score-zone',
    };
    for (const [key, id] of Object.entries(map)) {
        if (preset[key] !== undefined) {
            const el = document.getElementById(id);
            if (el) el.checked = preset[key];
        }
    }

    // Tuile implaçable
    if (preset.unplaceable !== undefined) {
        const radio = document.querySelector(`input[name="unplaceable"][value="${preset.unplaceable}"]`);
        if (radio) radio.checked = true;
    }

    // Mettre à jour les coches maîtres selon l'état des enfants
    document.querySelectorAll('.ext-master').forEach(m => { if (m.id) _updateMasterCheckboxSafe(m.id); });

    // Appliquer les contraintes de dépendance
    _updatePigAvailability();
    _updateInnsCthdAvailability();
    _updateDragonAvailability();

    saveLobbyOptions();
}

function saveLobbyOptions() {
    const state = {
        start:           document.querySelector('input[name="start"]:checked')?.value ?? 'unique',
        play_fields:     document.getElementById('base-fields')?.checked ?? true,
        show_remaining:  document.getElementById('list-remaining')?.checked ?? true,
        test_deck:       document.getElementById('use-test-deck')?.checked ?? false,
        debug:           document.getElementById('enable-debug')?.checked ?? false,
        abbot_extension:         document.getElementById('ext-abbot')?.checked              ?? false,
        abbot_tiles:             document.getElementById('tiles-abbot')?.checked            ?? false,
        large_meeple:            document.getElementById('ext-large-meeple')?.checked       ?? false,
        cathedrals_extension:    document.getElementById('ext-cathedrals')?.checked         ?? true,
        inns_extension:          document.getElementById('ext-inns')?.checked               ?? true,
        inns_cathedrals_tiles:    document.getElementById('tiles-inns-cathedrals')?.checked   ?? false,
        traders_builders_tiles:   document.getElementById('tiles-traders-builders')?.checked  ?? false,
        ext_builder:              document.getElementById('ext-builder')?.checked             ?? false,
        ext_merchants:            document.getElementById('ext-merchants')?.checked           ?? false,
        ext_pig:                  document.getElementById('ext-pig')?.checked               ?? false,
        tiles_dragon:             document.getElementById('tiles-dragon')?.checked           ?? false,
        ext_dragon:               document.getElementById('ext-dragon')?.checked              ?? false,
        ext_princess:             document.getElementById('ext-princess')?.checked            ?? false,
        ext_portal:               document.getElementById('ext-portal')?.checked              ?? false,
        ext_fairy_protection:     document.getElementById('ext-fairy-protection')?.checked     ?? false,
        ext_fairy_score_turn:     document.getElementById('ext-fairy-score-turn')?.checked     ?? false,
        ext_fairy_score_zone:     document.getElementById('ext-fairy-score-zone')?.checked     ?? false,
        unplaceable:     document.querySelector('input[name="unplaceable"]:checked')?.value ?? 'reshuffle',
    };
    localStorage.setItem(LS_KEY, JSON.stringify(state));
}

function loadLobbyOptions() {
    try {
        const saved = localStorage.getItem(LS_KEY);
        if (saved) applyPreset(JSON.parse(saved));
    } catch (e) {
        console.warn('⚠️ Impossible de restaurer les options:', e);
    }
    // Mettre à jour les coches maîtres après restauration
    // (MASTER_IDS peut ne pas être défini encore à ce stade, on utilise querySelectorAll)
    document.querySelectorAll('.ext-master').forEach(master => {
        if (master.id) _updateMasterCheckboxSafe(master.id);
    });
}

// Version sécurisée appelable avant que MASTER_IDS soit défini
function _updateMasterCheckboxSafe(masterId) {
    const master   = document.getElementById(masterId);
    if (!master) return;
    const children = [...document.querySelectorAll(`input[data-group="${masterId}"]`)]
        .filter(el => !el.disabled);
    if (children.length === 0) return;
    const checkedCount = children.filter(c => c.checked).length;
    if (checkedCount === 0) {
        master.checked = false; master.indeterminate = false;
    } else if (checkedCount === children.length) {
        master.checked = true;  master.indeterminate = false;
    } else {
        master.checked = false; master.indeterminate = true;
    }
}

async function loadPresets() {
    const container = document.getElementById('presets-buttons');
    if (!container) return;

    const presets = [];
    let i = 1;
    while (true) {
        const id = String(i).padStart(2, '0');
        try {
            const res = await fetch(`./data/Presets/${id}.json`);
            if (!res.ok) break;
            const data = await res.json();
            presets.push(data);
            i++;
        } catch (e) {
            break;
        }
    }

    presets.forEach(preset => {
        const btn = document.createElement('button');
        btn.className = 'preset-btn';
        btn.textContent = preset.name ?? `Préset ${i}`;
        btn.addEventListener('click', () => {
            if (!isHost && inLobby) return; // invité ne peut pas changer les presets
            applyPreset(preset);
            container.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            if (isHost && inLobby) syncAllOptions();
        });
        container.appendChild(btn);
    });

    // Mettre à jour l'apparence des boutons selon le rôle
    window.updatePresetButtons = () => {
        container.querySelectorAll('.preset-btn').forEach(btn => {
            btn.disabled = inLobby && !isHost;
            btn.style.opacity = (inLobby && !isHost) ? '0.4' : '1';
            btn.style.cursor  = (inLobby && !isHost) ? 'not-allowed' : 'pointer';
        });
    };

    if (presets.length === 0) {
        container.closest('.config-section').style.display = 'none';
    }
}

function syncAllOptions() {
    const options = {
        'base-fields':    document.getElementById('base-fields')?.checked ?? true,
        'list-remaining': document.getElementById('list-remaining')?.checked ?? true,
        'use-test-deck':  document.getElementById('use-test-deck')?.checked ?? false,
        'enable-debug':   document.getElementById('enable-debug')?.checked ?? false,
        'ext-abbot':               document.getElementById('ext-abbot')?.checked              ?? false,
        'tiles-abbot':             document.getElementById('tiles-abbot')?.checked            ?? false,
        'ext-large-meeple':        document.getElementById('ext-large-meeple')?.checked       ?? false,
        'ext-cathedrals':            document.getElementById('ext-cathedrals')?.checked           ?? true,
        'ext-inns':                  document.getElementById('ext-inns')?.checked               ?? true,
        'tiles-inns-cathedrals':     document.getElementById('tiles-inns-cathedrals')?.checked  ?? false,
        'tiles-traders-builders':    document.getElementById('tiles-traders-builders')?.checked ?? false,
        'ext-builder':               document.getElementById('ext-builder')?.checked            ?? false,
        'ext-merchants':             document.getElementById('ext-merchants')?.checked          ?? false,
        'ext-pig':                   document.getElementById('ext-pig')?.checked              ?? false,
        'tiles-dragon':              document.getElementById('tiles-dragon')?.checked          ?? false,
        'ext-dragon':                document.getElementById('ext-dragon')?.checked              ?? false,
        'ext-princess':              document.getElementById('ext-princess')?.checked            ?? false,
        'ext-portal':                document.getElementById('ext-portal')?.checked              ?? false,
        'ext-fairy-protection':      document.getElementById('ext-fairy-protection')?.checked     ?? false,
        'ext-fairy-score-turn':      document.getElementById('ext-fairy-score-turn')?.checked     ?? false,
        'ext-fairy-score-zone':      document.getElementById('ext-fairy-score-zone')?.checked     ?? false,
        'unplaceable':    document.querySelector('input[name="unplaceable"]:checked')?.value ?? 'reshuffle',
        'start':          document.querySelector('input[name="start"]:checked')?.value ?? 'unique',
    };
    multiplayer.broadcast({ type: 'options-sync', options });
}

// Sauvegarder les options à chaque changement manuel
document.querySelectorAll(
    '#base-fields, #list-remaining, #use-test-deck, #enable-debug, #ext-abbot, #tiles-abbot, #ext-large-meeple, #ext-cathedrals, #ext-inns, #tiles-inns-cathedrals, #tiles-traders-builders, #ext-builder, #ext-merchants, #ext-pig, #tiles-dragon, #ext-dragon, #ext-princess, #ext-portal, #ext-fairy-protection, #ext-fairy-score-turn, #ext-fairy-score-zone'
).forEach(el => el.addEventListener('change', saveLobbyOptions));
document.querySelectorAll('input[name="unplaceable"], input[name="start"]')
    .forEach(el => el.addEventListener('change', saveLobbyOptions));

// Charger presets et options sauvegardées au démarrage
loadLobbyOptions();
loadPresets();

// Liaison base-fields <-> ext-pig : si champs désactivés, cochon désactivé et grisé
function _updatePigAvailability() {
    const fieldsOn = document.getElementById('base-fields')?.checked ?? true;
    const pigLabel = document.getElementById('ext-pig-label');
    const pigCb    = document.getElementById('ext-pig');
    if (!pigLabel || !pigCb) return;
    if (!fieldsOn) {
        pigCb.checked  = false;
        pigCb.disabled = true;
        pigLabel.style.opacity       = '0.4';
        pigLabel.style.pointerEvents = 'none';
    } else {
        pigCb.disabled = false;
        pigLabel.style.opacity       = '';
        pigLabel.style.pointerEvents = '';
    }
    // Mettre à jour la coche maître (pig disabled = exclu du calcul)
    _updateMasterCheckboxSafe('all-traders-builders');
    saveLobbyOptions();
}
document.getElementById('base-fields')?.addEventListener('change', _updatePigAvailability);
_updatePigAvailability(); // état initial

// Liaison tiles-traders-builders <-> ext-merchants
function _updateMerchantsAvailability() {
    const tilesOn = document.getElementById('tiles-traders-builders')?.checked ?? false;
    const label   = document.getElementById('ext-merchants')?.closest('label');
    const cb      = document.getElementById('ext-merchants');
    if (!cb) return;
    if (!tilesOn) {
        cb.checked = false; cb.disabled = true;
        if (label) { label.style.opacity = '0.4'; label.style.pointerEvents = 'none'; }
    } else {
        cb.disabled = false;
        if (label) { label.style.opacity = ''; label.style.pointerEvents = ''; }
    }
    _updateMasterCheckboxSafe('all-traders-builders');
    saveLobbyOptions();
}
document.getElementById('tiles-traders-builders')?.addEventListener('change', _updateMerchantsAvailability);
_updateMerchantsAvailability();

// Liaison tiles-inns-cathedrals <-> ext-cathedrals et ext-inns
function _updateInnsCthdAvailability() {
    const tilesOn = document.getElementById('tiles-inns-cathedrals')?.checked ?? false;
    [
        { id: 'ext-cathedrals' },
        { id: 'ext-inns'       }
    ].forEach(({ id }) => {
        const cb    = document.getElementById(id);
        const label = cb?.closest('label');
        if (!cb) return;
        if (!tilesOn) {
            cb.checked = false; cb.disabled = true;
            if (label) { label.style.opacity = '0.4'; label.style.pointerEvents = 'none'; }
        } else {
            cb.disabled = false;
            if (label) { label.style.opacity = ''; label.style.pointerEvents = ''; }
        }
    });
    _updateMasterCheckboxSafe('all-inns-cathedrals');
    saveLobbyOptions();
}
document.getElementById('tiles-inns-cathedrals')?.addEventListener('change', _updateInnsCthdAvailability);
_updateInnsCthdAvailability();

// Liaisons options Dragon :
// - tiles-dragon off → tout désactive
// - ext-dragon off → ext-fairy-protection désactivé
// - fairyScoreTurn et fairyScoreZone sont indépendants (sauf tiles-dragon off)
function _updateDragonAvailability() {
    const tilesOn  = document.getElementById('tiles-dragon')?.checked ?? false;
    const dragonOn = tilesOn && (document.getElementById('ext-dragon')?.checked ?? false);

    // Options qui nécessitent uniquement les tuiles dragon
    ['ext-dragon', 'ext-princess', 'ext-portal'].forEach(id => {
        const cb = document.getElementById(id);
        const label = cb?.closest('label');
        if (!cb) return;
        if (!tilesOn) {
            cb.checked = false; cb.disabled = true;
            if (label) { label.style.opacity = '0.4'; label.style.pointerEvents = 'none'; }
        } else {
            cb.disabled = false;
            if (label) { label.style.opacity = ''; label.style.pointerEvents = ''; }
        }
    });

    // Protection fée : nécessite l'extension dragon
    const fairyCb = document.getElementById('ext-fairy-protection');
    const fairyLabel = fairyCb?.closest('label');
    if (fairyCb) {
        if (!dragonOn) {
            fairyCb.checked = false; fairyCb.disabled = true;
            if (fairyLabel) { fairyLabel.style.opacity = '0.4'; fairyLabel.style.pointerEvents = 'none'; }
        } else {
            fairyCb.disabled = false;
            if (fairyLabel) { fairyLabel.style.opacity = ''; fairyLabel.style.pointerEvents = ''; }
        }
    }

    // fairyScoreTurn et fairyScoreZone : totalement indépendants, jamais bloqués par les tuiles
    // (on peut utiliser la fée même sans tuiles dragon)

    _updateMasterCheckboxSafe('all-dragon');
    saveLobbyOptions();
}
document.getElementById('tiles-dragon')?.addEventListener('change', _updateDragonAvailability);
document.getElementById('ext-dragon')?.addEventListener('change', _updateDragonAvailability);
_updateDragonAvailability();

// ── Coches maîtres (bidirectionnelles) ────────────────────────────────
// Un groupe est défini par data-group="<masterId>" sur chaque coche enfant.
// La coche maître est checked si TOUTES les enfants sont cochées,
// indeterminate si certaines seulement, unchecked sinon.

function _updateMasterCheckbox(masterId) { _updateMasterCheckboxSafe(masterId); }

function _onMasterChange(masterId) {
    const master   = document.getElementById(masterId);
    if (!master) return;
    const children = [...document.querySelectorAll(`input[data-group="${masterId}"]`)]
        .filter(el => !el.disabled);
    children.forEach(c => { c.checked = master.checked; });
    // Ré-appliquer les contraintes de dépendance AVANT de dispatcher les change
    _updatePigAvailability();
    _updateMerchantsAvailability();
    _updateInnsCthdAvailability();
    _updateDragonAvailability();
    // Déclencher les side-effects (saveLobbyOptions, sync)
    children.forEach(c => c.dispatchEvent(new Event('change', { bubbles: true })));
    saveLobbyOptions();
}

// IDs de toutes les coches maîtres
const MASTER_IDS = ['all-base', 'all-abbot', 'all-inns-cathedrals', 'all-traders-builders', 'all-dragon', 'all-tiles'];

// Brancher les coches maîtres
MASTER_IDS.forEach(masterId => {
    const master = document.getElementById(masterId);
    if (!master) return;
    master.addEventListener('click', (e) => {
        // Empêcher le clic de toggle le <details> parent
        e.stopPropagation();
    });
    master.addEventListener('change', (e) => {
        e.stopPropagation();
        _onMasterChange(masterId);
    });
});

// Brancher les coches enfants → mise à jour de la coche maître
document.querySelectorAll('input[data-group]').forEach(child => {
    child.addEventListener('change', () => {
        _updateMasterCheckbox(child.dataset.group);
    });
});

// État initial des coches maîtres
MASTER_IDS.forEach(_updateMasterCheckbox);

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
                    'base-fields':     document.getElementById('base-fields')?.checked     ?? true,
                    'list-remaining':  document.getElementById('list-remaining')?.checked  ?? true,
                    'use-test-deck':   document.getElementById('use-test-deck')?.checked   ?? false,
                    'enable-debug':    document.getElementById('enable-debug')?.checked    ?? false,
                    'unplaceable':     document.querySelector('input[name="unplaceable"]:checked')?.value ?? 'reshuffle',
                    'ext-abbot':               document.getElementById('ext-abbot')?.checked              ?? false,
                    'tiles-abbot':             document.getElementById('tiles-abbot')?.checked            ?? false,
                    'ext-large-meeple':        document.getElementById('ext-large-meeple')?.checked       ?? false,
                    'ext-cathedrals':            document.getElementById('ext-cathedrals')?.checked           ?? true,
                    'ext-inns':                  document.getElementById('ext-inns')?.checked               ?? true,
                    'tiles-inns-cathedrals':     document.getElementById('tiles-inns-cathedrals')?.checked  ?? false,
                    'tiles-traders-builders':    document.getElementById('tiles-traders-builders')?.checked ?? false,
                    'ext-builder':               document.getElementById('ext-builder')?.checked            ?? false,
                    'ext-merchants':             document.getElementById('ext-merchants')?.checked          ?? false,
                    'ext-pig':                   document.getElementById('ext-pig')?.checked              ?? false,
                    'start':           document.querySelector('input[name="start"]:checked')?.value ?? 'unique',
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
            }
            if (data.type === 'options-sync') {
                // ✅ Réception de l'état complet des options
                const opts = data.options;
                ['base-fields', 'list-remaining', 'use-test-deck', 'enable-debug', 'ext-abbot', 'tiles-abbot', 'ext-large-meeple', 'ext-cathedrals', 'ext-inns', 'tiles-inns-cathedrals', 'ext-builder', 'ext-merchants', 'ext-pig', 'tiles-dragon', 'ext-dragon', 'ext-princess', 'ext-portal', 'ext-fairy-protection', 'ext-fairy-score-turn', 'ext-fairy-score-zone'].forEach(id => {
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
                    applyFullStateSync(data);
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
    slotsUI.setSlotClickHandler(poserTuile);
    slotsUI.isMyTurn        = isMyTurn;
    slotsUI.firstTilePlaced = firstTilePlaced;

    tilePreviewUI = new TilePreviewUI(eventBus);
    tilePreviewUI.init();

    zoneMerger = new ZoneMerger(plateau);
    scoring    = new Scoring(zoneMerger, gameConfig);

    tilePlacement  = new TilePlacement(eventBus, plateau, zoneMerger);
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
        gameSync,
        gameState,
        deck,
        turnManager,
        tilePreviewUI,
        meepleDisplayUI,
        undoManager,
        unplaceableManager,
        scoring,
        zoneMerger,
        slotsUI,
        eventBus,
        getPlacedMeeples: () => placedMeeples,
        onRemoteUndo:     handleRemoteUndo,
        onFinalScores:    (scores, destroyedTilesCount = 0) => finalScoresManager.receiveFromNetwork(scores, destroyedTilesCount),
        onTileDestroyed:  (tileId, pName, action, count = 1) => {
            // N'incrémenter que si la tuile est détruite, pas remélangée
            if (action === 'destroy' && gameState) gameState.destroyedTilesCount = (gameState.destroyedTilesCount || 0) + count;
            unplaceableManager.showTileDestroyedModal(tileId, pName, false, action);
        },
        onDeckReshuffled: (tiles, idx) => { deck.tiles = tiles; deck.currentIndex = idx; },
        onAbbeRecalled: (x, y, key, playerId, points) => {
            // Retirer visuellement l'Abbé
            document.querySelectorAll(`.meeple[data-key="${key}"]`).forEach(el => el.remove());
            delete placedMeeples[key];
            _releaseFairyIfDetached(key);
            const player = gameState.players.find(p => p.id === playerId);
            if (player) player.hasAbbot = true;
            // Hôte marque le rappel abbé pour undo centralisé
            if (isHost && undoManager) undoManager.markAbbeRecalled(x, y, key, playerId, points);
            // ✅ PAS de pendingAbbePoints côté invité — les points seront reçus via score-update en fin de tour
            eventBus.emit('meeple-count-updated', { playerId });
            eventBus.emit('score-updated');
            updateTurnDisplay();
        },
        onAbbeRecalledUndo: (x, y, key, playerId) => {
            pendingAbbePoints = null;
            const player = gameState.players.find(p => p.id === playerId);
            if (player) player.hasAbbot = false;
            // Le meeple est déjà dans placedMeeples grâce à la synchro du snapshot
            eventBus.emit('score-updated');
            updateTurnDisplay();
        },
        onBonusTurnStarted: (playerId) => {
            // Un autre joueur démarre son tour bonus — flaguer localement pour le UI
            if (turnManager) turnManager.isBonusTurn = true;
            updateTurnDisplay();
            const player = gameState.players.find(p => p.id === playerId);
            if (player) {
                afficherToast(`⭐ Tour bonus pour ${player.name} !`, 'bonus');
                // Marquer le toast pour fermeture automatique à la fin du tour bonus
                const _bonusToast = document.getElementById('disconnect-toast');
                if (_bonusToast) _bonusToast.dataset.isBonusToast = 'true';
            }
        },
        onUnplaceableHandled: (tileId, pName, action, isRiver, isActivePlayer) => {
            if (action === 'destroy' && gameState) gameState.destroyedTilesCount = (gameState.destroyedTilesCount || 0) + 1;
            unplaceableManager.showTileDestroyedModal(tileId, pName, isActivePlayer, action, isRiver);
            if (isActivePlayer) {
                waitingToRedraw = true;
                updateTurnDisplay();
            }
        },
        updateTurnDisplay,
        poserTuileSync,
        afficherMessage: (msg) => { afficherToast(msg); },
        isHost,
    }).attach(isHost);

    // Callbacks reconnexion (définis après attach car gameSync callbacks obj créé)
    if (gameSync) {
        gameSync.onGamePaused  = (name) => { _showPauseOverlay(name); };
        gameSync.onGameResumed = (reason)   => {
            _hidePauseOverlay();
            if (reason === 'timeout') afficherToast('⏱ Partie reprise (joueur exclu).');
            else afficherToast('✅ Partie reprise !');
        };
        gameSync.onFullStateSync = (data) => { applyFullStateSync(data); };

        // Hôte : traitement d'une demande d'annulation d'un invité
        if (isHost) {
            gameSync.onUndoRequest = (playerId) => {
                console.log('⏪ [HÔTE] Traitement undo-request de:', playerId);
                if (!undoManager || !undoManager.canUndo()) {
                    console.log('⏪ [HÔTE] Rien à annuler');
                    return;
                }
                const undoneAction = undoManager.undo(placedMeeples);
                if (!undoneAction) return;

                // Enrichir undoneAction avec l'état post-undo pour que les invités puissent reconstruire
                undoneAction.postUndoState = {
                    placedTileKeys: Object.keys(plateau.placedTiles),
                    zones:          zoneMerger.registry.serialize(),
                    tileToZone:     Array.from(zoneMerger.tileToZone.entries()),
                    placedMeeples:  JSON.parse(JSON.stringify(placedMeeples)),
                    playerMeeples:  gameState.players.map(p => ({
                        id: p.id, meeples: p.meeples,
                        hasAbbot: p.hasAbbot, hasLargeMeeple: p.hasLargeMeeple,
                        hasBuilder: p.hasBuilder, hasPig: p.hasPig
                    })),
                    fairyState:  JSON.parse(JSON.stringify(gameState.fairyState ?? { ownerId: null, meepleKey: null })),
                    dragonPos:   JSON.parse(JSON.stringify(gameState.dragonPos ?? null)),
                    dragonPhase: JSON.parse(JSON.stringify(gameState.dragonPhase ?? {}))
                };

                // Appliquer visuellement côté hôte
                _applyUndoLocally(undoneAction);

                // Broadcaster à tous
                if (gameSync) gameSync.syncUndo(undoneAction);
                gameState.players.forEach(p => eventBus.emit('meeple-count-updated', { playerId: p.id }));
                eventBus.emit('score-updated');
                updateTurnDisplay();
                updateMobileTilePreview();
                scorePanelUI?.updateMobile();
                updateMobileButtons();
            };
        }

        // Hôte : traitement d'une demande de placement meeple d'un invité
        if (isHost) {
            gameSync.onMeeplePlacedRequest = (x, y, position, meepleType, fromPlayerId) => {
                console.log('🎭 [HÔTE] meeple-placed-request de:', fromPlayerId, x, y, position, meepleType);
                const player = gameState.players.find(p => p.id === fromPlayerId);
                if (!player) return;
                const playerColor = player.color.charAt(0).toUpperCase() + player.color.slice(1);
                const key = `${x},${y},${position}`;

                placedMeeples[key] = { type: meepleType, color: playerColor, playerId: fromPlayerId };

                if (!['Abbot','Large','Large-Farmer','Builder','Pig'].includes(meepleType)) {
                    if (player.meeples > 0) player.meeples--;
                } else if (meepleType === 'Abbot')        { player.hasAbbot = false; }
                else if (meepleType === 'Large' || meepleType === 'Large-Farmer') { player.hasLargeMeeple = false; }
                else if (meepleType === 'Builder')         { player.hasBuilder = false; }
                else if (meepleType === 'Pig')             { player.hasPig = false; }

                if (undoManager) undoManager.markMeeplePlaced(x, y, position, key);

                // Mettre à jour l'affichage du score côté hôte
                eventBus.emit('meeple-count-updated', { playerId: fromPlayerId });

                // Appliquer visuellement côté hôte (broadcast ne revient pas à l'expéditeur)
                if (meepleDisplayUI) meepleDisplayUI.showMeeple(x, y, position, meepleType, playerColor);

                gameSync.multiplayer.broadcast({
                    type: 'meeple-placed',
                    x, y, position, meepleType,
                    color: playerColor,
                    playerId: fromPlayerId
                });
                gameSync.multiplayer.broadcast({
                    type: 'meeple-count-update',
                    playerId: fromPlayerId,
                    meeples: player.meeples,
                    hasAbbot: player.hasAbbot,
                    hasLargeMeeple: player.hasLargeMeeple,
                    hasBuilder: player.hasBuilder,
                    hasPig: player.hasPig
                });
            };
        }

        // Hôte : traitement d'une demande de fin de tour d'un invité
        if (isHost) {
            gameSync.onTurnEndRequest = (playerId, nextPlayerIndex, gameStateData, isBonusTurnRequest, pendingAbbeData = null) => {
                console.log('⏭️ [HÔTE] Traitement turn-end-request de:', playerId);

                // Nettoyage défensif : un invité qui termine son tour ne doit pas
                // laisser waitingToRedraw=true côté hôte
                waitingToRedraw = false;
                gameSync._pendingUnplaceableRedraw = null;

                // ⭐ Vérification défensive : rejeter si ce n'est pas le tour de ce joueur
                const currentPlayer = gameState.getCurrentPlayer();
                if (!currentPlayer || currentPlayer.id !== playerId) {
                    console.warn('⚠️ [HÔTE] turn-end-request rejeté : pas le tour de', playerId, '(joueur courant:', currentPlayer?.id, ')');
                    return;
                }
                // Rejeter si la tuile n'a pas été posée côté hôte
                if (!gameState.currentTilePlaced) {
                    console.warn('⚠️ [HÔTE] turn-end-request rejeté : tuile non posée pour', playerId);
                    return;
                }

                // Appliquer les points Abbé en attente transmis par l'invité
                if (pendingAbbeData) {
                    const p = gameState.players.find(pl => pl.id === pendingAbbeData.playerId);
                    if (p) {
                        p.score += pendingAbbeData.points;
                        p.scoreDetail = p.scoreDetail || {};
                        p.scoreDetail.monasteries = (p.scoreDetail.monasteries || 0) + pendingAbbeData.points;
                    }
                }

                // ⭐ Vérifier bonus bâtisseur AVANT le scoring
                // (après scoring le bâtisseur peut être retiré de placedMeeples si sa zone se ferme)
                // Un tour bonus ne peut pas en générer un autre
                let isBonusTurn = false;
                if (gameConfig.extensions?.tradersBuilders && !isBonusTurnRequest) {
                    const builderRulesInst = ruleRegistry.rules?.get('builders');
                    if (builderRulesInst) {
                        const bonus = builderRulesInst.checkBonusTrigger(playerId);
                        if (bonus) isBonusTurn = true;
                    }
                }

                // Scoring des zones fermées (l'invité ne le fait plus lui-même)
                if (scoring && zoneMerger) {
                    const newlyClosed = tilePlacement?.newlyClosedZones ?? null;
                    const { scoringResults, meeplesToReturn, goodsResults } = scoring.scoreClosedZones(placedMeeples, playerId, gameState, newlyClosed);
                    // Snapshot de la clé fée AVANT que _releaseFairyIfDetached la vide
                    const fairyMeepleKeySnapshot = gameState.fairyState?.meepleKey ?? null;
                    const fairyOwnerIdSnapshot   = gameState.fairyState?.ownerId   ?? null;
                    if (scoringResults.length > 0 || goodsResults.length > 0) {
                        scoringResults.forEach(({ playerId: pid, points, zoneType }) => {
                            const p = gameState.players.find(pl => pl.id === pid);
                            if (p) {
                                p.score += points;
                                if (zoneType === 'city')   p.scoreDetail.cities      += points;
                                else if (zoneType === 'road') p.scoreDetail.roads    += points;
                                else if (zoneType === 'abbey' || zoneType === 'garden') p.scoreDetail.monasteries += points;
                            }
                        });
                        meeplesToReturn.forEach(key => {
                            const meeple = placedMeeples[key];
                            if (!meeple) return;
                            const p = gameState.players.find(pl => pl.id === meeple.playerId);
                            if (!p) return;
                            if (meeple.type === 'Abbot')        { p.hasAbbot = true; }
                            else if (meeple.type === 'Large' || meeple.type === 'Large-Farmer') { p.hasLargeMeeple = true; }
                            else if (meeple.type === 'Builder') { p.hasBuilder = true; }
                            else if (meeple.type === 'Pig')     { p.hasPig = true; }
                            else                                { if (p.meeples < 7) p.meeples++; }
                            document.querySelectorAll(`.meeple[data-key="${key}"]`).forEach(el => el.remove());
                            delete placedMeeples[key];
                            _releaseFairyIfDetached(key);
                            eventBus.emit('meeple-count-updated', { playerId: meeple.playerId });
                        });
                        if (gameSync) gameSync.syncScoreUpdate(scoringResults, meeplesToReturn, goodsResults, zoneMerger);

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

                // Reset undo + avance le tour côté hôte
                gameState.currentTilePlaced = false; // ← remettre à zéro AVANT endTurnRemote (sinon sendFullStateTo envoie tuileEnMain: null)

                // ── Extension Dragon : migration volcano en fin de tour ──
                if (gameConfig.tileGroups?.dragon && gameConfig.extensions?.dragon && dragonRules && gameState._pendingVolcanoPos) {
                    const { x: vx, y: vy } = gameState._pendingVolcanoPos;
                    dragonRules.onVolcanoPlaced(vx, vy);
                    gameState._pendingVolcanoPos = null;
                    _broadcastDragonState();
                }

                // ── Extension Dragon : démarrer phase dragon si tuile dragon posée ──
                if (gameConfig.tileGroups?.dragon && gameConfig.extensions?.dragon && dragonRules && gameState._pendingDragonTile) {
                    const { playerIndex } = gameState._pendingDragonTile;
                    gameState._pendingDragonTile = null;
                    gameState._pendingPrincessTile = null;
                    if (undoManager) undoManager.reset();
                    const started = dragonRules.onDragonTilePlaced(playerIndex);
                    if (started) {
                        _broadcastDragonState();
                        gameSync.syncDragonPhaseStarted(gameState.dragonPhase);
                        _startDragonTurnUI(); // ← hôte aussi
                        return; // phase dragon prend le relais — pas de pioche maintenant
                    }
                }

                gameState._pendingPrincessTile = null;
                if (undoManager) undoManager.reset();
                if (turnManager) turnManager.endTurnRemote(isBonusTurn);

                if (isBonusTurn) {
                    ruleRegistry.rules?.get('builders')?.resetLastPlacedTile?.();
                }

                // Fin de partie ?
                if (deck.remaining() <= 0) {
                    gameSync.syncTurnEnd(false, null);
                    finalScoresManager.computeAndApply(placedMeeples);
                    return;
                }

                // Piocher la prochaine tuile
                const _nextTile = _hostDrawAndSend();
                if (_nextTile) turnManager.receiveYourTurn(_nextTile.id);
                gameSync.syncTurnEnd(isBonusTurn, _nextTile?.id ?? null);
            };

            // Hôte : traitement d'une tuile implaçable d'un invité
            gameSync.onUnplaceableConfirm = (playerId, tileId) => {
                console.log('🚫 [HÔTE] Tuile implaçable de:', playerId, '— tileId:', tileId);
                if (!unplaceableManager) return;

                const guestTile = deck.tiles.find(t => t.id === tileId) ?? { id: tileId };
                const result = unplaceableManager.handleConfirm(guestTile, gameSync, playerId);
                if (tilePreviewUI) tilePreviewUI.showBackside();
                if (!result) {
                    gameSync._pendingUnplaceableRedraw = playerId;
                    return;
                }

                gameSync.syncUnplaceableHandled(result.tileId, result.playerName, result.action, result.isRiver, playerId);

                if (!result.special) {
                    unplaceableManager.showTileDestroyedModal(result.tileId, result.playerName, false, result.action, result.isRiver);
                }

                gameSync._pendingUnplaceableRedraw = playerId;
            };

            // Hôte : l'invité demande à repiocher après tuile implaçable
            gameSync.onUnplaceableRedraw = (playerId) => {
                console.log('🔄 [HÔTE] Repiocher après implaçable pour:', playerId);
                const _nextTile = _hostDrawAndSend();
                if (_nextTile) {
                    const isHostPlayer = playerId === multiplayer.playerId || playerId === multiplayer.peerId;
                    if (isHostPlayer) {
                        turnManager.receiveYourTurn(_nextTile.id);
                    } else {
                        // Invité — envoyer la tuile + afficher côté hôte
                        const conn = gameSync.multiplayer.connections.find(c => c.peer === playerId);
                        if (conn && conn.open) {
                            conn.send({ type: 'your-turn', tileId: _nextTile.id });
                        }
                        if (tilePreviewUI) tilePreviewUI.showTile(_nextTile);
                    }
                }
                gameSync._pendingUnplaceableRedraw = null;
            };

            // Hôte : déplacement dragon demandé par un invité
            gameSync.multiplayer.onDataReceived = ((originalHandler) => (data, from) => {
                if (data.type === 'dragon-move-request') {
                    const mover = gameState.players[gameState.dragonPhase.moverIndex];
                    if (!gameState.dragonPhase.active || mover?.id !== from) {
                        console.warn('⚠️ [Dragon] dragon-move-request rejeté de', from);
                        return;
                    }
                    _executeDragonMoveHost(data.x, data.y);
                    return;
                }
                if (data.type === 'dragon-end-turn-request') {
                    const mover = gameState.players[gameState.dragonPhase.moverIndex];
                    if (!gameState.dragonPhase.active || mover?.id !== from) {
                        console.warn('⚠️ [Dragon] dragon-end-turn-request rejeté de', from);
                        return;
                    }
                    _advanceDragonTurnHost();
                    return;
                }
                if (data.type === 'princess-eject-request') {
                    // L'invité demande à éjecter un meeple via la princesse
                    // L'hôte applique localement puis broadcast à tous
                    _handlePrincessEject(data.meepleKey);
                    return;
                }
                if (originalHandler) originalHandler(data, from);
            })(gameSync.multiplayer.onDataReceived);
        }
    }
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
            _releaseFairyIfDetached(key);
        });
        eventBus.emit('meeple-count-updated', {});
    }
    // Rendu pion dragon
    if (gameState.dragonPos) {
        _renderDragonPiece(gameState.dragonPos.x, gameState.dragonPos.y);
    }

    // Détecter si le dragon vient de se déplacer (position changée)
    const newPos = gameState.dragonPos ? `${gameState.dragonPos.x},${gameState.dragonPos.y}` : null;
    const dragonMoved = newPos && newPos !== prevPos;

    if (!gameState.dragonPhase.active) {
        // Phase terminée
        if (wasActive) {
            _clearDragonCursors();
            _updateDragonOverlay(); // cache l'overlay bandeau rouge
            afficherToast('🐉 Le dragon s\'est rendormi.', 'info');
            if (undoManager) { undoManager.dragonMovePlacedThisTurn = false; undoManager.dragonMoveSnapshot = null; }
            updateTurnDisplay();
        }
    } else {
        const mover = gameState.players[gameState.dragonPhase.moverIndex];
        const isMyDragonTurn = mover?.id === multiplayer.playerId;

        if (dragonMoved && isMyDragonTurn) {
            // L'hôte vient de confirmer notre déplacement → marquer "a déplacé" et attendre clic
            if (undoManager) undoManager.dragonMovePlacedThisTurn = true;
            _clearDragonCursors();
            _updateDragonOverlay();
            updateTurnDisplay();
        } else if (dragonMoved && !isMyDragonTurn) {
            // Un autre joueur a déplacé → on attend que ce joueur clique Terminer
            _clearDragonCursors();
            _updateDragonOverlay();
            updateTurnDisplay();
        } else if (!dragonMoved) {
            // moverIndex a changé (avancement de tour dragon) → afficher curseurs si c'est notre tour
            if (undoManager) { undoManager.dragonMovePlacedThisTurn = false; undoManager.dragonMoveSnapshot = null; }
            _startDragonTurnUI();
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
    _renderFairyPiece(data.meepleKey);
    // Côté hôte : marquer la fée comme posée ce tour pour que l'undo invité fonctionne
    if (isHost && undoManager) undoManager.markFairyPlaced();
});

// Après une fermeture de zone, si la fée s'est retrouvée seule,
// réafficher les curseurs pour que le joueur puisse la réassigner.
eventBus.on('fairy-detached-show-targets', () => {
    if (!isMyTurn || !gameConfig.extensions?.fairyProtection) return;
    if (undoManager?.meeplePlacedThisTurn) return;
    _clearFairyCursors();
    _showMeepleActionCursors();
});

// ═══════════════════════════════════════════════════════
// DÉMARRAGE — HÔTE
// ═══════════════════════════════════════════════════════
function _updateTimerEls(text) {
    ['game-timer', 'mobile-game-timer'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    });
}

function _showTimerEls() {
    ['game-timer', 'mobile-game-timer'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = '';
    });
}

function startGameTimer() {
    gameTimerStart = Date.now();
    _showTimerEls();
    clearInterval(gameTimerInterval);
    gameTimerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - gameTimerStart) / 1000);
        const h = Math.floor(elapsed / 3600);
        const m = Math.floor((elapsed % 3600) / 60);
        const s = elapsed % 60;
        _updateTimerEls(h > 0
            ? `⏱ ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
            : `⏱ ${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`);
    }, 1000);
}

function startGameTimerFrom(elapsedSeconds) {
    gameTimerStart = Date.now() - (elapsedSeconds * 1000);
    _showTimerEls();
    clearInterval(gameTimerInterval);
    gameTimerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - gameTimerStart) / 1000);
        const h = Math.floor(elapsed / 3600);
        const m = Math.floor((elapsed % 3600) / 60);
        const s = elapsed % 60;
        _updateTimerEls(h > 0
            ? `⏱ ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
            : `⏱ ${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`);
    }, 1000);
}

function stopGameTimer() {
    clearInterval(gameTimerInterval);
    gameTimerInterval = null;
}

// ── Pause / Reconnexion ─────────────────────────────────────────────────────

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

function pauseGame(disconnectedName) {
    if (!isHost || gamePaused) return;
    gamePaused = true;

    // Broadcaster aux invités (sans timeout — attente indéfinie)
    if (gameSync) gameSync.syncGamePaused(disconnectedName, 0);

    // Afficher l'overlay
    _showPauseOverlay(disconnectedName);
}

/**
 * Reprendre la partie (hôte uniquement)
 */
function resumeGame(reason = 'reconnected') {
    if (!gamePaused) return;
    gamePaused = false;
    clearInterval(pauseTimerInterval);
    pauseTimerInterval = null;
    pauseTimerEnd = null;
    _hidePauseOverlay();
    if (isHost && gameSync) gameSync.syncGameResumed(reason);
}

/**
 * Exclure le joueur déconnecté et reprendre la partie (déclenché par le bouton hôte)
 */
function _excludeDisconnectedPlayer(disconnectedName) {
    if (!isHost) return;
    gamePaused = false;
    _hidePauseOverlay();

    if (gameState) {
        const idx = gameState.players.findIndex(p => p.name === disconnectedName && p.disconnected);
        if (idx !== -1) {
            // Était-ce le tour du joueur exclu ?
            const wasCurrentPlayer = (idx === gameState.currentPlayerIndex);
            const peerId = gameState.players[idx].id;

            const isSpectatorPlayer = gameState.players[idx]?.color === 'spectator';

            if (isSpectatorPlayer) {
                // Spectateur : suppression complète, rien à conserver
                gameState.players.splice(idx, 1);
                if (gameState.currentPlayerIndex >= gameState.players.length) {
                    gameState.currentPlayerIndex = 0;
                }
            } else {
                // Joueur réel : on garde dans gameState pour conserver l'affichage visuel.
                // TurnManager skippe automatiquement les joueurs disconnected.
                gameState.players[idx].kicked = true;
                if (wasCurrentPlayer) {
                    let next = (idx + 1) % gameState.players.length;
                    let attempts = 0;
                    while (gameState.players[next]?.disconnected && attempts < gameState.players.length) {
                        next = (next + 1) % gameState.players.length;
                        attempts++;
                    }
                    gameState.currentPlayerIndex = next;
                }
            }
            players = players.filter(p => p.id !== peerId);

            // Notifier tous les invités du statut kicked pour qu'ils affichent 🚪 immédiatement
            multiplayer.broadcast({ type: 'players-update', players: buildPlayersForBroadcast() });

            if (gameSync) gameSync.syncGameResumed('timeout');

            if (turnManager) {
                turnManager.updateTurnState();

                if (wasCurrentPlayer) {
                    // Le tour appartenait au joueur exclu → passer au suivant
                    const _t = _hostDrawAndSend();
                    if (_t) turnManager.receiveYourTurn(_t.id);
                    gameSync.syncTurnEnd(false, _t?.id ?? null);
                }
                // Sinon : le tour en cours continue normalement, on ne fait rien de plus

                eventBus.emit('turn-changed', {
                    isMyTurn: turnManager.isMyTurn,
                    currentPlayer: turnManager.getCurrentPlayer()
                });
            }
        } else {
            // Joueur introuvable (déjà supprimé ?) — juste reprendre
            if (gameSync) gameSync.syncGameResumed('timeout');
        }
    }
    afficherToast(`👋 ${disconnectedName} a été exclu(e) de la partie.`);
}

// ── Auto-reconnexion invité ─────────────────────────────────────────────────
let _autoReconnectTimer = null;

function _startAutoReconnect() {
    _stopAutoReconnect();
    window._isAutoReconnecting = true;
    _showReconnectOverlay();
    _tryReconnect();
}

function _stopAutoReconnect() {
    if (_autoReconnectTimer) {
        clearTimeout(_autoReconnectTimer);
        _autoReconnectTimer = null;
    }
    window._isAutoReconnecting = false;
}

async function _tryReconnect() {
    if (!gameCode || !playerName || !gameState) return;
    console.log('🔄 Tentative de reconnexion à:', gameCode);

    try {
        // Désactiver onHostDisconnected pendant la tentative pour éviter boucle
        multiplayer.onHostDisconnected = null;

        // Détruire l'ancien peer proprement
        if (multiplayer.peer) {
            try { multiplayer.peer.destroy(); } catch(e) {}
            multiplayer.peer = null;
        }
        multiplayer.connections = [];
        multiplayer._connectedPeers.clear();

        // Créer un nouveau peer et rejoindre
        await multiplayer.joinGame(gameCode);

        // Ne PAS envoyer player-info ici — l'hôte va envoyer game-in-progress
        // qui déclenchera l'envoi de player-info depuis le handler (seule source)
        console.log('✅ Reconnexion réussie');
        // Ne pas remettre _isAutoReconnecting=false ici — le flag doit rester true
        // jusqu'à ce que game-in-progress soit traité (pour éviter la modale)
        if (_autoReconnectTimer) { clearTimeout(_autoReconnectTimer); _autoReconnectTimer = null; }

        // Rebrancher GameSync sur le nouveau peer
        if (gameSync) gameSync.init();

        // Rebrancher onHostDisconnected sur le nouveau peer
        multiplayer.onHostDisconnected = () => {
            if (!gameState) return;
            console.log('🔌 Connexion hôte perdue — nouvelle tentative...');
            _startAutoReconnect();
        };

    } catch (err) {
        console.log('⚠️ Reconnexion échouée, nouvelle tentative dans 5s:', err.message);
        _autoReconnectTimer = setTimeout(_tryReconnect, 5000);
    }
}

function _showPauseOverlay(name) {
    let overlay = document.getElementById('pause-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'pause-overlay';
        overlay.style.cssText = `
            position:fixed; inset:0; background:rgba(0,0,0,0.7);
            display:flex; flex-direction:column; align-items:center; justify-content:center;
            z-index:9000; color:#fff; font-family:inherit;
        `;
        document.body.appendChild(overlay);
    }

    const hostBtn = isHost
        ? `<button id="exclude-player-btn" style="
            margin-top:20px; padding:10px 24px; font-size:15px; font-weight:bold;
            background:#e74c3c; color:#fff; border:none; border-radius:8px; cursor:pointer;">
            Continuer sans ${name}
          </button>`
        : '';

    overlay.innerHTML = `
        <div style="background:rgba(30,40,55,0.97);border-radius:16px;padding:32px 40px;text-align:center;max-width:380px;box-shadow:0 8px 32px rgba(0,0,0,0.5);">
            <div style="font-size:48px;margin-bottom:12px;">⏸</div>
            <h2 style="margin:0 0 8px;font-size:22px;">Partie en pause</h2>
            <p style="margin:0 0 8px;color:#aaa;font-size:15px;"><strong style="color:#fff">${name}</strong> s'est déconnecté(e).</p>
            <p style="margin:0 0 4px;color:#aaa;font-size:13px;">En attente de reconnexion…</p>
            ${gameCode ? `<p style="margin:12px 0 0;font-size:13px;color:#aaa;">Code de la partie : <strong style="color:#fff;letter-spacing:2px;">${gameCode}</strong></p>` : ''}
            ${hostBtn}
        </div>
    `;
    overlay.style.display = 'flex';

    if (isHost) {
        document.getElementById('exclude-player-btn')?.addEventListener('click', () => {
            _excludeDisconnectedPlayer(name);
        });
    }
}

function _hidePauseOverlay() {
    const overlay = document.getElementById('pause-overlay');
    if (overlay) overlay.style.display = 'none';
}

function _showReconnectOverlay() {
    let overlay = document.getElementById('reconnect-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'reconnect-overlay';
        overlay.style.cssText = `
            position:fixed; inset:0; background:rgba(0,0,0,0.75);
            display:flex; flex-direction:column; align-items:center; justify-content:center;
            z-index:9500; color:#fff; font-family:inherit;
        `;
        document.body.appendChild(overlay);
    }
    const codeHtml = gameCode
        ? `<p style="margin:20px 0 0;font-size:13px;color:#aaa;">Code : <strong style="color:#fff;letter-spacing:2px;">${gameCode}</strong></p>`
        : '';
    overlay.innerHTML = `
        <div style="background:rgba(30,40,55,0.97);border-radius:16px;padding:32px 40px;text-align:center;max-width:340px;box-shadow:0 8px 32px rgba(0,0,0,0.5);">
            <div style="font-size:48px;margin-bottom:12px;">🔌</div>
            <h2 style="margin:0 0 8px;font-size:22px;">Connexion perdue</h2>
            <p style="margin:0 0 16px;color:#aaa;font-size:15px;">Reconnexion en cours…</p>
            <div style="display:flex;justify-content:center;gap:8px;">
                <span style="width:10px;height:10px;border-radius:50%;background:#4a90e2;animation:rc-bounce 1.2s infinite ease-in-out;"></span>
                <span style="width:10px;height:10px;border-radius:50%;background:#4a90e2;animation:rc-bounce 1.2s infinite ease-in-out 0.2s;"></span>
                <span style="width:10px;height:10px;border-radius:50%;background:#4a90e2;animation:rc-bounce 1.2s infinite ease-in-out 0.4s;"></span>
            </div>
            ${codeHtml}
        </div>
        <style>
            @keyframes rc-bounce {
                0%,80%,100% { transform:scale(0.6); opacity:0.5; }
                40%          { transform:scale(1.0); opacity:1;   }
            }
        </style>
    `;
    _hidePauseOverlay();
    overlay.style.display = 'flex';
}

function _hideReconnectOverlay() {
    const overlay = document.getElementById('reconnect-overlay');
    if (overlay) overlay.style.display = 'none';
}


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
    if (_tileHasDragonZone(tileData)) {
        const volcanoOnBoard = Object.values(plateau.placedTiles ?? {}).some(t => _tileHasVolcanoZone(t));
        console.log('🐉 [DIAG] tuile dragon détectée:', tileData.id,
            '| tileGroups.dragon:', gameConfig.tileGroups?.dragon,
            '| extensions.dragon:', gameConfig.extensions?.dragon,
            '| volcanoOnBoard:', volcanoOnBoard,
            '| placedTiles count:', Object.keys(plateau.placedTiles ?? {}).length);
    }
    if (gameConfig.tileGroups?.dragon && gameConfig.extensions?.dragon &&
        _tileHasDragonZone(tileData) &&
        !Object.values(plateau.placedTiles ?? {}).some(t => _tileHasVolcanoZone(t))) {
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
function _tileHasDragonZone(tileData) {
    return tileData?.zones?.some(z => z.type === 'dragon') ?? false;
}

/**
 * Indique si une tuile contient une zone volcano.
 */
function _tileHasVolcanoZone(tileData) {
    return tileData?.zones?.some(z => z.type === 'volcano') ?? false;
}

// ═══════════════════════════════════════════════════════
// EXTENSION DRAGON — réseau & UI
// ═══════════════════════════════════════════════════════

/**
 * Broadcast l'état dragon complet à tous les invités.
 */
function _broadcastDragonState(eatenKeys = []) {
    if (!gameSync) return;
    multiplayer.broadcast({
        type: 'dragon-state-update',
        dragonPos:   gameState.dragonPos,
        dragonPhase: gameState.dragonPhase,
        fairyState:  gameState.fairyState,
        eatenKeys,
        players:     gameState.players.map(p => ({
            id: p.id, meeples: p.meeples, hasAbbot: p.hasAbbot,
            hasLargeMeeple: p.hasLargeMeeple, hasBuilder: p.hasBuilder,
            hasPig: p.hasPig, score: p.score
        }))
    });
}

/**
 * Affiche les curseurs de déplacement du dragon pour le joueur actif du tour dragon.
 * Appelé côté hôte ou invité selon moverIndex.
 */
function _startDragonTurnUI() {
    const phase = gameState.dragonPhase;
    console.log('🐉 [_startDragonTurnUI] phase.active:', phase.active, '| moverIndex:', phase.moverIndex, '| movesRemaining:', phase.movesRemaining);
    if (!phase.active) return;

    const mover = gameState.players[phase.moverIndex];
    const isMyDragonTurn = mover?.id === multiplayer.playerId;
    console.log('🐉 [_startDragonTurnUI] mover:', mover?.name, '| isMyDragonTurn:', isMyDragonTurn, '| dragonPos:', JSON.stringify(gameState.dragonPos));

    _updateDragonOverlay();
    updateTurnDisplay();

    if (isMyDragonTurn && dragonRules) {
        const validMoves = dragonRules.getValidDragonMoves();
        console.log('🐉 [_startDragonTurnUI] validMoves:', JSON.stringify(validMoves));
        if (validMoves.length === 0) {
            // Dragon bloqué dès le début de ce tour : on ne peut pas déplacer,
            // mais on peut quand même terminer son tour (ou annuler si on est arrivé là par undo).
            // On marque dragonMovePlacedThisTurn pour débloquer le bouton "Terminer mon tour".
            if (undoManager) undoManager.dragonMovePlacedThisTurn = true;
            _updateDragonOverlay();
            updateTurnDisplay();
            afficherToast('🐉 Le dragon est bloqué — terminez votre tour.', 'warning');
        } else {
            _showDragonMoveCursors(validMoves);
        }
    }
}

/**
 * Affiche/met à jour le bandeau d'info phase dragon.
 */
function _updateDragonOverlay() {
    const phase = gameState.dragonPhase;
    if (!phase.active) {
        const overlay = document.getElementById('dragon-phase-overlay');
        if (overlay) overlay.style.display = 'none';
        return;
    }
    const mover = gameState.players[phase.moverIndex];
    let overlay = document.getElementById('dragon-phase-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'dragon-phase-overlay';
        overlay.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);' +
            'background:rgba(180,30,30,0.92);color:#fff;padding:8px 20px;border-radius:8px;' +
            'font-weight:bold;z-index:1000;pointer-events:none;text-align:center;';
        document.body.appendChild(overlay);
    }
    overlay.style.display = 'block';
    const isMyDragonTurn = mover?.id === multiplayer.playerId;
    const hasMovedThisTurn = !!(undoManager?.dragonMovePlacedThisTurn);
    if (isMyDragonTurn) {
        overlay.textContent = hasMovedThisTurn
            ? `🐉 Dragon déplacé — cliquez "Terminer mon tour" pour passer la main`
            : `🐉 À vous de déplacer le dragon ! (${phase.movesRemaining} déplacements restants)`;
    } else {
        overlay.textContent = hasMovedThisTurn
            ? `🐉 ${mover?.name ?? '?'} a déplacé le dragon — en attente…`
            : `🐉 ${mover?.name ?? '?'} déplace le dragon… (${phase.movesRemaining} restants)`;
    }
}

/**
 * Affiche les curseurs de déplacement du dragon sur les tuiles adjacentes valides.
 */
function _showDragonMoveCursors(validMoves) {
    _clearDragonCursors();
    const boardEl = document.getElementById('board');
    console.log('🐉 [_showDragonMoveCursors] validMoves:', JSON.stringify(validMoves), '| boardEl:', !!boardEl);
    if (!boardEl) return;

    // Position 13 = centre de la grille 5×5 (row 2, col 2, 0-indexed)
    const pos = 13;
    const row = Math.floor((pos - 1) / 5); // 2
    const col = (pos - 1) % 5;             // 2
    const offsetX = 20.8 + col * 41.6;     // centre
    const offsetY = 20.8 + row * 41.6;

    validMoves.forEach(({ x, y }) => {
        // Overlay positionné par grid comme abbé/fée
        const overlay = document.createElement('div');
        overlay.className = 'dragon-move-cursor-overlay';
        overlay.style.cssText = `grid-column:${x};grid-row:${y};position:relative;` +
            'width:208px;height:208px;pointer-events:none;z-index:101;';

        const btn = document.createElement('div');
        btn.className = 'dragon-move-cursor';
        btn.dataset.dx = x;
        btn.dataset.dy = y;
        btn.style.cssText = `position:absolute;left:${offsetX}px;top:${offsetY}px;` +
            'width:42px;height:42px;border-radius:50%;' +
            'border:3px solid #c83200;box-shadow:0 0 10px 3px rgba(200,50,0,0.7);' +
            'background:rgba(200,50,0,0.25);cursor:pointer;pointer-events:auto;' +
            'transform:translate(-50%,-50%);display:flex;align-items:center;' +
            'justify-content:center;font-size:22px;animation:abbeRecallPulse 1.2s ease-in-out infinite;';
        btn.textContent = '🐉';

        const openSelector = (clientX, clientY) => {
            if (!meepleSelectorUI) { _onDragonMoveConfirm(x, y); return; }
            meepleSelectorUI.show(x, y, pos, 'dragon-move', clientX, clientY,
                (_sx, _sy, _spos, meepleType) => {
                    if (meepleType === 'Dragon') _onDragonMoveConfirm(x, y);
                    // Annulé → curseurs restent (ne pas clearDragonCursors)
                }
            );
        };

        btn.addEventListener('click', (e) => { e.stopPropagation(); openSelector(e.clientX, e.clientY); });
        btn.addEventListener('touchend', (e) => {
            e.preventDefault(); e.stopPropagation();
            openSelector(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
        }, { passive: false });

        overlay.appendChild(btn);
        boardEl.appendChild(overlay);
    });
}

function _clearDragonCursors() {
    document.querySelectorAll('.dragon-move-cursor, .dragon-move-cursor-overlay').forEach(el => el.remove());
}

/**
 * Confirmé via sélecteur — exécuter le déplacement dragon.
 */
function _onDragonMoveConfirm(x, y) {
    if (!dragonRules || !gameState.dragonPhase.active) return;
    const mover = gameState.players[gameState.dragonPhase.moverIndex];
    if (mover?.id !== multiplayer.playerId) return;

    _clearDragonCursors();

    if (isHost) {
        _executeDragonMoveHost(x, y);
    } else {
        // Invité : envoyer la demande à l'hôte
        const hostConn = gameSync?.getHostConnection?.() ?? gameSync?.multiplayer?.connections?.[0];
        if (hostConn?.open) {
            hostConn.send({ type: 'dragon-move-request', x, y, playerId: multiplayer.playerId });
        }
    }
}

/**
 * Exécution côté hôte d'un déplacement dragon (local ou reçu d'un invité).
 */
function _executeDragonMoveHost(x, y) {
    // Snapshot undo pour ce déplacement (par joueur dragon)
    if (undoManager) undoManager.saveDragonMove(placedMeeples);

    const { eaten, blocked } = dragonRules.executeDragonMove(x, y);

    // Retirer visuellement les meeples mangés côté hôte
    eaten.forEach(({ key }) => {
        document.querySelectorAll(`.meeple[data-key="${key}"]`).forEach(el => el.remove());
        _releaseFairyIfDetached(key);
    });

    // Fix 5 — Builder/Cochon orphelins : si le dragon a mangé des meeples normaux,
    // vérifier si des Builder/Cochon dans la même zone fusionnée n'ont plus de meeple
    // normal de leur propriétaire dans cette zone → les rendre aussi.
    if (eaten.length > 0 && zoneMerger) {
        const orphanKeys = [];
        for (const [key, meeple] of Object.entries(placedMeeples)) {
            if (meeple.type !== 'Builder' && meeple.type !== 'Pig') continue;
            const parts = key.split(',');
            const bx = Number(parts[0]), by = Number(parts[1]), bp = Number(parts[2]);
            const zoneId = zoneMerger.findMergedZoneForPosition(bx, by, bp)?.id;
            if (zoneId == null) continue;
            // Vérifier s'il reste un meeple normal du même joueur dans cette zone
            const hasNormalMeeple = Object.entries(placedMeeples).some(([k2, m2]) => {
                if (k2 === key) return false;
                if (m2.playerId !== meeple.playerId) return false;
                if (m2.type === 'Builder' || m2.type === 'Pig') return false;
                const [x2, y2, p2] = k2.split(',').map(Number);
                return zoneMerger.findMergedZoneForPosition(x2, y2, p2)?.id === zoneId;
            });
            if (!hasNormalMeeple) orphanKeys.push(key);
        }
        orphanKeys.forEach(key => {
            const meeple = placedMeeples[key];
            const player = gameState.players.find(p => p.id === meeple.playerId);
            if (player) {
                if (meeple.type === 'Builder') player.hasBuilder = true;
                else if (meeple.type === 'Pig') player.hasPig = true;
            }
            delete placedMeeples[key];
            document.querySelectorAll(`.meeple[data-key="${key}"]`).forEach(el => el.remove());
            eaten.push({ key, meeple });
            console.log(`🐉 [Fix5] Builder/Cochon orphelin rendu: ${key}`);
        });
    }

    // Broadcast état dragon (les invités retirent aussi les meeples mangés)
    _broadcastDragonState(eaten.map(e => e.key));

    if (!gameState.dragonPhase.active) {
        // Phase terminée par un autre mécanisme (sécurité)
        _onDragonPhaseEnded();
    } else {
        // Dans tous les cas (bloqué, épuisé, ou mouvements restants) :
        // on attend que le joueur clique "Terminer mon tour"
        _clearDragonCursors();
        _updateDragonOverlay();
        updateTurnDisplay();
    }
}

/**
 * Fin de phase dragon — reprendre le tour normal.
 */
function _onDragonPhaseEnded() {
    _clearDragonCursors();
    _updateDragonOverlay();
    afficherToast('🐉 Le dragon s\'est rendormi.', 'info');

    if (!isHost) return;

    // Piocher la prochaine tuile pour le joueur qui suit le joueur déclencheur
    if (deck.remaining() <= 0) {
        if (gameSync) gameSync.syncTurnEnd();
        finalScoresManager.computeAndApply(placedMeeples);
        return;
    }
    if (turnManager) turnManager.endTurnRemote(false);
    const _nextTile = _hostDrawAndSend();
    if (_nextTile) turnManager.receiveYourTurn(_nextTile.id);
    if (gameSync) gameSync.syncTurnEnd(false, _nextTile?.id ?? null);
    updateTurnDisplay();
}

/**
 * [HÔTE] Avance la phase dragon au joueur suivant, ou la termine si plus de mouvements.
 * Appelé au clic "Terminer mon tour" pendant la phase dragon.
 */
function _advanceDragonTurnHost() {
    if (!dragonRules || !gameState.dragonPhase.active) return;

    // Réinitialiser le flag undo dragon
    if (undoManager) { undoManager.dragonMoveSnapshot = null; undoManager.dragonMovePlacedThisTurn = false; }

    if (gameState.dragonPhase.movesRemaining <= 0) {
        // Plus de mouvements — terminer la phase
        gameState.endDragonPhase();
        _broadcastDragonState();
        _onDragonPhaseEnded();
        return;
    }

    // Chercher le prochain joueur qui peut bouger.
    // NE PAS décrémenter movesRemaining ici — seul moveDragon() le fait (déplacement physique).
    // On parcourt au max activePlayers joueurs pour éviter une boucle infinie.
    const activePlayers = gameState.players.filter(p =>
        p.color !== 'spectator' && !p.disconnected && !p.kicked
    ).length;

    for (let attempts = 0; attempts < activePlayers; attempts++) {
        gameState.advanceDragonMover();
        const validMoves = dragonRules.getValidDragonMoves();
        if (validMoves.length > 0) {
            // Ce joueur peut bouger — lui donner la main
            _broadcastDragonState();
            _startDragonTurnUI();
            updateTurnDisplay();
            return;
        }
        // Ce joueur est bloqué — on le saute sans consommer de mouvement
        console.log(`🐉 [Dragon] ${gameState.players[gameState.dragonPhase.moverIndex]?.name} bloqué, tour sauté`);
    }

    // Tous les joueurs sont bloqués — terminer la phase
    gameState.endDragonPhase();
    _broadcastDragonState();
    _onDragonPhaseEnded();
}

// ── Rendu pion Dragon ─────────────────────────────────────────────────

/**
 * Affiche le pion dragon centré sur la tuile (x, y).
 * Crée ou déplace l'élément existant.
 */
function _renderDragonPiece(x, y) {
    if (x == null || y == null) return;
    const boardEl = document.getElementById('board');
    if (!boardEl) return;

    // Retirer l'ancien pion dragon s'il est sur une autre tuile
    const existing = document.getElementById('dragon-piece');
    if (existing) existing.remove();

    // Trouver ou créer le conteneur meeple de la tuile cible
    let container = boardEl.querySelector(`.meeple-container[data-pos="${x},${y}"]`);
    if (!container) {
        container = document.createElement('div');
        container.className = 'meeple-container';
        container.dataset.pos = `${x},${y}`;
        container.style.gridColumn = x;
        container.style.gridRow    = y;
        container.style.position   = 'relative';
        container.style.width      = '208px';
        container.style.height     = '208px';
        container.style.pointerEvents = 'none';
        container.style.zIndex     = '50';
        boardEl.appendChild(container);
    }

    const img = document.createElement('img');
    img.id  = 'dragon-piece';
    img.src = './assets/Meeples/Dragon.png';
    // Position 13 = centre (row=2, col=2) → offsetX=offsetY=104px
    img.style.position  = 'absolute';
    img.style.left      = '104px';
    img.style.top       = '104px';
    img.style.transform = 'translate(-50%, -50%)';
    // Scale 0.40 → ~113×62px (défini dans MeepleConfig mais on utilise la valeur directe ici)
    img.style.width     = '113px';
    img.style.height    = '62px';
    img.style.zIndex    = '60';  // au-dessus des meeples (z-index 50)
    img.style.pointerEvents = 'none';

    container.appendChild(img);
}

// ── Rendu pion Fée ────────────────────────────────────────────────────

/**
 * Affiche la fée décalée par rapport au meeple auquel elle est attachée.
 * @param {string} meepleKey  "x,y,position"
 */
function _renderFairyPiece(meepleKey) {
    _removeFairyPiece();
    if (!meepleKey) return;

    const boardEl = document.getElementById('board');
    if (!boardEl) return;

    const parts = meepleKey.split(',');
    const mx = Number(parts[0]);
    const my = Number(parts[1]);
    const pos = Number(parts[2]);

    // Calculer la position du meeple attaché (grille 5×5, 208px par tuile)
    const row = Math.floor((pos - 1) / 5);
    const col = (pos - 1) % 5;
    const baseX = 20.8 + col * 41.6;
    const baseY = 20.8 + row * 41.6;

    // Décalage fixe : -18px horizontalement, -20px verticalement (en haut à gauche du meeple)
    const fairyX = baseX - 18;
    const fairyY = baseY - 20;

    let container = boardEl.querySelector(`.meeple-container[data-pos="${mx},${my}"]`);
    if (!container) {
        container = document.createElement('div');
        container.className = 'meeple-container';
        container.dataset.pos = `${mx},${my}`;
        container.style.gridColumn = mx;
        container.style.gridRow    = my;
        container.style.position   = 'relative';
        container.style.width      = '208px';
        container.style.height     = '208px';
        container.style.pointerEvents = 'none';
        container.style.zIndex     = '50';
        boardEl.appendChild(container);
    }

    const img = document.createElement('img');
    img.id  = 'fairy-piece';
    img.src = './assets/Meeples/Fairy.png';
    img.style.position  = 'absolute';
    img.style.left      = `${fairyX}px`;
    img.style.top       = `${fairyY}px`;
    img.style.transform = 'translate(-50%, -50%)';
    // Scale 0.55 → ~39×62px
    img.style.width     = '39px';
    img.style.height    = '62px';
    img.style.zIndex    = '61';
    img.style.pointerEvents = 'none';

    container.appendChild(img);
}

function _removeFairyPiece() {
    document.getElementById('fairy-piece')?.remove();
}

/**
 * Si la fée est attachée au meepleKey donné (qui vient d'être retiré du plateau),
 * libérer la fée : ownerId → null, meepleKey conservé pour l'affichage visuel.
 * La fée reste visible sur le plateau mais n'appartient plus à personne —
 * n'importe quel joueur pourra la récupérer via les curseurs habituels.
 * La mise à jour sera propagée aux invités via le prochain turn-ended.
 */
function _releaseFairyIfDetached(removedKey) {
    if (!gameState.fairyState) return;
    if (gameState.fairyState.meepleKey !== removedKey) return;
    gameState.fairyState.ownerId = null;
    gameState.players.forEach(p => { p.hasFairy = false; });
}

function sendFullStateTo(targetPeerId) {
    if (!isHost || !gameSync) return;
    const _cp = gameState.getCurrentPlayer();
    const _isHostTurn = _cp?.id === multiplayer.peerId;
    const _tuilePayload = _isHostTurn
        ? (tuileEnMain ?? (gameState.currentTilePlaced ? null : currentTileForPlayer))
        : (gameState.currentTilePlaced ? null : currentTileForPlayer);
    console.log('📤 [SYNC] sendFullStateTo', targetPeerId, '— currentPlayer:', _cp?.name, '— tuileEnMain envoyée:', _tuilePayload?.id ?? null, '— currentTilePlaced:', gameState.currentTilePlaced);
    gameSync.syncFullState(targetPeerId, {
        gameState,
        deck,
        plateau,
        zoneRegistry: zoneMerger.registry,
        tileToZone:   zoneMerger.tileToZone,
        placedMeeples,
        tuileEnMain: (() => { const cp = gameState.getCurrentPlayer(); const isHostTurn = cp?.id === multiplayer.peerId; if (isHostTurn) return tuileEnMain ?? (gameState.currentTilePlaced ? null : currentTileForPlayer); return gameState.currentTilePlaced ? null : currentTileForPlayer; })(),
        tuilePosee: gameState.currentTilePlaced,
        gameConfig,
        timerElapsed: gameTimerStart ? Math.floor((Date.now() - gameTimerStart) / 1000) : 0
    });
}

/**
 * Recevoir et appliquer un full-state-sync (côté invité/reconnecté)
 */
function applyFullStateSync(data) {
    // Réinitialiser l'état local avant d'appliquer le nouvel état
    tuileEnMain = null;
    tuilePosee  = false;

    // Reconstruire gameState
    gameState.deserialize(data.gameState);

    // Reconstruire deck
    deck.tiles        = data.deck.tiles;
    deck.currentIndex = data.deck.currentIndex;
    deck.totalTiles   = data.deck.totalTiles;

    // Créer le slot central si pas encore fait (cas reconnexion)
    if (slotsUI && Object.keys(data.plateau).length > 0) {
        slotsUI.createCentralSlot();
    }

    // Vider le board visuellement avant de reconstruire (évite les doublons si reconnexion)
    const boardEl = document.getElementById('board');
    if (boardEl) {
        boardEl.querySelectorAll('.tile').forEach(el => el.remove());
    }

    // Reconstruire plateau — données + affichage visuel uniquement
    plateau.placedTiles = {};
    for (const [key, tileData] of Object.entries(data.plateau)) {
        const [tx, ty] = key.split(',').map(Number);
        // Reconstruire depuis deck.tiles pour garantir l'imagePath
        const srcData = data.deck.tiles.find(t => t.id === tileData.id) || tileData;
        const tile = new Tile({ ...srcData, imagePath: srcData.imagePath || srcData.image });
        tile.rotation = tileData.rotation || 0;
        plateau.placedTiles[key] = tile;
        if (tilePlacement) tilePlacement.displayTile(tx, ty, tile);
    }
    firstTilePlaced = Object.keys(data.plateau).length > 0;
    if (slotsUI)       slotsUI.firstTilePlaced       = firstTilePlaced;
    if (tilePlacement) tilePlacement.firstTilePlaced  = firstTilePlaced;

    // Reconstruire zones
    if (zoneMerger) {
        zoneMerger.registry.deserialize(data.zoneRegistry);
        zoneMerger.tileToZone = new Map(data.tileToZone);
    }

    // Reconstruire meeples — modifier en place pour préserver les références
    Object.keys(placedMeeples).forEach(k => delete placedMeeples[k]);
    Object.assign(placedMeeples, data.placedMeeples || {});
    for (const [key, meeple] of Object.entries(placedMeeples)) {
        const [x, y, position] = key.split(',');
        if (meepleDisplayUI) meepleDisplayUI.showMeeple(Number(x), Number(y), position, meeple.type, meeple.color);
    }

    // Reconstruire pion dragon et fée si extension active
    if (gameConfig.tileGroups?.dragon) {
        if (gameState.dragonPos) {
            _renderDragonPiece(gameState.dragonPos.x, gameState.dragonPos.y);
        }
        if (gameState.fairyState?.meepleKey) {
            _renderFairyPiece(gameState.fairyState.meepleKey);
        }
    }

    // Restaurer tuilePosee
    tuilePosee = data.tuilePosee ?? false;
    if (turnManager) turnManager.tilePlaced = tuilePosee;

    // Masquer l'overlay de reconnexion si affiché
    _hideReconnectOverlay();

    // Corriger le playerId AVANT updateTurnState (sinon isMyTurn se base sur l'ancien id)
    if (!isHost && playerName) {
        // Si on revient après avoir été spec, playerColor peut être 'spectator' alors qu'on est joueur
        // → chercher d'abord par nom+couleur exacte, sinon par nom seul (hors spectateur)
        let meInState = gameState.players.find(p => p.name === playerName && p.color === playerColor && p.color !== 'spectator');
        if (!meInState) {
            meInState = gameState.players.find(p => p.name === playerName && p.color !== 'spectator');
        }
        if (meInState && meInState.id !== multiplayer.playerId) {
            // Le gameState reçu contient l'ancien peerId — on le met à jour avec le nouveau
            // (et non l'inverse, sinon isMyTurn ne reconnaît pas notre nouveau peerId)
            console.log('🔧 [SYNC] Correction playerId dans gameState:', meInState.id, '→', multiplayer.playerId);
            meInState.id = multiplayer.playerId;
            playerColor = meInState.color;
        }
    }

    // Mettre à jour isMyTurn AVANT d'afficher la tuile ou le verso
    if (turnManager) turnManager.updateTurnState();

    // Tuile en main : reconstruire pour tout le monde (joueur courant, invité, spectateur)
    console.log('📥 [SYNC] applyFullStateSync — data.tuileEnMain:', data.tuileEnMain, '— tuilePosee:', tuilePosee, '— deck prêt:', !!deck);
    if (data.tuileEnMain && !tuilePosee) {
        const td = deck.tiles.find(t => t.id === data.tuileEnMain.id);
        if (td) {
            tuileEnMain = new Tile(td);
            tuileEnMain.rotation = data.tuileEnMain.rotation || 0;
            eventBus.emit('tile-drawn', { tileData: tuileEnMain, fromNetwork: true });
        }
    }

    // Afficher le preview après le prochain repaint pour garantir le rendu
    const _tuilePosee  = tuilePosee;
    const _isMyTurn    = turnManager?.isMyTurn;
    const _tuileEnMain = tuileEnMain;
    requestAnimationFrame(() => {
        if (!tilePreviewUI) return;
        if (_tuilePosee) {
            tilePreviewUI.showBackside();
        } else if (_tuileEnMain) {
            tilePreviewUI.showTile(_tuileEnMain);
        } else {
            tilePreviewUI.showMessage('En attente...');
        }
    });

    // slotsUI : pas de tuile disponible si tuile déjà posée
    if (slotsUI) slotsUI.tileAvailable = !tuilePosee && !!tuileEnMain;

    // ── Synchroniser multiplayer.playerId avec l'id présent dans le gameState reçu ──
    // Synchroniser le timer
    if (data.timerElapsed != null) startGameTimerFrom(data.timerElapsed);

    // Mettre à jour l'affichage
    eventBus.emit('deck-updated', { remaining: deck.remaining(), total: deck.total() });
    eventBus.emit('score-updated');
    if (turnManager) {
        eventBus.emit('turn-changed', {
            isMyTurn: turnManager.isMyTurn,
            currentPlayer: turnManager.getCurrentPlayer()
        });
    }
    updateTurnDisplay();
}

async function startGame() {
    console.log('🎮 [HÔTE] Initialisation du jeu...');
    startGameTimer();

    document.getElementById('lobby-page').style.display = 'none';
    document.getElementById('game-page').style.display  = 'flex';
    history.pushState({ inGame: true }, '');

    gameState = new GameState();
    players.forEach(p => gameState.addPlayer(p.id, p.name, p.color, p.isHost));
    // S'assurer que currentPlayerIndex ne démarre pas sur un spectateur
    { let a = 0;
      while (gameState.players[gameState.currentPlayerIndex]?.color === 'spectator' && a++ < gameState.players.length)
          gameState.currentPlayerIndex = (gameState.currentPlayerIndex + 1) % gameState.players.length; }
    // Initialiser le flag Abbé pour chaque joueur
    console.log('🔧 startGame — gameConfig.extensions:', JSON.stringify(gameConfig.extensions));
    if (gameConfig.extensions?.abbot) {
        gameState.players.forEach(p => { p.hasAbbot = true; });
        console.log('✅ [HOST] hasAbbot initialisé:', gameState.players.map(p => p.id + '=' + p.hasAbbot));
    } else {
        console.log('ℹ️ [HOST] abbot désactivé');
    }
    if (gameConfig.extensions?.largeMeeple) {
        gameState.players.forEach(p => { p.hasLargeMeeple = true; });
        console.log('✅ [HOST] hasLargeMeeple initialisé');
    }
    if (gameConfig.extensions?.tradersBuilders) {
        gameState.players.forEach(p => { p.hasBuilder = true; });
        console.log('✅ [HOST] hasBuilder initialisé');
    }
    if (gameConfig.extensions?.pig) {
        gameState.players.forEach(p => { p.hasPig = true; });
        console.log('✅ [HOST] hasPig initialisé');
    }
    // Extension Dragon : pas de flag joueur à init (le dragon n'appartient à personne)
    // Extension Fairy : la fée n'est pas encore distribuée, sera posée en cours de partie

    gameSync = new GameSync(multiplayer, gameState, null);
    gameSync.init();
    gameSync.eventBus = eventBus; // pour dragon-state-update et autres events réseau

    turnManager = new TurnManager(eventBus, gameState, deck, multiplayer, isHost);
    turnManager.init();

    initializeGameModules();
    // ✅ Mettre à jour la config sur les modules APRÈS que gameConfig est finalisé
    if (meepleSelectorUI) meepleSelectorUI.config = gameConfig;
    if (meepleCursorsUI)  meepleCursorsUI.config  = gameConfig;
    if (scorePanelUI)     scorePanelUI.config      = gameConfig;
    attachGameSyncCallbacks();

    setupEventListeners();
    setupNavigation(document.getElementById('board-container'), document.getElementById('board'));

    // L'hôte charge et envoie la pioche
    await deck.loadAllTiles(gameConfig.testDeck ?? false, gameConfig.tileGroups ?? {}, gameConfig.startType ?? 'unique');
    gameSync.startGame(deck);
    const _startTile = _hostDrawAndSend();
    if (_startTile) turnManager.receiveYourTurn(_startTile.id);
    gameSync.syncTurnEnd(false, _startTile?.id ?? null);
    eventBus.emit('deck-updated', { remaining: deck.remaining(), total: deck.total() });
    updateTurnDisplay();
    slotsUI.createCentralSlot();

    _postStartSetup();
    console.log('✅ Initialisation hôte terminée');
}

// ═══════════════════════════════════════════════════════
// DÉMARRAGE — INVITÉ
// ═══════════════════════════════════════════════════════
async function startGameForInvite(fullStateData = null) {
    console.log('🎮 [INVITÉ] Initialisation du jeu...');
    startGameTimer();
    lobbyUI.hide();
    history.pushState({ inGame: true }, '');

    gameState = new GameState();
    // Si on a un état complet, on le désérialisera après init des modules
    if (!fullStateData) {
        players.forEach(p => gameState.addPlayer(p.id, p.name, p.color, p.isHost));
    } else {
        // Pré-peupler depuis fullStateData pour que les modules s'initialisent correctement
        const gs = fullStateData.gameState;
        (gs.players || []).forEach(p => gameState.addPlayer(p.id, p.name, p.color, p.isHost));
    }
    // S'assurer que currentPlayerIndex ne démarre pas sur un spectateur
    { let a = 0;
      while (gameState.players[gameState.currentPlayerIndex]?.color === 'spectator' && a++ < gameState.players.length)
          gameState.currentPlayerIndex = (gameState.currentPlayerIndex + 1) % gameState.players.length; }
    if (gameConfig.extensions?.abbot) {
        gameState.players.forEach(p => { p.hasAbbot = true; });
        console.log('✅ [INVITÉ] hasAbbot initialisé pour', gameState.players.map(p => p.id));
    } else {
        console.log('ℹ️ [INVITÉ] extension abbot désactivée — gameConfig:', JSON.stringify(gameConfig.extensions));
    }
    if (gameConfig.extensions?.largeMeeple) {
        gameState.players.forEach(p => { p.hasLargeMeeple = true; });
        console.log('✅ [INVITÉ] hasLargeMeeple initialisé');
    }
    if (gameConfig.extensions?.tradersBuilders) {
        gameState.players.forEach(p => { p.hasBuilder = true; });
        console.log('✅ [INVITÉ] hasBuilder initialisé');
    }
    if (gameConfig.extensions?.pig) {
        gameState.players.forEach(p => { p.hasPig = true; });
        console.log('✅ [INVITÉ] hasPig initialisé');
    }

    gameSync = new GameSync(multiplayer, gameState, originalLobbyHandler);
    gameSync.init();
    gameSync.eventBus = eventBus;

    turnManager = new TurnManager(eventBus, gameState, deck, multiplayer);
    turnManager.init();

    initializeGameModules();
    // ✅ Mettre à jour la config sur les modules APRÈS que gameConfig est finalisé
    if (meepleSelectorUI) meepleSelectorUI.config = gameConfig;
    if (meepleCursorsUI)  meepleCursorsUI.config  = gameConfig;
    if (scorePanelUI)     scorePanelUI.config      = gameConfig;
    attachGameSyncCallbacks();

    setupEventListeners();
    setupNavigation(document.getElementById('board-container'), document.getElementById('board'));

    _postStartSetup();

    // Si on rejoint une partie en cours, appliquer l'état complet maintenant
    if (fullStateData) {
        applyFullStateSync(fullStateData);
        afficherMessage('');
    } else {
        afficherMessage("En attente de l'hôte...");
    }
    console.log('✅ Initialisation invité terminée');
}

/**
 * Configuration commune post-démarrage
 */
function _postStartSetup() {
    ruleRegistry.register('base', BaseRules, gameConfig);
    ruleRegistry.enable('base');

    // Extension Abbé
    if (gameConfig.extensions?.abbot) {
        ruleRegistry.register('abbot', AbbeRules, gameConfig);
        ruleRegistry.enable('abbot');
    }
    if (gameConfig.extensions?.largeMeeple || gameConfig.extensions?.cathedrals || gameConfig.extensions?.inns) {
        ruleRegistry.register('inns', InnsRules, gameConfig);
        ruleRegistry.enable('inns');
    }
    if (gameConfig.extensions?.tradersBuilders || gameConfig.extensions?.pig) {
        // BuilderRules gère à la fois le bâtisseur et le cochon (extension Marchands & Bâtisseurs)
        const builderRulesInst = new BuilderRules(eventBus, gameState, zoneMerger, gameConfig);
        builderRulesInst.setPlacedMeeples(placedMeeples);
        ruleRegistry.registerInstance('builders', builderRulesInst);
        ruleRegistry.enable('builders');
        // Tour bonus bâtisseur
        if (turnManager) turnManager.builderRules = builderRulesInst;
        // Marchandises et cochon en fin de partie
        if (scoring) scoring._builderRules = builderRulesInst;
    }

    document.getElementById('test-modal-btn').style.display =
        gameConfig.enableDebug ? 'block' : 'none';
    // Menu : afficher retour lobby + séparateur uniquement pour l'hôte
    const _backBtn = document.getElementById('back-to-lobby-btn');
    const _lobbySep = document.querySelector('.menu-lobby-separator');
    if (_backBtn)  _backBtn.style.display  = isHost ? 'block' : 'none';
    if (_lobbySep) _lobbySep.style.display = isHost ? 'block' : 'none';
    // Bouton quitter uniquement pour les invités
    const _leaveBtn = document.getElementById('menu-leave-btn');
    const _leaveSep = document.querySelector('.menu-leave-separator');
    if (_leaveBtn) _leaveBtn.style.display = !isHost ? 'block' : 'none';
    if (_leaveSep) _leaveSep.style.display = !isHost ? 'block' : 'none';
    // Afficher/masquer tuiles restantes dans le menu
    const _remBtn = document.getElementById('menu-remaining-btn');
    if (_remBtn) _remBtn.style.display = gameConfig.showRemainingTiles ? 'block' : 'none';
    // Afficher le code dans le menu
    const _codeDisplay = document.getElementById('menu-code-display');
    if (_codeDisplay) _codeDisplay.textContent = `Code : ${gameCode || '—'}`;

    // Spectateur : masquer les contrôles d'action mais garder la tile preview
    if (_isSpectator()) {
        ['end-turn-btn', 'undo-btn', 'mobile-end-turn-btn', 'mobile-undo-btn']
            .forEach(id => {
                const el = document.getElementById(id);
                if (el) el.style.display = 'none';
            });
        // Masquer les slots de placement mais pas le preview
        const tileTitle = document.querySelector('#current-tile-container h3');
        if (tileTitle) tileTitle.style.display = 'none';
    }

    // Redémarrer le heartbeat avec le handler de jeu (gestion déconnexion en cours de partie)
    if (multiplayer?.peer) {
        const handleDisconnect = (peerId) => {
            if (!isHost) return;
            if (!gameState) return;

            // Départ volontaire déjà traité via leave-game → ignorer
            if (_voluntaryLeaves.has(peerId)) {
                _voluntaryLeaves.delete(peerId);
                return;
            }

            const disconnectingPlayer = gameState.players.find(p => p.id === peerId);
            const isSpectator = disconnectingPlayer?.color === 'spectator';

            if (isSpectator) {
                // Spectateur : suppression silencieuse, pas de pause
                gameState.players.splice(gameState.players.findIndex(p => p.id === peerId), 1);
                players = players.filter(p => p.id !== peerId);
                if (gameSync) multiplayer.broadcast({ type: 'players-update', players: buildPlayersForBroadcast() });
                if (heartbeatManager) heartbeatManager._timedOut.add(peerId);
                afficherToast(`👁 ${disconnectingPlayer.name} a quitté.`);
                eventBus.emit('score-updated');
                return;
            }

            const result = gameState.markDisconnected(peerId);
            if (!result) return;

            const { player } = result;
            afficherToast(`💔 ${player.name} s'est déconnecté.`);

            // Broadcaster aux invités (marquage + index)
            if (gameSync) gameSync.syncPlayerDisconnected(peerId, player.name, gameState.currentPlayerIndex);

            // Si c'était son tour, avancer
            const wasCurrent = gameState.players.findIndex(p => p.id === peerId) === gameState.currentPlayerIndex
                            || gameState.players.find(p=>p.id===peerId)?.disconnected;
            if (wasCurrent && tuileEnMain && turnManager) {
                turnManager.updateTurnState();
                eventBus.emit('turn-changed', { isMyTurn: turnManager.isMyTurn, currentPlayer: turnManager.getCurrentPlayer() });
            }

            // Mettre en pause
            pauseGame(player.name);

            if (heartbeatManager) heartbeatManager._timedOut.add(peerId);
        };
        multiplayer.onPlayerLeft = handleDisconnect;
        _startHeartbeat(handleDisconnect);

        // ── Auto-reconnexion invité ───────────────────────────────────────────
        if (!isHost) {
            multiplayer.onHostDisconnected = () => {
                if (!gameState) return; // pas en partie, ignorer
                console.log('🔌 Connexion hôte perdue — tentative de reconnexion automatique...');
                _startAutoReconnect();
            };
        }

        // ── Reconnexion / nouvelle connexion en cours de partie ──────────────
        multiplayer.onPlayerJoined = (playerId) => {
            console.log('👤 Nouveau joueur en cours de partie:', playerId);
            // Signaler que la partie est déjà commencée
            multiplayer.sendTo(playerId, { type: 'game-in-progress' });
        };

        // Intercept les messages réseau non-sync pour gérer reconnexion
        const _prevOnData = multiplayer.onDataReceived;
        multiplayer.onDataReceived = (data, from) => {
            // Tentative de reconnexion ou nouvelle connexion en cours de partie
            if (data.type === 'player-info' && isHost && gameState) {
                const name = data.name;
                const allPlayerColors = ['black','red','pink','green','blue','yellow'];

                // Chercher un joueur déconnecté OU actif avec le même pseudo
                // (l'auto-reconnexion peut arriver avant le timeout heartbeat)
                const disconnectedEntry = gameState.findDisconnectedByName(name);
                const activeEntry = !disconnectedEntry
                    ? gameState.players.find(p => p.name === name && p.id !== from)
                    : null;
                const reconnectOldPeerId = disconnectedEntry
                    ? disconnectedEntry[0]
                    : activeEntry?.id ?? null;

                const isKnown = !!reconnectOldPeerId;

                if (!isKnown && !data.isSpectator) {
                    // ── CAS 1 : Nouveau joueur inconnu ───────────────────────
                    const takenNow    = gameState.players.map(p => p.color);
                    const freePlaying = allPlayerColors.filter(c => !takenNow.includes(c));
                    if (freePlaying.length === 0) {
                        multiplayer.sendTo(from, { type: 'rejoin-rejected', reason: 'Partie complète (6 joueurs).' });
                        return;
                    }
                    const assigned = freePlaying.includes(data.color) ? data.color : freePlaying[0];
                    gameState.addPlayer(from, name, assigned);
                    const newP = gameState.players.find(p => p.id === from);
                    if (newP) {
                        if (gameConfig.extensions?.abbot)           newP.hasAbbot       = true;
                        if (gameConfig.extensions?.largeMeeple)     newP.hasLargeMeeple = true;
                        if (gameConfig.extensions?.tradersBuilders) newP.hasBuilder     = true;
                        if (gameConfig.extensions?.pig)             newP.hasPig         = true;
                    }
                    players.push({ id: from, name, color: assigned, isHost: false });
                    sendFullStateTo(from);
                    multiplayer.broadcast({ type: 'players-update', players });
                    eventBus.emit('score-updated');
                    if (scorePanelUI) scorePanelUI.updateMobile();
                    updateTurnDisplay();
                    afficherToast(`👋 ${name} a rejoint la partie !`);
                    console.log(`👤 Nouveau joueur: ${name}`);

                } else if (!isKnown && data.isSpectator) {
                    // ── CAS 2 : Nouveau spectateur inconnu ───────────────────
                    gameState.addPlayer(from, name, 'spectator');
                    players.push({ id: from, name, color: 'spectator', isHost: false });
                    if (heartbeatManager) {
                        heartbeatManager._connectedPeers = multiplayer._connectedPeers;
                        heartbeatManager._lastPong[from] = Date.now();
                    }
                    sendFullStateTo(from);
                    multiplayer.broadcast({ type: 'players-update', players });
                    eventBus.emit('score-updated');
                    if (scorePanelUI) scorePanelUI.updateMobile();
                    updateTurnDisplay();
                    afficherToast(`👁 ${name} observe la partie.`);
                    console.log(`👁 Nouveau spectateur: ${name}`);

                } else if (isKnown && !data.isSpectator) {
                    // ── CAS 3 : Joueur connu qui revient jouer ────────────────
                    const oldPeerId = reconnectOldPeerId;
                    // Supprimer l'éventuelle entrée spec de ce joueur
                    const specIdx = gameState.players.findIndex(p => p.name === name && p.color === 'spectator');
                    if (specIdx !== -1) gameState.players.splice(specIdx, 1);
                    players = players.filter(p => !(p.name === name && p.color === 'spectator'));
                    // Restaurer le fantôme
                    if (!gameState.reconnectPlayer(oldPeerId, from)) {
                        const gsp = gameState.players.find(p => p.id === oldPeerId)
                                 || gameState.players.find(p => p.name === name && p.color !== 'spectator');
                        if (gsp) { gsp.id = from; gsp.disconnected = false; gsp.kicked = false; }
                    }
                    players = players.map(p => p.id === oldPeerId ? { ...p, id: from, disconnected: false, kicked: false } : p);
                    // Si oldPeerId avait déjà disparu de players (ex: spec intermédiaire déco),
                    // reconstruire l'entrée depuis gameState
                    if (!players.find(p => p.id === from)) {
                        const gsp2 = gameState.players.find(p => p.id === from);
                        if (gsp2) players.push({ id: from, name: gsp2.name, color: gsp2.color, isHost: false });
                    }
                    Object.values(placedMeeples).forEach(m => {
                        if (m.playerId === oldPeerId) m.playerId = from;
                    });
                    if (heartbeatManager) {
                        heartbeatManager._connectedPeers = multiplayer._connectedPeers;
                        heartbeatManager._lastPong[from] = Date.now();
                        heartbeatManager._timedOut.delete(oldPeerId);
                        delete heartbeatManager._lastPong[oldPeerId];
                    }
                    sendFullStateTo(from);
                    if (gamePaused) resumeGame('reconnected');
                    afficherToast(`✅ ${name} s'est reconnecté !`);
                    multiplayer.broadcast({ type: 'players-update', players: buildPlayersForBroadcast() });
                    eventBus.emit('score-updated');
                    if (scorePanelUI) { scorePanelUI.update(); scorePanelUI.updateMobile(); }
                    updateTurnDisplay();
                    console.log(`🔄 Reconnexion joueur: ${name} (${oldPeerId} → ${from})`);

                } else {
                    // ── CAS 4 : Joueur connu qui revient en spectateur ────────
                    // Le fantôme reste intact — on crée uniquement une entrée spec
                    gameState.addPlayer(from, name, 'spectator');
                    players.push({ id: from, name, color: 'spectator', isHost: false });
                    if (heartbeatManager) {
                        heartbeatManager._connectedPeers = multiplayer._connectedPeers;
                        heartbeatManager._lastPong[from] = Date.now();
                    }
                    // Kick auto du fantôme : le joueur a choisi de revenir en spec,
                    // on ferme la modale et on exclut proprement le fantôme.
                    _excludeDisconnectedPlayer(name);
                    sendFullStateTo(from);
                    multiplayer.broadcast({ type: 'players-update', players: buildPlayersForBroadcast() });
                    eventBus.emit('score-updated');
                    if (scorePanelUI) { scorePanelUI.update(); scorePanelUI.updateMobile(); }
                    updateTurnDisplay();
                    afficherToast(`👁 ${name} observe la partie.`);
                    console.log(`👁 Retour spectateur (fantôme conservé + kick auto): ${name}`);
                }
                return;
            }

            // Mise à jour liste joueurs en cours de partie (nouveau joueur ou reconnexion)
            if (data.type === 'players-update' && gameState) {
                players = data.players;
                const incomingIds = new Set(data.players.map(p => p.id));

                // Supprimer les joueurs absents de la liste (ex: spectateur parti)
                // mais uniquement les spectateurs — les joueurs disconnected sont conservés
                gameState.players = gameState.players.filter(gp =>
                    incomingIds.has(gp.id) || ((gp.disconnected || gp.kicked) && gp.color !== 'spectator')
                );

                // Ajouter les nouveaux joueurs manquants, ou mettre à jour l'id si reconnexion
                data.players.forEach(p => {
                    const existingById = gameState.players.find(gp => gp.id === p.id);
                    if (!existingById) {
                        // Pas trouvé par id — chercher par nom+couleur (cas reconnexion : nouveau peerId)
                        const existingByIdentity = gameState.players.find(gp =>
                            gp.name === p.name && gp.color === p.color
                        );
                        if (existingByIdentity) {
                            // Reconnexion : mettre à jour l'id uniquement
                            existingByIdentity.id = p.id;
                            existingByIdentity.disconnected = false;
                            existingByIdentity.kicked = false;
                            // Si c'est nous, corriger multiplayer.playerId immédiatement
                            if (!isHost && p.name === playerName && p.color === playerColor
                                    && p.id !== multiplayer.playerId) {
                                console.log('🔧 [players-update] Correction playerId:', multiplayer.playerId, '→', p.id);
                                multiplayer.playerId = p.id;
                                if (turnManager) turnManager.updateTurnState();
                            }
                        } else {
                            // Vraiment nouveau joueur
                            gameState.addPlayer(p.id, p.name, p.color, p.isHost ?? false);
                            const newP = gameState.players.find(gp => gp.id === p.id);
                            if (newP && gameConfig) {
                                if (gameConfig.extensions?.abbot)           newP.hasAbbot       = true;
                                if (gameConfig.extensions?.largeMeeple)     newP.hasLargeMeeple = true;
                                if (gameConfig.extensions?.tradersBuilders) newP.hasBuilder     = true;
                                if (gameConfig.extensions?.pig)             newP.hasPig         = true;
                            }
                        }
                    } else if (p.kicked) {
                        // L'hôte signale explicitement ce joueur comme kicked → propager le flag
                        existingById.kicked = true;
                    }
                });

                // Rafraîchir le score panel et l'UI mobile
                eventBus.emit('score-updated');
                if (scorePanelUI) scorePanelUI.updateMobile();
                updateTurnDisplay();
                return;
            }

            // Départ volontaire d'un invité en cours de partie
            if (data.type === 'leave-game' && isHost && gameState) {
                const leavingPlayer = gameState.players.find(p => p.id === from);
                if (leavingPlayer) {
                    // Marquer départ volontaire pour que onPlayerLeft ne déclenche pas pauseGame
                    _voluntaryLeaves.add(from);
                    leavingPlayer.disconnected = true;
                    _excludeDisconnectedPlayer(leavingPlayer.name);
                }
                return;
            }

            // Tous les autres messages → handler normal
            if (_prevOnData) _prevOnData(data, from);
        };
    }
}

// ═══════════════════════════════════════════════════════
// MOBILE — Mise à jour de l'UI
// ═══════════════════════════════════════════════════════

/**
 * Met à jour la barre joueurs mobile
 */
/**
 * Met à jour le style de la carte mobile du joueur actif selon le tour bonus
 */
function _updateMobileActiveBonusStyle(isBonusTurn, isDragonTurn = false) {
    if (!isMobile()) return;
    const currentPlayer = gameState?.getCurrentPlayer();
    if (!currentPlayer) return;
    document.querySelectorAll('.mobile-player-card').forEach(card => {
        card.classList.remove('active-bonus', 'active-dragon');
        if (card.dataset.playerId === currentPlayer.id) {
            if (isDragonTurn)      card.classList.add('active-dragon');
            else if (isBonusTurn)  card.classList.add('active-bonus');
        }
    });
}



/**
 * Met à jour la preview de tuile mobile
 */
function updateMobileTilePreview() {
    if (!isMobile()) return;
    const preview = document.getElementById('mobile-tile-preview');
    const counter = document.getElementById('mobile-tile-counter');
    if (!preview) return;

    if (tuileEnMain) {
        preview.innerHTML = `<img id="mobile-tile-img" src="${tuileEnMain.imagePath}" style="transform: rotate(${tuileEnMain.rotation}deg);">`;
    } else {
        preview.innerHTML = '<img src="./assets/verso.png">';
    }

    if (counter && deck) {
        counter.textContent = `${deck.remaining()} / ${deck.total()}`;
    }
}

/**
 * Met à jour l'état des boutons mobile (actif/inactif)
 */
function updateMobileButtons() {
    if (!isMobile()) return;

    const endBtn  = document.getElementById('mobile-end-turn-btn');
    const undoBtn = document.getElementById('mobile-undo-btn');

    if (endBtn) {
        if (finalScoresManager?.gameEnded) {
            endBtn.textContent = '📊 Scores';
            endBtn.disabled = false;
        } else if (waitingToRedraw && isMyTurn) {
            endBtn.textContent = '🎲 Repiocher';
            endBtn.disabled = false;
        } else {
            endBtn.textContent = 'Terminer mon tour';
            const isDragonPhaseM = !!(gameConfig?.extensions?.dragon && gameState?.dragonPhase?.active);
            const dragonMoverM   = isDragonPhaseM ? gameState.players[gameState.dragonPhase.moverIndex] : null;
            const isMyDragonM    = isDragonPhaseM && dragonMoverM?.id === multiplayer.playerId;
            const canEnd = isMyTurn && tuilePosee && !isDragonPhaseM ||
                           isMyDragonM && !!undoManager?.dragonMovePlacedThisTurn;
            endBtn.disabled = !canEnd;
        }
        endBtn.style.opacity = endBtn.disabled ? '0.4' : '1';
    }

    if (undoBtn) {
        const isDragonPhaseU2 = !!(gameConfig?.extensions?.dragon && gameState?.dragonPhase?.active);
        const dragonMoverU2   = isDragonPhaseU2 ? gameState.players[gameState.dragonPhase.moverIndex] : null;
        const isMyDragonU2    = isDragonPhaseU2 && dragonMoverU2?.id === multiplayer.playerId;
        const canUndo = !finalScoresManager?.gameEnded && (
            isMyDragonU2 && !!undoManager?.dragonMovePlacedThisTurn ||
            !isDragonPhaseU2 && isMyTurn && (isHost ? !!undoManager?.canUndo() : !!tuilePosee)
        );
        undoBtn.disabled = !canUndo;
        undoBtn.style.opacity = canUndo ? '1' : '0.4';
    }
}

// ═══════════════════════════════════════════════════════
// FONCTIONS JEU
// ═══════════════════════════════════════════════════════
function updateTurnDisplay() {
    if (!gameState || gameState.players.length === 0) {
        // Partie pas encore prête : griser le bouton plutôt que laisser le style CSS par défaut
        isMyTurn = false;
        const endTurnBtn = document.getElementById('end-turn-btn');
        if (endTurnBtn) {
            endTurnBtn.textContent = 'Terminer mon tour';
            endTurnBtn.disabled = true;
            endTurnBtn.style.opacity    = '0.5';
            endTurnBtn.style.cursor     = 'not-allowed';
            endTurnBtn.style.background = '';
            endTurnBtn.style.color      = '';
        }
        return;
    }

    const currentPlayer = gameState.getCurrentPlayer();
    isMyTurn = currentPlayer.id === multiplayer.playerId && !_isSpectator();

    const endTurnBtn = document.getElementById('end-turn-btn');
    if (endTurnBtn) {
        if (finalScoresManager?.gameEnded) {
            endTurnBtn.textContent = '📊 Détails des scores';
            endTurnBtn.disabled   = false;
            endTurnBtn.style.opacity = '1';
            endTurnBtn.style.cursor  = 'pointer';
            endTurnBtn.classList.add('final-score-btn');
        } else if (waitingToRedraw && isMyTurn) {
            endTurnBtn.textContent = '🎲 Repiocher';
            endTurnBtn.disabled   = false;
            endTurnBtn.style.opacity = '1';
            endTurnBtn.style.cursor  = 'pointer';
            endTurnBtn.classList.remove('final-score-btn');
        } else {
            endTurnBtn.textContent = 'Terminer mon tour';
            endTurnBtn.classList.remove('final-score-btn');
            const isDragonPhase  = !!(gameConfig?.extensions?.dragon && gameState?.dragonPhase?.active);
            const dragonMoverEnd = isDragonPhase ? gameState.players[gameState.dragonPhase.moverIndex] : null;
            const isMyDragonEnd  = isDragonPhase && dragonMoverEnd?.id === multiplayer.playerId;
            // Pendant la phase dragon : terminer seulement si le mover a déplacé le dragon ce tour
            const canEnd = isMyTurn && tuilePosee && !isDragonPhase ||
                           isMyDragonEnd && !!undoManager?.dragonMovePlacedThisTurn;
            endTurnBtn.disabled = !canEnd;
            endTurnBtn.style.opacity = canEnd ? '1' : '0.5';
            endTurnBtn.style.cursor  = canEnd ? 'pointer' : 'not-allowed';
            endTurnBtn.style.background = canEnd ? '#2ecc71' : '';
            endTurnBtn.style.color      = canEnd ? '#000' : '';
        }
    }

    const undoBtn = document.getElementById('undo-btn');
    if (undoBtn) {
        const isDragonPhaseU = !!(gameConfig?.extensions?.dragon && gameState?.dragonPhase?.active);
        const dragonMoverU   = isDragonPhaseU ? gameState.players[gameState.dragonPhase.moverIndex] : null;
        const isMyDragonU    = isDragonPhaseU && dragonMoverU?.id === multiplayer.playerId;
        const canUndo = !finalScoresManager?.gameEnded && (
            isMyDragonU && !!undoManager?.dragonMovePlacedThisTurn ||
            !isDragonPhaseU && isMyTurn && (isHost ? !!undoManager?.canUndo() : !!tuilePosee)
        );
        undoBtn.disabled = !canUndo;
        undoBtn.style.opacity    = canUndo ? '1' : '0.5';
        undoBtn.style.cursor     = canUndo ? 'pointer' : 'not-allowed';
        undoBtn.style.background = canUndo ? '#f1c40f' : '';
        undoBtn.style.color      = canUndo ? '#000' : '';
    }

    scorePanelUI?.updateMobile();

    // Mettre à jour le contour doré si tour bonus, rouge si tour dragon
    const isBonusTurn  = turnManager?.isBonusTurn ?? false;
    const isDragonTurn = !!(gameConfig?.extensions?.dragon && gameState?.dragonPhase?.active);
    console.log('🐉 [updateTurnDisplay] isDragonTurn:', isDragonTurn, '| dragonPhase.active:', gameState?.dragonPhase?.active, '| isBonusTurn:', isBonusTurn);
    if (scorePanelUI) scorePanelUI.onTurnChanged(isBonusTurn, isDragonTurn);
    _updateMobileActiveBonusStyle(isBonusTurn, isDragonTurn);

    updateMobileButtons();
    eventBus.emit('score-updated');

    // Fermer le toast du tour bonus dès qu'il se termine
    if (!isBonusTurn) {
        const toast = document.getElementById('disconnect-toast');
        if (toast && toast.dataset.isBonusToast === 'true') {
            toast.style.opacity = '0';
            setTimeout(() => { if (toast) toast.style.display = 'none'; }, 400);
            delete toast.dataset.isBonusToast;
        }
    }
}

function afficherMessage(msg) {
    document.getElementById('tile-preview').innerHTML =
        `<p style="text-align: center; color: white;">${msg}</p>`;
}

function hideToast() {
    const toast = document.getElementById('disconnect-toast');
    if (!toast || toast.style.display === 'none') return;
    toast.style.opacity = '0';
    setTimeout(() => { toast.style.display = 'none'; }, 400);
}

function afficherToast(msg, type = 'error') {
    const borderColor = type === 'bonus' ? 'gold'
                      : type === 'success' ? '#2ecc71'
                      : type === 'info'    ? '#3498db'
                      :                      '#e74c3c'; // 'error' par défaut
    let toast = document.getElementById('disconnect-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'disconnect-toast';
        document.body.appendChild(toast);
    }
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(30,30,30,0.92);
        color: white;
        padding: 12px 20px 12px 24px;
        border-radius: 10px;
        border-left: 4px solid ${borderColor};
        font-size: 15px;
        font-weight: bold;
        z-index: 9999;
        box-shadow: 0 4px 20px rgba(0,0,0,0.5);
        display: flex;
        align-items: center;
        gap: 16px;
        transition: opacity 0.4s;
    `;

    toast.innerHTML = '';

    const text = document.createElement('span');
    text.textContent = msg;
    toast.appendChild(text);

    const close = document.createElement('span');
    close.textContent = '✕';
    close.style.cssText = `
        cursor: pointer;
        font-size: 14px;
        opacity: 0.7;
        flex-shrink: 0;
    `;
    close.onmouseenter = () => close.style.opacity = '1';
    close.onmouseleave = () => close.style.opacity = '0.7';
    close.onclick = () => {
        toast.style.opacity = '0';
        setTimeout(() => { toast.style.display = 'none'; }, 400);
    };
    toast.appendChild(close);

    toast.style.opacity = '1';
    toast.style.display = 'flex';
}

/**
 * Gérer une annulation reçue d'un autre joueur
 */
/**
 * Applique visuellement un undo localement (hôte ou invité).
 * Appelé depuis le bouton undo (hôte), onUndoRequest (hôte pour invité), et handleRemoteUndo (invités).
 */
function _applyUndoLocally(undoneAction) {
    // Cas dragon : annuler un déplacement dragon
    if (undoneAction.type === 'dragon-move-undo') {
        // Retirer visuellement les meeples qui ont été remis (snapshot restauré par undoDragonMove)
        // Resynchro visuelle : retirer tous les meeples DOM et les remettre depuis placedMeeples
        document.querySelectorAll('.meeple').forEach(el => el.remove());
        Object.entries(placedMeeples).forEach(([key, meeple]) => {
            const [mx, my, mp] = key.split(',').map(Number);
            eventBus.emit('meeple-placed', {
                ...meeple, x: mx, y: my, key, position: mp,
                meepleType: meeple.type, playerColor: meeple.color,
                fromUndo: true, skipSync: true
            });
        });
        // Remettre le dragon à sa position précédente
        if (gameState.dragonPos) {
            _renderDragonPiece(gameState.dragonPos.x, gameState.dragonPos.y);
        }
        // Remettre la fée
        if (gameConfig.extensions?.fairyProtection) {
            const fs = gameState.fairyState;
            if (fs?.meepleKey) _renderFairyPiece(fs.meepleKey);
            else _removeFairyPiece();
        }
        _updateDragonOverlay();
        // Réafficher les curseurs dragon pour ce joueur
        if (dragonRules && gameState.dragonPhase.active) {
            const mover = gameState.players[gameState.dragonPhase.moverIndex];
            if (mover?.id === multiplayer.playerId) {
                const validMoves = dragonRules.getValidDragonMoves();
                _showDragonMoveCursors(validMoves);
            }
        }
        eventBus.emit('score-updated');
        updateTurnDisplay();
        return;
    }

    if (undoneAction.type === 'abbe-recalled-undo') {
        pendingAbbePoints = null;
        const { playerId } = undoneAction.abbe;
        const player = gameState.players.find(p => p.id === playerId);
        if (player) player.hasAbbot = false;
        const abbeKey = undoneAction.abbe.key;
        const abbeData = placedMeeples[abbeKey];
        if (abbeData) {
            const [ax, ay] = abbeKey.split(',').map(Number);
            eventBus.emit('meeple-placed', { ...abbeData, x: ax, y: ay, key: abbeKey, position: parseInt(abbeKey.split(',')[2]), meepleType: abbeData.type, playerColor: abbeData.color, fromUndo: true, skipSync: true });
        }
        if (gameSync) gameSync.syncAbbeRecallUndo(
            undoneAction.abbe.x, undoneAction.abbe.y, abbeKey, playerId
        );
        if (lastPlacedTile && meepleCursorsUI && isMyTurn) {
            const _lastTile = plateau.placedTiles[`${lastPlacedTile.x},${lastPlacedTile.y}`];
            const _isVolcano = !!(gameConfig.tileGroups?.dragon && gameConfig.extensions?.dragon && _tileHasVolcanoZone(_lastTile));
            if (!_isVolcano) {
                meepleCursorsUI.showCursors(lastPlacedTile.x, lastPlacedTile.y, gameState, placedMeeples, afficherSelecteurMeeple);
            }
            _showMeepleActionCursors();
        }
        eventBus.emit('score-updated');
        updateTurnDisplay();
        return;
    }

    if (undoneAction.type === 'meeple') {
        if (undoneAction.meeple?.key) {
            // Undo placement meeple normal : retirer le meeple DOM
            document.querySelectorAll(`.meeple[data-key="${undoneAction.meeple.key}"]`).forEach(el => el.remove());
        } else {
            // Undo éjection princesse (meeple=null) : re-rendre tous les meeples du snapshot
            document.querySelectorAll('.meeple').forEach(el => el.remove());
            Object.entries(placedMeeples).forEach(([key, meeple]) => {
                const [mx, my, mp] = key.split(',').map(Number);
                eventBus.emit('meeple-placed', {
                    ...meeple, x: mx, y: my, key, position: mp,
                    meepleType: meeple.type, playerColor: meeple.color,
                    fromUndo: true, skipSync: true
                });
            });
            // Re-détecter les cibles princesse pour la tuile posée ce tour
            if (lastPlacedTile && gameConfig.extensions?.princess && dragonRules && zoneMerger) {
                const _undoTile = plateau.placedTiles[`${lastPlacedTile.x},${lastPlacedTile.y}`];
                if (_undoTile) {
                    const _hasPrincess = _undoTile.zones?.some(z => z.type === 'city' && z.features?.includes?.('princess'));
                    if (_hasPrincess) {
                        const targets = dragonRules.getPrincessTargets(lastPlacedTile.x, lastPlacedTile.y, _undoTile, multiplayer.playerId, zoneMerger);
                        if (targets.length > 0) {
                            gameState._pendingPrincessTile = { x: lastPlacedTile.x, y: lastPlacedTile.y, targets };
                        }
                    }
                }
            }
        }
        // Restaurer le rendu de la fée
        if (gameConfig.extensions?.fairyProtection || gameConfig.extensions?.fairyScoreTurn || gameConfig.extensions?.fairyScoreZone) {
            const fs = gameState.fairyState;
            if (fs?.meepleKey) _renderFairyPiece(fs.meepleKey);
            else _removeFairyPiece();
        }
        if (lastPlacedTile && meepleCursorsUI && isMyTurn) {
            const _undoTile = plateau.placedTiles[`${lastPlacedTile.x},${lastPlacedTile.y}`];
            const _undoIsVolcano = !!(gameConfig.tileGroups?.dragon && gameConfig.extensions?.dragon && _tileHasVolcanoZone(_undoTile));
            if (!_undoIsVolcano) {
                meepleCursorsUI.showCursors(lastPlacedTile.x, lastPlacedTile.y, gameState, placedMeeples, afficherSelecteurMeeple);
            }
            _showMeepleActionCursors();
        }

    } else if (undoneAction.type === 'tile') {
        lastPlacedTile = undoneAction.restoredLastPlacedTile ?? null;
        const { x, y } = undoneAction.tile;
        let tileEl = document.querySelector(`.tile[data-pos="${x},${y}"]`);
        if (!tileEl) {
            tileEl = Array.from(document.querySelectorAll('.tile'))
                .find(el => el.style.gridColumn == x && el.style.gridRow == y);
        }
        if (tileEl) tileEl.remove();

        tuileEnMain = undoneAction.tile.tile;
        tuilePosee  = false;

        if (x === 50 && y === 50) {
            firstTilePlaced = false;
            if (slotsUI)       { slotsUI.firstTilePlaced = false; slotsUI.currentTile = null; }
            if (tilePlacement) tilePlacement.firstTilePlaced = false;
        }

        if (tilePreviewUI) tilePreviewUI.showTile(tuileEnMain);
        if (slotsUI) slotsUI.tileAvailable = true;

        eventBus.emit('tile-drawn', {
            tileData: { ...tuileEnMain, rotation: tuileEnMain.rotation },
            fromUndo: true
        });

        if (x === 50 && y === 50) {
            document.querySelectorAll('.slot-central').forEach(s => s.remove());
            if (slotsUI) slotsUI.createCentralSlot();
        }

        if (slotsUI && firstTilePlaced) slotsUI.refreshAllSlots();
        _hideAllCursors();
    }
}

function handleRemoteUndo(undoneAction) {
    console.log('⏪ [REMOTE] Application annulation distante:', undoneAction.type);

    // Restaurer l'état post-undo envoyé par l'hôte
    const s = undoneAction.postUndoState;
    if (s) {
        // Plateau : retirer les tuiles non présentes dans le snapshot
        Object.keys(plateau.placedTiles).forEach(key => {
            if (!s.placedTileKeys.includes(key)) delete plateau.placedTiles[key];
        });
        // Zones
        zoneMerger.registry.deserialize(s.zones);
        zoneMerger.tileToZone = new Map(s.tileToZone);
        // Meeples placés
        Object.keys(placedMeeples).forEach(k => delete placedMeeples[k]);
        Object.assign(placedMeeples, JSON.parse(JSON.stringify(s.placedMeeples)));
        // Compteurs joueurs
        s.playerMeeples.forEach(saved => {
            const player = gameState.players.find(p => p.id === saved.id);
            if (player) {
                player.meeples       = saved.meeples;
                player.hasAbbot      = saved.hasAbbot;
                player.hasLargeMeeple = saved.hasLargeMeeple;
                player.hasBuilder    = saved.hasBuilder;
                player.hasPig        = saved.hasPig;
            }
        });
        // Restaurer et afficher la fée
        if (s.fairyState !== undefined && gameState.fairyState) {
            gameState.fairyState.ownerId   = s.fairyState.ownerId;
            gameState.fairyState.meepleKey = s.fairyState.meepleKey;
            gameState.players.forEach(p => { p.hasFairy = false; });
            const fairyOwner = gameState.players.find(p => p.id === s.fairyState.ownerId);
            if (fairyOwner) fairyOwner.hasFairy = true;
            if (s.fairyState.meepleKey) _renderFairyPiece(s.fairyState.meepleKey);
            else _removeFairyPiece();
        }
        if (s.dragonPos !== undefined) {
            gameState.dragonPos   = s.dragonPos;
            gameState.dragonPhase = { ...gameState.dragonPhase, ...s.dragonPhase };
            if (gameState.dragonPos) _renderDragonPiece(gameState.dragonPos.x, gameState.dragonPos.y);
        }
    }

    // Synchroniser les flags de l'UndoManager local (côté invité) avec l'état annulé
    // car l'UndoManager de l'invité n'a pas exécuté undo() lui-même.
    if (undoManager) {
        if (undoneAction.type === 'meeple' && isMyTurn) {
            undoManager.meeplePlacedThisTurn = false;
            undoManager.lastMeeplePlaced     = null;
        } else if (undoneAction.type === 'tile' && isMyTurn) {
            undoManager.tilePlacedThisTurn       = false;
            undoManager.meeplePlacedThisTurn     = false;
            undoManager.abbeRecalledThisTurn     = false;
            undoManager.lastTilePlaced           = null;
            undoManager.lastMeeplePlaced         = null;
            undoManager.afterTilePlacedSnapshot  = null;
        } else if (undoneAction.type === 'abbe-recalled-undo' && isMyTurn) {
            undoManager.abbeRecalledThisTurn = false;
            undoManager.lastAbbeRecalled     = null;
        } else if (undoneAction.type === 'dragon-move-undo') {
            // Toujours réinitialiser, même si isMyTurn est false (phase dragon)
            undoManager.dragonMovePlacedThisTurn = false;
            undoManager.dragonMoveSnapshot       = null;
        }
    }

    // Appliquer visuellement (sans curseurs — ce n'est pas notre tour)
    _applyUndoLocally(undoneAction);

    gameState.players.forEach(p => eventBus.emit('meeple-count-updated', { playerId: p.id }));
    eventBus.emit('score-updated');
    updateTurnDisplay();
}

function poserTuile(x, y, tile, isFirst = false) {
    console.log('🎯 poserTuile appelé:', { x, y, tile, isFirst });

    if (gameSync && !isHost) {
        // ✅ Étape 2 : invité purement réactif — envoie une request, attend le broadcast hôte
        // L'UI sera mise à jour à la réception de tile-placed (via poserTuileSync)
        document.querySelectorAll('.slot').forEach(s => s.remove());
        if (tilePreviewUI) tilePreviewUI.showBackside();
        tuileEnMain = null;
        updateMobileTilePreview();
        updateMobileButtons();
        updateTurnDisplay();
        gameSync.syncTilePlacementRequest(x, y, tile);
        return;
    }

    // Hôte ou solo : applique localement
    const success = tilePlacement.placeTile(x, y, tile, { isFirst });
    if (!success) return;

    tuilePosee      = true;
    firstTilePlaced = true;
    lastPlacedTile  = { x, y };
    gameState.currentTilePlaced = true;
    currentTileForPlayer = null;

    if (unplaceableManager) unplaceableManager.resetSeenImplacable();

    document.querySelectorAll('.slot').forEach(s => s.remove());
    if (tilePreviewUI) tilePreviewUI.showBackside();
    updateMobileButtons();
    updateTurnDisplay();

    if (gameSync) gameSync.syncTilePlacement(x, y, tile, zoneMerger);

    // ── Extension Dragon : détecter volcano et zone dragon (avant curseurs) ──
    const _isVolcanoTile = !!(gameConfig.tileGroups?.dragon && gameConfig.extensions?.dragon && _tileHasVolcanoZone(tile));
    if (gameConfig.tileGroups?.dragon && gameConfig.extensions?.dragon && dragonRules) {
        if (_isVolcanoTile) {
            gameState._pendingVolcanoPos = { x, y };
            console.log('🌋 [Dragon] Volcano posé en (' + x + ',' + y + ') — migration en fin de tour');
        }
        if (_tileHasDragonZone(tile)) {
            gameState._pendingDragonTile = { x, y, playerIndex: gameState.currentPlayerIndex };
            console.log('🐉 [Dragon] Tuile dragon posée — phase dragon en attente après meeple');
        }
    }

    // ── Extension Princesse : proposer d'éjecter un meeple de la ville ──
    const _hasPrincessZone = !!(gameConfig.tileGroups?.dragon && gameConfig.extensions?.princess
        && tile.zones?.some(z => z.type === 'city' && z.features?.includes?.('princess')));
    if (_hasPrincessZone && dragonRules && isMyTurn) {
        const targets = dragonRules.getPrincessTargets(x, y, tile, multiplayer.playerId, zoneMerger);
        if (targets.length > 0) {
            gameState._pendingPrincessTile = { x, y, targets };
            console.log(`👸 [Princess] ${targets.length} cible(s) éjectable(s)`);
        }
    }

    if (isMyTurn && gameSync && meepleCursorsUI && !undoManager?.abbeRecalledThisTurn) {
        // Volcano : pas de placement de meeple autorisé sur la tuile
        if (!_isVolcanoTile) {
            meepleCursorsUI.showCursors(x, y, gameState, placedMeeples, afficherSelecteurMeeple);
        }
        _showMeepleActionCursors();
    }

    if (undoManager && isMyTurn && isHost) {
        undoManager.saveAfterTilePlaced(x, y, tile, placedMeeples);
    }

    tuileEnMain = null;
    updateMobileTilePreview();
    updateTurnDisplay();
}

function poserTuileSync(x, y, tile, extraOptions = {}) {
    console.log('🔄 poserTuileSync appelé:', { x, y, tile });

    const isFirst = !firstTilePlaced;

    // Mettre tuileEnMain à null AVANT placeTile() (émet 'tile-placed' de façon synchrone)
    tuileEnMain = null;
    updateMobileTilePreview();

    tilePlacement.placeTile(x, y, tile, { isFirst, skipSync: true, ...extraOptions });

    if (!firstTilePlaced) firstTilePlaced = true;
    tuilePosee     = true;
    lastPlacedTile = { x, y };

    // ── Extension Dragon : détecter volcano/dragon pour les tuiles reçues du réseau ──
    if (gameConfig.tileGroups?.dragon && gameConfig.extensions?.dragon && dragonRules) {
        if (_tileHasVolcanoZone(tile)) {
            gameState._pendingVolcanoPos = { x, y };
        }
        if (_tileHasDragonZone(tile)) {
            gameState._pendingDragonTile = { x, y, playerIndex: gameState.currentPlayerIndex };
        }
    }
}

// ═══════════════════════════════════════════════════════
// ABBÉ — Rappel anticipé
// ═══════════════════════════════════════════════════════

/**
 * Rappeler l'Abbé depuis le plateau
 * Appelé quand le joueur clique sur l'Abbé rappelable en phase 2
 */
function handleAbbeRecall(x, y, key, meeple) {
    console.log('↩️ Rappel Abbé:', key);

    // Calculer les points (abbaye/jardin : tuile centrale + adjacentes)
    const points = _countAbbePoints(x, y);

    // Retirer l'Abbé du plateau visuellement
    document.querySelectorAll(`.meeple[data-key="${key}"]`).forEach(el => el.remove());

    // Mettre à jour placedMeeples
    delete placedMeeples[key];
    _releaseFairyIfDetached(key);

    // Rendre l'Abbé au joueur
    const player = gameState.players.find(p => p.id === meeple.playerId);
    if (player) {
        player.hasAbbot = true;
        eventBus.emit('meeple-count-updated', { playerId: meeple.playerId });
    }

    // Cacher les overlays
    _hideAllCursors();

    // Marquer dans UndoManager
    if (undoManager) undoManager.markAbbeRecalled(x, y, key, meeple.playerId, points);

    // Stocker les points à ajouter en fin de tour
    pendingAbbePoints = { playerId: meeple.playerId, points };

    // Sync réseau
    if (gameSync) gameSync.syncAbbeRecall(x, y, key, meeple.playerId, points);

    updateTurnDisplay();
    updateMobileButtons();
    eventBus.emit('score-updated');
}

/**
 * Compter les points d'un Abbé/Jardin à la position (x,y)
 * = 1 (tuile centrale) + nombre de tuiles adjacentes (max 8)
 */
function _countAbbePoints(x, y) {
    let count = 1; // la tuile elle-même
    const dirs = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
    dirs.forEach(([dx, dy]) => {
        if (plateau.placedTiles[`${x+dx},${y+dy}`]) count++;
    });
    return count;
}

// ═══════════════════════════════════════════════════════
// MEEPLES
// ═══════════════════════════════════════════════════════
// ── Dragon prématuré : modales 1 et 2 ────────────────────────────────

// Invités : modale dragon prématuré
// - joueur actif : badge + modale 1 pour confirmer le remélange (via handleConfirm)
// - autres invités : modale info seulement
eventBus.on('network-dragon-premature', (data) => {
    if (isHost) return;
    const isActivePlayer = data.playerId === multiplayer.playerId;
    console.log('🐉 [INVITÉ] network-dragon-premature — data.playerId:', data.playerId, '| multiplayer.playerId:', multiplayer.playerId, '| isActivePlayer:', isActivePlayer);
    if (isActivePlayer) {
        unplaceableManager?.showUnplaceableBadgeDragon(data.tileId);
    } else {
        unplaceableManager?.showTileDestroyedModal(data.tileId, data.playerName, false, 'dragon-reshuffle', false);
    }
});

eventBus.on('network-princess-ejected', (data) => {
    // L'hôte applique si c'est un invité qui a éjecté (pas lui-même)
    // L'invité applique toujours (broadcast de l'hôte ou d'un autre invité)
    if (isHost && data.playerId === multiplayer.playerId) return;

    const { meepleKey, orphanKeys = [] } = data;

    // Retirer le meeple éjecté
    document.querySelectorAll(`.meeple[data-key="${meepleKey}"]`).forEach(el => el.remove());
    const meeple = placedMeeples[meepleKey];
    if (meeple) {
        const player = gameState.players.find(p => p.id === meeple.playerId);
        if (player) {
            if (meeple.type === 'Abbot') player.hasAbbot = true;
            else if (meeple.type === 'Large' || meeple.type === 'Large-Farmer') player.hasLargeMeeple = true;
            else if (meeple.type === 'Builder') player.hasBuilder = true;
            else if (meeple.type === 'Pig') player.hasPig = true;
            else if (player.meeples < 7) player.meeples++;
        }
        delete placedMeeples[meepleKey];
    }

    // Retirer les bâtisseurs orphelins
    orphanKeys.forEach(key => {
        const m = placedMeeples[key];
        if (!m) return;
        const p = gameState.players.find(pl => pl.id === m.playerId);
        if (p) p.hasBuilder = true;
        delete placedMeeples[key];
        document.querySelectorAll(`.meeple[data-key="${key}"]`).forEach(el => el.remove());
    });

    // L'hôte met aussi à jour undoManager pour que l'undo fonctionne côté hôte
    if (isHost && undoManager) {
        undoManager.meeplePlacedThisTurn = true;
        undoManager.lastMeeplePlaced     = null;
    }

    eventBus.emit('meeple-count-updated', {});
    eventBus.emit('score-updated');
    afficherToast('👸 Meeple éjecté par la Princesse !', 'info');
});

// ── Fée : affichage des cibles et placement ───────────────────────────
/**
 * Affiche des curseurs sur tous les meeples du joueur actif
 * auxquels la fée peut s'attacher. Cliquable comme les curseurs abbé.
 */
/**
 * Exécute l'éjection princesse d'un meeple.
 * @param {string} meepleKey
 */
function _handlePrincessEject(meepleKey) {
    // Nettoyer TOUS les curseurs (action + placement meeple normal)
    _hideAllCursors();
    document.querySelectorAll('.meeple-action-cursor, .meeple-action-overlay').forEach(el => el.remove());
    gameState._pendingPrincessTile = null;

    if (!dragonRules) return;
    dragonRules.executePrincess(meepleKey);

    // L'éjection princesse est une action meeple — désactive les curseurs
    // et permet l'undo via afterTilePlacedSnapshot (même comportement que pose de meeple)
    if (undoManager) {
        undoManager.meeplePlacedThisTurn = true;
        undoManager.lastMeeplePlaced     = null; // pas de meeple DOM à retirer, juste restaurer le snapshot
    }

    // Retirer visuellement le meeple éjecté
    document.querySelectorAll(`.meeple[data-key="${meepleKey}"]`).forEach(el => el.remove());
    const meeple = placedMeeples[meepleKey];
    if (meeple) {
        const player = gameState.players.find(p => p.id === meeple.playerId);
        if (player) {
            if (meeple.type === 'Abbot') player.hasAbbot = true;
            else if (meeple.type === 'Large' || meeple.type === 'Large-Farmer') player.hasLargeMeeple = true;
            else if (meeple.type === 'Builder') player.hasBuilder = true;
            else if (meeple.type === 'Pig') player.hasPig = true;
            else if (player.meeples < 7) player.meeples++;
        }
        delete placedMeeples[meepleKey];
    }

    // Bâtisseur orphelin : si le meeple éjecté était le dernier normal dans sa zone
    // (pas de cochon — il n'existe que dans les champs, pas les villes)
    const orphanKeys = [];
    if (zoneMerger) {
        for (const [key, m] of Object.entries(placedMeeples)) {
            if (m.type !== 'Builder') continue;
            const parts = key.split(',');
            const bx = Number(parts[0]), by = Number(parts[1]), bp = Number(parts[2]);
            const zoneId = zoneMerger.findMergedZoneForPosition(bx, by, bp)?.id;
            if (zoneId == null) continue;
            const hasNormalMeeple = Object.entries(placedMeeples).some(([k2, m2]) => {
                if (k2 === key) return false;
                if (m2.playerId !== m.playerId) return false;
                if (m2.type === 'Builder' || m2.type === 'Pig') return false;
                const [x2, y2, p2] = k2.split(',').map(Number);
                return zoneMerger.findMergedZoneForPosition(x2, y2, p2)?.id === zoneId;
            });
            if (!hasNormalMeeple) orphanKeys.push(key);
        }
        orphanKeys.forEach(key => {
            const m = placedMeeples[key];
            const p = gameState.players.find(pl => pl.id === m.playerId);
            if (p) p.hasBuilder = true;
            delete placedMeeples[key];
            document.querySelectorAll(`.meeple[data-key="${key}"]`).forEach(el => el.remove());
        });
    }

    // Broadcast aux invités
    if (gameSync) {
        gameSync.multiplayer.broadcast({
            type: 'princess-ejected',
            meepleKey,
            orphanKeys,
            playerId: multiplayer.playerId
        });
        gameSync.syncScoreUpdate([], [], [], zoneMerger);
    }

    eventBus.emit('meeple-count-updated', {});
    eventBus.emit('score-updated');
    afficherToast('👸 Meeple éjecté par la Princesse !', 'success');
}

function _showMeepleActionCursors() {
    document.querySelectorAll('.meeple-action-cursor, .meeple-action-overlay').forEach(el => el.remove());

    if (!gameState || !meepleCursorsUI) return;
    const boardEl = document.getElementById('board');
    if (!boardEl) return;

    const currentFairyKey  = gameState.fairyState?.meepleKey ?? null;
    const pendingPrincess  = gameState._pendingPrincessTile ?? null;
    const princessTargetSet = new Set(pendingPrincess?.targets ?? []);
    console.log(`👸 [_showMeepleActionCursors] pendingPrincess:`, pendingPrincess, '| princessTargets:', [...princessTargetSet], '| placedMeeples:', Object.keys(placedMeeples));

    const actionsByKey = {};

    // 1. Rappel abbé
    if (gameConfig?.extensions?.abbot && !undoManager?.abbeRecalledThisTurn) {
        Object.entries(placedMeeples).forEach(([key, meeple]) => {
            if (meeple.type?.toLowerCase() !== 'abbot' || meeple.playerId !== multiplayer.playerId) return;
            actionsByKey[key] = actionsByKey[key] ?? [];
            actionsByKey[key].push({ type: 'abbe-recall', meeple });
        });
    }

    // 2. Attacher la fée (placement physique nécessite dragonRules)
    const _fairyEnabled = dragonRules && (
        gameConfig?.extensions?.fairyProtection
     || gameConfig?.extensions?.fairyScoreTurn
     || gameConfig?.extensions?.fairyScoreZone
    );
    if (_fairyEnabled && !undoManager?.meeplePlacedThisTurn) {
        const fairyTargets = dragonRules.getFairyTargets(multiplayer.playerId);
        fairyTargets.forEach(({ key, meeple }) => {
            if (key === currentFairyKey) return;
            actionsByKey[key] = actionsByKey[key] ?? [];
            actionsByKey[key].push({ type: 'fairy', meeple });
        });
    }

    // 3. Éjection princesse
    if (pendingPrincess) {
        princessTargetSet.forEach(key => {
            const meeple = placedMeeples[key];
            if (!meeple) return;
            actionsByKey[key] = actionsByKey[key] ?? [];
            actionsByKey[key].push({ type: 'princess', meeple });
        });
    }

    if (Object.keys(actionsByKey).length === 0) {
        if (pendingPrincess && princessTargetSet.size === 0) gameState._pendingPrincessTile = null;
        return;
    }

    Object.entries(actionsByKey).forEach(([key, actions]) => {
        const meeple = placedMeeples[key];
        if (!meeple) return;
        const parts   = key.split(',');
        const mx      = Number(parts[0]), my = Number(parts[1]), mp = Number(parts[2]);
        const row     = Math.floor((mp - 1) / 5);
        const col     = (mp - 1) % 5;
        const offsetX = 20.8 + col * 41.6;
        const offsetY = 20.8 + row * 41.6;

        const overlay = document.createElement('div');
        overlay.className        = 'meeple-action-overlay';
        overlay.style.gridColumn = mx;
        overlay.style.gridRow    = my;
        overlay.style.cssText   += 'position:relative;width:208px;height:208px;pointer-events:none;z-index:101;';

        const btn = document.createElement('div');
        btn.className = 'meeple-action-cursor';
        btn.dataset.key = key;
        btn.style.cssText = `position:absolute;left:${offsetX}px;top:${offsetY}px;width:32px;height:32px;border-radius:50%;border:3px solid rgb(200,0,175);box-shadow:0 0 8px 2px rgba(200,0,175,0.7),inset 0 0 4px rgba(0,0,0,0.8);cursor:pointer;pointer-events:auto;transform:translate(-50%,-50%);animation:abbeRecallPulse 1.2s ease-in-out infinite;`;

        const openSelector = (clientX, clientY) => {
            const oldSel = document.getElementById('meeple-selector');
            if (oldSel) oldSel.remove();

            const selector = document.createElement('div');
            selector.id = 'meeple-selector';
            selector.style.cssText = `position:fixed;left:${clientX}px;top:${clientY - 80}px;transform:translateX(-50%);z-index:1000;display:flex;align-items:flex-end;gap:0;padding:2px;background:rgba(44,62,80,0.5);border-radius:8px;border:2px solid gold;box-shadow:0 4px 20px rgba(0,0,0,0.5);`;

            const targetColor = meeple.color.charAt(0).toUpperCase() + meeple.color.slice(1);

            actions.forEach(action => {
                const option = document.createElement('div');
                option.style.cssText = 'cursor:pointer;padding:4px;border-radius:5px;position:relative;';

                let imgSrc, overlayEmoji;
                if (action.type === 'abbe-recall') {
                    const myColor = (gameState.players.find(p => p.id === multiplayer.playerId)?.color ?? 'blue');
                    imgSrc = `./assets/Meeples/${myColor.charAt(0).toUpperCase()+myColor.slice(1)}/Abbot.png`;
                    overlayEmoji = '↩️';
                } else if (action.type === 'fairy') {
                    imgSrc = `./assets/Meeples/Fairy.png`;
                    overlayEmoji = null;
                } else {
                    imgSrc = `./assets/Meeples/${targetColor}/${meeple.type}.png`;
                    overlayEmoji = '↩️';
                }

                const wrapper = document.createElement('div');
                wrapper.style.cssText = 'position:relative;display:inline-block;';
                const img = document.createElement('img');
                img.src = imgSrc; img.style.cssText = 'width:40px;height:40px;display:block;';
                wrapper.appendChild(img);
                if (overlayEmoji) {
                    const badge = document.createElement('span');
                    badge.textContent = overlayEmoji;
                    badge.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:14px;line-height:1;pointer-events:none;text-shadow:0 0 3px rgba(0,0,0,0.8);';
                    wrapper.appendChild(badge);
                }
                option.appendChild(wrapper);
                option.onmouseenter = () => { option.style.background = 'rgba(255,215,0,0.2)'; };
                option.onmouseleave = () => { option.style.background = 'transparent'; };
                option.onclick = (e) => {
                    e.stopPropagation(); selector.remove();
                    if (action.type === 'abbe-recall') { const [ax, ay] = key.split(',').map(Number); handleAbbeRecall(ax, ay, key, meeple); }
                    else if (action.type === 'fairy')  { _handleFairyPlacement(key); }
                    else {
                        if (isHost) {
                            _handlePrincessEject(key);
                        } else {
                            // Invité : déléguer à l'hôte pour que l'undo fonctionne correctement
                            const hostConn = gameSync?.multiplayer?.connections?.[0];
                            if (hostConn?.open) {
                                hostConn.send({ type: 'princess-eject-request', meepleKey: key, playerId: multiplayer.playerId });
                            }
                            // Nettoyer les curseurs localement
                            _hideAllCursors();
                            document.querySelectorAll('.meeple-action-cursor, .meeple-action-overlay').forEach(el => el.remove());
                            gameState._pendingPrincessTile = null;
                            if (undoManager) { undoManager.meeplePlacedThisTurn = true; undoManager.lastMeeplePlaced = null; }
                        }
                    }
                };
                selector.appendChild(option);
            });

            document.body.appendChild(selector);
            setTimeout(() => {
                const close = (e) => { if (!selector.contains(e.target)) { selector.remove(); document.removeEventListener('click', close); } };
                document.addEventListener('click', close);
            }, 0);
        };

        btn.addEventListener('click',    (e) => { e.stopPropagation(); openSelector(e.clientX, e.clientY); });
        btn.addEventListener('touchend', (e) => { e.preventDefault(); e.stopPropagation(); openSelector(e.changedTouches[0].clientX, e.changedTouches[0].clientY); }, { passive: false });

        overlay.appendChild(btn);
        boardEl.appendChild(overlay);
    });

    if (pendingPrincess && princessTargetSet.size > 0) {
        afficherToast('👸 Princesse : vous pouvez éjecter un meeple de cette ville (optionnel)', 'info', 6000);
    }
}

function _showFairyTargets() { _showMeepleActionCursors(); }

function _clearFairyCursors() {
    document.querySelectorAll('.fairy-cursor,.fairy-cursor-overlay,.meeple-action-cursor,.meeple-action-overlay').forEach(el => el.remove());
}

function _hideAllCursors() {
    meepleCursorsUI?.hideCursors();
    _clearFairyCursors();
}

/**
 * Pose la fée sur le meeple désigné — appelé après validation dans le sélecteur.
 */
function _handleFairyPlacement(meepleKey) {
    _clearFairyCursors();
    if (!dragonRules) return;

    dragonRules.placeFairy(multiplayer.playerId, meepleKey);
    _renderFairyPiece(meepleKey);
    if (undoManager) undoManager.markFairyPlaced();

    if (gameSync) {
        multiplayer.broadcast({
            type: 'fairy-placed-sync',
            ownerId:   multiplayer.playerId,
            meepleKey,
        });
    }

    _hideAllCursors();
    updateTurnDisplay();
}

function afficherSelecteurMeeple(x, y, position, zoneType, mouseX, mouseY) {
    meepleSelectorUI.show(x, y, position, zoneType, mouseX, mouseY, placerMeeple);
}

function placerMeeple(x, y, position, meepleType) {
    if (!gameState || !multiplayer) return;

    if (gameSync && !isHost) {
        // ✅ Étape 3 : invité purement réactif — envoie request, attend echo hôte
        _hideAllCursors();
        gameSync.syncMeeplePlacementRequest(x, y, position, meepleType);
        return;
    }

    // Hôte ou solo : applique localement
    const success = meeplePlacement.placeMeeple(x, y, position, meepleType, multiplayer.playerId);
    if (!success) return;

    console.log('🎭 placerMeeple — type:', meepleType, '— zone:', x, y, position);
    if (meepleType === 'Abbot') {
        const player = gameState.players.find(p => p.id === multiplayer.playerId);
        if (player) player.hasAbbot = false;
        eventBus.emit('meeple-count-updated', { playerId: multiplayer.playerId });
    }
    if (meepleType === 'Large' || meepleType === 'Large-Farmer') {
        const player = gameState.players.find(p => p.id === multiplayer.playerId);
        if (player) player.hasLargeMeeple = false;
        eventBus.emit('meeple-count-updated', { playerId: multiplayer.playerId });
    }
    if (meepleType === 'Builder') {
        const player = gameState.players.find(p => p.id === multiplayer.playerId);
        if (player) player.hasBuilder = false;
        eventBus.emit('meeple-count-updated', { playerId: multiplayer.playerId });
    }
    if (meepleType === 'Pig') {
        const player = gameState.players.find(p => p.id === multiplayer.playerId);
        if (player) player.hasPig = false;
        eventBus.emit('meeple-count-updated', { playerId: multiplayer.playerId });
    }

    if (undoManager && (isMyTurn || isHost)) {
        undoManager.markMeeplePlaced(x, y, position, `${x},${y},${position}`);
    }
    _hideAllCursors();
}

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
            } else {
                if (gameSync) gameSync.syncUnplaceableRedraw();
            }
            waitingToRedraw = false;
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

            _clearDragonCursors();

            if (isHost) {
                _advanceDragonTurnHost();
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
            _hideAllCursors();
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
            _broadcastDragonState();
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
                        _releaseFairyIfDetached(key);
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
        _hideAllCursors();
        document.querySelectorAll('.meeple-cursors-container').forEach(c => c.remove());

        // ✅ reset() avant nextPlayer() : on efface les snapshots du tour écoulé
        // AVANT que drawTile() en sauvegarde un nouveau via saveTurnStart()
        gameState._pendingPrincessTile = null;
        if (undoManager) undoManager.reset();

        // ── Extension Dragon : démarrer la phase dragon si tuile dragon posée ──
        if (gameConfig.tileGroups?.dragon && gameConfig.extensions?.dragon && dragonRules && gameState._pendingDragonTile) {
            const { playerIndex } = gameState._pendingDragonTile;
            gameState._pendingDragonTile = null;
            const started = dragonRules.onDragonTilePlaced(playerIndex);
            if (started) {
                _broadcastDragonState();
                _startDragonTurnUI();
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
        const level       = zoomManager ? zoomManager.zoomLevel : 1;
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
                gameSync.syncTileDestroyed(result.tileId, result.playerName, result.action);
                waitingToRedraw = true;
                updateTurnDisplay();
            } else {
                // Cas special (river-12 détruite) : aussi besoin de repiocher
                waitingToRedraw = true;
                updateTurnDisplay();
            }
        } else {
            // Invité : délègue à l'hôte
            unplaceableManager.hideUnplaceableBadge();
            if (gameSync) gameSync.syncUnplaceableConfirm(tuileEnMain.id);
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

        // Enrichir avec l'état post-undo pour que les invités puissent reconstruire
        undoneAction.postUndoState = {
            placedTileKeys: Object.keys(plateau.placedTiles),
            zones:          zoneMerger.registry.serialize(),
            tileToZone:     Array.from(zoneMerger.tileToZone.entries()),
            placedMeeples:  JSON.parse(JSON.stringify(placedMeeples)),
            playerMeeples:  gameState.players.map(p => ({
                id: p.id, meeples: p.meeples,
                hasAbbot: p.hasAbbot, hasLargeMeeple: p.hasLargeMeeple,
                hasBuilder: p.hasBuilder, hasPig: p.hasPig
            })),
            fairyState:  JSON.parse(JSON.stringify(gameState.fairyState ?? { ownerId: null, meepleKey: null })),
            dragonPos:   JSON.parse(JSON.stringify(gameState.dragonPos ?? null)),
            dragonPhase: JSON.parse(JSON.stringify(gameState.dragonPhase ?? {}))
        };

        _applyUndoLocally(undoneAction);

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
    _stopAutoReconnect();

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
    _clearDragonCursors();
    document.querySelectorAll('.princess-cursor').forEach(el => el.remove());
    const dragonOverlay = document.getElementById('dragon-phase-overlay');
    if (dragonOverlay) dragonOverlay.style.display = 'none';
    document.getElementById('dragon-piece')?.remove();

    if (isHost && multiplayer.peer?.open) {
        // ✅ Inclure la liste propre pour que les invités ne voient pas les déconnectés
        multiplayer.broadcast({ type: 'return-to-lobby', players });
    }

    document.getElementById('back-to-lobby-btn').style.display = 'none';

    // Reset pause
    gamePaused = false;
    clearInterval(pauseTimerInterval);
    pauseTimerInterval = null;
    pauseTimerEnd = null;
    _hidePauseOverlay();

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
    zoomLevel      = 1;
    if (zoomManager) { zoomManager.setZoom(1); }
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
    if (zoomManager) { zoomManager.setZoom(1); zoomManager.destroy(); zoomManager = null; }
    _navigationSetup = false;

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

    console.log('✅ Retour au lobby terminé');
}

// ═══════════════════════════════════════════════════════
// NAVIGATION (zoom + drag)
// ═══════════════════════════════════════════════════════
function setupNavigation(container, board) {
    if (_navigationSetup) return;
    _navigationSetup = true;

    // ── Zoom : délégué à ZoomManager (throttle RAF, PC + Mobile) ──────────
    if (zoomManager) zoomManager.destroy();
    zoomManager = new ZoomManager(container, board, {
        min:           0.2,
        max:           3,
        stepWheel:     0.1,
        isMobile:      isMobile,
        initialPC:     1,
        initialMobile: 0.5,
    });
    zoomManager.init();
    // Synchroniser la variable globale zoomLevel (utilisée ailleurs)
    Object.defineProperty(window, '_zoomLevelProxy', {
        get: () => zoomManager.zoomLevel,
        configurable: true,
    });

    // ── PC : drag souris ──────────────────────────────────────────────────
    container.addEventListener('mousedown', (e) => {
        if (e.target.classList.contains('tile') || e.target.classList.contains('slot')) return;
        isDragging = true;
        container.style.cursor = 'grabbing';
        startX = e.pageX - container.offsetLeft;
        startY = e.pageY - container.offsetTop;
        scrollLeft = container.scrollLeft;
        scrollTop  = container.scrollTop;
    });

    container.addEventListener('mouseleave', () => { isDragging = false; container.style.cursor = 'grab'; });
    container.addEventListener('mouseup',    () => { isDragging = false; container.style.cursor = 'grab'; });

    container.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        e.preventDefault();
        const x = e.pageX - container.offsetLeft;
        const y = e.pageY - container.offsetTop;
        container.scrollLeft = scrollLeft - (x - startX) * 2;
        container.scrollTop  = scrollTop  - (y - startY) * 2;
    });

    // ── Mobile : drag tactile 1 doigt ─────────────────────────────────────
    // (le pinch est géré par ZoomManager)
    if (isMobile()) {
        let lastTouchX      = null;
        let lastTouchY      = null;
        let touchScrollLeft = 0;
        let touchScrollTop  = 0;

        container.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                lastTouchX      = e.touches[0].clientX;
                lastTouchY      = e.touches[0].clientY;
                touchScrollLeft = container.scrollLeft;
                touchScrollTop  = container.scrollTop;
            }
        }, { passive: true });

        container.addEventListener('touchmove', (e) => {
            if (e.touches.length === 1 && lastTouchX !== null) {
                const dx = e.touches[0].clientX - lastTouchX;
                const dy = e.touches[0].clientY - lastTouchY;
                container.scrollLeft = touchScrollLeft - dx * 1.5;
                container.scrollTop  = touchScrollTop  - dy * 1.5;
            }
        }, { passive: true });

        container.addEventListener('touchend', (e) => {
            if (e.touches.length === 0) { lastTouchX = null; lastTouchY = null; }
        }, { passive: true });
    }

    container.scrollLeft = 10400 - container.clientWidth  / 2;
    container.scrollTop  = 10400 - container.clientHeight / 2;
}

// ═══════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════
updateColorPickerVisibility();
lobbyUI.init();
console.log('Page chargée');
