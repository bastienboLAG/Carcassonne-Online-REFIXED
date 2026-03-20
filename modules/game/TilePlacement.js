/**
 * TilePlacement - Gère la logique de placement des tuiles
 * Responsabilités :
 * - Valider si une tuile peut être placée
 * - Placer une tuile sur le plateau
 * - Gérer l'affichage visuel des tuiles
 * - Émettre les événements de placement
 */
export class TilePlacement {
    constructor(eventBus, plateau, zoneMerger) {
        this.eventBus = eventBus;
        this.plateau = plateau;
        this.zoneMerger = zoneMerger;
        
        // État
        this.firstTilePlaced = false;
        this.lastPlacedTile = null;
        
        // Écouter les événements pour se synchroniser
        this.eventBus.on('tile-placed', (data) => {
            if (data.isFirst) {
                this.firstTilePlaced = true;
                console.log('🔄 TilePlacement: firstTilePlaced = true');
            }
        });
    }

    /**
     * Vérifier si une tuile peut être placée à une position
     */
    canPlace(x, y, tile) {
        // Première tuile : toujours au centre
        if (!this.firstTilePlaced) {
            return x === 50 && y === 50;
        }
        
        // Autres tuiles : vérifier avec le plateau
        return this.plateau.canPlaceTile(x, y, tile);
    }

    /**
     * Placer une tuile
     * @returns {boolean} true si placement réussi
     */
    placeTile(x, y, tile, options = {}) {
        const { isFirst = false, skipSync = false, skipValidation = false } = options;
        
        console.log('🎯 TilePlacement: placement tuile', { x, y, tile: tile.id, isFirst });
        
        if (!tile) {
            console.error('❌ tile est null/undefined');
            return false;
        }
        
        // Valider le placement (sauf reconstruction)
        if (!skipValidation && !this.canPlace(x, y, tile)) {
            console.warn('⚠️ Impossible de placer la tuile ici');
            return false;
        }

        // Afficher visuellement
        this.displayTile(x, y, tile);
        
        // Ajouter au plateau (logique)
        const copy = tile.clone();
        this.plateau.addTile(x, y, copy);

        // Mettre à jour l'état
        if (isFirst || !this.firstTilePlaced) {
            this.firstTilePlaced = true;
        }
        
        this.lastPlacedTile = { x, y };
        
        // Merger les zones (sauf si l'état est fourni par l'hôte)
        if (this.zoneMerger && !options.skipZoneMerger) {
            this.newlyClosedZones = this.zoneMerger.updateZonesForNewTile(x, y) || [];
        } else {
            this.newlyClosedZones = [];
        }
        
        // Émettre événement
        this.eventBus.emit('tile-placed', { 
            x, 
            y, 
            tile,
            isFirst: isFirst || !this.firstTilePlaced,
            skipSync
        });
        
        console.log('✅ Tuile placée avec succès');
        return true;
    }

    /**
     * Afficher visuellement une tuile sur le plateau
     */
    displayTile(x, y, tile) {
        const boardElement = document.getElementById('board');
        if (!boardElement) {
            console.error('❌ Board element introuvable');
            return;
        }
        
        const img = document.createElement('img');
        img.src = tile.imagePath;
        img.className = "tile";
        img.dataset.pos = `${x},${y}`; // Pour retrouver la tuile lors de l'annulation
        img.style.gridColumn = x;
        img.style.gridRow = y;
        img.style.transform = `rotate(${tile.rotation}deg)`;
        boardElement.appendChild(img);
    }

    /**
     * Obtenir la dernière tuile placée
     */
    getLastPlacedTile() {
        return this.lastPlacedTile;
    }

    /**
     * Vérifier si c'est la première tuile
     */
    isFirstTile() {
        return !this.firstTilePlaced;
    }

    /**
     * Réinitialiser pour une nouvelle partie
     */
    reset() {
        this.firstTilePlaced = false;
        this.lastPlacedTile = null;
    }

    /**
     * Injecter les dépendances visuelles/contextuelles nécessaires à handlePlace/handlePlaceSync.
     * Appelé une fois après instanciation depuis home.js.
     */
    initHandlers(deps) {
        this._deps = deps;
    }

    /**
     * Point d'entrée pour poser une tuile (hôte, invité, solo).
     * Anciennement poserTuile() dans home.js.
     */
    handlePlace(x, y, tile, isFirst = false) {
        console.log('🎯 poserTuile appelé:', { x, y, tile, isFirst });
        const d = this._deps;

        if (d.getGameSync() && !d.getIsHost()) {
            // Invité purement réactif — envoie une request, attend le broadcast hôte
            document.querySelectorAll('.slot').forEach(s => s.remove());
            d.getTilePreviewUI()?.showBackside();
            d.setTuileEnMain(null);
            d.updateMobileTilePreview();
            d.updateMobileButtons();
            d.updateTurnDisplay();
            d.getGameSync().syncTilePlacementRequest(x, y, tile);
            return;
        }

        // Hôte ou solo : applique localement
        const success = this.placeTile(x, y, tile, { isFirst });
        if (!success) return;

        d.setTuilePosee(true);
        d.setFirstTilePlaced(true);
        d.setLastPlacedTile({ x, y });
        d.getGameState().currentTilePlaced = true;
        d.setCurrentTileForPlayer(null);

        d.getUnplaceableManager()?.resetSeenImplacable();

        document.querySelectorAll('.slot').forEach(s => s.remove());
        d.getTilePreviewUI()?.showBackside();
        d.updateMobileButtons();
        d.updateTurnDisplay();

        if (d.getGameSync()) d.getGameSync().syncTilePlacement(x, y, tile, d.getZoneMerger());

        const gameConfig  = d.getGameConfig();
        const dragonRules = d.getDragonRules();
        const gameState   = d.getGameState();
        const zoneMerger  = d.getZoneMerger();

        // Extension Dragon : détecter volcano et zone dragon
        const _isVolcanoTile = !!(gameConfig.tileGroups?.dragon && gameConfig.extensions?.dragon && d.tileHasVolcanoZone(tile));
        if (gameConfig.tileGroups?.dragon && gameConfig.extensions?.dragon && dragonRules) {
            if (_isVolcanoTile) {
                gameState._pendingVolcanoPos = { x, y };
            }
            if (d.tileHasDragonZone(tile)) {
                gameState._pendingDragonTile = { x, y, playerIndex: gameState.currentPlayerIndex };
            }
        }

        // Extension Princesse
        const _hasPrincessZone = !!(gameConfig.tileGroups?.dragon && gameConfig.extensions?.princess
            && tile.zones?.some(z => z.type === 'city' && z.features?.includes?.('princess')));
        if (_hasPrincessZone && dragonRules && d.getIsMyTurn()) {
            const targets = dragonRules.getPrincessTargets(x, y, tile, d.getMultiplayer().playerId, zoneMerger);
            if (targets.length > 0) {
                gameState._pendingPrincessTile = { x, y, targets };
            }
        }

        // Extension Portail Magique
        const _hasPortalZone = !!(gameConfig.tileGroups?.dragon && gameConfig.extensions?.portal
            && d.tileHasPortalZone(tile));
        const undoManager = d.getUndoManager();
        if (_hasPortalZone && dragonRules && d.getIsMyTurn() && !undoManager?.meeplePlacedThisTurn) {
            const portalZoneIdx = tile.zones?.findIndex(z => z.type === 'portal');
            if (portalZoneIdx !== -1) {
                const rawPos = tile.zones[portalZoneIdx].meeplePosition;
                if (rawPos != null) {
                    const rotatedPos = zoneMerger ? zoneMerger._rotatePosition(rawPos, tile.rotation) : Number(rawPos);
                    gameState._pendingPortalTile = { x, y, zoneIndex: portalZoneIdx, position: rotatedPos };
                }
            }
        }

        // Afficher curseurs meeple
        const meepleCursorsUI = d.getMeepleCursorsUI();
        if (d.getIsMyTurn() && d.getGameSync() && meepleCursorsUI && !undoManager?.abbeRecalledThisTurn) {
            if (!_isVolcanoTile) {
                meepleCursorsUI.showCursors(x, y, gameState, d.getPlacedMeeples(), d.afficherSelecteurMeeple);
            }
            d.showMeepleActionCursors();
        }

        if (undoManager && d.getIsMyTurn() && d.getIsHost()) {
            undoManager.saveAfterTilePlaced(x, y, tile, d.getPlacedMeeples());
        }

        d.setTuileEnMain(null);
        d.updateMobileTilePreview();
        d.updateTurnDisplay();
    }

    /**
     * Appliquer un placement reçu du réseau (broadcast hôte → invités).
     * Anciennement poserTuileSync() dans home.js.
     */
    handlePlaceSync(x, y, tile, extraOptions = {}) {
        console.log('🔄 poserTuileSync appelé:', { x, y, tile });
        const d       = this._deps;
        const isFirst = !d.getFirstTilePlaced();

        d.setTuileEnMain(null);
        d.updateMobileTilePreview();

        this.placeTile(x, y, tile, { isFirst, skipSync: true, ...extraOptions });

        if (!d.getFirstTilePlaced()) d.setFirstTilePlaced(true);
        d.setTuilePosee(true);
        d.setLastPlacedTile({ x, y });

        const gameConfig  = d.getGameConfig();
        const dragonRules = d.getDragonRules();
        const gameState   = d.getGameState();
        const zoneMerger  = d.getZoneMerger();

        // Extension Dragon
        if (gameConfig.tileGroups?.dragon && gameConfig.extensions?.dragon && dragonRules) {
            if (d.tileHasVolcanoZone(tile)) gameState._pendingVolcanoPos = { x, y };
            if (d.tileHasDragonZone(tile))  gameState._pendingDragonTile = { x, y, playerIndex: gameState.currentPlayerIndex };
        }
        // Portail (même sans dragonRules actif, pour que le postUndoState soit correct)
        if (gameConfig.tileGroups?.dragon && gameConfig.extensions?.portal && d.tileHasPortalZone(tile)) {
            const portalZoneIdx = tile.zones?.findIndex(z => z.type === 'portal');
            if (portalZoneIdx !== -1) {
                const rawPos = tile.zones[portalZoneIdx].meeplePosition;
                if (rawPos != null) {
                    const rotatedPos = zoneMerger ? zoneMerger._rotatePosition(rawPos, tile.rotation) : Number(rawPos);
                    gameState._pendingPortalTile = { x, y, zoneIndex: portalZoneIdx, position: rotatedPos };
                }
            }
        }
    }
}
