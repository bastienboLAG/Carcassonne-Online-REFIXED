export class Tile {
    constructor(data) {
        this.id = data.id;
        this.imagePath = data.image || data.imagePath; // Support "image" et "imagePath"
        this.zones = data.zones || [];
        this.rotation = 0;
    }

    /**
     * Traduit une position d'edge selon la rotation actuelle
     * Pour trouver où chercher dans les données d'origine, on fait la rotation INVERSE
     * @param {string} edgeName - Ex: "north-left", "east", "south-right"
     * @returns {string} - L'edge dans les données d'origine
     */
    _rotateEdgeName(edgeName) {
        // ✅ ROTATION INVERSE (anti-horaire) pour retrouver la position d'origine
        // Si la tuile a tourné de 90° horaire, on remonte de 90° anti-horaire
        const inverseRotationMap = {
            // Anti-horaire : north → west
            'north-left': 'west-bottom',
            'north': 'west',
            'north-right': 'west-top',
            
            // Anti-horaire : east → north
            'east-top': 'north-left',
            'east': 'north',
            'east-bottom': 'north-right',
            
            // Anti-horaire : south → east
            'south-right': 'east-top',
            'south': 'east',
            'south-left': 'east-bottom',
            
            // Anti-horaire : west → south
            'west-top': 'south-right',
            'west': 'south',
            'west-bottom': 'south-left'
        };

        let currentEdge = edgeName;
        const steps = (this.rotation / 90) % 4;

        // On applique la rotation INVERSE autant de fois que nécessaire
        for (let i = 0; i < steps; i++) {
            currentEdge = inverseRotationMap[currentEdge] || currentEdge;
        }

        return currentEdge;
    }

    /**
     * Retourne le type de zone à une position donnée (en tenant compte de la rotation)
     * @param {string} edgeName - Ex: "north-left", "east", "south-right"
     * @returns {string|null} - Le type de zone ("city", "road", "field", "abbey") ou null
     */
    getEdgeType(edgeName) {
        // Traduire l'edge pour savoir où chercher dans les données d'origine
        const originalEdge = this._rotateEdgeName(edgeName);

        // Chercher d'abord l'edge spécifique (ex: "north-left")
        for (const zone of this.zones) {
            if (zone.edges.includes(originalEdge)) {
                return zone.type;
            }
        }

        // Si pas trouvé, chercher l'edge générique (ex: "north" pour "north-left")
        const genericEdge = originalEdge.split('-')[0];
        if (genericEdge !== originalEdge) {
            for (const zone of this.zones) {
                if (zone.edges.includes(genericEdge)) {
                    return zone.type;
                }
            }
        }

        return null;
    }

    /**
     * Fait tourner la tuile de 90° dans le sens horaire
     */
    rotate() {
        this.rotation = (this.rotation + 90) % 360;
    }

    /**
     * Crée une copie profonde de la tuile
     * @returns {Tile} Une nouvelle instance de Tile avec les mêmes données
     */
    clone() {
        const clonedTile = new Tile({
            id: this.id,
            zones: this.zones
        });
        clonedTile.rotation = this.rotation;
        return clonedTile;
    }
}
