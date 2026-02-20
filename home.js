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
import { TurnManager }            from './modules/game/TurnManager.js';
import { UndoManager }            from './modules/game/UndoManager.js';
import { TilePlacement }          from './modules/game/TilePlacement.js';
import { MeeplePlacement }        from './modules/game/MeeplePlacement.js';
import { GameSyncCallbacks }      from './modules/game/GameSyncCallbacks.js';
import { UnplaceableTileManager } from './modules/game/UnplaceableTileManager.js';
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
    extensions: { base: true, abbot: false },
    tileGroups: { base: true, abbot: false }
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

    if (tilePreviewUI) tilePreviewUI.showTile(tuileEnMain);
    updateMobileTilePreview();

    // Snapshot début de tour (sauf lors d'une annulation)
    if (undoManager && !data.fromNetwork && !data.fromUndo) {
        undoManager.saveTurnStart(placedMeeples);
    }

    // Synchroniser si c'est notre tour
    if (!data.fromNetwork && !data.fromUndo && turnManager && turnManager.getIsMyTurn() && gameSync) {
        gameSync.syncTileDraw(data.tileData.id, tuileEnMain.rotation);
    }

    // Vérifier si la tuile est plaçable
    if (!data.fromNetwork && !data.fromUndo && tilePlacement && unplaceableManager) {
        const placeable = unplaceableManager.isTilePlaceable(tuileEnMain, tilePlacement.plateau);
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
    isMyTurn = data.isMyTurn;
    console.log('🔄 Sync isMyTurn global:', isMyTurn);
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
            playerId: data.playerId,
            meeples:  player ? player.meeples : data.meeples,
            hasAbbot: player ? player.hasAbbot : undefined
        });
    }
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
}

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
        lobbyUI.setPlayers(players);
        lobbyUI.setIsHost(true);

        // Sync temps réel de toutes les options vers les invités
        ['base-fields', 'list-remaining', 'use-test-deck', 'enable-debug', 'ext-abbot', 'tiles-abbot'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('change', (e) => {
                multiplayer.broadcast({ type: 'option-change', option: id, value: e.target.checked });
            });
        });
        // Sync des radios (unplaceable)
        document.querySelectorAll('input[name="unplaceable"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                if (e.target.checked) multiplayer.broadcast({ type: 'option-change', option: 'unplaceable', value: e.target.value });
            });
        });

        multiplayer.onPlayerJoined = (playerId) => {
            console.log('👤 Nouveau joueur connecté:', playerId);
        };

        multiplayer.onDataReceived = (data, from) => {
            console.log('📨 [HÔTE] Reçu:', data);

            if (data.type === 'player-info') {
                if (!players.find(p => p.id === from)) {
                    const taken    = players.map(p => p.color);
                    const assigned = taken.includes(data.color) ? getAvailableColor() : data.color;
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
                    'unplaceable':     document.querySelector('input[name="unplaceable"]:checked')?.value ?? 'destroy',
                    'ext-abbot':       document.getElementById('ext-abbot')?.checked       ?? false,
                    'tiles-abbot':     document.getElementById('tiles-abbot')?.checked     ?? false,
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

            if (data.type === 'welcome')         console.log('🎉', data.message);
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
                if (data.option === 'unplaceable') {
                    const radio = document.querySelector(`input[name="unplaceable"][value="${data.value}"]`);
                    if (radio) radio.checked = true;
                } else {
                    const checkbox = document.getElementById(data.option);
                    if (checkbox) checkbox.checked = data.value;
                }
            }
            if (data.type === 'options-sync') {
                // ✅ Réception de l'état complet des options au moment où on rejoint
                const opts = data.options;
                ['base-fields', 'list-remaining', 'use-test-deck', 'enable-debug'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el && opts[id] !== undefined) el.checked = opts[id];
                });
                // Option radio tuile implaçable
                if (opts['ext-abbot'] !== undefined) {
                    const el = document.getElementById('ext-abbot');
                    if (el) el.checked = opts['ext-abbot'];
                }
                if (opts['tiles-abbot'] !== undefined) {
                    const el = document.getElementById('tiles-abbot');
                    if (el) el.checked = opts['tiles-abbot'];
                }
                if (opts['unplaceable']) {
                    const radio = document.querySelector(`input[name="unplaceable"][value="${opts['unplaceable']}"]`);
                    if (radio) radio.checked = true;
                }
            }
            if (data.type === 'game-starting') {
                console.log("🎮 [INVITÉ] L'hôte démarre la partie !");
                if (data.config) { gameConfig = data.config; }
                startGameForInvite();
            }
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
        extensions: {
            base:  true,
            abbot: document.getElementById('ext-abbot')?.checked ?? false
        },
        tileGroups: {
            base:  true,
            abbot: document.getElementById('tiles-abbot')?.checked ?? false
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
    scoring    = new Scoring(zoneMerger);

    tilePlacement  = new TilePlacement(eventBus, plateau, zoneMerger);
    meeplePlacement = new MeeplePlacement(eventBus, gameState, zoneMerger);
    meeplePlacement.setPlacedMeeples(placedMeeples);

    meepleCursorsUI  = new MeepleCursorsUI(multiplayer, zoneMerger, plateau, gameConfig);
    meepleCursorsUI.init();
    meepleSelectorUI = new MeepleSelectorUI(multiplayer, gameState, gameConfig);
    meepleDisplayUI  = new MeepleDisplayUI();
    meepleDisplayUI.init();

    undoManager = new UndoManager(eventBus, gameState, plateau, zoneMerger);

    // ✅ Modules extraits de home.js
    unplaceableManager = new UnplaceableTileManager({
        deck, gameState, tilePreviewUI, gameSync, gameConfig,
        setRedrawMode: (active) => { waitingToRedraw = active; updateTurnDisplay(); }
    });

    finalScoresManager = new FinalScoresManager({
        gameState, scoring, zoneMerger, gameSync, eventBus, updateTurnDisplay
    });

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
        onFinalScores:    (scores) => finalScoresManager.receiveFromNetwork(scores),
        onTileDestroyed:  (tileId, pName, action) => unplaceableManager.showTileDestroyedModal(tileId, pName, false, action),
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
        updateTurnDisplay,
        poserTuileSync,
    }).attach(isHost);
}

// ═══════════════════════════════════════════════════════
// DÉMARRAGE — HÔTE
// ═══════════════════════════════════════════════════════
async function startGame() {
    console.log('🎮 [HÔTE] Initialisation du jeu...');

    document.getElementById('lobby-page').style.display = 'none';
    document.getElementById('game-page').style.display  = 'flex';

    gameState = new GameState();
    players.forEach(p => gameState.addPlayer(p.id, p.name, p.color, p.isHost));
    // Initialiser le flag Abbé pour chaque joueur
    console.log('🔧 startGame — gameConfig.extensions:', JSON.stringify(gameConfig.extensions));
    if (gameConfig.extensions?.abbot) {
        gameState.players.forEach(p => { p.hasAbbot = true; });
        console.log('✅ [HOST] hasAbbot initialisé:', gameState.players.map(p => p.id + '=' + p.hasAbbot));
    } else {
        console.log('ℹ️ [HOST] abbot désactivé');
    }

    gameSync = new GameSync(multiplayer, gameState, null);
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

    // L'hôte charge et envoie la pioche
    await deck.loadAllTiles(gameConfig.testDeck ?? false, gameConfig.tileGroups ?? {});
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
async function startGameForInvite() {
    console.log('🎮 [INVITÉ] Initialisation du jeu...');
    lobbyUI.hide();

    gameState = new GameState();
    players.forEach(p => gameState.addPlayer(p.id, p.name, p.color, p.isHost));
    if (gameConfig.extensions?.abbot) {
        gameState.players.forEach(p => { p.hasAbbot = true; });
        console.log('✅ [INVITÉ] hasAbbot initialisé pour', gameState.players.map(p => p.id));
    } else {
        console.log('ℹ️ [INVITÉ] extension abbot désactivée — gameConfig:', JSON.stringify(gameConfig.extensions));
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
    afficherMessage("En attente de l'hôte...");
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

    document.getElementById('remaining-tiles-btn').style.display =
        gameConfig.showRemainingTiles ? 'block' : 'none';
    document.getElementById('test-modal-btn').style.display =
        gameConfig.enableDebug ? 'block' : 'none';
    document.getElementById('back-to-lobby-btn').style.display = isHost ? 'block' : 'none';
}

// ═══════════════════════════════════════════════════════
// MOBILE — Mise à jour de l'UI
// ═══════════════════════════════════════════════════════

/**
 * Met à jour la barre joueurs mobile
 */
function updateMobilePlayers() {
    if (!isMobile() || !gameState) return;
    const container = document.getElementById('mobile-players-scores');
    if (!container) return;

    container.innerHTML = '';
    const currentPlayer = gameState.getCurrentPlayer();

    gameState.players.forEach(player => {
        const isActive = currentPlayer && player.id === currentPlayer.id;
        const colorCap = player.color.charAt(0).toUpperCase() + player.color.slice(1);

        const card = document.createElement('div');
        card.className = 'mobile-player-card' + (isActive ? ' active' : '');

        const name = document.createElement('div');
        name.className = 'mobile-player-name';
        name.textContent = player.name;
        card.appendChild(name);

        const score = document.createElement('div');
        score.className = 'mobile-player-score';
        score.textContent = player.score + ' pts';
        card.appendChild(score);

        const meeplesDiv = document.createElement('div');
        meeplesDiv.className = 'mobile-player-meeples';
        for (let i = 0; i < 7; i++) {
            const img = document.createElement('img');
            img.src = `./assets/Meeples/${colorCap}/Normal.png`;
            if (i >= player.meeples) img.classList.add('unavailable');
            meeplesDiv.appendChild(img);
        }
        // Abbé (si extension activée)
        if (gameConfig?.extensions?.abbot) {
            const abbot = document.createElement('img');
            abbot.src = `./assets/Meeples/${colorCap}/Abbot.png`;
            abbot.alt = 'Abbé';
            abbot.style.marginLeft = '6px';
            if (!player.hasAbbot) abbot.classList.add('unavailable');
            meeplesDiv.appendChild(abbot);
        }
        card.appendChild(meeplesDiv);
        container.appendChild(card);
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
    if (!gameState || gameState.players.length === 0) { isMyTurn = true; return; }

    const currentPlayer = gameState.getCurrentPlayer();
    isMyTurn = currentPlayer.id === multiplayer.playerId;

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

    updateMobilePlayers();
    updateMobileButtons();
        eventBus.emit('score-updated');
}

function afficherMessage(msg) {
    document.getElementById('tile-preview').innerHTML =
        `<p style="text-align: center; color: white;">${msg}</p>`;
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

    document.querySelectorAll('.slot').forEach(s => s.remove());
    if (tilePreviewUI) tilePreviewUI.showBackside();
    updateMobileButtons();
    updateTurnDisplay();

    if (gameSync) gameSync.syncTilePlacement(x, y, tile);

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

function poserTuileSync(x, y, tile) {
    console.log('🔄 poserTuileSync appelé:', { x, y, tile });
    const isFirst = !firstTilePlaced;

    // ✅ Mettre à null AVANT placeTile() car celui-ci émet 'tile-placed' de façon
    // synchrone, ce qui déclenche refreshAllSlots() immédiatement.
    // Si tuileEnMain est encore non-null à ce moment, des slots fantômes apparaissent.
    tuileEnMain = null;
    updateMobileTilePreview();

    tilePlacement.placeTile(x, y, tile, { isFirst, skipSync: true });

    if (!firstTilePlaced) firstTilePlaced = true;
    tuilePosee     = true;
    lastPlacedTile = { x, y };

    if (undoManager) undoManager.saveAfterTilePlaced(x, y, tile, placedMeeples);
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
            const { scoringResults, meeplesToReturn } = scoring.scoreClosedZones(placedMeeples);

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
                        // Si c'est l'Abbé, remettre hasAbbot au lieu d'incrémenter les meeples normaux
                        if (meeple.type === 'Abbot') {
                            const player = gameState.players.find(p => p.id === meeple.playerId);
                            if (player) {
                                player.hasAbbot = true;
                                eventBus.emit('meeple-count-updated', { playerId: meeple.playerId });
                            }
                        } else {
                            incrementPlayerMeeples(meeple.playerId);
                        }
                        document.querySelectorAll(`.meeple[data-key="${key}"]`).forEach(el => el.remove());
                        delete placedMeeples[key];
                    }
                });

                if (gameSync) gameSync.syncScoreUpdate(scoringResults, meeplesToReturn);
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

        // ✅ nextPlayer() : passage au joueur suivant + drawTile() si solo
        // Ensuite syncTurnEnd() broadcaste un gameState déjà à jour pour les invités
        if (turnManager) {
            turnManager.nextPlayer();
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
            el.addEventListener('touchend', (e) => { e.preventDefault(); e.stopPropagation(); fn(); }, { passive: false });
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
function returnToLobby() {
    console.log('🔙 Retour au lobby...');

    if (isHost && multiplayer.peer?.open) {
        multiplayer.broadcast({ type: 'return-to-lobby' });
    }

    document.getElementById('back-to-lobby-btn').style.display = 'none';

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
    ruleRegistry.disable('abbot'); // no-op si non enregistré

    deck.tiles = []; deck.currentIndex = 0; deck.totalTiles = 0;
    plateau.reset();

    gameState      = null;
    tuileEnMain    = null;
    tuilePosee     = false;
    firstTilePlaced = false;
    zoomLevel      = 1;
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

    lobbyUI.show();
    lobbyUI.reset();
    lobbyUI.setPlayers(players);
    updateLobbyUI();

    console.log('✅ Retour au lobby terminé');
}

// ═══════════════════════════════════════════════════════
// NAVIGATION (zoom + drag)
// ═══════════════════════════════════════════════════════
function setupNavigation(container, board) {
    // ── PC : zoom molette ─────────────────────────────────────────────────
    container.addEventListener('wheel', (e) => {
        e.preventDefault();
        zoomLevel = Math.max(0.2, Math.min(3, zoomLevel + (e.deltaY > 0 ? -0.1 : 0.1)));
        board.style.transform = `scale(${zoomLevel})`;
    }, { passive: false });

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

    // ── Mobile : pinch-to-zoom + drag tactile ─────────────────────────────
    if (isMobile()) {
        let lastTouchDist   = null;
        let lastTouchX      = null;
        let lastTouchY      = null;
        let touchScrollLeft = 0;
        let touchScrollTop  = 0;

        container.addEventListener('touchstart', (e) => {
            if (e.touches.length === 2) {
                // Pinch : noter la distance initiale
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                lastTouchDist = Math.hypot(dx, dy);
            } else if (e.touches.length === 1) {
                // Drag 1 doigt
                lastTouchX      = e.touches[0].clientX;
                lastTouchY      = e.touches[0].clientY;
                touchScrollLeft = container.scrollLeft;
                touchScrollTop  = container.scrollTop;
                lastTouchDist   = null;
            }
        }, { passive: true });

        container.addEventListener('touchmove', (e) => {
            if (e.touches.length === 2 && lastTouchDist !== null) {
                // Pinch-to-zoom
                e.preventDefault();
                const dx   = e.touches[0].clientX - e.touches[1].clientX;
                const dy   = e.touches[0].clientY - e.touches[1].clientY;
                const dist = Math.hypot(dx, dy);
                const delta = (dist - lastTouchDist) * 0.01;
                zoomLevel = Math.max(0.2, Math.min(3, zoomLevel + delta));
                board.style.transform = `scale(${zoomLevel})`;
                lastTouchDist = dist;

            } else if (e.touches.length === 1 && lastTouchX !== null) {
                // Drag 1 doigt
                const dx = e.touches[0].clientX - lastTouchX;
                const dy = e.touches[0].clientY - lastTouchY;
                container.scrollLeft = touchScrollLeft - dx * 1.5;
                container.scrollTop  = touchScrollTop  - dy * 1.5;
            }
        }, { passive: false });

        container.addEventListener('touchend', (e) => {
            if (e.touches.length < 2) lastTouchDist = null;
            if (e.touches.length === 0) { lastTouchX = null; lastTouchY = null; }
        }, { passive: true });
    }

    if (isMobile()) {
        zoomLevel = 0.5;
        board.style.transform = `scale(${zoomLevel})`;
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
