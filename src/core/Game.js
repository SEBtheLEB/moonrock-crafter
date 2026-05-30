import { EventBus } from './EventBus.js';
import { SceneManager } from './SceneManager.js';
import { InputManager } from './InputManager.js';
import { SaveManager } from './SaveManager.js';
import { AudioManager } from './AudioManager.js';
import { UIManager } from '../ui/UIManager.js';
import { DebugPanel } from '../ui/DebugPanel.js';
import { InventorySystem } from '../systems/InventorySystem.js';
import { MaterialSystem } from '../systems/MaterialSystem.js';
import { CustomerSystem } from '../systems/CustomerSystem.js';
import { DialogueSystem } from '../systems/DialogueSystem.js';
import { CraftingSystem } from '../systems/CraftingSystem.js';
import { UpgradeSystem } from '../systems/UpgradeSystem.js';
import { EconomySystem } from '../systems/EconomySystem.js';
import { ResearchSystem } from '../systems/ResearchSystem.js';
import { TutorialSystem } from '../systems/TutorialSystem.js';
import { ObjectiveSystem } from '../systems/ObjectiveSystem.js?v=20';
import { AchievementSystem } from '../systems/AchievementSystem.js';
import { NavigationSystem } from '../systems/NavigationSystem.js';
import { IslandSystem } from '../systems/IslandSystem.js';
import { BootScene } from '../scenes/BootScene.js';
import { StationScene } from '../scenes/StationScene.js?v=20';
import { MiningScene } from '../scenes/MiningScene.js?v=20';
import { ShopScene } from '../scenes/ShopScene.js';
import { CraftingScene } from '../scenes/CraftingScene.js';
import { UpgradeScene } from '../scenes/UpgradeScene.js';
import { StorageScene } from '../scenes/StorageScene.js';
import { IslandScene } from '../scenes/IslandScene.js';
import { gameBalance } from '../data/gameBalance.js?v=20';

export class Game {
  constructor({ canvas, uiRoot }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.uiRoot = uiRoot;
    this.events = new EventBus();
    this.save = new SaveManager('moonrock-crafter-save-v2', {
      version: 2,
      legacyKeys: ['starforge-station-save-v1'],
    });
    this.audio = new AudioManager();
    this.input = new InputManager(canvas, uiRoot);
    this.ui = new UIManager(uiRoot, this.events, this.audio);
    this.debugPanel = new DebugPanel(this);
    this.sceneManager = new SceneManager(this);
    this.lastTime = 0;
    this.running = false;
    this.paused = false;

    this.state = this.createInitialState();
    this.systems = this.createSystems();

    this.resize = this.resize.bind(this);
    this.loop = this.loop.bind(this);

    this.canvas.addEventListener('pointerdown', () => this.audio.unlock());
    window.addEventListener('keydown', () => this.audio.unlock(), { once: true });
  }

  createInitialState() {
    return {
      credits: gameBalance.startingCredits,
      day: 1,
      shift: 'Dawn',
      researchPoints: gameBalance.startingResearchPoints,
      reputation: gameBalance.startingReputation,
      ship: { ...gameBalance.shipBaseStats },
      station: { level: 1, forgeHeat: 0, storageUsed: 0, ...gameBalance.stationBaseStats },
      shop: { ...gameBalance.shopBaseStats },
      crafting: { ...gameBalance.craftingBaseStats },
      mining: {
        collectionMagnet: gameBalance.shipBaseStats.collectionMagnet,
        rareScanner: gameBalance.shipBaseStats.rareScanner,
        precisionCutter: gameBalance.shipBaseStats.precisionCutter,
      },
      inventory: { ...gameBalance.startingInventory },
      runCargo: {},
      upgrades: {},
      research: {},
      unlockedZones: { scrapBelt: true },
      knownRecipes: {
        basicPickaxe: true,
        miningChisel: true,
        copperWrench: true,
        repairHammer: true,
      },
      completedCustomerOrders: [],
      settings: {
        audioMuted: this.audio ? !this.audio.enabled : false,
      },
      stats: {
        totalAsteroidsMined: 0,
        totalCreditsEarned: 0,
        totalItemsCrafted: 0,
        farthestDistanceReached: 0,
      },
      debug: {
        invincible: false,
      },
      metCustomers: {},
      customerTrust: {},
      tutorial: {},
      progression: {},
      achievements: {},
      navigation: {
        gpsUnlocked: false,
        scannerLevel: 0,
        discoveredLocations: {},
        selectedDestinationId: null,
        scannerUpgrades: {},
      },
      islands: {
        visited: {},
      },
    };
  }

  mergeState(defaultState, savedState) {
    if (!savedState) return defaultState;
    return {
      ...defaultState,
      ...savedState,
      ship: { ...defaultState.ship, ...savedState.ship },
      station: { ...defaultState.station, ...savedState.station },
      shop: { ...defaultState.shop, ...savedState.shop },
      crafting: { ...defaultState.crafting, ...savedState.crafting },
      mining: { ...defaultState.mining, ...savedState.mining },
      inventory: this.migrateInventory({ ...defaultState.inventory, ...savedState.inventory }),
      runCargo: this.migrateInventory({ ...defaultState.runCargo, ...savedState.runCargo }),
      upgrades: { ...defaultState.upgrades, ...savedState.upgrades },
      research: { ...defaultState.research, ...savedState.research },
      unlockedZones: { ...defaultState.unlockedZones, ...savedState.unlockedZones },
      knownRecipes: { ...defaultState.knownRecipes, ...savedState.knownRecipes },
      completedCustomerOrders: Array.isArray(savedState.completedCustomerOrders)
        ? savedState.completedCustomerOrders
        : defaultState.completedCustomerOrders,
      settings: { ...defaultState.settings, ...savedState.settings },
      stats: { ...defaultState.stats, ...savedState.stats },
      debug: { ...defaultState.debug, ...savedState.debug },
      metCustomers: { ...defaultState.metCustomers, ...savedState.metCustomers },
      customerTrust: { ...defaultState.customerTrust, ...savedState.customerTrust },
      tutorial: { ...defaultState.tutorial, ...savedState.tutorial },
      progression: {
        ...defaultState.progression,
        ...savedState.progression,
        stats: {
          ...(defaultState.progression?.stats || {}),
          ...(savedState.progression?.stats || {}),
          materialsCollected: {
            ...(defaultState.progression?.stats?.materialsCollected || {}),
            ...(savedState.progression?.stats?.materialsCollected || {}),
          },
          itemsCrafted: {
            ...(defaultState.progression?.stats?.itemsCrafted || {}),
            ...(savedState.progression?.stats?.itemsCrafted || {}),
          },
          researchUnlocked: {
            ...(defaultState.progression?.stats?.researchUnlocked || {}),
            ...(savedState.progression?.stats?.researchUnlocked || {}),
          },
        },
      },
      achievements: { ...defaultState.achievements, ...savedState.achievements },
      navigation: {
        ...defaultState.navigation,
        ...savedState.navigation,
        discoveredLocations: {
          ...(defaultState.navigation?.discoveredLocations || {}),
          ...(savedState.navigation?.discoveredLocations || {}),
        },
        scannerUpgrades: {
          ...(defaultState.navigation?.scannerUpgrades || {}),
          ...(savedState.navigation?.scannerUpgrades || {}),
        },
      },
      islands: {
        ...defaultState.islands,
        ...savedState.islands,
        visited: {
          ...(defaultState.islands?.visited || {}),
          ...(savedState.islands?.visited || {}),
        },
      },
    };
  }

  migrateInventory(inventory) {
    const migrations = {
      stoneDust: 'stoneOre',
      copperDust: 'copperShards',
      crystalShard: 'glassCrystal',
      ironOre: 'ironDust',
      nickelOre: 'denseNickel',
      starGlass: 'glassCrystal',
    };
    Object.entries(migrations).forEach(([oldId, newId]) => {
      if (!inventory[oldId]) return;
      inventory[newId] = (inventory[newId] || 0) + inventory[oldId];
      delete inventory[oldId];
    });
    return inventory;
  }

  createSystems() {
    return {
      inventory: new InventorySystem(this),
      materials: new MaterialSystem(this),
      customers: new CustomerSystem(this),
      dialogue: new DialogueSystem(this),
      crafting: new CraftingSystem(this),
      upgrades: new UpgradeSystem(this),
      economy: new EconomySystem(this),
      research: new ResearchSystem(this),
      tutorial: new TutorialSystem(this),
      objectives: new ObjectiveSystem(this),
      achievements: new AchievementSystem(this),
      navigation: new NavigationSystem(this),
      islands: new IslandSystem(this),
    };
  }

  start() {
    const saved = this.save.load();
    if (saved) {
      this.state = this.mergeState(this.createInitialState(), saved);
    }
    this.audio.setMuted(Boolean(this.state.settings?.audioMuted));
    this.systems.upgrades.applyUpgrades();

    this.registerScenes();
    this.ui.setupGlobalControls(this);
    this.debugPanel.mount(this.ui.globalLayer);
    this.resize();
    window.addEventListener('resize', this.resize);
    window.addEventListener('orientationchange', this.resize);
    this.preventBrowserGestures();

    this.running = true;
    this.sceneManager.switchTo('boot');
    requestAnimationFrame(this.loop);
  }

  registerScenes() {
    this.sceneManager.register('boot', BootScene);
    this.sceneManager.register('station', StationScene);
    this.sceneManager.register('mining', MiningScene);
    this.sceneManager.register('shop', ShopScene);
    this.sceneManager.register('crafting', CraftingScene);
    this.sceneManager.register('upgrades', UpgradeScene);
    this.sceneManager.register('storage', StorageScene);
    this.sceneManager.register('island', IslandScene);
  }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.floor(rect.width * dpr);
    this.canvas.height = Math.floor(rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.viewport = { width: rect.width, height: rect.height, dpr };
    this.sceneManager.current?.resize?.(this.viewport);
  }

  preventBrowserGestures() {
    document.addEventListener('contextmenu', (event) => event.preventDefault());
    document.addEventListener(
      'touchmove',
      (event) => {
        if (event.target.closest('#game-shell')) event.preventDefault();
      },
      { passive: false },
    );
  }

  resetSave() {
    this.save.reset();
    this.state = this.createInitialState();
    this.systems = this.createSystems();
    this.systems.upgrades.applyUpgrades({ refuel: true, repair: true });
    this.saveGame();
    this.paused = false;
    this.ui.hidePauseMenu();
    this.audio.playReset();
    this.sceneManager.switchTo('station');
  }

  togglePause(forceState) {
    this.paused = typeof forceState === 'boolean' ? forceState : !this.paused;
    if (this.paused) this.ui.showPauseMenu(this);
    else this.ui.hidePauseMenu();
  }

  returnToStation() {
    this.paused = false;
    this.ui.hidePauseMenu();
    this.sceneManager.switchTo('station');
  }

  screenShake(amount = 0.35) {
    if (this.sceneManager.current?.addScreenShake) {
      this.sceneManager.current.addScreenShake(amount);
      return;
    }
    const shell = this.canvas.parentElement;
    shell?.style.setProperty('--feedback-shake', `${Math.max(2, amount * 18)}px`);
    shell?.classList.remove('screen-shake');
    requestAnimationFrame(() => shell?.classList.add('screen-shake'));
    window.setTimeout(() => shell?.classList.remove('screen-shake'), 260);
  }

  showFloatingText(text, x, y, options = {}) {
    if (this.sceneManager.current?.addFloatingText) {
      this.sceneManager.current.addFloatingText(x, y, text, options);
      return;
    }
    this.ui.showToast(text, options.tone || 'default');
  }

  flashCraftingSuccess() {
    this.uiRoot.classList.remove('craft-success-flash');
    requestAnimationFrame(() => this.uiRoot.classList.add('craft-success-flash'));
    window.setTimeout(() => this.uiRoot.classList.remove('craft-success-flash'), 520);
  }

  depositMiningCargo({ cargo = {}, summary = null, recordDocked = false } = {}) {
    const cargoValue = this.systems.materials.getCargoValue(cargo);
    if (summary) {
      summary.cargoValue = cargoValue;
      summary.cargoWeight = this.systems.materials.getCargoWeight(cargo);
    }
    Object.entries(cargo).forEach(([itemId, amount]) => {
      if (amount <= 0) return;
      if (itemId === 'researchFragment') {
        this.systems.economy.addResearch(amount, { save: false, recordObjective: false });
        this.systems.objectives.record('researchEarned', { amount });
        return;
      }
      this.systems.inventory.add(itemId, amount, { skipSave: true });
    });
    this.state.ship.cargo = 0;
    this.systems.inventory.clearRunCargo();
    this.state.station.storageUsed = this.systems.inventory.getTotalStored();
    this.state.stats.farthestDistanceReached = Math.max(
      this.state.stats.farthestDistanceReached || 0,
      summary?.distance || 0,
    );
    if (recordDocked) this.systems.objectives.record('docked', { summary });
    this.saveGame();
    return {
      cargoValue,
      cargoWeight: summary?.cargoWeight || this.systems.materials.getCargoWeight(cargo),
    };
  }

  dockFromMining({ cargo = {}, summary = null } = {}) {
    this.depositMiningCargo({ cargo, summary, recordDocked: true });
    this.state.ship.fuel = this.state.ship.maxFuel || 100;
    this.state.ship.hull = this.state.ship.maxHull || 100;
    this.systems.tutorial.onDocked(summary);
    this.saveGame();
    this.audio.playDockSuccess();
    this.audio.playShipDock();
    this.sceneManager.switchTo('station', { miningSummary: summary });
  }

  saveGame() {
    this.state.settings = {
      ...(this.state.settings || {}),
      audioMuted: !this.audio.enabled,
    };
    this.save.save(this.state);
  }

  manualSave() {
    this.state.settings = {
      ...(this.state.settings || {}),
      audioMuted: !this.audio.enabled,
    };
    this.save.manualSave(this.state);
    this.ui.showToast('Game saved', 'success');
  }

  loop(time) {
    if (!this.running) return;
    const delta = Math.min((time - this.lastTime) / 1000 || 0, 0.05);
    this.lastTime = time;
    this.input.update();
    this.systems.dialogue.update(delta);
    this.ui.updateDialogue(this.systems.dialogue.active);
    if (this.input.actions.justPressed.pause) {
      if (this.sceneManager.currentName === 'station') this.togglePause();
      else this.returnToStation();
    }
    if (this.input.actions.justPressed.debugToggle) this.debugPanel.toggle();
    if (!this.paused) this.sceneManager.update(delta);
    this.sceneManager.render(this.ctx);
    requestAnimationFrame(this.loop);
  }
}
