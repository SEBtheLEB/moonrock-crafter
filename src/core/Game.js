import { EventBus } from './EventBus.js';
import { SceneManager } from './SceneManager.js';
import { InputManager } from './InputManager.js?v=115';
import { SaveManager } from './SaveManager.js';
import { AudioManager } from './AudioManager.js?v=115';
import { UIManager } from '../ui/UIManager.js';
import { DebugPanel } from '../ui/DebugPanel.js?v=115';
import { InventorySystem } from '../systems/InventorySystem.js';
import { MaterialSystem } from '../systems/MaterialSystem.js';
import { DialogueSystem } from '../systems/DialogueSystem.js?v=115';
import { UpgradeSystem } from '../systems/UpgradeSystem.js?v=115';
import { EconomySystem } from '../systems/EconomySystem.js?v=115';
import { ResearchSystem } from '../systems/ResearchSystem.js?v=115';
import { TutorialSystem } from '../systems/TutorialSystem.js?v=115';
import { ObjectiveSystem } from '../systems/ObjectiveSystem.js?v=115';
import { AchievementSystem } from '../systems/AchievementSystem.js?v=115';
import { NavigationSystem } from '../systems/NavigationSystem.js?v=115';
import { IslandSystem } from '../systems/IslandSystem.js?v=115';
import { BuildingSystem } from '../systems/BuildingSystem.js?v=115';
import { BootScene } from '../scenes/BootScene.js';
import { StationScene } from '../scenes/StationScene.js?v=115';
import { MiningScene } from '../scenes/MiningScene.js?v=115';
import { UpgradeScene } from '../scenes/UpgradeScene.js?v=115';
import { StorageScene } from '../scenes/StorageScene.js?v=115';
import { IslandScene } from '../scenes/IslandScene.js?v=115';
import { gameBalance } from '../data/gameBalance.js?v=115';
import { DEFAULT_HOTBAR_SLOT_IDS } from '../data/hotbar.js?v=115';

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
    this.controllerUiNavRepeatTimer = 0;
    this.controllerUiNavLastKey = '';
    this.controllerUiWaitForRelease = false;
    this.isResettingWorld = false;

    this.state = this.createInitialState();
    this.systems = this.createSystems();

    this.resize = this.resize.bind(this);
    this.loop = this.loop.bind(this);
    this.updatePlatformProfile = this.updatePlatformProfile.bind(this);

    this.canvas.addEventListener('pointerdown', () => this.audio.unlock());
    window.addEventListener('pointerdown', this.updatePlatformProfile, { passive: true, capture: true });
    window.addEventListener('keydown', () => this.audio.unlock(), { once: true });
  }

  createWorldSeed() {
    const cryptoSeed = globalThis.crypto?.getRandomValues
      ? globalThis.crypto.getRandomValues(new Uint32Array(1))[0]
      : Math.floor(Math.random() * 0xffffffff);
    return (cryptoSeed ^ Date.now()) >>> 0;
  }

  createInitialState({ worldSeed = this.createWorldSeed() } = {}) {
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
      hotbar: [...DEFAULT_HOTBAR_SLOT_IDS],
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
        researchStationPlaced: false,
        researchStation: null,
        baseLab: null,
        stationRouteUnlocked: false,
      },
      settings: {
        audioMuted: this.audio ? !this.audio.enabled : false,
        touchControlsEnabled: false,
      },
      stats: {
        totalAsteroidsMined: 0,
        totalCreditsEarned: 0,
        farthestDistanceReached: 0,
      },
      debug: {
        invincible: false,
        godMode: false,
        terrain: {
          rawGrid: false,
          visualMesh: false,
          collision: false,
          roughness: true,
          roughnessDebug: false,
          lighting: true,
          lightingDebug: false,
          depthDebug: false,
        },
      },
      tutorial: {},
      progression: {
        toolInventoryMigrated: true,
        starterTorchMigrated: true,
      },
      achievements: {},
      navigation: {
        gpsUnlocked: false,
        scannerLevel: 0,
        discoveredLocations: {},
        selectedDestinationId: null,
        scannerUpgrades: {},
      },
      base: {
        established: false,
        islandId: null,
        flagId: null,
        local: null,
      },
      islands: {
        visited: {},
        terrain: {},
        layout: null,
        layoutVersion: 0,
        seed: worldSeed,
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
      hotbar: Array.isArray(savedState.hotbar)
        ? this.normalizeSavedHotbar(savedState.hotbar, defaultState.hotbar)
        : [...defaultState.hotbar],
      runCargo: this.migrateInventory({ ...defaultState.runCargo, ...savedState.runCargo }),
      upgrades: { ...defaultState.upgrades, ...savedState.upgrades },
      research: { ...defaultState.research, ...savedState.research },
      unlockedZones: { ...defaultState.unlockedZones, ...savedState.unlockedZones },
      settings: { ...defaultState.settings, ...savedState.settings },
      stats: { ...defaultState.stats, ...savedState.stats },
      debug: {
        ...defaultState.debug,
        ...savedState.debug,
        terrain: { ...defaultState.debug.terrain, ...savedState.debug?.terrain },
      },
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
        researchStation: savedState.story?.researchStation
          ? { ...defaultState.story.researchStation, ...savedState.story.researchStation }
          : defaultState.story.researchStation,
        baseLab: savedState.story?.baseLab
          ? { ...defaultState.story.baseLab, ...savedState.story.baseLab }
          : defaultState.story.baseLab,
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
      base: {
        ...defaultState.base,
        ...savedState.base,
        local: savedState.base?.local
          ? { ...(defaultState.base.local || {}), ...savedState.base.local }
          : defaultState.base.local,
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
    if (merged.story?.researchStationPlaced) delete merged.inventory.researchStationKit;
    if (!savedState.progression?.toolInventoryMigrated) {
      ['minerTool', 'swordWeapon', 'gravityStabilizer', 'markerFlag'].forEach((itemId) => {
        if ((merged.inventory[itemId] || 0) <= 0) merged.inventory[itemId] = 1;
      });
      merged.progression ||= {};
      merged.progression.toolInventoryMigrated = true;
    }
    if (!savedState.progression?.starterTorchMigrated) {
      merged.inventory.torch = Math.max(merged.inventory.torch || 0, gameBalance.startingInventory.torch || 20);
      if (!merged.hotbar.includes('torch')) {
        const emptyIndex = merged.hotbar.findIndex((slot) => !slot);
        if (emptyIndex >= 0) merged.hotbar[emptyIndex] = 'torch';
      }
      merged.progression ||= {};
      merged.progression.starterTorchMigrated = true;
    }
    return merged;
  }

  normalizeSavedHotbar(savedHotbar = [], defaultHotbar = DEFAULT_HOTBAR_SLOT_IDS) {
    return Array.from({ length: DEFAULT_HOTBAR_SLOT_IDS.length }, (_, index) => {
      const slot = savedHotbar[index];
      return slot === undefined ? (defaultHotbar[index] ?? null) : slot;
    });
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
    const systems = {
      inventory: new InventorySystem(this),
      materials: new MaterialSystem(this),
      dialogue: new DialogueSystem(this),
      upgrades: new UpgradeSystem(this),
      economy: new EconomySystem(this),
      research: new ResearchSystem(this),
      tutorial: new TutorialSystem(this),
      objectives: new ObjectiveSystem(this),
      achievements: new AchievementSystem(this),
      building: new BuildingSystem(this),
    };
    systems.islands = new IslandSystem(this);
    systems.navigation = new NavigationSystem(this, systems.islands);
    return systems;
  }

  start() {
    const saved = this.save.load();
    if (saved) {
      this.state = this.mergeState(this.createInitialState(), saved);
      this.systems = this.createSystems();
    }
    this.audio.setMuted(Boolean(this.state.settings?.audioMuted));
    this.applyTouchControlsSetting();
    this.systems.upgrades.applyUpgrades();
    this.configureInputHotbar();

    this.registerScenes();
    this.ui.setupGlobalControls(this);
    this.debugPanel.mount(this.ui.globalLayer);
    this.updatePlatformProfile();
    this.resize();
    window.addEventListener('resize', this.resize);
    window.addEventListener('orientationchange', this.resize);
    document.addEventListener('fullscreenchange', this.resize);
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

  configureInputHotbar() {
    this.state.hotbar = this.normalizeSavedHotbar(this.state.hotbar, DEFAULT_HOTBAR_SLOT_IDS);
    this.input.configureHotbar?.({
      slotIds: this.state.hotbar,
      isSlotOwned: (slot) => !slot?.inventoryItemId || this.systems.inventory.getStoredAmount(slot.inventoryItemId) > 0,
      onChange: (slotIds) => {
        this.state.hotbar = this.normalizeSavedHotbar(slotIds, Array(DEFAULT_HOTBAR_SLOT_IDS.length).fill(null));
        this.sceneManager.current?.refreshHotbar?.(true);
        this.saveGame();
      },
    });
    if (this.input.hotbarSlotIds) this.state.hotbar = [...this.input.hotbarSlotIds];
  }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.floor(rect.width * dpr);
    this.canvas.height = Math.floor(rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.viewport = { width: rect.width, height: rect.height, dpr };
    this.input?.invalidatePointerBounds?.();
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
    this.applyTouchControlsSetting();
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
    this.isResettingWorld = true;
    try {
      this.sceneManager.current?.exit?.();
      this.sceneManager.current = null;
      this.sceneManager.currentName = '';
      this.save.reset();
      this.state = this.createInitialState({ worldSeed: this.createWorldSeed() });
      this.systems = this.createSystems();
      this.systems.upgrades.applyUpgrades({ refuel: true, repair: true });
      this.configureInputHotbar();
      this.applyTouchControlsSetting();
      this.saveGame();
      this.paused = false;
      this.ui.hidePauseMenu();
      this.audio.playReset();
    } finally {
      this.isResettingWorld = false;
    }
    this.ui.showToast('World reset. Planets and locations regenerated.', 'success', 2200);
    this.sceneManager.switchTo('boot');
  }

  togglePause(forceState) {
    this.paused = typeof forceState === 'boolean' ? forceState : !this.paused;
    if (this.paused) this.ui.showPauseMenu(this);
    else this.ui.hidePauseMenu();
  }

  refreshApp() {
    this.manualSave?.();
    window.location.reload();
  }

  exitFullscreen() {
    if (!document.fullscreenElement || !document.exitFullscreen) {
      this.ui.showToast('Already windowed', 'default', 1100);
      return;
    }
    document.exitFullscreen()
      .then(() => this.ui.showToast('Exited fullscreen', 'success', 1100))
      .catch(() => this.ui.showToast('Could not exit fullscreen', 'danger', 1400));
  }

  applyTouchControlsSetting() {
    document.documentElement.dataset.forceTouchControls = this.state.settings?.touchControlsEnabled ? 'true' : 'false';
  }

  setTouchControlsEnabled(enabled) {
    this.state.settings = {
      ...(this.state.settings || {}),
      touchControlsEnabled: Boolean(enabled),
    };
    this.applyTouchControlsSetting();
    this.saveGame();
    this.ui.showToast(this.state.settings.touchControlsEnabled ? 'Touch controls shown' : 'Touch controls hidden', 'success');
  }

  toggleTouchControls() {
    this.setTouchControlsEnabled(!this.state.settings?.touchControlsEnabled);
  }

  returnToBase() {
    this.paused = false;
    this.ui.hidePauseMenu();
    this.state.navigation.gpsUnlocked = true;
    this.state.navigation.scannerLevel = Math.max(1, this.state.navigation.scannerLevel || 0);
    this.state.navigation.selectedDestinationId = 'base';
    this.systems.navigation.refreshLocations?.();
    this.saveGame();
    if (!this.state.base?.established) {
      this.ui.showToast('No base flag is active yet.', 'danger', 1600);
      return;
    }
    if (this.sceneManager.currentName !== 'mining') {
      this.sceneManager.switchTo('mining', { startAtBase: true });
      return;
    }
    this.ui.showToast('Base GPS selected.', 'success', 1200);
  }

  returnToStation() {
    this.returnToBase();
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
    this.sceneManager.switchTo('mining', { startAtBase: true, miningSummary: summary });
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
    this.handleControllerUiNavigation(delta);
    if (!this.paused) this.sceneManager.update(delta);
    this.sceneManager.render(this.ctx);
    this.input.endFrame();
    requestAnimationFrame(this.loop);
  }

  handleControllerUiNavigation(delta = 0) {
    if (!this.input.isControllerActive?.()) return;
    this.controllerUiNavRepeatTimer = Math.max(0, this.controllerUiNavRepeatTimer - delta);
    const scope = this.getControllerUiScope();
    if (!scope) {
      this.controllerUiFocusScope = '';
      this.controllerUiWaitForRelease = false;
      return;
    }
    const controls = this.getControllerUiControls(scope);
    if (!controls.length) return;
    if (scope !== this.controllerUiFocusScope) {
      this.controllerUiFocusScope = scope;
      this.controllerUiFocusIndex = 0;
      this.controllerUiNavLastKey = '';
      this.controllerUiNavRepeatTimer = 0;
      controls[0].focus({ preventScroll: true });
    }

    const actions = this.input.actions;
    if (this.controllerUiWaitForRelease) {
      const holdingActivation = actions.confirm || actions.interact || actions.cancel || actions.pause;
      if (holdingActivation) {
        this.suppressGameplayInputForUi(scope);
        return;
      }
      this.controllerUiWaitForRelease = false;
    }

    if (actions.justPressed.cancel) {
      if (this.paused) this.togglePause(false);
      else if (scope === 'upgrades' || scope === 'storage') this.sceneManager.switchTo('station');
      this.suppressGameplayInputForUi(scope);
      return;
    }

    const moveVector = this.getControllerUiMoveVector(actions);
    if (moveVector) {
      this.moveControllerUiFocus(controls, moveVector);
      this.audio.playButtonHover();
    }

    const activeIndex = controls.indexOf(document.activeElement);
    if (activeIndex >= 0) this.controllerUiFocusIndex = activeIndex;
    if ((actions.justPressed.confirm || actions.justPressed.interact) && controls[this.controllerUiFocusIndex]) {
      controls[this.controllerUiFocusIndex].click();
    }
    this.suppressGameplayInputForUi(scope);
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

  getControllerUiMoveVector(actions) {
    const directions = [
      { key: 'right', vector: { x: 1, y: 0 } },
      { key: 'left', vector: { x: -1, y: 0 } },
      { key: 'down', vector: { x: 0, y: 1 } },
      { key: 'up', vector: { x: 0, y: -1 } },
    ];
    const pressed = directions.find((direction) => actions.justPressed[direction.key]);
    if (pressed) {
      this.controllerUiNavLastKey = pressed.key;
      this.controllerUiNavRepeatTimer = 0.28;
      return pressed.vector;
    }
    const held = directions.find((direction) => actions[direction.key]);
    if (!held) {
      this.controllerUiNavLastKey = '';
      this.controllerUiNavRepeatTimer = 0;
      return null;
    }
    if (held.key !== this.controllerUiNavLastKey) {
      this.controllerUiNavLastKey = held.key;
      this.controllerUiNavRepeatTimer = 0.28;
      return held.vector;
    }
    if (this.controllerUiNavRepeatTimer <= 0) {
      this.controllerUiNavRepeatTimer = 0.11;
      return held.vector;
    }
    return null;
  }

  moveControllerUiFocus(controls, vector) {
    const currentIndex = Math.max(0, controls.indexOf(document.activeElement) >= 0
      ? controls.indexOf(document.activeElement)
      : Math.min(this.controllerUiFocusIndex, controls.length - 1));
    const current = controls[currentIndex] || controls[0];
    const currentRect = current.getBoundingClientRect();
    const currentCenter = {
      x: currentRect.left + currentRect.width * 0.5,
      y: currentRect.top + currentRect.height * 0.5,
    };
    let bestIndex = -1;
    let bestScore = Infinity;

    controls.forEach((element, index) => {
      if (index === currentIndex) return;
      const rect = element.getBoundingClientRect();
      const center = {
        x: rect.left + rect.width * 0.5,
        y: rect.top + rect.height * 0.5,
      };
      const dx = center.x - currentCenter.x;
      const dy = center.y - currentCenter.y;
      const forward = dx * vector.x + dy * vector.y;
      if (forward <= 4) return;
      const perpendicular = Math.abs(dx * -vector.y + dy * vector.x);
      const distance = Math.hypot(dx, dy);
      const sameBand = vector.x !== 0
        ? Math.abs(center.y - currentCenter.y) <= Math.max(currentRect.height, rect.height) * 0.62
        : Math.abs(center.x - currentCenter.x) <= Math.max(currentRect.width, rect.width) * 0.62;
      const score = perpendicular * (sameBand ? 0.55 : 1.25) + distance * 0.16 + forward * 0.04;
      if (score < bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });

    if (bestIndex < 0) {
      const direction = vector.x + vector.y > 0 ? 1 : -1;
      bestIndex = (currentIndex + direction + controls.length) % controls.length;
    }
    this.controllerUiFocusIndex = bestIndex;
    controls[bestIndex].focus({ preventScroll: true });
  }

  suppressGameplayInputForUi(scope) {
    if (scope !== 'overlay') return;
    this.input.moveVector = { x: 0, y: 0 };
    [
      'up',
      'down',
      'left',
      'right',
      'confirm',
      'cancel',
      'pause',
      'jump',
      'boost',
      'interact',
      'primaryUse',
      'aimUse',
      'mine',
      'attack',
      'placeFlag',
      'placeTorch',
      'placeFurnace',
      'placeCraftingStation',
      'placeResearchStation',
      'crafting',
      'inventory',
    ].forEach((actionName) => {
      this.input.actions[actionName] = false;
      this.input.actions.justPressed[actionName] = false;
    });
  }

  blockControllerUiActivationUntilRelease() {
    if (!this.input.isControllerActive?.()) return;
    this.controllerUiWaitForRelease = true;
    this.controllerUiFocusScope = '';
    this.controllerUiNavLastKey = '';
    this.controllerUiNavRepeatTimer = 0;
  }
}
