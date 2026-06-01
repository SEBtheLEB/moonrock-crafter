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
    const godModeButton = new Button('God Mode', () => this.toggleGodMode(), { icon: 'G', variant: 'forge' }).element;
    const invincibleButton = new Button('Invincible', () => this.toggleInvincible(), { icon: 'I', variant: 'metal' }).element;
    const terrainRawButton = new Button('Raw Grid', () => this.toggleTerrainDebug('rawGrid'), { icon: 'R', variant: 'metal' }).element;
    const terrainMeshButton = new Button('Mesh', () => this.toggleTerrainDebug('visualMesh'), { icon: 'M', variant: 'metal' }).element;
    const terrainCollisionButton = new Button('Collider', () => this.toggleTerrainDebug('collision'), { icon: 'C', variant: 'metal' }).element;
    const terrainRoughnessButton = new Button('Rough Edges', () => this.toggleTerrainRoughness(), { icon: '~', variant: 'metal' }).element;
    const terrainRoughnessDebugButton = new Button('Rough Debug', () => this.toggleTerrainDebug('roughnessDebug'), { icon: 'D', variant: 'metal' }).element;
    const terrainLightingButton = new Button('Lighting', () => this.toggleTerrainLighting(), { icon: 'L', variant: 'metal' }).element;
    const terrainLightDebugButton = new Button('Light Debug', () => this.toggleTerrainDebug('lightingDebug'), { icon: '*', variant: 'metal' }).element;
    const terrainDepthDebugButton = new Button('Depth Debug', () => this.toggleTerrainDebug('depthDebug'), { icon: 'Z', variant: 'metal' }).element;
    this.godModeButton = godModeButton;
    this.invincibleButton = invincibleButton;
    this.terrainRawButton = terrainRawButton;
    this.terrainMeshButton = terrainMeshButton;
    this.terrainCollisionButton = terrainCollisionButton;
    this.terrainRoughnessButton = terrainRoughnessButton;
    this.terrainRoughnessDebugButton = terrainRoughnessDebugButton;
    this.terrainLightingButton = terrainLightingButton;
    this.terrainLightDebugButton = terrainLightDebugButton;
    this.terrainDepthDebugButton = terrainDepthDebugButton;
    this.actions.replaceChildren(
      godModeButton,
      new Button('+100 Credits', () => this.addCredits(), { icon: '$', variant: 'forge' }).element,
      new Button('+Materials', () => this.addMaterials(), { icon: '#', variant: 'forge' }).element,
      new Button('+3 Research', () => this.addResearch(), { icon: 'R', variant: 'forge' }).element,
      invincibleButton,
      terrainRawButton,
      terrainMeshButton,
      terrainCollisionButton,
      terrainRoughnessButton,
      terrainRoughnessDebugButton,
      terrainLightingButton,
      terrainLightDebugButton,
      terrainDepthDebugButton,
      new Button('Refill Fuel', () => this.refillShip(), { icon: 'F', variant: 'metal' }).element,
      new Button('Fix Rocket', () => this.fixRocket(), { icon: 'R', variant: 'forge' }).element,
      new Button('Regen Planet', () => this.regenerateCurrentPlanet(), { icon: 'P', variant: 'metal' }).element,
      new Button('Spawn Rare', () => this.spawnRareAsteroid(), { icon: '*', variant: 'metal' }).element,
      new Button('Jump Home', () => this.jumpToStation(), { icon: '<', variant: 'metal' }).element,
      new Button('Unlock Upgrades', () => this.unlockAllUpgrades(), { icon: '+', variant: 'metal' }).element,
      new Button('Reset World', () => this.game.resetSave(), { icon: '!', variant: 'danger' }).element,
    );
    this.updateToggleButtons();
  }

  toggleTerrainDebug(key) {
    this.game.state.debug ||= {};
    this.game.state.debug.terrain ||= {};
    this.game.state.debug.terrain[key] = !this.game.state.debug.terrain[key];
    this.game.saveGame();
    this.updateToggleButtons();
    this.note(`${key} debug ${this.game.state.debug.terrain[key] ? 'on' : 'off'}.`);
  }

  toggleTerrainRoughness() {
    this.game.state.debug ||= {};
    this.game.state.debug.terrain ||= {};
    const next = this.game.state.debug.terrain.roughness === false;
    this.game.state.debug.terrain.roughness = next;
    this.game.saveGame();
    this.updateToggleButtons();
    this.note(`Terrain roughness ${next ? 'on' : 'off'}.`);
  }

  toggleTerrainLighting() {
    this.game.state.debug ||= {};
    this.game.state.debug.terrain ||= {};
    const next = this.game.state.debug.terrain.lighting === false;
    this.game.state.debug.terrain.lighting = next;
    this.game.saveGame();
    this.updateToggleButtons();
    this.note(`Terrain lighting ${next ? 'on' : 'off'}.`);
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
    this.updateToggleButtons();
    this.note(`Invincible ${this.game.state.debug.invincible ? 'on' : 'off'}.`);
  }

  toggleGodMode() {
    this.game.state.debug ||= {};
    this.game.state.debug.godMode = !this.game.state.debug.godMode;
    const scene = this.game.sceneManager.current;
    if (this.game.state.debug.godMode) {
      this.game.state.ship.fuel = this.game.state.ship.maxFuel;
      if (scene?.stats) {
        scene.stats.fuel = scene.stats.maxFuel;
        scene.stats.hull = scene.stats.maxHull;
      }
    }
    scene?.updateHud?.(true);
    this.game.saveGame();
    this.updateToggleButtons();
    this.note(`God mode ${this.game.state.debug.godMode ? 'on: infinite fuel, invincible, stronger A/Space boost.' : 'off'}.`);
  }

  updateToggleButtons() {
    const debug = this.game.state.debug || {};
    this.godModeButton?.classList.toggle('is-active', Boolean(debug.godMode));
    this.invincibleButton?.classList.toggle('is-active', Boolean(debug.invincible));
    this.terrainRawButton?.classList.toggle('is-active', Boolean(debug.terrain?.rawGrid));
    this.terrainMeshButton?.classList.toggle('is-active', Boolean(debug.terrain?.visualMesh));
    this.terrainCollisionButton?.classList.toggle('is-active', Boolean(debug.terrain?.collision));
    this.terrainRoughnessButton?.classList.toggle('is-active', debug.terrain?.roughness !== false);
    this.terrainRoughnessDebugButton?.classList.toggle('is-active', Boolean(debug.terrain?.roughnessDebug));
    this.terrainLightingButton?.classList.toggle('is-active', debug.terrain?.lighting !== false);
    this.terrainLightDebugButton?.classList.toggle('is-active', Boolean(debug.terrain?.lightingDebug));
    this.terrainDepthDebugButton?.classList.toggle('is-active', Boolean(debug.terrain?.depthDebug));
    this.element?.classList.toggle('is-god-mode', Boolean(debug.godMode));
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

  fixRocket() {
    this.game.state.story ||= {};
    this.game.state.story.thrustersRepaired = true;
    this.game.state.navigation ||= {};
    this.game.state.navigation.gpsUnlocked = true;
    this.game.state.navigation.scannerLevel = Math.max(1, this.game.state.navigation.scannerLevel || 0);
    this.game.state.navigation.selectedDestinationId ||= 'base';
    this.game.systems.navigation?.refreshLocations?.();
    this.game.systems.navigation?.discoverLocation?.('base', { notify: false, save: false });
    this.game.systems.upgrades.applyUpgrades({ refuel: true, repair: true });
    const scene = this.game.sceneManager.current;
    if (scene) {
      scene.crashStart = false;
      if (scene.stats) {
        scene.stats.maxFuel = this.game.state.ship.maxFuel;
        scene.stats.maxHull = this.game.state.ship.maxHull;
        scene.stats.fuel = scene.stats.maxFuel;
        scene.stats.hull = scene.stats.maxHull;
      }
      scene.updateHud?.(true);
    }
    this.game.saveGame();
    this.game.audio.playSuccess?.();
    this.note('Rocket repaired. Thrusters and base GPS are online.');
  }

  spawnRareAsteroid() {
    if (!this.game.sceneManager.current?.spawnRareAsteroid) {
      this.note('Rare spawn works in MiningScene.');
      return;
    }
    this.game.sceneManager.current.spawnRareAsteroid();
    this.note('Rare asteroid spawned.');
  }

  regenerateCurrentPlanet() {
    const scene = this.game.sceneManager.current;
    if (!scene?.regeneratePlanet) {
      this.note('Planet regeneration works in MiningScene.');
      return;
    }
    const tag = scene.getCurrentPlanetIdentifier?.();
    if (!tag) {
      this.note('Move near or land on a planet first.');
      return;
    }
    if (scene.regeneratePlanet(tag)) this.refreshStatus(`Regenerated ${tag}.`);
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
    this.updateToggleButtons();
    const stored = Object.values(this.game.state.inventory || {}).reduce((total, amount) => total + amount, 0);
    const knownMaterials = materials.length;
    const godMode = this.game.state.debug?.godMode ? ' | God ON' : '';
    this.status.textContent = message || `Credits ${this.game.state.credits} | RP ${this.game.state.researchPoints} | Storage ${stored} | Materials ${knownMaterials}${godMode}`;
  }
}
