/**
 * TilePreviewUI - Gère l'affichage de la tuile en main et du compteur
 * CONNECTÉ À EVENTBUS
 */
export class TilePreviewUI {
    constructor(eventBus) {
        this.eventBus = eventBus;
        this.previewElement = null;
        this.counterElement = null;

        // ✅ Binder les méthodes UNE FOIS pour que off() retrouve la même référence
        this._onTileDrawn   = this.onTileDrawn.bind(this);
        this._showBackside  = this.showBackside.bind(this);
        this._updateCounter = (data) => this.updateCounter(data.remaining, data.total);

        this.eventBus.on('tile-drawn',   this._onTileDrawn);
        this.eventBus.on('tile-placed',  this._showBackside);
        this.eventBus.on('deck-updated', this._updateCounter);
    }

    init() {
        this.previewElement = document.getElementById('tile-preview');
        this.counterElement = document.getElementById('tile-counter');
    }

    onTileDrawn(data) {
        console.log('🎴 TilePreviewUI: onTileDrawn appelé', data);
        // showTile() est appelé directement depuis home.js après création de tuileEnMain
    }

    showTile(tuileEnMain) {
        if (!this.previewElement) return;
        this.previewElement.innerHTML = `<img id="current-tile-img" src="${tuileEnMain.imagePath}" style="cursor: pointer; transform: rotate(${tuileEnMain.rotation}deg);" title="Cliquez pour tourner">`;
    }

    showBackside() {
        if (!this.previewElement) return;
        this.previewElement.innerHTML = '<img src="./assets/verso.png" style="width: 120px; border: 2px solid #666;">';
    }

    showMessage(msg) {
        if (!this.previewElement) return;
        this.previewElement.innerHTML = `<p style="text-align: center; color: white;">${msg}</p>`;
    }

    updateCounter(remaining, total) {
        if (!this.counterElement) return;
        console.log(`📊 Compteur: ${remaining} / ${total}`);
        this.counterElement.textContent = `Tuiles : ${remaining} / ${total}`;
    }

    destroy() {
        console.log('🧹 TilePreviewUI: cleanup');
        if (this.previewElement) this.previewElement.innerHTML = '';
        if (this.counterElement) this.counterElement.textContent = 'Tuiles : 0 / 0';

        // ✅ Même référence → désabonnement effectif
        this.eventBus.off('tile-drawn',   this._onTileDrawn);
        this.eventBus.off('tile-placed',  this._showBackside);
        this.eventBus.off('deck-updated', this._updateCounter);
    }
}
