import { Button } from '../ui/Button.js';
import { Joystick } from '../ui/Joystick.js';
import { Hotbar } from '../ui/Hotbar.js?v=93';
import { Ship } from '../entities/Ship.js?v=93';
import { Asteroid, estimateAsteroidRadius } from '../entities/Asteroid.js?v=93';
import { CompanionDrone } from '../entities/CompanionDrone.js?v=93';
import { MineralPickup } from '../entities/MineralPickup.js';
import { SpaceIsland } from '../entities/SpaceIsland.js?v=93';
import { IslandPlayer } from '../entities/IslandPlayer.js?v=93';
import { PlacedFlag } from '../entities/PlacedFlag.js?v=93';
import { PlacedFurnace } from '../entities/PlacedFurnace.js?v=93';
import { PlacedCraftingStation } from '../entities/PlacedCraftingStation.js?v=93';
import { AsteroidFragmentationSystem } from '../systems/AsteroidFragmentationSystem.js?v=93';
import { ShipSmokeSimulation } from '../effects/ShipSmokeSimulation.js?v=93';
import { ParticleBurstSystem } from '../effects/ParticleBurstSystem.js?v=93';
import { FloatingTextSystem } from '../effects/FloatingTextSystem.js?v=93';
import { CargoTransferEffectSystem } from '../effects/CargoTransferEffectSystem.js?v=93';
import { MiningLaserRenderer } from '../effects/MiningLaserRenderer.js?v=93';
import { ElectricLaserRenderer } from '../effects/ElectricLaserRenderer.js?v=93';
import { MiningMiniMap } from '../ui/MiningMiniMap.js?v=93';
import { TERRAIN_MATERIALS } from '../systems/TerrainGrid.js?v=93';
import { drawCraftVoxelPreview } from '../utils/craftVoxelRenderer.js?v=93';
import { asteroids as asteroidData } from '../data/asteroids.js?v=93';
import { gameBalance } from '../data/gameBalance.js?v=93';

const DOCK_RADIUS = gameBalance.mining.stationDockRadius;
const DOCK_RADIUS_SQ = DOCK_RADIUS * DOCK_RADIUS;
const STATION_SAFE_RADIUS_SQ = (DOCK_RADIUS * 0.7) ** 2;
const ASTEROID_META_BY_ID = Object.fromEntries(asteroidData.map((asteroid) => [asteroid.id, asteroid]));
const MAX_PARTICLES = gameBalance.mining.maxActiveParticles || 150;
const MAX_FLOATING_TEXT = gameBalance.mining.maxFloatingText || 24;
const RING_SIZE = gameBalance.mining.ringSize || 10000;
const RING_COLORS = ['#2f5e89', '#284d82', '#c7602c', '#8d66e8', '#dfe7ff'];
const ASTEROID_CHIP_BRUSH_RADIUS = gameBalance.mining.asteroidMiningBrushRadius || 20;
const TERRAIN_LASER_RANGE = 390;
const TERRAIN_MINING_BRUSH_RADIUS = 22;
const STARTER_FURNACE_WIDTH = 138;
const STARTER_FURNACE_CLEARANCE = 112;
const STARTER_FURNACE_DEPTH = 58;
const CRAFTING_STATION_WIDTH = 150;
const CRAFTING_STATION_CLEARANCE = 106;
const CRAFTING_STATION_DEPTH = 54;
const PLANET_PLAYER_MOVE_SPEED = 270;
const PLANET_PLAYER_AIR_SPEED = 175;
const PLANET_PLAYER_JUMP_SPEED = 570;
const PLANET_PLAYER_MAX_SPEED = 780;
const PLANET_PLAYER_GROUND_PROBE = 11;
const PLANET_PLAYER_COYOTE_TIME = 0.13;
const PLANET_PLAYER_COLLISION_STEP = 4;
const PLANET_PLAYER_STEP_UP = 14;
const PLANET_PLAYER_HALF_WIDTH = 12;
const PLANET_PLAYER_HEAD_OFFSET = 29;
const PLANET_PLAYER_FOOT_OFFSET = 30;
const PLANET_PLAYER_WALL_SLIDE_DAMPING = 0.18;
const ISLAND_STABILIZE_MAX_SPEED = 1.45;
const ISLAND_STABILIZE_HOLD_MAX_SPEED = 1.75;
const ISLAND_STABILIZE_TARGET_FOLLOW_SPEED = 1.15;
const ISLAND_STABILIZE_SMOOTH_TIME = 0.62;
const ISLAND_STABILIZE_EPSILON = 0.004;
const ISLAND_LANDING_CAMERA_SPEED = 1.25;
const ISLAND_LANDING_ZOOM_SPEED = 1.35;
const ISLAND_LANDING_PLANET_ROTATION_SPEED = 0.82;
const ISLAND_LANDING_SHIP_ROTATION_SPEED = 0.9;
const ISLAND_LANDING_MIN_TIME = 3.15;
const ISLAND_LANDING_MAX_TIME = 10.5;
const ISLAND_LANDING_READY_DISTANCE = 8;
const ISLAND_LANDING_READY_ROTATION = 0.035;
const ISLAND_LANDING_READY_SHIP_ANGLE = 0.06;
const ISLAND_GRAVITY_CATCH_FIELD_RATIO = 0.96;
const ISLAND_GRAVITY_RELEASE_OFFSET = 110;

const clamp01 = (value) => Math.max(0, Math.min(1, value));
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function normalizeAngle(angle) {
  let value = angle;
  while (value > Math.PI) value -= Math.PI * 2;
  while (value < -Math.PI) value += Math.PI * 2;
  return value;
}

function angleDifference(from, to) {
  return normalizeAngle(to - from);
}

function hexToRgb(hex) {
  const normalized = hex.replace('#', '').trim();
  const value = normalized.length === 3
    ? normalized.split('').map((part) => part + part).join('')
    : normalized;
  const number = Number.parseInt(value, 16);
  return {
    r: (number >> 16) & 255,
    g: (number >> 8) & 255,
    b: number & 255,
  };
}

function lerpColor(from, to, amount) {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  const mix = clamp01(amount);
  const r = Math.round(a.r + (b.r - a.r) * mix);
  const g = Math.round(a.g + (b.g - a.g) * mix);
  const bl = Math.round(a.b + (b.b - a.b) * mix);
  return `rgb(${r}, ${g}, ${bl})`;
}

export class MiningScene {
  constructor(game, payload = {}) {
    this.game = game;
    this.payload = payload;
    this.game.systems.upgrades.applyUpgrades();
    this.crashStart = Boolean(payload.crashStart) || !game.state.story?.thrustersRepaired;
    this.ship = new Ship(game.state.ship);
    this.combatDrone = new CompanionDrone({ cooldown: 0.48, damage: 18, targetRange: 920 });
    this.asteroids = [];
    this.spaceEnemies = [];
    this.pickups = [];
    this.pickupPool = [];
    this.asteroidPool = [];
    this.fragmentation = new AsteroidFragmentationSystem({
      config: gameBalance.mining.asteroidFragmentation,
      maxAsteroidCount: gameBalance.mining.maxAsteroidCount,
    });
    this.shipSmoke = new ShipSmokeSimulation();
    this.particleFx = new ParticleBurstSystem({ maxParticles: MAX_PARTICLES });
    this.floatingTextFx = new FloatingTextSystem({ maxItems: MAX_FLOATING_TEXT });
    this.cargoTransferFx = new CargoTransferEffectSystem();
    this.laserRenderer = new MiningLaserRenderer();
    this.terrainLaserRenderer = new ElectricLaserRenderer();
    this.time = 0;
    this.viewScale = gameBalance.ui?.miningViewScale || gameBalance.ui?.worldViewScale || 1;
    this.islandViewScale = gameBalance.ui?.islandViewScale || gameBalance.ui?.worldViewScale || 0.88;
    this.currentViewScale = this.viewScale;
    this.camera = { x: 0, y: 0, shake: 0, shakeX: 0, shakeY: 0 };
    this.cameraView = {
      worldToScreen: (x, y) => ({
        x: x - this.camera.x + (this.game.viewport?.width || 0) / 2 + this.camera.shakeX,
        y: y - this.camera.y + (this.game.viewport?.height || 0) / 2 + this.camera.shakeY,
      }),
    };
    this.stats = this.createRunStats();
    if (payload.fromIsland) {
      this.stats = { ...this.stats, ...(payload.miningStats || {}) };
      this.runCargo = game.systems.inventory.getRunCargo();
      this.runCargoCount = Object.values(this.runCargo).reduce((total, amount) => total + amount, 0);
      this.runCargoWeight = game.systems.inventory.getRunCargoWeight(this.runCargo);
      this.stats.cargo = Math.ceil(this.runCargoWeight);
      this.ship.x = payload.shipPosition?.x ?? 0;
      this.ship.y = payload.shipPosition?.y ?? 0;
      this.ship.vx = 0;
      this.ship.vy = 0;
    } else {
      this.runCargo = game.systems.inventory.beginRunCargo();
      this.runCargoCount = 0;
      this.runCargoWeight = 0;
    }
    this.mineTick = 0;
    this.laserTarget = null;
    this.laserAimPoint = null;
    this.mouseAimWorld = null;
    this.mouseAimTarget = null;
    this.mouseAimHit = null;
    this.lowFuelToastReady = true;
    this.cargoFullToastReady = true;
    this.scannerPingCooldown = 0;
    this.currentZone = this.getZoneForDistance(0);
    this.previousZoneId = this.currentZone.id;
    this.zoneBannerTimer = 2.4;
    this.ringCrossingPulse = 0;
    this.lockedZoneToastId = '';
    this.mineBlockedCooldown = 0;
    this.ambientParticles = [];
    this.shieldTimer = 0;
    this.recallUsed = false;
    this.laserWasActive = false;
    this.engineBoosting = false;
    this.ending = false;
    this.distanceFromStation = 0;
    this.hudCache = {};
    this.hudRefreshTimer = 0;
    this.quickInventoryOpen = false;
    this.quickInventorySignature = '';
    this.distanceRecordTimer = 0;
    this.spaceBackdrop = null;
    this.rockIslands = this.createSpaceIslands();
    this.gravityIsland = null;
    this.gravityFieldStrength = 0;
    this.backgroundAsteroids = [];
    this.backgroundAsteroidSourceId = '';
    this.spaceObjectsSuspended = false;
    this.landingIsland = null;
    this.landingTargetPreview = null;
    this.islandMode = 'flight';
    this.activeIsland = null;
    this.islandPlayer = null;
    this.islandLandingTarget = null;
    this.islandLandingAnchor = null;
    this.flagPlacementPreview = null;
    this.furnacePlacementPreview = null;
    this.placedFurnace = null;
    this.placedFurnaces = [];
    this.placedCraftingStation = null;
    this.craftingStationPlacementPreview = null;
    this.survivalModal = null;
    this.activeFurnaceId = '';
    this.voxelCraftState = null;
    this.furnaceModalRefreshTimer = 0;
    this.crashTutorialHints = {};
    this.islandViewRotation = 0;
    this.islandRotationTarget = 0;
    this.islandRotationSettling = false;
    this.islandFreefall = false;
    this.islandGravityRecovery = false;
    this.islandGravityRecoveryBlend = 0;
    this.islandMiningBeam = null;
    this.islandMiningHitFeedback = null;
    this.islandAimPreview = null;
    this.islandLaserSoundActive = false;
    this.islandTerrainDirty = false;
    this.islandLandingTimer = 0;
    this.islandBoardingTimer = 0;
    this.islandFloatingText = [];
    this.islandTerrainParticles = [];
    this.gpsPingTimer = 0;
    this.destinationReachedId = '';
    this.cargoDumping = false;
    this.cargoDumpTimer = 0;
    this.cargoDumpSummary = null;
    this.cargoDumpReturnToStation = false;
    this.cargoDumpCooldown = 0;
    this.outOfFuelReturnQueued = false;
  }

  createSpaceIslands() {
    return this.game.systems.islands.getAllIslands().map((island) => {
      const world = {
        width: island.size?.width || 1500,
        height: Math.max(island.size?.height || 760, 680),
        floorY: Math.max(300, (island.size?.height || 760) * 0.62),
        landingX: island.landingX || Math.max(180, (island.size?.width || 1500) * 0.22),
        gravity: 1560,
        allowExitBounds: true,
        allowFreefall: true,
      };
      const terrain = this.game.systems.islands.createTerrain(island, world);
      return new SpaceIsland({
        ...island,
        placedFlags: this.game.systems.islands.getSavedFlags(island.id),
      }, terrain);
    });
  }

  startCrashPlanet() {
    const story = this.getStoryState();
    this.game.systems.inventory.clearRunCargo();
    this.runCargo = this.game.systems.inventory.getRunCargo();
    this.runCargoCount = 0;
    this.runCargoWeight = 0;
    this.stats.cargo = 0;

    const island = this.rockIslands.find((entry) => entry.id === story.starterPlanetId) || this.rockIslands[0];
    if (!island) {
      this.seedAsteroidField();
      return;
    }

    this.activeIsland = island;
    this.landingIsland = island;
    this.gravityIsland = island;
    this.gravityFieldStrength = 1;
    this.islandMode = 'onIsland';
    this.islandViewRotation = 0;
    this.islandRotationTarget = 0;
    this.islandRotationSettling = false;
    this.islandLandingAnchor = null;
    this.islandFreefall = false;
    this.islandGravityRecovery = false;
    this.islandGravityRecoveryBlend = 0;
    island.landingAngle = -Math.PI / 2;
    island.landingSurfaceLocal = null;

    const shipLocal = island.getShipParkLocal();
    const shipWorld = island.localToWorldRotated(shipLocal.x, shipLocal.y, 0);
    this.ship.x = shipWorld.x;
    this.ship.y = shipWorld.y;
    this.ship.vx = 0;
    this.ship.vy = 0;
    this.ship.angle = island.landingAngle;
    this.distanceFromStation = this.getDistanceFromStation();

    const exit = island.getPlayerExitLocal();
    this.islandPlayer = new IslandPlayer({ x: exit.x, y: exit.y });
    this.seedPlanetPlayer(island, this.islandPlayer);
    this.loadCrashFurnace();
    this.suspendSpaceObjectsForIsland(island);
    this.updateCamera(1);
    this.updateHud();
    this.showCrashIntro();
  }

  getStoryState() {
    this.game.state.story ||= {};
    this.game.state.story.starterPlanetId ||= 'crashPlanet';
    this.game.state.story.furnace ||= null;
    this.game.state.story.furnaceInventory ||= [];
    this.game.state.story.furnaces ||= [];
    this.game.state.story.craftingStation ||= null;
    return this.game.state.story;
  }

  loadCrashFurnace() {
    const story = this.getStoryState();
    if ((!story.furnaces || !story.furnaces.length) && story.furnacePlaced && story.furnace) {
      story.furnaces = [story.furnace];
      story.furnace = null;
    }
    if (
      story.furnaceBuilt
      && !story.furnacePlaced
      && !story.furnaces?.length
      && !story.furnaceInventory?.length
      && this.game.systems.inventory.getStoredAmount('starterFurnace') <= 0
    ) {
      story.furnaceInventory = [this.createDefaultFurnaceBlueprint()];
      this.game.systems.inventory.add('starterFurnace', 1, { skipSave: true });
    }
    this.placedFurnaces = (story.furnaces || []).map((furnace) => PlacedFurnace.deserialize(furnace));
    this.placedFurnace = this.placedFurnaces[0] || null;
    this.placedCraftingStation = story.craftingStationPlaced && story.craftingStation
      ? PlacedCraftingStation.deserialize(story.craftingStation)
      : null;
  }

  showCrashIntro() {
    const story = this.getStoryState();
    if (story.crashIntroSeen) return;
    story.crashIntroSeen = true;
    this.game.saveGame();
    this.game.systems.dialogue.startSet('sparksTutorial', 'crashIntro', {
      speaker: 'Sparks',
      portraitStyle: { tone: 'forge', shape: 'drone' },
    });
  }

  createRunStats() {
    const ship = this.game.state.ship;
    return {
      fuel: ship.fuel ?? ship.maxFuel ?? 100,
      maxFuel: ship.maxFuel ?? 100,
      hull: ship.hull ?? ship.maxHull ?? 100,
      maxHull: ship.maxHull ?? 100,
      cargo: 0,
      cargoCapacity: ship.cargoMax ?? 20,
      speed: ship.speed ?? 1,
      miningPower: ship.miningPower ?? 1,
      miningRange: ship.miningRange ?? 210 + (ship.range ?? 1) * 18,
      collectionMagnet: ship.collectionMagnet ?? 0,
      rareScanner: ship.rareScanner ?? 0,
      precisionCutter: ship.precisionCutter ?? 0,
      emergencyRecall: ship.emergencyRecall ?? 0,
      shieldCharges: ship.shieldCharges ?? 0,
      shieldCooldown: ship.shieldCooldown ?? 0,
      maxDistance: 0,
      asteroidsMined: 0,
      rareFinds: 0,
      farthestZone: 'Scrap Belt',
    };
  }

  enter() {
    this.game.ui.setScreen('mining-screen');
    this.mountHud();
    this.mountControls();
    if (this.crashStart) {
      this.startCrashPlanet();
      return;
    }
    this.seedAsteroidField();
    this.game.systems.tutorial.onMiningEnter();
  }

  mountHud() {
    const hud = document.createElement('div');
    hud.className = 'mining-hud';
    hud.innerHTML = `
      <div class="station-radar">
        <span class="radar-arrow" data-station-arrow></span>
        <strong data-distance-text>0m</strong>
      </div>
      <div class="zone-chip" data-zone-chip>Scrap Belt</div>
      <div class="mining-warning" data-warning></div>
      <div class="zone-banner" data-zone-banner>Scrap Belt</div>
      <div class="gps-destination-hud is-hidden" data-gps-panel>
        <span class="gps-arrow" data-gps-arrow></span>
        <div>
          <strong data-gps-name>No destination</strong>
          <em data-gps-distance></em>
          <small data-gps-warning></small>
        </div>
      </div>
      <div class="landing-zone-prompt is-hidden" data-landing-prompt>Landing Zone Detected</div>
    `;
    this.game.ui.addSceneElement(hud);
    const mapStack = document.createElement('div');
    mapStack.className = 'mining-map-stack';
    this.miniMap = new MiningMiniMap({
      zones: gameBalance.zones,
      ringSize: RING_SIZE,
      maxDistance: gameBalance.mining.miniMapMaxDistance || RING_SIZE * 5,
    });
    const vitals = document.createElement('div');
    vitals.className = 'mining-vitals';
    vitals.innerHTML = `
      <div class="mining-bar hull-bar">
        <span>Hull</span>
        <div><i data-hull-fill></i></div>
        <strong data-hull-text></strong>
      </div>
      <div class="mining-bar fuel-bar">
        <span>Fuel</span>
        <div><i data-fuel-fill></i></div>
        <strong data-fuel-text></strong>
      </div>
      <div class="mining-bar cargo-bar">
        <span>Cargo</span>
        <div><i data-cargo-fill></i></div>
        <strong data-cargo-text></strong>
      </div>
    `;
    const quickInventory = document.createElement('div');
    quickInventory.className = 'quick-inventory is-hidden';
    quickInventory.setAttribute('aria-label', 'Inventory');
    quickInventory.innerHTML = '<div class="quick-inventory-grid" data-quick-inventory-grid></div>';
    mapStack.append(this.miniMap.element, vitals, quickInventory);
    hud.append(mapStack);
    this.hud = {
      hullText: vitals.querySelector('[data-hull-text]'),
      hullFill: vitals.querySelector('[data-hull-fill]'),
      fuelText: vitals.querySelector('[data-fuel-text]'),
      fuelFill: vitals.querySelector('[data-fuel-fill]'),
      cargoText: vitals.querySelector('[data-cargo-text]'),
      cargoFill: vitals.querySelector('[data-cargo-fill]'),
      stationArrow: hud.querySelector('[data-station-arrow]'),
      distanceText: hud.querySelector('[data-distance-text]'),
      zoneChip: hud.querySelector('[data-zone-chip]'),
      zoneBanner: hud.querySelector('[data-zone-banner]'),
      warning: hud.querySelector('[data-warning]'),
      gpsPanel: hud.querySelector('[data-gps-panel]'),
      gpsArrow: hud.querySelector('[data-gps-arrow]'),
      gpsName: hud.querySelector('[data-gps-name]'),
      gpsDistance: hud.querySelector('[data-gps-distance]'),
      gpsWarning: hud.querySelector('[data-gps-warning]'),
      landingPrompt: hud.querySelector('[data-landing-prompt]'),
      cargoBar: vitals.querySelector('.cargo-bar'),
      fuelBar: vitals.querySelector('.fuel-bar'),
      hullBar: vitals.querySelector('.hull-bar'),
      quickInventory,
      quickInventoryGrid: quickInventory.querySelector('[data-quick-inventory-grid]'),
    };

    this.dockButton = new Button('Dock', () => this.dock(), {
      icon: 'D',
      variant: 'success',
      className: 'dock-button is-hidden',
    }).element;
    this.game.ui.addSceneElement(this.dockButton);
    this.recallButton = new Button('Recall', () => this.recallToStation(), {
      icon: 'R',
      variant: 'metal',
      className: 'recall-button is-hidden',
    }).element;
    this.game.ui.addSceneElement(this.recallButton);
    this.updateQuickInventory(true);
    this.updateHud();
  }

  mountControls() {
    const moveStick = new Joystick({ label: 'Move' }).element;
    this.hotbar = new Hotbar(this.game, { className: 'mining-tool-hotbar' });
    this.game.ui.addSceneElement(this.hotbar.element);
    const useButton = new Button('Use', () => {}, {
      icon: 'U',
      className: 'mine-hold-button',
      variant: 'forge',
      holdAction: 'primaryUse',
    }).element;
    const actionCluster = document.createElement('div');
    actionCluster.className = 'mining-action-controls';
    actionCluster.append(useButton);
    this.moveStick = moveStick;
    this.mineButton = useButton;
    this.mineButtonLabel = useButton.querySelector('span:last-child');
    this.mineButtonIcon = useButton.querySelector('.button-icon');
    this.game.ui.addControls([moveStick, actionCluster]);
    this.game.input.bindJoystick(moveStick, { mode: 'move', radius: 46, floating: true, activationRegion: 'left' });
    this.game.input.bindHoldButton(useButton, 'primaryUse');
  }

  exit() {
    this.closeSurvivalModal();
    this.closeQuickInventory();
    this.moveStick?.__inputCleanup?.();
    this.game.audio.stopLaserLoop();
    this.game.audio.stopEngineBoost();
    this.game.audio.setDangerMode(false);
    if (this.activeIsland && this.islandTerrainDirty) {
      this.game.systems.islands.saveTerrain(this.activeIsland.id, this.activeIsland.terrain);
      this.islandTerrainDirty = false;
    }
    this.stopIslandTerrainLaser?.();
    this.shipSmoke?.clear();
    this.combatDrone?.clear();
    this.game.input.virtualButtons.set('mine', false);
    this.game.input.virtualButtons.set('attack', false);
    this.game.input.virtualButtons.set('primaryUse', false);
  }

  seedAsteroidField() {
    for (let i = 0; i < gameBalance.mining.targetAsteroidCount; i += 1) {
      this.asteroids.push(this.createAsteroid(gameBalance.mining.asteroidSpawnMinDistance * 0.65, 2400));
    }
  }

  createAsteroid(minDistance = 360, spawnRange = gameBalance.mining.asteroidSpawnMaxDistance) {
    let fallback = null;
    for (let attempt = 0; attempt < 28; attempt += 1) {
      const angle = Math.random() * Math.PI * 2;
      const distance = minDistance + Math.random() * spawnRange;
      const x = this.ship.x + Math.cos(angle) * distance;
      const y = this.ship.y + Math.sin(angle) * distance;
      const spawnDistanceFromStation = Math.sqrt(x * x + y * y);
      const zone = this.getZoneForDistance(spawnDistanceFromStation);
      const type = this.chooseAsteroidType(spawnDistanceFromStation, zone.id);
      const seed = Math.random();
      const fragmentTier = this.chooseAsteroidFragmentTier(spawnDistanceFromStation);
      const radius = estimateAsteroidRadius({ type, seed, fragmentTier });
      const candidate = { x, y, type, seed, fragmentTier, radius };
      const clearance = this.getAsteroidSpawnClearance(candidate);
      if (!fallback || clearance > fallback.clearance) fallback = { ...candidate, clearance };
      if (clearance >= 0) {
        fallback = { ...candidate, clearance };
        break;
      }
    }
    const spawn = fallback || {
      x: this.ship.x + gameBalance.mining.asteroidSpawnMinDistance,
      y: this.ship.y,
      type: 'stone',
      seed: Math.random(),
      fragmentTier: 1,
    };
    const asteroidMeta = ASTEROID_META_BY_ID[spawn.type];
    const asteroid = this.acquireAsteroid({
      x: spawn.x,
      y: spawn.y,
      type: spawn.type,
      seed: spawn.seed,
      fragmentTier: spawn.fragmentTier,
    });
    asteroid.scannerRevealed = this.stats.rareScanner > 0;
    if (this.stats.rareScanner > 0 && (asteroidMeta?.rarity === 'rare' || asteroidMeta?.rarity === 'epic') && this.scannerPingCooldown <= 0) {
      this.scannerPingCooldown = 8;
      this.game.ui.showToast(`Scanner ping: ${asteroidMeta.name}`, 'success');
      this.game.audio.playRareFind();
    }
    return asteroid;
  }

  isAsteroidSpawnOpen(candidate) {
    return this.getAsteroidSpawnClearance(candidate) >= 0;
  }

  getAsteroidSpawnClearance(candidate) {
    const stationClearance = DOCK_RADIUS + candidate.radius + 320;
    let clearance = Math.sqrt(candidate.x * candidate.x + candidate.y * candidate.y) - stationClearance;
    const gap = gameBalance.mining.asteroidSpawnGap || 160;
    for (let index = 0; index < this.asteroids.length; index += 1) {
      const other = this.asteroids[index];
      const dx = candidate.x - other.x;
      const dy = candidate.y - other.y;
      const minDistance = candidate.radius + other.radius + gap;
      clearance = Math.min(clearance, Math.sqrt(dx * dx + dy * dy) - minDistance);
    }
    return clearance;
  }

  acquireAsteroid(options) {
    const asteroid = this.asteroidPool.pop();
    return asteroid ? asteroid.reset(options) : new Asteroid(options);
  }

  chooseAsteroidFragmentTier(distanceFromStation) {
    if (distanceFromStation > RING_SIZE * 3.2) return 3;
    if (distanceFromStation > RING_SIZE * 1.5) return Math.random() < 0.55 ? 2 : 1;
    return Math.random() < 0.2 ? 2 : 1;
  }

  releaseAsteroid(asteroid) {
    asteroid.active = false;
    if (this.asteroidPool.length < (gameBalance.mining.maxAsteroidPool || 24)) this.asteroidPool.push(asteroid);
  }

  chooseAsteroidType(distanceFromStation, zoneId) {
    const distanceBand = gameBalance.mining.asteroidDistanceBands
      ?.find((band) => distanceFromStation >= band.minDistance && distanceFromStation < band.maxDistance);
    const sourceWeights = distanceBand?.weights;
    const weighted = asteroidData
      .map((asteroid) => ({
        id: asteroid.id,
        weight: sourceWeights?.[asteroid.id] ?? asteroid.zoneWeights[zoneId] ?? 0,
      }))
      .filter((entry) => entry.weight > 0);
    const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
    let roll = Math.random() * total;
    for (const entry of weighted) {
      roll -= entry.weight;
      if (roll <= 0) return entry.id;
    }
    return weighted[0]?.id || 'stone';
  }

  spawnRareAsteroid() {
    const rareTypes = asteroidData.filter((asteroid) => ['rare', 'epic'].includes(asteroid.rarity));
    const meta = rareTypes[Math.floor(Math.random() * rareTypes.length)] || ASTEROID_META_BY_ID.void;
    const angle = this.ship.angle || 0;
    const distance = 360;
    const asteroid = this.acquireAsteroid({
      x: this.ship.x + Math.cos(angle) * distance,
      y: this.ship.y + Math.sin(angle) * distance,
      type: meta.id,
      seed: Math.random(),
    });
    asteroid.scannerRevealed = true;
    this.asteroids.push(asteroid);
    this.game.audio.playRareFind();
  }

  jumpToStation() {
    this.ship.x = 0;
    this.ship.y = 0;
    this.ship.vx = 0;
    this.ship.vy = 0;
    this.shipSmoke?.clear();
    this.distanceFromStation = 0;
    this.updateHud(true);
  }

  update(delta) {
    if (this.ending) return;
    this.time += delta;
    this.hotbar?.update();
    if (this.game.input.actions.justPressed.inventory) this.toggleQuickInventory();
    this.updateQuickInventory();
    this.cargoDumpCooldown = Math.max(0, this.cargoDumpCooldown - delta);
    this.mineBlockedCooldown = Math.max(0, this.mineBlockedCooldown - delta);
    this.ringCrossingPulse = Math.max(0, this.ringCrossingPulse - delta);
    if (this.cargoDumping) {
      this.updateCargoDump(delta);
      this.updateViewScale(delta);
      this.updateCamera(delta);
      this.updateShipSmoke(delta);
      this.updateParticles(delta);
      this.updateHud();
      return;
    }
    if (this.islandMode !== 'flight') {
      this.updateIntegratedIsland(delta);
      return;
    }
    this.shieldTimer = Math.max(0, this.shieldTimer - delta);
    this.distanceFromStation = this.getDistanceFromStation();
    if (this.handleOutOfFuelReturn()) return;
    this.tryAutoCargoDump();
    if (this.cargoDumping) {
      this.updateCargoDump(delta);
      this.updateViewScale(delta);
      this.updateCamera(delta);
      this.updateShipSmoke(delta);
      this.updateHud();
      return;
    }
    this.updateFuel(delta);
    if (this.handleOutOfFuelReturn() || this.ending) return;
    this.ship.update(delta, this.game.input, this.getShipFuelRatio(), { boost: this.isGodBoosting() });
    this.distanceFromStation = this.getDistanceFromStation();
    this.updateEngineAudio();
    this.updateDistanceProgress(delta);
    this.updateZone(delta);
    this.updateNavigation(delta);
    this.updateDockInput();
    this.updateLanding(delta);
    this.updateViewScale(delta);
    this.updateCamera(delta);
    this.updateShipSmoke(delta);
    this.updateAsteroids(delta);
    this.updateMining(delta);
    this.updateDroneCombat(delta);
    this.updatePickups(delta);
    this.updateParticles(delta);
    this.handleCollisions();
    this.updateAmbientParticles(delta);
    this.hudRefreshTimer -= delta;
    if (this.hudRefreshTimer <= 0) {
      this.hudRefreshTimer = gameBalance.ui?.hudUpdateInterval || 0.08;
      this.updateHud();
    }
  }

  tryAutoCargoDump() {
    if (this.cargoDumping || this.ending || this.cargoDumpCooldown > 0 || this.runCargoCount <= 0) return;
    if (this.distanceFromStation * this.distanceFromStation > DOCK_RADIUS_SQ) return;
    this.beginCargoDump({ returnToStation: false });
  }

  beginCargoDump({ returnToStation = false, summaryType = 'docked' } = {}) {
    this.cargoDumping = true;
    this.cargoDumpTimer = 1.15;
    this.cargoDumpReturnToStation = returnToStation;
    this.cargoDumpSummary = this.createSummary(summaryType, { ...this.runCargo });
    if (returnToStation) {
      this.ship.vx *= 0.2;
      this.ship.vy *= 0.2;
    }
    this.stopLaserAudio();
    this.game.ui.showToast(
      returnToStation ? 'Docking and unloading cargo...' : 'Cargo bay dumping to station...',
      'success',
      1400,
    );
    this.game.audio.playShipDock();
    this.game.audio.playPickup();
    this.spawnCargoTransferEffects();
    this.game.systems.tutorial.onDockAvailable();
  }

  updateCargoDump(delta) {
    this.cargoDumpTimer -= delta;
    if (this.cargoDumpReturnToStation) {
      this.ship.vx *= Math.max(0, 1 - delta * 7);
      this.ship.vy *= Math.max(0, 1 - delta * 7);
    } else {
      this.ship.update(delta, this.game.input, this.getShipFuelRatio(), { boost: this.isGodBoosting() });
      this.distanceFromStation = this.getDistanceFromStation();
      this.updateEngineAudio();
    }
    this.cargoTransferFx.update(delta);
    if (this.cargoDumpTimer > 0) return;
    if (this.cargoDumpReturnToStation) {
      this.ending = true;
      this.game.audio.playDockSuccess();
      this.game.dockFromMining({ cargo: this.runCargo, summary: this.cargoDumpSummary });
      return;
    }
    this.finishCargoDumpAndContinue();
  }

  isGodMode() {
    return Boolean(this.game.state.debug?.godMode);
  }

  isInvincible() {
    return Boolean(this.game.state.debug?.godMode || this.game.state.debug?.invincible);
  }

  isGodBoosting() {
    return this.isGodMode()
      && this.islandMode === 'flight'
      && this.game.input.keys.has(' ');
  }

  getShipFuelRatio() {
    return this.isGodMode() ? 1 : this.stats.fuel / Math.max(1, this.stats.maxFuel);
  }

  isMiningInputActive() {
    if (!this.game.input.actions.mine) return false;
    if (!this.isGodMode() || !this.game.input.keys.has(' ')) return true;
    return this.game.input.actions.primaryUse && this.game.input.getSelectedHotbarAction?.() === 'mine';
  }

  finishCargoDumpAndContinue() {
    const cargoSnapshot = { ...this.runCargo };
    const totalItems = Object.values(cargoSnapshot).reduce((total, amount) => total + amount, 0);
    const { creditsEarned } = this.game.depositMiningCargo({
      cargo: cargoSnapshot,
      summary: this.cargoDumpSummary,
      recordDocked: true,
    });
    this.runCargo = this.game.systems.inventory.getRunCargo();
    this.runCargoCount = 0;
    this.runCargoWeight = 0;
    this.stats.cargo = 0;
    this.cargoDumping = false;
    this.cargoDumpReturnToStation = false;
    this.cargoDumpTimer = 0;
    this.cargoDumpSummary = null;
    this.cargoDumpCooldown = 1.25;
    this.cargoTransferFx.clear();
    this.game.audio.playDockSuccess();
    this.game.ui.showToast(`Cargo stored: ${totalItems} items (+${creditsEarned}c assay)`, 'success', 1800);
    this.addFloatingText(this.ship.x, this.ship.y - 34, `+${creditsEarned}c Assay`, { color: '#ffd36b', rarity: 'uncommon' });
    this.updateHud(true);
  }

  spawnCargoTransferEffects() {
    const effectCount = this.cargoTransferFx.spawnFromCargo({
      cargo: this.runCargo,
      ship: this.ship,
      getMaterial: (materialId) => this.game.systems.materials.getMaterial(materialId),
    });
    this.spawnBurst(this.ship.x, this.ship.y, '#ffd36b', Math.min(22, 8 + effectCount), 120);
  }

  updateDistanceProgress(delta) {
    this.stats.maxDistance = Math.max(this.stats.maxDistance, this.distanceFromStation);
    this.distanceRecordTimer -= delta;
    if (this.distanceRecordTimer > 0) return;
    this.distanceRecordTimer = gameBalance.ui?.distanceObjectiveInterval || 0.45;
    this.game.state.stats ||= {};
    this.game.state.stats.farthestDistanceReached = Math.max(
      this.game.state.stats.farthestDistanceReached || 0,
      this.stats.maxDistance,
    );
    this.game.systems.objectives.record('distanceReached', { distance: this.stats.maxDistance });
  }

  updateFuel(delta) {
    if (this.isGodMode()) {
      this.stats.fuel = this.stats.maxFuel;
      this.lowFuelToastReady = true;
      return;
    }
    const distance = this.distanceFromStation;
    if (distance * distance < STATION_SAFE_RADIUS_SQ) return;
    const moving = Math.hypot(this.game.input.moveVector.x, this.game.input.moveVector.y);
    const distancePressure = Math.max(0, distance - 2700) / 2700;
    const drain = gameBalance.mining.baseFuelDrain
      + moving * gameBalance.mining.movingFuelDrain * (1 + this.currentZone.difficulty * 0.55)
      + (this.isMiningInputActive() ? gameBalance.mining.miningFuelDrain : 0)
      + distancePressure * 0.9;
    this.stats.fuel = Math.max(0, this.stats.fuel - drain * delta);
    if (this.stats.fuel <= this.stats.maxFuel * 0.18 && this.lowFuelToastReady) {
      this.lowFuelToastReady = false;
      this.game.ui.showToast('Fuel low. Follow the beacon home.', 'danger');
      this.game.audio.playLowFuelWarning();
    }
  }

  updateZone(delta) {
    const distance = this.distanceFromStation;
    const lockedZone = this.game.systems.research.getLockedZoneForDistance(distance);
    if (lockedZone && lockedZone.id !== this.lockedZoneToastId) {
      this.lockedZoneToastId = lockedZone.id;
      this.game.ui.showToast(`Uncharted ring: ${lockedZone.name}`, 'danger');
      this.game.audio.playError();
    }
    const zone = this.getZoneForDistance(distance);
    this.currentZone = zone;
    this.scannerPingCooldown = Math.max(0, this.scannerPingCooldown - delta);
    this.zoneBannerTimer = Math.max(0, this.zoneBannerTimer - delta);
    this.stats.farthestZone = zone.name;
    if (zone.id !== this.previousZoneId) {
      this.previousZoneId = zone.id;
      this.zoneBannerTimer = 2.4;
      this.ringCrossingPulse = 1.8;
      this.game.ui.showToast(`Entering ${zone.name}`, 'success');
      this.game.audio.playSceneTransition();
    }
  }

  getZoneForDistance(distance) {
    return gameBalance.zones.find((zone) => distance >= zone.minDistance && distance < zone.maxDistance)
      || gameBalance.zones.at(-1)
      || gameBalance.zones[0];
  }

  getZoneBlend(distance) {
    const zones = gameBalance.zones;
    const zone = this.getZoneForDistance(distance);
    const index = Math.max(0, zones.findIndex((entry) => entry.id === zone.id));
    const next = zones[index + 1] || zone;
    const span = Number.isFinite(zone.maxDistance) ? zone.maxDistance - zone.minDistance : RING_SIZE;
    const progress = clamp01((distance - zone.minDistance) / Math.max(1, span));
    return { zone, next, progress };
  }

  getBlendedBackground(distance) {
    const { zone, next, progress } = this.getZoneBlend(distance);
    return {
      inner: lerpColor(zone.background.inner, next.background.inner, progress),
      middle: lerpColor(zone.background.middle, next.background.middle, progress),
      outer: lerpColor(zone.background.outer, next.background.outer, progress),
    };
  }

  updateCamera(delta) {
    const target = this.getCameraTarget();
    const speed = this.islandMode === 'landing' ? ISLAND_LANDING_CAMERA_SPEED : 4.5;
    this.camera.x += (target.x - this.camera.x) * Math.min(1, delta * speed);
    this.camera.y += (target.y - this.camera.y) * Math.min(1, delta * speed);
    this.camera.shake = Math.max(0, this.camera.shake - delta * 4);
    const trauma = this.camera.shake * this.camera.shake;
    this.camera.shakeX = (Math.random() - 0.5) * trauma * 22;
    this.camera.shakeY = (Math.random() - 0.5) * trauma * 22;
  }

  updateViewScale(delta) {
    const target = this.getTargetViewScale();
    const speed = this.islandMode === 'landing'
      ? ISLAND_LANDING_ZOOM_SPEED
      : (target > this.currentViewScale ? 6.5 : 3.6);
    const blend = Math.min(1, delta * speed);
    this.currentViewScale += (target - this.currentViewScale) * blend;
    if (Math.abs(this.currentViewScale - target) < 0.001) this.currentViewScale = target;
  }

  getCameraTarget() {
    if (this.activeIsland && this.islandMode === 'landing' && this.islandLandingAnchor) {
      return this.islandLandingAnchor.world;
    }
    if (this.activeIsland && this.islandPlayer && (this.islandMode === 'onIsland' || this.islandMode === 'boarding')) {
      return this.activeIsland.localToWorldRotated(
        this.islandPlayer.centerX,
        this.islandPlayer.centerY,
        this.getIslandViewRotation(),
      );
    }
    return { x: this.ship.x, y: this.ship.y };
  }

  updateShipSmoke(delta) {
    this.shipSmoke.update({
      delta,
      viewport: this.game.viewport,
      ship: this.ship,
      camera: this.cameraView,
      cameraFrame: {
        x: this.camera.x,
        y: this.camera.y,
        shakeX: this.camera.shakeX,
        shakeY: this.camera.shakeY,
      },
      input: this.game.input,
      fuelRatio: this.getShipFuelRatio(),
      viewScale: this.getActiveViewScale(),
      boosting: this.isGodBoosting(),
    });
  }

  updateAsteroids(delta) {
    const cullDistanceSq = gameBalance.mining.asteroidCullDistance ** 2;
    const keepNearStation = this.distanceFromStation < 900;
    let writeIndex = 0;
    for (let index = 0; index < this.asteroids.length; index += 1) {
      const asteroid = this.asteroids[index];
      asteroid.update(delta, this.time);
      if (keepNearStation || this.distanceToShipSq(asteroid) < cullDistanceSq) {
        this.asteroids[writeIndex] = asteroid;
        writeIndex += 1;
      } else {
        this.releaseAsteroid(asteroid);
      }
    }
    this.asteroids.length = writeIndex;
    while (this.asteroids.length < gameBalance.mining.targetAsteroidCount) {
      const asteroid = this.createAsteroid(gameBalance.mining.asteroidSpawnMinDistance);
      if (asteroid.x * asteroid.x + asteroid.y * asteroid.y > 260 * 260) this.asteroids.push(asteroid);
      else this.releaseAsteroid(asteroid);
    }
    if (this.asteroids.length > gameBalance.mining.maxAsteroidCount) {
      this.asteroids.sort((a, b) => this.distanceToShipSq(a) - this.distanceToShipSq(b));
      this.asteroids.splice(gameBalance.mining.maxAsteroidCount).forEach((asteroid) => this.releaseAsteroid(asteroid));
    }
    this.resolveAsteroidSpacing();
  }

  resolveAsteroidSpacing() {
    const padding = gameBalance.mining.asteroidSeparationPadding || 100;
    for (let aIndex = 0; aIndex < this.asteroids.length; aIndex += 1) {
      const a = this.asteroids[aIndex];
      for (let bIndex = aIndex + 1; bIndex < this.asteroids.length; bIndex += 1) {
        const b = this.asteroids[bIndex];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const minDistance = a.radius + b.radius + padding;
        const distanceSq = dx * dx + dy * dy;
        if (distanceSq >= minDistance * minDistance) continue;
        const distance = Math.sqrt(distanceSq) || 1;
        const nx = dx / distance;
        const ny = dy / distance;
        const overlap = (minDistance - distance) * 0.5;
        a.x -= nx * overlap;
        a.y -= ny * overlap;
        b.x += nx * overlap;
        b.y += ny * overlap;
        const impulse = Math.min(52, overlap * 0.35);
        a.vx -= nx * impulse;
        a.vy -= ny * impulse;
        b.vx += nx * impulse;
        b.vy += ny * impulse;
      }
    }
  }

  updateMining(delta) {
    this.laserTarget = null;
    this.laserAimPoint = null;
    this.updateMouseAimState();
    if (this.landingIsland) {
      this.stopLaserAudio();
      return;
    }
    if (!this.isMiningInputActive()) {
      this.stopLaserAudio();
      return;
    }
    const miningHit = this.findMiningTarget();
    if (!miningHit) {
      if (this.mouseAimWorld) {
        this.laserAimPoint = this.getClampedLaserAimPoint(this.mouseAimWorld);
        this.startLaserAudio();
      } else {
        this.stopLaserAudio();
      }
      return;
    }

    const { asteroid, hit } = miningHit;
    this.laserTarget = { x: hit.x, y: hit.y, data: asteroid.data };
    this.laserAimPoint = this.mouseAimWorld
      ? this.getClampedLaserAimPoint(this.mouseAimWorld)
      : this.getClampedLaserAimPoint({ x: hit.x, y: hit.y });
    if (!this.canMineAsteroid(asteroid)) {
      this.laserTarget = null;
      this.laserAimPoint = this.getClampedLaserAimPoint({ x: hit.x, y: hit.y });
      this.stopLaserAudio();
      this.showMineBlocked(asteroid);
      return;
    }

    this.startLaserAudio();
    this.mineTick -= delta;
    if (this.mineTick <= 0) {
      this.mineTick = 0.12;
      this.game.audio.playAsteroidHit();
      if (asteroid.getMassRatio() < 0.45) this.game.audio.playAsteroidCrack();
      this.spawnHitParticles(hit.x, hit.y, asteroid.data.accent);
    }

    const power = (gameBalance.mining.asteroidMiningPowerBase ?? 0.85)
      + this.stats.miningPower * (gameBalance.mining.asteroidMiningPowerScale ?? 0.78);
    const broken = asteroid.mineCircle(hit.x, hit.y, ASTEROID_CHIP_BRUSH_RADIUS, power, delta);
    if (broken.length) {
      this.collectAsteroidChips(asteroid, broken);
      this.spawnHitParticles(hit.x, hit.y, asteroid.data.accent);
      if (asteroid.shouldSplitFromChipping() && this.splitAsteroid(asteroid)) {
        this.stopLaserAudio();
        return;
      }
    }

    if (asteroid.isDepleted()) {
      this.breakAsteroid(asteroid);
      this.removeAsteroid(asteroid);
      this.stopLaserAudio();
    }
  }

  canMineAsteroid(asteroid) {
    const requiredPower = asteroid?.data?.miningPowerRequired ?? 0;
    return this.stats.miningPower + 0.001 >= requiredPower;
  }

  showMineBlocked(asteroid) {
    if (!asteroid || this.mineBlockedCooldown > 0) return;
    this.mineBlockedCooldown = 0.85;
    const requiredPower = asteroid.data?.miningPowerRequired ?? 0;
    const currentPower = this.stats.miningPower ?? 0;
    this.game.ui.showToast(
      `${asteroid.data?.name || 'Asteroid'} needs Laser Power ${requiredPower.toFixed(1)} (${currentPower.toFixed(1)} now)`,
      'danger',
      1800,
    );
    this.addFloatingText(asteroid.x, asteroid.y - asteroid.radius, 'Upgrade miner', {
      color: '#ff756f',
      rarity: 'rare',
    });
    this.game.audio.playError();
  }

  updateDroneCombat(delta) {
    const weaponSelected = this.isWeaponToolSelected();
    if (!weaponSelected && !this.combatDrone.projectiles.length) return;
    const threats = this.spaceEnemies;
    this.combatDrone.update(delta, this.getDroneAnchor(), {
      threats,
      onHit: (target, projectile, damage) => this.handleDroneHit(target, projectile, damage),
    });
    if (!weaponSelected || !this.game.input.actions.justPressed.attack || this.landingIsland) return;
    this.combatDrone.tryShoot({
      anchor: this.getDroneAnchor(),
      aimPoint: this.getDroneAimPoint(),
      threats,
      onShoot: () => this.game.audio.playDroneShot?.(),
    });
  }

  getDroneAnchor() {
    return {
      x: this.ship.x,
      y: this.ship.y,
      angle: this.ship.angle,
      droneSide: -1,
    };
  }

  getDroneAimPoint() {
    if (this.mouseAimWorld) return this.mouseAimWorld;
    return {
      x: this.ship.x + Math.cos(this.ship.angle) * 560,
      y: this.ship.y + Math.sin(this.ship.angle) * 560,
    };
  }

  handleDroneHit(target, projectile, damage) {
    if (!target) return;
    this.game.audio.playDroneHit?.();
    this.spawnHitParticles(projectile.x, projectile.y, target.accent || '#66d8e8');
    target.takeDamage?.(damage);
  }

  updateOnFootDroneCombat(delta) {
    const weaponSelected = this.isWeaponToolSelected();
    if (!weaponSelected && !this.combatDrone.projectiles.length) return;
    const anchor = this.getIslandDroneAnchor();
    const threats = [];
    this.combatDrone.update(delta, anchor, {
      threats,
      onHit: (target, projectile, damage) => this.handleDroneHit(target, projectile, damage),
    });
    if (
      !weaponSelected
      || !this.game.input.actions.justPressed.attack
      || this.game.ui.modalLayer?.children.length
    ) return;
    this.combatDrone.tryShoot({
      anchor,
      aimPoint: this.getIslandDroneAimPoint(),
      threats,
      onShoot: () => this.game.audio.playDroneShot?.(),
    });
  }

  getIslandDroneAnchor() {
    if (!this.activeIsland || !this.islandPlayer) return this.getDroneAnchor();
    const world = this.localToActiveIslandWorld(this.islandPlayer.centerX, this.islandPlayer.centerY - 4);
    return {
      x: world.x,
      y: world.y,
      facing: this.islandPlayer.facing,
      droneSide: -1,
    };
  }

  getIslandDroneAimPoint() {
    if (!this.activeIsland || !this.islandPlayer) return this.getDroneAimPoint();
    const aim = this.getIslandAimPoint();
    return this.localToActiveIslandWorld(aim.x, aim.y);
  }

  removeAsteroid(target) {
    const index = this.asteroids.indexOf(target);
    if (index >= 0) this.asteroids.splice(index, 1);
    this.releaseAsteroid(target);
  }

  splitAsteroid(asteroid) {
    const result = this.fragmentation.spawn({
      asteroid,
      asteroids: this.asteroids,
      acquireAsteroid: (options) => this.acquireAsteroid(options),
    });
    if (!result.didFragment) return false;
    this.spawnBurst(asteroid.x, asteroid.y, asteroid.data.accent, 14 + result.childCount * 4, 160);
    this.game.audio.playAsteroidCrack();
    this.game.audio.playAsteroidBreak();
    this.addScreenShake(0.22 + result.childCount * 0.08);
    this.removeAsteroid(asteroid);
    this.resolveAsteroidSpacing();
    return true;
  }

  startLaserAudio() {
    if (this.laserWasActive) return;
    this.laserWasActive = true;
    this.game.audio.playLaserStart();
    this.game.audio.startLaserLoop();
  }

  stopLaserAudio() {
    if (!this.laserWasActive) return;
    this.laserWasActive = false;
    this.game.audio.stopLaserLoop();
  }

  updateEngineAudio() {
    const moving = Math.hypot(this.game.input.moveVector.x, this.game.input.moveVector.y) > 0.12;
    if (moving && !this.engineBoosting) {
      this.engineBoosting = true;
      this.game.audio.startEngineBoost();
      return;
    }
    if (!moving && this.engineBoosting) {
      this.engineBoosting = false;
      this.game.audio.stopEngineBoost();
    }
  }

  findMiningTarget() {
    if (this.mouseAimWorld && document.documentElement.dataset.inputMode !== 'touch') {
      return this.mouseAimHit || this.findMiningRayTarget(this.mouseAimWorld);
    }
    return this.findNearestMiningTarget();
  }

  findMiningRayTarget(aimPoint) {
    const end = this.getClampedLaserAimPoint(aimPoint);
    let best = null;
    let bestDistance = Infinity;
    const rangeLimitSq = (this.stats.miningRange + 80) ** 2;
    for (let index = 0; index < this.asteroids.length; index += 1) {
      const asteroid = this.asteroids[index];
      if (this.distanceToShipSq(asteroid) > rangeLimitSq + asteroid.radius * asteroid.radius) continue;
      const hit = asteroid.raycast(this.ship.x, this.ship.y, end.x, end.y);
      if (!hit || hit.distance >= bestDistance) continue;
      best = { asteroid, hit };
      bestDistance = hit.distance;
    }
    return best;
  }

  findNearestMiningTarget() {
    let closest = null;
    let closestDistanceSq = Infinity;
    const rangeSq = this.stats.miningRange * this.stats.miningRange;
    for (let index = 0; index < this.asteroids.length; index += 1) {
      const asteroid = this.asteroids[index];
      const distanceSq = this.distanceToShipSq(asteroid);
      if (distanceSq < rangeSq && distanceSq < closestDistanceSq) {
        const hit = asteroid.raycast(this.ship.x, this.ship.y, asteroid.x, asteroid.y)
          || { x: asteroid.x, y: asteroid.y, data: asteroid.data, distance: Math.sqrt(distanceSq) };
        closest = { asteroid, hit };
        closestDistanceSq = distanceSq;
      }
    }
    return closest;
  }

  updateMouseAimState() {
    this.mouseAimWorld = null;
    this.mouseAimTarget = null;
    this.mouseAimHit = null;
    const controllerAim = this.getControllerShipAimWorld();
    if (controllerAim) {
      this.mouseAimWorld = controllerAim;
      this.mouseAimHit = this.findMiningRayTarget(this.mouseAimWorld);
      this.mouseAimTarget = this.mouseAimHit?.asteroid || this.findMouseAimTarget(this.mouseAimWorld);
      return;
    }
    const pointer = this.game.input.mousePointer;
    if (!pointer?.inside || pointer.source !== 'canvas') return;
    if (document.documentElement.dataset.inputMode === 'touch') return;
    this.mouseAimWorld = this.screenToWorld(pointer.canvasX, pointer.canvasY);
    this.mouseAimHit = this.findMiningRayTarget(this.mouseAimWorld);
    this.mouseAimTarget = this.mouseAimHit?.asteroid || this.findMouseAimTarget(this.mouseAimWorld);
  }

  getControllerShipAimWorld() {
    if (!this.game.input.isControllerActive?.()) return null;
    const aim = this.game.input.aimVector || { x: 0, y: 0 };
    const magnitude = Math.hypot(aim.x, aim.y);
    if (magnitude < 0.12) return null;
    const range = this.stats?.miningRange || 420;
    const distance = Math.max(72, range * Math.min(1, magnitude));
    return {
      x: this.ship.x + (aim.x / magnitude) * distance,
      y: this.ship.y + (aim.y / magnitude) * distance,
    };
  }

  screenToWorld(screenX, screenY) {
    const viewport = this.game.viewport || { width: 0, height: 0 };
    const scale = Math.max(0.1, this.getActiveViewScale());
    const unscaledX = viewport.width * 0.5 + (screenX - viewport.width * 0.5) / scale;
    const unscaledY = viewport.height * 0.5 + (screenY - viewport.height * 0.5) / scale;
    return {
      x: unscaledX + this.camera.x - viewport.width * 0.5 - this.camera.shakeX,
      y: unscaledY + this.camera.y - viewport.height * 0.5 - this.camera.shakeY,
    };
  }

  getClampedLaserAimPoint(worldPoint) {
    const dx = worldPoint.x - this.ship.x;
    const dy = worldPoint.y - this.ship.y;
    const distance = Math.hypot(dx, dy) || 1;
    const clampedDistance = Math.min(distance, this.stats.miningRange);
    return {
      x: this.ship.x + (dx / distance) * clampedDistance,
      y: this.ship.y + (dy / distance) * clampedDistance,
    };
  }

  findMouseAimTarget(worldPoint) {
    let best = null;
    let bestScore = Infinity;
    const rangeSq = this.stats.miningRange * this.stats.miningRange;
    const snapRadius = gameBalance.mining.mouseAimSnapRadius || 18;
    for (let index = 0; index < this.asteroids.length; index += 1) {
      const asteroid = this.asteroids[index];
      if (this.distanceToShipSq(asteroid) > rangeSq + asteroid.radius * asteroid.radius) continue;
      const dx = asteroid.x - worldPoint.x;
      const dy = asteroid.y - worldPoint.y;
      const hoverDistance = Math.hypot(dx, dy);
      const surfaceDistance = hoverDistance - asteroid.radius;
      if (surfaceDistance > snapRadius || !asteroid.containsWorldPoint(worldPoint.x, worldPoint.y, snapRadius)) continue;
      const score = Math.max(0, surfaceDistance) + hoverDistance * 0.02;
      if (score < bestScore) {
        best = asteroid;
        bestScore = score;
      }
    }
    return best;
  }

  breakAsteroid(asteroid) {
    this.stats.asteroidsMined += 1;
    this.game.state.stats ||= {};
    this.game.state.stats.totalAsteroidsMined = (this.game.state.stats.totalAsteroidsMined || 0) + 1;
    this.game.systems.achievements.record('asteroidMined', { asteroidType: asteroid.type });
    if (asteroid.data.rarity === 'rare' || asteroid.data.rarity === 'epic') this.stats.rareFinds += 1;
    asteroid.getDropPayload(asteroid.dropScale * 0.12).forEach((drop, index) => {
      const material = this.game.systems.materials.getMaterial(drop.materialId);
      if (
        this.stats.precisionCutter > 0
        && ['rare', 'epic'].includes(material?.rarity)
        && Math.random() < 0.08 * this.stats.precisionCutter
      ) {
        drop.amount += 1;
      }
      this.pickups.push(this.acquirePickup({
        materialId: drop.materialId,
        amount: drop.amount,
        x: asteroid.x + Math.cos(index * 2.2) * 16,
        y: asteroid.y + Math.sin(index * 2.2) * 16,
        seed: Math.random(),
        material,
      }));
    });
    this.spawnBurst(asteroid.x, asteroid.y, asteroid.data.accent, 16);
    this.game.audio.playAsteroidBreak();
    if (asteroid.data.explodesOnBreak) this.explodeAsteroid(asteroid);
    this.addScreenShake(asteroid.data.rarity === 'rare' || asteroid.data.rarity === 'epic' ? 0.48 : 0.35);
    if (asteroid.data.rarity === 'rare' || asteroid.data.rarity === 'epic') this.rareFindBurst(asteroid.x, asteroid.y, asteroid.data.accent);
  }

  collectAsteroidChips(asteroid, brokenCells) {
    const grouped = new Map();
    brokenCells.forEach((cell) => {
      if (!cell.materialId) return;
      const entry = grouped.get(cell.materialId) || {
        count: 0,
        yieldScale: cell.yieldScale || 0.25,
        x: cell.x,
        y: cell.y,
        color: cell.color || asteroid.data.accent,
      };
      entry.count += 1;
      entry.x = (entry.x + cell.x) * 0.5;
      entry.y = (entry.y + cell.y) * 0.5;
      grouped.set(cell.materialId, entry);
    });

    let index = 0;
    for (const [materialId, entry] of grouped.entries()) {
      let amount = Math.max(1, Math.round(entry.count * entry.yieldScale));
      const material = this.game.systems.materials.getMaterial(materialId);
      if (
        this.stats.precisionCutter > 0
        && ['rare', 'epic'].includes(material?.rarity)
        && Math.random() < 0.05 * this.stats.precisionCutter
      ) {
        amount += 1;
      }
      this.pickups.push(this.acquirePickup({
        materialId,
        amount,
        x: entry.x + Math.cos(index * 2.1) * 8,
        y: entry.y + Math.sin(index * 2.1) * 8,
        seed: Math.random(),
        material,
      }));
      index += 1;
    }
  }

  acquirePickup(options) {
    const pickup = this.pickupPool.pop() || new MineralPickup();
    return pickup.reset(options);
  }

  releasePickup(pickup) {
    pickup.active = false;
    if (this.pickupPool.length < (gameBalance.mining.maxPickupPool || 80)) this.pickupPool.push(pickup);
  }

  explodeAsteroid(asteroid) {
    this.spawnBurst(asteroid.x, asteroid.y, '#ff8f3d', 34, 210);
    this.addScreenShake(0.55);
    if (this.distanceToShipSq(asteroid) < (asteroid.radius + 90) ** 2) {
      if (this.tryAbsorbCollision()) {
        this.game.ui.showToast('Shield absorbed blast', 'success');
        this.game.audio.playSuccess();
        return;
      }
      if (this.isInvincible()) return;
      this.stats.hull = Math.max(0, this.stats.hull - 14);
      this.ship.applyKnockback(asteroid.x, asteroid.y, 260);
      if (this.stats.hull <= 0) this.crash();
    }
  }

  updatePickups(delta) {
    for (let index = 0; index < this.pickups.length; index += 1) this.pickups[index].update(delta);
    this.applyMagnetToPickups(delta);
    const cullDistanceSq = gameBalance.mining.pickupCullDistance ** 2;
    let writeIndex = 0;
    for (let index = 0; index < this.pickups.length; index += 1) {
      const pickup = this.pickups[index];
      if (this.distanceToShipSq(pickup) > cullDistanceSq) {
        this.releasePickup(pickup);
        continue;
      }
      if (!this.collidesWithShip(pickup)) {
        this.pickups[writeIndex] = pickup;
        writeIndex += 1;
        continue;
      }
      const cargoResult = this.game.systems.inventory.addToRunCargo(pickup.materialId, pickup.amount, {
        capacity: this.stats.cargoCapacity,
      });
      if (!cargoResult.ok) {
        if (this.cargoFullToastReady) {
          this.cargoFullToastReady = false;
          this.game.ui.showToast('Cargo Full', 'danger');
          this.game.audio.playCargoFull();
          this.hud.cargoBar?.classList.add('is-shaking');
          window.setTimeout(() => {
            this.cargoFullToastReady = true;
            this.hud.cargoBar?.classList.remove('is-shaking');
          }, 1200);
        }
        this.pickups[writeIndex] = pickup;
        writeIndex += 1;
        continue;
      }
      this.runCargo = cargoResult.cargo;
      this.game.systems.objectives.record('materialCollected', {
        materialId: pickup.materialId,
        amount: pickup.amount,
      });
      this.runCargoCount += pickup.amount;
      this.runCargoWeight = cargoResult.currentWeight;
      this.stats.cargo = Math.ceil(this.runCargoWeight);
      const material = this.game.systems.materials.getMaterial(pickup.materialId);
      this.addFloatingText(
        pickup.x,
        pickup.y,
        `+${pickup.amount} ${this.game.systems.materials.getDisplayName(pickup.materialId)}`,
        { color: material?.color || '#fff2cf', rarity: material?.rarity || 'common' },
      );
      this.game.audio.playMineralPickup();
      if (material && material.rarity !== 'common') {
        this.game.systems.achievements.record('rareFind', { materialId: pickup.materialId, rarity: material.rarity });
      }
      if (material?.rarity === 'rare' || material?.rarity === 'epic') {
        this.game.audio.playRareFind();
        this.rareFindBurst(pickup.x, pickup.y, material.color);
      }
      this.releasePickup(pickup);
    }
    this.pickups.length = writeIndex;
  }

  updateNavigation(delta) {
    const navigation = this.game.systems.navigation;
    navigation.getLocations({ tab: 'locations', includeLocked: true }).forEach((location) => {
      if (navigation.isDiscovered(location.id)) return;
      const distance = navigation.getDistanceTo(location, this.ship);
      if (distance <= 240) navigation.discoverLocation(location.id);
    });

    if (!navigation.isUnlocked()) {
      this.hud?.gpsPanel?.classList.add('is-hidden');
      return;
    }

    const destination = navigation.getSelectedDestination();
    if (!destination) {
      this.hud?.gpsPanel?.classList.add('is-hidden');
      return;
    }

    const dx = destination.worldPosition.x - this.ship.x;
    const dy = destination.worldPosition.y - this.ship.y;
    const distance = Math.hypot(dx, dy);
    this.hud.gpsPanel.classList.remove('is-hidden');
    this.hud.gpsArrow.style.transform = `rotate(${Math.atan2(dy, dx) + Math.PI / 2}rad)`;
    this.setHudText('gpsName', this.hud.gpsName, destination.name);
    this.setHudText('gpsDistance', this.hud.gpsDistance, `${Math.round(distance)}m`);
    const warning = this.stats.fuel < destination.recommendedFuel * 0.42 ? 'Fuel risk' : '';
    this.setHudText('gpsWarning', this.hud.gpsWarning, warning);

    this.gpsPingTimer -= delta;
    if (distance < 560 && this.gpsPingTimer <= 0) {
      this.gpsPingTimer = 2.2;
      this.game.audio.playGpsPing?.();
    }

    if (distance <= 190 && this.destinationReachedId !== destination.id) {
      this.destinationReachedId = destination.id;
      navigation.discoverLocation(destination.id, { notify: false });
      this.game.ui.showToast(`Destination Reached: ${destination.name}`, 'success', 2400);
      this.game.audio.playDestinationReached?.();
    }
  }

  updateLanding() {
    if (this.islandMode !== 'flight') return;
    let nearest = null;
    let nearestDistanceSq = Infinity;
    let strongestGravityIsland = null;
    let strongestGravity = 0;
    let strongestGravityDistanceSq = Infinity;
    for (const island of this.rockIslands) {
      const distanceSq = island.distanceSqTo(this.ship);
      const gravityStrength = island.getGravityFieldStrength(this.ship);
      if (
        gravityStrength > 0
        && (
          gravityStrength > strongestGravity
          || (gravityStrength === strongestGravity && distanceSq < strongestGravityDistanceSq)
        )
      ) {
        strongestGravityIsland = island;
        strongestGravity = gravityStrength;
        strongestGravityDistanceSq = distanceSq;
      }
      if (island.isNearLandingZone(this.ship) && distanceSq < nearestDistanceSq) {
        nearest = island;
        nearestDistanceSq = distanceSq;
      }
    }
    if (nearest && this.landingIsland !== nearest) {
      this.game.ui.showToast('Landing Zone Detected', 'success', 1300);
      this.game.audio.playGpsPing?.();
    }
    this.landingTargetPreview = nearest ? this.getLandingTargetForIsland(nearest) : null;
    this.gravityIsland = nearest || strongestGravityIsland;
    this.gravityFieldStrength = nearest ? 1 : strongestGravity;
    if (this.gravityIsland && !this.spaceObjectsSuspended && this.backgroundAsteroidSourceId !== this.gravityIsland.id) {
      this.backgroundAsteroids = this.createIslandBackgroundAsteroids(this.gravityIsland);
      this.backgroundAsteroidSourceId = this.gravityIsland.id;
    } else if (!this.gravityIsland && !this.spaceObjectsSuspended && this.backgroundAsteroids.length) {
      this.backgroundAsteroids = [];
      this.backgroundAsteroidSourceId = '';
    }
    this.landingIsland = nearest;
    this.hud?.landingPrompt?.classList.toggle('is-hidden', !nearest);
    if (nearest) {
      this.setHudText('landingPrompt', this.hud.landingPrompt, `Aim tile + Press E/A to Land - ${nearest.name}`);
      if (this.mineButtonLabel) this.mineButtonLabel.textContent = 'Land';
      if (this.mineButtonIcon) this.mineButtonIcon.textContent = 'L';
      this.mineButton?.classList.add('is-land-mode');
      const actions = this.game.input.actions;
      const useTap = actions.justPressed.primaryUse && document.documentElement.dataset.inputMode === 'touch';
      if (actions.justPressed.interact || actions.justPressed.confirm || useTap) this.landOnIsland(nearest, this.landingTargetPreview);
      return;
    }
    if (this.mineButtonLabel) this.mineButtonLabel.textContent = 'Use';
    if (this.mineButtonIcon) this.mineButtonIcon.textContent = 'U';
    this.mineButton?.classList.remove('is-land-mode');
  }

  getLandingTargetForIsland(island) {
    if (!island?.terrain) return null;
    const shipLocal = island.worldToLocal(this.ship.x, this.ship.y);
    const pointer = this.game.input.mousePointer;
    let aimLocal = null;
    const controllerAim = this.getControllerShipAimWorld();
    if (controllerAim) {
      aimLocal = island.worldToLocal(controllerAim.x, controllerAim.y);
    } else if (pointer?.inside && pointer.source === 'canvas' && document.documentElement.dataset.inputMode !== 'touch') {
      const aimWorld = this.screenToWorld(pointer.canvasX, pointer.canvasY);
      aimLocal = island.worldToLocal(aimWorld.x, aimWorld.y);
    } else {
      const fallbackAngle = island.getAngleForLocal(shipLocal.x, shipLocal.y);
      aimLocal = island.getSurfaceLocalAtAngle(fallbackAngle, -island.landingZoneRadius);
    }

    const dx = aimLocal.x - shipLocal.x;
    const dy = aimLocal.y - shipLocal.y;
    const distance = Math.hypot(dx, dy) || 1;
    const castDistance = Math.max(distance + 160, island.gravityFieldRadius * 0.9);
    const end = {
      x: shipLocal.x + (dx / distance) * castDistance,
      y: shipLocal.y + (dy / distance) * castDistance,
    };
    const hit = island.terrain.raycast(shipLocal.x, shipLocal.y, end.x, end.y)
      || this.getFallbackLandingHit(island, shipLocal);
    if (!hit) return null;
    return this.createLandingTargetFromHit(island, hit);
  }

  getFallbackLandingHit(island, shipLocal) {
    const angle = island.getAngleForLocal(shipLocal.x, shipLocal.y);
    const local = island.getSurfaceLocalAtAngle(angle, 0);
    const { col, row } = island.terrain.cellFromWorld(local.x, local.y);
    const material = island.terrain.getCell(col, row) || 1;
    return {
      x: local.x,
      y: local.y,
      col,
      row,
      material,
      data: TERRAIN_MATERIALS[material] || TERRAIN_MATERIALS[1],
    };
  }

  createLandingTargetFromHit(island, hit) {
    const size = island.terrain.cellSize || 20;
    const local = {
      x: hit.col * size + size * 0.5,
      y: hit.row * size + size * 0.5,
    };
    return {
      island,
      local,
      hit: {
        ...hit,
        x: local.x,
        y: local.y,
      },
      angle: island.getAngleForLocal(local.x, local.y),
    };
  }

  updateDockInput() {
    if (this.cargoDumping || this.ending) return;
    if (this.distanceFromStation * this.distanceFromStation > DOCK_RADIUS_SQ) return;
    const actions = this.game.input.actions;
    if (actions.justPressed.interact || actions.justPressed.confirm) this.dock();
  }

  handleOutOfFuelReturn() {
    if (this.isGodMode()) {
      this.stats.fuel = this.stats.maxFuel;
      return false;
    }
    if (this.stats.fuel > 0 || this.ending || this.outOfFuelReturnQueued) return false;
    if (this.distanceFromStation * this.distanceFromStation <= DOCK_RADIUS_SQ && this.runCargoCount > 0) {
      this.outOfFuelReturnQueued = true;
      this.game.ui.showToast('Out of fuel. Docking after cargo drop...', 'danger', 2400);
      this.game.audio.playLowFuelWarning();
      this.beginCargoDump({ returnToStation: true, summaryType: 'outOfFuel' });
      return true;
    }
    this.queueOutOfFuelReturn();
    return true;
  }

  landOnIsland(island, landingTarget = null) {
    if (this.ending || this.islandMode !== 'flight') return;
    const target = landingTarget?.island === island ? landingTarget : this.getLandingTargetForIsland(island);
    if (target?.local) island.setLandingTargetLocal(target.local);
    else island.setLandingAngleFromWorld(this.ship.x, this.ship.y);
    const anchorLocal = island.getLandingBaseLocal();
    const anchorWorld = island.localToWorld(anchorLocal.x, anchorLocal.y);
    this.islandLandingTarget = target;
    this.islandLandingAnchor = {
      island,
      local: { x: anchorLocal.x, y: anchorLocal.y },
      world: { x: anchorWorld.x, y: anchorWorld.y },
    };
    this.islandViewRotation = 0;
    this.islandRotationTarget = 0;
    this.islandRotationSettling = false;
    this.islandMode = 'landing';
    this.activeIsland = island;
    this.islandLandingTimer = 0;
    this.landingIsland = island;
    this.landingTargetPreview = target;
    this.camera.shake = 0;
    this.camera.shakeX = 0;
    this.camera.shakeY = 0;
    this.ship.vx = 0;
    this.ship.vy = 0;
    this.suspendSpaceObjectsForIsland(island);
    this.stopLaserAudio();
    this.game.audio.playLandShip?.();
    this.game.systems.navigation.discoverLocation(island.id, { notify: false });
    this.game.state.islands ||= { visited: {} };
    this.game.state.islands.visited ||= {};
    this.game.state.islands.visited[island.id] = true;
    this.game.ui.showToast(`Landing on ${island.name}`, 'success', 1400);
  }

  localToActiveIslandWorld(localX, localY, viewRotation = this.getIslandViewRotation()) {
    const island = this.activeIsland;
    const anchor = this.islandLandingAnchor;
    if (island && anchor?.island === island) {
      const dx = localX - anchor.local.x;
      const dy = localY - anchor.local.y;
      const cos = Math.cos(viewRotation);
      const sin = Math.sin(viewRotation);
      return {
        x: anchor.world.x + dx * cos - dy * sin,
        y: anchor.world.y + dx * sin + dy * cos,
      };
    }
    return island
      ? island.localToWorldRotated(localX, localY, viewRotation)
      : { x: localX, y: localY };
  }

  bakeLandingAnchorIntoIsland() {
    const island = this.activeIsland;
    const anchor = this.islandLandingAnchor;
    if (!island || anchor?.island !== island) return;
    const center = island.getCenterLocal();
    const centerWorld = this.localToActiveIslandWorld(center.x, center.y, this.getIslandViewRotation());
    island.x = centerWorld.x;
    island.y = centerWorld.y;
    this.islandLandingAnchor = null;
  }

  updateIntegratedIsland(delta) {
    this.distanceFromStation = this.getDistanceFromStation();
    this.updateZone(delta);
    this.updateNavigation(delta);
    if (this.islandMode === 'landing') {
      this.updateIslandViewRotation(delta);
      this.updateIslandLanding(delta);
    } else {
      if (this.islandMode === 'onIsland') this.updateIslandOnFoot(delta);
      else if (this.islandMode === 'boarding') this.updateIslandBoarding(delta);
      this.updateIslandPlacedFlags(delta);
      this.updatePlacedCraftingStation(delta);
      this.updatePlacedFurnace(delta);
      this.updateIslandViewRotation(delta);
      if (this.islandMode === 'onIsland') this.updateOnFootDroneCombat(delta);
    }
    this.updateViewScale(delta);
    this.updateCamera(delta);
    this.updateParticles(delta);
    this.updateIslandFloatingText(delta);
    this.updateHud();
  }

  updateIslandLanding(delta) {
    if (!this.activeIsland) {
      this.islandMode = 'flight';
      this.resumeSpaceObjectsAfterIsland();
      return;
    }
    const dt = Math.min(delta, 0.05);
    this.islandLandingTimer += dt;
    const parkLocal = this.activeIsland.getShipParkLocal();
    const target = this.localToActiveIslandWorld(parkLocal.x, parkLocal.y, this.getIslandViewRotation());
    const dx = target.x - this.ship.x;
    const dy = target.y - this.ship.y;
    const distance = Math.hypot(dx, dy);
    const approachSpeed = distance > 620 ? 0.72 : (distance > 220 ? 0.86 : 1.02);
    const approach = 1 - Math.exp(-dt * approachSpeed);
    this.ship.x += dx * approach;
    this.ship.y += dy * approach;
    this.ship.vx = 0;
    this.ship.vy = 0;
    const landingWorldAngle = normalizeAngle(this.activeIsland.landingAngle + this.getIslandViewRotation());
    this.ship.angle = normalizeAngle(
      this.ship.angle + angleDifference(this.ship.angle, landingWorldAngle) * Math.min(1, dt * ISLAND_LANDING_SHIP_ROTATION_SPEED),
    );
    this.hud?.landingPrompt?.classList.remove('is-hidden');
    this.setHudText('landingPrompt', this.hud.landingPrompt, 'Landing sequence...', true);
    const rotationReady = Math.abs(angleDifference(this.islandViewRotation, this.getIslandTargetViewRotation())) < ISLAND_LANDING_READY_ROTATION;
    const shipReady = Math.abs(angleDifference(this.ship.angle, landingWorldAngle)) < ISLAND_LANDING_READY_SHIP_ANGLE;
    const hasPlayedEnough = this.islandLandingTimer >= ISLAND_LANDING_MIN_TIME;
    const shouldFinish = hasPlayedEnough
      && distance < ISLAND_LANDING_READY_DISTANCE
      && rotationReady
      && shipReady;
    if (shouldFinish || this.islandLandingTimer > ISLAND_LANDING_MAX_TIME) this.finishIslandLanding();
  }

  finishIslandLanding() {
    if (!this.activeIsland) return;
    const parkLocal = this.activeIsland.getShipParkLocal();
    const target = this.localToActiveIslandWorld(parkLocal.x, parkLocal.y, this.getIslandViewRotation());
    this.ship.x = target.x;
    this.ship.y = target.y;
    this.ship.vx = 0;
    this.ship.vy = 0;
    this.ship.angle = normalizeAngle(this.activeIsland.landingAngle + this.getIslandViewRotation());
    this.bakeLandingAnchorIntoIsland();
    const exit = this.activeIsland.getPlayerExitLocal();
    this.islandPlayer = new IslandPlayer({ x: exit.x, y: exit.y });
    this.seedPlanetPlayer(this.activeIsland, this.islandPlayer);
    this.islandRotationTarget = this.islandViewRotation;
    this.islandRotationSettling = false;
    this.islandFreefall = false;
    this.islandGravityRecovery = false;
    this.islandGravityRecoveryBlend = 0;
    this.islandMode = 'onIsland';
    this.shipSmoke?.clear();
    this.game.audio.playExitShip?.();
    this.game.ui.showToast('Landed. Press E/A near the ship to board.', 'success', 1800);
  }

  updateIslandOnFoot(delta) {
    const island = this.activeIsland;
    const player = this.islandPlayer;
    if (!island || !player) return;
    const actions = this.game.input.actions;
    if (actions.justPressed.crafting) this.tryOpenCraftingStation();
    const keyboardJump = actions.justPressed.up
      && (this.game.input.keys.has('w') || this.game.input.keys.has('W') || this.game.input.keys.has('ArrowUp'));
    const spaceJump = actions.justPressed.jump && this.game.input.keys.has(' ');
    this.updatePlanetIslandPlayer(delta, {
      moveX: this.game.input.moveVector.x,
      jumpPressed: actions.justPressed.jump || keyboardJump || spaceJump,
    });
    this.updateGravityStabilizerInput(actions);
    this.islandAimPreview = this.getIslandTerrainPreview({ updateFacing: false });
    this.flagPlacementPreview = this.isFlagToolSelected() ? this.getFlagPlacementPreview() : null;
    this.furnacePlacementPreview = this.isFurnaceToolSelected() ? this.getFurnacePlacementPreview() : null;
    this.craftingStationPlacementPreview = this.isCraftingStationToolSelected() ? this.getCraftingStationPlacementPreview() : null;
    if (actions.justPressed.placeFlag) this.placeFlagOnIsland(this.flagPlacementPreview);
    if (actions.justPressed.placeFurnace) this.placeFurnaceOnIsland(this.furnacePlacementPreview);
    if (actions.justPressed.placeCraftingStation) this.placeCraftingStationOnIsland(this.craftingStationPlacementPreview);
    if (actions.mine) this.updateIslandTerrainMining(delta, this.islandAimPreview);
    else this.stopIslandTerrainLaser();
    if (actions.justPressed.interact || actions.justPressed.confirm) {
      const nearbyFurnace = this.getNearbyFurnace(player);
      if (this.placedCraftingStation?.overlapsPlayer(player)) {
        this.showCraftingModal();
      } else if (nearbyFurnace) {
        this.showFurnaceModal(nearbyFurnace.id);
      } else if (island.isPlayerNearShip(player)) {
        this.handleShipInteract();
      }
    }
    this.updateIslandPrompt();
  }

  updateIslandFreefall(delta) {
    const island = this.activeIsland;
    const player = this.islandPlayer;
    if (!island || !player) return;
    const dt = Math.min(delta, 0.05);
    const landing = island.getLandingLocal();
    const dx = landing.x - player.centerX;
    const dy = (landing.y - 80) - player.centerY;
    const distance = Math.hypot(dx, dy) || 1;
    const move = this.game.input.moveVector;
    player.vx += (move.x * 280 + (dx / distance) * 92) * dt;
    player.vy += (move.y * 280 + (dy / distance) * 92) * dt;
    player.vx *= Math.max(0, 1 - dt * 0.7);
    player.vy *= Math.max(0, 1 - dt * 0.7);
    player.x += player.vx * dt;
    player.y += player.vy * dt;
    player.onGround = false;
    if (Math.abs(player.vx) > 8) player.facing = player.vx > 0 ? 1 : -1;
  }

  updateGravityStabilizerInput(actions) {
    if (!this.activeIsland || !this.islandPlayer) return;
    if (!actions.justPressed?.stabilize && !actions.stabilize) return;
    if (actions.justPressed?.stabilize) this.engageIslandGravityStabilizer();
    this.islandRotationSettling = true;
    if (actions.justPressed?.stabilize) {
      this.game.audio.playSuccess?.();
      this.game.ui.showToast('Gravity stabilizer engaged', 'success', 900);
    }
  }

  engageIslandGravityStabilizer() {
    if (!this.activeIsland || !this.islandPlayer) return;
    this.islandRotationTarget = this.getIslandTargetViewRotation();
    this.islandRotationSettling = true;
  }

  isFlagToolSelected() {
    return this.game.input.getSelectedHotbarSlot?.()?.id === 'flag';
  }

  isWeaponToolSelected() {
    return this.game.input.getSelectedHotbarSlot?.()?.id === 'weapon';
  }

  getFlagPlacementPreview() {
    if (!this.activeIsland || !this.islandPlayer) return null;
    const preview = this.getIslandTerrainPreview({ updateFacing: false });
    if (!preview) return null;
    return {
      ...preview,
      canPlace: Boolean(preview.hit),
    };
  }

  placeFlagOnIsland(preview = null) {
    if (this.game.ui.modalLayer?.children.length) return;
    const island = this.activeIsland;
    const player = this.islandPlayer;
    if (!island || !player || this.islandMode !== 'onIsland') return;
    const target = preview || this.getFlagPlacementPreview();
    if (!target?.hit) {
      this.game.audio.playError?.();
      this.game.ui.showToast('Aim the flag at solid ground', 'danger', 1100);
      return;
    }

    this.updateIslandPlayerFacingFromAim(target.rawAimPoint);
    const material = TERRAIN_MATERIALS[target.hit.material] || TERRAIN_MATERIALS[1];
    const pad = island.terrain.createPlacementPad(target.hit.x, target.hit.y, {
      viewRotation: this.getIslandViewRotation(),
      width: 98,
      clearance: 78,
      depth: 46,
      material: target.hit.material,
    });
    const flags = island.placedFlags ||= [];
    if (flags.length >= 24) flags.shift();
    const flag = new PlacedFlag({
      x: pad.x,
      y: pad.y,
      rotation: -this.getIslandViewRotation(),
      color: '#ffd36b',
      accent: material.edge || '#66d8e8',
    });
    flags.push(flag);
    this.flagPlacementPreview = null;
    this.islandTerrainDirty = this.islandTerrainDirty || pad.changed;
    if (this.islandTerrainDirty) {
      this.game.systems.islands.saveTerrain(island.id, island.terrain);
      this.islandTerrainDirty = false;
    }
    this.game.systems.islands.saveFlags(island.id, flags);
    const world = island.localToWorldRotated(pad.x, pad.y, this.getIslandViewRotation());
    this.spawnBurst(world.x, world.y, '#ffd36b', 14, 95);
    this.addFloatingText(world.x, world.y - 24, 'Flag placed', { color: '#ffd36b', rarity: 'common' });
    this.game.audio.playSuccess?.();
  }

  isFurnaceToolSelected() {
    return this.game.input.getSelectedHotbarSlot?.()?.id === 'furnace';
  }

  isCraftingStationToolSelected() {
    return this.game.input.getSelectedHotbarSlot?.()?.id === 'craftingStation';
  }

  getCraftingStationPlacementPreview() {
    if (!this.activeIsland || !this.islandPlayer) return null;
    const preview = this.getIslandTerrainPreview({ updateFacing: false });
    if (!preview?.hit) return preview ? { ...preview, canPlace: false } : null;
    const story = this.getStoryState();
    return {
      ...preview,
      canPlace: Boolean(!story.craftingStationPlaced && this.game.systems.inventory.getStoredAmount('craftingStationKit') > 0),
    };
  }

  placeCraftingStationOnIsland(preview = null) {
    if (this.game.ui.modalLayer?.children.length) return;
    const island = this.activeIsland;
    const player = this.islandPlayer;
    if (!island || !player || this.islandMode !== 'onIsland') return;
    const story = this.getStoryState();
    if (story.craftingStationPlaced || this.placedCraftingStation) {
      this.game.audio.playError?.();
      this.game.ui.showToast('Crafting station is already placed', 'default', 1200);
      return;
    }
    if (this.game.systems.inventory.getStoredAmount('craftingStationKit') <= 0) {
      this.game.audio.playError?.();
      this.game.ui.showToast('No crafting station in inventory', 'danger', 1200);
      return;
    }
    const target = preview || this.getCraftingStationPlacementPreview();
    if (!target?.hit) {
      this.game.audio.playError?.();
      this.game.ui.showToast('Aim the crafting station at solid ground', 'danger', 1200);
      return;
    }

    this.updateIslandPlayerFacingFromAim(target.rawAimPoint);
    const pad = island.terrain.createPlacementPad(target.hit.x, target.hit.y, {
      viewRotation: this.getIslandViewRotation(),
      width: CRAFTING_STATION_WIDTH,
      clearance: CRAFTING_STATION_CLEARANCE,
      depth: CRAFTING_STATION_DEPTH,
      material: target.hit.material,
    });
    this.game.systems.inventory.remove('craftingStationKit', 1, { skipSave: true });
    this.placedCraftingStation = new PlacedCraftingStation({
      x: pad.x,
      y: pad.y,
      rotation: -this.getIslandViewRotation(),
    });
    story.craftingStationPlaced = true;
    story.craftingStation = this.placedCraftingStation.serialize();
    this.craftingStationPlacementPreview = null;
    this.islandTerrainDirty = this.islandTerrainDirty || pad.changed;
    if (this.islandTerrainDirty) {
      this.game.systems.islands.saveTerrain(island.id, island.terrain);
      this.islandTerrainDirty = false;
    }
    this.game.saveGame();
    const world = island.localToWorldRotated(pad.x, pad.y, this.getIslandViewRotation());
    this.spawnBurst(world.x, world.y, '#76f3ff', 18, 105);
    this.addFloatingText(world.x, world.y - 24, 'Crafting station placed', { color: '#76f3ff', rarity: 'common' });
    this.game.audio.playSuccess?.();
    this.startCrashTutorialHint('furnaceHint');
  }

  getFurnacePlacementPreview() {
    if (!this.activeIsland || !this.islandPlayer) return null;
    const preview = this.getIslandTerrainPreview({ updateFacing: false });
    if (!preview?.hit) return preview ? { ...preview, canPlace: false } : null;
    const story = this.getStoryState();
    return {
      ...preview,
      canPlace: Boolean(this.getFurnaceBlueprintCount() > 0),
    };
  }

  placeFurnaceOnIsland(preview = null) {
    if (this.game.ui.modalLayer?.children.length) return;
    const island = this.activeIsland;
    const player = this.islandPlayer;
    if (!island || !player || this.islandMode !== 'onIsland') return;
    const story = this.getStoryState();
    if (this.getFurnaceBlueprintCount() <= 0) {
      this.game.audio.playError?.();
      this.game.ui.showToast('Craft a furnace at the crafting station first', 'danger', 1500);
      this.tryOpenCraftingStation();
      return;
    }
    const target = preview || this.getFurnacePlacementPreview();
    if (!target?.hit) {
      this.game.audio.playError?.();
      this.game.ui.showToast('Aim the furnace at solid ground', 'danger', 1100);
      return;
    }

    this.updateIslandPlayerFacingFromAim(target.rawAimPoint);
    const blueprint = this.consumeFurnaceBlueprint();
    const footprint = PlacedFurnace.getShapeFootprint(blueprint.shape);
    const padWidth = Math.max(STARTER_FURNACE_WIDTH, footprint.baseWidth + (island.terrain?.cellSize || 22) * 1.5);
    const pad = island.terrain.createPlacementPad(target.hit.x, target.hit.y, {
      viewRotation: this.getIslandViewRotation(),
      width: padWidth,
      clearance: STARTER_FURNACE_CLEARANCE,
      depth: STARTER_FURNACE_DEPTH,
      material: target.hit.material,
    });
    const placed = new PlacedFurnace({
      x: pad.x,
      y: pad.y,
      rotation: -this.getIslandViewRotation(),
      shape: blueprint.shape,
    });
    this.placedFurnaces.push(placed);
    this.placedFurnace = this.placedFurnaces[0] || placed;
    story.furnaces ||= [];
    story.furnaces.push({
      ...placed.serialize(),
      blueprintId: blueprint.id,
      name: blueprint.name || 'Starter Furnace',
      active: null,
      queue: [],
      completed: {},
    });
    story.furnacePlaced = true;
    this.furnacePlacementPreview = null;
    this.islandTerrainDirty = this.islandTerrainDirty || pad.changed;
    if (this.islandTerrainDirty) {
      this.game.systems.islands.saveTerrain(island.id, island.terrain);
      this.islandTerrainDirty = false;
    }
    this.game.saveGame();
    const world = island.localToWorldRotated(pad.x, pad.y, this.getIslandViewRotation());
    this.spawnBurst(world.x, world.y, '#ff9f43', 20, 110);
    this.addFloatingText(world.x, world.y - 28, 'Furnace placed', { color: '#ff9f43', rarity: 'rare' });
    this.game.audio.playSuccess?.();
    this.startCrashTutorialHint('smeltingHint');
  }

  getFurnaceBlueprintCount() {
    const story = this.getStoryState();
    const inventoryCount = this.game.systems.inventory.getStoredAmount('starterFurnace');
    return Math.max(inventoryCount, story.furnaceInventory?.length || 0);
  }

  consumeFurnaceBlueprint() {
    const story = this.getStoryState();
    story.furnaceInventory ||= [];
    let blueprint = story.furnaceInventory.shift();
    if (!blueprint) blueprint = this.createDefaultFurnaceBlueprint();
    this.game.systems.inventory.remove('starterFurnace', 1, { skipSave: true });
    return blueprint;
  }

  createDefaultFurnaceBlueprint() {
    const recipe = gameBalance.earlyGame?.crashStart?.furnaceRecipe || {};
    const tileSize = this.activeIsland?.terrain?.cellSize || 22;
    const cells = [];
    [
      [4, 6], [5, 6], [6, 6], [7, 6], [8, 6], [9, 6], [10, 6], [11, 6],
      [4, 12], [5, 12], [6, 12], [7, 12], [8, 12], [9, 12], [10, 12], [11, 12],
      [4, 7], [4, 8], [4, 9], [4, 10],
    ].forEach(([x, y]) => cells.push(this.createCraftCell(x, y, 'stoneOre')));
    for (let index = 0; index < 10; index += 1) {
      cells.push(this.createCraftCell(6 + (index % 5), 8 + Math.floor(index / 5), 'copperShards'));
    }
    cells.push(this.createCraftCell(8, 10, 'fireCore'));
    return {
      id: `furnace-blueprint-${Date.now().toString(36)}`,
      recipeId: recipe.id || 'starterFurnace',
      name: recipe.name || 'Starter Furnace',
      shape: { gridSize: 16, tileSize, cells },
    };
  }

  updatePlacedFurnace(delta) {
    if (!this.crashStart || !this.placedFurnaces.length) return;
    const story = this.getStoryState();
    story.furnaces ||= [];
    this.placedFurnaces.forEach((placed) => {
      const furnaceState = story.furnaces.find((furnace) => furnace.id === placed.id);
      this.tickCrashFurnace(delta, furnaceState, placed);
      placed.update(delta, { active: Boolean(furnaceState?.active) });
    });
    if (this.survivalModalKind === 'furnace') {
      this.furnaceModalRefreshTimer -= delta;
      if (this.furnaceModalRefreshTimer <= 0) {
        this.furnaceModalRefreshTimer = 0.18;
        this.refreshFurnaceModal();
      }
    }
  }

  updatePlacedCraftingStation(delta) {
    if (!this.placedCraftingStation) return;
    this.placedCraftingStation.update(delta);
  }

  tickCrashFurnace(delta, furnace, placedFurnace = this.placedFurnace) {
    if (!furnace) return;
    furnace.queue ||= [];
    furnace.completed ||= {};
    const recipes = gameBalance.earlyGame?.crashStart?.smelting || {};
    if (!furnace.active && furnace.queue.length) {
      const inputId = furnace.queue.shift();
      const recipe = recipes[inputId];
      if (recipe) {
        furnace.active = {
          inputId,
          outputId: recipe.output,
          time: recipe.time,
          elapsed: 0,
        };
        this.game.audio.playFurnaceIgnite?.();
      }
    }
    if (!furnace.active) return;
    furnace.active.elapsed += delta;
    if (furnace.active.elapsed < furnace.active.time) return;
    const outputId = furnace.active.outputId;
    this.game.systems.inventory.add(outputId, 1, { skipSave: true });
    furnace.completed[outputId] = (furnace.completed[outputId] || 0) + 1;
    const material = this.game.systems.materials.getMaterial(outputId);
    const world = this.activeIsland?.localToWorldRotated(placedFurnace.x, placedFurnace.y, this.getIslandViewRotation());
    if (world) {
      this.spawnBurst(world.x, world.y - 20, material?.color || '#ffd36b', 18, 120);
      this.addFloatingText(world.x, world.y - 36, `+1 ${this.game.systems.materials.getDisplayName(outputId)}`, {
        color: material?.color || '#ffd36b',
        rarity: material?.rarity || 'common',
      });
    }
    furnace.active = null;
    this.game.audio.playCraftSuccess?.();
    this.game.saveGame();
    this.startCrashTutorialHint('repairHint');
  }

  queueCrashSmelt(inputId) {
    const story = this.getStoryState();
    const furnace = this.getFurnaceState(this.activeFurnaceId) || story.furnaces?.[0];
    const recipes = gameBalance.earlyGame?.crashStart?.smelting || {};
    if (!furnace || !recipes[inputId]) return false;
    furnace.queue ||= [];
    if (furnace.queue.length + (furnace.active ? 1 : 0) >= 2) {
      this.game.audio.playError?.();
      this.game.ui.showToast('Starter furnace has two slots', 'danger', 1200);
      return false;
    }
    if (!this.game.systems.inventory.remove(inputId, 1, { skipSave: true })) {
      this.game.audio.playError?.();
      this.game.ui.showToast(`Need ${this.game.systems.materials.getDisplayName(inputId)}`, 'danger', 1200);
      return false;
    }
    furnace.queue.push(inputId);
    this.game.audio.playButtonClick?.();
    this.game.saveGame();
    this.refreshFurnaceModal();
    return true;
  }

  getFurnaceState(furnaceId = '') {
    const story = this.getStoryState();
    story.furnaces ||= [];
    if (!furnaceId) return story.furnaces[0] || null;
    return story.furnaces.find((furnace) => furnace.id === furnaceId) || null;
  }

  getNearbyFurnace(player = this.islandPlayer) {
    return this.placedFurnaces.find((furnace) => furnace.overlapsPlayer(player)) || null;
  }

  startCrashTutorialHint(key) {
    if (!this.crashStart || this.crashTutorialHints[key]) return;
    this.crashTutorialHints[key] = true;
    this.game.systems.dialogue.startSet('sparksTutorial', key, {
      speaker: 'Sparks',
      portraitStyle: { tone: 'forge', shape: 'drone' },
      enqueue: true,
    });
  }

  closeSurvivalModal() {
    if (!this.survivalModal) return;
    this.survivalModal = null;
    this.survivalModalKind = '';
    this.game.ui.hideModal();
  }

  createSurvivalModal({ title, subtitle = '', className = '', content = null, actions = [] } = {}) {
    const backdrop = document.createElement('div');
    backdrop.className = `modal-backdrop survival-modal ${className}`.trim();
    const panel = document.createElement('section');
    panel.className = 'survival-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.innerHTML = `
      <header class="survival-panel-header">
        <div>
          <span>Moonrock field kit</span>
          <h1>${title}</h1>
          ${subtitle ? `<p>${subtitle}</p>` : ''}
        </div>
        <button class="survival-close-button" type="button" aria-label="Close">x</button>
      </header>
      <div class="survival-panel-body"></div>
      <footer class="survival-panel-actions"></footer>
    `;
    panel.querySelector('.survival-close-button')?.addEventListener('click', () => this.closeSurvivalModal());
    const body = panel.querySelector('.survival-panel-body');
    if (content) body.append(content);
    const footer = panel.querySelector('.survival-panel-actions');
    actions.forEach((action) => footer.append(action));
    backdrop.append(panel);
    backdrop.addEventListener('pointerdown', (event) => {
      if (event.target === backdrop) this.closeSurvivalModal();
    });
    return backdrop;
  }

  toggleQuickInventory() {
    this.quickInventoryOpen = !this.quickInventoryOpen;
    this.hud?.quickInventory?.classList.toggle('is-open', this.quickInventoryOpen);
    this.hud?.quickInventory?.classList.toggle('is-hidden', !this.quickInventoryOpen);
    this.game.audio[this.quickInventoryOpen ? 'playModalOpen' : 'playModalClose']?.();
    if (this.quickInventoryOpen) this.updateQuickInventory(true);
  }

  closeQuickInventory() {
    this.quickInventoryOpen = false;
    this.hud?.quickInventory?.classList.remove('is-open');
    this.hud?.quickInventory?.classList.add('is-hidden');
  }

  getQuickInventorySignature() {
    const inventory = this.game.systems.inventory.storage || {};
    return Object.entries(inventory)
      .filter(([, amount]) => amount > 0)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([itemId, amount]) => `${itemId}:${amount}`)
      .join('|');
  }

  updateQuickInventory(force = false) {
    const grid = this.hud?.quickInventoryGrid;
    if (!grid) return;
    this.hud.quickInventory?.classList.toggle('is-open', this.quickInventoryOpen);
    this.hud.quickInventory?.classList.toggle('is-hidden', !this.quickInventoryOpen);
    if (!this.quickInventoryOpen && !force) return;
    const signature = this.getQuickInventorySignature();
    if (!force && signature === this.quickInventorySignature) return;
    this.quickInventorySignature = signature;
    const entries = Object.entries(this.game.systems.inventory.storage || {})
      .filter(([, amount]) => amount > 0)
      .sort(([leftId, leftAmount], [rightId, rightAmount]) => {
        const left = this.game.systems.materials.getMaterial(leftId);
        const right = this.game.systems.materials.getMaterial(rightId);
        const rarityOrder = { common: 0, uncommon: 1, rare: 2, epic: 3 };
        const rarityDiff = (rarityOrder[left?.rarity || 'common'] ?? 0) - (rarityOrder[right?.rarity || 'common'] ?? 0);
        if (rarityDiff) return rarityDiff;
        if (rightAmount !== leftAmount) return rightAmount - leftAmount;
        return this.game.systems.materials.getDisplayName(leftId).localeCompare(this.game.systems.materials.getDisplayName(rightId));
      });
    const slotCount = Math.max(35, Math.ceil(entries.length / 7) * 7 || 35);
    const fragment = document.createDocumentFragment();
    for (let index = 0; index < slotCount; index += 1) {
      const entry = entries[index];
      fragment.append(this.createQuickInventorySlot(entry?.[0], entry?.[1] || 0));
    }
    grid.replaceChildren(fragment);
  }

  createQuickInventorySlot(itemId, amount = 0) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `quick-inventory-slot ${amount > 0 ? 'has-item' : 'is-empty'}`;
    button.addEventListener('pointerdown', (event) => event.stopPropagation());
    if (!itemId || amount <= 0) {
      button.disabled = true;
      button.setAttribute('aria-label', 'Empty inventory slot');
      return button;
    }
    const material = this.game.systems.materials.getMaterial(itemId);
    const rarity = material?.rarity || 'common';
    const name = this.game.systems.materials.getDisplayName(itemId);
    button.classList.add(`rarity-${rarity}`);
    button.style.setProperty('--item-color', material?.color || '#fff2cf');
    button.innerHTML = `
      <span class="slot-icon">${material?.icon || '?'}</span>
      <strong>${amount}</strong>
    `;
    button.title = `${name} x${amount} | ${this.game.systems.materials.getRarityLabel(rarity)} | ${this.game.systems.materials.getValue(itemId, amount)} cr`;
    button.setAttribute('aria-label', `${name}, ${amount}`);
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      this.game.audio.playButtonClick?.();
      this.game.ui.showToast(`${name} x${amount}`, rarity === 'common' ? 'info' : 'success', 1100);
    });
    return button;
  }

  showInventoryModal() {
    if (this.survivalModalKind === 'inventory') {
      this.closeSurvivalModal();
      return;
    }
    const inventory = this.game.systems.inventory.storage;
    const entries = Object.entries(inventory).filter(([, amount]) => amount > 0);
    const content = document.createElement('div');
    content.className = 'survival-inventory';
    const grid = document.createElement('div');
    grid.className = 'survival-inventory-grid';
    const slotCount = Math.max(28, Math.ceil(entries.length / 7) * 7 || 28);
    for (let index = 0; index < slotCount; index += 1) {
      const entry = entries[index];
      grid.append(this.createInventorySlot(entry?.[0], entry?.[1] || 0));
    }
    content.append(grid);
    const totals = document.createElement('div');
    totals.className = 'survival-inventory-summary';
    totals.innerHTML = `
      <strong>${entries.length}</strong><span>item types</span>
      <strong>${this.game.systems.inventory.getTotalStored()}</strong><span>total items</span>
      <strong>${Math.round(this.game.systems.materials.getCargoWeight(inventory))}</strong><span>kg carried</span>
    `;
    content.append(totals);

    const modal = this.createSurvivalModal({
      title: 'Inventory',
      subtitle: 'Tab toggles this grid. Empty slots stay visible so the pack feels physical.',
      className: 'inventory-survival-modal',
      content,
      actions: [
        new Button('Crafting', () => this.showCraftingModal(), { icon: 'C', variant: 'forge' }).element,
        new Button('Close', () => this.closeSurvivalModal(), { icon: 'x', variant: 'metal' }).element,
      ],
    });
    this.survivalModal = modal;
    this.survivalModalKind = 'inventory';
    this.game.ui.showModal(modal);
  }

  createInventorySlot(itemId, amount = 0) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `survival-inventory-slot ${amount > 0 ? 'has-item' : 'is-empty'}`;
    if (!itemId || amount <= 0) {
      button.innerHTML = '<span class="slot-icon">+</span>';
      button.disabled = true;
      return button;
    }
    const material = this.game.systems.materials.getMaterial(itemId);
    const rarity = material?.rarity || 'common';
    button.classList.add(`rarity-${rarity}`);
    button.innerHTML = `
      <span class="slot-icon" style="--item-color: ${material?.color || '#fff2cf'}">${material?.icon || '?'}</span>
      <strong>${amount}</strong>
    `;
    button.title = `${this.game.systems.materials.getDisplayName(itemId)} x${amount}`;
    button.addEventListener('click', () => this.showItemInfoModal(itemId, amount));
    return button;
  }

  showItemInfoModal(itemId, amount = 0) {
    const material = this.game.systems.materials.getMaterial(itemId);
    const content = document.createElement('div');
    content.className = 'survival-item-detail';
    content.innerHTML = `
      <div class="survival-item-detail-icon" style="--item-color: ${material?.color || '#fff2cf'}">${material?.icon || '?'}</div>
      <div>
        <h2>${this.game.systems.materials.getDisplayName(itemId)}</h2>
        <p>${material?.description || 'Unknown field item.'}</p>
        <dl>
          <div><dt>Rarity</dt><dd>${this.game.systems.materials.getRarityLabel(material?.rarity || 'common')}</dd></div>
          <div><dt>Quantity</dt><dd>${amount}</dd></div>
          <div><dt>Value</dt><dd>${this.game.systems.materials.getValue(itemId, amount)} cr</dd></div>
          <div><dt>Weight</dt><dd>${this.game.systems.materials.getWeight(itemId)} kg each</dd></div>
        </dl>
      </div>
    `;
    const modal = this.createSurvivalModal({
      title: 'Item scan',
      className: 'item-survival-modal',
      content,
      actions: [
        new Button('Back', () => this.showInventoryModal(), { icon: '<', variant: 'metal' }).element,
      ],
    });
    this.survivalModal = modal;
    this.survivalModalKind = 'item';
    this.game.ui.showModal(modal);
  }

  tryOpenCraftingStation() {
    if (this.placedCraftingStation?.overlapsPlayer(this.islandPlayer)) {
      this.showCraftingModal();
      return true;
    }
    this.game.audio.playError?.();
    const story = this.getStoryState();
    this.game.ui.showToast(
      story.craftingStationPlaced ? 'Stand near the crafting station to craft' : 'Place the crafting station first',
      'danger',
      1400,
    );
    return false;
  }

  showCraftingModal({ force = false } = {}) {
    if (!this.placedCraftingStation && !force) {
      this.game.ui.showToast('Place the crafting station first', 'danger', 1400);
      return;
    }
    if (this.survivalModalKind === 'crafting' && !force) {
      this.closeSurvivalModal();
      return;
    }
    this.ensureVoxelCraftState();
    const content = document.createElement('div');
    content.className = 'survival-crafting voxel-crafting';
    this.populateVoxelCraftingContent(content);
    const modal = this.createSurvivalModal({
      title: 'Crafting Station',
      subtitle: 'Pick a recipe, layer materials into a connected voxel shape, and right-click voxels to cycle ramps.',
      className: 'crafting-survival-modal',
      content,
      actions: [
        new Button('Inventory', () => this.showInventoryModal(), { icon: 'I', variant: 'metal' }).element,
        new Button('Pack Up Station', () => this.packUpCraftingStation(), { icon: '<', variant: 'metal' }).element,
        new Button('Close', () => this.closeSurvivalModal(), { icon: 'x', variant: 'metal' }).element,
      ],
    });
    this.survivalModal = modal;
    this.survivalModalKind = 'crafting';
    this.game.ui.showModal(modal);
  }

  ensureVoxelCraftState() {
    const recipe = this.getVoxelCraftRecipes()[0];
    if (this.voxelCraftState?.recipeId === recipe.id) return this.voxelCraftState;
    this.voxelCraftState = {
      recipeId: recipe.id,
      selectedMaterialId: Object.keys(recipe.requirements)[0],
      grid: this.createEmptyVoxelGrid(recipe.gridSize),
    };
    return this.voxelCraftState;
  }

  createEmptyVoxelGrid(size = 16) {
    return Array.from({ length: size * size }, () => null);
  }

  getVoxelCraftRecipes() {
    const recipe = gameBalance.earlyGame?.crashStart?.furnaceRecipe || {};
    return [{
      id: recipe.id || 'starterFurnace',
      name: recipe.name || 'Starter Furnace',
      icon: 'Fu',
      category: 'Survival',
      description: 'Draw a custom furnace. Voxels merge together, materials can layer, copper must stay within a 5x5 chamber, and the Fire Core goes inside the body.',
      outputItemId: 'starterFurnace',
      requirements: recipe.requirements || { stoneOre: 20, copperShards: 10, fireCore: 1 },
      gridSize: recipe.gridSize || 16,
      shapeRules: recipe.shapeRules || {},
    }];
  }

  populateVoxelCraftingContent(content) {
    const recipes = this.getVoxelCraftRecipes();
    const state = this.ensureVoxelCraftState();
    const recipe = recipes.find((item) => item.id === state.recipeId) || recipes[0];
    const usage = this.getVoxelCraftUsage(state.grid);
    const validation = this.validateVoxelCraft(recipe, state.grid);
    content.replaceChildren();

    const shell = document.createElement('div');
    shell.className = 'voxel-craft-layout';
    const tabs = document.createElement('div');
    tabs.className = 'voxel-craft-tabs';
    recipes.forEach((item) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = item.id === recipe.id ? 'is-active' : '';
      button.innerHTML = `<span>${item.icon}</span><strong>${item.name}</strong><em>${item.category}</em>`;
      button.addEventListener('click', () => {
        this.voxelCraftState = {
          recipeId: item.id,
          selectedMaterialId: Object.keys(item.requirements)[0],
          grid: this.createEmptyVoxelGrid(item.gridSize),
        };
        this.populateVoxelCraftingContent(content);
      });
      tabs.append(button);
    });

    const grid = document.createElement('div');
    grid.className = 'voxel-craft-grid';
    grid.style.setProperty('--voxel-grid-size', recipe.gridSize);
    const previewCanvas = document.createElement('canvas');
    previewCanvas.className = 'voxel-craft-preview';
    previewCanvas.setAttribute('aria-hidden', 'true');
    grid.append(previewCanvas);
    for (let index = 0; index < recipe.gridSize * recipe.gridSize; index += 1) {
      const craftCell = this.getVoxelCraftGridCell(state.grid, index);
      const layers = this.getVoxelCraftCellLayers(craftCell);
      const itemId = layers[layers.length - 1] || null;
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = this.getVoxelCraftCellClassName(index, recipe.gridSize, state.grid);
      cell.title = itemId
        ? `${layers.map((layerId) => this.game.systems.materials.getDisplayName(layerId)).join(' + ')} - right-click to reshape`
        : 'Empty voxel';
      cell.setAttribute('aria-label', cell.title);
      cell.addEventListener('click', (event) => {
        this.paintVoxelCraftCell(index, event.shiftKey ? null : state.selectedMaterialId);
        this.populateVoxelCraftingContent(content);
      });
      cell.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        this.cycleVoxelCraftCellShape(index);
        this.populateVoxelCraftingContent(content);
      });
      grid.append(cell);
    }
    drawCraftVoxelPreview(previewCanvas, {
      grid: state.grid,
      size: recipe.gridSize,
      getCellLayers: (cell) => this.getVoxelCraftCellLayers(cell),
      getMaterialVisual: (itemId) => this.getVoxelCraftMaterialVisual(itemId),
      seed: `${recipe.id}:${this.game.state.stats?.totalItemsCrafted || 0}`,
    });

    const side = document.createElement('aside');
    side.className = 'voxel-craft-side';
    const palette = document.createElement('div');
    palette.className = 'voxel-material-palette';
    Object.entries(recipe.requirements).forEach(([itemId, needed]) => {
      const material = this.game.systems.materials.getMaterial(itemId);
      const used = usage[itemId] || 0;
      const have = this.game.systems.inventory.getStoredAmount(itemId);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = state.selectedMaterialId === itemId ? 'is-selected' : '';
      button.disabled = have < needed && used < needed;
      button.innerHTML = `
        <span style="--item-color: ${material?.color || '#fff2cf'}">${material?.icon || '?'}</span>
        <strong>${material?.name || itemId}</strong>
        <em>${used}/${needed} used · ${have} owned</em>
      `;
      button.addEventListener('click', () => {
        state.selectedMaterialId = itemId;
        this.populateVoxelCraftingContent(content);
      });
      palette.append(button);
    });

    const rules = document.createElement('div');
    rules.className = 'voxel-craft-rules';
    rules.innerHTML = `
      <h2>${recipe.name}</h2>
      <p>${recipe.description}</p>
      <ul>${validation.messages.map((message) => `<li class="${message.ok ? 'is-met' : 'is-missing'}">${message.text}</li>`).join('')}</ul>
    `;

    const actions = document.createElement('div');
    actions.className = 'voxel-craft-actions';
    const clearButton = new Button('Clear', () => {
      state.grid.fill(null);
      this.populateVoxelCraftingContent(content);
    }, { icon: 'x', variant: 'metal' }).element;
    const autoButton = new Button('Auto Layout', () => {
      this.autofillVoxelRecipe(recipe, state);
      this.populateVoxelCraftingContent(content);
    }, { icon: 'A', variant: 'metal' }).element;
    const craftButton = new Button('Craft Blueprint', () => {
      this.craftVoxelRecipe(recipe, state);
      this.populateVoxelCraftingContent(content);
    }, { icon: 'Fu', variant: 'forge' }).element;
    craftButton.disabled = !validation.ok;
    actions.append(clearButton, autoButton, craftButton);

    side.append(palette, rules, actions);
    shell.append(tabs, grid, side);
    content.append(shell);
  }

  normalizeVoxelCraftCell(cell) {
    if (!cell) return null;
    if (typeof cell === 'string') return { layers: [cell], shape: 0 };
    const layers = Array.isArray(cell.layers)
      ? cell.layers.filter(Boolean)
      : (cell.itemId ? [cell.itemId] : []);
    if (!layers.length) return null;
    return {
      ...cell,
      layers,
      shape: Number.isFinite(cell.shape) ? cell.shape : 0,
    };
  }

  getVoxelCraftGridCell(grid = [], index = 0) {
    const normalized = this.normalizeVoxelCraftCell(grid[index]);
    if (normalized !== grid[index]) grid[index] = normalized;
    return normalized;
  }

  getVoxelCraftCellLayers(cell) {
    return this.normalizeVoxelCraftCell(cell)?.layers || [];
  }

  getVoxelCraftCellClassName(index, size, grid = []) {
    const cell = this.getVoxelCraftGridCell(grid, index);
    const layers = this.getVoxelCraftCellLayers(cell);
    const classes = ['voxel-craft-cell'];
    if (!layers.length) return classes.join(' ');
    const col = index % size;
    const row = Math.floor(index / size);
    const hasNeighbor = (dx, dy) => {
      const x = col + dx;
      const y = row + dy;
      if (x < 0 || x >= size || y < 0 || y >= size) return false;
      return this.getVoxelCraftCellLayers(this.getVoxelCraftGridCell(grid, y * size + x)).length > 0;
    };
    classes.push('has-voxel', `shape-${cell.shape || 0}`);
    if (layers.length > 1) classes.push('has-layers');
    if (hasNeighbor(0, -1)) classes.push('join-n');
    if (hasNeighbor(1, 0)) classes.push('join-e');
    if (hasNeighbor(0, 1)) classes.push('join-s');
    if (hasNeighbor(-1, 0)) classes.push('join-w');
    return classes.join(' ');
  }

  getVoxelCraftMaterialVisual(itemId) {
    const material = this.game.systems.materials.getMaterial(itemId);
    const terrain = Object.values(TERRAIN_MATERIALS).find((entry) => entry.materialId === itemId);
    const fallbackEdge = material?.rarity === 'rare' || material?.rarity === 'epic' ? '#dfe7ff' : '#91867a';
    return {
      id: itemId,
      color: terrain?.color || material?.color || '#6b625a',
      edge: terrain?.edge || material?.color || fallbackEdge,
    };
  }

  getVoxelCraftAvailableBevels(index, size, grid = []) {
    const col = index % size;
    const row = Math.floor(index / size);
    const occupied = (dx, dy) => {
      const x = col + dx;
      const y = row + dy;
      if (x < 0 || x >= size || y < 0 || y >= size) return false;
      return this.getVoxelCraftCellLayers(this.getVoxelCraftGridCell(grid, y * size + x)).length > 0;
    };
    const north = occupied(0, -1);
    const east = occupied(1, 0);
    const south = occupied(0, 1);
    const west = occupied(-1, 0);
    const bevels = [];
    if (!north && !west) bevels.push(1);
    if (!north && !east) bevels.push(2);
    if (!south && !east) bevels.push(3);
    if (!south && !west) bevels.push(4);
    return bevels;
  }

  paintVoxelCraftCell(index, itemId = null) {
    const state = this.ensureVoxelCraftState();
    const recipe = this.getVoxelCraftRecipes().find((item) => item.id === state.recipeId);
    if (!recipe) return;
    const previous = this.getVoxelCraftGridCell(state.grid, index);
    if (!itemId) {
      state.grid[index] = null;
      return;
    }
    const cell = previous || { layers: [], shape: 0 };
    const existingIndex = cell.layers.indexOf(itemId);
    if (existingIndex >= 0) {
      cell.layers.splice(existingIndex, 1);
      state.grid[index] = cell.layers.length ? cell : null;
      return;
    }
    const usage = this.getVoxelCraftUsage(state.grid);
    const required = recipe.requirements[itemId] || 0;
    if ((usage[itemId] || 0) >= required) {
      this.game.audio.playError?.();
      this.game.ui.showToast(`All ${this.game.systems.materials.getDisplayName(itemId)} voxels are already used`, 'danger', 1100);
      return;
    }
    cell.layers.push(itemId);
    state.grid[index] = cell;
  }

  cycleVoxelCraftCellShape(index) {
    const state = this.ensureVoxelCraftState();
    const cell = this.getVoxelCraftGridCell(state.grid, index);
    if (!cell) return;
    const recipe = this.getVoxelCraftRecipes().find((item) => item.id === state.recipeId);
    const size = recipe?.gridSize || Math.sqrt(state.grid.length) || 16;
    const bevels = this.getVoxelCraftAvailableBevels(index, size, state.grid);
    if (!bevels.length) {
      cell.shape = 0;
      this.game.audio.playError?.();
      this.game.ui.showToast('Bevels only work on outside corners', 'danger', 900);
      return;
    }
    const cycle = [0, ...bevels];
    const currentIndex = Math.max(0, cycle.indexOf(cell.shape || 0));
    cell.shape = cycle[(currentIndex + 1) % cycle.length];
    state.grid[index] = cell;
  }

  getVoxelCraftUsage(grid = []) {
    return grid.reduce((usage, cell) => {
      this.getVoxelCraftCellLayers(cell).forEach((itemId) => {
        usage[itemId] = (usage[itemId] || 0) + 1;
      });
      return usage;
    }, {});
  }

  validateVoxelCraft(recipe, grid) {
    const usage = this.getVoxelCraftUsage(grid);
    const messages = [];
    let ok = true;
    Object.entries(recipe.requirements).forEach(([itemId, needed]) => {
      const used = usage[itemId] || 0;
      const have = this.game.systems.inventory.getStoredAmount(itemId);
      const materialName = this.game.systems.materials.getDisplayName(itemId);
      const met = used === needed && have >= needed;
      if (!met) ok = false;
      messages.push({
        ok: met,
        text: `${materialName}: use exactly ${needed} (${used}/${needed}, owned ${have})`,
      });
    });
    const cells = this.getVoxelCraftCells(recipe, grid);
    const connected = !recipe.shapeRules?.connected || this.areCraftCellsConnected(cells);
    if (!connected) ok = false;
    messages.push({ ok: connected, text: 'All placed voxels must touch as one connected shape.' });
    Object.entries(recipe.shapeRules?.materialBounds || {}).forEach(([itemId, rule]) => {
      const bounds = this.getCraftMaterialBounds(cells, itemId);
      const met = Boolean(bounds)
        && bounds.width <= rule.maxWidth
        && bounds.height <= rule.maxHeight;
      if (!met) ok = false;
      messages.push({ ok: met, text: rule.label || `${this.game.systems.materials.getDisplayName(itemId)} must fit in ${rule.maxWidth}x${rule.maxHeight}.` });
    });
    return { ok, messages };
  }

  getVoxelCraftCells(recipe, grid) {
    const size = recipe.gridSize || 16;
    return grid
      .map((cell, index) => {
        const normalized = this.normalizeVoxelCraftCell(cell);
        if (!normalized) return null;
        const craftCell = this.createCraftCell(index % size, Math.floor(index / size), normalized);
        if (craftCell.shape && !this.getVoxelCraftAvailableBevels(index, size, grid).includes(craftCell.shape)) {
          craftCell.shape = 0;
        }
        return craftCell;
      })
      .filter(Boolean);
  }

  createCraftCell(x, y, itemOrCell) {
    const normalized = typeof itemOrCell === 'string'
      ? { layers: [itemOrCell], shape: 0 }
      : this.normalizeVoxelCraftCell(itemOrCell);
    const layers = normalized?.layers || [];
    const itemId = layers[layers.length - 1] || itemOrCell;
    const material = this.game.systems.materials.getMaterial(itemId);
    return {
      x,
      y,
      itemId,
      layers,
      shape: normalized?.shape || 0,
      color: material?.color || '#fff2cf',
      icon: material?.icon || '?',
    };
  }

  areCraftCellsConnected(cells = []) {
    if (!cells.length) return false;
    const keys = new Set(cells.map((cell) => `${cell.x},${cell.y}`));
    const start = cells[0];
    const queue = [start];
    const visited = new Set([`${start.x},${start.y}`]);
    while (queue.length) {
      const cell = queue.shift();
      [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].forEach(([dx, dy]) => {
        const key = `${cell.x + dx},${cell.y + dy}`;
        if (!keys.has(key) || visited.has(key)) return;
        visited.add(key);
        queue.push({ x: cell.x + dx, y: cell.y + dy });
      });
    }
    return visited.size === cells.length;
  }

  getCraftMaterialBounds(cells, itemId) {
    const materialCells = cells.filter((cell) => {
      const layers = Array.isArray(cell.layers) ? cell.layers : [cell.itemId];
      return layers.includes(itemId);
    });
    if (!materialCells.length) return null;
    const xs = materialCells.map((cell) => cell.x);
    const ys = materialCells.map((cell) => cell.y);
    return {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
      width: Math.max(...xs) - Math.min(...xs) + 1,
      height: Math.max(...ys) - Math.min(...ys) + 1,
    };
  }

  autofillVoxelRecipe(recipe, state) {
    const size = recipe.gridSize || 16;
    state.grid = this.createEmptyVoxelGrid(size);
    const set = (x, y, itemId) => {
      if (x < 0 || x >= size || y < 0 || y >= size) return;
      const index = y * size + x;
      const cell = this.getVoxelCraftGridCell(state.grid, index) || { layers: [], shape: 0 };
      if (!cell.layers.includes(itemId)) cell.layers.push(itemId);
      state.grid[index] = cell;
    };
    const stoneCoords = [
      [4, 6], [5, 6], [6, 6], [7, 6], [8, 6], [9, 6], [10, 6], [11, 6],
      [4, 12], [5, 12], [6, 12], [7, 12], [8, 12], [9, 12], [10, 12], [11, 12],
      [4, 7], [4, 8], [4, 9], [4, 10],
    ];
    stoneCoords.slice(0, recipe.requirements.stoneOre || 0).forEach(([x, y]) => set(x, y, 'stoneOre'));
    for (let index = 0; index < (recipe.requirements.copperShards || 0); index += 1) {
      set(6 + (index % 5), 8 + Math.floor(index / 5), 'copperShards');
    }
    if (recipe.requirements.fireCore) set(8, 9, 'fireCore');
  }

  craftVoxelRecipe(recipe, state) {
    const validation = this.validateVoxelCraft(recipe, state.grid);
    if (!validation.ok) {
      this.game.audio.playError?.();
      this.game.ui.showToast('Blueprint is missing recipe rules', 'danger', 1400);
      return false;
    }
    Object.entries(recipe.requirements).forEach(([itemId, amount]) => {
      this.game.systems.inventory.remove(itemId, amount, { skipSave: true });
    });
    const story = this.getStoryState();
    const cells = this.getVoxelCraftCells(recipe, state.grid);
    const tileSize = this.activeIsland?.terrain?.cellSize || 22;
    const blueprint = {
      id: `furnace-blueprint-${Date.now().toString(36)}-${Math.floor(Math.random() * 9999).toString(36)}`,
      recipeId: recipe.id,
      name: recipe.name,
      shape: {
        gridSize: recipe.gridSize || 16,
        tileSize,
        cells,
      },
    };
    story.furnaceInventory ||= [];
    story.furnaceInventory.push(blueprint);
    story.furnaceBuilt = true;
    this.game.systems.inventory.add(recipe.outputItemId, 1, { skipSave: true });
    this.game.saveGame();
    this.game.audio.playSuccess?.();
    this.game.ui.showToast(`${recipe.name} blueprint crafted`, 'success', 1600);
    state.grid.fill(null);
    this.startCrashTutorialHint('smeltingHint');
    return true;
  }

  packUpCraftingStation() {
    const story = this.getStoryState();
    if (!this.placedCraftingStation) return;
    story.craftingStationPlaced = false;
    story.craftingStation = null;
    this.placedCraftingStation = null;
    this.game.systems.inventory.add('craftingStationKit', 1, { skipSave: true });
    this.game.saveGame();
    this.game.audio.playSuccess?.();
    this.closeSurvivalModal();
    this.game.ui.showToast('Crafting station packed into inventory', 'success', 1300);
  }

  showFurnaceModal(furnaceId = '') {
    const furnace = furnaceId ? this.getFurnaceState(furnaceId) : this.getFurnaceState();
    if (!furnace) return;
    this.activeFurnaceId = furnace.id;
    const content = document.createElement('div');
    content.className = 'survival-furnace';
    content.dataset.furnaceContent = 'true';
    this.populateFurnaceContent(content);
    const modal = this.createSurvivalModal({
      title: 'Starter Furnace',
      subtitle: 'Two top slots queue ore. The Fire Core at the bottom keeps it hot.',
      className: 'furnace-survival-modal',
      content,
      actions: [
        new Button('Pack Up', () => this.packUpActiveFurnace(), { icon: '<', variant: 'metal' }).element,
        new Button('Close', () => this.closeSurvivalModal(), { icon: 'x', variant: 'metal' }).element,
      ],
    });
    this.survivalModal = modal;
    this.survivalModalKind = 'furnace';
    this.game.ui.showModal(modal);
  }

  refreshFurnaceModal() {
    if (this.survivalModalKind !== 'furnace' || !this.survivalModal) return;
    const content = this.survivalModal.querySelector('[data-furnace-content]');
    if (content) this.populateFurnaceContent(content);
  }

  populateFurnaceContent(content) {
    const furnace = this.getFurnaceState(this.activeFurnaceId) || {};
    const active = furnace.active || null;
    const queue = furnace.queue || [];
    const recipes = gameBalance.earlyGame?.crashStart?.smelting || {};
    const activeProgress = active ? clamp01(active.elapsed / Math.max(0.01, active.time)) : 0;
    const slotItems = active
      ? [
        { itemId: active.inputId, progress: activeProgress, active: true },
        queue[0] ? { itemId: queue[0], progress: 0, active: false } : null,
      ]
      : [
        queue[0] ? { itemId: queue[0], progress: 0, active: false } : null,
        queue[1] ? { itemId: queue[1], progress: 0, active: false } : null,
      ];
    content.replaceChildren();
    const slots = document.createElement('div');
    slots.className = 'furnace-smelt-slots';
    slotItems.forEach((slot, index) => {
      const material = slot ? this.game.systems.materials.getMaterial(slot.itemId) : null;
      const element = document.createElement('div');
      element.className = `furnace-smelt-slot ${slot ? 'has-item' : 'is-empty'} ${slot?.active ? 'is-active' : ''}`;
      element.innerHTML = slot
        ? `<span style="--item-color: ${material?.color || '#fff2cf'}">${material?.icon || '?'}</span><strong>${slot.active ? 'Smelting' : 'Queued'}</strong><i style="width: ${Math.round((slot.progress || 0) * 100)}%"></i>`
        : `<span>+</span><strong>Slot ${index + 1}</strong>`;
      slots.append(element);
    });
    content.append(slots);

    const controls = document.createElement('div');
    controls.className = 'furnace-controls';
    Object.keys(recipes).forEach((inputId) => {
      const recipe = recipes[inputId];
      const input = this.game.systems.materials.getMaterial(inputId);
      const output = this.game.systems.materials.getMaterial(recipe.output);
      const amount = this.game.systems.inventory.getStoredAmount(inputId);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'furnace-queue-button';
      button.disabled = amount <= 0 || (queue.length + (active ? 1 : 0) >= 2);
      button.innerHTML = `
        <span style="--item-color: ${input?.color || '#fff2cf'}">${input?.icon || '?'}</span>
        <strong>${input?.name || inputId}</strong>
        <em>${amount} available -> ${output?.name || recipe.output}</em>
      `;
      button.addEventListener('click', () => this.queueCrashSmelt(inputId));
      controls.append(button);
    });
    content.append(controls);

    const fuel = document.createElement('div');
    fuel.className = 'furnace-fuel-slot';
    fuel.innerHTML = '<span>FC</span><strong>Fire Core installed</strong><em>Stable emergency heat</em>';
    content.append(fuel);
  }

  packUpActiveFurnace() {
    const story = this.getStoryState();
    const furnace = this.getFurnaceState(this.activeFurnaceId);
    if (!furnace) return;
    if (furnace.active || furnace.queue?.length) {
      this.game.audio.playError?.();
      this.game.ui.showToast('Let the furnace finish before packing it up', 'danger', 1400);
      return;
    }
    const placed = this.placedFurnaces.find((item) => item.id === furnace.id);
    story.furnaceInventory ||= [];
    story.furnaceInventory.push({
      id: furnace.blueprintId || `furnace-blueprint-${Date.now().toString(36)}`,
      recipeId: 'starterFurnace',
      name: furnace.name || 'Starter Furnace',
      shape: furnace.shape || placed?.shape || this.createDefaultFurnaceBlueprint().shape,
    });
    this.game.systems.inventory.add('starterFurnace', 1, { skipSave: true });
    story.furnaces = (story.furnaces || []).filter((item) => item.id !== furnace.id);
    this.placedFurnaces = this.placedFurnaces.filter((item) => item.id !== furnace.id);
    this.placedFurnace = this.placedFurnaces[0] || null;
    story.furnacePlaced = this.placedFurnaces.length > 0;
    this.activeFurnaceId = '';
    this.game.saveGame();
    this.game.audio.playSuccess?.();
    this.closeSurvivalModal();
    this.game.ui.showToast('Furnace packed into inventory', 'success', 1200);
  }

  updateIslandPlacedFlags(delta) {
    const flags = this.activeIsland?.placedFlags || [];
    if (!flags.length) return;
    flags.forEach((flag) => {
      flag.update(delta);
      if (this.islandMode === 'onIsland' && this.islandPlayer) flag.bumpFromPlayer(this.islandPlayer);
    });
  }

  seedPlanetPlayer(island, player) {
    const surfacePadding = (island.terrain?.cellSize || 20) * 0.62;
    const surface = island.getSurfaceLocalAtAngle(island.landingAngle, PLANET_PLAYER_FOOT_OFFSET + surfacePadding);
    player.x = surface.x - player.width * 0.5;
    player.y = surface.y - player.height * 0.5;
    player.vx = 0;
    player.vy = 0;
    player.planetAngle = island.landingAngle;
    player.planetDistance = surface.radius;
    player.onGround = true;
  }

  updatePlanetIslandPlayer(delta, input) {
    const island = this.activeIsland;
    const player = this.islandPlayer;
    if (!island || !player) return;
    const dt = Math.min(delta, 0.05);
    player.hitCooldown = Math.max(0, player.hitCooldown - dt);
    this.resolvePlanetPlayerOverlap(player, island);

    player.groundGraceTimer = Math.max(0, (player.groundGraceTimer || 0) - dt);
    const manualBasis = this.getIslandGravityBasis(island);
    const groundedBeforeRecovery = this.isPlanetPlayerGrounded(player, island, manualBasis);
    if (groundedBeforeRecovery || player.onGround) {
      player.onGround = true;
      player.groundGraceTimer = PLANET_PLAYER_COYOTE_TIME;
    }
    this.updateIslandGravityRecoveryState(island, player);

    const basis = this.getIslandGravityBasis(island);
    const groundedNow = groundedBeforeRecovery || this.isPlanetPlayerGrounded(player, island, basis);
    if (!player.onGround && groundedNow) {
      player.onGround = true;
      player.groundGraceTimer = PLANET_PLAYER_COYOTE_TIME;
    }
    const startedOnGround = player.onGround;
    const moveX = Math.max(-1, Math.min(1, input.moveX || 0));
    const targetTangent = moveX * (player.onGround ? PLANET_PLAYER_MOVE_SPEED : PLANET_PLAYER_AIR_SPEED);
    const currentTangent = player.vx * basis.tangent.x + player.vy * basis.tangent.y;
    const tangentDelta = (targetTangent - currentTangent) * Math.min(1, dt * (player.onGround ? 14 : 5.5));
    player.vx += basis.tangent.x * tangentDelta;
    player.vy += basis.tangent.y * tangentDelta;

    if (Math.abs(moveX) > 0.05) {
      player.facing = moveX > 0 ? 1 : -1;
      player.step += dt * 8;
    } else if (player.onGround) {
      const dampedTangent = currentTangent * Math.max(0, 1 - dt * 12);
      const correction = dampedTangent - currentTangent;
      player.vx += basis.tangent.x * correction;
      player.vy += basis.tangent.y * correction;
    }

    let didJump = false;
    const groundedForJump = player.onGround || groundedNow || (player.groundGraceTimer || 0) > 0;
    if (input.jumpPressed && groundedForJump) {
      player.vx += basis.outward.x * PLANET_PLAYER_JUMP_SPEED;
      player.vy += basis.outward.y * PLANET_PLAYER_JUMP_SPEED;
      player.onGround = false;
      player.groundGraceTimer = 0;
      didJump = true;
    }

    const gravity = island.world.gravity ?? 1560;
    player.vx += basis.inward.x * gravity * dt;
    player.vy += basis.inward.y * gravity * dt;

    const speed = Math.hypot(player.vx, player.vy);
    const maxSpeed = PLANET_PLAYER_MAX_SPEED;
    if (speed > maxSpeed) {
      const scale = maxSpeed / speed;
      player.vx *= scale;
      player.vy *= scale;
    }

    player.onGround = false;
    this.movePlanetPlayer(player, player.vx * dt, player.vy * dt, island, {
      canStep: startedOnGround && !didJump,
      groundSpeedLimit: PLANET_PLAYER_MOVE_SPEED,
    });
    this.resolvePlanetPlayerOverlap(player, island);
    const nextBasis = this.getIslandGravityBasis(island);
    if (this.isPlanetPlayerGrounded(player, island, nextBasis)) {
      player.onGround = true;
      player.groundGraceTimer = PLANET_PLAYER_COYOTE_TIME;
      const inwardSpeed = player.vx * nextBasis.inward.x + player.vy * nextBasis.inward.y;
      if (inwardSpeed > 0) {
        player.vx -= nextBasis.inward.x * inwardSpeed;
        player.vy -= nextBasis.inward.y * inwardSpeed;
      }
      this.clampPlanetPlayerTangentSpeed(player, nextBasis, PLANET_PLAYER_MOVE_SPEED);
    }
    const center = island.getCenterLocal();
    player.planetAngle = Math.atan2(player.centerY - center.y, player.centerX - center.x);
    player.planetDistance = Math.hypot(player.centerX - center.x, player.centerY - center.y);
    this.updateIslandGravityRecoveryState(island, player);
  }

  getIslandGravityCatchState(island, player) {
    const center = island.getCenterLocal();
    const dx = player.centerX - center.x;
    const dy = player.centerY - center.y;
    const distance = Math.hypot(dx, dy) || 1;
    const angle = Math.atan2(dy, dx);
    const surfaceRadius = island.getSurfaceRadiusAtAngle(angle);
    const catchDistance = island.gravityFieldRadius * ISLAND_GRAVITY_CATCH_FIELD_RATIO;
    const releaseDistance = surfaceRadius + ISLAND_GRAVITY_RELEASE_OFFSET;
    return {
      center,
      dx,
      dy,
      angle,
      distance,
      surfaceRadius,
      catchDistance,
      releaseDistance,
      excess: clamp01((distance - catchDistance) / Math.max(1, island.gravityFieldRadius - catchDistance)),
    };
  }

  updateIslandGravityRecoveryState(island, player) {
    const state = this.getIslandGravityCatchState(island, player);
    const shouldAutoStabilize = !player.onGround && state.distance > state.catchDistance;
    const canReset = player.onGround && state.distance <= state.releaseDistance;
    this.islandGravityRecovery = false;
    this.islandGravityRecoveryBlend = 0;
    if (shouldAutoStabilize && !this.islandFreefall) {
      this.islandFreefall = true;
      this.engageIslandGravityStabilizer();
      this.game.audio.playSuccess?.();
      this.game.ui.showToast('Gravity device auto-engaged', 'success', 900);
      return state;
    }
    if (canReset) {
      this.islandFreefall = false;
    }
    return state;
  }

  getPlanetBasis(island, player) {
    return this.getPlanetBasisAt(island, player.centerX, player.centerY);
  }

  getIslandGravityBasis(island) {
    const outwardAngle = normalizeAngle(-Math.PI / 2 - this.getIslandViewRotation());
    const outward = {
      x: Math.cos(outwardAngle),
      y: Math.sin(outwardAngle),
    };
    const center = island.getCenterLocal();
    const player = this.islandPlayer;
    const dx = player ? player.centerX - center.x : Math.cos(outwardAngle);
    const dy = player ? player.centerY - center.y : Math.sin(outwardAngle);
    return {
      outward,
      inward: { x: -outward.x, y: -outward.y },
      tangent: { x: -outward.y, y: outward.x },
      angle: outwardAngle,
      distance: Math.hypot(dx, dy),
    };
  }

  getPlanetBasisAt(island, centerX, centerY) {
    const center = island.getCenterLocal();
    const dx = centerX - center.x;
    const dy = centerY - center.y;
    const distance = Math.hypot(dx, dy) || 1;
    const outward = { x: dx / distance, y: dy / distance };
    return {
      outward,
      inward: { x: -outward.x, y: -outward.y },
      tangent: { x: -outward.y, y: outward.x },
      angle: Math.atan2(dy, dx),
      distance,
    };
  }

  movePlanetPlayer(player, dx, dy, island, options = {}) {
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / PLANET_PLAYER_COLLISION_STEP));
    const stepX = dx / steps;
    const stepY = dy / steps;
    for (let step = 0; step < steps; step += 1) {
      this.movePlanetPlayerStep(player, island, stepX, stepY, options);
    }
  }

  movePlanetPlayerStep(player, island, dx, dy, options = {}) {
    if (Math.abs(dx) < 0.0001 && Math.abs(dy) < 0.0001) return false;
    const targetX = player.x + dx;
    const targetY = player.y + dy;
    if (!this.planetPlayerCollidesAt(player, island, targetX, targetY)) {
      player.x = targetX;
      player.y = targetY;
      return false;
    }

    const basis = this.getIslandGravityBasis(island);
    const tangentStep = dx * basis.tangent.x + dy * basis.tangent.y;
    const normalStep = dx * basis.inward.x + dy * basis.inward.y;
    if (options.canStep && Math.abs(tangentStep) > 0.001) {
      for (let lift = 2; lift <= PLANET_PLAYER_STEP_UP; lift += 2) {
        const steppedX = targetX + basis.outward.x * lift;
        const steppedY = targetY + basis.outward.y * lift;
        if (
          !this.planetPlayerCollidesAt(player, island, steppedX, steppedY)
          && this.isPlanetPlayerGrounded(
            player,
            island,
            this.getIslandGravityBasis(island),
            steppedX,
            steppedY,
          )
        ) {
          player.x = steppedX;
          player.y = steppedY;
          const inwardSpeed = player.vx * basis.inward.x + player.vy * basis.inward.y;
          if (inwardSpeed > 0) {
            player.vx -= basis.inward.x * inwardSpeed;
            player.vy -= basis.inward.y * inwardSpeed;
          }
          this.clampPlanetPlayerTangentSpeed(player, basis, options.groundSpeedLimit || PLANET_PLAYER_MOVE_SPEED);
          return true;
        }
      }
    }

    const normalX = player.x + basis.inward.x * normalStep;
    const normalY = player.y + basis.inward.y * normalStep;
    if (Math.abs(normalStep) > 0.001 && !this.planetPlayerCollidesAt(player, island, normalX, normalY)) {
      player.x = normalX;
      player.y = normalY;
      this.removePlanetPlayerTangentVelocity(player, basis, tangentStep);
      return true;
    }

    const tangentialX = player.x + basis.tangent.x * tangentStep;
    const tangentialY = player.y + basis.tangent.y * tangentStep;
    if (Math.abs(tangentStep) > 0.001 && !this.planetPlayerCollidesAt(player, island, tangentialX, tangentialY)) {
      player.x = tangentialX;
      player.y = tangentialY;
      this.removePlanetPlayerNormalVelocity(player, basis, normalStep);
      return true;
    }

    this.removePlanetPlayerTangentVelocity(player, basis, tangentStep);
    this.removePlanetPlayerNormalVelocity(player, basis, normalStep);
    return true;
  }

  removePlanetPlayerTangentVelocity(player, basis, attemptedStep = 0) {
    const tangentSpeed = player.vx * basis.tangent.x + player.vy * basis.tangent.y;
    if (Math.abs(tangentSpeed) < 0.001) return;
    const sameDirection = Math.abs(attemptedStep) < 0.001 || Math.sign(tangentSpeed) === Math.sign(attemptedStep);
    if (!sameDirection) return;
    const remove = tangentSpeed * (1 - PLANET_PLAYER_WALL_SLIDE_DAMPING);
    player.vx -= basis.tangent.x * remove;
    player.vy -= basis.tangent.y * remove;
  }

  removePlanetPlayerNormalVelocity(player, basis, attemptedStep = 0) {
    if (Math.abs(attemptedStep) < 0.001) return;
    const normalSpeed = player.vx * basis.inward.x + player.vy * basis.inward.y;
    if (Math.abs(normalSpeed) < 0.001) return;
    if (Math.sign(normalSpeed) !== Math.sign(attemptedStep)) return;
    player.vx -= basis.inward.x * normalSpeed;
    player.vy -= basis.inward.y * normalSpeed;
  }

  clampPlanetPlayerTangentSpeed(player, basis, maxSpeed = PLANET_PLAYER_MOVE_SPEED) {
    const tangentSpeed = player.vx * basis.tangent.x + player.vy * basis.tangent.y;
    const limit = Math.max(1, maxSpeed);
    if (Math.abs(tangentSpeed) <= limit) return;
    const clamped = Math.sign(tangentSpeed) * limit;
    const delta = clamped - tangentSpeed;
    player.vx += basis.tangent.x * delta;
    player.vy += basis.tangent.y * delta;
  }

  resolvePlanetPlayerOverlap(player, island) {
    if (!this.planetPlayerCollidesAt(player, island, player.x, player.y)) return false;
    const basis = this.getIslandGravityBasis(island);
    const directions = [
      basis.outward,
      basis.tangent,
      { x: -basis.tangent.x, y: -basis.tangent.y },
      { x: -basis.outward.x, y: -basis.outward.y },
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
    ];
    const startX = player.x;
    const startY = player.y;
    for (let radius = 1; radius <= 80; radius += 2) {
      for (const direction of directions) {
        const x = startX + direction.x * radius;
        const y = startY + direction.y * radius;
        if (!this.planetPlayerCollidesAt(player, island, x, y)) {
          player.x = x;
          player.y = y;
          player.vx *= 0.35;
          player.vy *= 0.35;
          return true;
        }
      }
    }
    return false;
  }

  isPlanetPlayerGrounded(player, island, basis = this.getIslandGravityBasis(island), x = player.x, y = player.y) {
    if (this.planetPlayerCollidesAt(player, island, x, y)) return false;
    return this.getPlanetPlayerFootProbePoints(player, island, x, y, basis)
      .some((point) => this.isTerrainSolidAtPoint(island.terrain, point.x, point.y));
  }

  planetPlayerCollidesAt(player, island, x, y) {
    const terrain = island.terrain;
    if (!terrain) return false;
    const shape = this.getPlanetPlayerCollisionShape(player, island, x, y);
    const xs = shape.corners.map((corner) => corner.x);
    const ys = shape.corners.map((corner) => corner.y);
    const size = terrain.cellSize || 20;
    const left = Math.min(...xs) - 1;
    const right = Math.max(...xs) + 1;
    const top = Math.min(...ys) - 1;
    const bottom = Math.max(...ys) + 1;
    if (terrain.forEachCollisionPolygonInAabb) {
      let hit = false;
      terrain.forEachCollisionPolygonInAabb(left, top, right, bottom, (polygon) => {
        if (!this.orientedBoxIntersectsPolygon(shape, polygon)) return false;
        hit = true;
        return true;
      });
      return hit;
    }
    const startCol = clamp(Math.floor(left / size), 0, terrain.cols - 1);
    const endCol = clamp(Math.floor(right / size), 0, terrain.cols - 1);
    const startRow = clamp(Math.floor(top / size), 0, terrain.rows - 1);
    const endRow = clamp(Math.floor(bottom / size), 0, terrain.rows - 1);
    for (let row = startRow; row <= endRow; row += 1) {
      for (let col = startCol; col <= endCol; col += 1) {
        if (!terrain.isSolidCell(col, row)) continue;
        const cellLeft = col * size;
        const cellTop = row * size;
        if (this.orientedBoxIntersectsAabb(shape, cellLeft, cellTop, cellLeft + size, cellTop + size)) return true;
      }
    }
    return false;
  }

  getPlanetPlayerCollisionFrame(player, island, x = player.x, y = player.y) {
    const centerX = x + player.width * 0.5;
    const centerY = y + player.height * 0.5;
    const basis = this.getIslandGravityBasis(island);
    return {
      centerX,
      centerY,
      outward: basis.outward,
      inward: basis.inward,
      tangent: basis.tangent,
    };
  }

  getPlanetPlayerCollisionShape(player, island, x = player.x, y = player.y) {
    const frame = this.getPlanetPlayerCollisionFrame(player, island, x, y);
    const halfHeight = (PLANET_PLAYER_HEAD_OFFSET + PLANET_PLAYER_FOOT_OFFSET) * 0.5;
    const centerShift = (PLANET_PLAYER_FOOT_OFFSET - PLANET_PLAYER_HEAD_OFFSET) * 0.5;
    const centerX = frame.centerX + frame.inward.x * centerShift;
    const centerY = frame.centerY + frame.inward.y * centerShift;
    const shape = {
      centerX,
      centerY,
      axisX: frame.tangent,
      axisY: frame.inward,
      halfWidth: PLANET_PLAYER_HALF_WIDTH,
      halfHeight,
    };
    shape.corners = [
      this.getCollisionShapeCorner(shape, -1, -1),
      this.getCollisionShapeCorner(shape, 1, -1),
      this.getCollisionShapeCorner(shape, 1, 1),
      this.getCollisionShapeCorner(shape, -1, 1),
    ];
    return shape;
  }

  getCollisionShapeCorner(shape, xSign, ySign) {
    return {
      x: shape.centerX + shape.axisX.x * shape.halfWidth * xSign + shape.axisY.x * shape.halfHeight * ySign,
      y: shape.centerY + shape.axisX.y * shape.halfWidth * xSign + shape.axisY.y * shape.halfHeight * ySign,
    };
  }

  orientedBoxIntersectsAabb(shape, left, top, right, bottom) {
    const aabbCenterX = (left + right) * 0.5;
    const aabbCenterY = (top + bottom) * 0.5;
    const aabbHalfWidth = (right - left) * 0.5;
    const aabbHalfHeight = (bottom - top) * 0.5;
    const axes = [
      shape.axisX,
      shape.axisY,
      { x: 1, y: 0 },
      { x: 0, y: 1 },
    ];
    for (const axis of axes) {
      const boxCenter = shape.centerX * axis.x + shape.centerY * axis.y;
      const boxRadius = shape.halfWidth * Math.abs(shape.axisX.x * axis.x + shape.axisX.y * axis.y)
        + shape.halfHeight * Math.abs(shape.axisY.x * axis.x + shape.axisY.y * axis.y);
      const cellCenter = aabbCenterX * axis.x + aabbCenterY * axis.y;
      const cellRadius = aabbHalfWidth * Math.abs(axis.x) + aabbHalfHeight * Math.abs(axis.y);
      if (Math.abs(boxCenter - cellCenter) > boxRadius + cellRadius) return false;
    }
    return true;
  }

  orientedBoxIntersectsPolygon(shape, polygon) {
    const axes = [
      shape.axisX,
      shape.axisY,
    ];
    for (let index = 0; index < polygon.length; index += 1) {
      const a = polygon[index];
      const b = polygon[(index + 1) % polygon.length];
      const edgeX = b.x - a.x;
      const edgeY = b.y - a.y;
      if (edgeX * edgeX + edgeY * edgeY < 0.0001) continue;
      axes.push({ x: -edgeY, y: edgeX });
    }
    for (const axis of axes) {
      const boxProjection = this.projectCollisionShape(shape, axis);
      const polygonProjection = this.projectPolygon(polygon, axis);
      if (boxProjection.max < polygonProjection.min || polygonProjection.max < boxProjection.min) return false;
    }
    return true;
  }

  projectCollisionShape(shape, axis) {
    const center = shape.centerX * axis.x + shape.centerY * axis.y;
    const radius = shape.halfWidth * Math.abs(shape.axisX.x * axis.x + shape.axisX.y * axis.y)
      + shape.halfHeight * Math.abs(shape.axisY.x * axis.x + shape.axisY.y * axis.y);
    return { min: center - radius, max: center + radius };
  }

  projectPolygon(polygon, axis) {
    let min = Infinity;
    let max = -Infinity;
    for (const point of polygon) {
      const value = point.x * axis.x + point.y * axis.y;
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
    return { min, max };
  }

  getPlanetPlayerCollisionPoints(player, island, x = player.x, y = player.y) {
    const frame = this.getPlanetPlayerCollisionFrame(player, island, x, y);
    const sideOffsets = [-PLANET_PLAYER_HALF_WIDTH, 0, PLANET_PLAYER_HALF_WIDTH];
    const verticalOffsets = [
      -PLANET_PLAYER_HEAD_OFFSET,
      -PLANET_PLAYER_HEAD_OFFSET * 0.45,
      0,
      PLANET_PLAYER_FOOT_OFFSET * 0.55,
      PLANET_PLAYER_FOOT_OFFSET,
    ];
    const points = [];
    for (const vertical of verticalOffsets) {
      for (const side of sideOffsets) {
        points.push({
          x: frame.centerX + frame.tangent.x * side + frame.inward.x * vertical,
          y: frame.centerY + frame.tangent.y * side + frame.inward.y * vertical,
        });
      }
    }
    return points;
  }

  getPlanetPlayerFootProbePoints(player, island, x = player.x, y = player.y, basis = null) {
    const frame = this.getPlanetPlayerCollisionFrame(player, island, x, y);
    const inward = basis?.inward || frame.inward;
    const tangent = basis?.tangent || frame.tangent;
    const sideOffsets = [
      -PLANET_PLAYER_HALF_WIDTH,
      -PLANET_PLAYER_HALF_WIDTH * 0.72,
      -PLANET_PLAYER_HALF_WIDTH * 0.5,
      -PLANET_PLAYER_HALF_WIDTH * 0.25,
      0,
      PLANET_PLAYER_HALF_WIDTH * 0.25,
      PLANET_PLAYER_HALF_WIDTH * 0.5,
      PLANET_PLAYER_HALF_WIDTH * 0.72,
      PLANET_PLAYER_HALF_WIDTH,
    ];
    const probeDistances = [
      PLANET_PLAYER_FOOT_OFFSET + 3,
      PLANET_PLAYER_FOOT_OFFSET + PLANET_PLAYER_GROUND_PROBE,
      PLANET_PLAYER_FOOT_OFFSET + PLANET_PLAYER_GROUND_PROBE * 1.55,
    ];
    const points = [];
    for (const side of sideOffsets) {
      for (const distance of probeDistances) {
        points.push({
          x: frame.centerX + tangent.x * side + inward.x * distance,
          y: frame.centerY + tangent.y * side + inward.y * distance,
        });
      }
    }
    return points;
  }

  isTerrainSolidAtPoint(terrain, x, y) {
    if (terrain.containsCollisionPoint) return terrain.containsCollisionPoint(x, y);
    const { col, row } = terrain.cellFromWorld(x, y);
    return terrain.isSolidCell(col, row);
  }

  updateIslandViewRotation(delta) {
    const target = this.getIslandTargetViewRotation();
    if (this.islandMode === 'onIsland') {
      this.updateIslandViewRotationManual(delta, target);
      return;
    }
    const speed = this.islandMode === 'landing' ? ISLAND_LANDING_PLANET_ROTATION_SPEED : 3.8;
    this.islandViewRotation = normalizeAngle(
      this.islandViewRotation + angleDifference(this.islandViewRotation, target) * Math.min(1, delta * speed),
    );
    this.islandRotationTarget = this.islandViewRotation;
    this.islandRotationSettling = false;
  }

  updateIslandViewRotationManual(delta, centeredTarget) {
    if (!this.activeIsland || !this.islandPlayer) return;
    const holdingStabilizer = this.game.input.actions.stabilize;
    if (holdingStabilizer) {
      const targetDelta = angleDifference(this.islandRotationTarget, centeredTarget);
      const targetStep = clamp(
        targetDelta,
        -ISLAND_STABILIZE_TARGET_FOLLOW_SPEED * delta,
        ISLAND_STABILIZE_TARGET_FOLLOW_SPEED * delta,
      );
      this.islandRotationTarget = normalizeAngle(this.islandRotationTarget + targetStep);
      this.islandRotationSettling = true;
    }
    if (!this.islandRotationSettling) return;

    const remaining = angleDifference(this.islandViewRotation, this.islandRotationTarget);
    if (!holdingStabilizer && Math.abs(remaining) <= ISLAND_STABILIZE_EPSILON) {
      this.islandViewRotation = this.islandRotationTarget;
      this.islandRotationSettling = false;
      return;
    }
    const maxSpeed = holdingStabilizer ? ISLAND_STABILIZE_HOLD_MAX_SPEED : ISLAND_STABILIZE_MAX_SPEED;
    const smoothTime = ISLAND_STABILIZE_SMOOTH_TIME;
    const easedStep = remaining * (1 - Math.exp(-delta / smoothTime));
    const limitedStep = clamp(
      easedStep,
      -maxSpeed * delta,
      maxSpeed * delta,
    );
    this.islandViewRotation = normalizeAngle(
      this.islandViewRotation + limitedStep,
    );
  }

  getIslandTargetViewRotation() {
    if (!this.activeIsland) return 0;
    const angle = this.islandPlayer
      ? this.getPlanetBasis(this.activeIsland, this.islandPlayer).angle
      : this.activeIsland.landingAngle;
    return normalizeAngle(-Math.PI / 2 - angle);
  }

  getIslandViewRotation() {
    return this.activeIsland ? this.islandViewRotation : 0;
  }

  tryRecoverIslandFreefall() {
    const island = this.activeIsland;
    const player = this.islandPlayer;
    if (!island || !player) return;
    const bounds = player.collisionBounds;
    if (!island.terrain.collidesAabb(bounds.left, bounds.top, bounds.right, bounds.bottom)) return;
    for (let step = 0; step < 90; step += 1) {
      player.y -= 1;
      const next = player.collisionBounds;
      if (!island.terrain.collidesAabb(next.left, next.top, next.right, next.bottom)) {
        player.vx *= 0.35;
        player.vy = 0;
        player.onGround = true;
        this.islandFreefall = false;
        return;
      }
    }
  }

  updateIslandBoarding(delta) {
    this.islandBoardingTimer -= delta;
    if (this.islandBoardingTimer > 0) return;
    if (this.activeIsland) {
      const shipLocal = this.activeIsland.getShipParkLocal();
      const exit = this.localToActiveIslandWorld(shipLocal.x, shipLocal.y, this.getIslandViewRotation());
      this.ship.x = exit.x;
      this.ship.y = exit.y;
    }
    this.islandMode = 'flight';
    this.islandPlayer = null;
    this.islandFreefall = false;
    this.islandGravityRecovery = false;
    this.islandGravityRecoveryBlend = 0;
    this.landingIsland = null;
    this.landingTargetPreview = null;
    this.activeIsland = null;
    this.islandLandingTarget = null;
    this.islandLandingAnchor = null;
    this.islandViewRotation = 0;
    this.islandRotationTarget = 0;
    this.islandRotationSettling = false;
    this.resumeSpaceObjectsAfterIsland();
    this.stopIslandTerrainLaser();
    this.hud?.landingPrompt?.classList.add('is-hidden');
    this.game.audio.playBoardShip?.();
    this.game.ui.showToast('Back in the ship.', 'success', 1200);
  }

  boardIntegratedShip() {
    if (!this.activeIsland || this.islandMode !== 'onIsland') return;
    if (this.crashStart && !this.getStoryState().thrustersRepaired) {
      this.handleShipInteract();
      return;
    }
    if (this.islandTerrainDirty) {
      this.game.systems.islands.saveTerrain(this.activeIsland.id, this.activeIsland.terrain);
      this.islandTerrainDirty = false;
    }
    const shipLocal = this.activeIsland.getShipParkLocal();
    const target = this.localToActiveIslandWorld(shipLocal.x, shipLocal.y, this.getIslandViewRotation());
    this.ship.x = target.x;
    this.ship.y = target.y;
    this.ship.vx = 0;
    this.ship.vy = 0;
    this.ship.angle = normalizeAngle(this.activeIsland.landingAngle + this.getIslandViewRotation());
    this.islandMode = 'boarding';
    this.islandBoardingTimer = 0.34;
    this.stopIslandTerrainLaser();
  }

  handleShipInteract() {
    if (!this.crashStart || this.getStoryState().thrustersRepaired) {
      this.boardIntegratedShip();
      return;
    }
    const story = this.getStoryState();
    if (!story.furnaceBuilt) {
      this.startCrashTutorialHint('furnaceHint');
      this.game.ui.showToast('Build a furnace at the crafting station first', 'default', 1700);
      return;
    }
    if (!this.placedFurnaces.length) {
      this.game.ui.showToast('Place the furnace before repairing the ship', 'default', 1500);
      return;
    }
    const repair = gameBalance.earlyGame?.crashStart?.shipRepair?.requirements || {};
    const missing = Object.entries(repair).filter(([itemId, amount]) => (
      this.game.systems.inventory.getStoredAmount(itemId) < amount
    ));
    if (missing.length) {
      const text = missing.map(([itemId, amount]) => {
        const have = this.game.systems.inventory.getStoredAmount(itemId);
        return `${this.game.systems.materials.getDisplayName(itemId)} ${have}/${amount}`;
      }).join(', ');
      this.game.ui.showToast(`Repair needs ${text}`, 'danger', 2200);
      this.startCrashTutorialHint('repairHint');
      return;
    }
    Object.entries(repair).forEach(([itemId, amount]) => {
      this.game.systems.inventory.remove(itemId, amount, { skipSave: true });
    });
    story.thrustersRepaired = true;
    story.stationRouteUnlocked = true;
    this.game.state.navigation.gpsUnlocked = true;
    this.game.state.navigation.scannerLevel = Math.max(1, this.game.state.navigation.scannerLevel || 0);
    this.game.state.navigation.selectedDestinationId = 'station';
    this.game.systems.navigation.discoverLocation('station', { notify: true, save: false });
    this.game.saveGame();
    this.game.audio.playSuccess?.();
    this.spawnBurst(this.ship.x, this.ship.y, '#76f3ff', 28, 160);
    this.game.ui.showToast('Thrusters repaired. Board the ship and follow the station cursor.', 'success', 2800);
    this.game.systems.dialogue.startSet('sparksTutorial', 'repaired', {
      speaker: 'Sparks',
      portraitStyle: { tone: 'forge', shape: 'drone' },
      enqueue: true,
    });
    this.crashStart = false;
  }

  suspendSpaceObjectsForIsland(island) {
    if (this.spaceObjectsSuspended) return;
    this.backgroundAsteroids = this.createIslandBackgroundAsteroids(island);
    this.asteroids.forEach((asteroid) => this.releaseAsteroid(asteroid));
    this.asteroids.length = 0;
    this.pickups.forEach((pickup) => this.releasePickup(pickup));
    this.pickups.length = 0;
    this.rockIslands.forEach((otherIsland) => {
      if (otherIsland !== island) otherIsland.terrain?.releaseRenderCache?.();
    });
    this.laserTarget = null;
    this.laserAimPoint = null;
    this.spaceObjectsSuspended = true;
  }

  resumeSpaceObjectsAfterIsland() {
    if (!this.spaceObjectsSuspended) return;
    this.backgroundAsteroids = [];
    this.backgroundAsteroidSourceId = '';
    this.spaceObjectsSuspended = false;
    while (this.asteroids.length < gameBalance.mining.targetAsteroidCount) {
      const asteroid = this.createAsteroid(gameBalance.mining.asteroidSpawnMinDistance, gameBalance.mining.asteroidSpawnMaxDistance);
      this.asteroids.push(asteroid);
    }
  }

  createIslandBackgroundAsteroids(island) {
    const source = this.asteroids.length ? this.asteroids.slice(0, 18) : [];
    const fallbackCount = Math.max(12, Math.min(22, gameBalance.mining.targetAsteroidCount || 18));
    const count = Math.max(source.length, fallbackCount);
    const items = [];
    for (let index = 0; index < count; index += 1) {
      const asteroid = source[index % Math.max(1, source.length)];
      const seed = ((index + 1) * 9301 + Math.floor((island?.x || 0) * 0.13) + Math.floor((island?.y || 0) * 0.07)) % 9973;
      const angle = seed * 0.017;
      const distance = Math.max(island?.width || 1600, island?.height || 900) * (0.56 + ((seed % 31) / 31) * 0.6);
      items.push({
        x: (island?.x || this.ship.x) + Math.cos(angle) * distance,
        y: (island?.y || this.ship.y) + Math.sin(angle) * distance * 0.58,
        radius: Math.max(10, Math.min(42, (asteroid?.radius || 80) * (0.12 + ((seed % 17) / 17) * 0.12))),
        color: asteroid?.data?.color || '#5f6470',
        accent: asteroid?.data?.accent || '#8fa3b8',
        drift: 0.4 + ((seed % 19) / 19) * 0.9,
        seed,
      });
    }
    return items;
  }

  updateIslandPrompt() {
    if (!this.hud?.landingPrompt || !this.activeIsland || !this.islandPlayer) return;
    this.hud.landingPrompt.classList.remove('is-hidden');
    let text = this.islandFreefall ? 'Gravity device auto-engaged - falling back to the planet' : 'Mine terrain - G stabilizes gravity';
    if (this.isFlagToolSelected()) text = 'Flag tool - aim at ground and click Use';
    if (this.isCraftingStationToolSelected()) text = 'Crafting station - aim at ground and click Use';
    if (this.isFurnaceToolSelected()) text = 'Furnace tool - aim at ground and click Use';
    if (this.crashStart && !this.getStoryState().thrustersRepaired) text = this.getCrashObjectiveText();
    if (this.placedCraftingStation?.overlapsPlayer(this.islandPlayer)) text = 'Press E/A to open crafting station';
    const nearbyFurnace = this.getNearbyFurnace(this.islandPlayer);
    if (nearbyFurnace) text = 'Press E/A to open furnace';
    if (this.activeIsland.isPlayerNearShip(this.islandPlayer)) {
      text = this.crashStart && !this.getStoryState().thrustersRepaired
        ? 'Press E/A to inspect broken thrusters'
        : 'Press E/A to Board Ship';
    }
    this.setHudText('landingPrompt', this.hud.landingPrompt, text);
    if (this.mineButtonLabel) this.mineButtonLabel.textContent = 'Use';
    if (this.mineButtonIcon) this.mineButtonIcon.textContent = 'U';
    this.mineButton?.classList.remove('is-land-mode');
  }

  getCrashObjectiveText() {
    const story = this.getStoryState();
    const inventory = this.game.systems.inventory;
    const crash = gameBalance.earlyGame?.crashStart || {};
    if (!story.furnaceBuilt) {
      const recipe = crash.furnaceRecipe?.requirements || {};
      const stoneNeed = recipe.stoneOre || 0;
      const copperNeed = recipe.copperShards || 0;
      const stoneHave = inventory.getStoredAmount('stoneOre');
      const copperHave = inventory.getStoredAmount('copperShards');
      if (!story.craftingStationPlaced) return 'Select Craft slot 5 and place the crafting station';
      if (stoneHave < stoneNeed || copperHave < copperNeed) return `Mine furnace materials - Stone ${stoneHave}/${stoneNeed}, Copper ${copperHave}/${copperNeed}`;
      return 'Open the crafting station and draw a starter furnace';
    }
    if (!this.placedFurnaces.length) return 'Select Furnace slot 6, aim at ground, and click Use';
    const repair = crash.shipRepair?.requirements || {};
    const ironNeed = repair.ironIngot || 0;
    const copperNeed = repair.copperIngot || 0;
    const ironHave = inventory.getStoredAmount('ironIngot');
    const copperHave = inventory.getStoredAmount('copperIngot');
    if (ironHave < ironNeed || copperHave < copperNeed) {
      return `Smelt ingots at furnace - Iron ${ironHave}/${ironNeed}, Copper ${copperHave}/${copperNeed}`;
    }
    return 'Return to the ship and repair the thrusters';
  }

  updateIslandTerrainMining(delta, preview = null) {
    const island = this.activeIsland;
    const player = this.islandPlayer;
    if (!island || !player) return;
    const laser = preview || this.getIslandTerrainPreview({ updateFacing: true });
    if (!laser) return;
    if (laser.length > 8) this.updateIslandPlayerFacingFromAim(laser.rawAimPoint);
    const hit = laser.hit;
    this.islandMiningBeam = {
      ...laser,
      end: hit ? { x: hit.x, y: hit.y } : laser.end,
      hit,
    };
    this.startIslandTerrainLaser();
    if (!hit) {
      this.islandMiningHitFeedback = null;
      return;
    }
    if (!this.canMineTerrainMaterial(hit.material)) {
      this.stopIslandTerrainLaser();
      this.islandMiningBeam = {
        ...laser,
        end: { x: hit.x, y: hit.y },
        hit,
      };
      this.islandMiningHitFeedback = { ...hit, ratio: 0.04, blocked: true };
      this.showTerrainMineBlocked(hit);
      return;
    }
    const beforeRatio = island.terrain.getDamageRatio(hit.col, hit.row, hit.material);
    const power = this.getTerrainMiningPower();
    const broken = island.terrain.mineCircle(hit.x, hit.y, TERRAIN_MINING_BRUSH_RADIUS, power, delta);
    const brokeTarget = broken.some((cell) => cell.col === hit.col && cell.row === hit.row);
    const afterRatio = brokeTarget ? 1 : island.terrain.getDamageRatio(hit.col, hit.row, hit.material);
    this.islandMiningHitFeedback = {
      ...hit,
      ratio: Math.max(beforeRatio, afterRatio),
      blocked: false,
    };
    const hitWorld = island.localToWorldRotated(hit.x, hit.y, this.getIslandViewRotation());
    this.spawnHitParticles(hitWorld.x, hitWorld.y, TERRAIN_MATERIALS[hit.material]?.edge || '#ffd36b');
    if (!broken.length) return;
    this.islandTerrainDirty = true;
    this.collectIslandTerrainCells(broken);
    this.game.audio.playMineNode?.();
  }

  getTerrainMiningPower() {
    const base = gameBalance.mining.terrainMiningPowerBase ?? 0.42;
    const scale = gameBalance.mining.terrainMiningPowerScale ?? 0.78;
    return base + Math.max(0, this.stats.miningPower || 0) * scale;
  }

  canMineTerrainMaterial(material) {
    const data = TERRAIN_MATERIALS[material];
    const requiredPower = data?.miningPowerRequired ?? 0;
    return (this.stats.miningPower ?? 0) + 0.001 >= requiredPower;
  }

  showTerrainMineBlocked(hit) {
    if (!hit || this.mineBlockedCooldown > 0) return;
    this.mineBlockedCooldown = 0.85;
    const data = TERRAIN_MATERIALS[hit.material] || TERRAIN_MATERIALS[1];
    const requiredPower = data.miningPowerRequired ?? 0;
    const currentPower = this.stats.miningPower ?? 0;
    const requiredMark = requiredPower <= 1.2 ? 2 : requiredPower <= 1.6 ? 3 : 4;
    this.game.ui.showToast(
      `${data.name || 'Material'} needs Miner Mk ${requiredMark} (${currentPower.toFixed(1)} power)`,
      'danger',
      1800,
    );
    const world = this.activeIsland?.localToWorldRotated(hit.x, hit.y, this.getIslandViewRotation()) || hit;
    this.addFloatingText(world.x, world.y, 'Upgrade miner', {
      color: '#ff756f',
      rarity: 'rare',
    });
    this.game.audio.playError();
  }

  startIslandTerrainLaser() {
    if (this.islandLaserSoundActive) return;
    this.islandLaserSoundActive = true;
    this.game.audio.playLaserStart?.();
    this.game.audio.startLaserLoop?.();
  }

  stopIslandTerrainLaser() {
    if (!this.islandLaserSoundActive && !this.islandMiningBeam) return;
    this.islandLaserSoundActive = false;
    this.islandMiningBeam = null;
    this.islandMiningHitFeedback = null;
    this.game.audio.stopLaserLoop?.();
  }

  collectIslandTerrainCells(cells) {
    if (!this.activeIsland) return;
    const grouped = new Map();
    const positions = new Map();
    for (const cell of cells) {
      if (!cell.data?.materialId || !cell.data.yield) continue;
      grouped.set(cell.data.materialId, (grouped.get(cell.data.materialId) || 0) + cell.data.yield);
      positions.set(cell.data.materialId, cell);
    }
    for (const [materialId, amount] of grouped.entries()) {
      if (this.crashStart && this.activeIsland?.id === this.getStoryState().starterPlanetId) {
        this.collectCrashStarterMaterial(materialId, amount, positions.get(materialId));
        continue;
      }
      const result = this.game.systems.inventory.addToRunCargo(materialId, amount, {
        capacity: this.stats.cargoCapacity,
      });
      const material = this.game.systems.materials.getMaterial(materialId);
      const position = positions.get(materialId);
      const world = this.activeIsland.localToWorldRotated(
        position?.x || this.islandPlayer.centerX,
        position?.y || this.islandPlayer.centerY,
        this.getIslandViewRotation(),
      );
      if (!result.ok) {
        this.game.ui.showToast('Cargo Full', 'danger');
        this.game.audio.playCargoFull();
        this.addFloatingText(world.x, world.y, 'Cargo Full', { color: '#ff756f', rarity: 'rare' });
        continue;
      }
      this.runCargo = result.cargo;
      this.runCargoWeight = result.currentWeight;
      this.stats.cargo = Math.ceil(this.runCargoWeight);
      this.runCargoCount += amount;
      this.game.systems.objectives.record('materialCollected', { materialId, amount });
      this.addFloatingText(
        world.x,
        world.y,
        `+${amount} ${this.game.systems.materials.getDisplayName(materialId)}`,
        { color: material?.color || '#fff2cf', rarity: material?.rarity || 'common' },
      );
      this.game.audio.playIslandPickup?.();
    }
  }

  collectCrashStarterMaterial(materialId, amount, position = null) {
    this.game.systems.inventory.add(materialId, amount, { skipSave: true });
    this.game.systems.objectives.record('materialCollected', { materialId, amount });
    const material = this.game.systems.materials.getMaterial(materialId);
    const world = this.activeIsland.localToWorldRotated(
      position?.x || this.islandPlayer.centerX,
      position?.y || this.islandPlayer.centerY,
      this.getIslandViewRotation(),
    );
    this.addFloatingText(
      world.x,
      world.y,
      `+${amount} ${this.game.systems.materials.getDisplayName(materialId)}`,
      { color: material?.color || '#fff2cf', rarity: material?.rarity || 'common' },
    );
    if (materialId === 'stoneOre' && !this.getStoryState().furnaceBuilt) this.startCrashTutorialHint('furnaceHint');
    this.game.audio.playIslandPickup?.();
    this.game.saveGame();
  }

  getIslandAimPoint() {
    const controllerAim = this.getControllerIslandAimPoint();
    if (controllerAim) return controllerAim;
    const pointer = this.game.input.mousePointer;
    if (pointer?.inside && pointer.source === 'canvas' && document.documentElement.dataset.inputMode !== 'touch') {
      return this.screenToIslandLocal(pointer.canvasX, pointer.canvasY);
    }
    return {
      x: this.islandPlayer.centerX + this.islandPlayer.facing * TERRAIN_LASER_RANGE,
      y: this.islandPlayer.centerY - 8,
    };
  }

  getControllerIslandAimPoint() {
    if (!this.game.input.isControllerActive?.() || !this.islandPlayer) return null;
    const aim = this.game.input.aimVector || { x: 0, y: 0 };
    const magnitude = Math.hypot(aim.x, aim.y);
    if (magnitude < 0.12) return null;
    const distance = Math.max(48, TERRAIN_LASER_RANGE * Math.min(1, magnitude));
    return {
      x: this.islandPlayer.centerX + (aim.x / magnitude) * distance,
      y: this.islandPlayer.centerY - 7 + (aim.y / magnitude) * distance,
    };
  }

  screenToIslandLocal(screenX, screenY) {
    if (!this.activeIsland) return { x: 0, y: 0 };
    const viewport = this.game.viewport || { width: 0, height: 0 };
    const scale = Math.max(0.1, this.getActiveViewScale());
    const unscaledX = viewport.width * 0.5 + (screenX - viewport.width * 0.5) / scale;
    const unscaledY = viewport.height * 0.5 + (screenY - viewport.height * 0.5) / scale;
    const islandScreen = this.cameraView.worldToScreen(this.activeIsland.x, this.activeIsland.y);
    const dx = unscaledX - islandScreen.x;
    const dy = unscaledY - islandScreen.y;
    const rotation = -this.getIslandViewRotation();
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    return {
      x: this.activeIsland.width * 0.5 + dx * cos - dy * sin,
      y: this.activeIsland.height * 0.5 + dx * sin + dy * cos,
    };
  }

  getIslandTerrainPreview({ updateFacing = false } = {}) {
    if (!this.activeIsland || !this.islandPlayer) return null;
    const laser = this.getIslandTerrainLaserState(this.getIslandAimPoint(), { updateFacing });
    const hit = laser.length > 8
      ? this.activeIsland.terrain.raycast(laser.start.x, laser.start.y, laser.end.x, laser.end.y)
      : null;
    return {
      ...laser,
      hit,
      end: hit ? { x: hit.x, y: hit.y } : laser.end,
    };
  }

  updateIslandPlayerFacingFromAim(aimPoint) {
    if (!this.islandPlayer || !aimPoint) return;
    const dx = aimPoint.x - this.islandPlayer.centerX;
    if (Math.abs(dx) > 4) this.islandPlayer.facing = dx >= 0 ? 1 : -1;
  }

  getIslandTerrainLaserState(aimPoint, { updateFacing = false } = {}) {
    const start = {
      x: this.islandPlayer.centerX,
      y: this.islandPlayer.centerY - 7,
    };
    const dx = aimPoint.x - start.x;
    const dy = aimPoint.y - start.y;
    const distance = Math.hypot(dx, dy) || 1;
    const directionX = dx / distance;
    const directionY = dy / distance;
    if (updateFacing) this.updateIslandPlayerFacingFromAim(aimPoint);
    const length = Math.min(distance, TERRAIN_LASER_RANGE);
    const end = {
      x: start.x + directionX * length,
      y: start.y + directionY * length,
    };
    return {
      start,
      end,
      origin: start,
      aimPoint: end,
      rawAimPoint: aimPoint,
      range: TERRAIN_LASER_RANGE,
      rangeRatio: TERRAIN_LASER_RANGE > 0 ? length / TERRAIN_LASER_RANGE : 0,
      length,
    };
  }

  updateIslandFloatingText(delta) {
    let write = 0;
    for (let index = 0; index < this.islandFloatingText.length; index += 1) {
      const item = this.islandFloatingText[index];
      item.age += delta;
      item.y -= 28 * delta;
      if (item.age < 1.1) {
        this.islandFloatingText[write] = item;
        write += 1;
      }
    }
    this.islandFloatingText.length = write;
  }

  applyMagnetToPickups(delta) {
    if (!this.stats.collectionMagnet) return;
    this.pickups.forEach((pickup) => {
      const dx = this.ship.x - pickup.x;
      const dy = this.ship.y - pickup.y;
      const distanceSq = dx * dx + dy * dy;
      if (distanceSq > this.stats.collectionMagnet * this.stats.collectionMagnet) return;
      const distance = Math.sqrt(distanceSq) || 1;
      const pull = (1 - distance / this.stats.collectionMagnet) * 260;
      pickup.vx += (dx / distance) * pull * delta;
      pickup.vy += (dy / distance) * pull * delta;
    });
  }

  handleCollisions() {
    if (this.ship.hitCooldown > 0) return;
    let hit = null;
    for (let index = 0; index < this.asteroids.length; index += 1) {
      const asteroid = this.asteroids[index];
      if (this.collidesWithShip(asteroid)) {
        hit = asteroid;
        break;
      }
    }
    if (!hit) return;
    if (this.tryAbsorbCollision()) {
      this.spawnBurst(this.ship.x, this.ship.y, '#76f3ff', 18);
      this.addScreenShake(0.35);
      this.game.ui.showToast('Shield absorbed impact', 'success');
      this.game.audio.playSuccess();
      return;
    }
    if (this.isInvincible()) {
      this.ship.applyKnockback(hit.x, hit.y, hit.data.slippery ? 260 : 190);
      this.spawnBurst(this.ship.x, this.ship.y, '#76f3ff', 10);
      return;
    }
    this.stats.hull = Math.max(0, this.stats.hull - hit.data.damage);
    this.ship.applyKnockback(hit.x, hit.y, hit.data.slippery ? 430 : 300);
    this.addScreenShake(0.75);
    this.spawnBurst(this.ship.x, this.ship.y, '#ff756f', 14);
    this.game.audio.playShipHit();
    if (this.stats.hull <= 0) this.crash();
  }

  tryAbsorbCollision() {
    if (!this.stats.shieldCharges || this.shieldTimer > 0) return false;
    this.shieldTimer = this.stats.shieldCooldown || 24;
    return true;
  }

  updateParticles(delta) {
    this.particleFx.update(delta);
    this.floatingTextFx.update(delta);
  }

  spawnHitParticles(x, y, color) {
    this.particleFx.spawnHit(x, y, color);
  }

  spawnBurst(x, y, color, count, speed = 115) {
    this.particleFx.spawnBurst(x, y, color, count, speed);
  }

  addScreenShake(amount = 0.35) {
    this.camera.shake = Math.max(this.camera.shake, amount);
  }

  addFloatingText(x, y, text, { color = '#fff2cf', rarity = 'common' } = {}) {
    this.floatingTextFx.add(x, y, text, { color, rarity });
  }

  rareFindBurst(x, y, color) {
    this.spawnBurst(x, y, color, 28, 170);
    this.addFloatingText(x, y - 24, 'Rare Find!', { color, rarity: 'rare' });
  }

  dock() {
    if (this.getDistanceFromStation() > DOCK_RADIUS || this.ending) return;
    if (this.runCargoCount > 0) {
      this.beginCargoDump({ returnToStation: true });
      return;
    }
    this.ending = true;
    const summary = this.createSummary('docked', this.runCargo);
    this.game.dockFromMining({ cargo: this.runCargo, summary });
  }

  queueOutOfFuelReturn() {
    if (this.ending || this.outOfFuelReturnQueued) return;
    this.outOfFuelReturnQueued = true;
    this.ending = true;
    this.stopLaserAudio();
    this.game.audio.stopEngineBoost();
    this.addScreenShake(0.45);
    this.spawnBurst(this.ship.x, this.ship.y, '#ff756f', 18, 120);
    this.addFloatingText(this.ship.x, this.ship.y - 34, 'Out of Fuel', { color: '#ff756f', rarity: 'rare' });
    this.game.ui.showToast('Out of fuel. Station tow engaged.', 'danger', 2400);
    this.game.audio.playLowFuelWarning();
    this.game.audio.playSceneTransition();
    const summary = this.createSummary('outOfFuel', this.runCargo);
    window.setTimeout(() => {
      this.game.dockFromMining({ cargo: this.runCargo, summary });
    }, 650);
  }

  recallToStation() {
    if (!this.stats.emergencyRecall || this.recallUsed || this.ending) return;
    this.recallUsed = true;
    this.ending = true;
    const summary = this.createSummary('recalled', this.runCargo);
    this.game.ui.showToast('Emergency recall engaged', 'success');
    this.game.audio.playSceneTransition();
    window.setTimeout(() => {
      this.game.dockFromMining({ cargo: this.runCargo, summary });
    }, 420);
  }

  crash() {
    if (this.ending) return;
    this.ending = true;
    const keptCargo = {};
    const lostCargo = {};
    Object.entries(this.runCargo).forEach(([itemId, amount]) => {
      const kept = Math.floor(amount * 0.3);
      if (kept > 0) keptCargo[itemId] = kept;
      const lost = amount - kept;
      if (lost > 0) lostCargo[itemId] = lost;
    });
    this.spawnBurst(this.ship.x, this.ship.y, '#ff8f3d', 38, 180);
    this.addScreenShake(0.9);
    this.game.audio.playShipCrash();
    this.game.systems.achievements.record('shipCrashed');
    const summary = this.createSummary('crashed', keptCargo, lostCargo);
    window.setTimeout(() => {
      this.game.dockFromMining({ cargo: keptCargo, summary });
    }, 500);
  }

  createSummary(type, cargo, lostCargo = {}) {
    return {
      type,
      cargo,
      lostCargo,
      distance: Math.round(this.stats.maxDistance),
      asteroidsMined: this.stats.asteroidsMined,
      rareFinds: this.stats.rareFinds,
      farthestZone: this.stats.farthestZone,
    };
  }

  updateHud(force = false) {
    const hullRatio = this.stats.hull / this.stats.maxHull;
    const godMode = this.isGodMode();
    const fuelRatio = godMode ? 1 : this.stats.fuel / this.stats.maxFuel;
    const cargoRatio = this.stats.cargo / this.stats.cargoCapacity;
    this.setHudText('hullText', this.hud.hullText, `${Math.ceil(this.stats.hull)}/${this.stats.maxHull}`, force);
    this.setHudText('fuelText', this.hud.fuelText, godMode ? `INF/${this.stats.maxFuel}` : `${Math.ceil(this.stats.fuel)}/${this.stats.maxFuel}`, force);
    this.setHudText('cargoText', this.hud.cargoText, `${this.stats.cargo}/${this.stats.cargoCapacity}`, force);
    this.setHudHeight('hullFill', this.hud.hullFill, Math.round(hullRatio * 100), force);
    this.setHudHeight('fuelFill', this.hud.fuelFill, Math.round(fuelRatio * 100), force);
    this.setHudHeight('cargoFill', this.hud.cargoFill, Math.round(cargoRatio * 100), force);

    const distance = this.distanceFromStation;
    this.setHudText('distanceText', this.hud.distanceText, `${Math.round(distance)}m`, force);
    this.setHudText('zoneChip', this.hud.zoneChip, this.currentZone.name, force);
    this.setHudText('zoneBanner', this.hud.zoneBanner, this.currentZone.name, force);
    this.setHudClass('zoneBannerVisible', this.hud.zoneBanner, 'is-visible', this.zoneBannerTimer > 0, force);
    const angleToStation = Math.atan2(-this.ship.y, -this.ship.x);
    this.hud.stationArrow.style.transform = `rotate(${angleToStation + Math.PI / 2}rad)`;
    const dockVisible = distance * distance <= DOCK_RADIUS_SQ && !this.cargoDumping;
    this.setHudClass('dockVisible', this.dockButton, 'is-hidden', !dockVisible, force);
    if (dockVisible && this.runCargoCount > 0) this.game.systems.tutorial.onDockAvailable();
    this.setHudClass(
      'recallVisible',
      this.recallButton,
      'is-hidden',
      !this.stats.emergencyRecall || this.recallUsed || distance < DOCK_RADIUS * 1.4,
      force,
    );

    const warnings = [];
    if (!godMode && fuelRatio <= 0.18) warnings.push('LOW FUEL');
    if (hullRatio <= 0.25) warnings.push('HULL CRITICAL');
    if (this.stats.cargo >= this.stats.cargoCapacity) warnings.push('CARGO FULL');
    this.setHudText('warning', this.hud.warning, warnings.join('  '), force);
    this.setHudClass('warningPulse', this.hud.warning, 'is-pulsing', warnings.length > 0, force);
    this.setHudClass('fuelLow', this.hud.fuelBar, 'is-low', !godMode && fuelRatio <= 0.18, force);
    this.setHudClass('hullLow', this.hud.hullBar, 'is-low', hullRatio <= 0.25, force);
    this.game.audio.setDangerMode((!godMode && fuelRatio <= 0.18) || hullRatio <= 0.25);
    this.miniMap?.draw({
      ship: this.ship,
      distance,
      zone: this.currentZone,
    });
  }

  setHudText(key, element, value, force = false) {
    if (!element || (!force && this.hudCache[key] === value)) return;
    this.hudCache[key] = value;
    element.textContent = value;
  }

  setHudWidth(key, element, percent, force = false) {
    const value = `${Math.max(0, Math.min(100, percent))}%`;
    if (!element || (!force && this.hudCache[key] === value)) return;
    this.hudCache[key] = value;
    element.style.width = value;
  }

  setHudHeight(key, element, percent, force = false) {
    const value = `${Math.max(0, Math.min(100, percent))}%`;
    if (!element || (!force && this.hudCache[key] === value)) return;
    this.hudCache[key] = value;
    element.style.height = value;
  }

  setHudClass(key, element, className, enabled, force = false) {
    if (!element || (!force && this.hudCache[key] === enabled)) return;
    this.hudCache[key] = enabled;
    element.classList.toggle(className, enabled);
  }

  render(ctx) {
    const { width, height } = this.game.viewport;
    ctx.clearRect(0, 0, width, height);
    this.drawSpace(ctx, width, height);
    this.drawAmbientParticles(ctx);
    this.drawBackgroundAsteroids(ctx);
    ctx.save();
    this.applyWorldScale(ctx, width, height);
    this.drawDistanceRings(ctx);
    this.drawStation(ctx);
    const camera = this.cameraView;
    this.rockIslands.forEach((island) => {
      if (this.islandMode !== 'flight' && island !== this.activeIsland) return;
      const distanceSq = island.distanceSqToPoint(this.camera.x, this.camera.y);
      const visibleRange = Math.max(2200, island.width + island.height, island.gravityFieldRadius * 1.2);
      if (
        distanceSq > visibleRange * visibleRange
        && island !== this.landingIsland
        && island !== this.activeIsland
        && island !== this.gravityIsland
      ) return;
      island.draw(ctx, camera, {
        active: island === this.landingIsland,
        discovered: this.game.systems.navigation.isDiscovered(island.id),
        gravityActive: island === this.gravityIsland || island === this.activeIsland,
        gravityStrength: island === this.gravityIsland || island === this.activeIsland ? Math.max(0.35, this.gravityFieldStrength) : 0,
        time: this.time,
        player: island === this.activeIsland && this.islandMode !== 'landing' ? this.islandPlayer : null,
        drawShip: island === this.activeIsland && (this.islandMode === 'onIsland' || this.islandMode === 'boarding'),
        ship: this.ship,
        shipBroken: island === this.activeIsland && !this.getStoryState().thrustersRepaired,
        viewRotation: island === this.activeIsland ? this.getIslandViewRotation() : 0,
        anchorLocal: island === this.activeIsland && this.islandLandingAnchor?.island === island ? this.islandLandingAnchor.local : null,
        anchorWorld: island === this.activeIsland && this.islandLandingAnchor?.island === island ? this.islandLandingAnchor.world : null,
        placedFlags: island.placedFlags || [],
        placedCraftingStations: island === this.activeIsland && this.placedCraftingStation ? [this.placedCraftingStation] : [],
        placedFurnaces: island === this.activeIsland ? this.placedFurnaces : [],
      });
    });
    this.drawLandingTargetPreview(ctx);
    this.drawIslandMiningBeam(ctx);
    if (this.islandMode === 'flight') {
      this.pickups.forEach((pickup) => pickup.draw(ctx, camera));
      this.asteroids.forEach((asteroid) => asteroid.draw(ctx, camera, {
        highlightHit: this.mouseAimHit?.asteroid === asteroid ? this.mouseAimHit.hit : null,
        time: this.time,
      }));
      this.drawLaser(ctx);
      this.drawMouseAimReticle(ctx);
    }
    this.drawParticles(ctx);
    ctx.restore();
    this.drawShipSmoke(ctx);
    ctx.save();
    this.applyWorldScale(ctx, width, height);
    if (this.islandMode !== 'onIsland' && this.islandMode !== 'boarding') {
      this.ship.draw(ctx, camera, this.game.input, { boost: this.isGodBoosting() });
    }
    if (this.isWeaponToolSelected() && (this.islandMode === 'flight' || this.islandMode === 'onIsland')) {
      this.combatDrone.draw(ctx, camera);
    }
    this.drawCargoTransferEffects(ctx);
    this.drawFloatingText(ctx);
    ctx.restore();
  }

  drawCargoTransferEffects(ctx) {
    this.cargoTransferFx.draw(ctx, this.cameraView);
  }

  drawBackgroundAsteroids(ctx) {
    if (!this.backgroundAsteroids.length) return;
    const centerX = this.game.viewport.width * 0.5;
    const centerY = this.game.viewport.height * 0.5;
    ctx.save();
    for (const rock of this.backgroundAsteroids) {
      const parallax = 0.38;
      const driftX = Math.cos(this.time * rock.drift + rock.seed) * 18;
      const driftY = Math.sin(this.time * rock.drift * 0.7 + rock.seed) * 10;
      const x = centerX + (rock.x - this.camera.x) * parallax + driftX;
      const y = centerY + (rock.y - this.camera.y) * parallax + driftY;
      if (x < -80 || x > this.game.viewport.width + 80 || y < -80 || y > this.game.viewport.height + 80) continue;
      ctx.globalAlpha = this.islandMode === 'flight' ? 0.2 * this.gravityFieldStrength : 0.28;
      ctx.fillStyle = rock.color;
      ctx.strokeStyle = rock.accent;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let index = 0; index < 7; index += 1) {
        const angle = rock.seed * 0.01 + (Math.PI * 2 * index) / 7 + this.time * 0.05;
        const radius = rock.radius * (0.74 + ((rock.seed + index * 13) % 9) * 0.035);
        const px = x + Math.cos(angle) * radius;
        const py = y + Math.sin(angle) * radius;
        if (index === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  applyWorldScale(ctx, width, height) {
    const scale = this.getActiveViewScale();
    if (Math.abs(scale - 1) < 0.001) return;
    ctx.translate(width / 2, height / 2);
    ctx.scale(scale, scale);
    ctx.translate(-width / 2, -height / 2);
  }

  getActiveViewScale() {
    return this.currentViewScale ?? this.viewScale;
  }

  getTargetViewScale() {
    if (
      this.activeIsland
      || this.islandMode === 'landing'
      || this.islandMode === 'onIsland'
      || this.islandMode === 'boarding'
    ) {
      return this.islandViewScale;
    }

    const gravityZoom = clamp01(this.gravityFieldStrength || 0);
    if (gravityZoom > 0) {
      return this.viewScale + (this.islandViewScale - this.viewScale) * gravityZoom;
    }

    return this.viewScale;
  }

  drawSpace(ctx, width, height) {
    const colors = this.getBlendedBackground(this.distanceFromStation);
    const blendBucket = Math.round(this.distanceFromStation / 300);
    const key = `${this.currentZone.id}:${blendBucket}:${width}:${height}`;
    if (this.spaceBackdrop?.key !== key) {
      const gradient = ctx.createRadialGradient(width * 0.5, height * 0.45, 20, width * 0.5, height * 0.45, width);
      gradient.addColorStop(0, colors.inner);
      gradient.addColorStop(0.52, colors.middle);
      gradient.addColorStop(1, colors.outer);
      this.spaceBackdrop = { key, gradient };
    }
    ctx.fillStyle = this.spaceBackdrop.gradient;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(255, 250, 226, 0.82)';
    const starCount = this.distanceFromStation >= RING_SIZE * 4 ? 190 : 120;
    for (let i = 0; i < starCount; i += 1) {
      const parallax = 0.18 + (i % 4) * 0.09;
      const x = ((i * 97 - this.camera.x * parallax) % (width + 40) + width + 40) % (width + 40) - 20;
      const y = ((i * 53 - this.camera.y * parallax) % (height + 40) + height + 40) % (height + 40) - 20;
      ctx.beginPath();
      ctx.arc(x, y, 0.8 + (i % 3) * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawDistanceRings(ctx) {
    const maxDistance = gameBalance.mining.miniMapMaxDistance || RING_SIZE * 5;
    const ringCount = Math.ceil(maxDistance / RING_SIZE);
    const center = this.cameraView.worldToScreen(0, 0);
    const distance = this.distanceFromStation;
    const scale = Math.max(0.1, this.getActiveViewScale());
    ctx.save();
    ctx.lineWidth = Math.max(1.4, 2.4 / scale);
    ctx.font = `${Math.max(12, 13 / scale)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let ring = 1; ring <= ringCount; ring += 1) {
      const radius = ring * RING_SIZE;
      const distanceToRing = Math.abs(distance - radius);
      const closeAlpha = clamp01(1 - distanceToRing / 900);
      const pulse = this.ringCrossingPulse > 0 && closeAlpha > 0.35
        ? Math.sin(this.ringCrossingPulse * 12) * 0.08 + 0.14
        : 0;
      const alpha = 0.11 + closeAlpha * 0.32 + pulse;
      const color = this.getRingColor(ring);
      ctx.strokeStyle = `${color}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`;
      ctx.setLineDash(closeAlpha > 0.02 ? [] : [26 / scale, 18 / scale]);
      ctx.beginPath();
      ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
      ctx.stroke();

      if (closeAlpha > 0.08) {
        const shipAngle = Math.atan2(this.ship.y, this.ship.x);
        const label = this.cameraView.worldToScreen(Math.cos(shipAngle) * radius, Math.sin(shipAngle) * radius);
        ctx.setLineDash([]);
        ctx.fillStyle = `rgba(236, 231, 216, ${0.35 + closeAlpha * 0.5})`;
        ctx.fillText(`${ring * 10}k ring`, label.x, label.y - 18 / scale);
      }
    }
    ctx.restore();
  }

  getRingColor(ring) {
    return RING_COLORS[(ring - 1) % RING_COLORS.length];
  }

  updateAmbientParticles(delta) {
    while (this.ambientParticles.length < 36) {
      this.ambientParticles.push({
        x: Math.random(),
        y: Math.random(),
        speed: 0.08 + Math.random() * 0.12,
        size: 1 + Math.random() * 2,
        phase: Math.random() * Math.PI * 2,
      });
    }
    this.ambientParticles.forEach((particle) => {
      particle.x = (particle.x + particle.speed * delta * 0.04) % 1;
      particle.y = (particle.y + particle.speed * delta * 0.02) % 1;
      particle.phase += delta;
    });
  }

  drawAmbientParticles(ctx) {
    const { width, height } = this.game.viewport;
    ctx.save();
    ctx.fillStyle = this.currentZone.particleColor;
    this.ambientParticles.forEach((particle) => {
      ctx.globalAlpha = 0.16 + Math.sin(particle.phase) * 0.08;
      ctx.beginPath();
      ctx.arc(particle.x * width, particle.y * height, particle.size, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  drawStation(ctx) {
    const screen = this.cameraView.worldToScreen(0, 0);
    ctx.save();
    ctx.translate(screen.x, screen.y);
    ctx.fillStyle = 'rgba(255, 143, 61, 0.12)';
    ctx.beginPath();
    ctx.arc(0, 0, 150, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#76f3ff';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(0, 0, 120, 42, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#263a52';
    ctx.strokeStyle = '#081626';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, 48, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ff8f3d';
    ctx.beginPath();
    ctx.arc(0, 0, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawLaser(ctx) {
    if (this.islandMode === 'onIsland') return;
    this.laserRenderer.drawRangeField(ctx, {
      camera: this.cameraView,
      ship: this.ship,
      radius: this.stats.miningRange,
      aimPoint: this.mouseAimWorld || this.laserAimPoint,
      active: this.game.input.actions.mine,
      time: this.time,
    });
    this.laserRenderer.drawBeam(ctx, {
      camera: this.cameraView,
      ship: this.ship,
      target: this.laserTarget,
      aimPoint: this.laserAimPoint,
      time: this.time,
    });
  }

  drawIslandMiningBeam(ctx) {
    if (!this.activeIsland || !this.islandPlayer || this.islandMode !== 'onIsland') return;
    const screen = this.cameraView.worldToScreen(this.activeIsland.x, this.activeIsland.y);
    ctx.save();
    ctx.translate(screen.x, screen.y);
    ctx.rotate(this.getIslandViewRotation());
    ctx.translate(-this.activeIsland.width / 2, -this.activeIsland.height / 2);
    const flagPlacementMode = this.isFlagToolSelected();
    const furnacePlacementMode = this.isFurnaceToolSelected();
    const craftingStationPlacementMode = this.isCraftingStationToolSelected();
    const placementMode = flagPlacementMode || furnacePlacementMode || craftingStationPlacementMode;
    const state = placementMode
      ? (
        flagPlacementMode
          ? (this.flagPlacementPreview || this.getFlagPlacementPreview())
          : furnacePlacementMode
            ? (this.furnacePlacementPreview || this.getFurnacePlacementPreview())
            : (this.craftingStationPlacementPreview || this.getCraftingStationPlacementPreview())
      )
      : (this.getIslandTerrainPreview({ updateFacing: false }) || this.islandAimPreview || this.islandMiningBeam);
    if (state) {
      this.terrainLaserRenderer.drawRangeField(ctx, {
        worldToScreen: (x, y) => ({ x, y }),
        origin: state.origin,
        radius: state.range,
        aimPoint: state.aimPoint,
        active: Boolean(this.islandMiningBeam),
        time: this.time,
      });
      this.drawIslandTerrainTargetGlow(ctx, state);
      if (flagPlacementMode) this.drawFlagPlacementPreview(ctx, state);
      if (furnacePlacementMode) this.drawFurnacePlacementPreview(ctx, state);
      if (craftingStationPlacementMode) this.drawCraftingStationPlacementPreview(ctx, state);
    }
    if (this.islandMiningHitFeedback) {
      this.activeIsland.terrain.drawDamageFeedback(ctx, this.islandMiningHitFeedback, this.time);
    }
    if (this.islandMiningBeam) {
      const beamState = state || this.islandMiningBeam;
      const hitColor = beamState.hit
        ? (TERRAIN_MATERIALS[beamState.hit.material]?.edge || '#ffcf5a')
        : '#65d6ff';
      this.terrainLaserRenderer.drawBeam(ctx, {
        worldToScreen: (x, y) => ({ x, y }),
        start: beamState.start,
        end: beamState.end,
        hit: beamState.hit,
        time: this.time,
        outerColor: beamState.hit ? 'rgba(255, 207, 90, 0.9)' : 'rgba(101, 214, 255, 0.54)',
        innerColor: beamState.hit ? 'rgba(255, 255, 255, 0.86)' : 'rgba(255, 255, 255, 0.68)',
        hitColor,
        alpha: beamState.hit ? 1 : 0.72,
      });
    }
    ctx.restore();
  }

  drawLandingTargetPreview(ctx) {
    const target = this.islandMode === 'landing' ? this.islandLandingTarget : this.landingTargetPreview;
    if (!target?.island || !target.hit || this.islandMode === 'onIsland' || this.islandMode === 'boarding') return;
    const island = target.island;
    const viewRotation = island === this.activeIsland ? this.getIslandViewRotation() : 0;
    const anchor = island === this.activeIsland && this.islandLandingAnchor?.island === island
      ? this.islandLandingAnchor
      : null;
    const screen = anchor
      ? this.cameraView.worldToScreen(anchor.world.x, anchor.world.y)
      : this.cameraView.worldToScreen(island.x, island.y);
    ctx.save();
    ctx.translate(screen.x, screen.y);
    ctx.rotate(viewRotation);
    if (anchor) ctx.translate(-anchor.local.x, -anchor.local.y);
    else ctx.translate(-island.width / 2, -island.height / 2);
    this.drawLandingTargetGlow(ctx, target);
    ctx.restore();
  }

  drawLandingTargetGlow(ctx, target) {
    const island = target.island;
    const size = island.terrain?.cellSize || 20;
    const hit = target.hit;
    const centerX = hit.col * size + size * 0.5;
    const centerY = hit.row * size + size * 0.5;
    const normalX = Math.cos(target.angle);
    const normalY = Math.sin(target.angle);
    const pulse = 1 + Math.sin(this.time * 12) * 0.06;
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.scale(pulse, pulse);
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = 'rgba(118, 243, 255, 0.18)';
    ctx.shadowColor = '#76f3ff';
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.roundRect(-size * 0.58, -size * 0.58, size * 1.16, size * 1.16, Math.max(4, size * 0.22));
    ctx.fill();
    ctx.globalAlpha = 0.92;
    ctx.strokeStyle = 'rgba(255, 211, 107, 0.96)';
    ctx.lineWidth = 2;
    ctx.setLineDash([size * 0.34, size * 0.2]);
    ctx.lineDashOffset = -this.time * 18;
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.globalAlpha = 0.78;
    ctx.strokeStyle = 'rgba(118, 243, 255, 0.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(normalX * size * 0.62, normalY * size * 0.62);
    ctx.lineTo(normalX * size * 2.3, normalY * size * 2.3);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255, 211, 107, 0.95)';
    ctx.beginPath();
    ctx.arc(normalX * size * 2.45, normalY * size * 2.45, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawIslandTerrainTargetGlow(ctx, state) {
    if (!state?.hit || !this.activeIsland?.terrain) return;
    const hit = state.hit;
    const size = this.activeIsland.terrain.cellSize || 20;
    const material = TERRAIN_MATERIALS[hit.material] || TERRAIN_MATERIALS[1];
    const color = material.edge || '#ffd36b';
    const rgb = hexToRgb(color);
    const centerX = hit.col * size + size * 0.5;
    const centerY = hit.row * size + size * 0.5;
    const pulse = 1 + Math.sin(this.time * 15) * 0.07;
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.scale(pulse, pulse);
    ctx.globalAlpha = 0.38;
    ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.22)`;
    ctx.shadowColor = color;
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.roundRect(-size * 0.5, -size * 0.5, size, size, Math.max(4, size * 0.22));
    ctx.fill();

    ctx.globalAlpha = 0.82;
    ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.9)`;
    ctx.lineWidth = 1.8;
    ctx.setLineDash([size * 0.32, size * 0.22]);
    ctx.lineDashOffset = -this.time * 20;
    ctx.stroke();

    ctx.globalAlpha = 0.24;
    ctx.setLineDash([]);
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(0, 0, TERRAIN_MINING_BRUSH_RADIUS, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  drawFlagPlacementPreview(ctx, state) {
    if (!state?.hit || !this.activeIsland?.terrain) return;
    const viewRotation = this.getIslandViewRotation();
    const outwardAngle = -Math.PI / 2 - viewRotation;
    const outward = { x: Math.cos(outwardAngle), y: Math.sin(outwardAngle) };
    const tangent = { x: -outward.y, y: outward.x };
    const padWidth = 98;
    const flagX = state.hit.x + outward.x * 3;
    const flagY = state.hit.y + outward.y * 3;
    ctx.save();
    ctx.globalAlpha = 0.74;
    ctx.strokeStyle = 'rgba(255, 211, 107, 0.95)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.setLineDash([12, 8]);
    ctx.lineDashOffset = -this.time * 28;
    ctx.beginPath();
    ctx.moveTo(state.hit.x - tangent.x * padWidth * 0.5, state.hit.y - tangent.y * padWidth * 0.5);
    ctx.lineTo(state.hit.x + tangent.x * padWidth * 0.5, state.hit.y + tangent.y * padWidth * 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    const material = TERRAIN_MATERIALS[state.hit.material] || TERRAIN_MATERIALS[1];
    PlacedFlag.drawGhost(ctx, {
      x: flagX,
      y: flagY,
      viewRotation,
      time: this.time,
      accent: material.edge || '#66d8e8',
    });
  }

  drawFurnacePlacementPreview(ctx, state) {
    if (!state?.hit || !this.activeIsland?.terrain) return;
    const viewRotation = this.getIslandViewRotation();
    const outwardAngle = -Math.PI / 2 - viewRotation;
    const outward = { x: Math.cos(outwardAngle), y: Math.sin(outwardAngle) };
    const tangent = { x: -outward.y, y: outward.x };
    const furnaceX = state.hit.x + outward.x * 4;
    const furnaceY = state.hit.y + outward.y * 4;
    const blueprint = this.getStoryState().furnaceInventory?.[0] || this.createDefaultFurnaceBlueprint();
    const footprint = PlacedFurnace.getShapeFootprint(blueprint.shape);
    const padWidth = Math.max(STARTER_FURNACE_WIDTH, footprint.baseWidth + (this.activeIsland.terrain?.cellSize || 22) * 1.5);
    const ready = this.getFurnaceBlueprintCount() > 0;
    ctx.save();
    ctx.globalAlpha = ready ? 0.78 : 0.42;
    ctx.strokeStyle = ready ? 'rgba(255, 159, 67, 0.96)' : 'rgba(255, 117, 111, 0.82)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.setLineDash([16, 10]);
    ctx.lineDashOffset = -this.time * 24;
    ctx.beginPath();
    ctx.moveTo(state.hit.x - tangent.x * padWidth * 0.5, state.hit.y - tangent.y * padWidth * 0.5);
    ctx.lineTo(state.hit.x + tangent.x * padWidth * 0.5, state.hit.y + tangent.y * padWidth * 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    PlacedFurnace.drawGhost(ctx, {
      x: furnaceX,
      y: furnaceY,
      viewRotation,
      time: this.time,
      color: ready ? '#ff9f43' : '#ff756f',
      accent: ready ? '#ffd36b' : '#fff2cf',
      shape: blueprint.shape,
      tileSize: this.activeIsland.terrain?.cellSize || 22,
    });
  }

  drawCraftingStationPlacementPreview(ctx, state) {
    if (!state?.hit || !this.activeIsland?.terrain) return;
    const story = this.getStoryState();
    const viewRotation = this.getIslandViewRotation();
    const outwardAngle = -Math.PI / 2 - viewRotation;
    const outward = { x: Math.cos(outwardAngle), y: Math.sin(outwardAngle) };
    const tangent = { x: -outward.y, y: outward.x };
    const stationX = state.hit.x + outward.x * 4;
    const stationY = state.hit.y + outward.y * 4;
    const ready = Boolean(!story.craftingStationPlaced && this.game.systems.inventory.getStoredAmount('craftingStationKit') > 0);
    ctx.save();
    ctx.globalAlpha = ready ? 0.78 : 0.42;
    ctx.strokeStyle = ready ? 'rgba(118, 243, 255, 0.96)' : 'rgba(255, 117, 111, 0.82)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.setLineDash([16, 10]);
    ctx.lineDashOffset = -this.time * 24;
    ctx.beginPath();
    ctx.moveTo(state.hit.x - tangent.x * CRAFTING_STATION_WIDTH * 0.5, state.hit.y - tangent.y * CRAFTING_STATION_WIDTH * 0.5);
    ctx.lineTo(state.hit.x + tangent.x * CRAFTING_STATION_WIDTH * 0.5, state.hit.y + tangent.y * CRAFTING_STATION_WIDTH * 0.5);
    ctx.stroke();
    ctx.restore();

    PlacedCraftingStation.drawGhost(ctx, {
      x: stationX,
      y: stationY,
      viewRotation,
      time: this.time,
      color: ready ? '#76f3ff' : '#ff756f',
      accent: '#ffd36b',
    });
  }

  drawMouseAimReticle(ctx) {
    if (this.islandMode === 'onIsland') return;
    this.laserRenderer.drawAimReticle(ctx, {
      camera: this.cameraView,
      mouseAimWorld: this.mouseAimWorld,
      mouseAimTarget: this.mouseAimTarget,
      snapRadius: gameBalance.mining.mouseAimSnapRadius || 18,
      time: this.time,
      inputMode: document.documentElement.dataset.inputMode,
    });
  }

  drawParticles(ctx) {
    this.particleFx.draw(ctx, this.cameraView);
  }

  drawShipSmoke(ctx) {
    this.shipSmoke.draw(ctx);
  }

  drawFloatingText(ctx) {
    this.floatingTextFx.draw(ctx, this.cameraView);
  }

  getDistanceFromStation() {
    return Math.hypot(this.ship.x, this.ship.y);
  }

  distanceToShip(entity) {
    return Math.hypot(entity.x - this.ship.x, entity.y - this.ship.y);
  }

  distanceToShipSq(entity) {
    const dx = entity.x - this.ship.x;
    const dy = entity.y - this.ship.y;
    return dx * dx + dy * dy;
  }

  collidesWithShip(entity) {
    if (entity?.body?.collidesWorldCircle) return entity.collidesWith(this.ship);
    return this.distanceToShipSq(entity) < (entity.radius + this.ship.radius) ** 2;
  }
}
