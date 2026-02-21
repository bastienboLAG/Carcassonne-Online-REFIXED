/**
 * MeepleCursorsUI - Gère l'affichage des curseurs de placement de meeples
 * CODE COPIÉ EXACTEMENT de afficherCurseursMeeple, afficherSelecteurMeeple
 */
export class MeepleCursorsUI {
    constructor(multiplayer, zoneMerger, plateau, config = {}) {
        this.multiplayer = multiplayer;
        this.zoneMerger = zoneMerger;
        this.plateau = plateau;
        this.config = config;
        this.boardElement = null;
        this.onAbbeRecall = null; // callback(x, y, key) quand le joueur rappelle l'Abbé
    }

    init() {
        this.boardElement = document.getElementById('board');
    }

    /**
     * Faire tourner une position de meeple - COPIE EXACTE de rotatePosition()
     */
    rotatePosition(position, rotation) {
        if (rotation === 0) return position;
        
        // Convertir position en coordonnées (row, col)
        const row = Math.floor((position - 1) / 5);
        const col = (position - 1) % 5;
        
        let newRow = row;
        let newCol = col;
        
        // Appliquer les rotations successives
        const rotations = rotation / 90;
        for (let i = 0; i < rotations; i++) {
            const tempRow = newRow;
            newRow = newCol;
            newCol = 4 - tempRow;
        }
        
        // Reconvertir en position (1-25)
        return (newRow * 5) + newCol + 1;
    }

    /**
     * Obtenir les positions valides de meeple depuis les zones - COPIE EXACTE
     */
    getValidMeeplePositions(x, y) {
        const tile = this.plateau.placedTiles[`${x},${y}`];
        if (!tile) {
            console.log('❌ Tuile non trouvée à', x, y);
            return [];
        }
        
        console.log('🔍 Tuile trouvée:', tile.id, 'rotation:', tile.rotation);
        console.log('📦 Zones de la tuile:', tile.zones);
        
        if (!tile.zones || tile.zones.length === 0) {
            console.log('❌ Pas de zones sur cette tuile');
            return [];
        }
        
        const validPositions = [];
        
        // Pour chaque zone, récupérer ses positions et les faire tourner
        tile.zones.forEach((zone, index) => {
            console.log(`  Zone ${index}:`, zone.type, 'meeplePosition:', zone.meeplePosition);
            
            if (zone.meeplePosition !== undefined && zone.meeplePosition !== null) {
                // ✅ Gérer à la fois nombre et array
                const positions = Array.isArray(zone.meeplePosition) 
                    ? zone.meeplePosition 
                    : [zone.meeplePosition];
                
                positions.forEach(pos => {
                    const rotatedPos = this.rotatePosition(pos, tile.rotation);
                    console.log(`    Position ${pos} → ${rotatedPos} (rotation ${tile.rotation}°)`);
                    validPositions.push({
                        position: rotatedPos,
                        zoneType: zone.type
                    });
                });
            }
        });
        
        console.log('✅ Total positions valides:', validPositions.length);
        return validPositions;
    }

    /**
     * Vérifier si le joueur a des meeples disponibles
     */
    hasAvailableMeeples(playerId, gameState) {
        if (!gameState) return false;
        const player = gameState.players.find(p => p.id === playerId);
        return player && player.meeples > 0;
    }

    /**
     * Afficher les curseurs de meeple - COPIE EXACTE de afficherCurseursMeeple()
     */
    showCursors(x, y, gameState, placedMeeples, onCursorClick) {
        console.log('🎯 Affichage des curseurs de meeple sur', x, y);
        
        // ✅ Vérifier si le joueur a des ressources disponibles (meeples ou abbé)
        const activePlayer = gameState.players.find(p => p.id === this.multiplayer.playerId);
        const hasMeeples = activePlayer && activePlayer.meeples > 0;
        const hasAbbot   = activePlayer?.hasAbbot === true;
        if (!hasMeeples && !hasAbbot) {
            console.log('❌ Pas de meeples ni d\'abbé disponibles, pas d\'affichage de curseurs');
            return;
        }
        
        // Nettoyer les anciens curseurs et conteneurs
        document.querySelectorAll('.meeple-cursors-container').forEach(c => c.remove());
        
        // ✅ Récupérer les positions valides depuis les zones de la tuile
        const validPositions = this.getValidMeeplePositions(x, y);
        if (validPositions.length === 0) {
            console.log('⚠️ Aucune position de meeple valide sur cette tuile');
            return;
        }
        
        console.log('✅ Positions valides:', validPositions);
        
        // Créer un conteneur pour les curseurs sur cette tuile
        const container = document.createElement('div');
        container.className = 'meeple-cursors-container';
        container.style.gridColumn = x;
        container.style.gridRow = y;
        container.style.position = 'relative';
        container.style.width = '208px';
        container.style.height = '208px';
        container.style.pointerEvents = 'none';
        container.style.zIndex = '100';
        
        // Créer un curseur pour chaque position valide
        validPositions.forEach(({position, zoneType}) => {
            // Filtrer les champs si désactivés
            if (zoneType === 'field' && this.config.playFields === false) {
                console.log('🚫 Champs désactivés, pas de curseur field à position', position);
                return;
            }
            // Filtrer les zones normales si pas de meeples
            if (zoneType !== 'garden' && zoneType !== 'abbey' && !hasMeeples) {
                return;
            }
            // Filtrer les jardins/abbayes si l'abbé n'est pas disponible
            if ((zoneType === 'garden' || zoneType === 'abbey') && !hasAbbot) {
                return;
            }
            
            const key = `${x},${y},${position}`;
            
            console.log('🔍 Vérification position', position, 'key:', key);
            console.log('📦 placedMeeples:', placedMeeples);
            console.log('❓ placedMeeples[key]:', placedMeeples[key]);
            
            // Vérifier si la position est déjà occupée
            if (placedMeeples[key]) {
                console.log('⏭️ Position', position, 'déjà occupée, pas de curseur');
                return;
            }
            
            // ✅ Vérifier si la zone mergée contient déjà un meeple
            if (this.zoneMerger) {
                console.log('🔎 Recherche zone mergée pour position', position);
                const mergedZone = this.zoneMerger.findMergedZoneForPosition(x, y, position);
                console.log('📍 Zone mergée trouvée:', mergedZone);
                if (mergedZone) {
                    const meeplesInZone = this.zoneMerger.getZoneMeeples(mergedZone, placedMeeples);
                    console.log('🎭 Meeples dans cette zone:', meeplesInZone);
                    if (meeplesInZone.length > 0) {
                        console.log('⏭️ Position', position, 'dans une zone avec meeple(s), pas de curseur');
                        return;
                    }
                }
            }
            
            const cursor = document.createElement('div');
            cursor.className = 'meeple-cursor';
            cursor.dataset.zoneType = zoneType;
            
            // Calculer la position dans la grille 5x5
            const row = Math.floor((position - 1) / 5);
            const col = (position - 1) % 5;
            
            const offsetX = 20.8 + (col * 41.6);
            const offsetY = 20.8 + (row * 41.6);
            
            cursor.style.position = 'absolute';
            cursor.style.left = `${offsetX}px`;
            cursor.style.top = `${offsetY}px`;
            cursor.style.width = '12px';
            cursor.style.height = '12px';
            cursor.style.borderRadius = '50%';
            cursor.style.backgroundColor = 'rgba(0, 0, 0, 0.8)'; // Noir
            cursor.style.border = '2px solid rgb(200, 0, 175)'; // Mauve
            cursor.style.cursor = 'pointer';
            cursor.style.pointerEvents = 'auto';
            cursor.style.transition = 'all 0.2s';
            cursor.style.transform = 'translate(-50%, -50%)';
            
            cursor.onmouseenter = () => {
                cursor.style.backgroundColor = 'rgba(0, 0, 0, 1)'; // Noir opaque
                cursor.style.border = '2px solid rgb(220, 50, 195)'; // Mauve plus clair au survol
                cursor.style.transform = 'translate(-50%, -50%) scale(1.3)';
            };
            
            cursor.onmouseleave = () => {
                cursor.style.backgroundColor = 'rgba(0, 0, 0, 0.8)'; // Retour noir transparent
                cursor.style.border = '2px solid rgb(200, 0, 175)'; // Retour mauve
                cursor.style.transform = 'translate(-50%, -50%) scale(1)';
            };
            
            cursor.onclick = (e) => {
                e.stopPropagation();
                onCursorClick(x, y, position, zoneType, e.clientX, e.clientY);
            };
            
            container.appendChild(cursor);
        });
        
        this.boardElement.appendChild(container);
    }

    /**
     * Cacher tous les curseurs
     */
    hideCursors() {
        document.querySelectorAll('.meeple-cursors-container').forEach(c => c.remove());
        document.querySelectorAll('.abbe-recall-overlay').forEach(c => c.remove());
    }

    /**
     * Mettre en évidence les Abbés rappelables du joueur courant
     * Appelé en phase 2 si extension Abbé activée et Abbé posé sur le plateau
     */
    showAbbeRecallTargets(placedMeeples, playerId, onRecall) {
        if (!this.config.extensions?.abbot) return;
        this.onAbbeRecall = onRecall;

        // Chercher tous les Abbés du joueur courant sur le plateau
        Object.entries(placedMeeples).forEach(([key, meeple]) => {
            if (meeple.type?.toLowerCase() !== 'abbot' || meeple.playerId !== playerId) return;

            // key = "x,y,position"
            const [x, y] = key.split(',').map(Number);

            const overlay = document.createElement('div');
            overlay.className = 'abbe-recall-overlay';
            overlay.style.gridColumn = x;
            overlay.style.gridRow    = y;
            overlay.style.position   = 'relative';
            overlay.style.width      = '208px';
            overlay.style.height     = '208px';
            overlay.style.pointerEvents = 'none';
            overlay.style.zIndex     = '101';

            // Trouver la position du meeple dans la grille 5x5
            const position = parseInt(key.split(',')[2]);
            const row = Math.floor((position - 1) / 5);
            const col = (position - 1) % 5;
            const offsetX = 20.8 + (col * 41.6);
            const offsetY = 20.8 + (row * 41.6);

            const btn = document.createElement('div');
            btn.className = 'abbe-recall-btn';
            btn.style.position   = 'absolute';
            btn.style.left       = `${offsetX}px`;
            btn.style.top        = `${offsetY}px`;
            btn.style.width      = '32px';
            btn.style.height     = '32px';
            btn.style.borderRadius = '50%';
            btn.style.border     = '3px solid rgb(200, 0, 175)';
            btn.style.boxShadow  = '0 0 8px 2px rgba(200,0,175,0.7), inset 0 0 4px rgba(0,0,0,0.8)';
            btn.style.cursor     = 'pointer';
            btn.style.pointerEvents = 'auto';
            btn.style.transform  = 'translate(-50%, -50%)';
            btn.style.animation  = 'abbeRecallPulse 1.2s ease-in-out infinite';
            btn.title = 'Rappeler l\'Abbé';

            btn.onclick = (e) => {
                e.stopPropagation();
                this._showAbbeRecallModal(x, y, key, meeple, e.clientX, e.clientY);
            };
            btn.addEventListener('touchend', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this._showAbbeRecallModal(x, y, key, meeple, 
                    e.changedTouches[0].clientX, e.changedTouches[0].clientY);
            }, { passive: false });

            overlay.appendChild(btn);
            this.boardElement.appendChild(overlay);
        });
    }

    /**
     * Afficher la mini-modale de rappel de l'Abbé
     */
    _showAbbeRecallModal(x, y, key, meeple, clientX, clientY) {
        // Fermer toute modale existante
        document.querySelectorAll('.abbe-recall-modal').forEach(m => m.remove());

        const modal = document.createElement('div');
        modal.className = 'abbe-recall-modal';

        // Positionner près du clic
        const left = Math.min(clientX + 10, window.innerWidth  - 160);
        const top  = Math.min(clientY + 10, window.innerHeight - 80);
        modal.style.position = 'fixed';
        modal.style.left     = `${left}px`;
        modal.style.top      = `${top}px`;
        modal.style.zIndex   = '9000';
        modal.style.background = 'rgba(30,20,40,0.95)';
        modal.style.border   = '2px solid rgb(200,0,175)';
        modal.style.borderRadius = '8px';
        modal.style.padding  = '10px 14px';
        modal.style.display  = 'flex';
        modal.style.flexDirection = 'column';
        modal.style.gap      = '8px';
        modal.style.boxShadow = '0 4px 20px rgba(200,0,175,0.4)';

        const confirmBtn = document.createElement('button');
        confirmBtn.textContent = '↩️ Récupérer';
        confirmBtn.style.background = 'rgb(200,0,175)';
        confirmBtn.style.color   = 'white';
        confirmBtn.style.border  = 'none';
        confirmBtn.style.borderRadius = '5px';
        confirmBtn.style.padding = '8px 16px';
        confirmBtn.style.cursor  = 'pointer';
        confirmBtn.style.fontWeight = 'bold';
        confirmBtn.style.fontSize = '14px';
        modal.appendChild(confirmBtn);

        const close = () => modal.remove();

        const confirm = () => {
            close();
            if (this.onAbbeRecall) this.onAbbeRecall(x, y, key, meeple);
        };
        confirmBtn.onclick = confirm;
        confirmBtn.addEventListener('touchend', (e) => { e.preventDefault(); confirm(); }, { passive: false });

        // Fermer si clic ailleurs
        setTimeout(() => {
            document.addEventListener('click', close, { once: true });
        }, 100);

        document.body.appendChild(modal);
    }

    /**
     * Détruire le module et nettoyer
     */
    destroy() {
        console.log('🧹 MeepleCursorsUI: cleanup');
        
        // Supprimer tous les curseurs
        this.hideCursors();
        document.querySelectorAll('.meeple-cursor').forEach(el => el.remove());
    }
}
