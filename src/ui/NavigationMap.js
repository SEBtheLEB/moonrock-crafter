import { Button } from './Button.js';
import { locationTabs } from '../data/locations.js?v=30';

const SEARCH_OPTIONS = [
  { label: 'Nearest Iron Ore', materialId: 'ironDust', icon: 'Fe' },
  { label: 'Nearest Copper Shards', materialId: 'copperShards', icon: 'Cu' },
  { label: 'Nearest Crystal Asteroid', materialId: 'glassCrystal', icon: 'Gl' },
  { label: 'Nearest Rock Island', materialId: 'rockIsland', icon: 'IS' },
];

export class NavigationMap {
  constructor(game) {
    this.game = game;
    this.activeTab = 'locations';
    this.selectedId = this.game.systems.navigation.getSelectedDestination()?.id
      || this.game.systems.navigation.getLocations({ tab: 'locations' })[0]?.id
      || null;
    this.element = document.createElement('div');
    this.element.className = 'modal-backdrop navigation-map-modal';
    this.render();
  }

  render() {
    this.element.replaceChildren();
    const panel = document.createElement('section');
    panel.className = 'navigation-map-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    this.element.append(panel);
    if (!this.game.systems.navigation.isUnlocked()) {
      this.renderLocked(panel);
      return;
    }
    this.renderUnlocked(panel);
  }

  renderLocked(panel) {
    const cost = this.game.systems.navigation.getUnlockCost();
    panel.innerHTML = `
      <header class="navigation-map-header">
        <div>
          <span class="navigation-kicker">Navigation Room</span>
          <h1>GPS Offline</h1>
          <p>The old scanner is dark. Repair it to track islands, ore clusters, wrecks, and story signals.</p>
        </div>
      </header>
      <div class="navigation-locked-card">
        <div class="navigation-offline-radar" aria-hidden="true"></div>
        <section>
          <h2>Repair Cost</h2>
          <p>${this.formatCost(cost)}</p>
          <span>${this.formatMissing(cost)}</span>
        </section>
      </div>
      <footer class="navigation-map-actions"></footer>
    `;
    const actions = panel.querySelector('.navigation-map-actions');
    const repairButton = new Button('Repair GPS', () => {
      const result = this.game.systems.navigation.unlock();
      if (!result.ok) {
        this.game.audio.playError();
        this.game.ui.showToast('Missing repair parts.', 'danger');
      }
      this.render();
    }, { icon: 'R', variant: 'forge' }).element;
    repairButton.disabled = !this.game.systems.navigation.canUnlock();
    actions.append(
      repairButton,
      new Button('Close', () => this.game.ui.hideModal(), { icon: '<', variant: 'metal' }).element,
    );
  }

  renderUnlocked(panel) {
    const selected = this.getSelectedLocation();
    panel.innerHTML = `
      <header class="navigation-map-header">
        <div>
          <span class="navigation-kicker">Star Map Room</span>
          <h1>GPS / Scanner</h1>
          <p>Scanner Level ${this.game.systems.navigation.getScannerLevel()} - ${this.getSelectedDestinationLabel()}</p>
        </div>
        <button type="button" class="navigation-close-button" aria-label="Close navigation map">X</button>
      </header>
      <div class="navigation-map-layout">
        <nav class="navigation-tabs"></nav>
        <main class="navigation-radar">
          <div class="navigation-search-panel"></div>
          <div class="navigation-location-list"></div>
          <div class="navigation-starfield"></div>
        </main>
        <aside class="navigation-detail-panel"></aside>
      </div>
      <footer class="navigation-map-actions"></footer>
    `;
    panel.querySelector('.navigation-close-button').addEventListener('click', () => this.game.ui.hideModal());
    this.renderTabs(panel.querySelector('.navigation-tabs'));
    this.renderSearch(panel.querySelector('.navigation-search-panel'));
    this.renderLocationList(panel.querySelector('.navigation-location-list'));
    this.renderStarfield(panel.querySelector('.navigation-starfield'));
    this.renderDetails(panel.querySelector('.navigation-detail-panel'), selected);
    this.renderFooter(panel.querySelector('.navigation-map-actions'));
  }

  renderTabs(container) {
    container.replaceChildren();
    locationTabs.forEach((tab) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `navigation-tab ${this.activeTab === tab.id ? 'is-active' : ''}`;
      button.textContent = tab.label;
      button.addEventListener('click', () => {
        this.activeTab = tab.id;
        const first = this.game.systems.navigation.getLocations({ tab: this.activeTab })[0];
        this.selectedId = first?.id || this.selectedId;
        this.game.audio.playTabSwitch();
        this.render();
      });
      container.append(button);
    });
  }

  renderSearch(container) {
    container.replaceChildren();
    if (this.activeTab !== 'resources') {
      container.classList.add('is-hidden');
      return;
    }
    container.classList.remove('is-hidden');
    SEARCH_OPTIONS.forEach((option) => {
      const button = new Button(option.label, () => {
        const origin = this.getShipOrigin();
        if (!this.game.systems.navigation.setNearestResourceDestination(option.materialId, origin)) {
          this.game.audio.playError();
          this.game.ui.showToast('No matching signal found.', 'danger');
        }
        this.selectedId = this.game.systems.navigation.getSelectedDestination()?.id || this.selectedId;
        this.render();
      }, { icon: option.icon, variant: 'metal', className: 'navigation-search-button' }).element;
      container.append(button);
    });
  }

  renderLocationList(container) {
    container.replaceChildren();
    const locations = this.game.systems.navigation.getLocations({ tab: this.activeTab });
    locations.forEach((location) => {
      const discovered = this.game.systems.navigation.isDiscovered(location.id);
      const row = document.createElement('button');
      row.type = 'button';
      row.className = `navigation-location-row ${this.selectedId === location.id ? 'is-active' : ''} ${discovered ? '' : 'is-unknown'}`;
      row.innerHTML = `
        <span>${location.icon}</span>
        <strong>${discovered ? location.name : 'Undiscovered Signal'}</strong>
        <em>${location.type}</em>
      `;
      row.addEventListener('click', () => {
        this.selectedId = location.id;
        this.game.audio.playGpsPing();
        this.render();
      });
      container.append(row);
    });
  }

  renderStarfield(container) {
    container.replaceChildren();
    const locations = this.game.systems.navigation.getLocations({ tab: 'locations', includeLocked: false });
    const maxDistance = 19500;
    locations.forEach((location) => {
      const dot = document.createElement('button');
      const discovered = this.game.systems.navigation.isDiscovered(location.id);
      dot.type = 'button';
      dot.className = `navigation-map-dot ${this.selectedId === location.id ? 'is-active' : ''} type-${location.type} ${discovered ? '' : 'is-unknown'}`;
      dot.style.left = `${50 + (location.worldPosition.x / maxDistance) * 42}%`;
      dot.style.top = `${50 + (location.worldPosition.y / maxDistance) * 42}%`;
      dot.textContent = discovered ? location.icon : '?';
      dot.title = discovered ? location.name : 'Undiscovered Signal';
      dot.addEventListener('click', () => {
        this.selectedId = location.id;
        this.render();
      });
      container.append(dot);
    });
  }

  renderDetails(container, location) {
    container.replaceChildren();
    if (!location) {
      container.innerHTML = '<h2>No Signal</h2><p>No available scanner targets.</p>';
      return;
    }
    const discovered = this.game.systems.navigation.isDiscovered(location.id);
    const selectedDestination = this.game.systems.navigation.getSelectedDestination();
    container.innerHTML = `
      <span class="navigation-detail-icon">${discovered ? location.icon : '?'}</span>
      <h2>${discovered ? location.name : 'Undiscovered Signal'}</h2>
      <p>${discovered ? location.description : 'Fly closer or upgrade the scanner to resolve this signal.'}</p>
      <dl>
        <div><dt>Type</dt><dd>${location.type}</dd></div>
        <div><dt>Distance</dt><dd>${Math.round(Math.hypot(location.worldPosition.x, location.worldPosition.y))}m</dd></div>
        <div><dt>Danger</dt><dd>${location.dangerLevel}/5</dd></div>
        <div><dt>Recommended Fuel</dt><dd>${location.recommendedFuel}</dd></div>
        <div><dt>Known Resources</dt><dd>${discovered ? location.resources.map((id) => this.game.systems.materials.getDisplayName(id)).join(', ') : 'Unknown'}</dd></div>
      </dl>
      <div class="navigation-detail-actions"></div>
    `;
    const actions = container.querySelector('.navigation-detail-actions');
    const setButton = new Button('Set Destination', () => {
      if (!this.game.systems.navigation.setDestination(location.id)) {
        this.game.audio.playError();
        this.game.ui.showToast(discovered ? 'Cannot set destination.' : 'Discover this signal first.', 'danger');
      }
      this.render();
    }, { icon: '>', variant: 'success' }).element;
    setButton.disabled = !discovered || !location.canSetDestination;
    const clearButton = new Button('Clear Destination', () => {
      this.game.systems.navigation.clearDestination();
      this.render();
    }, { icon: 'X', variant: 'metal' }).element;
    clearButton.disabled = selectedDestination?.id !== location.id;
    actions.append(setButton, clearButton);
  }

  renderFooter(container) {
    container.replaceChildren();
    const next = this.game.systems.navigation.getNextUpgrade();
    if (next) {
      const upgradeButton = new Button(`Upgrade GPS: ${next.name}`, () => {
        const result = this.game.systems.navigation.upgradeScanner();
        if (!result.ok) {
          this.game.audio.playError();
          this.game.ui.showToast('Missing upgrade requirements.', 'danger');
        }
        this.render();
      }, { icon: '+', variant: 'forge' }).element;
      upgradeButton.disabled = !this.game.systems.economy.canAfford(next.cost);
      const cost = document.createElement('span');
      cost.className = 'navigation-upgrade-cost';
      cost.textContent = this.formatCost(next.cost);
      container.append(upgradeButton, cost);
    } else {
      const maxed = document.createElement('span');
      maxed.className = 'navigation-upgrade-cost';
      maxed.textContent = 'Scanner fully upgraded.';
      container.append(maxed);
    }
    container.append(new Button('Close', () => this.game.ui.hideModal(), { icon: '<', variant: 'metal' }).element);
  }

  getSelectedLocation() {
    return this.game.systems.navigation.getLocation(this.selectedId)
      || this.game.systems.navigation.getLocations({ tab: this.activeTab })[0]
      || null;
  }

  getSelectedDestinationLabel() {
    const destination = this.game.systems.navigation.getSelectedDestination();
    return destination ? `Destination: ${destination.name}` : 'No destination set';
  }

  getShipOrigin() {
    const scene = this.game.sceneManager.current;
    if (scene?.ship) return { x: scene.ship.x, y: scene.ship.y };
    return { x: 0, y: 0 };
  }

  formatCost(cost = {}) {
    const parts = [];
    if (cost.credits) parts.push(`${cost.credits} credits`);
    if (cost.researchPoints) parts.push(`${cost.researchPoints} research`);
    Object.entries(cost.materials || {}).forEach(([id, amount]) => {
      parts.push(`${amount} ${this.game.systems.materials.getDisplayName(id)}`);
    });
    return parts.join(' + ') || 'Free';
  }

  formatMissing(cost = {}) {
    if (this.game.systems.economy.canAfford(cost)) return 'All parts ready.';
    const missing = [];
    if ((cost.credits || 0) > (this.game.state.credits || 0)) {
      missing.push(`${cost.credits - (this.game.state.credits || 0)} credits`);
    }
    Object.entries(cost.materials || {}).forEach(([id, amount]) => {
      const owned = this.game.systems.inventory.getStoredAmount(id);
      if (owned < amount) missing.push(`${amount - owned} ${this.game.systems.materials.getDisplayName(id)}`);
    });
    return `Missing: ${missing.join(', ')}`;
  }
}
