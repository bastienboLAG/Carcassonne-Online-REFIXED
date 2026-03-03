/**
 * UndoManager - Gère l'annulation des actions pendant un tour
 * Permet d'annuler la pose de meeple, puis la pose de tuile
 */
export class UndoManager {
    constructor(eventBus, gameState, plateau, zoneMerger) {
        this.eventBus = eventBus;
        this.gameState = gameState;
        this.plateau = plateau;
        this.zoneMerger = zoneMerger;
        this.zoneRegistry = zoneMerger.registry;
        
        // Snapshots pour l'annulation
        this.turnStartSnapshot = null;    // État au début du tour
        this.afterTilePlacedSnapshot = null; // État après pose de tuile
        
        // État du tour
        this.tilePlacedThisTurn = false;
        this.meeplePlacedThisTurn = false;
        this.lastTilePlaced = null; // {x, y, tile}
        this.lastPlacedTileBeforeTurn = null; // {x, y} — pour restaurer l'épingle après annulation
        this.lastMeeplePlaced = null; // {x, y, position, key}

        // État abbé
        this.abbeRecalledThisTurn = false;
        this.lastAbbeRecalled = null; // {x, y, key, playerId, points}
    }

    /**
     * Sauvegarder l'état au début du tour
     */
    saveTurnStart(placedMeeples) {
        console.log('📸 Sauvegarde snapshot début de tour');

        // ✅ Nettoyage préventif : purger les zones qui référencent des tuiles absentes du plateau
        for (const [zoneId, zone] of this.zoneRegistry.zones) {
            const before = zone.tiles.length;
            zone.tiles = zone.tiles.filter(({ x, y }) =>
                this.plateau.placedTiles[`${x},${y}`] !== undefined
            );
            if (zone.tiles.length === 0 && before > 0) {
                this.zoneRegistry.zones.delete(zoneId);
                console.log(`    🧹 [saveTurnStart] Zone vide purgée: ${zoneId}`);
            } else if (zone.tiles.length !== before) {
                console.log(`    🧹 [saveTurnStart] Fantômes retirés de ${zoneId}: ${before} → ${zone.tiles.length} tuiles`);
            }
        }

        this.turnStartSnapshot = {
            placedTileKeys: Object.keys(this.plateau.placedTiles), // Seulement les clés
            zones: this.deepCopy(this.zoneRegistry.serialize()), // ✅ COPIE PROFONDE
            tileToZone: new Map(this.zoneMerger.tileToZone), // Copie de la map
            placedMeeples: this.deepCopy(placedMeeples),
            playerMeeples: this.gameState.players.map(p => ({
                id: p.id,
                meeples: p.meeples,
                hasAbbot: p.hasAbbot,
                hasLargeMeeple: p.hasLargeMeeple,
                hasBuilder: p.hasBuilder,
                hasPig:     p.hasPig
            })),
            lastPlacedTile: this.lastPlacedTileBeforeTurn // épingle avant ce tour
        };
        
        // Reset état du tour
        this.tilePlacedThisTurn = false;
        this.meeplePlacedThisTurn = false;
        this.lastTilePlaced = null;
        this.lastMeeplePlaced = null;
        this.afterTilePlacedSnapshot = null;
    }

    /**
     * Sauvegarder l'état après placement de tuile
     */
    saveAfterTilePlaced(x, y, tile, placedMeeples) {
        console.log('📸 Sauvegarde snapshot après pose tuile');

        // ✅ Nettoyage préventif identique
        for (const [zoneId, zone] of this.zoneRegistry.zones) {
            const before = zone.tiles.length;
            zone.tiles = zone.tiles.filter(({ x: tx, y: ty }) =>
                this.plateau.placedTiles[`${tx},${ty}`] !== undefined
            );
            if (zone.tiles.length === 0 && before > 0) {
                this.zoneRegistry.zones.delete(zoneId);
                console.log(`    🧹 [saveAfterTile] Zone vide purgée: ${zoneId}`);
            } else if (zone.tiles.length !== before) {
                console.log(`    🧹 [saveAfterTile] Fantômes retirés de ${zoneId}: ${before} → ${zone.tiles.length} tuiles`);
            }
        }

        this.afterTilePlacedSnapshot = {
            placedTileKeys: Object.keys(this.plateau.placedTiles), // Seulement les clés
            zones: this.deepCopy(this.zoneRegistry.serialize()), // ✅ COPIE PROFONDE
            tileToZone: new Map(this.zoneMerger.tileToZone), // Copie de la map
            placedMeeples: this.deepCopy(placedMeeples),
            playerMeeples: this.gameState.players.map(p => ({
                id: p.id,
                meeples: p.meeples,
                hasAbbot: p.hasAbbot,
                hasLargeMeeple: p.hasLargeMeeple,
                hasBuilder: p.hasBuilder,
                hasPig:     p.hasPig
            }))
        };
        
        this.tilePlacedThisTurn = true;
        this.lastTilePlaced = { x, y, tile };
    }

    /**
     * Marquer qu'un meeple a été placé
     */
    markMeeplePlaced(x, y, position, key) {
        console.log('🎭 Meeple placé ce tour:', key);
        this.meeplePlacedThisTurn = true;
        this.lastMeeplePlaced = { x, y, position, key };
    }

    /**
     * Marquer qu'un Abbé a été rappelé
     */
    markAbbeRecalled(x, y, key, playerId, points) {
        this.abbeRecalledThisTurn = true;
        this.lastAbbeRecalled = { x, y, key, playerId, points };
    }

    /**
     * Annuler la dernière action
     * @returns {Object|null} - Info sur ce qui a été annulé, ou null si rien à annuler
     */
    undo(placedMeeples) {
        console.log('🔍 État avant annulation:', {
            meeplePlacedThisTurn: this.meeplePlacedThisTurn,
            tilePlacedThisTurn: this.tilePlacedThisTurn,
            hasAfterTilePlacedSnapshot: !!this.afterTilePlacedSnapshot,
            hasTurnStartSnapshot: !!this.turnStartSnapshot
        });
        
        // Cas 0 : Annuler le rappel de l'Abbé
        if (this.abbeRecalledThisTurn && this.afterTilePlacedSnapshot) {
            console.log('⏪ Annulation : remise en place de l\'Abbé');
            this.restoreSnapshot(this.afterTilePlacedSnapshot, placedMeeples);
            const undoneAction = {
                type: 'abbe-recalled-undo',
                abbe: this.lastAbbeRecalled
            };
            this.abbeRecalledThisTurn = false;
            this.lastAbbeRecalled = null;
            return undoneAction;
        }

        // Cas 1 : Annuler la pose de meeple
        if (this.meeplePlacedThisTurn && this.afterTilePlacedSnapshot) {
            console.log('⏪ Annulation : retrait du meeple');
            
            // Restaurer l'état après placement de tuile (avant meeple)
            this.restoreSnapshot(this.afterTilePlacedSnapshot, placedMeeples);
            
            const undoneAction = {
                type: 'meeple',
                meeple: this.lastMeeplePlaced
            };
            
            this.meeplePlacedThisTurn = false;
            this.lastMeeplePlaced = null;
            
            return undoneAction;
        }
        
        // Cas 2 : Annuler la pose de tuile
        if (this.tilePlacedThisTurn && this.turnStartSnapshot) {
            console.log('⏪ Annulation : retrait de la tuile');
            
            // Restaurer l'état au début du tour
            this.restoreSnapshot(this.turnStartSnapshot, placedMeeples);
            
            const undoneAction = {
                type: 'tile',
                tile: this.lastTilePlaced,
                restoredLastPlacedTile: this.turnStartSnapshot.lastPlacedTile ?? null
            };
            
            this.tilePlacedThisTurn = false;
            this.lastTilePlaced = null;
            this.afterTilePlacedSnapshot = null;
            
            return undoneAction;
        }
        
        // Rien à annuler
        console.log('⚠️ Rien à annuler');
        return null;
    }

    /**
     * Mettre à jour la dernière tuile posée avant ce tour (pour restauration après annulation)
     */
    setLastPlacedTileBeforeTurn(tile) {
        this.lastPlacedTileBeforeTurn = tile ? { x: tile.x, y: tile.y } : null;
    }

    /**
     * Restaurer un snapshot
     */
    restoreSnapshot(snapshot, placedMeeples) {
        // Restaurer plateau : retirer les tuiles qui ne devraient pas être là
        const currentKeys = Object.keys(this.plateau.placedTiles);
        const savedKeys = snapshot.placedTileKeys;
        
        // Supprimer les tuiles ajoutées depuis le snapshot
        currentKeys.forEach(key => {
            if (!savedKeys.includes(key)) {
                delete this.plateau.placedTiles[key];
                console.log(`  🗑️ Tuile retirée: ${key}`);
            }
        });
        
        // Restaurer zones
        this.zoneRegistry.deserialize(snapshot.zones);
        
        // 🧹 Nettoyer les références fantômes : retirer les tuiles qui n'existent plus
        for (const [zoneId, zone] of this.zoneRegistry.zones) {
            const originalLength = zone.tiles.length;
            zone.tiles = zone.tiles.filter(({x, y}) => {
                const key = `${x},${y}`;
                const exists = this.plateau.placedTiles[key] !== undefined;
                if (!exists) {
                    console.log(`    🗑️ Référence fantôme retirée: (${x},${y}) de ${zoneId}`);
                }
                return exists;
            });
            
            // Si zone devient vide, la supprimer
            if (zone.tiles.length === 0 && originalLength > 0) {
                this.zoneRegistry.zones.delete(zoneId);
                console.log(`    🗑️ Zone vide supprimée: ${zoneId}`);
            }
        }
        
        // Restaurer tileToZone map dans ZoneMerger
        this.zoneMerger.tileToZone = new Map(snapshot.tileToZone);
        console.log(`  🔄 Zones et tileToZone restaurés`);
        
        // Restaurer meeples placés (vider l'objet et le remplir)
        Object.keys(placedMeeples).forEach(key => delete placedMeeples[key]);
        Object.assign(placedMeeples, this.deepCopy(snapshot.placedMeeples));
        
        // Restaurer compteur de meeples des joueurs
        snapshot.playerMeeples.forEach(saved => {
            const player = this.gameState.players.find(p => p.id === saved.id);
            if (player) {
                player.meeples  = saved.meeples;
                if (saved.hasAbbot       !== undefined) player.hasAbbot       = saved.hasAbbot;
                if (saved.hasLargeMeeple !== undefined) player.hasLargeMeeple = saved.hasLargeMeeple;
                if (saved.hasBuilder     !== undefined) player.hasBuilder     = saved.hasBuilder;
                if (saved.hasPig         !== undefined) player.hasPig         = saved.hasPig;
            }
        });
    }

    /**
     * Vérifier si on peut annuler
     */
    canUndo() {
        return this.meeplePlacedThisTurn || this.tilePlacedThisTurn || this.abbeRecalledThisTurn;
    }

    /**
     * Retourner le type de la prochaine action annulable sans l'exécuter
     */
    peekNextUndo() {
        if (this.abbeRecalledThisTurn) return 'abbe-recalled-undo';
        if (this.meeplePlacedThisTurn) return 'meeple';
        if (this.tilePlacedThisTurn)   return 'tile';
        return null;
    }

    /**
     * Reset à la fin du tour
     */
    reset() {
        console.log('🔄 UndoManager: reset() appelé');
        this.turnStartSnapshot = null;
        this.afterTilePlacedSnapshot = null;
        this.tilePlacedThisTurn = false;
        this.meeplePlacedThisTurn = false;
        this.lastTilePlaced = null;
        this.lastMeeplePlaced = null;
        this.abbeRecalledThisTurn = false;
        this.lastAbbeRecalled = null;
    }

    /**
     * Deep copy d'un objet
     */
    deepCopy(obj) {
        return JSON.parse(JSON.stringify(obj));
    }

    /**
     * Détruire le module
     */
    destroy() {
        console.log('🧹 UndoManager: cleanup');
        this.reset();
    }
}
