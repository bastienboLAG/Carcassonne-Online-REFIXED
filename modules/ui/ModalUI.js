/**
 * ModalUI - Gère l'affichage des modals (tuiles restantes, règles, etc.)
 */
export class ModalUI {
    constructor() {
        this.modalContainer = null;
        this.init();
    }

    /**
     * Initialiser le conteneur de modal
     */
    init() {
        // Créer le conteneur si il n'existe pas
        if (!document.getElementById('modal-overlay')) {
            const overlay = document.createElement('div');
            overlay.id = 'modal-overlay';
            overlay.className = 'modal-overlay';
            overlay.style.cssText = `
                display: none;
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.7);
                z-index: 1000;
                justify-content: center;
                align-items: center;
            `;
            
            overlay.onclick = (e) => {
                if (e.target === overlay) {
                    this.hide();
                }
            };
            
            document.body.appendChild(overlay);
            this.modalContainer = overlay;
        } else {
            this.modalContainer = document.getElementById('modal-overlay');
        }
    }

    /**
     * Afficher une modal avec les tuiles restantes
     */
    showRemainingTiles(tiles, totalRemaining) {
        const modal = document.createElement('div');
        modal.className = 'modal-content';
        modal.style.cssText = `
            background: #2a2a2a;
            border-radius: 10px;
            padding: 30px;
            max-width: 800px;
            max-height: 80vh;
            overflow-y: auto;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
        `;
        
        // Titre
        const title = document.createElement('h2');
        title.textContent = `🎴 Tuiles restantes : ${totalRemaining}`;
        title.style.cssText = `
            color: white;
            margin: 0 0 20px 0;
            text-align: center;
        `;
        modal.appendChild(title);
        
        // Grille de tuiles
        const grid = document.createElement('div');
        grid.style.cssText = `
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
            gap: 15px;
            margin-bottom: 20px;
        `;
        
        tiles.forEach(tile => {
            const tileCard = document.createElement('div');
            tileCard.style.cssText = `
                position: relative;
                display: flex;
                flex-direction: column;
                align-items: center;
                padding: 8px;
                background: #3a3a3a;
                border-radius: 8px;
                transition: transform 0.2s;
            `;
            
            tileCard.onmouseenter = () => {
                tileCard.style.transform = 'scale(1.05)';
            };
            
            tileCard.onmouseleave = () => {
                tileCard.style.transform = 'scale(1)';
            };
            
            // Image
            const img = document.createElement('img');
            img.src = tile.imagePath;
            img.style.cssText = `
                width: 100px;
                height: 100px;
                object-fit: contain;
                margin-bottom: 5px;
            `;
            tileCard.appendChild(img);
            
            // Badge quantité (en bas à droite)
            const badge = document.createElement('div');
            badge.textContent = tile.count;
            badge.style.cssText = `
                position: absolute;
                bottom: 8px;
                right: 8px;
                background: linear-gradient(135deg, #d4af37, #f4d03f);
                color: #1a1a1a;
                width: 28px;
                height: 28px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: bold;
                font-size: 14px;
                box-shadow: 0 2px 8px rgba(212, 175, 55, 0.4);
            `;
            tileCard.appendChild(badge);
            
            grid.appendChild(tileCard);
        });
        
        modal.appendChild(grid);
        
        // Bouton fermer
        const closeBtn = document.createElement('button');
        closeBtn.textContent = 'Fermer';
        closeBtn.style.cssText = `
            display: block;
            margin: 0 auto;
            padding: 10px 30px;
            background: #e74c3c;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-size: 16px;
        `;
        closeBtn.onclick = () => this.hide();
        modal.appendChild(closeBtn);
        
        this.show(modal);
    }

    /**
     * Afficher les règles de la partie
     */
    showGameRules(config) {
        const modal = document.createElement('div');
        modal.className = 'modal-content';
        modal.style.cssText = `
            background: #2a2a2a;
            border-radius: 10px;
            padding: 30px;
            max-width: 600px;
            max-height: 80vh;
            overflow-y: auto;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
        `;
        
        // Titre
        const title = document.createElement('h2');
        title.textContent = '📜 Règles de cette partie';
        title.style.cssText = `
            color: white;
            margin: 0 0 25px 0;
            text-align: center;
            border-bottom: 2px solid #444;
            padding-bottom: 15px;
        `;
        modal.appendChild(title);
        
        // Contenu
        const content = document.createElement('div');
        content.style.cssText = `
            color: #e0e0e0;
            line-height: 1.8;
        `;
        
        // Section Départ
        const startLabel = config.startType === 'river' ? 'Rivière 1' : 'Tuile unique';
        const startSection = this._createSection('🏁 Départ', [startLabel]);
        content.appendChild(startSection);
        
        // Section Options
        const optionsList = [];
        if (config.showRemainingTiles) {
            optionsList.push('✓ Lister les tuiles restantes');
        }
        if (config.testDeck) {
            optionsList.push('⚠️ Deck de test (15 tuiles)');
        }
        
        // Option tuile implaçable
        if (config.unplaceableAction === 'reshuffle') {
            optionsList.push('✓ Tuile implaçable : remise dans la pioche');
        } else {
            optionsList.push('✓ Tuile implaçable : détruite');
        }

        // Si aucune option, afficher message
        if (optionsList.length === 0) {
            optionsList.push('Aucune option activée');
        }
        
        const optionsSection = this._createSection('⚙️ Options', optionsList);
        content.appendChild(optionsSection);
        
        // Section Extensions (avec arborescence visuelle - v2)
        const extensionsSection = document.createElement('div');
        extensionsSection.style.cssText = `
            margin-bottom: 20px;
        `;
        
        const extensionsTitle = document.createElement('h3');
        extensionsTitle.textContent = '🎲 Extensions';
        extensionsTitle.style.cssText = `
            color: #f39c12;
            margin: 0 0 10px 0;
            font-size: 18px;
        `;
        extensionsSection.appendChild(extensionsTitle);
        
        // Base avec arborescence
        if (config.extensions?.base) {
            const baseContainer = document.createElement('div');
            baseContainer.style.cssText = `
                font-family: 'Courier New', monospace;
                color: #e0e0e0;
                line-height: 1.6;
            `;
            
            // Ligne Base
            const baseLine = document.createElement('div');
            baseLine.textContent = '└─ ✓ Base (Carcassonne)';
            baseLine.style.cssText = `
                margin-left: 5px;
                font-size: 15px;
            `;
            baseContainer.appendChild(baseLine);
            
            // Options de Base (indentées)
            // Les champs s'affichent toujours avec leur statut
            const fieldLine = document.createElement('div');
            if (config.playFields) {
                fieldLine.textContent = '   └─ ✓ Les champs';
                fieldLine.style.cssText = `
                    margin-left: 5px;
                    font-size: 15px;
                    color: #a8d8a8;
                    padding-left: 20px;
                `;
            } else {
                fieldLine.textContent = '   └─ Les champs (désactivés)';
                fieldLine.style.cssText = `
                    margin-left: 5px;
                    font-size: 15px;
                    color: #888;
                    font-style: italic;
                    padding-left: 20px;
                `;
            }
            baseContainer.appendChild(fieldLine);
            
            extensionsSection.appendChild(baseContainer);
        }
        
        // Extension Abbé
        if (config.extensions?.abbot) {
            const abbotContainer = document.createElement('div');
            abbotContainer.style.cssText = `
                font-family: 'Courier New', monospace;
                color: #e0e0e0;
                line-height: 1.6;
                margin-top: 8px;
            `;

            const abbotLine = document.createElement('div');
            abbotLine.textContent = '└─ ✓ L\'Abbé';
            abbotLine.style.cssText = 'margin-left: 5px; font-size: 15px;';
            abbotContainer.appendChild(abbotLine);

            extensionsSection.appendChild(abbotContainer);
        }

        content.appendChild(extensionsSection);

        // Section Tuiles
        const tilesSection = this._createSection('🧩 Tuiles', (() => {
            const list = [];
            if (config.tileGroups?.base !== false) {
                list.push('Base : 72 tuiles');
            }
            if (config.tileGroups?.abbot) {
                list.push("L'Abbé : +8 tuiles");
            }
            if (config.startType === 'river') {
                list.push('Rivière : +12 tuiles');
            }
            return list;
        })());
        content.appendChild(tilesSection);

        modal.appendChild(content);
        
        // Bouton fermer
        const closeBtn = document.createElement('button');
        closeBtn.textContent = 'Fermer';
        closeBtn.style.cssText = `
            display: block;
            margin: 25px auto 0;
            padding: 12px 40px;
            background: #3498db;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-size: 16px;
            font-weight: bold;
            transition: background 0.2s;
        `;
        closeBtn.onmouseover = () => closeBtn.style.background = '#2980b9';
        closeBtn.onmouseout = () => closeBtn.style.background = '#3498db';
        closeBtn.onclick = () => this.hide();
        modal.appendChild(closeBtn);
        
        this.show(modal);
    }

    /**
     * Créer une section de règles
     */
    _createSection(title, items) {
        const section = document.createElement('div');
        section.style.cssText = `
            margin-bottom: 20px;
        `;
        
        const sectionTitle = document.createElement('h3');
        sectionTitle.textContent = title;
        sectionTitle.style.cssText = `
            color: #f39c12;
            margin: 0 0 10px 0;
            font-size: 18px;
        `;
        section.appendChild(sectionTitle);
        
        const list = document.createElement('ul');
        list.style.cssText = `
            margin: 0;
            padding-left: 20px;
            list-style: none;
        `;
        
        items.forEach(item => {
            const li = document.createElement('li');
            li.textContent = item;
            li.style.cssText = `
                margin-bottom: 8px;
                font-size: 15px;
            `;
            list.appendChild(li);
        });
        
        section.appendChild(list);
        return section;
    }

    /**
     * Afficher la modal
     */
    show(content) {
        this.modalContainer.innerHTML = '';
        this.modalContainer.appendChild(content);
        this.modalContainer.style.display = 'flex';
    }

    /**
     * Masquer la modal
     */
    hide() {
        this.modalContainer.style.display = 'none';
        this.modalContainer.innerHTML = '';
    }
}
