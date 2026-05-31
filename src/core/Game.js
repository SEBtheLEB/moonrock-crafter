import { EventBus } from './EventBus.js';
import { SceneManager } from './SceneManager.js';
import { InputManager } from './InputManager.js?v=93';
import { SaveManager } from './SaveManager.js';
import { AudioManager } from './AudioManager.js?v=93';
import { UIManager } from '../ui/UIManager.js';
import { DebugPanel } from '../ui/DebugPanel.js?v=93';
import { InventorySystem } from '../systems/InventorySystem.js';
import { MaterialSystem } from '../systems/MaterialSystem.js';
import { DialogueSystem } from '../systems/DialogueSystem.js?v=93';
import { UpgradeSystem } from '../systems/UpgradeSystem.js?v=93';
import { EconomySystem } from '../systems/EconomySystem.js?v=93';
import { ResearchSystem } from '../systems/ResearchSystem.js?v=93';
import { TutorialSystem } from '../systems/TutorialSystem.js?v=93';
import { ObjectiveSystem } from '../systems/ObjectiveSystem.js?v=93';
import { AchievementSystem } from '../systems/AchievementSystem.js?v=93';
import { NavigationSystem } from '../systems/NavigationSystem.js?v=93';
import { IslandSystem } from '../systems/IslandSystem.js?v=93';
import { BootScene } from '../scenes/BootScene.js';
import { StationScene } from '../scenes/StationScene.js?v=93';
import { MiningScene } from '../scenes/MiningScene.js?v=93';
import { UpgradeScene } from '../scenes/UpgradeScene.js?v=93';
import { StorageScene } from '../scenes/StorageScene.js?v=93';
import { IslandScene } from '../scenes/IslandScene.js?v=93';
import { gameBalance } from '../data/gameBalance.js?v=93';

export class Game {
  constructor({ canvas, uiRoot }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.uiRoot = uiRoot;
    this.events = new EventBus();
    this.save = new SaveManager('moonrock-crafter-save-v3', {
      version: 3,
      legacyKeys: [],
    });
    this.audio = new AudioManager();
    this.input = new InputManager(canvas, uiRoot);
    this.ui = new UIManager(uiRoot, this.events, this.audio);
    this.debugPanel = new DebugPanel(this);
    this.sceneManager = new SceneManager(this);
    this.lastTime = 0;
    this.running = false;
    this.paused = false;
    this.controllerUiFocusIndex = 0;
    this.controllerUiFocusScope = '';

    this.state = this.createInitialState();
    this.systems = this.createSystems();

    this.resize = this.resize.bind(this);
    this.loop = this.loop.bind(this);
    this.updatePlatformProfile = this.updatePlatformProfile.bind(this);

    this.canvas.addEventListener('pointerdown', () => this.audio.unlock());
    window.addEventListener('pointerdown', this.updatePlatformProfile, { passive: true, capture: true });
    window.addEventListener('keydown', () => this.audio.unlock(), { once: true });
  }

  createInitialState() {
    return {
      credits: gameBalance.startingCredits,
      day: 1,
      shift: 'Dawn',
      researchPoints: gameBalance.startingResearchPoints,
      ship: { ...gameBalance.shipBaseStats },
      station: { level: 1, storageUsed: 0, ...gameBalance.stationBaseStats },
      mining: {
        collectionMagnet: gameBalance.shipBaseStats.collectionMagnet,
        rareScanner: gameBalance.shipBaseStats.rareScanner,
        precisionCutter: gameBalance.shipBaseStats.precisionCutter,
      },
      inventory: { ...gameBalance.startingInventory },
      runCargo: {},
      upgrades: {},
      research: {},
      unlockedZones: { originBlue: true },
      story: {
        crashIntroSeen: false,
        starterPlanetId: 'crashPlanet',
        thrustersRepaired: false,
        furnaceBuilt: false,
        furnacePlaced: false,
        furnace: null,
        furnaceInventory: [],
        furnaces: [],
        craftingStationPlaced: false,
        craftingStation: null,
        stationRouteUnlocked: false,
      },
      settings: {
        audioMuted: this.audio ? !this.audio.enabled : false,
      },
      stats: {
        totalAsteroidsMined: 0,
        totalCreditsEarned: 0,
        farthestDistanceReached: 0,
      },
      debug: {
        invincible: false,
        godMode: false,
      },
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
        terrain: {},
        layout: null,
        layoutVersion: 0,
        seed: null,
      },
    };
  }

  mergeState(defaultState, savedState) {
    if (!savedState) return defaultState;
    const merged = {
      ...defaultState,
      ...savedState,
      ship: { ...defaultState.ship, ...savedState.ship },
      station: { ...defaultState.station, ...savedState.station },
      mining: { ...defaultState.mining, ...savedState.mining },
      inventory: this.migrateInventory({ ...defaultState.inventory, ...savedState.inventory }),
      runCargo: this.migrateInventory({ ...defaultState.runCargo, ...savedState.runCargo }),
      upgrades: { ...defaultState.upgrades, ...savedState.upgrades },
      research: { ...defaultState.research, ...savedState.research },
      unlockedZones: { ...defaultState.unlockedZones, ...savedState.unlockedZones },
      settings: { ...defaultState.settings, ...savedState.settings },
      stats: { ...defaultState.stats, ...savedState.stats },
      debug: { ...defaultState.debug, ...savedState.debug },
      story: {
        ...defaultState.story,
        ...savedState.story,
        furnace: savedState.story?.furnace
          ? { ...defaultState.story.furnace, ...savedState.story.furnace }
          : defaultState.story.furnace,
        furnaceInventory: Array.isArray(savedState.story?.furnaceInventory)
          ? savedState.story.furnaceInventory
          : defaultState.story.furnaceInventory,
        furnaces: Array.isArray(savedState.story?.furnaces)
          ? savedState.story.furnaces
          : defaultState.story.furnaces,
        craftingStation: savedState.story?.craftingStation
          ? { ...defaultState.story.craftingStation, ...savedState.story.craftingStation }
          : defaultState.story.craftingStation,
      },
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
        terrain: {
          ...(defaultState.islands?.terrain || {}),
          ...(savedState.islands?.terrain || {}),
        },
        layout: Array.isArray(savedState.islands?.layout)
          ? savedState.islands.layout
          : defaultState.islands?.layout,
        layoutVersion: savedState.islands?.layoutVersion ?? defaultState.islands?.layoutVersion,
        seed: savedState.islands?.seed ?? defaultState.islands?.seed,
      },
    };
    if (merged.story?.furnaceBuilt) delete merged.inventory.fireCore;
    if (merged.story?.craftingStationPlaced) delete merged.inventory.craftingStationKit;
    return merged;
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
      dialogue: new DialogueSystem(this),
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
      this.systems = this.createSystems();
    }
    this.audio.setMuted(Boolean(this.state.settings?.audioMuted));
    this.systems.upgrades.applyUpgrades();

    this.registerScenes();
    this.ui.setupGlobalControls(this);
    this.debugPanel.mount(this.ui.globalLayer);
    this.updatePlatformProfile();
    this.resize();
    window.addEventListener('resize', this.resize);
    window.addEventListener('orientationchange', this.resize);
    this.preventBrowserGestures();
    this.requestFullscreen();

    this.running = true;
    this.sceneManager.switchTo('boot');
    requestAnimationFrame(this.loop);
  }

  registerScenes() {
    this.sceneManager.register('boot', BootScene);
    this.sceneManager.register('station', StationScene);
    this.sceneManager.register('mining', MiningScene);
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
    this.updatePlatformProfile();
    this.sceneManager.current?.resize?.(this.viewport);
  }

  updatePlatformProfile(event = null) {
    const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    const landscape = window.innerWidth >= window.innerHeight;
    const mobileLandscape = coarsePointer && landscape && window.innerWidth <= 1180;
    const inputMode = event?.pointerType === 'touch' || mobileLandscape ? 'touch' : 'keyboard-mouse';

    document.documentElement.dataset.platformTarget = 'pc';
    document.documentElement.dataset.mobilePort = 'ready';
    document.documentElement.dataset.inputMode = inputMode;
    document.documentElement.dataset.layoutProfile = mobileLandscape ? 'mobile-landscape' : 'pc';
  }

  preventBrowserGestures() {
    document.addEventListener('contextmenu', (event) => event.preventDefault());
    document.addEventListener('selectstart', (event) => {
      if (event.target.closest?.('#game-shell')) event.preventDefault();
    });
    document.addEventListener('dragstart', (event) => {
      if (event.target.closest?.('#game-shell')) event.preventDefault();
    });
    window.addEventListener('pointerdown', () => this.requestFullscreen(), { once: true, capture: true });
    window.addEventListener('keydown', () => this.requestFullscreen(), { once: true, capture: true });
    document.addEventListener(
      'touchmove',
      (event) => {
        if (event.target.closest('#game-shell')) event.preventDefault();
      },
      { passive: false },
    );
  }

  requestFullscreen() {
    if (document.fullscreenElement) return;
    const target = this.canvas?.parentElement || document.documentElement;
    if (!target?.requestFullscreen) return;
    target.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
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
    this.sceneManager.switchTo('boot');
  }

  togglePause(forceState) {
    this.paused = typeof forceState === 'boolean' ? forceState : !this.paused;
    if (this.paused) this.ui.showPauseMenu(this);
    else this.ui.hidePauseMenu();
  }

  returnToStation() {
    this.paused = false;
    this.ui.hidePauseMenu();
    if (!this.state.story?.thrustersRepaired && this.sceneManager.currentName !== 'station') {
      this.ui.showToast('Repair the ship before returning to the station.', 'danger', 1800);
      return;
    }
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

  depositMiningCargo({ cargo = {}, summary = null, recordDocked = false } = {}) {
    const cargoValue = this.systems.materials.getCargoValue(cargo);
    const creditsEarned = Math.round(cargoValue * (gameBalance.mining.depositCreditMultiplier ?? 0.55));
    if (summary) {
      summary.cargoValue = cargoValue;
      summary.creditsEarned = creditsEarned;
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
    if (creditsEarned > 0) this.systems.economy.addCredits(creditsEarned, { save: false });
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
      creditsEarned,
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
      if (this.sceneManager.currentName === 'station' || !this.state.story?.thrustersRepaired) this.togglePause();
      else this.returnToStation();
    }
    if (this.input.actions.justPressed.debugToggle) this.debugPanel.toggle();
    this.handleControllerUiNavigation();
    if (!this.paused) this.sceneManager.update(delta);
    this.sceneManager.render(this.ctx);
    this.input.endFrame();
    requestAnimationFrame(this.loop);
  }

  handleControllerUiNavigation() {
    if (!this.input.isControllerActive?.()) return;
    const scope = this.getControllerUiScope();
    if (!scope) {
      this.controllerUiFocusScope = '';
      return;
    }
    const controls = this.getControllerUiControls(scope);
    if (!controls.length) return;
    if (scope !== this.controllerUiFocusScope) {
      this.controllerUiFocusScope = scope;
      this.controllerUiFocusIndex = 0;
      controls[0].focus({ preventScroll: true });
    }

    const actions = this.input.actions;
    if (actions.justPressed.cancel) {
      if (this.paused) this.togglePause(false);
      else if (scope === 'upgrades' || scope === 'storage') this.sceneManager.switchTo('station');
      return;
    }

    const direction = Number(actions.justPressed.right || actions.justPressed.down)
      - Number(actions.justPressed.left || actions.justPressed.up);
    if (direction !== 0) {
      this.controllerUiFocusIndex = (this.controllerUiFocusIndex + direction + controls.length) % controls.length;
      controls[this.controllerUiFocusIndex].focus({ preventScroll: true });
      this.audio.playButtonHover();
    }

    const activeIndex = controls.indexOf(document.activeElement);
    if (activeIndex >= 0) this.controllerUiFocusIndex = activeIndex;
    if ((actions.justPressed.confirm || actions.justPressed.interact) && controls[this.controllerUiFocusIndex]) {
      controls[this.controllerUiFocusIndex].click();
    }
  }

  getControllerUiScope() {
    if (this.paused || this.ui.hasBlockingOverlay()) return 'overlay';
    if (this.sceneManager.currentName === 'upgrades') return 'upgrades';
    if (this.sceneManager.currentName === 'storage') return 'storage';
    return '';
  }

  getControllerUiControls(scope) {
    const roots = scope === 'overlay' ? [this.ui.modalLayer, this.ui.dialogueOverlay] : [this.ui.root];
    return roots.flatMap((root) => [...(root?.querySelectorAll('button:not([disabled])') || [])])
      .filter((element) => !element.classList.contains('pause-button'))
      .filter((element) => !element.closest('.debug-panel'))
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== 'hidden';
      });
  }
}
