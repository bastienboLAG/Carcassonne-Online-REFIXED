/**
 * Gère le calcul des scores
 */
export class Scoring {
    constructor(zoneMerger) {
        this.zoneMerger = zoneMerger;
    }

    /**
     * Calculer les scores des zones fermées et retourner les meeples
     * Appelé à la fin de chaque tour
     * @returns {scoringResults: [{playerId, points, reason}], meeplesToReturn: [keys]}
     */
    scoreClosedZones(placedMeeples) {
        console.log('💰 Calcul des scores pour zones fermées...');
        
        const scoringResults = [];
        const meeplesToReturn = [];

        // ✅ Récupérer toutes les zones du registry
        const allZones = this.zoneMerger.getAllZones();
        
        // Parcourir toutes les zones mergées
        allZones.forEach(mergedZone => {
            if (!mergedZone.isComplete) return;

            console.log(`✅ Zone ${mergedZone.type} fermée détectée`);

            // Récupérer les meeples dans cette zone
            const meeples = this.zoneMerger.getZoneMeeples(mergedZone, placedMeeples);
            
            if (meeples.length === 0) {
                console.log('  Aucun meeple dans cette zone');
                return;
            }

            // Déterminer qui a la majorité
            const owners = this._getZoneOwners(meeples);
            console.log('  Propriétaires:', owners);

            // Calculer les points
            let points = 0;
            let reason = '';

            if (mergedZone.type === 'city') {
                points = this._scoreClosedCity(mergedZone);
                const uniqueTiles = this._countUniqueTiles(mergedZone);
                reason = `Ville fermée (${uniqueTiles} tuiles, ${mergedZone.shields} blasons)`;
            } else if (mergedZone.type === 'road') {
                points = this._scoreClosedRoad(mergedZone);
                const uniqueTiles = this._countUniqueTiles(mergedZone);
                reason = `Route fermée (${uniqueTiles} tuiles)`;
            } else if (mergedZone.type === 'abbey') {
                points = this._scoreClosedAbbey();
                reason = 'Abbaye complète';
            } else if (mergedZone.type === 'garden') {
                points = this._scoreClosedAbbey(); // même logique : 9 pts
                reason = 'Jardin complet';
            }

            // Attribuer les points aux propriétaires
            owners.forEach(playerId => {
                scoringResults.push({ 
                    playerId, 
                    points, 
                    reason,
                    zoneType: mergedZone.type // ← Ajout du type de zone
                });
                console.log(`  ${playerId} gagne ${points} points pour ${reason}`);
            });

            // Marquer les meeples pour retour
            meeples.forEach(meeple => {
                meeplesToReturn.push(meeple.key);
            });
        });

        return { scoringResults, meeplesToReturn };
    }

    /**
     * Calculer les points d'une ville fermée
     * 2 points par tuile + 2 points par blason
     */
    _scoreClosedCity(mergedZone) {
        const uniqueTiles = this._countUniqueTiles(mergedZone);
        return (uniqueTiles * 2) + (mergedZone.shields * 2);
    }

    /**
     * Calculer les points d'une route fermée
     * 1 point par tuile
     */
    _scoreClosedRoad(mergedZone) {
        const uniqueTiles = this._countUniqueTiles(mergedZone);
        return uniqueTiles;
    }

    /**
     * Compter les tuiles uniques dans une zone (éviter les doublons)
     * Une tuile peut avoir plusieurs zones du même type
     */
    _countUniqueTiles(mergedZone) {
        const uniqueCoords = new Set();
        mergedZone.tiles.forEach(tile => {
            uniqueCoords.add(`${tile.x},${tile.y}`);
        });
        return uniqueCoords.size;
    }

    /**
     * Calculer les points d'une abbaye complète
     * 9 points (1 + 8 tuiles autour)
     */
    _scoreClosedAbbey() {
        return 9;
    }

    /**
     * Déterminer les joueurs qui ont la majorité de meeples
     * @returns {Array} Liste des playerIds ayant la majorité
     */
    _getZoneOwners(meeples) {
        const counts = {};
        
        meeples.forEach(meeple => {
            counts[meeple.playerId] = (counts[meeple.playerId] || 0) + 1;
        });

        const maxCount = Math.max(...Object.values(counts));
        
        // Retourner tous les joueurs avec le max (égalité possible)
        return Object.keys(counts).filter(playerId => counts[playerId] === maxCount);
    }

    /**
     * Calculer les scores finaux (fin de partie)
     */
    calculateFinalScores(placedMeeples, gameState) {
        console.log('🏁 Calcul des scores finaux...');
        
        const finalScores = [];
        const allZones = this.zoneMerger.getAllZones();

        // 1. Villes incomplètes : 1 pt/tuile + 1 pt/blason
        allZones.forEach(mergedZone => {
            if (mergedZone.type !== 'city' || mergedZone.isComplete) return;

            const meeples = this.zoneMerger.getZoneMeeples(mergedZone, placedMeeples);
            if (meeples.length === 0) return;

            const owners = this._getZoneOwners(meeples);
            const points = this._countUniqueTiles(mergedZone) + mergedZone.shields;

            owners.forEach(playerId => {
                finalScores.push({
                    playerId,
                    points,
                    reason: `Ville incomplète (${this._countUniqueTiles(mergedZone)} tuiles, ${mergedZone.shields} blasons)`
                });
            });
        });

        // 2. Routes incomplètes : 1 pt/tuile
        allZones.forEach(mergedZone => {
            if (mergedZone.type !== 'road' || mergedZone.isComplete) return;

            const meeples = this.zoneMerger.getZoneMeeples(mergedZone, placedMeeples);
            if (meeples.length === 0) return;

            const owners = this._getZoneOwners(meeples);
            const points = this._countUniqueTiles(mergedZone);

            owners.forEach(playerId => {
                finalScores.push({
                    playerId,
                    points,
                    reason: `Route incomplète (${this._countUniqueTiles(mergedZone)} tuiles)`
                });
            });
        });

        // 3. Abbayes et jardins incomplets : 1 pt + 1 pt/tuile adjacente
        allZones.forEach(mergedZone => {
            if ((mergedZone.type !== 'abbey' && mergedZone.type !== 'garden') || mergedZone.isComplete) return;

            const meeples = this.zoneMerger.getZoneMeeples(mergedZone, placedMeeples);
            if (meeples.length === 0) return;

            const { x, y } = mergedZone.tiles[0];
            const adjacentCount = this._countAdjacentTiles(x, y);
            const points = 1 + adjacentCount;

            meeples.forEach(meeple => {
                finalScores.push({
                    playerId: meeple.playerId,
                    points,
                    reason: `${mergedZone.type === 'garden' ? 'Jardin' : 'Abbaye'} incomplet (1 + ${adjacentCount} tuiles adjacentes)`
                });
            });
        });

        // 4. Champs (farmers) : 3 pts par ville complète adjacente
        const closedCities = this.zoneMerger.getClosedCities();
        
        console.log('🌾 === CALCUL DES CHAMPS ===');
        console.log(`  Villes fermées disponibles: ${closedCities.map(c => c.id).join(', ')}`);
        
        allZones.forEach(mergedZone => {
            if (mergedZone.type !== 'field') return;

            const meeples = this.zoneMerger.getZoneMeeples(mergedZone, placedMeeples);
            if (meeples.length === 0) return;

            console.log(`\n  🌾 Champ ${mergedZone.id}:`);
            console.log(`    Meeples: ${meeples.map(m => m.playerId).join(', ')}`);
            console.log(`    adjacentCities: [${mergedZone.adjacentCities || []}]`);

            const adjacentClosedCities = this._countAdjacentClosedCities(mergedZone, closedCities);
            if (adjacentClosedCities === 0) return;

            const owners = this._getZoneOwners(meeples);
            const points = adjacentClosedCities * 3;
            
            console.log(`    Propriétaires: ${owners.join(', ')}`);
            console.log(`    Points attribués: ${points} (${adjacentClosedCities} villes × 3)`);

            owners.forEach(playerId => {
                finalScores.push({
                    playerId,
                    points,
                    reason: `Champ (${adjacentClosedCities} villes complètes)`
                });
            });
        });

        return finalScores;
    }

    /**
     * Appliquer les scores finaux et retourner le détail complet
     * Cette méthode calcule les scores finaux, les applique au gameState,
     * et retourne un tableau trié des scores détaillés de chaque joueur
     * @returns {Array} Tableau des scores détaillés, trié par score décroissant
     */
    applyAndGetFinalScores(placedMeeples, gameState) {
        const finalScores = this.calculateFinalScores(placedMeeples, gameState);
        
        console.log('📊 Application des scores finaux...');
        
        // Appliquer les scores finaux au gameState
        finalScores.forEach(({ playerId, points, reason }) => {
            const player = gameState.players.find(p => p.id === playerId);
            if (player) {
                player.score += points;
                
                // Identifier le type de zone pour le détail
                if (reason.includes('Ville')) {
                    player.scoreDetail.cities += points;
                } else if (reason.includes('Route')) {
                    player.scoreDetail.roads += points;
                } else if (reason.includes('Abbaye')) {
                    player.scoreDetail.monasteries += points;
                } else if (reason.includes('Champ')) {
                    player.scoreDetail.fields += points;
                }
                
                console.log(`  ${player.name} +${points} pts (${reason})`);
            }
        });
        
        // Créer le détail complet pour chaque joueur, trié par score décroissant
        const detailedScores = gameState.players
            .map(p => ({
                id: p.id,
                name: p.name,
                color: p.color,
                cities: p.scoreDetail.cities,
                roads: p.scoreDetail.roads,
                monasteries: p.scoreDetail.monasteries,
                fields: p.scoreDetail.fields,
                total: p.score
            }))
            .sort((a, b) => b.total - a.total); // Tri décroissant
        
        console.log('✅ Scores finaux appliqués et triés');
        
        return detailedScores;
    }

    /**
     * Compter les tuiles adjacentes à une position (pour abbaye incomplète)
     */
    _countAdjacentTiles(x, y) {
        const directions = [
            { dx: -1, dy: -1 }, { dx: 0, dy: -1 }, { dx: 1, dy: -1 },
            { dx: -1, dy: 0 },                      { dx: 1, dy: 0 },
            { dx: -1, dy: 1 },  { dx: 0, dy: 1 },  { dx: 1, dy: 1 }
        ];

        let count = 0;
        directions.forEach(({ dx, dy }) => {
            if (this.zoneMerger.board.placedTiles[`${x + dx},${y + dy}`]) {
                count++;
            }
        });

        return count;
    }

    /**
     * Compter les villes complètes adjacentes à un champ
     */
    _countAdjacentClosedCities(fieldZone, closedCities) {
        console.log('🔍 Comptage villes adjacentes pour field:', fieldZone.id);
        console.log('  adjacentCities dans la zone:', fieldZone.adjacentCities);
        console.log('  Villes fermées disponibles:', closedCities.length);
        
        if (!fieldZone.adjacentCities || fieldZone.adjacentCities.length === 0) {
            console.log('  ❌ Pas de villes adjacentes');
            return 0;
        }
        
        let count = 0;
        const closedCityIds = new Set(closedCities.map(c => c.id));
        
        // adjacentCities contient maintenant les IDs de zones mergées
        fieldZone.adjacentCities.forEach(cityZoneId => {
            console.log(`  Vérification zone mergée ${cityZoneId}...`);
            
            if (closedCityIds.has(cityZoneId)) {
                console.log(`    ✅ Zone ${cityZoneId} est fermée`);
                count++;
            } else {
                console.log(`    ❌ Zone ${cityZoneId} n'est pas fermée`);
            }
        });
        
        console.log(`  → Total villes fermées adjacentes: ${count}`);
        return count;
    }
}
