import { Button } from './Button.js';
import { materials } from '../data/materials.js';

const STARTER_MATERIALS = {
  stoneOre: 8,
  ironDust: 6,
  copperShards: 5,
  glassCrystal: 1,
};

export class DebugPanel {
  constructor(game) {
    this.game = game;
    this.isOpen = false;
    this.element = null;
    this.status = null;
  }

  mount(parent) {
    this.element = document.createElement('section');
    this.element.className = 'debug-panel is-collapsed';
    this.element.innerHTML = `
      <button type="button" class="debug-toggle-button" aria-label="Toggle debug panel">DEV</button>
      <div class="debug-panel-body">
        <header>
          <h2>Dev Tools</h2>
          <p>F2 or backtick toggles this panel.</p>
        </header>
        <div class="debug-action-grid"></div>
        <p class="debug-status" data-debug-status></p>
      </div>
    `;
    this.element.querySelector('.debug-toggle-button').addEventListener('click', () => this.toggle());
    this.status = this.element.querySelector('[data-debug-status]');
    this.actions = this.element.querySelector('.debug-action-grid');
    this.renderActions();
    parent.append(this.element);
  }

  toggle(forceState = null) {
    this.isOpen = typeof forceState === 'boolean' ? forceState : !this.isOpen;
    this.element?.classList.toggle('is-collapsed', !this.isOpen);
    this.refreshStatus();
  }

  renderActions() {
    this.actions.replaceChildren(
      new Button('+100 Credits', () => this.addCredits(), { icon: '$', variant: 'forge' }).element,
      new Button('+Materials', () => this.addMaterials(), { icon: '#', variant: 'forge' }).element,
      new Button('+3 Research', () => this.addResearch(), { icon: 'R', variant: 'forge' }).element,
      new Button('Invincible', () => this.toggleInvincible(), { icon: 'I', variant: 'metal' }).element,
      new Button('Refill Fuel', () => this.refillShip(), { icon: 'F', variant: 'metal' }).element,
      new Button('Spawn Rare', () => this.spawnRareAsteroid(), { icon: '*', variant: 'metal' }).element,
      new Button('Jump Home', () => this.jumpToStation(), { icon: '<', variant: 'metal' }).element,
      new Button('Unlock Upgrades', () => this.unlockAllUpgrades(), { icon: '+', variant: 'metal' }).element,
      new Button('Clear Save', () => this.game.resetSave(), { icon: '!', variant: 'danger' }).element,
    );
  }

  addCredits() {
    this.game.systems.economy.addCredits(100);
    this.note('Added 100 credits.');
  }

  addMaterials() {
    Object.entries(STARTER_MATERIALS).forEach(([materialId, amount]) => {
      this.game.systems.inventory.add(materialId, amount, { skipSave: true });
    });
    this.game.saveGame();
    this.note('Added starter materials.');
  }

  addResearch() {
    this.game.systems.economy.addResearch(3);
    this.note('Added 3 research.');
  }

  toggleInvincible() {
    this.game.state.debug ||= {};
    this.game.state.debug.invincible = !this.game.state.debug.invincible;
    this.game.saveGame();
    this.note(`Invincible ${this.game.state.debug.invincible ? 'on' : 'off'}.`);
  }

  refillShip() {
    this.game.state.ship.fuel = this.game.state.ship.maxFuel;
    this.game.state.ship.hull = this.game.state.ship.maxHull;
    const scene = this.game.sceneManager.current;
    if (scene?.stats) {
      scene.stats.fuel = scene.stats.maxFuel;
      scene.stats.hull = scene.stats.maxHull;
      scene.updateHud?.(true);
    }
    this.game.saveGame();
    this.note('Fuel and hull refilled.');
  }

  spawnRareAsteroid() {
    if (!this.game.sceneManager.current?.spawnRareAsteroid) {
      this.note('Rare spawn works in MiningScene.');
      return;
    }
    this.game.sceneManager.current.spawnRareAsteroid();
    this.note('Rare asteroid spawned.');
  }

  jumpToStation() {
    if (this.game.sceneManager.current?.jumpToStation) {
      this.game.sceneManager.current.jumpToStation();
      this.note('Ship moved to station.');
      return;
    }
    this.game.sceneManager.switchTo('station');
    this.note('Returned to station.');
  }

  unlockAllUpgrades() {
    this.game.state.upgrades = {};
    this.game.systems.upgrades.upgrades.forEach((upgrade) => {
      this.game.state.upgrades[upgrade.id] = upgrade.maxLevel;
    });
    this.game.state.research = {};
    this.game.systems.research.research.forEach((node) => {
      this.game.state.research[node.id] = true;
      if (node.unlocks?.zone) {
        this.game.state.unlockedZones = {
          ...(this.game.state.unlockedZones || {}),
          [node.unlocks.zone]: true,
        };
      }
    });
    this.game.systems.upgrades.applyUpgrades({ refuel: true, repair: true });
    this.game.saveGame();
    this.note('Unlocked all upgrades and research.');
  }

  note(message) {
    this.game.ui.showToast(message, 'success');
    this.refreshStatus(message);
  }

  refreshStatus(message = '') {
    if (!this.status) return;
    const stored = Object.values(this.game.state.inventory || {}).reduce((total, amount) => total + amount, 0);
    const knownMaterials = materials.length;
    this.status.textContent = message || `Credits ${this.game.state.credits} | RP ${this.game.state.researchPoints} | Storage ${stored} | Materials ${knownMaterials}`;
  }
}
