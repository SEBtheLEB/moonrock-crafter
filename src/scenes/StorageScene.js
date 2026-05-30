import { Button } from '../ui/Button.js';
import { ResourceCounter } from '../ui/ResourceCounter.js';
import { TabButton } from '../ui/TabButton.js';
import { materialRarities, materials } from '../data/materials.js';

const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic'];

export class StorageScene {
  constructor(game) {
    this.game = game;
    this.activeTab = 'all';
    this.sortMode = 'quantity';
    this.selectedMaterialId = null;
    this.time = 0;
  }

  enter() {
    this.game.ui.setScreen('storage-screen');
    this.mountUi();
  }

  mountUi() {
    this.mountTopBar();
    this.shell = document.createElement('section');
    this.shell.className = 'storage-workshop';
    this.shell.innerHTML = `
      <aside class="storage-sidebar">
        <nav class="storage-tabs"></nav>
        <section class="storage-sort-panel"></section>
      </aside>
      <main class="storage-content"></main>
    `;
    this.game.ui.addSceneElement(this.shell);
    this.tabs = this.shell.querySelector('.storage-tabs');
    this.sortPanel = this.shell.querySelector('.storage-sort-panel');
    this.content = this.shell.querySelector('.storage-content');
    this.renderTabs();
    this.renderSortControls();
    this.renderContent();
  }

  mountTopBar() {
    this.hud = this.game.ui.addHud('<div class="storage-top-bar"></div>');
    this.renderTopBar();
  }

  renderTopBar() {
    const bar = this.hud.querySelector('.storage-top-bar');
    bar.replaceChildren(
      new ResourceCounter('Storage', `${this.game.systems.inventory.getTotalStored()}/${this.game.state.station.storageMax}`, { icon: '#' }).element,
      new ResourceCounter('Credits', this.game.state.credits, { icon: '$' }).element,
      new ResourceCounter('Research', this.game.state.researchPoints, { icon: 'R' }).element,
      new ResourceCounter('Rep', this.game.state.reputation, { icon: '*' }).element,
      new Button('Station', () => this.game.sceneManager.switchTo('station'), { icon: '<', variant: 'metal', className: 'storage-back-button' }).element,
    );
  }

  renderTabs() {
    this.tabs.replaceChildren();
    const tabs = [
      { id: 'all', label: 'All' },
      ...RARITY_ORDER.map((rarity) => ({
        id: rarity,
        label: materialRarities[rarity].name,
      })),
    ];
    tabs.forEach((tab) => {
      const button = new TabButton(tab.label, () => {
        this.activeTab = tab.id;
        this.selectedMaterialId = null;
        this.game.audio.playTabSwitch();
        this.renderTabs();
        this.renderContent();
      }, { active: this.activeTab === tab.id }).element;
      button.style.setProperty('--tab-rarity-color', materialRarities[tab.id]?.color || 'var(--forge-yellow)');
      this.tabs.append(button);
    });
  }

  renderSortControls() {
    this.sortPanel.replaceChildren();
    const heading = document.createElement('header');
    heading.innerHTML = '<h2>Sort Crates</h2><p>Keep the shelves readable while the ore pile grows.</p>';
    const controls = document.createElement('div');
    controls.className = 'storage-sort-buttons';
    [
      { id: 'quantity', label: 'Quantity' },
      { id: 'value', label: 'Value' },
      { id: 'rarity', label: 'Rarity' },
      { id: 'name', label: 'Name' },
    ].forEach((option) => {
      const button = new Button(option.label, () => {
        this.sortMode = option.id;
        this.game.audio.playTabSwitch();
        this.renderSortControls();
        this.renderContent();
      }, {
        icon: option.label[0],
        variant: this.sortMode === option.id ? 'forge' : 'metal',
        className: `storage-sort-button ${this.sortMode === option.id ? 'is-active' : ''}`,
      }).element;
      controls.append(button);
    });
    const sellExtras = new Button('Sell Extras', () => {
      this.game.ui.showToast('Bulk selling is coming soon.', 'default');
      this.game.audio.playError();
    }, { icon: '$', variant: 'metal', className: 'sell-extras-button' }).element;
    this.sortPanel.append(heading, controls, sellExtras);
  }

  renderContent() {
    this.content.replaceChildren();
    const visibleRarities = this.activeTab === 'all' ? RARITY_ORDER : [this.activeTab];
    this.content.classList.toggle('is-all-tab', this.activeTab === 'all');
    if (this.selectedMaterialId) {
      const selected = materials.find((material) => material.id === this.selectedMaterialId);
      if (!selected || (this.activeTab !== 'all' && selected.rarity !== this.activeTab)) this.selectedMaterialId = null;
    }
    this.content.classList.toggle('has-detail', Boolean(this.selectedMaterialId));
    visibleRarities.forEach((rarity) => {
      this.content.append(this.createRarityShelf(rarity));
    });
    if (this.game.systems.inventory.getTotalStored() === 0) {
      const empty = document.createElement('aside');
      empty.className = 'storage-empty-note';
      empty.innerHTML = '<strong>No ore stored yet</strong><span>Launch a mining run, dock safely, and these shelves will fill up.</span>';
      this.content.prepend(empty);
    }
    if (this.selectedMaterialId) {
      const material = materials.find((item) => item.id === this.selectedMaterialId);
      if (material) this.content.append(this.createMaterialDetail(material));
    }
  }

  createRarityShelf(rarity) {
    const rarityInfo = materialRarities[rarity];
    const shelf = document.createElement('section');
    shelf.className = `storage-rarity-shelf rarity-${rarity}`;
    shelf.style.setProperty('--rarity-color', rarityInfo.color);
    const rarityMaterials = this.getSortedMaterials(materials.filter((material) => material.rarity === rarity));
    const ownedCount = rarityMaterials.reduce((total, material) => total + this.game.systems.inventory.getStoredAmount(material.id), 0);
    const shelfValue = rarityMaterials.reduce((total, material) => {
      const amount = this.game.systems.inventory.getStoredAmount(material.id);
      return total + this.game.systems.materials.getValue(material.id, amount);
    }, 0);
    shelf.innerHTML = `
      <header>
        <div>
          <h1>${rarityInfo.name}</h1>
          <p>${ownedCount} stored - $${shelfValue} value</p>
        </div>
      </header>
      <div class="storage-card-grid"></div>
    `;
    const grid = shelf.querySelector('.storage-card-grid');
    rarityMaterials.forEach((material) => grid.append(this.createMaterialCard(material)));
    return shelf;
  }

  getSortedMaterials(source) {
    const rarityRank = Object.fromEntries(RARITY_ORDER.map((rarity, index) => [rarity, index]));
    return [...source].sort((a, b) => {
      const amountA = this.game.systems.inventory.getStoredAmount(a.id);
      const amountB = this.game.systems.inventory.getStoredAmount(b.id);
      if (this.sortMode === 'name') return a.name.localeCompare(b.name);
      if (this.sortMode === 'value') {
        const valueA = this.game.systems.materials.getValue(a.id, amountA);
        const valueB = this.game.systems.materials.getValue(b.id, amountB);
        return valueB - valueA || a.name.localeCompare(b.name);
      }
      if (this.sortMode === 'rarity') {
        return rarityRank[b.rarity] - rarityRank[a.rarity] || amountB - amountA || a.name.localeCompare(b.name);
      }
      return amountB - amountA || a.name.localeCompare(b.name);
    });
  }

  createMaterialCard(material) {
    const amount = this.game.systems.inventory.getStoredAmount(material.id);
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `storage-material-card storage-material-tile ${amount > 0 ? 'has-stock' : 'is-empty'} ${this.selectedMaterialId === material.id ? 'is-selected' : ''}`;
    card.style.setProperty('--material-color', material.color);
    card.setAttribute('aria-label', `${material.name}, ${amount} stored`);
    card.title = material.name;
    card.innerHTML = `
      <span class="storage-material-icon">${material.icon}</span>
      <strong class="storage-material-amount">${amount}</strong>
    `;
    card.addEventListener('click', () => {
      this.selectedMaterialId = material.id;
      this.renderContent();
    });
    return card;
  }

  createMaterialDetail(material) {
    const amount = this.game.systems.inventory.getStoredAmount(material.id);
    const rarityInfo = materialRarities[material.rarity];
    const totalValue = this.game.systems.materials.getValue(material.id, amount);
    const totalWeight = amount * material.weight;
    const detail = document.createElement('aside');
    detail.className = 'storage-detail-popover';
    detail.style.setProperty('--material-color', material.color);
    detail.style.setProperty('--rarity-color', rarityInfo?.color || material.color);
    detail.innerHTML = `
      <header>
        <span class="storage-detail-icon">${material.icon}</span>
        <div>
          <p>${rarityInfo?.name || material.rarity}</p>
          <h2>${material.name}</h2>
        </div>
      </header>
      <p class="storage-detail-description">${material.description}</p>
      <dl class="storage-detail-stats">
        <div><dt>Stored</dt><dd>${amount}</dd></div>
        <div><dt>Each Value</dt><dd>$${material.baseValue}</dd></div>
        <div><dt>Total Value</dt><dd>$${totalValue}</dd></div>
        <div><dt>Each Weight</dt><dd>${material.weight.toFixed(1)}</dd></div>
        <div><dt>Total Weight</dt><dd>${totalWeight.toFixed(1)}</dd></div>
      </dl>
      <section class="storage-detail-zones">
        <strong>Found In</strong>
        <span>${material.zoneAvailability.map((zone) => this.formatZone(zone)).join(', ')}</span>
      </section>
      <div class="storage-detail-actions"></div>
    `;
    detail.querySelector('.storage-detail-actions').append(
      new Button('Close', () => {
        this.selectedMaterialId = null;
        this.renderContent();
      }, { icon: 'x', variant: 'metal', className: 'storage-detail-close' }).element,
    );
    return detail;
  }

  formatZone(zoneId) {
    const names = {
      scrapBelt: 'Scrap Belt',
      emberDrift: 'Ember Drift',
      frostRing: 'Frost Ring',
      voidReef: 'Void Reef',
      starGraveyard: 'Star Graveyard',
      tinyScrapIsland: 'Tiny Scrap Island',
      forestRockIsland: 'Forest Rock Island',
      crystalIsland: 'Crystal Island',
      emberIsland: 'Ember Island',
      islands: 'Rock Islands',
      wrecks: 'Wrecks',
      relicSignal: 'Relic Signal',
    };
    return names[zoneId] || zoneId;
  }

  update(delta) {
    this.time += delta;
  }

  render(ctx) {
    const { width, height } = this.game.viewport;
    ctx.clearRect(0, 0, width, height);
    this.drawStorageBackdrop(ctx, width, height);
  }

  drawStorageBackdrop(ctx, width, height) {
    const gradient = ctx.createRadialGradient(width * 0.52, height * 0.58, 20, width * 0.52, height * 0.58, width);
    gradient.addColorStop(0, '#2b2f4d');
    gradient.addColorStop(0.48, '#102943');
    gradient.addColorStop(1, '#050614');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = 'rgba(255, 143, 61, 0.14)';
    ctx.beginPath();
    ctx.arc(width * 0.18, height * 0.9, height * 0.5, 0, Math.PI * 2);
    ctx.fill();

    for (let row = 0; row < 3; row += 1) {
      const y = height * (0.3 + row * 0.2);
      ctx.fillStyle = 'rgba(7, 18, 34, 0.72)';
      ctx.fillRect(width * 0.06, y, width * 0.88, 18);
      ctx.fillStyle = '#8a5630';
      ctx.fillRect(width * 0.08, y - 18, width * 0.84, 20);
      ctx.strokeStyle = '#071524';
      ctx.lineWidth = 4;
      ctx.strokeRect(width * 0.08, y - 18, width * 0.84, 20);
    }

    for (let i = 0; i < 20; i += 1) {
      const x = (i * 97 + this.time * 12) % width;
      const y = (i * 51 + Math.sin(this.time + i) * 6) % height;
      ctx.fillStyle = i % 4 === 0 ? 'rgba(255, 211, 107, 0.72)' : 'rgba(255, 242, 207, 0.5)';
      ctx.beginPath();
      ctx.arc(x, y, 1 + (i % 2), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
