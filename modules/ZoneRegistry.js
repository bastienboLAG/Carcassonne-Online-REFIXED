/**
 * Registre central pour toutes les zones mergées du plateau
 * Persiste en mémoire et se met à jour incrémentalement
 */
export class ZoneRegistry {
    constructor() {
        this.zones = new Map();              // ID → MergedZone
        this.nextId = 1;                     // Compteur pour générer IDs
        this.closedCitiesHistory = [];       // Villes fermées (pour scoring fields)
    }

    /**
     * Créer une nouvelle zone mergée
     */
    createZone(type) {
        const id = `zone_${this.nextId++}`;
        const zone = {
            id: id,
            type: type,
            tiles: [],           // [{x, y, zoneIndex}]
            isComplete: false,
            shields: 0,
            adjacentCities: []   // Pour les fields (scoring farmers)
        };
        this.zones.set(id, zone);
        console.log(`📝 Nouvelle zone créée: ${id} (${type})`);
        return zone;
    }

    /**
     * Récupérer une zone par ID
     */
    getZone(id) {
        return this.zones.get(id);
    }

    /**
     * Supprimer une zone (quand elle fusionne avec une autre)
     */
    deleteZone(id) {
        console.log(`🗑️ Zone supprimée: ${id}`);
        this.zones.delete(id);
    }

    /**
     * Fusionner deux zones en une seule
     */
    mergeZones(zoneId1, zoneId2) {
        const zone1 = this.zones.get(zoneId1);
        const zone2 = this.zones.get(zoneId2);

        if (!zone1 || !zone2) {
            console.error('❌ Tentative de fusion de zones inexistantes');
            return null;
        }

        if (zone1.type !== zone2.type) {
            console.error('❌ Tentative de fusion de zones de types différents');
            return null;
        }

        console.log(`🔗 Fusion ${zoneId1} + ${zoneId2}`);

        // Fusionner zone2 dans zone1
        zone1.tiles.push(...zone2.tiles);
        zone1.shields += zone2.shields;
        
        // ✅ Fusionner adjacentCities (éviter les doublons)
        if (zone2.adjacentCities && zone2.adjacentCities.length > 0) {
            zone1.adjacentCities = [...new Set([...zone1.adjacentCities, ...zone2.adjacentCities])];
        }
        console.log(`  🔗 [MERGE] ${zoneId1} adjacentCities après fusion: [${zone1.adjacentCities.join(', ')}]`);

        // ✅ Fusionner _unresolvedCities (IDs locaux pas encore résolus)
        if (zone2._unresolvedCities && zone2._unresolvedCities.length > 0) {
            if (!zone1._unresolvedCities) zone1._unresolvedCities = [];
            zone1._unresolvedCities.push(...zone2._unresolvedCities);
            console.log(`  🔗 [MERGE] _unresolvedCities transférés: ${zone2._unresolvedCities.length} entrées`);
        }

        // ✅ Mettre à jour toutes les zones field qui référencent zoneId2 → zoneId1
        // (cas où une ville absorbée était déjà dans adjacentCities d'un champ)
        for (const [id, zone] of this.zones) {
            if (zone.type === 'field' && zone.adjacentCities) {
                const idx = zone.adjacentCities.indexOf(zoneId2);
                if (idx !== -1) {
                    zone.adjacentCities[idx] = zoneId1;
                    zone.adjacentCities = [...new Set(zone.adjacentCities)]; // dédupliquer
                    console.log(`  🔗 [REMAP] field ${id}: ${zoneId2} → ${zoneId1} dans adjacentCities`);
                }
            }
        }

        // Supprimer zone2
        this.deleteZone(zoneId2);

        return zone1;
    }

    /**
     * Trouver la zone mergée qui contient une tuile spécifique
     */
    findZoneContaining(x, y, zoneIndex) {
        for (const [id, zone] of this.zones) {
            const found = zone.tiles.find(t => t.x === x && t.y === y && t.zoneIndex === zoneIndex);
            if (found) {
                return zone;
            }
        }
        return null;
    }

    /**
     * Marquer une ville comme fermée (pour historique)
     */
    markCityAsClosed(zoneId) {
        const zone = this.zones.get(zoneId);
        if (zone && zone.type === 'city' && zone.isComplete) {
            // Vérifier si déjà dans l'historique
            if (!this.closedCitiesHistory.includes(zoneId)) {
                this.closedCitiesHistory.push(zoneId);
                console.log(`🏰 Ville fermée ajoutée à l'historique: ${zoneId}`);
            }
        }
    }

    /**
     * Obtenir toutes les villes fermées
     */
    getClosedCities() {
        return this.closedCitiesHistory.map(id => this.zones.get(id)).filter(z => z);
    }

    /**
     * Lister toutes les zones (debug)
     */
    listAll() {
        console.log('📋 Zones mergées actuelles:');
        for (const [id, zone] of this.zones) {
            console.log(`  ${id}: ${zone.type}, ${zone.tiles.length} tuiles, fermée=${zone.isComplete}`);
        }
    }

    /**
     * Sérialiser le registry pour sauvegarde
     */
    serialize() {
        return {
            zones: Array.from(this.zones.entries()),
            nextId: this.nextId,
            closedCitiesHistory: [...this.closedCitiesHistory]
        };
    }

    /**
     * Désérialiser le registry depuis une sauvegarde
     */
    deserialize(data) {
        this.zones = new Map(data.zones);
        this.nextId = data.nextId;
        this.closedCitiesHistory = [...data.closedCitiesHistory];
    }
    
    /**
     * Reconstruire la tileToZone map depuis les zones actuelles
     * À appeler après un deserialize pour remettre à jour la map
     */
    rebuildTileToZone() {
        const tileToZone = new Map();
        
        for (const [zoneId, zone] of this.zones) {
            // Pour chaque tuile dans la zone
            zone.tiles.forEach(tileRef => {
                const { x, y, zoneIndex } = tileRef;
                const key = `${x},${y},${zoneIndex}`;
                tileToZone.set(key, zoneId);
            });
        }
        
        return tileToZone;
    }
}
