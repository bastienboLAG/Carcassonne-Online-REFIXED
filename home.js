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
    tileGroups: { base: true, abbot: false, inns_cathedrals: false }
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
let finalScoresManager = null;
let gameTimerInterval  = null;
let gameTimerStart     = null;

// ── Reconnexion / Pause ──────────────────────────────────────────────────────
const PAUSE_TIMEOUT_MS = 60_000;  // 1 min (tests) → 3 min (prod)
let gamePaused         = false;
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

    // Mettre à jour isRiverPhase : true si la tuile courante est une tuile river
    if (slotsUI) slotsUI.isRiverPhase = tuileEnMain.id.startsWith('river-');

    if (tilePreviewUI) tilePreviewUI.showTile(tuileEnMain);
    updateMobileTilePreview();

    // Snapshot début de tour (sauf lors d'une annulation)
    if (undoManager && !data.fromNetwork && !data.fromUndo) {
        undoManager.setLastPlacedTileBeforeTurn(lastPlacedTile);
        undoManager.saveTurnStart(placedMeeples);
    }

    // Reset du builder au début de chaque tour local (évite faux positifs de tours précédents)
    if (!data.fromNetwork && !data.fromUndo && gameConfig?.extensions?.tradersBuilders) {
        ruleRegistry.rules?.get('builders')?.resetLastPlacedTile?.();
    }

    // L'hôte synchronise toujours la pioche (même spectateur), l'invité seulement si c'est son tour
    if (!data.fromNetwork && !data.fromUndo && turnManager && gameSync) {
        if (isHost || turnManager.getIsMyTurn()) {
            gameSync.syncTileDraw(data.tileData.id, tuileEnMain.rotation);
        }
    }

    // Vérifier si la tuile est plaçable
    if (!data.fromNetwork && !data.fromUndo && tilePlacement && unplaceableManager) {
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
            hasPig:         player ? player.hasPig         : undefined
        });
    }
    // Panel mobile mis à jour via ScorePanelUI
    if (scorePanelUI) scorePanelUI.updateMobile();
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

    // Appliquer les contraintes de dépendance (ex: cochon ↔ champs)
    _updatePigAvailability();

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
        'unplaceable':    document.querySelector('input[name="unplaceable"]:checked')?.value ?? 'reshuffle',
        'start':          document.querySelector('input[name="start"]:checked')?.value ?? 'unique',
    };
    multiplayer.broadcast({ type: 'options-sync', options });
}

// Sauvegarder les options à chaque changement manuel
document.querySelectorAll(
    '#base-fields, #list-remaining, #use-test-deck, #enable-debug, #ext-abbot, #tiles-abbot, #ext-large-meeple, #ext-cathedrals, #ext-inns, #tiles-inns-cathedrals, #tiles-traders-builders, #ext-builder, #ext-merchants, #ext-pig'
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
    // (ex : ext-pig dépend de base-fields, même au sein d'une coche maître)
    _updatePigAvailability();
    // Déclencher les side-effects (saveLobbyOptions, sync)
    children.forEach(c => c.dispatchEvent(new Event('change', { bubbles: true })));
    saveLobbyOptions();
}

// IDs de toutes les coches maîtres
const MASTER_IDS = ['all-base', 'all-abbot', 'all-inns-cathedrals', 'all-traders-builders', 'all-tiles'];

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
        ['base-fields', 'list-remaining', 'use-test-deck', 'enable-debug', 'ext-abbot', 'tiles-abbot', 'ext-large-meeple', 'ext-cathedrals', 'ext-inns', 'tiles-inns-cathedrals', 'tiles-traders-builders', 'ext-builder', 'ext-merchants', 'ext-pig'].forEach(id => {
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

        multiplayer.onPlayerJoined = (playerId) => {
            console.log('👤 Nouveau joueur connecté:', playerId);
            // Démarrer/redémarrer le heartbeat avec handler lobby (kick de la liste)
            _startHeartbeat((peerId) => {
                players = players.filter(p => p.id !== peerId);
                lobbyUI.setPlayers(players);
                multiplayer.broadcast({ type: 'players-update', players });
                console.warn(`💔 Joueur ${peerId} retiré du lobby (timeout heartbeat)`);
            });
        };

        multiplayer.onDataReceived = (data, from) => {
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

document.getElementById('join-confirm-btn').addEventListener('click', async () => {
    const code = document.getElementById('join-code-input').value.trim();
    if (!code) { showJoinError('Veuillez entrer un code !'); return; }

    try {
        const lobbyHandler = (data, from) => {
            console.log('📨 [INVITÉ] Reçu:', data);

            if (data.type === 'welcome') {
                console.log('🎉', data.message);
                // Afficher le code d'invitation côté invité
                gameCode = code; // ✅ mémoriser pour que le bouton "Copier" fonctionne
                document.getElementById('game-code-container').style.display = 'block';
                document.getElementById('game-code-text').textContent = `Code: ${code}`;
                // Démarrer le heartbeat côté invité (détecte si l'hôte disparaît)
                _startHeartbeat((peerId) => {
                    returnToInitialLobby("L'hote ne repond plus.");
                });
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
            if (data.type === 'return-to-lobby') returnToLobby();
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
                ['base-fields', 'list-remaining', 'use-test-deck', 'enable-debug', 'ext-abbot', 'tiles-abbot', 'ext-large-meeple', 'ext-cathedrals', 'ext-inns', 'tiles-inns-cathedrals', 'ext-builder', 'ext-merchants', 'ext-pig'].forEach(id => {
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

        setTimeout(() => {
            multiplayer.broadcast({ type: 'player-info', name: playerName, color: playerColor });
        }, 500);

    } catch (error) {
        console.error('❌ Erreur de connexion:', error);
        showJoinError("Impossible de rejoindre: " + error.message);
    }
});

document.getElementById('join-cancel-btn').addEventListener('click', () => {
    document.getElementById('join-modal').style.display = 'none';
});

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
            pig:             document.getElementById('ext-pig')?.checked             ?? false
        },
        tileGroups: {
            base:  true,
            abbot:            document.getElementById('tiles-abbot')?.checked             ?? false,
            inns_cathedrals:  document.getElementById('tiles-inns-cathedrals')?.checked   ?? false,
            traders_builders: document.getElementById('tiles-traders-builders')?.checked  ?? false,
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

    // ✅ Modules extraits de home.js
    unplaceableManager = new UnplaceableTileManager({
        deck, gameState, tilePreviewUI, gameSync, gameConfig,
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
        scoring,
        zoneMerger,
        slotsUI,
        eventBus,
        getPlacedMeeples: () => placedMeeples,
        onRemoteUndo:     handleRemoteUndo,
        onFinalScores:    (scores, destroyedTilesCount = 0) => finalScoresManager.receiveFromNetwork(scores, destroyedTilesCount),
        onTileDestroyed:  (tileId, pName, action, count = 1) => {
            if (gameState) gameState.destroyedTilesCount = (gameState.destroyedTilesCount || 0) + count;
            unplaceableManager.showTileDestroyedModal(tileId, pName, false, action);
        },
        onDeckReshuffled: (tiles, idx) => { deck.tiles = tiles; deck.currentIndex = idx; },
        onAbbeRecalled: (x, y, key, playerId, points) => {
            // Retirer visuellement l'Abbé
            document.querySelectorAll(`.meeple[data-key="${key}"]`).forEach(el => el.remove());
            delete placedMeeples[key];
            const player = gameState.players.find(p => p.id === playerId);
            if (player) player.hasAbbot = true;
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
        updateTurnDisplay,
        poserTuileSync,
        afficherMessage: (msg) => { afficherToast(msg); },
    }).attach(isHost);

    // Callbacks reconnexion (définis après attach car gameSync callbacks obj créé)
    if (gameSync) {
        gameSync.onGamePaused  = (name, ms) => { _showPauseOverlay(name, ms ?? PAUSE_TIMEOUT_MS); };
        gameSync.onGameResumed = (reason)   => {
            _hidePauseOverlay();
            if (reason === 'timeout') afficherToast('⏱ Partie reprise (joueur exclu).');
            else afficherToast('✅ Partie reprise !');
        };
        gameSync.onFullStateSync = (data) => { applyFullStateSync(data); };
    }
}

// ═══════════════════════════════════════════════════════
// DÉMARRAGE — HÔTE
// ═══════════════════════════════════════════════════════
function startGameTimer() {
    gameTimerStart = Date.now();
    const el = document.getElementById('game-timer');
    if (el) el.style.display = '';
    clearInterval(gameTimerInterval);
    gameTimerInterval = setInterval(() => {
        const el = document.getElementById('game-timer');
        if (!el) return;
        const elapsed = Math.floor((Date.now() - gameTimerStart) / 1000);
        const h = Math.floor(elapsed / 3600);
        const m = Math.floor((elapsed % 3600) / 60);
        const s = elapsed % 60;
        el.textContent = h > 0
            ? `⏱ ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
            : `⏱ ${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    }, 1000);
}

function startGameTimerFrom(elapsedSeconds) {
    gameTimerStart = Date.now() - (elapsedSeconds * 1000);
    const el = document.getElementById('game-timer');
    if (el) el.style.display = '';
    clearInterval(gameTimerInterval);
    gameTimerInterval = setInterval(() => {
        const el = document.getElementById('game-timer');
        if (!el) return;
        const elapsed = Math.floor((Date.now() - gameTimerStart) / 1000);
        const h = Math.floor(elapsed / 3600);
        const m = Math.floor((elapsed % 3600) / 60);
        const s = elapsed % 60;
        el.textContent = h > 0
            ? `⏱ ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
            : `⏱ ${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
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
function pauseGame(disconnectedName) {
    if (!isHost || gamePaused) return;
    gamePaused = true;
    pauseTimerEnd = Date.now() + PAUSE_TIMEOUT_MS;

    // Broadcaster aux invités
    if (gameSync) gameSync.syncGamePaused(disconnectedName, PAUSE_TIMEOUT_MS);

    // Afficher l'overlay
    _showPauseOverlay(disconnectedName, PAUSE_TIMEOUT_MS);

    // Timer de countdown
    pauseTimerInterval = setInterval(() => {
        const remaining = pauseTimerEnd - Date.now();
        _updatePauseCountdown(remaining);
        if (remaining <= 0) {
            _onPauseTimeout(disconnectedName);
        }
    }, 1000);
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
 * Timer de pause expiré — marquer le joueur comme abandonné et continuer
 */
function _onPauseTimeout(disconnectedName) {
    clearInterval(pauseTimerInterval);
    pauseTimerInterval = null;
    gamePaused = false;
    _hidePauseOverlay();

    // Trouver et supprimer le joueur déconnecté du gameState
    if (isHost && gameState) {
        const idx = gameState.players.findIndex(p => p.name === disconnectedName && p.disconnected);
        if (idx !== -1) {
            const peerId = gameState.players[idx].id;
            gameState.players.splice(idx, 1);
            if (gameState.currentPlayerIndex >= gameState.players.length) {
                gameState.currentPlayerIndex = 0;
            }
            players = players.filter(p => p.id !== peerId);
        }
        if (gameSync) gameSync.syncGameResumed('timeout');
        if (turnManager) {
            turnManager.updateTurnState();
            if (turnManager.isMyTurn || isHost) turnManager.drawTile();
            eventBus.emit('turn-changed', {
                isMyTurn: turnManager.isMyTurn,
                currentPlayer: turnManager.getCurrentPlayer()
            });
        }
    }
    afficherToast(`⏱ ${disconnectedName} a été exclu (délai dépassé).`);
}

function _showPauseOverlay(name, timeoutMs) {
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
    const secs = Math.ceil(timeoutMs / 1000);
    overlay.innerHTML = `
        <div style="background:rgba(30,40,55,0.97);border-radius:16px;padding:32px 40px;text-align:center;max-width:360px;box-shadow:0 8px 32px rgba(0,0,0,0.5);">
            <div style="font-size:48px;margin-bottom:12px;">⏸</div>
            <h2 style="margin:0 0 8px;font-size:22px;">Partie en pause</h2>
            <p style="margin:0 0 16px;color:#aaa;font-size:15px;"><strong style="color:#fff">${name}</strong> s'est déconnecté(e).</p>
            <p style="margin:0 0 4px;color:#aaa;font-size:14px;">Reprise automatique dans</p>
            <div id="pause-countdown" style="font-size:36px;font-weight:bold;color:#f39c12;">${secs}s</div>
        </div>
    `;
    overlay.style.display = 'flex';
}

function _updatePauseCountdown(remaining) {
    const el = document.getElementById('pause-countdown');
    if (el) el.textContent = Math.max(0, Math.ceil(remaining / 1000)) + 's';
}

function _hidePauseOverlay() {
    const overlay = document.getElementById('pause-overlay');
    if (overlay) overlay.style.display = 'none';
}

/**
 * Construire et envoyer l'état complet à un joueur qui (re)joint
 */
function sendFullStateTo(targetPeerId) {
    if (!isHost || !gameSync) return;
    gameSync.syncFullState(targetPeerId, {
        gameState,
        deck,
        plateau,
        zoneRegistry: zoneMerger.registry,
        tileToZone:   zoneMerger.tileToZone,
        placedMeeples,
        tuileEnMain,
        tuilePosee,
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

    // Restaurer tuilePosee
    tuilePosee = data.tuilePosee ?? false;
    if (turnManager) turnManager.tilePlaced = tuilePosee;

    // Mettre à jour isMyTurn AVANT d'afficher la tuile ou le verso
    if (turnManager) turnManager.updateTurnState();

    // Tuile en main si c'est notre tour et qu'on n'avait pas encore posé
    if (data.tuileEnMain && turnManager?.isMyTurn && !tuilePosee) {
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
        } else if (_isMyTurn && _tuileEnMain) {
            tilePreviewUI.showTile(_tuileEnMain);
        } else {
            tilePreviewUI.showMessage('En attente...');
        }
    });

    // slotsUI : pas de tuile disponible si tuile déjà posée
    if (slotsUI) slotsUI.tileAvailable = !tuilePosee && !!tuileEnMain;

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

    gameSync = new GameSync(multiplayer, gameState, null);
    gameSync.init();

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
    turnManager.drawTile();
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

    document.getElementById('remaining-tiles-btn').style.display =
        gameConfig.showRemainingTiles ? 'block' : 'none';
    document.getElementById('test-modal-btn').style.display =
        gameConfig.enableDebug ? 'block' : 'none';
    document.getElementById('back-to-lobby-btn').style.display = isHost ? 'block' : 'none';

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

        // ── Reconnexion / nouvelle connexion en cours de partie ──────────────
        multiplayer.onPlayerJoined = (playerId) => {
            console.log('👤 Nouveau joueur en cours de partie:', playerId);
            // On attend le message player-info pour identifier
        };

        // Intercept les messages réseau non-sync pour gérer reconnexion
        const _prevOnData = multiplayer.onDataReceived;
        multiplayer.onDataReceived = (data, from) => {
            // Tentative de reconnexion ou nouvelle connexion en cours de partie
            if (data.type === 'player-info' && isHost && gameState) {
                const name = data.name;
                const allPlayerColors = ['black','red','pink','green','blue','yellow'];

                // Chercher un joueur déconnecté avec le même pseudo
                const disconnectedEntry = gameState.findDisconnectedByName(name);

                if (disconnectedEntry) {
                    // ── Reconnexion ──────────────────────────────────────────
                    const [oldPeerId] = disconnectedEntry;
                    gameState.reconnectPlayer(oldPeerId, from);
                    players = players.map(p => p.id === oldPeerId ? { ...p, id: from } : p);
                    // Mettre à jour placedMeeples pour que l'ancien playerId soit remplacé
                    Object.values(placedMeeples).forEach(m => {
                        if (m.playerId === oldPeerId) m.playerId = from;
                    });

                    // Mettre à jour _connectedPeers du heartbeat (sinon timeout immédiat)
                    if (heartbeatManager) {
                        heartbeatManager._connectedPeers = multiplayer._connectedPeers;
                        heartbeatManager._lastPong[from] = Date.now();
                        heartbeatManager._timedOut.delete(oldPeerId);
                        delete heartbeatManager._lastPong[oldPeerId];
                    }

                    // Envoyer l'état complet
                    sendFullStateTo(from);

                    // Reprendre la partie si elle était en pause pour ce joueur
                    if (gamePaused) resumeGame('reconnected');

                    afficherToast(`✅ ${name} s'est reconnecté !`);
                    multiplayer.broadcast({ type: 'players-update', players });
                    console.log(`🔄 Reconnexion: ${name} (${oldPeerId} → ${from})`);

                } else {
                    // ── Nouvelle connexion en cours de partie ─────────────────
                    const takenNow = gameState.players.map(p => p.color);
                    const freePlaying = allPlayerColors.filter(c => !takenNow.includes(c));

                    if (freePlaying.length === 0) {
                        // Plus de couleurs libres → refuser
                        multiplayer.sendTo(from, { type: 'rejoin-rejected', reason: 'Partie complète (6 joueurs).' });
                        return;
                    }

                    const assigned = freePlaying.includes(data.color) ? data.color : freePlaying[0];
                    const newPlayer = { id: from, name, color: assigned, isHost: false };
                    gameState.addPlayer(from, name, assigned, false);
                    players.push(newPlayer);

                    sendFullStateTo(from);
                    multiplayer.broadcast({ type: 'players-update', players });
                    afficherToast(`👋 ${name} a rejoint la partie !`);
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
function _updateMobileActiveBonusStyle(isBonusTurn) {
    if (!isMobile()) return;
    const currentPlayer = gameState?.getCurrentPlayer();
    if (!currentPlayer) return;
    document.querySelectorAll('.mobile-player-card').forEach(card => {
        card.classList.remove('active-bonus');
        if (isBonusTurn && card.dataset.playerId === currentPlayer.id) {
            card.classList.add('active-bonus');
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
            endBtn.disabled = !isMyTurn || !tuilePosee;
        }
        endBtn.style.opacity = endBtn.disabled ? '0.4' : '1';
    }

    if (undoBtn) {
        const canUndo = isMyTurn && !finalScoresManager?.gameEnded && !!undoManager?.canUndo();
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
            const canEnd = isMyTurn && tuilePosee;
            endTurnBtn.disabled = !canEnd;
            endTurnBtn.style.opacity = canEnd ? '1' : '0.5';
            endTurnBtn.style.cursor  = canEnd ? 'pointer' : 'not-allowed';
            endTurnBtn.style.background = canEnd ? '#2ecc71' : '';
            endTurnBtn.style.color      = canEnd ? '#000' : '';
        }
    }

    const undoBtn = document.getElementById('undo-btn');
    if (undoBtn) {
        const canUndo = isMyTurn && !finalScoresManager?.gameEnded && !!undoManager?.canUndo();
        undoBtn.disabled = !canUndo;
        undoBtn.style.opacity    = canUndo ? '1' : '0.5';
        undoBtn.style.cursor     = canUndo ? 'pointer' : 'not-allowed';
        undoBtn.style.background = canUndo ? '#f1c40f' : '';
        undoBtn.style.color      = canUndo ? '#000' : '';
    }

    scorePanelUI?.updateMobile();
    updateMobileButtons();
    eventBus.emit('score-updated');

    // Mettre à jour le contour doré si tour bonus
    const isBonusTurn = turnManager?.isBonusTurn ?? false;
    if (scorePanelUI) scorePanelUI.onTurnChanged(isBonusTurn);
    _updateMobileActiveBonusStyle(isBonusTurn);

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
function handleRemoteUndo(undoneAction) {
    if (!undoManager) return;
    console.log('⏪ Application de l\'annulation distante:', undoneAction);

    if (undoneAction.type === 'meeple') {
        const key = undoneAction.meeple.key;
        if (undoManager.afterTilePlacedSnapshot) {
            undoManager.restoreSnapshot(undoManager.afterTilePlacedSnapshot, placedMeeples);
        }
        document.querySelectorAll(`.meeple[data-key="${key}"]`).forEach(el => el.remove());

    } else if (undoneAction.type === 'tile') {
        const { x, y } = undoneAction.tile;

        // ✅ Retirer la tuile du plateau AVANT restoreSnapshot
        delete plateau.placedTiles[`${x},${y}`];

        if (undoManager.turnStartSnapshot) {
            undoManager.restoreSnapshot(undoManager.turnStartSnapshot, placedMeeples);
        }

        // Retirer du DOM
        let tileEl = document.querySelector(`.tile[data-pos="${x},${y}"]`);
        if (!tileEl) {
            tileEl = Array.from(document.querySelectorAll('.tile'))
                .find(el => el.style.gridColumn == x && el.style.gridRow == y);
        }
        if (tileEl) tileEl.remove();

        if (x === 50 && y === 50) {
            firstTilePlaced = false;
            if (slotsUI) { slotsUI.firstTilePlaced = false; slotsUI.currentTile = null; }
            if (tilePlacement) tilePlacement.firstTilePlaced = false;
            document.querySelectorAll('.slot-central').forEach(s => s.remove());
            if (slotsUI) slotsUI.createCentralSlot();
        }

        // Remettre la tuile en main côté invité (slot + preview)
        const tileObj = undoneAction.tile?.tile;
        console.log('⏪ [REMOTE UNDO] tileObj:', tileObj, 'slotsUI.tileAvailable:', slotsUI?.tileAvailable, 'tuileEnMain avant:', tuileEnMain?.id);
        if (tileObj) {
            eventBus.emit('tile-drawn', { tileData: tileObj, fromNetwork: true });
            console.log('⏪ [REMOTE UNDO] tile-drawn émis, tuileEnMain après:', tuileEnMain?.id, 'tileAvailable:', slotsUI?.tileAvailable);
        }
    }

    eventBus.emit('score-updated');
}

function poserTuile(x, y, tile, isFirst = false) {
    console.log('🎯 poserTuile appelé:', { x, y, tile, isFirst });
    const success = tilePlacement.placeTile(x, y, tile, { isFirst });
    if (!success) return;

    tuilePosee      = true;
    firstTilePlaced = true;
    lastPlacedTile  = { x, y };

    // Réinitialiser le suivi des tuiles implaçables après chaque placement réussi
    if (unplaceableManager) unplaceableManager.resetSeenImplacable();

    document.querySelectorAll('.slot').forEach(s => s.remove());
    if (tilePreviewUI) tilePreviewUI.showBackside();
    updateMobileButtons();
    updateTurnDisplay();

    if (gameSync) gameSync.syncTilePlacement(x, y, tile, zoneMerger);

    if (isMyTurn && gameSync && meepleCursorsUI && !undoManager?.abbeRecalledThisTurn) {
        meepleCursorsUI.showCursors(x, y, gameState, placedMeeples, afficherSelecteurMeeple);
        // Afficher les Abbés rappelables si extension activée et aucun meeple/abbé posé ce tour
        if (gameConfig.extensions?.abbot && !undoManager?.meeplePlacedThisTurn && !undoManager?.abbeRecalledThisTurn) {
            meepleCursorsUI.showAbbeRecallTargets(placedMeeples, multiplayer.playerId, handleAbbeRecall);
        }
    }

    if (undoManager && isMyTurn) {
        undoManager.saveAfterTilePlaced(x, y, tile, placedMeeples);
    }

    tuileEnMain = null;
    updateMobileTilePreview();
    updateTurnDisplay(); // Mettre à jour undo (canUndo vient de changer)
}

function poserTuileSync(x, y, tile, extraOptions = {}) {
    console.log('🔄 poserTuileSync appelé:', { x, y, tile });

    const isFirst = !firstTilePlaced;
    const isReconstruction = !!extraOptions.skipValidation;

    if (!isReconstruction) {
        // ✅ Mettre à null AVANT placeTile() car celui-ci émet 'tile-placed' de façon
        // synchrone, ce qui déclenche refreshAllSlots() immédiatement.
        // Si tuileEnMain est encore non-null à ce moment, des slots fantômes apparaissent.
        tuileEnMain = null;
        updateMobileTilePreview();
    }

    tilePlacement.placeTile(x, y, tile, { isFirst, skipSync: true, ...extraOptions });

    if (!firstTilePlaced) firstTilePlaced = true;
    if (!isReconstruction) {
        tuilePosee     = true;
        lastPlacedTile = { x, y };
    }
    // ✅ Le snapshot est sauvegardé par GameSyncCallbacks après application des zones
    // Ne pas le sauvegarder ici pour éviter un snapshot avec zones incomplètes
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

    // Rendre l'Abbé au joueur
    const player = gameState.players.find(p => p.id === meeple.playerId);
    if (player) {
        player.hasAbbot = true;
        eventBus.emit('meeple-count-updated', { playerId: meeple.playerId });
    }

    // Cacher les overlays
    if (meepleCursorsUI) meepleCursorsUI.hideCursors();

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
function afficherSelecteurMeeple(x, y, position, zoneType, mouseX, mouseY) {
    meepleSelectorUI.show(x, y, position, zoneType, mouseX, mouseY, placerMeeple);
}

function placerMeeple(x, y, position, meepleType) {
    if (!gameState || !multiplayer) return;
    const success = meeplePlacement.placeMeeple(x, y, position, meepleType, multiplayer.playerId);
    if (!success) return;

    console.log('🎭 placerMeeple — type:', meepleType, '— zone:', x, y, position);
    // Si l'Abbé est posé, il n'est plus disponible
    if (meepleType === 'Abbot') {
        const player = gameState.players.find(p => p.id === multiplayer.playerId);
        if (player) player.hasAbbot = false;
        eventBus.emit('meeple-count-updated', { playerId: multiplayer.playerId });
    }
    // Si le grand meeple est posé, il n'est plus disponible
    if (meepleType === 'Large' || meepleType === 'Large-Farmer') {
        const player = gameState.players.find(p => p.id === multiplayer.playerId);
        if (player) player.hasLargeMeeple = false;
        eventBus.emit('meeple-count-updated', { playerId: multiplayer.playerId });
    }
    // Si le bâtisseur est posé, il n'est plus disponible
    if (meepleType === 'Builder') {
        const player = gameState.players.find(p => p.id === multiplayer.playerId);
        if (player) player.hasBuilder = false;
        eventBus.emit('meeple-count-updated', { playerId: multiplayer.playerId });
    }
    // Si le cochon est posé, il n'est plus disponible
    if (meepleType === 'Pig') {
        const player = gameState.players.find(p => p.id === multiplayer.playerId);
        if (player) player.hasPig = false;
        eventBus.emit('meeple-count-updated', { playerId: multiplayer.playerId });
    }

    if (undoManager && isMyTurn) {
        undoManager.markMeeplePlaced(x, y, position, `${x},${y},${position}`);
    }
    if (meepleCursorsUI) meepleCursorsUI.hideCursors(); // retire curseurs ET overlays abbé
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
        tuileEnMain.rotation = (tuileEnMain.rotation + 90) % 360;
        const currentDeg = parseInt(currentImg.style.transform.match(/rotate\((\d+)deg\)/)?.[1] || '0');
        currentImg.style.transform = `rotate(${currentDeg + 90}deg)`;

        if (gameSync) gameSync.syncTileRotation(tuileEnMain.rotation);
        eventBus.emit('tile-rotated', { rotation: tuileEnMain.rotation });
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
            turnManager.drawTile();
            waitingToRedraw = false;
            updateTurnDisplay();
            return;
        }

        if (!isMyTurn && gameSync) { alert("Ce n'est pas votre tour !"); return; }
        if (!tuilePosee) { alert('Vous devez poser la tuile avant de terminer votre tour !'); return; }

        console.log('⏭️ Fin de tour - calcul des scores et passage au joueur suivant');

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

            if (scoringResults.length > 0) {
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
                    }
                });

                if (gameSync) gameSync.syncScoreUpdate(scoringResults, meeplesToReturn, goodsResults, zoneMerger);
                updateTurnDisplay();
            }
        }

        // Nettoyer les curseurs et overlays abbé
        if (meepleCursorsUI) meepleCursorsUI.hideCursors();
        else document.querySelectorAll('.meeple-cursors-container').forEach(c => c.remove());

        // ✅ reset() avant nextPlayer() : on efface les snapshots du tour écoulé
        // AVANT que drawTile() en sauvegarde un nouveau via saveTurnStart()
        if (undoManager) undoManager.reset();

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
                // Tour bonus déclenché — un seul message turn-ended avec isBonusTurn=true
                // (syncBonusTurnStarted supprimé : le toast invité est géré dans onTurnEnded)
                if (gameSync) gameSync.syncTurnEnd(true);
                // Réinitialiser la dernière tuile posée pour éviter un faux positif au tour bonus
                ruleRegistry.rules?.get('builders')?.resetLastPlacedTile?.();
                turnManager.drawTile();
                updateTurnDisplay();
                afficherToast('⭐ Tour bonus ! Votre bâtisseur vous offre un tour supplémentaire.', 'bonus');
                // Marquer le toast pour pouvoir le fermer automatiquement à la fin du tour bonus
                const _bonusToast = document.getElementById('disconnect-toast');
                if (_bonusToast) _bonusToast.dataset.isBonusToast = 'true';
                return;
            }
        }

        if (gameSync) {
            gameSync.syncTurnEnd();
        }

        updateTurnDisplay();
    };

    // Recentrer
    document.getElementById('recenter-btn').onclick = () => {
        const container      = document.getElementById('board-container');
        container.scrollLeft = 10400 - container.clientWidth  / 2;
        container.scrollTop  = 10400 - container.clientHeight / 2;
    };

    // Highlight de la dernière tuile posée
    document.getElementById('highlight-tile-btn').onclick = () => {
        if (!lastPlacedTile) return;
        const { x, y } = lastPlacedTile;
        const el = document.querySelector(`.tile[data-pos="${x},${y}"]`);
        if (!el) return;
        el.classList.add('tile-highlight');
        setTimeout(() => el.classList.remove('tile-highlight'), 3000);
    };

    // Retour au lobby
    document.getElementById('back-to-lobby-btn').onclick = () => {
        if (confirm('Retourner au lobby ? (La partie sera terminée mais les joueurs resteront connectés)')) {
            returnToLobby();
        }
    };

    // Fermer modale scores finaux
    document.getElementById('close-final-scores-btn').onclick = () => {
        document.getElementById('final-scores-modal').style.display = 'none';
    };

    // Confirmer tuile implaçable
    document.getElementById('unplaceable-confirm-btn').onclick = () => {
        if (unplaceableManager) unplaceableManager.handleConfirm(tuileEnMain, gameSync);
    };

    // Examiner le plateau (ferme la modale implaçable)
    document.getElementById('unplaceable-examine-btn').onclick = () => {
        document.getElementById('unplaceable-modal').style.display = 'none';
    };

    // OK modale info destruction
    document.getElementById('tile-destroyed-ok-btn').onclick = () => {
        document.getElementById('tile-destroyed-modal').style.display = 'none';
    };

    // Bouton debug
    document.getElementById('test-modal-btn').onclick = () => {
        if (finalScoresManager) finalScoresManager.showDebugModal();
    };

    // Annuler le coup
    document.getElementById('undo-btn').addEventListener('click', () => {
        if (!undoManager || !isMyTurn) return;
        if (!undoManager.canUndo()) { alert('Rien à annuler'); return; }

        const undoneAction = undoManager.undo(placedMeeples);
        if (!undoneAction) return;

        if (undoneAction.type === 'abbe-recalled-undo') {
            // L'Abbé a été remis sur le plateau par restoreSnapshot (placedMeeples restauré)
            // Il faut juste re-afficher visuellement l'Abbé et annuler les pendingAbbePoints
            pendingAbbePoints = null;
            const { playerId } = undoneAction.abbe;
            const player = gameState.players.find(p => p.id === playerId);
            if (player) player.hasAbbot = false;
            // Re-render le meeple sur le plateau
            const abbeKey = undoneAction.abbe.key;
            const abbeData = placedMeeples[abbeKey];
            if (abbeData) {
                const [ax, ay] = abbeKey.split(',').map(Number);
                eventBus.emit('meeple-placed', { ...abbeData, x: ax, y: ay, key: abbeKey, position: parseInt(abbeKey.split(',')[2]), meepleType: abbeData.type, playerColor: abbeData.color, fromUndo: true });
            }
            if (gameSync) gameSync.syncAbbeRecallUndo(
                undoneAction.abbe.x, undoneAction.abbe.y, abbeKey, playerId
            );
            // Réafficher les curseurs de la tuile courante + curseur rappel abbé
            if (lastPlacedTile && meepleCursorsUI) {
                meepleCursorsUI.showCursors(
                    lastPlacedTile.x, lastPlacedTile.y, gameState, placedMeeples, afficherSelecteurMeeple
                );
                meepleCursorsUI.showAbbeRecallTargets(placedMeeples, multiplayer.playerId, handleAbbeRecall);
            }
            eventBus.emit('score-updated');
            updateTurnDisplay();
            return;
        }

        if (undoneAction.type === 'meeple') {
            document.querySelectorAll(`.meeple[data-key="${undoneAction.meeple.key}"]`).forEach(el => el.remove());
            if (lastPlacedTile && meepleCursorsUI) {
                meepleCursorsUI.showCursors(
                    lastPlacedTile.x, lastPlacedTile.y, gameState, placedMeeples, afficherSelecteurMeeple
                );
                // ✅ Re-afficher les curseurs abbé si l'extension est active
                if (gameConfig.extensions?.abbot && !undoManager.abbeRecalledThisTurn) {
                    meepleCursorsUI.showAbbeRecallTargets(placedMeeples, multiplayer.playerId, handleAbbeRecall);
                }
            }

        } else if (undoneAction.type === 'tile') {
            // Restaurer l'épingle vers la tuile posée avant ce tour
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
                if (slotsUI)        { slotsUI.firstTilePlaced = false; slotsUI.currentTile = null; }
                if (tilePlacement)  tilePlacement.firstTilePlaced = false;
            }

            if (tilePreviewUI) tilePreviewUI.showTile(tuileEnMain);

            // ✅ Remettre tileAvailable à true dans SlotsUI sinon les slots ne s'affichent pas
            if (slotsUI) slotsUI.tileAvailable = true;

            // Re-émettre tile-drawn sans créer de snapshot
            eventBus.emit('tile-drawn', {
                tileData: { ...tuileEnMain, rotation: tuileEnMain.rotation },
                fromUndo: true
            });

            if (x === 50 && y === 50) {
                document.querySelectorAll('.slot-central').forEach(s => s.remove());
                if (slotsUI) slotsUI.createCentralSlot();
            }

            if (slotsUI && firstTilePlaced) slotsUI.refreshAllSlots();
            if (meepleCursorsUI) meepleCursorsUI.hideCursors();
        }

        if (gameSync) gameSync.syncUndo(undoneAction);
        // Mettre à jour les compteurs de meeples après undo (hasAbbot peut avoir changé)
        gameState.players.forEach(p => eventBus.emit('meeple-count-updated', { playerId: p.id }));
        eventBus.emit('score-updated');
        updateTurnDisplay();
        updateMobileTilePreview();
        scorePanelUI?.updateMobile();
        updateMobileButtons();
    });

    // Tuiles restantes
    document.getElementById('remaining-tiles-btn').addEventListener('click', () => {
        if (!deck) { alert('Aucune partie en cours'); return; }
        modalUI.showRemainingTiles(deck.getRemainingTilesByType(), deck.remaining());
    });

    // Règles de la partie
    document.getElementById('rules-btn').addEventListener('click', () => {
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
            tuileEnMain.rotation = (tuileEnMain.rotation + 90) % 360;
            updateMobileTilePreview();
            if (gameSync) gameSync.syncTileRotation(tuileEnMain.rotation);
            eventBus.emit('tile-rotated', { rotation: tuileEnMain.rotation });
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
        mobileBtn('mobile-remaining-btn', () => {
            document.getElementById('remaining-tiles-btn').click();
        });
        mobileBtn('mobile-rules-btn', () => {
            document.getElementById('rules-btn').click();
        });

        // Rotation tuile : déjà sur touchend via click — garder tel quel
        // Retour lobby (hôte uniquement)
        const mobileLobbyBtn = document.getElementById('mobile-lobby-btn');
        if (mobileLobbyBtn) {
            mobileLobbyBtn.style.display = isHost ? 'flex' : 'none';
            mobileLobbyBtn.addEventListener('touchend', (e) => {
                e.preventDefault();
                document.getElementById('back-to-lobby-btn').onclick?.();
            }, { passive: false });
        }
    }

    eventListenersInstalled = true;
    console.log('✅ Event listeners installés');
}

// ═══════════════════════════════════════════════════════
// RETOUR AU LOBBY
// ═══════════════════════════════════════════════════════
function returnToInitialLobby(message = null) {
    console.log('🔙 Retour au lobby initial...');

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
    stopGameTimer();
    const timerEl = document.getElementById('game-timer');
    if (timerEl) { timerEl.textContent = '⏱ 00:00'; timerEl.style.display = 'none'; }

    if (isHost && multiplayer.peer?.open) {
        multiplayer.broadcast({ type: 'return-to-lobby' });
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

    if (heartbeatManager) { heartbeatManager.stop(); heartbeatManager = null; }

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
