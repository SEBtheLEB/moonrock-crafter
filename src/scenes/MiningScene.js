import { Button } from '../ui/Button.js';
import { Joystick } from '../ui/Joystick.js';
import { Hotbar } from '../ui/Hotbar.js?v=158';
import { Ship } from '../entities/Ship.js?v=158';
import { Asteroid, estimateAsteroidRadius } from '../entities/Asteroid.js?v=158';
import { CompanionDrone } from '../entities/CompanionDrone.js?v=158';
import { MineralPickup } from '../entities/MineralPickup.js?v=158';
import { SpaceIsland } from '../entities/SpaceIsland.js?v=158';
import { IslandPlayer } from '../entities/IslandPlayer.js?v=158';
import { PlacedFlag } from '../entities/PlacedFlag.js?v=158';
import { PlacedTorch, getTorchRotationForSupport } from '../entities/PlacedTorch.js?v=158';
import { PlacedPlatform } from '../entities/PlacedPlatform.js?v=158';
import { PlacedDoor, DOOR_HEIGHT_TILES } from '../entities/PlacedDoor.js?v=158';
import { PlacedFurnace } from '../entities/PlacedFurnace.js?v=158';
import { PlacedCraftingStation } from '../entities/PlacedCraftingStation.js?v=158';
import { PlacedResearchStation } from '../entities/PlacedResearchStation.js?v=158';
import { BaseLab } from '../entities/BaseLab.js?v=158';
import { AsteroidFragmentationSystem } from '../systems/AsteroidFragmentationSystem.js?v=158';
import { EnemySystem } from '../systems/EnemySystem.js?v=158';
import { ShipSmokeSimulation } from '../effects/ShipSmokeSimulation.js?v=158';
import { ParticleBurstSystem } from '../effects/ParticleBurstSystem.js?v=158';
import { FloatingTextSystem } from '../effects/FloatingTextSystem.js?v=158';
import { CargoTransferEffectSystem } from '../effects/CargoTransferEffectSystem.js?v=158';
import { MiningLaserRenderer } from '../effects/MiningLaserRenderer.js?v=158';
import { ElectricLaserRenderer } from '../effects/ElectricLaserRenderer.js?v=158';
import { MiningMiniMap } from '../ui/MiningMiniMap.js?v=158';
import { HOTBAR_SLOT_COUNT, getHotbarSlotForItem } from '../data/hotbar.js?v=158';
import { createItemIconMarkup } from '../data/iconAssets.js?v=159';
import { TERRAIN_MATERIALS } from '../systems/TerrainGrid.js?v=158';
import { drawCraftVoxelPreview } from '../utils/craftVoxelRenderer.js?v=158';
import {
  MACHINE_DETAIL_STATES,
  MACHINE_SHAPE_STATES,
  getCellLayers,
  getAutoShapeType,
  getChamberBounds,
  getNextShapeState,
  getShapeState,
  getShapeStateLabel,
  getTopMaterialId,
  getVoxelEntries,
  isCoreMountedOnMaterial,
  normalizeMachineVoxel,
  validateRecipe as validateMachineRecipe,
} from '../systems/MachineSculptingSystem.js?v=158';
import { asteroids as asteroidData } from '../data/asteroids.js?v=158';
import { gameBalance } from '../data/gameBalance.js?v=158';
import { drawGameArtSprite, isGameArtReady } from '../data/gameArt.js?v=158';

const DOCK_RADIUS = gameBalance.mining.stationDockRadius;
const DOCK_RADIUS_SQ = DOCK_RADIUS * DOCK_RADIUS;
const STATION_SAFE_RADIUS_SQ = (DOCK_RADIUS * 0.7) ** 2;
const ASTEROID_META_BY_ID = Object.fromEntries(asteroidData.map((asteroid) => [asteroid.id, asteroid]));
const MAX_PARTICLES = gameBalance.mining.maxActiveParticles || 150;
const MAX_FLOATING_TEXT = gameBalance.mining.maxFloatingText || 24;
const RING_SIZE = gameBalance.mining.ringSize || 20000;
const RING_COLORS = ['#2f5e89', '#284d82', '#c7602c', '#8d66e8', '#dfe7ff'];
const ASTEROID_CHIP_BRUSH_RADIUS = gameBalance.mining.asteroidMiningBrushRadius || 20;
const GOD_MODE_MINING_MULTIPLIER = 18;
const TERRAIN_LASER_RANGE = 390;
const TERRAIN_MINER_RANGE = 132;
const TERRAIN_MINING_BRUSH_RADIUS = gameBalance.terrain?.miningBrushRadius || 22;
const PLATFORM_PLACE_COUNT = 5;
const PLATFORM_DROP_THROUGH_TIME = 0.28;
const TORCH_SUPPORT_SIDES = [
  { side: 'top', colOffset: 0, rowOffset: -1, normal: { x: 0, y: -1 } },
  { side: 'right', colOffset: 1, rowOffset: 0, normal: { x: 1, y: 0 } },
  { side: 'bottom', colOffset: 0, rowOffset: 1, normal: { x: 0, y: 1 } },
  { side: 'left', colOffset: -1, rowOffset: 0, normal: { x: -1, y: 0 } },
];
const STARTER_FURNACE_WIDTH = 138;
const STARTER_FURNACE_CLEARANCE = 112;
const STARTER_FURNACE_DEPTH = 58;
const STARTER_BASE_BUILD_VERSION = 3;
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
const PLANET_PLAYER_DEFAULT_SIZE = IslandPlayer.getDefaultSize();
const PLANET_PLAYER_HALF_WIDTH = Math.max(10, Math.round(PLANET_PLAYER_DEFAULT_SIZE.width * 0.34));
const PLANET_PLAYER_HEAD_OFFSET = Math.max(10, Math.floor(PLANET_PLAYER_DEFAULT_SIZE.height * 0.48));
const PLANET_PLAYER_FOOT_OFFSET = Math.max(10, Math.floor(PLANET_PLAYER_DEFAULT_SIZE.height * 0.49));
const PLANET_PLAYER_WALL_SLIDE_DAMPING = 0.18;
const PLANET_PLAYER_FEEL = {
  groundAcceleration: 2600,
  groundDeceleration: 3400,
  airAcceleration: 920,
  maxGroundSpeed: 285,
  maxAirSpeed: 230,
  friction: 16,
  slopeFriction: 8,
  jumpForce: 660,
  coyoteTime: 0.14,
  jumpBufferTime: 0.13,
  jumpCutMultiplier: 0.46,
  fallGravityMultiplier: 1.32,
  lowJumpGravityMultiplier: 1.52,
  maxFallSpeed: 860,
  maxStepHeight: 18,
  groundedGravityScale: 0.16,
  landingImpactThreshold: 520,
  hardLandingShakeStrength: 0.2,
  landingDustAmount: 8,
};
const SWORD_COMBAT = {
  baseDamage: 18,
  slashRange: 112,
  slashArcDegrees: 96,
  attackBufferTime: 0.16,
  comboResetTime: 0.78,
  holdAttackRepeatEnabled: true,
  heavySlashMoveSlowdown: 0.82,
  hitStopDuration: 0.035,
  hitShakeStrength: 0.18,
  killShakeStrength: 0.28,
  enemyHitFlashDuration: 0.16,
  comboPattern: [
    { name: 'slash1A', beat: 1, damage: 1, range: 1, knockback: 1, duration: 0.12, cooldown: 0.18 },
    { name: 'slash1B', beat: 1, damage: 1, range: 1, knockback: 1, duration: 0.12, cooldown: 0.18 },
    { name: 'slash2', beat: 2, damage: 1.45, range: 1.14, knockback: 1.34, duration: 0.15, cooldown: 0.22 },
    { name: 'slash3', beat: 3, damage: 2.15, range: 1.34, knockback: 2.1, duration: 0.2, cooldown: 0.32 },
  ],
};
const LASER_GUN_COMBAT = {
  damage: 16,
  range: 560,
  hitRadius: 13,
  cooldown: 0.28,
  effectLife: 0.16,
};
const ISLAND_STABILIZE_MAX_SPEED = 1.45;
const ISLAND_STABILIZE_HOLD_MAX_SPEED = 1.75;
const ISLAND_STABILIZE_SMOOTH_TIME = 0.62;
const ISLAND_STABILIZE_EPSILON = 0.004;
const GRAVITY_MACHINE_BUMPER_ROTATION_SPEED = 1.05;
const GRAVITY_MACHINE_WHEEL_ROTATION_STEP = 0.18;
const GRAVITY_MACHINE_WHEEL_MAX_STEP = 0.55;
const ISLAND_LANDING_CAMERA_SPEED = 1.25;
const ISLAND_LANDING_ZOOM_SPEED = 1.35;
const ISLAND_LANDING_PLANET_ROTATION_SPEED = 0.82;
const ISLAND_LANDING_SHIP_ROTATION_SPEED = 0.9;
const ISLAND_LANDING_MIN_TIME = 3.15;
const ISLAND_LANDING_MAX_TIME = 10.5;
const ISLAND_LANDING_READY_DISTANCE = 8;
const ISLAND_LANDING_READY_ROTATION = 0.035;
const ISLAND_LANDING_READY_SHIP_ANGLE = 0.06;
const ISLAND_BOARDING_DURATION = 1.15;
const ISLAND_GRAVITY_CATCH_FIELD_RATIO = 0.96;
const ISLAND_GRAVITY_RELEASE_OFFSET = 110;

const clamp01 = (value) => Math.max(0, Math.min(1, value));
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const smoothStep = (value) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

function normalizeAngle(angle) {
  let value = angle;
  while (value > Math.PI) value -= Math.PI * 2;
  while (value < -Math.PI) value += Math.PI * 2;
  return value;
}

function angleDifference(from, to) {
  return normalizeAngle(to - from);
}

function approachValue(value, target, maxDelta) {
  if (value < target) return Math.min(target, value + maxDelta);
  if (value > target) return Math.max(target, value - maxDelta);
  return target;
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

function colorWithAlpha(color, alpha) {
  if (String(color).startsWith('rgb(')) {
    return String(color).replace('rgb(', 'rgba(').replace(')', `, ${clamp01(alpha)})`);
  }
  const rgb = hexToRgb(color);
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${clamp01(alpha)})`;
}

export class MiningScene {
  constructor(game, payload = {}) {
    this.game = game;
    this.payload = payload;
    this.game.systems.upgrades.applyUpgrades();
    this.startAtBase = Boolean(payload.startAtBase);
    this.crashStart = Boolean(payload.crashStart) || !game.state.story?.thrustersRepaired;
    this.ship = new Ship(game.state.ship);
    this.combatDrone = new CompanionDrone({ cooldown: 0.48, damage: 18, targetRange: 920 });
    this.enemySystem = new EnemySystem(this);
    this.asteroids = [];
    this.spaceEnemies = [];
    this.pickups = [];
    this.pickupPool = [];
    this.islandPickups = [];
    this.islandPickupPool = [];
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
      this.runCargoSlots = game.systems.inventory.getRunCargoSlotCount(this.runCargo);
      this.runCargoWeight = game.systems.inventory.getRunCargoWeight(this.runCargo);
      this.stats.cargo = this.runCargoSlots;
      this.ship.x = payload.shipPosition?.x ?? 0;
      this.ship.y = payload.shipPosition?.y ?? 0;
      this.ship.vx = 0;
      this.ship.vy = 0;
    } else {
      this.runCargo = game.systems.inventory.beginRunCargo();
      this.runCargoCount = 0;
      this.runCargoSlots = 0;
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
    this.heldItemState = null;
    this.heldItemMoveHandler = null;
    this.distanceRecordTimer = 0;
    this.spaceBackdrop = null;
    this.rockIslands = this.createSpaceIslands();
    this.gravityIsland = null;
    this.gravityFieldStrength = 0;
    this.atmosphereIsland = null;
    this.atmosphereStrength = 0;
    this.atmosphereSurfaceDistance = Infinity;
    this.atmosphereViewRotation = 0;
    this.atmosphereEscapeFx = 0;
    this.approachNoticeIslandId = '';
    this.arrivalNoticeIslandId = '';
    this.backgroundAsteroids = [];
    this.backgroundAsteroidSourceId = '';
    this.backgroundAsteroidFadeTimer = 0;
    this.spaceSpawnWarmupTimer = 0;
    this.loadedIslandFocusId = '';
    this.departedIslandDecorId = '';
    this.spaceObjectsSuspended = false;
    this.terrainPrewarmQueue = [];
    this.deferredCacheReleaseQueued = false;
    this.deferredCacheReleaseKeepIsland = null;
    this.autoParkGraceIslandId = '';
    this.autoParkGraceUntil = 0;
    this.landingIsland = null;
    this.landingTargetPreview = null;
    this.islandMode = 'flight';
    this.activeIsland = null;
    this.islandPlayer = null;
    this.islandLandingTarget = null;
    this.islandLandingAnchor = null;
    this.flagPlacementPreview = null;
    this.platformPlacementPreview = null;
    this.doorPlacementPreview = null;
    this.platformDropTimer = 0;
    this.furnacePlacementPreview = null;
    this.placedFurnace = null;
    this.placedFurnaces = [];
    this.placedCraftingStation = null;
    this.craftingStationPlacementPreview = null;
    this.placedResearchStation = null;
    this.researchStationPlacementPreview = null;
    this.baseLab = null;
    this.survivalModal = null;
    this.activeFurnaceId = '';
    this.voxelCraftState = null;
    this.furnaceModalRefreshTimer = 0;
    this.crashTutorialHints = {};
    this.islandViewRotation = 0;
    this.islandRotationTarget = 0;
    this.islandRotationSettling = false;
    this.gravityMachineManualActive = false;
    this.gravityMachineHotbarSuppressed = false;
    this.gravityMachineLastSelectedSlotId = '';
    this.gravityMachineRotationInput = 0;
    this.gravityMachineWasActive = false;
    this.gravityMachineBlockedToastAt = 0;
    this.islandFreefall = false;
    this.islandGravityRecovery = false;
    this.islandGravityRecoveryBlend = 0;
    this.islandMiningBeam = null;
    this.islandMiningHitFeedback = null;
    this.islandAimPreview = null;
    this.buildPlacementPreview = null;
    this.activeBuildItemId = null;
    this.activeBuildMode = 'foregroundBlock';
    this.buildSnapCursorEnabled = false;
    this.buildSnapCursorTile = null;
    this.buildSnapCursorStepCooldown = 0;
    this.buildSaveDelay = 0;
    this.sword = {
      active: null,
      effects: [],
      comboIndex: 0,
      cooldown: 0,
      resetTimer: 0,
      bufferTimer: 0,
    };
    this.laserGun = {
      cooldown: 0,
      effects: [],
    };
    this.hitStopTimer = 0;
    this.movementDebug = {
      showGroundProbes: false,
      showTerrainNormal: false,
      showVelocity: false,
      showGroundedState: false,
      showCoyoteTimer: false,
      showSurfaceTangent: false,
      showHitboxes: false,
    };
    this.debugKeyLatch = {};
    this.islandLaserSoundActive = false;
    this.islandTerrainDirty = false;
    this.islandLandingTimer = 0;
    this.islandBoardingTimer = 0;
    this.islandBoardingDuration = ISLAND_BOARDING_DURATION;
    this.islandBoardingStartRotation = 0;
    this.islandBoardingTargetRotation = 0;
    this.islandFloatingText = [];
    this.islandTerrainParticles = [];
    this.pickupSaveDelay = 0;
    this.pickupSavePending = false;
    this.pickupSurfaceChecksThisFrame = 0;
    this.torchPlacementPreview = null;
    this.gpsPingTimer = 0;
    this.destinationIndicator = null;
    this.destinationIndicatorAngle = 0;
    this.destinationIndicatorReady = false;
    this.destinationReachedId = '';
    this.cargoDumping = false;
    this.cargoDumpTimer = 0;
    this.cargoDumpSummary = null;
    this.cargoDumpReturnToStation = false;
    this.cargoDumpCooldown = 0;
    this.outOfFuelReturnQueued = false;
    const story = this.getStoryState();
    if (
      story.thrustersRepaired
      && (!story.nextObjectiveIslandId || !this.game.state.navigation.selectedDestinationId || this.game.state.navigation.selectedDestinationId === 'base')
    ) {
      this.assignPostRepairDestination({ save: false });
    }
  }

  createSpaceIslands() {
    return this.game.systems.islands.getAllIslands().map((island) => {
      const world = this.createIslandWorld(island);
      const terrain = this.game.systems.islands.createTerrain(island, world);
      return new SpaceIsland({
        ...island,
        placedFlags: this.game.systems.islands.getSavedFlags(island.id),
        placedTorches: this.game.systems.islands.getSavedTorches(island.id),
        placedPlatforms: this.game.systems.islands.getSavedPlatforms(island.id),
        placedDoors: this.game.systems.islands.getSavedDoors(island.id),
        shipAnchor: this.game.systems.islands.getSavedShipAnchor(island.id),
      }, terrain);
    });
  }

  createIslandWorld(island) {
    return {
      width: island.size?.width || 1500,
      height: Math.max(island.size?.height || 760, 680),
      floorY: Math.max(300, (island.size?.height || 760) * 0.62),
      landingX: island.landingX || Math.max(180, (island.size?.width || 1500) * 0.22),
      gravity: 1560,
      allowExitBounds: true,
      allowFreefall: true,
    };
  }

  getCurrentPlanetIdentifier() {
    const island = this.activeIsland || this.landingIsland || this.atmosphereIsland;
    return island?.tag || island?.planetTag || island?.id || '';
  }

  regeneratePlanet(tagOrId = this.getCurrentPlanetIdentifier()) {
    const islandData = this.game.systems.islands.regenerateIsland(tagOrId);
    if (!islandData) {
      this.game.ui.showToast(`Planet ${tagOrId || 'target'} not found`, 'danger');
      return false;
    }
    const runtimeIsland = this.rockIslands.find((island) => island.id === islandData.id);
    if (!runtimeIsland) {
      this.rockIslands = this.createSpaceIslands();
      this.game.ui.showToast(`Regenerated ${islandData.tag || islandData.id}`, 'success');
      return true;
    }

    runtimeIsland.terrain?.releaseRenderCache?.();
    runtimeIsland.data = islandData;
    runtimeIsland.tag = islandData.tag || islandData.planetTag || runtimeIsland.tag;
    runtimeIsland.planetTag = runtimeIsland.tag;
    runtimeIsland.placedFlags = [];
    runtimeIsland.placedTorches = [];
    runtimeIsland.placedPlatforms = [];
    runtimeIsland.placedDoors = [];
    runtimeIsland.terrain = this.game.systems.islands.createTerrain(islandData, this.createIslandWorld(islandData));
    if (islandData.id === this.getStoryState().starterPlanetId) this.ensureStarterBaseCamp(runtimeIsland);
    if (this.activeIsland?.id === runtimeIsland.id) {
      this.activeIsland = runtimeIsland;
      this.landingIsland = runtimeIsland;
      this.atmosphereIsland = runtimeIsland;
      if (this.islandPlayer) this.seedPlanetPlayer(runtimeIsland, this.islandPlayer);
      this.enemySystem.setActiveIsland(runtimeIsland);
      this.islandTerrainDirty = false;
    }
    this.updateHud(true);
    this.game.ui.showToast(`Regenerated ${runtimeIsland.tag || runtimeIsland.id}`, 'success');
    return true;
  }

  startCrashPlanet() {
    const story = this.getStoryState();
    this.game.systems.inventory.clearRunCargo();
    this.runCargo = this.game.systems.inventory.getRunCargo();
    this.runCargoCount = 0;
    this.runCargoSlots = 0;
    this.runCargoWeight = 0;
    this.stats.cargo = 0;

    const island = this.rockIslands.find((entry) => entry.id === story.starterPlanetId)
      || this.rockIslands.find((entry) => entry.kind === 'story')
      || this.rockIslands[0];
    if (!island) {
      this.seedAsteroidField();
      return;
    }

    this.activeIsland = island;
    this.departedIslandDecorId = '';
    this.landingIsland = island;
    this.gravityIsland = island;
    this.gravityFieldStrength = 1;
    this.atmosphereIsland = island;
    this.atmosphereStrength = 1;
    this.atmosphereSurfaceDistance = 0;
    this.atmosphereViewRotation = 0;
    this.islandMode = 'onIsland';
    this.islandViewRotation = 0;
    this.islandRotationTarget = 0;
    this.islandRotationSettling = false;
    this.islandLandingAnchor = null;
    this.islandFreefall = false;
    this.islandGravityRecovery = false;
    this.islandGravityRecoveryBlend = 0;
    island.landingAngle = -Math.PI / 2;
    this.ensureStarterBaseCamp(island);

    const shipLocal = island.getShipParkLocal();
    const shipWorld = island.localToWorldRotated(shipLocal.x, shipLocal.y, 0);
    this.ship.x = shipWorld.x;
    this.ship.y = shipWorld.y;
    this.ship.vx = 0;
    this.ship.vy = 0;
    this.ship.angle = island.landingAngle;
    this.distanceFromStation = this.getDistanceFromStation();

    const playerSize = IslandPlayer.getDefaultSize();
    const exit = this.baseLab?.getSpawnPoint?.(playerSize) || island.getPlayerExitLocal(playerSize);
    this.islandPlayer = new IslandPlayer({ x: exit.x, y: exit.y });
    if (!this.baseLab) this.seedPlanetPlayer(island, this.islandPlayer);
    else this.initializePlanetPlayerFeel(this.islandPlayer);
    this.loadCrashFurnace();
    this.enemySystem.setActiveIsland(island);
    this.suspendSpaceObjectsForIsland(island);
    this.prewarmIslandTerrain(island);
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
    this.game.state.story.researchStationPlaced ||= false;
    this.game.state.story.researchStation ||= null;
    this.game.state.story.baseLab ||= null;
    this.game.state.story.gravityMachineBuilt ||= this.game.systems.inventory?.getStoredAmount?.('gravityStabilizer') > 0;
    this.game.state.story.nextObjectiveIslandId ||= null;
    return this.game.state.story;
  }

  getGravityStabilizerLevel() {
    return Math.max(1, Number(this.game.state.ship?.gravityStabilizerLevel) || 1);
  }

  hasGravityMachine() {
    return this.getAvailableItemAmount('gravityStabilizer') > 0;
  }

  canUseGravityStabilizerOnIsland(island = this.activeIsland) {
    if (!island) return true;
    return this.hasGravityMachine() && this.getGravityStabilizerLevel() >= (island.gravityStabilizerRequirement || 1);
  }

  getGravityStabilizerBlockMessage(island = this.activeIsland) {
    if (!this.hasGravityMachine()) return 'Craft a Gravity Machine at the crafting station first.';
    const requirement = island?.gravityStabilizerRequirement || 1;
    const label = island?.getDisplayName?.() || island?.name || 'This planet';
    return `${label} has dense atmosphere. Gravity Machine Mk ${requirement} required.`;
  }

  getPostRepairObjectiveIsland() {
    const story = this.getStoryState();
    const level = this.getGravityStabilizerLevel();
    const stored = story.nextObjectiveIslandId
      ? this.rockIslands.find((island) => island.id === story.nextObjectiveIslandId)
      : null;
    if (stored && (stored.gravityStabilizerRequirement || 1) > level) return stored;
    const origin = this.ship || { x: 0, y: 0 };
    const islandData = this.game.systems.islands.pickNextHigherAtmosphereIsland?.(origin, {
      currentStabilizerLevel: level,
    });
    if (!islandData) return null;
    return this.rockIslands.find((island) => island.id === islandData.id) || islandData;
  }

  assignPostRepairDestination({ save = false } = {}) {
    const target = this.getPostRepairObjectiveIsland();
    if (!target) return null;
    const story = this.getStoryState();
    story.nextObjectiveIslandId = target.id;
    this.game.state.navigation.gpsUnlocked = true;
    this.game.state.navigation.scannerLevel = Math.max(1, this.game.state.navigation.scannerLevel || 0);
    this.game.state.navigation.selectedDestinationId = target.id;
    this.game.systems.navigation.refreshLocations?.();
    this.game.systems.navigation.discoverLocation(target.id, { notify: false, save: false });
    if (save) this.game.saveGame();
    return target;
  }

  ensureStarterBaseCamp(island) {
    if (!island?.terrain) return null;
    const story = this.getStoryState();
    const shouldCreate = !story.baseLab
      || story.baseLab.islandId !== island.id
      || story.baseLab.buildVersion !== STARTER_BASE_BUILD_VERSION;
    if (shouldCreate) {
      const surface = island.getSurfaceLocalAtAngle(-Math.PI / 2, 0);
      const baseStamp = this.game.systems.building?.stampStarterBaseOnIsland?.(island, {
        surfaceX: surface.x,
        surfaceY: surface.y,
      });
      const lab = new BaseLab(baseStamp?.lab || {
        x: surface.x - 300,
        y: surface.y,
        width: 390,
        height: 176,
      });
      const hoverDock = baseStamp?.landingSurfaceLocal || { x: surface.x + 250, y: surface.y };
      island.setLandingTargetLocal(hoverDock, { landingAngle: -Math.PI / 2 });
      story.baseLab = {
        ...lab.serialize(),
        islandId: island.id,
        landingSurfaceLocal: { x: hoverDock.x, y: hoverDock.y },
        shipHoverDockLocal: { x: hoverDock.x, y: hoverDock.y },
      };
      const craftPoint = lab.getCraftingStationPoint();
      const researchPoint = lab.getResearchStationPoint();
      const crafting = new PlacedCraftingStation({
        x: craftPoint.x,
        y: craftPoint.y,
        rotation: craftPoint.rotation,
        compact: true,
        shape: PlacedCraftingStation.createDefaultShape(),
      });
      const research = new PlacedResearchStation({
        x: researchPoint.x,
        y: researchPoint.y,
        rotation: researchPoint.rotation,
        compact: true,
      });
      story.craftingStationPlaced = true;
      story.craftingStation = { ...crafting.serialize(), islandId: island.id };
      story.researchStationPlaced = true;
      story.researchStation = { ...research.serialize(), islandId: island.id };
      this.game.systems.inventory.remove('craftingStationKit', 1, { skipSave: true });
      this.game.systems.inventory.remove('researchStationKit', 1, { skipSave: true });
      this.game.state.base = {
        established: true,
        islandId: island.id,
        flagId: null,
        local: { x: lab.x, y: lab.y - 78 },
      };
      this.game.state.navigation.gpsUnlocked = true;
      this.game.state.navigation.scannerLevel = Math.max(1, this.game.state.navigation.scannerLevel || 0);
      this.game.state.navigation.selectedDestinationId = 'base';
      this.game.systems.islands.saveTerrain(island.id, island.terrain);
      this.game.systems.navigation?.refreshLocations?.();
      this.game.saveGame();
    } else if (story.baseLab?.landingSurfaceLocal || story.baseLab?.shipHoverDockLocal) {
      island.setLandingTargetLocal(
        story.baseLab.shipHoverDockLocal || story.baseLab.landingSurfaceLocal,
        { landingAngle: -Math.PI / 2 },
      );
    }

    this.baseLab = story.baseLab?.islandId === island.id ? BaseLab.deserialize(story.baseLab) : null;
    if (this.baseLab && !this.game.state.base?.established) {
      this.game.state.base = {
        established: true,
        islandId: island.id,
        flagId: null,
        local: { x: this.baseLab.x, y: this.baseLab.y - 78 },
      };
      this.game.state.navigation.gpsUnlocked = true;
      this.game.state.navigation.scannerLevel = Math.max(1, this.game.state.navigation.scannerLevel || 0);
      this.game.state.navigation.selectedDestinationId = 'base';
      this.game.systems.navigation?.refreshLocations?.();
      this.game.saveGame();
    } else if (this.game.state.base?.established && !this.game.state.navigation?.selectedDestinationId) {
      this.game.state.navigation.selectedDestinationId = 'base';
      this.game.systems.navigation?.refreshLocations?.();
      this.game.saveGame();
    }
    if (this.baseLab) this.ensureStarterBaseDoor(island, this.baseLab);
    return this.baseLab;
  }

  ensureStarterBaseDoor(island, lab = this.baseLab) {
    if (!island || !lab) return null;
    const doorCells = lab.doorCells || (
      Number.isFinite(lab.leftCol) && Number.isFinite(lab.floorRow)
        ? {
          left: {
            col: lab.leftCol,
            top: lab.floorRow - DOOR_HEIGHT_TILES,
            bottom: lab.floorRow - 1,
          },
        }
        : null
    );
    if (!doorCells) return null;
    const side = lab.doorSide || 'left';
    const doorCell = doorCells[side] || doorCells.left || doorCells.right;
    const col = Number(doorCell?.col);
    const topRow = Number(doorCell?.top ?? doorCell?.topRow);
    if (!Number.isFinite(col) || !Number.isFinite(topRow)) return null;

    island.placedDoors ||= [];
    const tileSize = island.terrain?.cellSize || lab.cellSize || 25;
    const roundedCol = Math.round(col);
    const roundedTop = Math.round(topRow);
    const id = `${island.id}-starter-lab-door-${side}`;
    const material = TERRAIN_MATERIALS[10] || {};
    let changed = false;
    let door = island.placedDoors.find((entry) => entry.id === id);
    if (!door) {
      door = island.placedDoors.find((entry) => (
        Math.round(entry.col) === roundedCol
        && Math.round(entry.topRow) === roundedTop
      ));
    }

    if (door) {
      if (!door.id || door.id !== id) {
        door.id = id;
        changed = true;
      }
      if (door.tileSize !== tileSize) {
        door.tileSize = tileSize;
        changed = true;
      }
    } else {
      door = new PlacedDoor({
        id,
        col: roundedCol,
        topRow: roundedTop,
        tileSize,
        color: material.color || '#9fafbd',
        edge: material.edge || '#26313d',
        accent: '#76f3ff',
        openDirection: side === 'right' ? -1 : 1,
      });
      island.placedDoors.push(door);
      changed = true;
    }

    if (changed) this.game.systems.islands.saveDoors(island.id, island.placedDoors);
    return door;
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
    const activeIslandId = this.activeIsland?.id || story.starterPlanetId;
    this.placedFurnaces = (story.furnaces || [])
      .filter((furnace) => !furnace.islandId || furnace.islandId === activeIslandId)
      .map((furnace) => PlacedFurnace.deserialize(furnace));
    this.placedFurnace = this.placedFurnaces[0] || null;
    const craftingOnActiveIsland = !story.craftingStation?.islandId || story.craftingStation.islandId === activeIslandId;
    const researchOnActiveIsland = !story.researchStation?.islandId || story.researchStation.islandId === activeIslandId;
    this.placedCraftingStation = story.craftingStationPlaced && story.craftingStation && craftingOnActiveIsland
      ? PlacedCraftingStation.deserialize(story.craftingStation)
      : null;
    this.placedResearchStation = story.researchStationPlaced && story.researchStation && researchOnActiveIsland
      ? PlacedResearchStation.deserialize(story.researchStation)
      : null;
  }

  showCrashIntro() {
    if (gameBalance.tutorialDialogueEnabled === false) return;
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
      cargoCapacity: this.game.systems.inventory.getRunCargoSlotCapacity?.() ?? ship.cargoSlots ?? ship.cargoMax ?? 14,
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
    if (this.crashStart || this.startAtBase) {
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
      <div class="zone-chip" data-zone-chip>Inner Circle</div>
      <div class="planet-visor is-hidden" data-planet-visor>
        <span data-planet-tag>P--</span>
        <strong data-planet-status>Surface</strong>
      </div>
      <div class="mining-warning" data-warning></div>
      <div class="zone-banner" data-zone-banner>Inner Circle</div>
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
    const playerHealth = document.createElement('div');
    playerHealth.className = 'player-health-hearts';
    playerHealth.setAttribute('aria-label', 'Player health');
    playerHealth.innerHTML = Array.from({ length: 5 }, (_, index) => `
      <span class="meteor-heart" data-player-heart="${index}" aria-hidden="true">
        <i></i>
      </span>
    `).join('');
    const vitals = document.createElement('div');
    vitals.className = 'mining-vitals';
    vitals.innerHTML = `
      <div class="mining-bar hull-bar">
        <span>Hull</span>
        <div><i data-hull-fill></i></div>
        <strong data-hull-text></strong>
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
    mapStack.append(this.miniMap.element, quickInventory, playerHealth, vitals);
    hud.append(mapStack);
    this.hud = {
      mapStack,
      playerHealth,
      playerHearts: Array.from(playerHealth.querySelectorAll('[data-player-heart]')),
      hullText: vitals.querySelector('[data-hull-text]'),
      hullFill: vitals.querySelector('[data-hull-fill]'),
      fuelText: null,
      fuelFill: null,
      cargoText: vitals.querySelector('[data-cargo-text]'),
      cargoFill: vitals.querySelector('[data-cargo-fill]'),
      stationArrow: hud.querySelector('[data-station-arrow]'),
      distanceText: hud.querySelector('[data-distance-text]'),
      zoneChip: hud.querySelector('[data-zone-chip]'),
      planetVisor: hud.querySelector('[data-planet-visor]'),
      planetTag: hud.querySelector('[data-planet-tag]'),
      planetStatus: hud.querySelector('[data-planet-status]'),
      zoneBanner: hud.querySelector('[data-zone-banner]'),
      warning: hud.querySelector('[data-warning]'),
      gpsPanel: hud.querySelector('[data-gps-panel]'),
      gpsArrow: hud.querySelector('[data-gps-arrow]'),
      gpsName: hud.querySelector('[data-gps-name]'),
      gpsDistance: hud.querySelector('[data-gps-distance]'),
      gpsWarning: hud.querySelector('[data-gps-warning]'),
      landingPrompt: hud.querySelector('[data-landing-prompt]'),
      cargoBar: vitals.querySelector('.cargo-bar'),
      fuelBar: null,
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
    const moveStick = new Joystick({ label: 'Move', className: 'move-joystick', mode: 'move' }).element;
    const aimStick = new Joystick({ label: 'Aim', className: 'aim-joystick', mode: 'aim' }).element;
    this.hotbar = new Hotbar(this.game, { className: 'mining-tool-hotbar' });
    this.game.ui.addSceneElement(this.hotbar.element);
    const useButton = new Button('Use', () => {}, {
      icon: 'U',
      className: 'mine-hold-button',
      variant: 'forge',
      holdAction: 'primaryUse',
    }).element;
    const jumpButton = new Button('Jump', () => {}, {
      icon: '^',
      className: 'touch-jump-button',
      variant: 'metal',
      holdAction: 'jump',
    }).element;
    const interactButton = new Button('Act', () => {}, {
      icon: 'E',
      className: 'touch-interact-button',
      variant: 'metal',
      holdAction: 'interact',
    }).element;
    const utilityButtons = document.createElement('div');
    utilityButtons.className = 'touch-utility-buttons';
    utilityButtons.append(jumpButton, interactButton);
    const actionCluster = document.createElement('div');
    actionCluster.className = 'mining-action-controls';
    actionCluster.append(aimStick, utilityButtons, useButton);
    this.moveStick = moveStick;
    this.aimStick = aimStick;
    this.mineButton = useButton;
    this.mineButtonLabel = useButton.querySelector('span:last-child');
    this.mineButtonIcon = useButton.querySelector('.button-icon');
    this.game.ui.addControls([moveStick, actionCluster]);
    this.game.input.bindJoystick(moveStick, { mode: 'move', radius: 46, floating: true, activationRegion: 'left' });
    this.game.input.bindJoystick(aimStick, {
      mode: 'aim',
      radius: 54,
      floating: true,
      activationRegion: 'right',
      holdAction: 'aimUse',
    });
    this.game.input.bindHoldButton(useButton, 'primaryUse');
    this.game.input.bindHoldButton(jumpButton, 'jump');
    this.game.input.bindHoldButton(interactButton, 'interact');
  }

  exit() {
    this.flushPendingPickupSave();
    this.cancelItemDrag({ returnHeldToInventory: true });
    this.closeSurvivalModal();
    this.closeQuickInventory();
    this.setGravityMachineInputFlag(false);
    this.moveStick?.__inputCleanup?.();
    this.aimStick?.__inputCleanup?.();
    this.game.audio.stopLaserLoop();
    this.game.audio.stopEngineBoost();
    this.game.audio.setDangerMode(false);
    if (!this.game.isResettingWorld && this.activeIsland && this.islandTerrainDirty) {
      this.game.systems.islands.saveTerrain(this.activeIsland.id, this.activeIsland.terrain);
      this.islandTerrainDirty = false;
    }
    this.stopIslandTerrainLaser?.();
    this.enemySystem?.clear();
    this.shipSmoke?.clear();
    this.combatDrone?.clear();
    this.game.input.virtualButtons.set('mine', false);
    this.game.input.virtualButtons.set('attack', false);
    this.game.input.virtualButtons.set('primaryUse', false);
    this.game.input.virtualButtons.set('aimUse', false);
    this.game.input.virtualButtons.set('jump', false);
    this.game.input.virtualButtons.set('interact', false);
  }

  seedAsteroidField() {
    for (let i = 0; i < gameBalance.mining.targetAsteroidCount; i += 1) {
      const asteroid = this.createAsteroid(gameBalance.mining.asteroidSpawnMinDistance * 0.65, 2400);
      if (asteroid) this.asteroids.push(asteroid);
    }
  }

  createAsteroid(minDistance = 360, spawnRange = gameBalance.mining.asteroidSpawnMaxDistance) {
    let fallback = null;
    for (let attempt = 0; attempt < 64; attempt += 1) {
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
    if (!fallback || fallback.clearance < 0) return null;
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
    const surfaceGap = gameBalance.mining.asteroidPlanetSurfaceClearance || 3000;
    for (const island of this.rockIslands || []) {
      const broadRadius = (island.atmosphereRadius || island.gravityFieldRadius || island.radius || 0)
        + surfaceGap
        + candidate.radius
        + 400;
      const dx = candidate.x - island.x;
      const dy = candidate.y - island.y;
      if (dx * dx + dy * dy > broadRadius * broadRadius) continue;
      const surfaceClearance = island.getSurfaceClearanceToPoint?.(candidate.x, candidate.y, candidate.radius) ?? Infinity;
      clearance = Math.min(clearance, surfaceClearance - surfaceGap);
    }
    return clearance;
  }

  isAsteroidTooCloseToIsland(asteroid) {
    const surfaceGap = gameBalance.mining.asteroidPlanetSurfaceClearance || 3000;
    return (this.rockIslands || []).some((island) => (
      this.isPointNearIslandBroadphase(asteroid.x, asteroid.y, island, surfaceGap + asteroid.radius + 400)
      && (island.getSurfaceClearanceToPoint?.(asteroid.x, asteroid.y, asteroid.radius) ?? Infinity) < surfaceGap
    ));
  }

  isPointNearIslandBroadphase(x, y, island, padding = 0) {
    if (!island) return false;
    const broadRadius = (island.atmosphereRadius || island.gravityFieldRadius || island.radius || 0) + padding;
    const dx = x - island.x;
    const dy = y - island.y;
    return dx * dx + dy * dy <= broadRadius * broadRadius;
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
    let spawn = null;
    for (let attempt = 0; attempt < 16; attempt += 1) {
      const distance = 720 + attempt * 520;
      const seed = Math.random();
      const candidate = {
        x: this.ship.x + Math.cos(angle) * distance,
        y: this.ship.y + Math.sin(angle) * distance,
        type: meta.id,
        seed,
        fragmentTier: 2,
        radius: estimateAsteroidRadius({ type: meta.id, seed, fragmentTier: 2 }),
      };
      if (this.getAsteroidSpawnClearance(candidate) >= 0) {
        spawn = candidate;
        break;
      }
    }
    if (!spawn) {
      this.game.ui.showToast('Rare asteroid needs open space away from planets', 'danger', 1700);
      return;
    }
    const asteroid = this.acquireAsteroid(spawn);
    asteroid.scannerRevealed = true;
    this.asteroids.push(asteroid);
    this.game.audio.playRareFind();
  }

  jumpToStation() {
    const base = this.game.systems.navigation.getLocation('base');
    this.ship.x = base?.worldPosition?.x ?? 0;
    this.ship.y = base?.worldPosition?.y ?? 0;
    this.ship.vx = 0;
    this.ship.vy = 0;
    this.shipSmoke?.clear();
    this.distanceFromStation = 0;
    this.updateHud(true);
  }

  update(delta) {
    if (this.ending) return;
    this.time += delta;
    this.updateTerrainPrewarmQueue(delta);
    this.updateDeferredPickupSave(delta);
    this.updateHeldItemState();
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
    this.ship.update(delta, this.game.input, this.getShipFuelRatio(), {
      boost: this.isShipBoosting(),
      boostPower: this.getShipBoostPower(),
    });
    this.distanceFromStation = this.getDistanceFromStation();
    this.updateEngineAudio();
    this.updateDistanceProgress(delta);
    this.updateZone(delta);
    this.updateNavigation(delta);
    this.updateDockInput();
    this.updateLanding(delta);
    this.updateAtmosphereEscape(delta);
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

  schedulePickupSave(delay = 0.8) {
    this.pickupSavePending = true;
    this.pickupSaveDelay = Math.max(this.pickupSaveDelay || 0, delay);
  }

  updateDeferredPickupSave(delta) {
    if (!this.pickupSavePending) return;
    this.pickupSaveDelay -= delta;
    if (this.pickupSaveDelay > 0) return;
    this.flushPendingPickupSave();
  }

  flushPendingPickupSave() {
    if (!this.pickupSavePending) return;
    this.pickupSavePending = false;
    this.pickupSaveDelay = 0;
    this.game.saveGame();
  }

  tryAutoCargoDump() {
    if (gameBalance.stationEnabled === false) return;
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
      this.ship.update(delta, this.game.input, this.getShipFuelRatio(), {
        boost: this.isShipBoosting(),
        boostPower: this.getShipBoostPower(),
      });
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

  isShipBoosting() {
    if (this.islandMode !== 'flight') return false;
    const wantsBoost = Boolean(this.game.input.actions.jump || this.game.input.actions.boost);
    if (!wantsBoost) return false;
    return true;
  }

  getShipBoostPower() {
    if (!this.isShipBoosting()) return 0;
    if (this.isAtmosphereEscapeBoosting()) return gameBalance.mining.atmosphereEscapeBoostPower || 3.2;
    return this.isGodMode()
      ? (gameBalance.mining.godShipBoostPower || 3.15)
      : (gameBalance.mining.shipBoostPower || 0.75);
  }

  getShipFuelRatio() {
    return 1;
  }

  isAtmosphereEscapeBoostAvailable() {
    if (this.islandMode !== 'flight' || !this.atmosphereIsland) return false;
    if (!Number.isFinite(this.atmosphereSurfaceDistance)) return false;
    const atmosphereDepth = this.atmosphereIsland.atmosphereDepth || gameBalance.mining.planetAtmosphereDepth || 5000;
    if (this.atmosphereSurfaceDistance >= atmosphereDepth - 80) return false;
    const firstRing = (this.atmosphereIsland.landingZoneRadius || 600)
      * (gameBalance.mining.atmosphereEscapePromptRingScale || 1.08);
    return this.atmosphereSurfaceDistance > firstRing;
  }

  isAtmosphereEscapeBoosting() {
    return this.isAtmosphereEscapeBoostAvailable()
      && Boolean(this.game.input.actions.jump || this.game.input.actions.boost);
  }

  updateAtmosphereEscape(delta) {
    const boosting = this.isAtmosphereEscapeBoosting();
    const targetFx = boosting ? 1 : 0;
    this.atmosphereEscapeFx += (targetFx - this.atmosphereEscapeFx) * Math.min(1, delta * (boosting ? 6.5 : 4.2));
    if (!boosting || !this.atmosphereIsland) return;

    const local = this.atmosphereIsland.worldToLocal(this.ship.x, this.ship.y);
    const center = this.atmosphereIsland.getCenterLocal?.() || {
      x: this.atmosphereIsland.width * 0.5,
      y: this.atmosphereIsland.height * 0.5,
    };
    const dx = local.x - center.x;
    const dy = local.y - center.y;
    const distance = Math.hypot(dx, dy) || 1;
    const nx = dx / distance;
    const ny = dy / distance;
    const assist = gameBalance.mining.atmosphereEscapeAssistAcceleration || 1180;
    this.ship.vx += nx * assist * delta;
    this.ship.vy += ny * assist * delta;
    const speed = Math.hypot(this.ship.vx, this.ship.vy);
    const maxSpeed = gameBalance.mining.atmosphereEscapeMaxSpeed || 980;
    if (speed > maxSpeed) {
      this.ship.vx = (this.ship.vx / speed) * maxSpeed;
      this.ship.vy = (this.ship.vy / speed) * maxSpeed;
    }
    this.camera.shake = Math.max(this.camera.shake, 0.08);
  }

  isMiningInputActive() {
    if (!this.game.input.actions.mine) return false;
    if (!this.isGodMode() || !this.game.input.keys.has(' ')) return true;
    return (this.game.input.actions.primaryUse || this.game.input.actions.aimUse)
      && this.game.input.getSelectedHotbarAction?.() === 'mine';
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
    this.runCargoSlots = 0;
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
    this.stats.fuel = this.stats.maxFuel;
    this.lowFuelToastReady = true;
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
    if (this.activeIsland && this.islandMode === 'boarding') {
      return this.islandLandingAnchor?.world || { x: this.ship.x, y: this.ship.y };
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
      boosting: this.isShipBoosting(),
    });
  }

  updateAsteroids(delta) {
    this.spaceSpawnWarmupTimer = Math.max(0, this.spaceSpawnWarmupTimer - delta);
    if (this.shouldUnloadSpaceObjects()) {
      this.clearSpaceAsteroidsAndPickups();
      return;
    }
    const cullDistanceSq = gameBalance.mining.asteroidCullDistance ** 2;
    const keepNearStation = this.distanceFromStation < 900;
    let writeIndex = 0;
    for (let index = 0; index < this.asteroids.length; index += 1) {
      const asteroid = this.asteroids[index];
      asteroid.update(delta, this.time);
      if (this.isAsteroidTooCloseToIsland(asteroid)) {
        this.releaseAsteroid(asteroid);
        continue;
      }
      if (keepNearStation || this.distanceToShipSq(asteroid) < cullDistanceSq) {
        this.asteroids[writeIndex] = asteroid;
        writeIndex += 1;
      } else {
        this.releaseAsteroid(asteroid);
      }
    }
    this.asteroids.length = writeIndex;
    let spawnSafety = 0;
    const spawnWarmupDuration = gameBalance.mining.spaceSpawnWarmupDuration || 1.4;
    const spawnBlend = this.spaceSpawnWarmupTimer > 0
      ? clamp01(1 - this.spaceSpawnWarmupTimer / spawnWarmupDuration)
      : 1;
    const inOuterAtmosphere = Boolean(this.atmosphereIsland && (this.atmosphereStrength || 0) > 0.015);
    const targetAsteroidCount = inOuterAtmosphere
      ? Math.min(this.asteroids.length, gameBalance.mining.maxAsteroidCount || this.asteroids.length)
      : Math.max(0, Math.floor(gameBalance.mining.targetAsteroidCount * spawnBlend));
    while (this.asteroids.length < targetAsteroidCount && spawnSafety < 40) {
      spawnSafety += 1;
      const asteroid = this.createAsteroid(gameBalance.mining.asteroidSpawnMinDistance);
      if (!asteroid) continue;
      if (asteroid.x * asteroid.x + asteroid.y * asteroid.y > 260 * 260) this.asteroids.push(asteroid);
      else this.releaseAsteroid(asteroid);
    }
    if (this.asteroids.length > gameBalance.mining.maxAsteroidCount) {
      this.asteroids.sort((a, b) => this.distanceToShipSq(a) - this.distanceToShipSq(b));
      this.asteroids.splice(gameBalance.mining.maxAsteroidCount).forEach((asteroid) => this.releaseAsteroid(asteroid));
    }
    this.resolveAsteroidSpacing();
  }

  shouldUnloadSpaceObjects() {
    if (this.spaceObjectsSuspended || this.islandMode !== 'flight') return true;
    if (!this.atmosphereIsland || (this.atmosphereStrength || 0) <= 0.015) return false;
    const atmosphereDepth = this.atmosphereIsland.atmosphereDepth || gameBalance.mining.planetAtmosphereDepth || 5000;
    const unloadInset = gameBalance.mining.atmosphereSpaceObjectUnloadInset || 1000;
    return this.atmosphereSurfaceDistance <= Math.max(0, atmosphereDepth - unloadInset);
  }

  clearSpaceAsteroidsAndPickups() {
    if (this.asteroids.length) {
      this.asteroids.forEach((asteroid) => this.releaseAsteroid(asteroid));
      this.asteroids.length = 0;
    }
    if (this.pickups.length) {
      this.pickups.forEach((pickup) => this.releasePickup(pickup));
      this.pickups.length = 0;
    }
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
        const impulse = Math.min(8, overlap * 0.06);
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
    this.laserAimPoint = { x: hit.x, y: hit.y };
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

    const power = this.getAsteroidMiningPower();
    const broken = asteroid.mineCircle(hit.x, hit.y, ASTEROID_CHIP_BRUSH_RADIUS, power, delta, {
      targetCol: hit.col,
      targetRow: hit.row,
    });
    if (broken.length) {
      this.collectAsteroidChips(asteroid, broken);
      this.spawnHitParticles(hit.x, hit.y, asteroid.data.accent);
      this.detachAsteroidFragments(asteroid);
    }

    if (asteroid.isDepleted()) {
      this.breakAsteroid(asteroid);
      this.removeAsteroid(asteroid);
      this.stopLaserAudio();
    }
  }

  canMineAsteroid(asteroid) {
    if (this.isGodMode()) return true;
    const requiredPower = asteroid?.data?.miningPowerRequired ?? 0;
    return this.stats.miningPower + 0.001 >= requiredPower;
  }

  getAsteroidMiningPower() {
    const base = gameBalance.mining.asteroidMiningPowerBase ?? 0.85;
    const scale = gameBalance.mining.asteroidMiningPowerScale ?? 0.78;
    const power = base + Math.max(0, this.stats.miningPower || 0) * scale;
    return this.isGodMode() ? power * GOD_MODE_MINING_MULTIPLIER : power;
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
    const defeated = target.takeDamage?.(damage);
    if (defeated && target.enemyId) this.handleIslandEnemyDefeated(target);
  }

  updateOnFootDroneCombat(delta) {
    const weaponSelected = this.isWeaponToolSelected();
    if (!weaponSelected && !this.combatDrone.projectiles.length) return;
    const anchor = this.getIslandDroneAnchor();
    this.enemySystem?.syncWorldPositions(
      this.activeIsland,
      this.getIslandViewRotation(),
      (x, y) => this.localToActiveIslandWorld(x, y),
    );
    const threats = this.enemySystem?.getThreats() || [];
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

  updateOnFootDebugShortcuts() {
    const keys = this.game.input.keys;
    const justPressed = (key) => {
      const down = keys.has(key) || keys.has(key.toLowerCase());
      const wasDown = Boolean(this.debugKeyLatch[key]);
      this.debugKeyLatch[key] = down;
      return down && !wasDown;
    };
    if (justPressed('T')) this.spawnCombatTestDrone();
    if (justPressed('H')) {
      this.movementDebug.showHitboxes = !this.movementDebug.showHitboxes;
      this.game.ui.showToast(`Hitboxes ${this.movementDebug.showHitboxes ? 'on' : 'off'}`, 'default', 900);
    }
    if (justPressed('M')) {
      const next = !this.movementDebug.showVelocity;
      this.movementDebug.showVelocity = next;
      this.movementDebug.showGroundedState = next;
      this.movementDebug.showTerrainNormal = next;
      this.movementDebug.showSurfaceTangent = next;
      this.game.ui.showToast(`Movement debug ${next ? 'on' : 'off'}`, 'default', 900);
    }
  }

  spawnCombatTestDrone() {
    if (!this.activeIsland || !this.islandPlayer || !this.enemySystem?.spawnEnemy) return;
    const angle = this.activeIsland.getAngleForLocal(this.islandPlayer.centerX, this.islandPlayer.centerY);
    const drone = this.enemySystem.spawnEnemy('sentryDrone', this.activeIsland, angle + (Math.random() - 0.5) * 0.9);
    if (drone) {
      drone.localX = this.islandPlayer.centerX + (Math.random() > 0.5 ? 1 : -1) * 240;
      drone.localY = this.islandPlayer.centerY - 180;
      this.game.audio.playDroneShot?.();
      this.game.ui.showToast('Test drone spawned', 'success', 900);
    }
  }

  updateOnFootCombat(delta) {
    this.updateSwordTimers(delta);
    this.updateLaserGunTimers(delta);
    if (!this.activeIsland || !this.islandPlayer) return;
    this.enemySystem?.syncWorldPositions(
      this.activeIsland,
      this.getIslandViewRotation(),
      (x, y) => this.localToActiveIslandWorld(x, y),
    );

    const actions = this.game.input.actions;
    const uiBlocked = Boolean(this.game.ui.modalLayer?.children.length);
    if (this.isLaserGunToolSelected()) {
      if (!uiBlocked && actions.justPressed.attack) this.fireLaserGun();
      return;
    }
    if (!this.isWeaponToolSelected() || uiBlocked) return;

    if (actions.justPressed.attack) this.sword.bufferTimer = SWORD_COMBAT.attackBufferTime;
    const wantsRepeat = SWORD_COMBAT.holdAttackRepeatEnabled && actions.attack;
    if ((this.sword.bufferTimer > 0 || wantsRepeat) && this.sword.cooldown <= 0) {
      this.startSwordSlash();
    }
  }

  updateSwordTimers(delta) {
    const sword = this.sword;
    if (!sword) return;
    sword.cooldown = Math.max(0, sword.cooldown - delta);
    sword.bufferTimer = Math.max(0, sword.bufferTimer - delta);
    sword.resetTimer = Math.max(0, sword.resetTimer - delta);
    if (sword.resetTimer <= 0 && !sword.active) sword.comboIndex = 0;

    if (sword.active) {
      sword.active.age += delta;
      this.applySwordHits(sword.active);
      if (sword.active.age >= sword.active.duration) sword.active = null;
    }

    let writeIndex = 0;
    for (let index = 0; index < sword.effects.length; index += 1) {
      const effect = sword.effects[index];
      effect.age += delta;
      if (effect.age < effect.life) {
        sword.effects[writeIndex] = effect;
        writeIndex += 1;
      }
    }
    sword.effects.length = writeIndex;
  }

  startSwordSlash() {
    if (!this.activeIsland || !this.islandPlayer) return;
    const pattern = SWORD_COMBAT.comboPattern;
    const combo = pattern[this.sword.comboIndex % pattern.length] || pattern[0];
    const origin = {
      x: this.islandPlayer.centerX,
      y: this.islandPlayer.centerY - 7,
    };
    const aim = this.getIslandAimPoint();
    const dx = aim.x - origin.x;
    const dy = aim.y - origin.y;
    const aimAngle = Math.atan2(dy, dx || this.islandPlayer.facing);
    const range = SWORD_COMBAT.slashRange * combo.range;
    const arc = (SWORD_COMBAT.slashArcDegrees * Math.PI / 180) * (combo.beat === 3 ? 1.12 : 1);
    this.sword.active = {
      ...combo,
      age: 0,
      duration: combo.duration,
      origin,
      aimAngle,
      range,
      arc,
      damage: SWORD_COMBAT.baseDamage * combo.damage,
      knockback: 260 * combo.knockback,
      hitIds: new Set(),
    };
    this.sword.effects.push({
      kind: 'slash',
      age: 0,
      life: combo.duration + 0.12,
      origin,
      aimAngle,
      range,
      arc,
      beat: combo.beat,
    });
    this.sword.comboIndex = (this.sword.comboIndex + 1) % pattern.length;
    this.sword.cooldown = combo.cooldown;
    this.sword.resetTimer = SWORD_COMBAT.comboResetTime;
    this.sword.bufferTimer = 0;
    this.islandPlayer.animationState = 'attack';
    this.updateIslandPlayerFacingFromAim(aim);
    if (combo.beat === 3) this.game.audio.playSwordHeavy?.();
    else this.game.audio.playSwordSwing?.();
  }

  updateLaserGunTimers(delta) {
    const gun = this.laserGun;
    if (!gun) return;
    gun.cooldown = Math.max(0, gun.cooldown - delta);
    let writeIndex = 0;
    for (let index = 0; index < gun.effects.length; index += 1) {
      const effect = gun.effects[index];
      effect.age += delta;
      if (effect.age < effect.life) {
        gun.effects[writeIndex] = effect;
        writeIndex += 1;
      }
    }
    gun.effects.length = writeIndex;
  }

  fireLaserGun() {
    if (!this.activeIsland || !this.islandPlayer || !this.laserGun || this.laserGun.cooldown > 0) return;
    const origin = this.getIslandGunOriginLocal();
    const aim = this.getIslandAimPoint();
    let dx = aim.x - origin.x;
    let dy = aim.y - origin.y;
    let length = Math.hypot(dx, dy);
    if (length < 0.001) {
      dx = this.islandPlayer.facing;
      dy = 0;
      length = 1;
    }
    const dir = { x: dx / length, y: dy / length };
    const range = LASER_GUN_COMBAT.range;
    const threats = this.enemySystem?.getThreats() || [];
    let best = null;
    let bestT = range;
    for (const enemy of threats) {
      const local = this.getEnemyLocalPosition(enemy);
      if (!local) continue;
      const ex = local.x - origin.x;
      const ey = local.y - origin.y;
      const t = ex * dir.x + ey * dir.y;
      if (t < 0 || t > bestT) continue;
      const closestX = origin.x + dir.x * t;
      const closestY = origin.y + dir.y * t;
      const missDistance = Math.hypot(local.x - closestX, local.y - closestY);
      if (missDistance > (enemy.radius || 20) + LASER_GUN_COMBAT.hitRadius) continue;
      best = { enemy, local };
      bestT = t;
    }
    const end = best
      ? { x: best.local.x, y: best.local.y }
      : { x: origin.x + dir.x * range, y: origin.y + dir.y * range };
    this.laserGun.effects.push({
      age: 0,
      life: LASER_GUN_COMBAT.effectLife,
      origin,
      end,
      hit: Boolean(best),
    });
    this.laserGun.cooldown = LASER_GUN_COMBAT.cooldown;
    this.updateIslandPlayerFacingFromAim(aim);
    this.islandPlayer.animationState = 'attack';
    this.game.audio.playDroneShot?.();
    if (!best) return;
    const defeated = best.enemy.takeDamage?.(LASER_GUN_COMBAT.damage, {
      x: dir.x * 210,
      y: dir.y * 210,
      sourceX: origin.x,
      sourceY: origin.y,
      flashDuration: 0.12,
    });
    const world = this.localToActiveIslandWorld(best.local.x, best.local.y);
    this.spawnHitParticles(world.x, world.y, best.enemy.accent || '#6ee7ff');
    this.addFloatingText(world.x, world.y - 28, `${LASER_GUN_COMBAT.damage}`, {
      color: '#6ee7ff',
      rarity: 'uncommon',
    });
    this.addScreenShake(0.08);
    this.game.audio.playDroneHit?.();
    if (defeated) this.handleIslandEnemyDefeated(best.enemy);
  }

  applySwordHits(slash) {
    if (!slash || slash.age > slash.duration) return;
    const threats = this.enemySystem?.getThreats() || [];
    for (const enemy of threats) {
      if (!enemy || slash.hitIds.has(enemy.id)) continue;
      const enemyLocal = this.getEnemyLocalPosition(enemy);
      if (!enemyLocal) continue;
      const dx = enemyLocal.x - slash.origin.x;
      const dy = enemyLocal.y - slash.origin.y;
      const enemyRadius = enemy.radius || 24;
      const distance = Math.hypot(dx, dy);
      if (distance > slash.range + enemyRadius * 0.45) continue;
      const diff = Math.abs(angleDifference(slash.aimAngle, Math.atan2(dy, dx)));
      if (diff > slash.arc * 0.5 && distance > 34) continue;
      slash.hitIds.add(enemy.id);
      const knockbackX = Math.cos(slash.aimAngle) * slash.knockback;
      const knockbackY = Math.sin(slash.aimAngle) * slash.knockback;
      const defeated = enemy.takeDamage?.(slash.damage, {
        x: knockbackX,
        y: knockbackY,
        sourceX: slash.origin.x,
        sourceY: slash.origin.y,
        flashDuration: SWORD_COMBAT.enemyHitFlashDuration,
      });
      const world = this.localToActiveIslandWorld(enemyLocal.x, enemyLocal.y);
      this.spawnHitParticles(world.x, world.y, enemy.accent || '#7ee36d');
      this.spawnBurst(world.x, world.y, '#fff4c8', slash.beat === 3 ? 12 : 7, slash.beat === 3 ? 150 : 105);
      this.addFloatingText(world.x, world.y - 28, `${Math.round(slash.damage)}`, {
        color: slash.beat === 3 ? '#ffd36b' : '#fff2cf',
        rarity: slash.beat === 3 ? 'rare' : 'common',
      });
      this.sword.effects.push({
        kind: 'spark',
        age: 0,
        life: 0.18,
        x: enemyLocal.x,
        y: enemyLocal.y,
        color: enemy.accent || '#7ee36d',
        beat: slash.beat,
      });
      this.hitStopTimer = Math.max(this.hitStopTimer, SWORD_COMBAT.hitStopDuration * (slash.beat === 3 ? 1.35 : 1));
      this.addScreenShake(defeated ? SWORD_COMBAT.killShakeStrength : SWORD_COMBAT.hitShakeStrength * (slash.beat === 3 ? 1.4 : 1));
      this.game.audio.playSwordHit?.();
      if (defeated) this.handleIslandEnemyDefeated(enemy);
    }
  }

  getEnemyLocalPosition(enemy) {
    if (!enemy) return null;
    if (Number.isFinite(enemy.localX) && Number.isFinite(enemy.localY)) {
      return { x: enemy.localX, y: enemy.localY };
    }
    if (Number.isFinite(enemy.centerX) && Number.isFinite(enemy.centerY) && this.activeIsland) {
      return this.activeIsland.worldToLocalRotated(enemy.centerX, enemy.centerY, this.getIslandViewRotation());
    }
    return null;
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

  detachAsteroidFragments(asteroid) {
    if (!asteroid?.detachDisconnectedFragments) return false;
    const fragments = asteroid.detachDisconnectedFragments((options) => this.acquireAsteroid(options));
    if (!fragments.length) return false;
    fragments.forEach((fragment) => {
      this.asteroids.push(fragment);
      this.spawnBurst(fragment.x, fragment.y, asteroid.data.accent, 10 + Math.min(10, fragment.body.remainingSolidCount), 135);
    });
    this.game.audio.playAsteroidCrack();
    this.addScreenShake(Math.min(0.34, 0.12 + fragments.length * 0.08));
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
    const moving = Math.hypot(this.game.input.moveVector.x, this.game.input.moveVector.y) > 0.12
      || this.isShipBoosting();
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
    const aim = this.game.input.aimVector || { x: 0, y: 0 };
    const hasDirectionalAim = Math.hypot(aim.x, aim.y) > 0.12;
    if (this.mouseAimWorld && (document.documentElement.dataset.inputMode !== 'touch' || hasDirectionalAim)) {
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
    const inputMode = document.documentElement.dataset.inputMode;
    const allowDirectionalAim = this.game.input.isControllerActive?.()
      || inputMode === 'touch'
      || document.documentElement.dataset.forceTouchControls === 'true';
    if (!allowDirectionalAim) return null;
    const aim = this.game.input.aimVector || { x: 0, y: 0 };
    const magnitude = Math.hypot(aim.x, aim.y);
    if (magnitude < 0.12) return null;
    const range = this.getControllerToolAimRange('ship');
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

  getShipAimEndpoint() {
    if (this.mouseAimHit?.hit) return this.mouseAimHit.hit;
    if (this.laserTarget) return this.laserTarget;
    if (this.laserAimPoint) return this.laserAimPoint;
    if (this.mouseAimWorld) return this.getClampedLaserAimPoint(this.mouseAimWorld);
    return null;
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
    this.spawnBurst(asteroid.x, asteroid.y, asteroid.data.accent, 9);
    this.game.audio.playAsteroidBreak();
    this.addScreenShake(asteroid.data.rarity === 'rare' || asteroid.data.rarity === 'epic' ? 0.28 : 0.18);
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
        chip: cell.chip || null,
      };
      entry.count += 1;
      entry.x = (entry.x + cell.x) * 0.5;
      entry.y = (entry.y + cell.y) * 0.5;
      if (!entry.chip && cell.chip) entry.chip = cell.chip;
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
        chip: entry.chip,
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
      if (pickup.age < (pickup.pickupDelay || 0)) {
        this.pickups[writeIndex] = pickup;
        writeIndex += 1;
        continue;
      }
      if (pickup.storagePickup) {
        this.game.systems.inventory.add(pickup.materialId, pickup.amount, { skipSave: true });
        this.game.saveGame();
        const material = this.game.systems.materials.getMaterial(pickup.materialId);
        this.addPickupFloatingText(
          pickup.x,
          pickup.y,
          pickup.materialId,
          pickup.amount,
          { color: material?.color || '#fff2cf', rarity: material?.rarity || 'common' },
        );
        this.game.audio.playMineralPickup();
        this.releasePickup(pickup);
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
      this.runCargoSlots = cargoResult.currentSlots;
      this.stats.cargo = this.runCargoSlots;
      const material = this.game.systems.materials.getMaterial(pickup.materialId);
      this.addPickupFloatingText(
        pickup.x,
        pickup.y,
        pickup.materialId,
        pickup.amount,
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

    this.hud?.gpsPanel?.classList.add('is-hidden');
    if (!navigation.isUnlocked()) {
      this.destinationIndicator = null;
      this.destinationIndicatorReady = false;
      return;
    }

    const destination = navigation.getSelectedDestination();
    if (!destination) {
      this.destinationIndicator = null;
      this.destinationIndicatorReady = false;
      return;
    }

    const dx = destination.worldPosition.x - this.ship.x;
    const dy = destination.worldPosition.y - this.ship.y;
    const distance = Math.hypot(dx, dy);
    const targetAngle = Math.atan2(dy, dx);
    if (!this.destinationIndicatorReady) {
      this.destinationIndicatorAngle = targetAngle;
      this.destinationIndicatorReady = true;
    } else {
      this.destinationIndicatorAngle += angleDifference(this.destinationIndicatorAngle, targetAngle) * Math.min(1, delta * 8);
    }
    const warning = (destination.gravityStabilizerRequirement || 1) > this.getGravityStabilizerLevel()
      ? `Needs Gravity Machine Mk ${destination.gravityStabilizerRequirement}`
      : '';
    this.destinationIndicator = {
      id: destination.id,
      name: destination.tag ? `${destination.tag} ${destination.name}` : destination.name,
      distance,
      warning,
      angle: this.destinationIndicatorAngle,
    };

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

  isControllerPromptMode() {
    return document.documentElement.dataset.inputMode === 'controller'
      || Boolean(this.game.input.isControllerActive?.());
  }

  getInteractControlLabel() {
    if (this.isControllerPromptMode()) return 'X';
    if (document.documentElement.dataset.inputMode === 'touch') return 'Act';
    return 'E';
  }

  getAtmosphereInteriorDepth(island = this.atmosphereIsland) {
    if (!island || !Number.isFinite(this.atmosphereSurfaceDistance)) return 0;
    const atmosphereDepth = island.atmosphereDepth || gameBalance.mining.planetAtmosphereDepth || 5000;
    return Math.max(0, atmosphereDepth - Math.max(0, this.atmosphereSurfaceDistance));
  }

  getAtmosphereInteriorBlend(island = this.atmosphereIsland) {
    const fadeDistance = gameBalance.mining.atmosphereBackgroundFadeDistance || 1200;
    return clamp01(this.getAtmosphereInteriorDepth(island) / Math.max(1, fadeDistance));
  }

  shouldShowAtmosphereBackgroundAsteroids() {
    return false;
  }

  updateLanding(delta = 0) {
    if (this.islandMode !== 'flight') return;
    const previousAtmosphereIsland = this.atmosphereIsland;
    let nearest = null;
    let nearestDistanceSq = Infinity;
    let strongestAtmosphereIsland = null;
    let strongestAtmosphere = 0;
    let strongestAtmosphereDistanceSq = Infinity;
    let strongestSurfaceDistance = Infinity;
    let approachingIsland = null;
    let approachingSurfaceDistance = Infinity;
    const approachNoticeDistance = gameBalance.mining?.planetApproachNoticeDistance || 4200;
    for (const island of this.rockIslands) {
      const distanceSq = island.distanceSqTo(this.ship);
      const atmosphereRadius = island.atmosphereRadius || island.gravityFieldRadius || island.radius || 0;
      if (distanceSq > (atmosphereRadius + island.landingZoneRadius + approachNoticeDistance + 520) ** 2) continue;
      const surfaceDistance = island.getSurfaceClearanceToPoint?.(this.ship.x, this.ship.y) ?? Math.sqrt(distanceSq);
      const atmosphereDepth = island.atmosphereDepth || gameBalance.mining.planetAtmosphereDepth || 5000;
      if (
        surfaceDistance > atmosphereDepth
        && surfaceDistance <= atmosphereDepth + approachNoticeDistance
        && surfaceDistance < approachingSurfaceDistance
      ) {
        approachingIsland = island;
        approachingSurfaceDistance = surfaceDistance;
      }
      const gravityStrength = island.getAtmosphereStrength?.(this.ship) ?? island.getGravityFieldStrength(this.ship);
      if (
        gravityStrength > 0
        && (
          gravityStrength > strongestAtmosphere
          || (gravityStrength === strongestAtmosphere && distanceSq < strongestAtmosphereDistanceSq)
        )
      ) {
        strongestAtmosphereIsland = island;
        strongestAtmosphere = gravityStrength;
        strongestAtmosphereDistanceSq = distanceSq;
        strongestSurfaceDistance = surfaceDistance;
      }
      if (island.isNearLandingZone(this.ship) && distanceSq < nearestDistanceSq) {
        nearest = island;
        nearestDistanceSq = distanceSq;
      }
    }
    const prewarmIsland = nearest || strongestAtmosphereIsland || approachingIsland;
    if (prewarmIsland) {
      this.prewarmIslandTerrain(prewarmIsland, {
        priorityLocal: prewarmIsland.worldToLocal(this.ship.x, this.ship.y),
      });
    }
    const shouldAutoPark = Boolean(nearest && this.shouldAutoParkAtInnerAtmosphere(nearest));
    if (shouldAutoPark && this.landingIsland !== nearest) {
      this.game.ui.showToast('Autopilot parking at nearest surface block', 'success', 1300);
      this.game.audio.playGpsPing?.();
    }
    this.landingTargetPreview = shouldAutoPark ? this.getAutoLandingTargetForIsland(nearest) : null;
    this.atmosphereIsland = nearest || strongestAtmosphereIsland;
    const nearestAtmosphere = nearest
      ? (nearest.getAtmosphereStrength?.(this.ship) ?? nearest.getGravityFieldStrength(this.ship))
      : 0;
    this.atmosphereStrength = Math.max(strongestAtmosphere, nearestAtmosphere);
    if (
      approachingIsland
      && approachingIsland.id !== this.approachNoticeIslandId
      && (!this.atmosphereIsland || this.atmosphereIsland.id !== approachingIsland.id || this.atmosphereStrength <= 0.02)
    ) {
      this.approachNoticeIslandId = approachingIsland.id;
      const tag = approachingIsland.tag || approachingIsland.planetTag || this.game.systems.islands.getPlanetTag(approachingIsland.id) || 'P??';
      this.game.ui.showToast(`Approaching ${tag}`, 'default', 1500);
      this.game.audio.playGpsPing?.();
    }
    if (!approachingIsland && !this.atmosphereIsland) this.approachNoticeIslandId = '';
    if (previousAtmosphereIsland && !this.atmosphereIsland) {
      this.recentAtmosphereIslandId = previousAtmosphereIsland.id;
      this.recentAtmosphereCacheKeepUntil = this.time + 20;
      this.spaceSpawnWarmupTimer = Math.max(
        this.spaceSpawnWarmupTimer,
        gameBalance.mining.spaceSpawnWarmupDuration || 1.4,
      );
      this.backgroundAsteroidFadeTimer = Math.max(
        this.backgroundAsteroidFadeTimer,
        gameBalance.mining.backgroundAsteroidFadeDuration || 1.2,
      );
      this.scheduleIdleTransitionTask(() => {
        this.game.systems.quests?.record?.('enteredSpace', {
          planetId: previousAtmosphereIsland.id,
          tag: previousAtmosphereIsland.tag || previousAtmosphereIsland.planetTag || '',
        }, { save: true, notify: true });
        this.game.systems.achievements.record('enteredSpace', {
          planetId: previousAtmosphereIsland.id,
        });
      });
    }
    this.backgroundAsteroidFadeTimer = Math.max(0, this.backgroundAsteroidFadeTimer - delta);
    this.atmosphereSurfaceDistance = nearest
      ? Math.max(0, nearest.getSurfaceClearanceToPoint?.(this.ship.x, this.ship.y) ?? 0)
      : strongestSurfaceDistance;
    if (this.atmosphereIsland && this.atmosphereIsland !== previousAtmosphereIsland) {
      this.atmosphereViewRotation = this.atmosphereIsland === this.activeIsland ? this.getIslandViewRotation() : 0;
    }
    if (this.atmosphereIsland && this.atmosphereStrength > 0.02 && this.arrivalNoticeIslandId !== this.atmosphereIsland.id) {
      this.arrivalNoticeIslandId = this.atmosphereIsland.id;
      const tag = this.atmosphereIsland.tag
        || this.atmosphereIsland.planetTag
        || this.game.systems.islands.getPlanetTag(this.atmosphereIsland.id)
        || 'P??';
      const arrivedIsland = this.atmosphereIsland;
      this.scheduleIdleTransitionTask(() => {
        this.game.systems.quests?.record?.('arrivedPlanet', {
          planetId: arrivedIsland.id,
          tag,
          name: arrivedIsland.name || '',
          starter: arrivedIsland.id === this.getStoryState().starterPlanetId,
        }, { save: true, notify: true });
      });
      this.game.ui.showToast(`Arrived at ${tag}`, 'success', 1700);
      this.game.audio.playSceneTransition?.();
    }
    if (!this.atmosphereIsland || this.atmosphereStrength <= 0.01) {
      this.arrivalNoticeIslandId = '';
      this.atmosphereViewRotation = 0;
      this.departedIslandDecorId = '';
    }
    this.gravityIsland = this.atmosphereIsland;
    this.gravityFieldStrength = this.atmosphereStrength;
    const focusId = this.atmosphereIsland?.id || '';
    if (focusId !== this.loadedIslandFocusId) {
      this.loadedIslandFocusId = focusId;
      this.scheduleInactiveIslandRenderCacheRelease(this.atmosphereIsland);
    }
    if (
      this.atmosphereIsland
      && !this.spaceObjectsSuspended
      && this.shouldShowAtmosphereBackgroundAsteroids()
      && this.backgroundAsteroidSourceId !== this.atmosphereIsland.id
    ) {
      this.backgroundAsteroids = this.createIslandBackgroundAsteroids(this.atmosphereIsland);
      this.backgroundAsteroidSourceId = this.atmosphereIsland.id;
    } else if (
      (!this.atmosphereIsland || !this.shouldShowAtmosphereBackgroundAsteroids())
      && !this.spaceObjectsSuspended
      && this.backgroundAsteroidFadeTimer <= 0
      && this.backgroundAsteroids.length
    ) {
      this.backgroundAsteroids = [];
      this.backgroundAsteroidSourceId = '';
    }
    this.landingIsland = shouldAutoPark ? nearest : null;
    this.hud?.landingPrompt?.classList.toggle('is-hidden', !shouldAutoPark);
    if (shouldAutoPark) {
      this.setHudText('landingPrompt', this.hud.landingPrompt, `Autopilot parking - ${nearest.getDisplayName?.() || nearest.name}`);
      if (this.mineButtonLabel) this.mineButtonLabel.textContent = 'Land';
      if (this.mineButtonIcon) this.mineButtonIcon.textContent = 'L';
      this.mineButton?.classList.add('is-land-mode');
      this.landOnIsland(nearest, this.landingTargetPreview, { auto: true });
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
    const castDistance = Math.max(distance + 160, island.radius + island.landingZoneRadius + 420);
    const end = {
      x: shipLocal.x + (dx / distance) * castDistance,
      y: shipLocal.y + (dy / distance) * castDistance,
    };
    const hit = island.terrain.raycast(shipLocal.x, shipLocal.y, end.x, end.y)
      || this.getFallbackLandingHit(island, shipLocal);
    if (!hit) return null;
    return this.createLandingTargetFromHit(island, hit);
  }

  getAutoLandingTargetForIsland(island) {
    if (!island?.terrain) return null;
    const shipLocal = island.worldToLocal(this.ship.x, this.ship.y);
    const center = island.getCenterLocal?.() || {
      x: island.width * 0.5,
      y: island.height * 0.5,
    };
    const dx = center.x - shipLocal.x;
    const dy = center.y - shipLocal.y;
    const distance = Math.hypot(dx, dy) || 1;
    const end = {
      x: shipLocal.x + (dx / distance) * Math.max(distance + 80, island.radius + island.landingZoneRadius + 220),
      y: shipLocal.y + (dy / distance) * Math.max(distance + 80, island.radius + island.landingZoneRadius + 220),
    };
    const hit = island.terrain.raycast(shipLocal.x, shipLocal.y, end.x, end.y)
      || this.getFallbackLandingHit(island, shipLocal);
    if (!hit) return null;
    return this.createLandingTargetFromHit(island, hit);
  }

  shouldAutoParkAtInnerAtmosphere(island) {
    if (!island || gameBalance.mining?.autoParkInnerAtmosphere === false) return false;
    if (this.autoParkGraceIslandId === island.id && this.time < (this.autoParkGraceUntil || 0)) return false;
    const center = island.localToWorld(island.getCenterLocal().x, island.getCenterLocal().y);
    const dx = this.ship.x - center.x;
    const dy = this.ship.y - center.y;
    const distance = Math.hypot(dx, dy) || 1;
    const outwardVelocity = (this.ship.vx * dx + this.ship.vy * dy) / distance;
    return outwardVelocity < 45;
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
    if (gameBalance.stationEnabled === false) return;
    if (this.cargoDumping || this.ending) return;
    if (this.distanceFromStation * this.distanceFromStation > DOCK_RADIUS_SQ) return;
    const actions = this.game.input.actions;
    if (actions.justPressed.interact || actions.justPressed.confirm) this.dock();
  }

  handleOutOfFuelReturn() {
    this.stats.fuel = this.stats.maxFuel;
    return false;
  }

  landOnIsland(island, landingTarget = null, { auto = false } = {}) {
    if (this.ending || this.islandMode !== 'flight') return;
    const target = landingTarget?.island === island
      ? landingTarget
      : auto
        ? this.getAutoLandingTargetForIsland(island)
        : this.getLandingTargetForIsland(island);
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
    this.prewarmIslandTerrain(island);
    this.stopLaserAudio();
    this.game.audio.playLandShip?.();
    this.game.systems.navigation.discoverLocation(island.id, { notify: false });
    this.game.state.islands ||= { visited: {} };
    this.game.state.islands.visited ||= {};
    this.game.state.islands.visited[island.id] = true;
    this.game.ui.showToast(
      auto
        ? `Autopilot parking on ${island.name}`
        : island.atmosphereClass === 'dense'
        ? `Landing on ${island.name}. Dense atmosphere detected.`
        : `Landing on ${island.name}`,
      island.atmosphereClass === 'dense' ? 'default' : 'success',
      1700,
    );
  }

  prewarmIslandTerrain(island, { priorityLocal = null, immediate = false } = {}) {
    const terrain = island?.terrain;
    if (!terrain?.prewarmForGameplay) return;
    if (this.islandMode === 'onIsland' && island === this.activeIsland && this.time <= 0.05) {
      terrain.prewarmForGameplay();
      return;
    }
    if (terrain.beginProgressivePrewarm) {
      const complete = terrain.beginProgressivePrewarm({ priorityPoint: priorityLocal });
      if (!complete && !this.terrainPrewarmQueue.some((entry) => entry.terrain === terrain)) {
        this.terrainPrewarmQueue.push({ terrain, island, priorityLocal });
      }
      if (immediate) terrain.processProgressivePrewarm?.({ budgetMs: 6, maxChunks: 5 });
      return;
    }
    if (terrain.prewarmQueued) return;
    terrain.prewarmQueued = true;
    this.scheduleIdleTransitionTask(() => {
      terrain.prewarmQueued = false;
      terrain.prewarmForGameplay();
    }, { timeout: 800 });
  }

  updateTerrainPrewarmQueue(delta = 0) {
    if (!this.terrainPrewarmQueue.length) return;
    const frameBudget = gameBalance.mining?.planetPrewarmFrameBudgetMs ?? 3.5;
    const maxChunks = gameBalance.mining?.planetPrewarmChunksPerFrame ?? 3;
    const nextQueue = [];
    let processed = false;
    for (let index = 0; index < this.terrainPrewarmQueue.length; index += 1) {
      const entry = this.terrainPrewarmQueue[index];
      const terrain = entry.terrain;
      if (!terrain?.processProgressivePrewarm) continue;
      if (processed) {
        nextQueue.push(entry);
        continue;
      }
      const done = terrain.processProgressivePrewarm({ budgetMs: frameBudget, maxChunks });
      processed = true;
      if (!done) nextQueue.push(entry);
    }
    this.terrainPrewarmQueue = nextQueue;
  }

  scheduleIdleTransitionTask(callback, { timeout = 1500 } = {}) {
    if (typeof callback !== 'function') return;
    if (typeof window !== 'undefined' && window.requestIdleCallback) {
      window.requestIdleCallback(() => callback(), { timeout });
      return;
    }
    if (typeof window !== 'undefined') {
      window.setTimeout(() => callback(), Math.min(timeout, 800));
      return;
    }
    callback();
  }

  scheduleInactiveIslandRenderCacheRelease(keepIsland = null, { timeout = 1700 } = {}) {
    if (keepIsland) this.deferredCacheReleaseKeepIsland = keepIsland;
    else this.deferredCacheReleaseKeepIsland ||= null;
    if (this.deferredCacheReleaseQueued) return;
    this.deferredCacheReleaseQueued = true;
    this.scheduleIdleTransitionTask(() => {
      this.deferredCacheReleaseQueued = false;
      this.releaseInactiveIslandRenderCaches(this.deferredCacheReleaseKeepIsland);
      this.deferredCacheReleaseKeepIsland = null;
    }, { timeout });
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
    if (this.hitStopTimer > 0) {
      this.hitStopTimer = Math.max(0, this.hitStopTimer - delta);
      this.updateViewScale(delta);
      this.updateCamera(delta);
      this.updateParticles(delta);
      this.updateIslandFloatingText(delta);
      this.updateHud();
      return;
    }
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
      this.updatePlacedResearchStation(delta);
      this.baseLab?.update?.(delta, this.islandMode === 'onIsland' ? this.islandPlayer : null);
      this.updatePlacedFurnace(delta);
      if (this.islandMode === 'onIsland') this.updateIslandEnemies(delta);
      if (this.islandMode === 'onIsland') this.updateIslandPickups(delta);
      if (this.islandMode !== 'boarding') this.updateIslandViewRotation(delta);
      if (this.islandMode === 'onIsland') this.updateOnFootDebugShortcuts();
      if (this.islandMode === 'onIsland') this.updateOnFootCombat(delta);
      this.game.systems.building?.flushSave?.(this, delta);
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
    this.game.systems.islands.saveShipAnchor?.(this.activeIsland.id, {
      landingAngle: this.activeIsland.landingAngle,
      landingSurfaceLocal: this.activeIsland.landingSurfaceLocal,
    }, { skipSave: true });
    this.game.saveGame();
    const exit = this.activeIsland.getPlayerExitLocal(IslandPlayer.getDefaultSize());
    this.islandPlayer = new IslandPlayer({ x: exit.x, y: exit.y });
    this.seedPlanetPlayer(this.activeIsland, this.islandPlayer);
    const story = this.getStoryState();
    this.baseLab = story.baseLab?.islandId === this.activeIsland.id ? BaseLab.deserialize(story.baseLab) : null;
    this.loadCrashFurnace();
    this.enemySystem.setActiveIsland(this.activeIsland);
    this.islandRotationTarget = this.islandViewRotation;
    this.islandRotationSettling = false;
    this.islandFreefall = false;
    this.islandGravityRecovery = false;
    this.islandGravityRecoveryBlend = 0;
    this.islandMode = 'onIsland';
    this.prewarmIslandTerrain(this.activeIsland);
    this.shipSmoke?.clear();
    this.game.audio.playExitShip?.();
    this.game.ui.showToast(`Landed. Press ${this.getInteractControlLabel()} near the ship to board.`, 'success', 1800);
  }

  updateIslandOnFoot(delta) {
    const island = this.activeIsland;
    const player = this.islandPlayer;
    if (!island || !player) return;
    const actions = this.game.input.actions;
    this.updateIslandPlacedDoors(delta);
    this.updateUnsupportedTorchCleanup(delta);
    if (actions.justPressed.crafting) this.tryOpenCraftingStation();
    const keyboardJump = actions.justPressed.up
      && (this.game.input.keys.has('w') || this.game.input.keys.has('W') || this.game.input.keys.has('ArrowUp'));
    const spaceJump = actions.justPressed.jump && this.game.input.keys.has(' ');
    this.updatePlanetIslandPlayer(delta, {
      moveX: this.game.input.moveVector.x,
      jumpPressed: actions.justPressed.jump || keyboardJump || spaceJump,
      jumpHeld: actions.jump || actions.up,
      jumpReleased: actions.justReleased.jump || actions.justReleased.up,
      downHeld: actions.down,
    });
    this.updateGravityStabilizerInput(actions, delta);
    this.islandAimPreview = this.isTerrainToolSelected() ? this.getIslandTerrainPreview({ updateFacing: false }) : null;
    this.game.systems.building?.update?.(this, delta);
    this.flagPlacementPreview = this.isFlagToolSelected() ? this.getFlagPlacementPreview() : null;
    this.torchPlacementPreview = this.isTorchToolSelected() ? this.getTorchPlacementPreview() : null;
    this.platformPlacementPreview = (this.isPlatformToolSelected() || this.isPlatformPlacerToolSelected())
      ? this.getPlatformPlacementPreview({ line: this.isPlatformPlacerToolSelected() })
      : null;
    this.doorPlacementPreview = this.isDoorToolSelected() ? this.getDoorPlacementPreview() : null;
    this.furnacePlacementPreview = this.isFurnaceToolSelected() ? this.getFurnacePlacementPreview() : null;
    this.craftingStationPlacementPreview = this.isCraftingStationToolSelected() ? this.getCraftingStationPlacementPreview() : null;
    this.researchStationPlacementPreview = this.isResearchStationToolSelected() ? this.getResearchStationPlacementPreview() : null;
    if (actions.justPressed.placeFlag) this.placeFlagOnIsland(this.flagPlacementPreview);
    if (actions.justPressed.placeTorch) this.placeTorchOnIsland(this.torchPlacementPreview);
    if (actions.justPressed.placePlatform || actions.justPressed.placePlatformLine) this.placePlatformOnIsland(this.platformPlacementPreview);
    if (actions.justPressed.placeDoor) this.placeDoorOnIsland(this.doorPlacementPreview);
    if (actions.justPressed.placeFurnace) this.placeFurnaceOnIsland(this.furnacePlacementPreview);
    if (actions.justPressed.placeCraftingStation) this.placeCraftingStationOnIsland(this.craftingStationPlacementPreview);
    if (actions.justPressed.placeResearchStation) this.placeResearchStationOnIsland(this.researchStationPlacementPreview);
    this.handleHeldItemWorldUse(actions);
    if (actions.mine && this.isMinerToolSelected()) this.updateIslandTerrainMining(delta, this.islandAimPreview);
    else this.stopIslandTerrainLaser();
    if (actions.justPressed.interact || actions.justPressed.confirm) {
      const nearbyFurnace = this.getNearbyFurnace(player);
      const nearbyWorkbench = this.getNearbyWorkbench(player);
      if (nearbyWorkbench?.type === 'crafting') {
        this.showCraftingModal();
      } else if (nearbyWorkbench?.type === 'research') {
        this.showResearchStationModal();
      } else if (nearbyFurnace) {
        this.showFurnaceModal(nearbyFurnace.id);
      } else if (this.getNearbyFlag(player)) {
        this.packUpNearbyFlag();
      } else if (island.isPlayerNearShip(player)) {
        this.handleShipInteract();
      }
    }
    this.updateIslandPrompt();
  }

  updateIslandEnemies(delta) {
    if (!this.activeIsland || !this.islandPlayer) return;
    this.enemySystem.update(delta, {
      island: this.activeIsland,
      player: this.islandPlayer,
      viewRotation: this.getIslandViewRotation(),
      toWorld: (x, y) => this.localToActiveIslandWorld(x, y),
      onPlayerDamage: (hit) => this.handleIslandPlayerDamage(hit),
    });
  }

  handleIslandPlayerDamage(hit) {
    if (!hit || !this.islandPlayer || this.isInvincible()) return;
    const damaged = this.islandPlayer.damage(hit.amount || 1, hit.sourceX ?? this.islandPlayer.centerX);
    if (!damaged) return;
    const world = hit.worldX !== undefined
      ? { x: hit.worldX, y: hit.worldY }
      : this.localToActiveIslandWorld(hit.sourceX || this.islandPlayer.centerX, hit.sourceY || this.islandPlayer.centerY);
    this.game.audio.playShipHit?.();
    this.addScreenShake(hit.kind === 'projectile' ? 0.18 : 0.24);
    this.spawnBurst(world.x, world.y, '#7ee36d', 8, 95);
    this.addFloatingText(
      this.localToActiveIslandWorld(this.islandPlayer.centerX, this.islandPlayer.centerY - 28).x,
      this.localToActiveIslandWorld(this.islandPlayer.centerX, this.islandPlayer.centerY - 28).y,
      `-${Math.ceil(hit.amount || 1)}`,
      { color: '#ff756f', rarity: 'rare' },
    );
    if (this.islandPlayer.health > 0) return;
    this.islandPlayer.health = this.islandPlayer.maxHealth;
    this.seedPlanetPlayer(this.activeIsland, this.islandPlayer);
    this.game.ui.showToast('Suit rebooted at the ship', 'danger', 1500);
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

  updateGravityStabilizerInput(actions, delta = 0) {
    if (!this.activeIsland || !this.islandPlayer) return;
    this.syncGravityMachineSelectionState();
    if (this.heldItemState) {
      this.setGravityMachineInputFlag(false);
      this.gravityMachineWasActive = false;
      return;
    }
    const attemptedToggle = Boolean(actions.justPressed?.stabilize);
    const selectedActive = this.isGravityMachineToolSelected() && !this.gravityMachineHotbarSuppressed;
    const wantsActive = this.gravityMachineManualActive || selectedActive;
    if (!wantsActive && !attemptedToggle) {
      this.setGravityMachineInputFlag(false);
      this.gravityMachineWasActive = false;
      return;
    }
    const canUse = this.canUseGravityStabilizerOnIsland(this.activeIsland);
    if (!canUse) {
      this.setGravityMachineInputFlag(false);
      const now = performance.now();
      if ((attemptedToggle || selectedActive) && now >= this.gravityMachineBlockedToastAt) {
        this.gravityMachineBlockedToastAt = now + 1800;
        this.game.audio.playError?.();
        this.game.ui.showToast(this.getGravityStabilizerBlockMessage(this.activeIsland), 'danger', 2200);
      }
      this.gravityMachineManualActive = false;
      this.gravityMachineWasActive = false;
      return;
    }

    const wasActive = this.gravityMachineWasActive;
    if (attemptedToggle) this.toggleGravityMachineRotationMode();
    const active = this.isGravityMachineRotationModeActive();
    this.setGravityMachineInputFlag(active);
    this.gravityMachineWasActive = active;
    if (active !== wasActive) {
      this.game.audio[active ? 'playSuccess' : 'playButtonClick']?.();
      this.game.ui.showToast(
        active ? 'Gravity Machine active - wheel or bumpers rotate' : 'Gravity Machine inactive',
        active ? 'success' : 'default',
        active ? 1100 : 850,
      );
    }
    if (!active) return;

    const wheel = this.game.input.consumeGravityWheelDelta?.() || 0;
    const bumperDirection = Number(Boolean(actions.gravityRotateRight)) - Number(Boolean(actions.gravityRotateLeft));
    const wheelStep = clamp(
      wheel * GRAVITY_MACHINE_WHEEL_ROTATION_STEP,
      -GRAVITY_MACHINE_WHEEL_MAX_STEP,
      GRAVITY_MACHINE_WHEEL_MAX_STEP,
    );
    const bumperStep = bumperDirection * GRAVITY_MACHINE_BUMPER_ROTATION_SPEED * Math.min(delta, 0.05);
    const rotationStep = wheelStep + bumperStep;
    this.gravityMachineRotationInput = approachValue(this.gravityMachineRotationInput || 0, bumperDirection, Math.min(1, delta * 9));
    if (Math.abs(rotationStep) > 0.0001) {
      this.islandRotationTarget = normalizeAngle(this.islandRotationTarget + rotationStep);
      this.islandRotationSettling = true;
    }
  }

  syncGravityMachineSelectionState() {
    const selectedSlotId = this.game.input.getSelectedHotbarSlot?.()?.id || '';
    if (selectedSlotId !== this.gravityMachineLastSelectedSlotId) {
      this.gravityMachineLastSelectedSlotId = selectedSlotId;
      if (selectedSlotId === 'stabilizer') this.gravityMachineHotbarSuppressed = false;
    }
  }

  setGravityMachineInputFlag(active) {
    document.documentElement.dataset.gravityMachineActive = active ? 'true' : 'false';
  }

  toggleGravityMachineRotationMode({ forceActive = null } = {}) {
    const currentlyActive = this.isGravityMachineRotationModeActive();
    const nextActive = forceActive === null ? !currentlyActive : Boolean(forceActive);
    this.gravityMachineManualActive = nextActive;
    this.gravityMachineHotbarSuppressed = !nextActive && this.isGravityMachineToolSelected();
    if (nextActive) {
      this.gravityMachineHotbarSuppressed = false;
      this.islandRotationTarget = this.islandViewRotation;
      this.islandRotationSettling = false;
    }
    this.setGravityMachineInputFlag(nextActive || (this.isGravityMachineToolSelected() && !this.gravityMachineHotbarSuppressed));
    return nextActive;
  }

  activateGravityMachineFromInventory() {
    if (!this.hasGravityMachine()) return false;
    if (!this.activeIsland || !this.islandPlayer) {
      this.game.audio.playError?.();
      this.game.ui.showToast('Use the Gravity Machine while standing on a planet.', 'danger', 1500);
      return true;
    }
    if (!this.canUseGravityStabilizerOnIsland(this.activeIsland)) {
      this.game.audio.playError?.();
      this.game.ui.showToast(this.getGravityStabilizerBlockMessage(this.activeIsland), 'danger', 2200);
      return true;
    }
    this.toggleGravityMachineRotationMode({ forceActive: true });
    this.gravityMachineWasActive = true;
    this.closeSurvivalModal();
    this.closeQuickInventory();
    this.game.audio.playSuccess?.();
    this.game.ui.showToast('Gravity Machine active - wheel or bumpers rotate', 'success', 1100);
    return true;
  }

  engageIslandGravityStabilizer({ targetRotation = null } = {}) {
    if (!this.activeIsland || !this.islandPlayer) return;
    this.islandRotationTarget = targetRotation === null
      ? this.getIslandTargetViewRotation()
      : normalizeAngle(targetRotation);
    this.islandRotationSettling = true;
  }

  isGravityMachineToolSelected() {
    return this.heldItemState?.itemId === 'gravityStabilizer'
      || this.game.input.getSelectedHotbarSlot?.()?.id === 'stabilizer';
  }

  isGravityMachineRotationModeActive() {
    if (!this.activeIsland || !this.islandPlayer || this.heldItemState) return false;
    if (!this.canUseGravityStabilizerOnIsland(this.activeIsland)) return false;
    return Boolean(this.gravityMachineManualActive || (this.isGravityMachineToolSelected() && !this.gravityMachineHotbarSuppressed));
  }

  isFlagToolSelected() {
    return this.heldItemState?.itemId === 'markerFlag'
      || this.game.input.getSelectedHotbarSlot?.()?.id === 'flag';
  }

  isTorchToolSelected() {
    return this.heldItemState?.itemId === 'torch'
      || this.game.input.getSelectedHotbarSlot?.()?.id === 'torch';
  }

  isPlatformToolSelected() {
    return this.heldItemState?.itemId === 'thinPlatform'
      || this.game.input.getSelectedHotbarSlot?.()?.id === 'platform';
  }

  isPlatformPlacerToolSelected() {
    return this.heldItemState?.itemId === 'platformPlacerPp5'
      || this.game.input.getSelectedHotbarSlot?.()?.id === 'pp5';
  }

  isDoorToolSelected() {
    return this.heldItemState?.itemId === 'metalDoor'
      || this.game.input.getSelectedHotbarSlot?.()?.id === 'door';
  }

  isWeaponToolSelected() {
    return this.game.input.getSelectedHotbarSlot?.()?.id === 'weapon';
  }

  isLaserGunToolSelected() {
    return this.game.input.getSelectedHotbarSlot?.()?.id === 'laserGun';
  }

  isMinerToolSelected() {
    return this.game.input.getSelectedHotbarSlot?.()?.id === 'miner';
  }

  isBuildToolSelected() {
    return Boolean(this.game.systems.building?.getSelectedBuildItem?.(this));
  }

  isResearchStationToolSelected() {
    return this.heldItemState?.itemId === 'researchStationKit'
      || this.game.input.getSelectedHotbarSlot?.()?.id === 'researchStation';
  }

  isTerrainToolSelected() {
    const selectedId = this.game.input.getSelectedHotbarSlot?.()?.id;
    return selectedId === 'miner'
      || selectedId === 'flag'
      || selectedId === 'torch'
      || selectedId === 'platform'
      || selectedId === 'pp5'
      || selectedId === 'door'
      || selectedId === 'furnace'
      || selectedId === 'craftingStation'
      || selectedId === 'researchStation'
      || this.isDoorToolSelected()
      || this.isBuildToolSelected();
  }

  getControllerToolAimRange(context = 'island') {
    const slot = this.game.input.getSelectedHotbarSlot?.();
    const id = slot?.id || '';
    const action = slot?.action || '';
    if (id === 'miner') {
      return context === 'ship'
        ? (this.stats?.miningRange || 420)
        : TERRAIN_MINER_RANGE;
    }
    if (id === 'laserGun') return context === 'island' ? 150 : 170;
    if ((id === 'weapon' || action === 'attack') && context === 'island') return SWORD_COMBAT.slashRange;
    if (id === 'weapon' || id.includes('gun') || id.includes('blaster') || id.includes('drone') || action === 'shoot' || action === 'attack') return 150;
    if (id === 'platform' || id === 'pp5' || id === 'door' || action === 'placePlatform' || action === 'placePlatformLine' || action === 'placeDoor') {
      return this.game.systems.building?.getBuildRange?.(this) || TERRAIN_MINER_RANGE;
    }
    if (action === 'build' || this.isBuildToolSelected()) return this.game.systems.building?.getBuildRange?.(this) || TERRAIN_MINER_RANGE;
    if (this.isTerrainToolSelected()) return TERRAIN_LASER_RANGE;
    return context === 'ship' ? 150 : 120;
  }

  getFlagPlacementPreview() {
    if (!this.activeIsland || !this.islandPlayer) return null;
    const preview = this.getIslandTerrainPreview({ updateFacing: false });
    if (!preview) return null;
    return {
      ...preview,
      canPlace: Boolean(preview.hit && this.getAvailableItemAmount('markerFlag') > 0),
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
    if (this.getAvailableItemAmount('markerFlag') <= 0) {
      this.game.audio.playError?.();
      this.game.ui.showToast('No marker flag in inventory', 'danger', 1200);
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
    this.consumeItemForPlacement('markerFlag', 1);
    this.flagPlacementPreview = null;
    this.islandTerrainDirty = this.islandTerrainDirty || pad.changed;
    if (this.islandTerrainDirty) {
      this.game.systems.islands.saveTerrain(island.id, island.terrain);
      this.islandTerrainDirty = false;
    }
    this.game.systems.islands.saveFlags(island.id, flags);
    this.game.state.base = {
      established: true,
      islandId: island.id,
      flagId: flag.id,
      local: { x: flag.x, y: flag.y },
    };
    this.game.state.navigation.gpsUnlocked = true;
    this.game.state.navigation.scannerLevel = Math.max(1, this.game.state.navigation.scannerLevel || 0);
    this.game.state.navigation.selectedDestinationId = 'base';
    this.game.systems.navigation?.refreshLocations?.();
    this.refreshHotbar(true);
    const world = island.localToWorldRotated(pad.x, pad.y, this.getIslandViewRotation());
    this.spawnBurst(world.x, world.y, '#ffd36b', 14, 95);
    this.addFloatingText(world.x, world.y - 24, 'Base marked', { color: '#ffd36b', rarity: 'common' });
    this.game.audio.playSuccess?.();
  }

  getTorchPlacementPreview() {
    if (!this.activeIsland || !this.islandPlayer) return null;
    const preview = this.getIslandTerrainPreview({ updateFacing: false });
    if (!preview) return null;
    const support = preview.hit
      ? this.getTorchSupportFromHit(preview.hit)
      : this.getTorchBackWallSupportFromPoint(preview.end || preview.aimPoint || this.getIslandAimPoint());
    const hasTorch = support
      ? this.isTorchAtSupport(this.activeIsland, support.supportCol, support.supportRow, support.supportSide)
      : false;
    const canPlace = this.getAvailableItemAmount('torch') > 0;
    return {
      ...preview,
      ...(support || {}),
      valid: Boolean(support && canPlace && !hasTorch),
      canPlace,
      reason: !support
        ? 'Needs solid tile or background wall'
        : hasTorch
          ? 'Torch already placed here'
          : canPlace
            ? ''
            : 'No torches in inventory',
    };
  }

  getTorchSupportFromHit(hit) {
    const terrain = this.activeIsland?.terrain;
    if (!terrain || !hit || !terrain.isSolidCell(hit.col, hit.row)) return null;
    const size = terrain.cellSize || 25;
    const left = hit.col * size;
    const top = hit.row * size;
    const right = left + size;
    const bottom = top + size;
    const candidates = TORCH_SUPPORT_SIDES
      .filter((entry) => {
        const airCol = hit.col + entry.colOffset;
        const airRow = hit.row + entry.rowOffset;
        return !terrain.isInside(airCol, airRow) || !terrain.isSolidCell(airCol, airRow);
      })
      .map((entry) => {
        const airCol = hit.col + entry.colOffset;
        const airRow = hit.row + entry.rowOffset;
        const airLeft = airCol * size;
        const airTop = airRow * size;
        const airRight = airLeft + size;
        const airBottom = airTop + size;
        let x = hit.x;
        let y = hit.y;
        let distance = 0;
        if (entry.side === 'top') {
          x = airLeft + size * 0.5;
          y = airBottom - Math.max(1, size * 0.06);
          distance = Math.abs(hit.y - top);
        } else if (entry.side === 'bottom') {
          x = airLeft + size * 0.5;
          y = airTop + Math.max(1, size * 0.06);
          distance = Math.abs(hit.y - bottom);
        } else if (entry.side === 'left') {
          x = airRight - Math.max(1, size * 0.06);
          y = airBottom - Math.max(2, size * 0.16);
          distance = Math.abs(hit.x - left);
        } else {
          x = airLeft + Math.max(1, size * 0.06);
          y = airBottom - Math.max(2, size * 0.16);
          distance = Math.abs(hit.x - right);
        }
        return {
          ...entry,
          x,
          y,
          distance,
          rotation: getTorchRotationForSupport(entry.side),
          supportCol: hit.col,
          supportRow: hit.row,
          supportSide: entry.side,
        };
      })
      .sort((a, b) => a.distance - b.distance);
    return candidates[0] || null;
  }

  getTorchBackWallSupportFromPoint(point) {
    const terrain = this.activeIsland?.terrain;
    if (!terrain || !point) return null;
    const tile = terrain.cellFromWorld(point.x, point.y);
    if (!terrain.isInside(tile.col, tile.row)) return null;
    if (terrain.isSolidCell(tile.col, tile.row) || !terrain.isWallCell(tile.col, tile.row)) return null;
    const center = {
      x: tile.col * terrain.cellSize + terrain.cellSize * 0.5,
      y: tile.row * terrain.cellSize + terrain.cellSize * 0.5,
    };
    return {
      x: center.x,
      y: center.y,
      normal: { x: 0, y: -1 },
      rotation: getTorchRotationForSupport('back'),
      supportCol: tile.col,
      supportRow: tile.row,
      supportSide: 'back',
      wallMounted: true,
    };
  }

  isTorchAtSupport(island, col, row, side) {
    return Boolean((island?.placedTorches || []).some((torch) => (
      torch.supportCol === col
      && torch.supportRow === row
      && torch.supportSide === side
    )));
  }

  isTorchSupported(island, torch) {
    const terrain = island?.terrain;
    if (!terrain || !torch) return false;
    if (!Number.isInteger(torch.supportCol) || !Number.isInteger(torch.supportRow) || torch.supportCol < 0 || torch.supportRow < 0) {
      return true;
    }
    if (torch.supportSide === 'back') {
      return terrain.isInside(torch.supportCol, torch.supportRow)
        && terrain.isWallCell(torch.supportCol, torch.supportRow)
        && !terrain.isSolidCell(torch.supportCol, torch.supportRow);
    }
    if (!terrain.isInside(torch.supportCol, torch.supportRow) || !terrain.isSolidCell(torch.supportCol, torch.supportRow)) return false;
    const support = TORCH_SUPPORT_SIDES.find((entry) => entry.side === torch.supportSide) || TORCH_SUPPORT_SIDES[0];
    const airCol = torch.supportCol + support.colOffset;
    const airRow = torch.supportRow + support.rowOffset;
    return !terrain.isInside(airCol, airRow) || !terrain.isSolidCell(airCol, airRow);
  }

  updateUnsupportedTorchCleanup(delta) {
    if (!this.activeIsland?.placedTorches?.length) return;
    this.torchSupportCheckTimer = Math.max(0, (this.torchSupportCheckTimer || 0) - delta);
    if (this.torchSupportCheckTimer > 0) return;
    this.torchSupportCheckTimer = 0.5;
    this.removeUnsupportedTorches({ drop: false });
  }

  removeUnsupportedTorches({ brokenCells = null, drop = true } = {}) {
    const island = this.activeIsland;
    if (!island?.placedTorches?.length) return 0;
    const changed = brokenCells
      ? new Set(brokenCells.map((cell) => `${cell.col}:${cell.row}`))
      : null;
    const kept = [];
    const removed = [];
    for (const torch of island.placedTorches) {
      const shouldCheck = !changed
        || changed.has(`${torch.supportCol}:${torch.supportRow}`)
        || !Number.isInteger(torch.supportCol)
        || torch.supportCol < 0;
      if (!shouldCheck || this.isTorchSupported(island, torch)) kept.push(torch);
      else removed.push(torch);
    }
    if (!removed.length) return 0;
    island.placedTorches = kept;
    this.game.systems.islands.saveTorches(island.id, island.placedTorches);
    if (drop) {
      const material = this.game.systems.materials.getMaterial('torch');
      removed.forEach((torch) => {
        const world = island.localToWorldRotated(torch.x, torch.y, this.getIslandViewRotation());
        this.spawnIslandLootDrop('torch', 1, {
          worldX: world.x,
          worldY: world.y,
          material,
          storagePickup: false,
          pickupDelay: 0.08,
        });
      });
      this.game.ui.showToast(removed.length > 1 ? `${removed.length} torches dropped` : 'Torch dropped', 'default', 950);
    }
    return removed.length;
  }

  placeTorchOnIsland(preview = null) {
    if (this.game.ui.modalLayer?.children.length) return;
    const island = this.activeIsland;
    const player = this.islandPlayer;
    if (!island || !player || this.islandMode !== 'onIsland') return;
    if (this.getAvailableItemAmount('torch') <= 0) {
      this.game.audio.playError?.();
      this.game.ui.showToast('No torches in inventory', 'danger', 1100);
      return;
    }
    const target = preview || this.getTorchPlacementPreview();
    if (!target?.valid) {
      this.game.audio.playError?.();
      this.game.ui.showToast(target?.reason || 'Aim the torch at solid ground', 'danger', 1100);
      return;
    }

    this.updateIslandPlayerFacingFromAim(target.rawAimPoint);
    const torches = island.placedTorches ||= [];
    if (torches.length >= 96) torches.shift();
    const torch = new PlacedTorch({
      x: target.x,
      y: target.y,
      rotation: target.rotation,
      supportCol: target.supportCol,
      supportRow: target.supportRow,
      supportSide: target.supportSide,
      igniteStart: this.time,
    });
    torches.push(torch);
    this.torchPlacementPreview = null;
    this.consumeHeldOrInventoryItem('torch', 1);
    this.game.systems.islands.saveTorches(island.id, torches, { skipSave: true });
    this.schedulePickupSave(0.9);
    this.refreshHotbar(true);
    const world = island.localToWorldRotated(torch.x, torch.y, this.getIslandViewRotation());
    this.spawnBurst(world.x, world.y - 18, '#ffb45f', 12, 82);
    this.addFloatingText(world.x, world.y - 28, 'Torch placed', { color: '#ffb45f', rarity: 'common' });
    this.game.audio.playSuccess?.();
  }

  getPlatformPlacementPreview({ line = this.isPlatformPlacerToolSelected() } = {}) {
    const island = this.activeIsland;
    const terrain = island?.terrain;
    const player = this.islandPlayer;
    const building = this.game.systems.building;
    if (!island || !terrain || !player || !building) return null;
    const aim = building.getAimState(this);
    if (!aim) return null;
    const target = building.getTargetTile(terrain, aim, 'platform');
    const direction = this.getPlatformPlacementDirection(aim);
    const count = line ? PLATFORM_PLACE_COUNT : 1;
    const available = this.getAvailableItemAmount('thinPlatform');
    const tileSet = new Set();
    const tiles = [];
    for (let index = 0; index < count; index += 1) {
      if (!target) break;
      const col = target.col + direction * index;
      const row = target.row;
      const key = `${col}:${row}`;
      if (tileSet.has(key)) continue;
      tileSet.add(key);
      const center = terrain.isInside(col, row)
        ? building.planetTileToWorld(col, row, { terrain })
        : { x: aim.aimPoint.x, y: aim.aimPoint.y };
      const validation = this.validatePlatformPlacementTile(col, row, {
        center,
        inRange: aim.inRange,
        needsInventory: index < available,
      });
      tiles.push({
        col,
        row,
        center,
        valid: validation.ok,
        reason: validation.reason,
      });
    }
    const validTiles = tiles.filter((tile) => tile.valid);
    return {
      island,
      terrain,
      target,
      tiles,
      validTiles,
      valid: validTiles.length > 0,
      reason: validTiles.length ? '' : (tiles[0]?.reason || 'No target tile'),
      itemId: 'thinPlatform',
      tool: line ? 'pp5' : 'platform',
      count,
      available,
      origin: aim.origin,
      aimPoint: tiles[0]?.center || aim.aimPoint,
      rawAimPoint: aim.rawAimPoint,
      end: tiles[tiles.length - 1]?.center || aim.aimPoint,
      range: aim.range,
      length: aim.length,
      snapCursor: aim.snapped,
    };
  }

  getPlatformPlacementDirection(aim) {
    const basis = this.activeIsland ? this.getIslandGravityBasis(this.activeIsland) : { tangent: { x: 1, y: 0 } };
    const dx = (aim?.rawAimPoint?.x ?? aim?.aimPoint?.x ?? 0) - (aim?.origin?.x ?? this.islandPlayer?.centerX ?? 0);
    const dy = (aim?.rawAimPoint?.y ?? aim?.aimPoint?.y ?? 0) - (aim?.origin?.y ?? this.islandPlayer?.centerY ?? 0);
    const tangentAmount = dx * basis.tangent.x + dy * basis.tangent.y;
    if (Math.abs(tangentAmount) > 2) return tangentAmount >= 0 ? 1 : -1;
    return this.islandPlayer?.facing >= 0 ? 1 : -1;
  }

  validatePlatformPlacementTile(col, row, { center = null, inRange = true, needsInventory = true } = {}) {
    const terrain = this.activeIsland?.terrain;
    if (!terrain?.isInside?.(col, row)) return { ok: false, reason: 'Outside build grid' };
    if (!inRange) return { ok: false, reason: 'Too far' };
    if (needsInventory && this.getAvailableItemAmount('thinPlatform') <= 0) return { ok: false, reason: 'No thin platforms' };
    if (terrain.isSolidCell(col, row)) return { ok: false, reason: 'Tile occupied' };
    if (this.isPlatformAtTile(this.activeIsland, col, row)) return { ok: false, reason: 'Platform already placed' };
    const playerShape = this.getPlanetPlayerCollisionShape?.(this.islandPlayer, this.activeIsland);
    if (playerShape && center) {
      const size = terrain.cellSize || 20;
      const left = center.x - size * 0.5;
      const top = center.y - size * 0.5;
      if (this.orientedBoxIntersectsAabb(playerShape, left, top, left + size, top + size)) {
        return { ok: false, reason: 'Too close to you' };
      }
    }
    return { ok: true, reason: '' };
  }

  isPlatformAtTile(island, col, row) {
    return Boolean((island?.placedPlatforms || []).some((platform) => platform.col === col && platform.row === row));
  }

  createPlatformForTile(col, row) {
    const island = this.activeIsland;
    const terrain = island?.terrain;
    const building = this.game.systems.building;
    if (!island || !terrain || !building) return null;
    const center = building.planetTileToWorld(col, row, { terrain });
    const basis = this.getIslandGravityBasis(island);
    const angle = Math.atan2(basis.tangent.y, basis.tangent.x);
    const size = terrain.cellSize || 25;
    return new PlacedPlatform({
      col,
      row,
      x: center.x,
      y: center.y,
      angle,
      length: size * 0.96,
      thickness: Math.max(5, size * 0.22),
    });
  }

  placePlatformOnIsland(preview = null) {
    if (this.game.ui.modalLayer?.children.length) return;
    const island = this.activeIsland;
    if (!island || !this.islandPlayer || this.islandMode !== 'onIsland') return;
    const target = preview || this.getPlatformPlacementPreview();
    const validTiles = (target?.validTiles || []).slice(0, Math.min(target?.count || 1, this.getAvailableItemAmount('thinPlatform')));
    if (!validTiles.length) {
      this.game.audio.playError?.();
      this.game.ui.showToast(target?.reason || 'Aim at open space for a platform', 'danger', 1100);
      return;
    }

    this.updateIslandPlayerFacingFromAim(target.rawAimPoint);
    island.placedPlatforms ||= [];
    const placed = [];
    for (const tile of validTiles) {
      const platform = this.createPlatformForTile(tile.col, tile.row);
      if (!platform) continue;
      const consumed = this.consumeHeldOrInventoryItem('thinPlatform', 1);
      if (!consumed.ok) break;
      island.placedPlatforms.push(platform);
      placed.push(platform);
    }
    if (!placed.length) {
      this.game.audio.playError?.();
      this.game.ui.showToast('No thin platforms', 'danger', 1100);
      return;
    }
    this.platformPlacementPreview = null;
    this.game.systems.islands.savePlatforms(island.id, island.placedPlatforms);
    this.refreshHotbar(true);
    this.updateQuickInventory(true);
    const viewRotation = this.getIslandViewRotation();
    const mid = placed[Math.floor(placed.length / 2)];
    const world = island.localToWorldRotated(mid.x, mid.y, viewRotation);
    this.spawnBurst(world.x, world.y, '#7ee7ff', 8 + placed.length, 82);
    this.addFloatingText(world.x, world.y - 20, placed.length > 1 ? `+${placed.length} platforms` : 'Platform placed', {
      color: '#7ee7ff',
      rarity: 'common',
    });
    this.game.audio.playButtonClick?.();
  }

  getDoorPlacementPreview() {
    const island = this.activeIsland;
    const terrain = island?.terrain;
    const player = this.islandPlayer;
    const building = this.game.systems.building;
    if (!island || !terrain || !player || !building) return null;
    const aim = building.getAimState(this);
    if (!aim) return null;
    const target = building.getTargetTile(terrain, aim, 'door');
    const placement = target
      ? this.findDoorPlacementForTile(target.col, target.row, { inRange: aim.inRange })
      : { ok: false, reason: 'No target tile' };
    const topRow = placement.topRow ?? target?.row ?? 0;
    const centerRow = topRow + (DOOR_HEIGHT_TILES - 1) * 0.5;
    const center = target && terrain.isInside(target.col, Math.round(centerRow))
      ? building.planetTileToWorld(target.col, centerRow, { terrain })
      : aim.aimPoint;
    return {
      island,
      terrain,
      target: target ? { col: target.col, row: topRow } : null,
      col: target?.col ?? 0,
      topRow,
      valid: Boolean(placement.ok),
      reason: placement.reason || '',
      itemId: 'metalDoor',
      origin: aim.origin,
      aimPoint: center,
      rawAimPoint: aim.rawAimPoint,
      end: center,
      range: aim.range,
      length: aim.length,
      snapCursor: aim.snapped,
    };
  }

  findDoorPlacementForTile(col, row, { inRange = true } = {}) {
    const terrain = this.activeIsland?.terrain;
    if (!terrain?.isInside?.(col, row)) return { ok: false, reason: 'Outside build grid' };
    const preferredTop = row - Math.floor(DOOR_HEIGHT_TILES * 0.5);
    const candidates = [
      preferredTop,
      preferredTop - 1,
      preferredTop + 1,
      row - DOOR_HEIGHT_TILES + 1,
      row,
      preferredTop - 2,
      preferredTop + 2,
    ];
    let best = null;
    for (const topRow of candidates) {
      const validation = this.validateDoorPlacement(col, topRow, { inRange });
      const score = validation.ok ? 0 : 1;
      if (validation.ok) return { ...validation, topRow };
      if (!best || score < best.score) best = { ...validation, topRow, score };
    }
    return best || { ok: false, reason: 'No doorway' };
  }

  validateDoorPlacement(col, topRow, { inRange = true, needsInventory = true } = {}) {
    const island = this.activeIsland;
    const terrain = island?.terrain;
    if (!terrain) return { ok: false, reason: 'No terrain' };
    const bottomRow = topRow + DOOR_HEIGHT_TILES - 1;
    if (!terrain.isInside(col, topRow) || !terrain.isInside(col, bottomRow)) {
      return { ok: false, reason: 'Door needs four clear tiles' };
    }
    if (!terrain.isInside(col, topRow - 1) || !terrain.isInside(col, bottomRow + 1)) {
      return { ok: false, reason: 'Needs solid blocks above and below' };
    }
    if (!inRange) return { ok: false, reason: 'Too far' };
    if (needsInventory && this.getAvailableItemAmount('metalDoor') <= 0) return { ok: false, reason: 'No metal doors' };
    if (!terrain.isSolidCell(col, topRow - 1) || !terrain.isSolidCell(col, bottomRow + 1)) {
      return { ok: false, reason: 'Needs solid blocks above and below' };
    }
    for (let row = topRow; row <= bottomRow; row += 1) {
      if (terrain.isSolidCell(col, row)) return { ok: false, reason: 'Clear a four-tile doorway first' };
      if (this.isPlatformAtTile(island, col, row)) return { ok: false, reason: 'Clear platforms first' };
      if (this.isDoorAtTile(island, col, row)) return { ok: false, reason: 'Door already placed' };
    }
    if (this.doesDoorOverlapPlayer(col, topRow, terrain)) return { ok: false, reason: 'Too close to you' };
    return { ok: true, reason: '' };
  }

  doesDoorOverlapPlayer(col, topRow, terrain = this.activeIsland?.terrain) {
    const playerShape = this.getPlanetPlayerCollisionShape?.(this.islandPlayer, this.activeIsland);
    if (!playerShape || !terrain) return false;
    const size = terrain.cellSize || 25;
    const padding = size * 0.08;
    const left = col * size + padding;
    const top = topRow * size + padding;
    const right = (col + 1) * size - padding;
    const bottom = (topRow + DOOR_HEIGHT_TILES) * size - padding;
    return this.orientedBoxIntersectsAabb(playerShape, left, top, right, bottom);
  }

  isDoorAtTile(island, col, row) {
    return Boolean((island?.placedDoors || []).some((door) => door.containsTile?.(col, row)));
  }

  createDoorForTile(col, topRow) {
    const terrain = this.activeIsland?.terrain;
    const material = TERRAIN_MATERIALS[10] || {};
    return new PlacedDoor({
      col,
      topRow,
      tileSize: terrain?.cellSize || 25,
      color: material.color || '#9fafbd',
      edge: material.edge || '#26313d',
      accent: '#76f3ff',
    });
  }

  placeDoorOnIsland(preview = null) {
    if (this.game.ui.modalLayer?.children.length) return;
    const island = this.activeIsland;
    if (!island || !this.islandPlayer || this.islandMode !== 'onIsland') return;
    const target = preview || this.getDoorPlacementPreview();
    if (!target?.valid) {
      this.game.audio.playError?.();
      this.game.ui.showToast(target?.reason || 'Aim at a supported four-tile doorway', 'danger', 1300);
      return;
    }
    const consumed = this.consumeHeldOrInventoryItem('metalDoor', 1);
    if (!consumed.ok) {
      this.game.audio.playError?.();
      this.game.ui.showToast('No metal doors', 'danger', 1100);
      return;
    }
    this.updateIslandPlayerFacingFromAim(target.rawAimPoint);
    island.placedDoors ||= [];
    const door = this.createDoorForTile(target.col, target.topRow);
    island.placedDoors.push(door);
    this.doorPlacementPreview = null;
    this.game.systems.islands.saveDoors(island.id, island.placedDoors);
    this.refreshHotbar(true);
    this.updateQuickInventory(true);
    const centerWorld = island.localToWorldRotated(door.x, door.y, this.getIslandViewRotation());
    this.spawnBurst(centerWorld.x, centerWorld.y, '#76f3ff', 10, 85);
    this.addFloatingText(centerWorld.x, centerWorld.y - 26, 'Door placed', { color: '#76f3ff', rarity: 'common' });
    this.game.audio.playButtonClick?.();
  }

  updateIslandPlacedDoors(delta) {
    const doors = this.activeIsland?.placedDoors || [];
    if (!doors.length) return;
    let changed = false;
    doors.forEach((door) => {
      changed = door.update(delta, this.islandPlayer) || changed;
    });
    if (changed) this.game.audio.playButtonHover?.();
  }

  isFurnaceToolSelected() {
    return this.heldItemState?.itemId === 'starterFurnace'
      || this.game.input.getSelectedHotbarSlot?.()?.id === 'furnace';
  }

  isCraftingStationToolSelected() {
    return this.heldItemState?.itemId === 'craftingStationKit'
      || this.game.input.getSelectedHotbarSlot?.()?.id === 'craftingStation';
  }

  getCraftingStationPlacementPreview() {
    if (!this.activeIsland || !this.islandPlayer) return null;
    const preview = this.getIslandTerrainPreview({ updateFacing: false });
    if (!preview?.hit) return preview ? { ...preview, canPlace: false } : null;
    const story = this.getStoryState();
    return {
      ...preview,
      canPlace: Boolean(!story.craftingStationPlaced && this.getAvailableItemAmount('craftingStationKit') > 0),
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
    if (this.getAvailableItemAmount('craftingStationKit') <= 0) {
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
    this.consumeItemForPlacement('craftingStationKit', 1);
    this.placedCraftingStation = new PlacedCraftingStation({
      x: pad.x,
      y: pad.y,
      rotation: -this.getIslandViewRotation(),
      compact: true,
      shape: PlacedCraftingStation.createDefaultShape(),
    });
    story.craftingStationPlaced = true;
    story.craftingStation = { ...this.placedCraftingStation.serialize(), islandId: island.id };
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

  getResearchStationPlacementPreview() {
    if (!this.activeIsland || !this.islandPlayer) return null;
    const preview = this.getIslandTerrainPreview({ updateFacing: false });
    if (!preview?.hit) return preview ? { ...preview, canPlace: false } : null;
    const story = this.getStoryState();
    return {
      ...preview,
      canPlace: Boolean(!story.researchStationPlaced && this.getAvailableItemAmount('researchStationKit') > 0),
    };
  }

  placeResearchStationOnIsland(preview = null) {
    if (this.game.ui.modalLayer?.children.length) return;
    const island = this.activeIsland;
    const player = this.islandPlayer;
    if (!island || !player || this.islandMode !== 'onIsland') return;
    const story = this.getStoryState();
    if (story.researchStationPlaced || this.placedResearchStation) {
      this.game.audio.playError?.();
      this.game.ui.showToast('Research station is already placed', 'default', 1200);
      return;
    }
    if (this.getAvailableItemAmount('researchStationKit') <= 0) {
      this.game.audio.playError?.();
      this.game.ui.showToast('No research station in inventory', 'danger', 1200);
      return;
    }
    const target = preview || this.getResearchStationPlacementPreview();
    if (!target?.hit) {
      this.game.audio.playError?.();
      this.game.ui.showToast('Aim the research station at solid ground', 'danger', 1200);
      return;
    }

    this.updateIslandPlayerFacingFromAim(target.rawAimPoint);
    const pad = island.terrain.createPlacementPad(target.hit.x, target.hit.y, {
      viewRotation: this.getIslandViewRotation(),
      width: 128,
      clearance: 92,
      depth: 48,
      material: target.hit.material,
    });
    this.consumeItemForPlacement('researchStationKit', 1);
    this.placedResearchStation = new PlacedResearchStation({
      x: pad.x,
      y: pad.y,
      rotation: -this.getIslandViewRotation(),
      compact: true,
    });
    story.researchStationPlaced = true;
    story.researchStation = { ...this.placedResearchStation.serialize(), islandId: island.id };
    this.researchStationPlacementPreview = null;
    this.islandTerrainDirty = this.islandTerrainDirty || pad.changed;
    if (this.islandTerrainDirty) {
      this.game.systems.islands.saveTerrain(island.id, island.terrain);
      this.islandTerrainDirty = false;
    }
    this.game.saveGame();
    this.refreshHotbar(true);
    const world = island.localToWorldRotated(pad.x, pad.y, this.getIslandViewRotation());
    this.spawnBurst(world.x, world.y, '#b794ff', 16, 105);
    this.addFloatingText(world.x, world.y - 24, 'Research station placed', { color: '#b794ff', rarity: 'uncommon' });
    this.game.audio.playSuccess?.();
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
      islandId: island.id,
      blueprintId: blueprint.id,
      name: blueprint.name || 'Starter Furnace',
      active: null,
      queue: [],
      completed: {},
    });
    story.furnacePlaced = true;
    this.game.systems.quests?.refresh?.({ notify: true, save: false });
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
    const inventoryCount = this.getAvailableItemAmount('starterFurnace');
    return Math.max(inventoryCount, story.furnaceInventory?.length || 0);
  }

  consumeFurnaceBlueprint() {
    const story = this.getStoryState();
    story.furnaceInventory ||= [];
    let blueprint = story.furnaceInventory.shift();
    if (!blueprint) blueprint = this.createDefaultFurnaceBlueprint();
    if (this.getAvailableItemAmount('starterFurnace') > 0) this.consumeItemForPlacement('starterFurnace', 1);
    return blueprint;
  }

  createDefaultFurnaceBlueprint() {
    const recipe = gameBalance.earlyGame?.crashStart?.furnaceRecipe || {};
    const tileSize = Math.max(7, Math.round((this.activeIsland?.terrain?.cellSize || 22) / 3));
    const cells = [];
    const chamberKeys = new Set();
    for (let x = 6; x <= 8; x += 1) {
      for (let y = 6; y <= 8; y += 1) chamberKeys.add(`${x},${y}`);
    }
    const shellCoords = [];
    for (let x = 5; x <= 9; x += 1) {
      for (let y = 5; y <= 9; y += 1) {
        if (!chamberKeys.has(`${x},${y}`)) shellCoords.push([x, y]);
      }
    }
    const coreCell = [5, 7];
    const coreKey = `${coreCell[0]},${coreCell[1]}`;
    [
      ...shellCoords.filter(([x, y]) => `${x},${y}` !== coreKey),
      [4, 5],
      [4, 6],
      [4, 8],
      [4, 9],
      [10, 9],
    ].forEach(([x, y]) => cells.push(this.createCraftCell(x, y, 'stoneOre')));
    cells.push(this.createCraftCell(coreCell[0], coreCell[1], { layers: ['ironDust', 'fireCore'], shape: 'full' }));
    return {
      id: `furnace-blueprint-${Date.now().toString(36)}`,
      recipeId: recipe.id || 'starterFurnace',
      name: recipe.name || 'Starter Furnace',
      shape: { gridSize: 16, tileSize, cells },
    };
  }

  updatePlacedFurnace(delta) {
    if (!this.placedFurnaces.length) return;
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

  updatePlacedResearchStation(delta) {
    if (!this.placedResearchStation) return;
    this.placedResearchStation.update(delta);
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

  getNearbyWorkbench(player = this.islandPlayer) {
    if (!player) return null;
    const candidates = [];
    if (this.placedCraftingStation?.overlapsPlayer(player)) {
      const dx = player.centerX - this.placedCraftingStation.x;
      const dy = player.centerY - this.placedCraftingStation.y;
      candidates.push({ type: 'crafting', station: this.placedCraftingStation, distanceSq: dx * dx + dy * dy });
    }
    if (this.placedResearchStation?.overlapsPlayer(player)) {
      const dx = player.centerX - this.placedResearchStation.x;
      const dy = player.centerY - this.placedResearchStation.y;
      candidates.push({ type: 'research', station: this.placedResearchStation, distanceSq: dx * dx + dy * dy });
    }
    candidates.sort((a, b) => a.distanceSq - b.distanceSq);
    return candidates[0] || null;
  }

  startCrashTutorialHint(key) {
    if (gameBalance.tutorialDialogueEnabled === false) return;
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
    if (this.voxelCraftState) this.voxelCraftState.heldMaterialId = null;
    this.clearVoxelCraftHeldCursor();
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
    const hotbarSignature = (this.game.input.hotbarSlotIds || []).join(',');
    return `${hotbarSignature}::${this.getBackpackInventoryEntries()
      .map(([itemId, amount]) => `${itemId}:${amount}`)
      .join('|')}`;
  }

  getHotbarInventoryItemIds({ excludeIndex = -1 } = {}) {
    const ids = new Set();
    (this.game.input.hotbarSlotIds || []).forEach((slotId, index) => {
      if (index === excludeIndex) return;
      const slot = this.game.input.getHotbarSlotAt?.(index, { ignoreOwnership: true });
      if (slot?.inventoryItemId && this.game.systems.inventory.getStoredAmount(slot.inventoryItemId) > 0) {
        ids.add(slot.inventoryItemId);
      }
    });
    return ids;
  }

  isItemAssignedToHotbar(itemId, options = {}) {
    if (!itemId) return false;
    return this.getHotbarInventoryItemIds(options).has(itemId);
  }

  sortInventoryEntries(entries = []) {
    return entries.sort(([leftId, leftAmount], [rightId, rightAmount]) => {
      const left = this.game.systems.materials.getMaterial(leftId);
      const right = this.game.systems.materials.getMaterial(rightId);
      const rarityOrder = { common: 0, uncommon: 1, rare: 2, epic: 3 };
      const rarityDiff = (rarityOrder[left?.rarity || 'common'] ?? 0) - (rarityOrder[right?.rarity || 'common'] ?? 0);
      if (rarityDiff) return rarityDiff;
      if (rightAmount !== leftAmount) return rightAmount - leftAmount;
      return this.game.systems.materials.getDisplayName(leftId).localeCompare(this.game.systems.materials.getDisplayName(rightId));
    });
  }

  getBackpackInventoryEntries() {
    const hotbarItems = this.getHotbarInventoryItemIds();
    return this.sortInventoryEntries(
      Object.entries(this.game.systems.inventory.storage || {})
        .filter(([itemId, amount]) => amount > 0 && !hotbarItems.has(itemId)),
    );
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
    const entries = this.getBackpackInventoryEntries();
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
    button.dataset.inventorySlot = 'true';
    if (!itemId || amount <= 0) {
      button.setAttribute('aria-label', 'Empty inventory slot');
      button.setAttribute('aria-disabled', 'true');
      button.addEventListener('pointerdown', (event) => {
        if (this.handleInventorySlotPointerDown(event)) return;
        event.stopPropagation();
        if (event.button === 0) event.preventDefault();
      });
      return button;
    }
    const material = this.game.systems.materials.getMaterial(itemId);
    const rarity = material?.rarity || 'common';
    const name = this.game.systems.materials.getDisplayName(itemId);
    button.dataset.itemId = itemId;
    button.classList.add(`rarity-${rarity}`);
    button.style.setProperty('--item-color', material?.color || '#fff2cf');
    button.dataset.itemTooltip = `${name} x${this.formatStackCount(amount)}`;
    button.innerHTML = `
      <span class="slot-icon">${this.getMaterialIconMarkup(itemId, material)}</span>
      <strong class="slot-count">x${this.formatStackCount(amount)}</strong>
    `;
    button.title = `${name} x${this.formatStackCount(amount)} | ${this.game.systems.materials.getRarityLabel(rarity)} | ${this.game.systems.materials.getValue(itemId, amount)} cr`;
    button.setAttribute('aria-label', `${name}, ${amount}`);
    button.addEventListener('pointerdown', (event) => {
      if (this.handleInventorySlotPointerDown(event)) return;
      event.stopPropagation();
      if (event.button === 2) {
        event.preventDefault();
        this.autoAssignItemToHotbar(itemId);
        return;
      }
      if (event.button === 0) {
        event.preventDefault();
        if (itemId === 'gravityStabilizer' && this.activateGravityMachineFromInventory()) return;
        this.beginHeldInventoryItem({ itemId, source: 'inventory', pointerEvent: event });
      }
    });
    button.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.autoAssignItemToHotbar(itemId);
    });
    button.addEventListener('click', (event) => {
      if (this.suppressInventoryClick) {
        this.suppressInventoryClick = false;
        return;
      }
      event.stopPropagation();
    });
    return button;
  }

  showInventoryModal() {
    if (this.survivalModalKind === 'inventory') {
      this.closeSurvivalModal();
      return;
    }
    const inventory = this.game.systems.inventory.storage;
    const entries = this.getBackpackInventoryEntries();
    const content = document.createElement('div');
    content.className = 'survival-inventory';
    const grid = document.createElement('div');
    grid.className = 'survival-inventory-grid';
    const playerInventorySlots = gameBalance.inventory?.playerSlots || 28;
    const slotCount = Math.max(playerInventorySlots, Math.ceil(entries.length / 7) * 7 || playerInventorySlots);
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
    button.dataset.inventorySlot = 'true';
    if (!itemId || amount <= 0) {
      button.innerHTML = '<span class="slot-icon">+</span>';
      button.setAttribute('aria-disabled', 'true');
      button.setAttribute('aria-label', 'Empty inventory slot');
      button.addEventListener('pointerdown', (event) => {
        if (this.handleInventorySlotPointerDown(event)) return;
        event.stopPropagation();
        if (event.button === 0) event.preventDefault();
      });
      return button;
    }
    const material = this.game.systems.materials.getMaterial(itemId);
    const rarity = material?.rarity || 'common';
    button.dataset.itemId = itemId;
    button.classList.add(`rarity-${rarity}`);
    button.style.setProperty('--item-color', material?.color || '#fff2cf');
    button.dataset.itemTooltip = `${this.game.systems.materials.getDisplayName(itemId)} x${this.formatStackCount(amount)}`;
    button.innerHTML = `
      <span class="slot-icon" style="--item-color: ${material?.color || '#fff2cf'}">${this.getMaterialIconMarkup(itemId, material)}</span>
      <strong class="slot-count">x${this.formatStackCount(amount)}</strong>
    `;
    button.title = `${this.game.systems.materials.getDisplayName(itemId)} x${this.formatStackCount(amount)}`;
    button.addEventListener('pointerdown', (event) => {
      if (this.handleInventorySlotPointerDown(event)) return;
      event.stopPropagation();
      if (event.button === 2) {
        event.preventDefault();
        this.autoAssignItemToHotbar(itemId);
        return;
      }
      if (event.button === 0) {
        event.preventDefault();
        if (itemId === 'gravityStabilizer' && this.activateGravityMachineFromInventory()) return;
        this.beginHeldInventoryItem({ itemId, source: 'inventory', pointerEvent: event });
      }
    });
    button.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.autoAssignItemToHotbar(itemId);
    });
    button.addEventListener('click', (event) => {
      if (this.suppressInventoryClick) {
        this.suppressInventoryClick = false;
        return;
      }
      event.stopPropagation();
    });
    return button;
  }

  hasHeldInventoryItem() {
    return Boolean(this.heldItemState?.itemId);
  }

  handleInventorySlotPointerDown(event) {
    if (!this.heldItemState || event.button !== 0) return false;
    event.preventDefault?.();
    event.stopPropagation?.();
    this.clearHeldItemState({ returnToInventory: true });
    this.game.audio.playButtonClick?.();
    return true;
  }

  formatStackCount(amount = 0) {
    const value = Math.max(0, Math.floor(Number(amount) || 0));
    if (value >= 1000000) return `${Math.floor(value / 100000) / 10}m`;
    if (value >= 10000) return `${Math.floor(value / 100) / 10}k`;
    return String(value);
  }

  getItemIconMarkup(itemId, fallback = '?', className = 'item-icon-img inventory-item-icon') {
    return createItemIconMarkup(itemId, fallback, {
      className,
      alt: this.game.systems.materials.getDisplayName(itemId),
    });
  }

  getMaterialIconMarkup(itemId, material = this.game.systems.materials.getMaterial(itemId), className = 'item-icon-img inventory-item-icon') {
    const fallback = material?.icon || '?';
    return this.getItemIconMarkup(itemId, fallback, className);
  }

  getAvailableItemAmount(itemId) {
    if (!itemId) return 0;
    const heldAmount = this.heldItemState?.itemId === itemId ? this.heldItemState.amount || 0 : 0;
    return heldAmount + this.game.systems.inventory.getStoredAmount(itemId);
  }

  consumeHeldOrInventoryItem(itemId, amount = 1) {
    const consumeAmount = Math.max(1, Math.floor(amount));
    const held = this.heldItemState;
    if (held?.itemId === itemId) {
      if ((held.amount || 0) < consumeAmount) return { ok: false, source: 'held' };
      held.amount -= consumeAmount;
      if (held.amount <= 0) this.clearHeldItemState();
      else this.updateHeldItemGhost(held.lastClientX, held.lastClientY);
      this.updateQuickInventory(true);
      this.refreshHotbar(true);
      return { ok: true, source: 'held' };
    }
    const ok = this.game.systems.inventory.remove(itemId, consumeAmount, { skipSave: true });
    return { ok, source: 'inventory' };
  }

  consumeItemForPlacement(itemId, amount = 1) {
    return this.consumeHeldOrInventoryItem(itemId, amount).ok;
  }

  returnHeldItemToInventory() {
    const held = this.heldItemState;
    if (!held?.itemId || (held.amount || 0) <= 0) return false;
    this.game.systems.inventory.add(held.itemId, held.amount, { skipSave: true });
    held.amount = 0;
    return true;
  }

  beginHeldInventoryItem({ itemId, source = 'inventory', hotbarSlotIndex = -1, pointerEvent = null } = {}) {
    const amount = this.game.systems.inventory.getStoredAmount(itemId);
    if (!itemId || amount <= 0) return false;
    if (source === 'inventory' && this.isItemAssignedToHotbar(itemId)) {
      this.updateQuickInventory(true);
      this.game.audio.playError?.();
      return false;
    }
    pointerEvent?.preventDefault?.();
    pointerEvent?.stopPropagation?.();
    this.cancelItemDrag({ returnHeldToInventory: true });
    if (!this.game.systems.inventory.remove(itemId, amount, { skipSave: true })) return false;
    const material = this.game.systems.materials.getMaterial(itemId);
    const ghost = document.createElement('div');
    ghost.className = 'item-drag-ghost is-dragging is-held';
    ghost.style.setProperty('--item-color', material?.color || '#fff2cf');
    ghost.innerHTML = `
      <span>${this.getMaterialIconMarkup(itemId, material, 'item-icon-img drag-item-icon')}</span>
      <strong data-held-item-count>x${this.formatStackCount(amount)}</strong>
    `;
    document.body.append(ghost);
    const startX = pointerEvent?.clientX ?? this.game.input.mousePointer?.x ?? window.innerWidth * 0.5;
    const startY = pointerEvent?.clientY ?? this.game.input.mousePointer?.y ?? window.innerHeight * 0.5;
    this.heldItemState = {
      itemId,
      source,
      hotbarSlotIndex,
      amount,
      ghost,
      lastClientX: startX,
      lastClientY: startY,
    };
    this.updateHeldItemGhost(startX, startY);
    this.heldItemMoveHandler = (event) => this.updateHeldItemGhost(event.clientX, event.clientY);
    window.addEventListener('pointermove', this.heldItemMoveHandler, { passive: true });
    if (this.game.systems.building?.isBuildableItem?.(itemId)) {
      this.activeBuildItemId = itemId;
      this.activeBuildMode ||= 'foregroundBlock';
    }
    this.updateQuickInventory(true);
    this.refreshHotbar(true);
    this.game.audio.playButtonClick?.();
    this.game.ui.showToast(`${this.game.systems.materials.getDisplayName(itemId)} held`, 'default', 900);
    return true;
  }

  updateHeldItemGhost(clientX, clientY) {
    const held = this.heldItemState;
    if (!held?.ghost) return;
    held.lastClientX = clientX;
    held.lastClientY = clientY;
    held.ghost.style.transform = `translate(${clientX}px, ${clientY}px)`;
    const count = held.ghost.querySelector('[data-held-item-count]');
    if (count) count.textContent = `x${this.formatStackCount(held.amount || 0)}`;
  }

  updateHeldItemState() {
    const held = this.heldItemState;
    if (!held) return;
    const amount = held.amount || 0;
    if (amount <= 0) {
      this.clearHeldItemState();
      return;
    }
    const count = held.ghost?.querySelector('[data-held-item-count]');
    const formatted = `x${this.formatStackCount(amount)}`;
    if (count && count.textContent !== formatted) count.textContent = formatted;
    const actions = this.game.input.actions;
    if (actions.justPressed?.dropHeldAll) {
      this.dropHeldInventoryItem('all');
      return;
    }
    if (actions.justPressed?.dropHeldOne) this.dropHeldInventoryItem(1);
  }

  cleanupHeldItemListeners() {
    if (this.heldItemMoveHandler) window.removeEventListener('pointermove', this.heldItemMoveHandler);
    this.heldItemMoveHandler = null;
  }

  clearHeldItemState({ returnToInventory = false } = {}) {
    if (returnToInventory) this.returnHeldItemToInventory();
    this.cleanupHeldItemListeners();
    this.heldItemState?.ghost?.remove();
    this.heldItemState = null;
    this.updateQuickInventory(true);
    this.refreshHotbar(true);
  }

  handleHotbarSlotClick(index, event = null) {
    const held = this.heldItemState;
    if (!held) return false;
    event?.preventDefault?.();
    event?.stopPropagation?.();
    const amount = held.amount || 0;
    if (amount > 0) this.game.systems.inventory.add(held.itemId, amount, { skipSave: true });
    held.amount = 0;
    const assigned = this.assignInventoryItemToHotbar(held.itemId, index, {
      clearSourceIndex: held.source === 'hotbar' ? held.hotbarSlotIndex : -1,
    });
    if (assigned) this.clearHeldItemState();
    else {
      if (amount > 0) this.game.systems.inventory.remove(held.itemId, amount, { skipSave: true });
      held.amount = amount;
      this.updateHeldItemGhost(held.lastClientX, held.lastClientY);
    }
    return true;
  }

  handleHeldItemWorldUse(actions) {
    const held = this.heldItemState;
    if (!held || this.game.ui.modalLayer?.children.length) return false;
    if (!actions.justPressed?.primaryUse && !actions.justPressed?.aimUse) return false;
    if (this.game.systems.building?.isBuildableItem?.(held.itemId)) return false;

    switch (held.itemId) {
      case 'markerFlag':
        this.placeFlagOnIsland(this.flagPlacementPreview);
        break;
      case 'torch':
        this.placeTorchOnIsland(this.torchPlacementPreview);
        break;
      case 'thinPlatform':
      case 'platformPlacerPp5':
        this.placePlatformOnIsland(this.platformPlacementPreview);
        break;
      case 'metalDoor':
        this.placeDoorOnIsland(this.doorPlacementPreview);
        break;
      case 'starterFurnace':
        this.placeFurnaceOnIsland(this.furnacePlacementPreview);
        break;
      case 'craftingStationKit':
        this.placeCraftingStationOnIsland(this.craftingStationPlacementPreview);
        break;
      case 'researchStationKit':
        this.placeResearchStationOnIsland(this.researchStationPlacementPreview);
        break;
      default:
        this.dropHeldInventoryItem(1);
        break;
    }
    this.updateHeldItemState();
    return true;
  }

  dropHeldInventoryItem(amount = 1) {
    const held = this.heldItemState;
    if (!held) return false;
    const available = held.amount || 0;
    const dropAmount = amount === 'all' ? available : Math.max(1, Math.min(available, Number(amount) || 1));
    if (dropAmount <= 0) {
      this.clearHeldItemState();
      return false;
    }
    this.spawnDroppedInventoryItem(held.itemId, dropAmount);
    held.amount -= dropAmount;
    if (held.source === 'hotbar' && held.hotbarSlotIndex >= 0 && held.amount <= 0 && this.game.systems.inventory.getStoredAmount(held.itemId) <= 0) {
      this.game.input.clearHotbarSlot?.(held.hotbarSlotIndex, { notify: false });
    }
    this.game.saveGame();
    this.updateQuickInventory(true);
    this.refreshHotbar(true);
    this.game.audio.playMineralPickup?.();
    if (held.amount <= 0 || amount === 'all') this.clearHeldItemState();
    else this.updateHeldItemGhost(held.lastClientX, held.lastClientY);
    return true;
  }

  beginItemDrag({ itemId, source = 'inventory', hotbarSlotIndex = -1, pointerEvent } = {}) {
    if (!itemId || !pointerEvent || this.game.systems.inventory.getStoredAmount(itemId) <= 0) return;
    pointerEvent.preventDefault();
    pointerEvent.stopPropagation();
    this.cancelItemDrag({ returnHeldToInventory: true });
    const material = this.game.systems.materials.getMaterial(itemId);
    const ghost = document.createElement('div');
    ghost.className = 'item-drag-ghost';
    ghost.style.setProperty('--item-color', material?.color || '#fff2cf');
    ghost.innerHTML = `<span>${this.getMaterialIconMarkup(itemId, material, 'item-icon-img drag-item-icon')}</span>`;
    document.body.append(ghost);
    this.itemDragState = {
      itemId,
      source,
      hotbarSlotIndex,
      startX: pointerEvent.clientX,
      startY: pointerEvent.clientY,
      pointerId: pointerEvent.pointerId,
      moved: false,
      ghost,
    };
    this.updateItemDrag(pointerEvent);
    this.itemDragMoveHandler = (event) => this.updateItemDrag(event);
    this.itemDragUpHandler = (event) => this.finishItemDrag(event);
    window.addEventListener('pointermove', this.itemDragMoveHandler, { passive: false });
    window.addEventListener('pointerup', this.itemDragUpHandler, { passive: false });
    window.addEventListener('pointercancel', this.itemDragUpHandler, { passive: false });
  }

  updateItemDrag(event) {
    const drag = this.itemDragState;
    if (!drag || (drag.pointerId !== undefined && event.pointerId !== drag.pointerId)) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && dx * dx + dy * dy > 36) {
      drag.moved = true;
      drag.ghost?.classList.add('is-dragging');
      this.suppressInventoryClick = true;
    }
    if (drag.ghost) {
      drag.ghost.style.transform = `translate(${event.clientX}px, ${event.clientY}px)`;
    }
    event.preventDefault?.();
  }

  finishItemDrag(event) {
    const drag = this.itemDragState;
    if (!drag || (drag.pointerId !== undefined && event.pointerId !== drag.pointerId)) return;
    this.cleanupItemDragListeners();
    const target = document.elementFromPoint(event.clientX, event.clientY);
    if (!drag.moved && drag.source === 'hotbar' && drag.hotbarSlotIndex >= 0) {
      this.game.input.selectHotbarSlot(drag.hotbarSlotIndex);
      this.refreshHotbar(true);
    } else if (drag.moved) {
      const hotbarIndex = this.getHotbarSlotIndexFromElement(target);
      const inventoryIndex = this.getInventorySlotIndexFromElement(target);
      if (hotbarIndex >= 0) {
        this.assignInventoryItemToHotbar(drag.itemId, hotbarIndex, {
          clearSourceIndex: drag.source === 'hotbar' ? drag.hotbarSlotIndex : -1,
        });
      } else if (inventoryIndex >= 0 && drag.source === 'hotbar') {
        this.returnHotbarSlotToInventory(drag.hotbarSlotIndex);
      } else if (this.isInventoryDropTarget(target)) {
        this.dropInventoryItemToWorld(drag.itemId, {
          source: drag.source,
          hotbarSlotIndex: drag.hotbarSlotIndex,
        });
      }
    }
    drag.ghost?.remove();
    this.itemDragState = null;
    event.preventDefault?.();
  }

  cleanupItemDragListeners() {
    if (this.itemDragMoveHandler) window.removeEventListener('pointermove', this.itemDragMoveHandler);
    if (this.itemDragUpHandler) {
      window.removeEventListener('pointerup', this.itemDragUpHandler);
      window.removeEventListener('pointercancel', this.itemDragUpHandler);
    }
    this.itemDragMoveHandler = null;
    this.itemDragUpHandler = null;
  }

  cancelItemDrag({ returnHeldToInventory = false } = {}) {
    this.cleanupItemDragListeners();
    this.itemDragState?.ghost?.remove();
    this.itemDragState = null;
    this.clearHeldItemState({ returnToInventory: returnHeldToInventory });
  }

  getHotbarSlotIndexFromElement(target) {
    const slot = target?.closest?.('[data-hotbar-index]');
    if (!slot) return -1;
    const index = Number(slot.dataset.hotbarIndex);
    return Number.isFinite(index) ? index : -1;
  }

  getInventorySlotIndexFromElement(target) {
    const slot = target?.closest?.('[data-inventory-slot]');
    if (!slot) return -1;
    const siblings = Array.from(slot.parentElement?.querySelectorAll?.('[data-inventory-slot]') || []);
    const index = siblings.indexOf(slot);
    return index >= 0 ? index : 0;
  }

  isInventoryDropTarget(target) {
    if (!target) return true;
    if (target.closest?.('.tool-hotbar, .quick-inventory, .survival-panel')) return false;
    return true;
  }

  returnHotbarSlotToInventory(hotbarSlotIndex = -1) {
    if (hotbarSlotIndex < 0) return false;
    const slot = this.game.input.getHotbarSlotAt?.(hotbarSlotIndex, { ignoreOwnership: true });
    if (!slot?.inventoryItemId) return false;
    const cleared = this.game.input.clearHotbarSlot?.(hotbarSlotIndex);
    if (!cleared) return false;
    this.updateQuickInventory(true);
    this.refreshHotbar(true);
    this.game.audio.playButtonClick?.();
    this.game.ui.showToast(`${slot.label} moved to inventory`, 'success', 1000);
    return true;
  }

  assignInventoryItemToHotbar(itemId, hotbarIndex, { clearSourceIndex = -1 } = {}) {
    const slot = getHotbarSlotForItem(itemId);
    if (!slot) {
      this.game.audio.playError?.();
      this.game.ui.showToast('That item cannot be equipped to the hotbar yet', 'danger', 1200);
      return false;
    }
    if (clearSourceIndex >= 0 && clearSourceIndex !== hotbarIndex) {
      this.game.input.clearHotbarSlot?.(clearSourceIndex, { notify: false });
    }
    const assigned = this.game.input.assignHotbarSlot?.(hotbarIndex, slot.id);
    if (!assigned) {
      this.game.audio.playError?.();
      this.game.ui.showToast('You need that item in inventory first', 'danger', 1200);
      return false;
    }
    this.refreshHotbar(true);
    this.updateQuickInventory(true);
    if (this.game.systems.building?.isBuildableItem?.(itemId)) {
      this.activeBuildItemId = itemId;
      this.activeBuildMode ||= 'foregroundBlock';
    }
    this.game.audio.playButtonClick?.();
    this.game.ui.showToast(`${slot.label} assigned to slot ${hotbarIndex + 1}`, 'success', 1000);
    return true;
  }

  autoAssignItemToHotbar(itemId) {
    const slot = getHotbarSlotForItem(itemId);
    if (!slot) {
      this.game.audio.playError?.();
      this.game.ui.showToast('No hotbar tool for this item yet', 'danger', 1100);
      return false;
    }
    const ids = this.game.input.hotbarSlotIds || [];
    let index = ids.findIndex((slotId) => slotId === slot.id);
    if (index < 0) index = ids.findIndex((slotId) => !slotId);
    if (index < 0) index = Math.max(0, HOTBAR_SLOT_COUNT - 1);
    return this.assignInventoryItemToHotbar(itemId, index);
  }

  dropInventoryItemToWorld(itemId, { source = 'inventory', hotbarSlotIndex = -1, amount = 1 } = {}) {
    const dropAmount = Math.max(1, Math.floor(amount));
    if (!this.game.systems.inventory.remove(itemId, dropAmount, { skipSave: true })) {
      this.game.audio.playError?.();
      return false;
    }
    if (source === 'hotbar' && hotbarSlotIndex >= 0 && this.game.systems.inventory.getStoredAmount(itemId) <= 0) {
      this.game.input.clearHotbarSlot?.(hotbarSlotIndex, { notify: false });
    }
    this.spawnDroppedInventoryItem(itemId, dropAmount);
    this.game.saveGame();
    this.updateQuickInventory(true);
    this.refreshHotbar(true);
    this.game.audio.playMineralPickup?.();
    return true;
  }

  spawnDroppedInventoryItem(itemId, amount = 1) {
    const material = this.game.systems.materials.getMaterial(itemId);
    if (this.islandMode === 'onIsland' && this.activeIsland && this.islandPlayer) {
      const drop = {
        x: this.islandPlayer.centerX + this.islandPlayer.facing * 42,
        y: this.islandPlayer.centerY - 18,
      };
      const pickup = this.acquireIslandPickup({
        materialId: itemId,
        amount,
        x: drop.x,
        y: drop.y,
        seed: Math.random(),
        material,
        storagePickup: true,
        pickupDelay: 0.65,
      });
      pickup.vx = this.islandPlayer.facing * 92;
      pickup.vy = -80;
      this.islandPickups.push(pickup);
      const world = this.activeIsland.localToWorldRotated(drop.x, drop.y, this.getIslandViewRotation());
      this.addFloatingText(world.x, world.y - 22, `${this.game.systems.materials.getDisplayName(itemId)} x${amount} dropped`, {
        color: material?.color || '#fff2cf',
        rarity: material?.rarity || 'common',
      });
      return;
    }

    const angle = this.ship?.angle || 0;
    const pickup = this.acquirePickup({
      materialId: itemId,
      amount,
      x: (this.ship?.x || 0) - Math.cos(angle) * 46,
      y: (this.ship?.y || 0) - Math.sin(angle) * 46,
      seed: Math.random(),
      material,
      storagePickup: true,
      pickupDelay: 0.75,
    });
    pickup.vx = (this.ship?.vx || 0) * 0.2 - Math.cos(angle) * 70;
    pickup.vy = (this.ship?.vy || 0) * 0.2 - Math.sin(angle) * 70;
    this.pickups.push(pickup);
  }

  refreshHotbar(force = false) {
    this.hotbar?.update(force);
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
      title: 'CRAFTING STATION',
      subtitle: 'Design and build structures from the ground up.',
      className: 'crafting-survival-modal',
      content,
      actions: [],
    });
    this.survivalModal = modal;
    this.survivalModalKind = 'crafting';
    this.game.ui.showModal(modal);
  }

  ensureVoxelCraftState() {
    const recipes = this.getVoxelCraftRecipes();
    const existingRecipe = recipes.find((recipe) => recipe.id === this.voxelCraftState?.recipeId);
    if (existingRecipe) return this.voxelCraftState;
    const recipe = recipes.find((item) => item.outputItemId === 'starterFurnace') || recipes[0];
    this.voxelCraftState = {
      recipeId: recipe.id,
      selectedMaterialId: Object.keys(recipe.requirements)[0],
      heldMaterialId: null,
      selectedShapeState: 'full',
      selectedDetailId: null,
      detailMode: false,
      eraseMode: false,
      grid: this.createEmptyVoxelGrid(recipe.gridSize),
      detailGrid: this.createEmptyVoxelGrid(recipe.gridSize),
    };
    return this.voxelCraftState;
  }

  createEmptyVoxelGrid(size = 16) {
    return Array.from({ length: size * size }, () => null);
  }

  getVoxelCraftRenderGrid(grid = [], detailGrid = []) {
    return grid.map((cell, index) => {
      const normalized = this.normalizeVoxelCraftCell(cell);
      if (!normalized) return null;
      return {
        ...normalized,
        detailId: detailGrid?.[index] ?? normalized.detailId ?? null,
      };
    });
  }

  getVoxelCraftRecipes() {
    const gravityRecipe = gameBalance.earlyGame?.crashStart?.gravityMachineRecipe || {};
    const furnaceRecipe = gameBalance.earlyGame?.crashStart?.furnaceRecipe || {};
    const laserGunRecipe = gameBalance.earlyGame?.crashStart?.laserGunRecipe || {};
    return [
    {
      id: gravityRecipe.id || 'gravityMachine',
      name: gravityRecipe.name || 'Gravity Machine',
      icon: 'GM',
      category: 'Survival',
      description: 'Build a compact gravity machine so you can reorient gravity and reach the underside copper patch.',
      outputItemId: 'gravityStabilizer',
      requirements: gravityRecipe.requirements || { stoneOre: 10, ironDust: 4, fireCore: 1 },
      gridSize: gravityRecipe.gridSize || 16,
      shapeRules: gravityRecipe.shapeRules || { connected: true, mustBeConnected: true, coreMustBeEmbedded: true },
    },
    {
      id: furnaceRecipe.id || 'starterFurnace',
      name: furnaceRecipe.name || 'Starter Furnace',
      icon: 'Fu',
      category: 'Survival',
      description: 'Sculpt a furnace body with 9 connected open spaces, then mount the Fire Core on Iron Dust to heat the chamber.',
      outputItemId: 'starterFurnace',
      requirements: furnaceRecipe.requirements || { stoneOre: 20, ironDust: 1, fireCore: 1 },
      gridSize: furnaceRecipe.gridSize || 16,
      shapeRules: furnaceRecipe.shapeRules || {},
    },
    {
      id: laserGunRecipe.id || 'laserGun',
      name: laserGunRecipe.name || 'Laser Gun',
      icon: 'LG',
      category: 'Weapon',
      description: 'Place one Fire Core, five Iron Ingots, and four Copper Ingots anywhere in the grid to assemble a laser sidearm.',
      outputItemId: 'laserGun',
      requirements: laserGunRecipe.requirements || { fireCore: 1, ironIngot: 5, copperIngot: 4 },
      gridSize: laserGunRecipe.gridSize || 16,
      shapeRules: laserGunRecipe.shapeRules || {},
    },
    ];
  }

  getVoxelCraftDisplayRules(recipe, grid, validation = null) {
    const currentValidation = validation || this.validateVoxelCraft(recipe, grid);
    if (recipe.outputItemId !== 'starterFurnace') {
      return (currentValidation.messages || []).map((message) => ({
        ok: Boolean(message.ok),
        text: message.text,
      }));
    }

    const chambers = currentValidation.chambers || [];
    const meaningfulChambers = chambers
      .map((chamber) => ({ chamber, bounds: getChamberBounds(chamber) }))
      .filter((entry) => entry.bounds && entry.chamber.cells.length >= (recipe.shapeRules?.minSplitChamberCells ?? 2))
      .sort((a, b) => b.chamber.cells.length - a.chamber.cells.length);
    const mainChamber = meaningfulChambers[0] || null;
    const minCells = recipe.shapeRules?.minChamberCells || 9;
    const hasClosedStructure = Boolean(mainChamber);
    const hasSizedInterior = Boolean(mainChamber) && mainChamber.chamber.cells.length >= minCells;
    const notSplit = hasClosedStructure && meaningfulChambers.length === 1;
    const connectedMessage = currentValidation.messages?.find((message) => message.text === 'Machine body must be connected.');
    const bodyConnected = connectedMessage ? Boolean(connectedMessage.ok) : true;
    const coreMounted = isCoreMountedOnMaterial(grid, recipe.gridSize || Math.sqrt(grid.length) || 16, {
      coreId: recipe.shapeRules?.coreMaterialId || 'fireCore',
      baseMaterialId: recipe.shapeRules?.coreBaseMaterialId || 'ironDust',
    });

    return [
      { id: 'bodyConnected', ok: bodyConnected, text: 'Body connected' },
      { id: 'openChamber', ok: hasClosedStructure && hasSizedInterior, text: `${minCells}+ connected open spaces` },
      { id: 'singleChamber', ok: notSplit, text: 'Open space is not split' },
      { id: 'coreMounted', ok: coreMounted, text: 'Fire Core on Iron Dust' },
    ];
  }

  populateVoxelCraftingContentLegacy(content) {
    const recipes = this.getVoxelCraftRecipes();
    const state = this.ensureVoxelCraftState();
    const recipe = recipes.find((item) => item.id === state.recipeId) || recipes[0];
    state.detailGrid ||= this.createEmptyVoxelGrid(recipe.gridSize);
    const usage = this.getVoxelCraftUsage(state.grid);
    const validation = this.validateVoxelCraft(recipe, state.grid);
    const renderGrid = this.getVoxelCraftRenderGrid(state.grid, state.detailGrid);
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
          heldMaterialId: null,
          selectedShapeState: 'full',
          selectedDetailId: null,
          detailMode: false,
          eraseMode: false,
          grid: this.createEmptyVoxelGrid(item.gridSize),
          detailGrid: this.createEmptyVoxelGrid(item.gridSize),
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
      const craftCell = this.getVoxelCraftGridCell(renderGrid, index);
      const layers = this.getVoxelCraftCellLayers(craftCell);
      const itemId = layers[layers.length - 1] || null;
      const shapeLabel = craftCell ? getShapeStateLabel(craftCell.shapeState) : 'Full Block';
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = this.getVoxelCraftCellClassName(index, recipe.gridSize, renderGrid);
      cell.title = itemId
        ? `${layers.map((layerId) => this.game.systems.materials.getDisplayName(layerId)).join(' + ')} - ${shapeLabel}. Right-click cycles shape. Middle-click erases.`
        : 'Empty voxel. Left-click places material.';
      cell.setAttribute('aria-label', cell.title);
      cell.addEventListener('click', (event) => {
        if (state.detailMode) this.paintVoxelCraftDetail(index, event.shiftKey ? null : state.selectedDetailId);
        else this.paintVoxelCraftCell(index, event.shiftKey || state.eraseMode ? null : state.selectedMaterialId);
        this.populateVoxelCraftingContent(content);
      });
      cell.addEventListener('auxclick', (event) => {
        if (event.button !== 1) return;
        event.preventDefault();
        this.paintVoxelCraftCell(index, null);
        if (state.detailGrid) state.detailGrid[index] = null;
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
      grid: renderGrid,
      size: recipe.gridSize,
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

    const tools = document.createElement('div');
    tools.className = 'voxel-craft-tools';
    const currentShape = MACHINE_SHAPE_STATES.find((shape) => shape.id === getShapeState(state.selectedShapeState)) || MACHINE_SHAPE_STATES[0];
    const shapeButton = document.createElement('button');
    shapeButton.type = 'button';
    shapeButton.className = 'voxel-tool-chip';
    shapeButton.title = 'New voxels use this shape. Right-click an existing voxel to cycle its shape.';
    shapeButton.innerHTML = `<span>Shape</span><strong>${currentShape.label}</strong>`;
    shapeButton.addEventListener('click', () => {
      state.selectedShapeState = getNextShapeState(state.selectedShapeState);
      this.populateVoxelCraftingContent(content);
    });
    const eraseButton = document.createElement('button');
    eraseButton.type = 'button';
    eraseButton.className = `voxel-tool-chip ${state.eraseMode ? 'is-active' : ''}`;
    eraseButton.title = 'Erase mode removes voxels with left-click. Middle-click also erases.';
    eraseButton.innerHTML = '<span>Tool</span><strong>Erase</strong>';
    eraseButton.addEventListener('click', () => {
      state.eraseMode = !state.eraseMode;
      if (state.eraseMode) state.detailMode = false;
      this.populateVoxelCraftingContent(content);
    });
    const detailToggle = document.createElement('button');
    detailToggle.type = 'button';
    detailToggle.className = `voxel-tool-chip ${state.detailMode ? 'is-active' : ''}`;
    detailToggle.title = 'Detail mode paints surface decoration without using materials.';
    detailToggle.innerHTML = '<span>Mode</span><strong>Details</strong>';
    detailToggle.addEventListener('click', () => {
      state.detailMode = !state.detailMode;
      state.eraseMode = false;
      this.populateVoxelCraftingContent(content);
    });
    tools.append(shapeButton, eraseButton, detailToggle);

    const detailPalette = document.createElement('div');
    detailPalette.className = `voxel-detail-palette ${state.detailMode ? 'is-open' : ''}`;
    MACHINE_DETAIL_STATES.forEach((detail) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = (state.selectedDetailId ?? null) === detail.id ? 'is-selected' : '';
      button.title = detail.id ? `Paint ${detail.label} on a voxel.` : 'Remove surface detail from a voxel.';
      button.textContent = detail.label;
      button.addEventListener('click', () => {
        state.selectedDetailId = detail.id;
        state.detailMode = true;
        state.eraseMode = false;
        this.populateVoxelCraftingContent(content);
      });
      detailPalette.append(button);
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
      state.detailGrid?.fill(null);
      this.populateVoxelCraftingContent(content);
    }, { icon: 'x', variant: 'metal' }).element;
    const autoButton = new Button('Auto Layout', () => {
      this.autofillVoxelRecipe(recipe, state);
      this.populateVoxelCraftingContent(content);
    }, { icon: 'A', variant: 'metal' }).element;
    const craftButton = new Button(recipe.outputItemId === 'starterFurnace' ? 'Craft Blueprint' : 'Craft Item', () => {
      this.craftVoxelRecipe(recipe, state);
      this.populateVoxelCraftingContent(content);
    }, { icon: recipe.icon || 'C', variant: 'forge' }).element;
    craftButton.disabled = !validation.ok;
    actions.append(clearButton, autoButton, craftButton);

    side.append(palette, tools, detailPalette, rules, actions);
    shell.append(tabs, grid, side);
    content.append(shell);
  }

  populateVoxelCraftingContent(content) {
    const recipes = this.getVoxelCraftRecipes();
    const state = this.ensureVoxelCraftState();
    const recipe = recipes.find((item) => item.id === state.recipeId) || recipes[0];
    state.detailGrid ||= this.createEmptyVoxelGrid(recipe.gridSize);
    const usage = this.getVoxelCraftUsage(state.grid);
    const validation = this.validateVoxelCraft(recipe, state.grid);
    const displayRules = this.getVoxelCraftDisplayRules(recipe, state.grid, validation);
    const renderGrid = this.getVoxelCraftRenderGrid(state.grid, state.detailGrid);
    content.replaceChildren();

    const shell = document.createElement('div');
    shell.className = 'voxel-craft-layout';

    const tabs = document.createElement('div');
    tabs.className = 'voxel-craft-tabs';
    tabs.innerHTML = '<h2>1. Select Recipe</h2>';
    const recipeList = document.createElement('div');
    recipeList.className = 'voxel-craft-recipe-list';
    recipes.forEach((item) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `voxel-recipe-card ${item.id === recipe.id ? 'is-active' : ''}`;
      button.innerHTML = `
        <span class="voxel-recipe-icon">${this.getItemIconMarkup(item.outputItemId, item.icon || 'C', 'item-icon-img recipe-item-icon')}</span>
        <span class="voxel-recipe-copy"><strong>${item.name}</strong><em>${item.category}</em></span>
        <i aria-hidden="true"></i>
      `;
      button.addEventListener('click', () => {
        this.voxelCraftState = {
          recipeId: item.id,
          selectedMaterialId: Object.keys(item.requirements)[0],
          heldMaterialId: null,
          selectedShapeState: 'full',
          selectedDetailId: null,
          detailMode: false,
          eraseMode: false,
          grid: this.createEmptyVoxelGrid(item.gridSize),
          detailGrid: this.createEmptyVoxelGrid(item.gridSize),
        };
        this.populateVoxelCraftingContent(content);
      });
      recipeList.append(button);
    });
    const tip = document.createElement('div');
    tip.className = 'voxel-craft-tip';
    tip.innerHTML = '<strong>i</strong><span>Select a recipe, then choose materials and shape your design.</span>';
    tabs.append(recipeList, tip);

    const center = document.createElement('section');
    center.className = 'voxel-craft-editor';
    center.innerHTML = '<h2>2. Shape Your Design</h2>';
    const gridFrame = document.createElement('div');
    gridFrame.className = `voxel-craft-grid-frame ${displayRules.some((rule) => (rule.id === 'coreMounted' || rule.text.includes('Fire Core')) && rule.ok) ? 'has-fire-core' : ''}`;
    const grid = document.createElement('div');
    grid.className = 'voxel-craft-grid';
    grid.style.setProperty('--voxel-grid-size', recipe.gridSize);
    const previewCanvas = document.createElement('canvas');
    previewCanvas.className = 'voxel-craft-preview';
    previewCanvas.setAttribute('aria-hidden', 'true');
    grid.append(previewCanvas);
    for (let index = 0; index < recipe.gridSize * recipe.gridSize; index += 1) {
      const craftCell = this.getVoxelCraftGridCell(renderGrid, index);
      const layers = this.getVoxelCraftCellLayers(craftCell);
      const itemId = layers[layers.length - 1] || null;
      const shapeLabel = craftCell ? getShapeStateLabel(craftCell.shapeState) : 'Full Block';
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = this.getVoxelCraftCellClassName(index, recipe.gridSize, renderGrid);
      cell.title = itemId
        ? `${layers.map((layerId) => this.game.systems.materials.getDisplayName(layerId)).join(' + ')} - ${shapeLabel}. Right-click cycles shape. Middle-click erases.`
        : 'Empty voxel. Left-click places material.';
      cell.setAttribute('aria-label', cell.title);
      cell.addEventListener('click', (event) => {
        if (state.detailMode) this.paintVoxelCraftDetail(index, event.shiftKey ? null : state.selectedDetailId);
        else this.paintVoxelCraftCell(index, event.shiftKey || state.eraseMode ? null : state.selectedMaterialId);
        this.populateVoxelCraftingContent(content);
      });
      cell.addEventListener('auxclick', (event) => {
        if (event.button !== 1) return;
        event.preventDefault();
        this.paintVoxelCraftCell(index, null);
        if (state.detailGrid) state.detailGrid[index] = null;
        this.populateVoxelCraftingContent(content);
      });
      cell.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        this.cycleVoxelCraftCellShape(index);
        this.populateVoxelCraftingContent(content);
      });
      grid.append(cell);
    }
    gridFrame.append(grid);
    drawCraftVoxelPreview(previewCanvas, {
      grid: renderGrid,
      size: recipe.gridSize,
      getMaterialVisual: (itemId) => this.getVoxelCraftMaterialVisual(itemId),
      seed: `${recipe.id}:${this.game.state.stats?.totalItemsCrafted || 0}`,
    });
    const controlStrip = document.createElement('div');
    controlStrip.className = 'voxel-craft-control-strip';
    controlStrip.innerHTML = '<span><b>Mouse</b> Place</span><span><b>Right</b> Shape</span><span><b>Mid</b> Erase</span><span><b>R</b> Rotate</span>';
    center.append(gridFrame, controlStrip);

    const side = document.createElement('aside');
    side.className = 'voxel-craft-side';

    const palette = document.createElement('div');
    palette.className = 'voxel-material-palette';
    palette.innerHTML = '<h2>3. Inventory Materials</h2>';
    const materialGrid = document.createElement('div');
    materialGrid.className = 'voxel-material-grid';
    Object.entries(recipe.requirements).forEach(([itemId, needed]) => {
      const material = this.game.systems.materials.getMaterial(itemId);
      const used = usage[itemId] || 0;
      const have = this.game.systems.inventory.getStoredAmount(itemId);
      const complete = used === needed && have >= needed;
      const missing = Math.max(0, needed - have);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = [
        'voxel-material-card',
        state.selectedMaterialId === itemId ? 'is-selected' : '',
        state.heldMaterialId === itemId ? 'is-held' : '',
        itemId === 'fireCore' ? 'is-fire-core' : '',
        have < needed ? 'is-short' : '',
        complete ? 'is-complete' : 'is-incomplete',
      ].filter(Boolean).join(' ');
      button.title = `${material?.name || itemId}: ${have} owned, ${needed} needed, ${used} used`;
      button.innerHTML = `
        <span class="voxel-material-icon" style="--item-color: ${material?.color || '#fff2cf'}">${this.getMaterialIconMarkup(itemId, material, 'item-icon-img craft-material-icon')}</span>
        <strong>${material?.name || itemId}</strong>
        <em>x${have}</em>
        <small>${used}/${needed} used${missing ? ` - need ${missing}` : ''}</small>
      `;
      button.addEventListener('pointerdown', (event) => {
        state.selectedMaterialId = itemId;
        state.heldMaterialId = itemId;
        state.eraseMode = false;
        state.detailMode = false;
        this.setVoxelCraftHeldCursorTarget(event, { visible: true, instant: true });
        this.populateVoxelCraftingContent(content);
      });
      materialGrid.append(button);
    });
    palette.append(materialGrid);

    const tools = document.createElement('div');
    tools.className = 'voxel-craft-tools';
    tools.innerHTML = '<h2>4. Tools</h2>';
    const toolGrid = document.createElement('div');
    toolGrid.className = 'voxel-tool-grid';
    [
      { label: 'Full Block', icon: '[]', shape: 'full' },
      { label: 'Slab', icon: '__', shape: 'halfBlock' },
      { label: 'Bevel', icon: '/', shape: 'diagonalSlope' },
      { label: 'Erase', icon: 'X', erase: true },
    ].forEach((tool) => {
      const button = document.createElement('button');
      button.type = 'button';
      const active = tool.erase
        ? state.eraseMode
        : !state.eraseMode && getShapeState(state.selectedShapeState) === tool.shape;
      button.className = `voxel-tool-chip ${active ? 'is-active' : ''}`;
      button.title = tool.erase ? 'Erase placed voxels.' : `Place ${tool.label.toLowerCase()} voxels.`;
      button.innerHTML = `<span>${tool.icon}</span><strong>${tool.label}</strong>`;
      button.addEventListener('click', () => {
        state.eraseMode = Boolean(tool.erase);
        state.detailMode = false;
        if (tool.erase) state.heldMaterialId = null;
        if (!tool.erase) state.selectedShapeState = tool.shape;
        this.populateVoxelCraftingContent(content);
      });
      toolGrid.append(button);
    });
    tools.append(toolGrid);

    const rules = document.createElement('div');
    rules.className = 'voxel-craft-rules';
    rules.innerHTML = `
      <h2>5. Validation</h2>
      <ul>${displayRules.map((message) => `<li class="${message.ok ? 'is-met' : 'is-missing'}"><span aria-hidden="true">${message.ok ? 'OK' : '!'}</span>${message.text}</li>`).join('')}</ul>
    `;

    const info = document.createElement('div');
    info.className = 'voxel-craft-info';
    info.innerHTML = `
      <h2>6. About This Recipe</h2>
      <article><strong>${recipe.name}</strong><p>${recipe.description}</p></article>
    `;

    const actions = document.createElement('div');
    actions.className = 'voxel-craft-actions';
    actions.innerHTML = '<h2>7. Actions</h2>';
    const actionRow = document.createElement('div');
    actionRow.className = 'voxel-action-row';
    const autoButton = document.createElement('button');
    autoButton.type = 'button';
    autoButton.className = 'voxel-action-button secondary';
    autoButton.innerHTML = '<span>A</span><strong>Auto Layout</strong>';
    autoButton.addEventListener('click', () => {
      this.autofillVoxelRecipe(recipe, state);
      this.populateVoxelCraftingContent(content);
    });
    const clearButton = document.createElement('button');
    clearButton.type = 'button';
    clearButton.className = 'voxel-action-button secondary';
    clearButton.innerHTML = '<span>X</span><strong>Clear</strong>';
    clearButton.addEventListener('click', () => {
      state.grid.fill(null);
      state.detailGrid?.fill(null);
      this.populateVoxelCraftingContent(content);
    });
    const craftButton = document.createElement('button');
    craftButton.type = 'button';
    craftButton.className = 'voxel-action-button craft-primary';
    craftButton.disabled = !validation.ok;
    craftButton.innerHTML = `<span>${this.getItemIconMarkup(recipe.outputItemId, recipe.icon || 'C', 'item-icon-img action-item-icon')}</span><strong>${recipe.outputItemId === 'starterFurnace' ? 'Craft' : 'Craft Item'}</strong>`;
    craftButton.addEventListener('click', () => {
      this.craftVoxelRecipe(recipe, state);
      this.populateVoxelCraftingContent(content);
    });
    actionRow.append(autoButton, clearButton, craftButton);
    actions.append(actionRow);

    side.append(palette, tools, rules, info, actions);

    const bottomBar = document.createElement('footer');
    bottomBar.className = 'voxel-craft-bottom';
    const inventoryButton = document.createElement('button');
    inventoryButton.type = 'button';
    inventoryButton.className = 'voxel-bottom-button';
    inventoryButton.innerHTML = '<span>INV</span><strong>Inventory</strong>';
    inventoryButton.addEventListener('click', () => this.showInventoryModal());
    const packButton = document.createElement('button');
    packButton.type = 'button';
    packButton.className = 'voxel-bottom-button';
    packButton.innerHTML = '<span>PK</span><strong>Pack Up</strong>';
    packButton.addEventListener('click', () => this.packUpCraftingStation());
    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'voxel-bottom-button';
    closeButton.innerHTML = '<span>X</span><strong>Close</strong>';
    closeButton.addEventListener('click', () => this.closeSurvivalModal());
    bottomBar.append(inventoryButton, packButton, closeButton);

    shell.append(tabs, center, side, bottomBar);
    content.append(shell);
    this.mountVoxelCraftHeldCursor(content, state, recipe, usage);
  }

  setVoxelCraftHeldCursorTarget(event, { visible = true, instant = false } = {}) {
    if (!event) return;
    this.voxelCraftHeldCursor ||= {
      x: event.clientX,
      y: event.clientY,
      targetX: event.clientX,
      targetY: event.clientY,
      visible,
    };
    this.voxelCraftHeldCursor.targetX = event.clientX;
    this.voxelCraftHeldCursor.targetY = event.clientY;
    this.voxelCraftHeldCursor.visible = visible;
    if (instant) {
      this.voxelCraftHeldCursor.x = event.clientX;
      this.voxelCraftHeldCursor.y = event.clientY;
    }
  }

  mountVoxelCraftHeldCursor(content, state, recipe, usage = this.getVoxelCraftUsage(state.grid)) {
    const itemId = state.heldMaterialId && !state.eraseMode && !state.detailMode
      ? state.heldMaterialId
      : null;
    if (!itemId) {
      this.clearVoxelCraftHeldCursor();
      content.onpointermove = null;
      return;
    }
    const material = this.game.systems.materials.getMaterial(itemId);
    const needed = recipe.requirements?.[itemId] || 0;
    const used = usage[itemId] || 0;
    const have = this.game.systems.inventory.getStoredAmount(itemId);
    const cursor = this.voxelCraftHeldCursor ||= {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
      targetX: window.innerWidth / 2,
      targetY: window.innerHeight / 2,
      visible: true,
    };
    cursor.visible = true;
    if (!this.voxelCraftHeldCursorEl || !this.voxelCraftHeldCursorEl.isConnected) {
      this.voxelCraftHeldCursorEl = document.createElement('div');
      this.voxelCraftHeldCursorEl.className = 'voxel-craft-held-cursor';
      this.game.ui.modalLayer.append(this.voxelCraftHeldCursorEl);
    }
    const el = this.voxelCraftHeldCursorEl;
    el.className = `voxel-craft-held-cursor ${itemId === 'fireCore' ? 'is-fire-core' : ''}`;
    el.style.setProperty('--item-color', material?.color || '#fff2cf');
    el.innerHTML = `
      <span>${this.getMaterialIconMarkup(itemId, material, 'item-icon-img craft-held-icon')}</span>
      <strong>${material?.name || itemId}</strong>
      <em>x${have}</em>
      <small>${used}/${needed}</small>
    `;
    content.onpointermove = (event) => this.setVoxelCraftHeldCursorTarget(event, { visible: true });
    content.onpointerdown = (event) => this.setVoxelCraftHeldCursorTarget(event, { visible: true });
    this.startVoxelCraftHeldCursorLoop();
  }

  startVoxelCraftHeldCursorLoop() {
    if (this.voxelCraftHeldCursorFrame) return;
    const tick = () => {
      const el = this.voxelCraftHeldCursorEl;
      const state = this.voxelCraftHeldCursor;
      if (!el || !state || this.survivalModalKind !== 'crafting') {
        this.voxelCraftHeldCursorFrame = 0;
        return;
      }
      const blend = 0.34;
      state.x += (state.targetX - state.x) * blend;
      state.y += (state.targetY - state.y) * blend;
      el.style.opacity = state.visible ? '1' : '0';
      el.style.transform = `translate3d(${Math.round(state.x + 14)}px, ${Math.round(state.y + 14)}px, 0)`;
      this.voxelCraftHeldCursorFrame = requestAnimationFrame(tick);
    };
    this.voxelCraftHeldCursorFrame = requestAnimationFrame(tick);
  }

  clearVoxelCraftHeldCursor() {
    if (this.voxelCraftHeldCursorFrame) {
      cancelAnimationFrame(this.voxelCraftHeldCursorFrame);
      this.voxelCraftHeldCursorFrame = 0;
    }
    this.voxelCraftHeldCursorEl?.remove();
    this.voxelCraftHeldCursorEl = null;
    if (this.voxelCraftHeldCursor) this.voxelCraftHeldCursor.visible = false;
  }

  normalizeVoxelCraftCell(cell) {
    return normalizeMachineVoxel(cell);
  }

  getVoxelCraftGridCell(grid = [], index = 0) {
    const normalized = this.normalizeVoxelCraftCell(grid[index]);
    if (normalized !== grid[index]) grid[index] = normalized;
    return normalized;
  }

  getVoxelCraftCellLayers(cell) {
    return getCellLayers(cell);
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
    classes.push('has-voxel', `shape-${getShapeState(cell.shapeState)}`, `auto-${getAutoShapeType(col, row, grid, size)}`);
    if (layers.length > 1) classes.push('has-layers');
    if (cell.detailId) classes.push('has-detail');
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
      visualType: itemId === 'fireCore'
        ? 'core'
        : itemId === 'copperShards' || itemId === 'copperIngot' || itemId === 'ironIngot'
          ? 'metal'
          : 'stone',
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
      if (state.detailGrid) state.detailGrid[index] = null;
      return;
    }
    const cell = previous || {
      layers: [],
      materialId: itemId,
      itemId,
      shapeState: getShapeState(state.selectedShapeState),
      detailId: null,
      moduleHint: null,
    };
    const existingIndex = cell.layers.indexOf(itemId);
    if (existingIndex >= 0) {
      const rules = recipe.shapeRules || {};
      const coreId = rules.coreMaterialId || 'fireCore';
      if (rules.coreBaseMaterialId === itemId && cell.layers.includes(coreId)) {
        this.game.audio.playError?.();
        this.game.ui.showToast('Remove the Fire Core before removing its Iron Dust base', 'danger', 1200);
        return;
      }
      cell.layers.splice(existingIndex, 1);
      cell.materialId = cell.layers[cell.layers.length - 1] || itemId;
      cell.itemId = cell.materialId;
      state.grid[index] = cell.layers.length ? cell : null;
      return;
    }
    const rules = recipe.shapeRules || {};
    const coreId = rules.coreMaterialId || 'fireCore';
    if (itemId === coreId && rules.coreBaseMaterialId) {
      const hasBase = cell.layers.includes(rules.coreBaseMaterialId);
      if (!hasBase) {
        this.game.audio.playError?.();
        this.game.ui.showToast(`Place Fire Core on ${this.game.systems.materials.getDisplayName(rules.coreBaseMaterialId)}`, 'danger', 1200);
        return;
      }
    }
    const usage = this.getVoxelCraftUsage(state.grid);
    const required = recipe.requirements[itemId] || 0;
    if ((usage[itemId] || 0) >= required) {
      this.game.audio.playError?.();
      this.game.ui.showToast(`All ${this.game.systems.materials.getDisplayName(itemId)} voxels are already used`, 'danger', 1100);
      return;
    }
    cell.layers.push(itemId);
    cell.materialId = itemId;
    cell.itemId = itemId;
    cell.shapeState ||= getShapeState(state.selectedShapeState);
    state.grid[index] = cell;
  }

  cycleVoxelCraftCellShape(index) {
    const state = this.ensureVoxelCraftState();
    const cell = this.getVoxelCraftGridCell(state.grid, index);
    if (!cell) return;
    cell.shapeState = getNextShapeState(cell.shapeState);
    cell.shape = cell.shapeState;
    state.grid[index] = cell;
  }

  paintVoxelCraftDetail(index, detailId = null) {
    const state = this.ensureVoxelCraftState();
    const cell = this.getVoxelCraftGridCell(state.grid, index);
    if (!cell) {
      this.game.audio.playError?.();
      this.game.ui.showToast('Place a voxel before adding detail', 'danger', 900);
      return;
    }
    cell.detailId = detailId || null;
    state.detailGrid ||= this.createEmptyVoxelGrid(Math.sqrt(state.grid.length) || 16);
    state.detailGrid[index] = detailId || null;
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
    return validateMachineRecipe(grid, recipe, {
      getOwnedAmount: (itemId) => this.game.systems.inventory.getStoredAmount(itemId),
      getDisplayName: (itemId) => this.game.systems.materials.getDisplayName(itemId),
    });
  }

  getVoxelCraftCells(recipe, grid) {
    const size = recipe.gridSize || 16;
    return getVoxelEntries(grid, size).map((entry) => this.createCraftCell(entry.x, entry.y, entry));
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
      materialId: itemId,
      layers,
      shape: normalized?.shapeState || normalized?.shape || 'full',
      shapeState: normalized?.shapeState || normalized?.shape || 'full',
      detailId: normalized?.detailId || null,
      moduleHint: normalized?.moduleHint || null,
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
    state.detailGrid = this.createEmptyVoxelGrid(size);
    const set = (x, y, itemId) => {
      if (x < 0 || x >= size || y < 0 || y >= size) return;
      const index = y * size + x;
      const cell = this.getVoxelCraftGridCell(state.grid, index) || { layers: [], shape: 0 };
      if (!cell.layers.includes(itemId)) cell.layers.push(itemId);
      state.grid[index] = cell;
    };
    if (recipe.outputItemId === 'gravityStabilizer') {
      [
        [6, 7], [7, 7], [8, 7], [9, 7], [7, 8], [8, 8],
        [6, 9], [7, 9], [8, 9], [9, 9],
      ].slice(0, recipe.requirements.stoneOre || 0).forEach(([x, y]) => set(x, y, 'stoneOre'));
      [
        [5, 8], [10, 8], [7, 10], [8, 10],
      ].slice(0, recipe.requirements.ironDust || 0).forEach(([x, y]) => set(x, y, 'ironDust'));
      if (recipe.requirements.fireCore) set(8, 8, 'fireCore');
      return;
    }
    if (recipe.outputItemId === 'laserGun') {
      [
        [5, 7], [6, 7], [7, 7], [8, 7], [9, 7],
      ].slice(0, recipe.requirements.ironIngot || 0).forEach(([x, y]) => set(x, y, 'ironIngot'));
      [
        [6, 8], [7, 8], [8, 8], [9, 8],
      ].slice(0, recipe.requirements.copperIngot || 0).forEach(([x, y]) => set(x, y, 'copperIngot'));
      if (recipe.requirements.fireCore) set(4, 8, 'fireCore');
      return;
    }
    const chamberKeys = new Set();
    for (let x = 6; x <= 8; x += 1) {
      for (let y = 6; y <= 8; y += 1) chamberKeys.add(`${x},${y}`);
    }
    const shellCoords = [];
    for (let x = 5; x <= 9; x += 1) {
      for (let y = 5; y <= 9; y += 1) {
        if (!chamberKeys.has(`${x},${y}`)) shellCoords.push([x, y]);
      }
    }
    const coreCell = [5, 7];
    const coreKey = `${coreCell[0]},${coreCell[1]}`;
    const stoneCoords = [
      ...shellCoords.filter(([x, y]) => `${x},${y}` !== coreKey),
      [4, 5],
      [4, 6],
      [4, 8],
      [4, 9],
      [10, 9],
    ];
    stoneCoords.slice(0, recipe.requirements.stoneOre || 0).forEach(([x, y]) => set(x, y, 'stoneOre'));
    if (recipe.requirements.ironDust) set(coreCell[0], coreCell[1], 'ironDust');
    if (recipe.requirements.fireCore) set(coreCell[0], coreCell[1], 'fireCore');
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
    const sculptGrid = this.getVoxelCraftRenderGrid(state.grid, state.detailGrid);
    const cells = this.getVoxelCraftCells(recipe, sculptGrid);
    const tileSize = Math.max(7, Math.round((this.activeIsland?.terrain?.cellSize || 22) / 3));
    if (recipe.outputItemId !== 'starterFurnace') {
      story.equipmentBlueprints ||= {};
      story.equipmentBlueprints[recipe.outputItemId] = {
        id: `${recipe.outputItemId}-blueprint-${Date.now().toString(36)}`,
        recipeId: recipe.id,
        name: recipe.name,
        shape: {
          gridSize: recipe.gridSize || 16,
          tileSize,
          cells,
          details: [...(state.detailGrid || [])],
        },
      };
      this.game.systems.inventory.add(recipe.outputItemId, 1, { skipSave: true });
      this.autoAssignItemToHotbar(recipe.outputItemId);
      if (recipe.outputItemId === 'gravityStabilizer') story.gravityMachineBuilt = true;
      this.game.state.stats ||= {};
      this.game.state.stats.totalItemsCrafted = (this.game.state.stats.totalItemsCrafted || 0) + 1;
      this.game.systems.objectives?.checkCurrentObjective?.();
      this.game.saveGame();
      this.game.audio.playSuccess?.();
      this.game.ui.showToast(`${recipe.name} crafted`, 'success', 1600);
      state.grid.fill(null);
      state.detailGrid?.fill(null);
      return true;
    }
    const blueprint = {
      id: `furnace-blueprint-${Date.now().toString(36)}-${Math.floor(Math.random() * 9999).toString(36)}`,
      recipeId: recipe.id,
      name: recipe.name,
      shape: {
        gridSize: recipe.gridSize || 16,
        tileSize,
        cells,
        details: [...(state.detailGrid || [])],
      },
    };
    story.furnaceInventory ||= [];
    story.furnaceInventory.push(blueprint);
    story.furnaceBuilt = true;
    this.game.systems.inventory.add(recipe.outputItemId, 1, { skipSave: true });
    this.autoAssignItemToHotbar(recipe.outputItemId);
    this.game.saveGame();
    this.game.audio.playSuccess?.();
    this.game.ui.showToast(`${recipe.name} blueprint crafted`, 'success', 1600);
    state.grid.fill(null);
    state.detailGrid?.fill(null);
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
    this.autoAssignItemToHotbar('craftingStationKit');
    this.game.saveGame();
    this.game.audio.playSuccess?.();
    this.closeSurvivalModal();
    this.game.ui.showToast('Crafting station packed into inventory', 'success', 1300);
  }

  packUpResearchStation() {
    const story = this.getStoryState();
    if (!this.placedResearchStation) return;
    story.researchStationPlaced = false;
    story.researchStation = null;
    this.placedResearchStation = null;
    this.game.systems.inventory.add('researchStationKit', 1, { skipSave: true });
    this.autoAssignItemToHotbar('researchStationKit');
    this.game.saveGame();
    this.game.audio.playSuccess?.();
    this.closeSurvivalModal();
    this.game.ui.showToast('Research station packed into inventory', 'success', 1300);
  }

  showResearchStationModal() {
    if (!this.placedResearchStation) return;
    const content = document.createElement('div');
    content.className = 'survival-item-detail';
    const base = this.game.state.base || {};
    const planet = this.activeIsland?.tag || this.activeIsland?.planetTag || 'P??';
    content.innerHTML = `
      <div class="survival-item-detail-icon" style="--item-color: #b794ff">RS</div>
      <div>
        <h2>Research Station</h2>
        <p>Scanner logs, base routing, and escape research are parked here for now.</p>
        <dl>
          <div><dt>Current Planet</dt><dd>${planet}</dd></div>
          <div><dt>Base Beacon</dt><dd>${base.established ? 'Online' : 'Not marked'}</dd></div>
          <div><dt>Research</dt><dd>${this.game.state.researchPoints || 0}</dd></div>
          <div><dt>Status</dt><dd>Prototype analyzer</dd></div>
        </dl>
      </div>
    `;
    const modal = this.createSurvivalModal({
      title: 'Research Station',
      subtitle: 'Compact field analyzer. Deeper research UI will plug in here.',
      className: 'research-survival-modal',
      content,
      actions: [
        new Button('Set Base GPS', () => {
          this.game.state.navigation.gpsUnlocked = true;
          this.game.state.navigation.scannerLevel = Math.max(1, this.game.state.navigation.scannerLevel || 0);
          this.game.state.navigation.selectedDestinationId = 'base';
          this.game.saveGame();
          this.game.ui.showToast('Base GPS selected', 'success', 1200);
        }, { icon: 'B', variant: 'metal' }).element,
        new Button('Pack Up', () => this.packUpResearchStation(), { icon: '<', variant: 'metal' }).element,
        new Button('Close', () => this.closeSurvivalModal(), { icon: 'x', variant: 'metal' }).element,
      ],
    });
    this.survivalModal = modal;
    this.survivalModalKind = 'research';
    this.game.ui.showModal(modal);
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
    this.autoAssignItemToHotbar('starterFurnace');
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

  getNearbyFlag(player = this.islandPlayer) {
    const flags = this.activeIsland?.placedFlags || [];
    return flags.find((flag) => flag.overlapsPlayer(player)) || null;
  }

  packUpNearbyFlag() {
    const island = this.activeIsland;
    const flag = this.getNearbyFlag();
    if (!island || !flag) return false;
    island.placedFlags = (island.placedFlags || []).filter((entry) => entry.id !== flag.id);
    this.game.systems.inventory.add('markerFlag', 1, { skipSave: true });
    this.autoAssignItemToHotbar('markerFlag');
    if (this.game.state.base?.flagId === flag.id) {
      this.game.state.base = { established: false, islandId: null, flagId: null, local: null };
      this.game.state.navigation.selectedDestinationId = null;
      this.game.ui.showToast('Base flag packed. Place it to mark a new base.', 'success', 1800);
    } else {
      this.game.ui.showToast('Flag packed into inventory', 'success', 1200);
    }
    this.game.systems.islands.saveFlags(island.id, island.placedFlags);
    this.refreshHotbar(true);
    this.game.audio.playSuccess?.();
    this.game.saveGame();
    return true;
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
    this.initializePlanetPlayerFeel(player);
    player.coyoteTimer = PLANET_PLAYER_FEEL.coyoteTime;
  }

  updatePlanetIslandPlayer(delta, input) {
    const island = this.activeIsland;
    const player = this.islandPlayer;
    if (!island || !player) return;
    const dt = Math.min(delta, 0.05);
    this.initializePlanetPlayerFeel(player);
    player.hitCooldown = Math.max(0, player.hitCooldown - dt);
    this.platformDropTimer = Math.max(0, (this.platformDropTimer || 0) - dt);
    if (input.downHeld && player.standingPlatformId) {
      this.platformDropTimer = PLATFORM_DROP_THROUGH_TIME;
      player.standingPlatformId = '';
      player.onGround = false;
      const dropBasis = this.getIslandGravityBasis(island);
      player.x += dropBasis.inward.x * 3;
      player.y += dropBasis.inward.y * 3;
    }
    this.resolvePlanetPlayerOverlap(player, island);

    const rawBasis = this.getIslandGravityBasis(island);
    const wasGrounded = Boolean(player.onGround);
    const groundedBeforeRecovery = this.isPlanetPlayerGrounded(player, island, rawBasis);
    player.coyoteTimer = Math.max(0, (player.coyoteTimer || 0) - dt);
    player.jumpBufferTimer = Math.max(0, (player.jumpBufferTimer || 0) - dt);
    player.groundGraceTimer = Math.max(0, (player.groundGraceTimer || 0) - dt);
    if (input.jumpPressed) player.jumpBufferTimer = PLANET_PLAYER_FEEL.jumpBufferTime;
    if (groundedBeforeRecovery || wasGrounded) {
      player.onGround = true;
      player.coyoteTimer = PLANET_PLAYER_FEEL.coyoteTime;
      player.groundGraceTimer = PLANET_PLAYER_FEEL.coyoteTime;
    }
    this.updateIslandGravityRecoveryState(island, player);

    const basis = this.getIslandGravityBasis(island);
    const groundedNow = groundedBeforeRecovery || this.isPlanetPlayerGrounded(player, island, basis);
    if (groundedNow) {
      if (!player.onGround) player.pendingLandingSpeed = player.vx * basis.inward.x + player.vy * basis.inward.y;
      player.onGround = true;
      player.coyoteTimer = PLANET_PLAYER_FEEL.coyoteTime;
      player.groundGraceTimer = PLANET_PLAYER_FEEL.coyoteTime;
    }

    player.groundNormal = basis.outward;

    const startedOnGround = Boolean(player.onGround);
    const moveX = Math.max(-1, Math.min(1, input.moveX || 0));
    const tangent = basis.tangent;
    const maxSpeed = startedOnGround ? PLANET_PLAYER_FEEL.maxGroundSpeed : PLANET_PLAYER_FEEL.maxAirSpeed;
    const attackSlowdown = this.sword?.active?.beat === 3 ? SWORD_COMBAT.heavySlashMoveSlowdown : 1;
    const targetTangent = moveX * maxSpeed * attackSlowdown;
    const currentTangent = player.vx * tangent.x + player.vy * tangent.y;
    const acceleration = Math.abs(moveX) > 0.05
      ? (startedOnGround ? PLANET_PLAYER_FEEL.groundAcceleration : PLANET_PLAYER_FEEL.airAcceleration)
      : (startedOnGround ? PLANET_PLAYER_FEEL.groundDeceleration : PLANET_PLAYER_FEEL.airAcceleration * 0.45);
    const nextTangent = approachValue(currentTangent, targetTangent, acceleration * dt);
    const tangentDelta = nextTangent - currentTangent;
    player.vx += tangent.x * tangentDelta;
    player.vy += tangent.y * tangentDelta;

    if (Math.abs(moveX) > 0.05) {
      player.facing = moveX > 0 ? 1 : -1;
      player.step += dt * (8 + Math.abs(nextTangent) / 56);
    } else if (startedOnGround) {
      const friction = Math.max(0, 1 - dt * PLANET_PLAYER_FEEL.friction);
      const correction = nextTangent * friction - nextTangent;
      player.vx += tangent.x * correction;
      player.vy += tangent.y * correction;
    }

    let didJump = false;
    const groundedForJump = player.onGround || groundedNow || (player.coyoteTimer || 0) > 0 || (player.groundGraceTimer || 0) > 0;
    if ((player.jumpBufferTimer || 0) > 0 && groundedForJump) {
      const outwardSpeed = player.vx * basis.outward.x + player.vy * basis.outward.y;
      if (outwardSpeed < 0) {
        player.vx -= basis.outward.x * outwardSpeed;
        player.vy -= basis.outward.y * outwardSpeed;
      }
      player.vx += basis.outward.x * PLANET_PLAYER_FEEL.jumpForce;
      player.vy += basis.outward.y * PLANET_PLAYER_FEEL.jumpForce;
      player.onGround = false;
      player.groundGraceTimer = 0;
      player.coyoteTimer = 0;
      player.jumpBufferTimer = 0;
      player.animationState = 'jumpStart';
      player.landingCompression = 0;
      didJump = true;
    }

    const gravity = island.world.gravity ?? 1560;
    const outwardSpeed = player.vx * basis.outward.x + player.vy * basis.outward.y;
    let gravityScale = 1;
    if (startedOnGround && !didJump) gravityScale = PLANET_PLAYER_FEEL.groundedGravityScale;
    else if (outwardSpeed < -10) gravityScale = PLANET_PLAYER_FEEL.fallGravityMultiplier;
    else if (!input.jumpHeld && outwardSpeed > 10) gravityScale = PLANET_PLAYER_FEEL.lowJumpGravityMultiplier;
    player.vx += basis.inward.x * gravity * gravityScale * dt;
    player.vy += basis.inward.y * gravity * gravityScale * dt;
    if (input.jumpReleased && outwardSpeed > 20) {
      const cut = outwardSpeed * (1 - PLANET_PLAYER_FEEL.jumpCutMultiplier);
      player.vx -= basis.outward.x * cut;
      player.vy -= basis.outward.y * cut;
    }

    const inwardSpeed = player.vx * basis.inward.x + player.vy * basis.inward.y;
    if (inwardSpeed > PLANET_PLAYER_FEEL.maxFallSpeed) {
      const remove = inwardSpeed - PLANET_PLAYER_FEEL.maxFallSpeed;
      player.vx -= basis.inward.x * remove;
      player.vy -= basis.inward.y * remove;
    }

    const speed = Math.hypot(player.vx, player.vy);
    if (speed > PLANET_PLAYER_MAX_SPEED) {
      const scale = PLANET_PLAYER_MAX_SPEED / speed;
      player.vx *= scale;
      player.vy *= scale;
    }

    const previousX = player.x;
    const previousY = player.y;
    player.onGround = false;
    player.standingPlatformId = '';
    this.movePlanetPlayer(player, player.vx * dt, player.vy * dt, island, {
      canStep: startedOnGround && !didJump,
      groundSpeedLimit: PLANET_PLAYER_FEEL.maxGroundSpeed,
      maxStepHeight: PLANET_PLAYER_FEEL.maxStepHeight,
    });
    this.resolvePlanetPlayerOverlap(player, island);
    const nextBasis = this.getIslandGravityBasis(island);
    if (!didJump) {
      this.resolvePlanetPlayerPlatformContact(player, island, nextBasis, {
        previousX,
        previousY,
      });
    }
    if (!didJump && this.isPlanetPlayerGrounded(player, island, nextBasis)) {
      const landSpeed = Math.max(player.pendingLandingSpeed || 0, inwardSpeed);
      if (!wasGrounded && landSpeed > PLANET_PLAYER_FEEL.landingImpactThreshold) this.playPlanetLandingFeedback(player, island, null, landSpeed);
      player.onGround = true;
      player.coyoteTimer = PLANET_PLAYER_FEEL.coyoteTime;
      player.groundGraceTimer = PLANET_PLAYER_FEEL.coyoteTime;
      const nextInwardSpeed = player.vx * nextBasis.inward.x + player.vy * nextBasis.inward.y;
      if (nextInwardSpeed > 0) {
        player.vx -= nextBasis.inward.x * nextInwardSpeed;
        player.vy -= nextBasis.inward.y * nextInwardSpeed;
      }
      this.clampPlanetPlayerTangentSpeed(player, nextBasis, PLANET_PLAYER_FEEL.maxGroundSpeed);
    }
    if (player.onGround && !didJump) {
      this.applyPlanetGroundFriction(player, nextBasis, moveX, dt);
    }
    player.animationState = this.getPlanetPlayerAnimationState(player, moveX);
    player.landingCompression = Math.max(0, (player.landingCompression || 0) - dt * 5.5);
    const center = island.getCenterLocal();
    player.planetAngle = Math.atan2(player.centerY - center.y, player.centerX - center.x);
    player.planetDistance = Math.hypot(player.centerX - center.x, player.centerY - center.y);
    this.updateIslandGravityRecoveryState(island, player);
  }

  initializePlanetPlayerFeel(player) {
    if (!player || player.feelInitialized) return;
    player.feelInitialized = true;
    player.coyoteTimer = PLANET_PLAYER_FEEL.coyoteTime;
    player.jumpBufferTimer = 0;
    player.groundNormal = { x: 0, y: -1 };
    player.animationState = player.onGround ? 'idle' : 'falling';
    player.landingCompression = 0;
    player.pendingLandingSpeed = 0;
  }

  applyPlanetGroundFriction(player, basis, moveX, dt) {
    const normal = basis.outward;
    const tangent = basis.tangent;
    const normalSpeed = player.vx * normal.x + player.vy * normal.y;
    if (normalSpeed < 0) {
      player.vx -= normal.x * normalSpeed;
      player.vy -= normal.y * normalSpeed;
    }
    if (Math.abs(moveX) > 0.05) return;
    const tangentSpeed = player.vx * tangent.x + player.vy * tangent.y;
    const nextTangent = approachValue(tangentSpeed, 0, PLANET_PLAYER_FEEL.groundDeceleration * dt);
    const delta = nextTangent - tangentSpeed;
    player.vx += tangent.x * delta;
    player.vy += tangent.y * delta;
  }

  playPlanetLandingFeedback(player, island, contact, landSpeed = 0) {
    const compression = clamp01((landSpeed - PLANET_PLAYER_FEEL.landingImpactThreshold) / 460);
    player.landingCompression = Math.max(player.landingCompression || 0, 0.25 + compression * 0.35);
    const basis = this.getIslandGravityBasis(island);
    const localX = contact?.surfaceX ?? player.centerX + basis.inward.x * PLANET_PLAYER_FOOT_OFFSET;
    const localY = contact?.surfaceY ?? player.centerY + basis.inward.y * PLANET_PLAYER_FOOT_OFFSET;
    const world = island.localToWorldRotated(localX, localY, this.getIslandViewRotation());
    this.spawnBurst(
      world.x,
      world.y,
      '#c8b99e',
      PLANET_PLAYER_FEEL.landingDustAmount + Math.round(compression * 7),
      70 + compression * 70,
    );
    this.addScreenShake(PLANET_PLAYER_FEEL.hardLandingShakeStrength * (0.55 + compression));
    this.game.audio.playLandShip?.();
  }

  getPlanetPlayerAnimationState(player, moveX = 0) {
    if (player.hitCooldown > 0) return 'hurt';
    if (this.sword?.active) return 'attack';
    if (!player.onGround) {
      const basis = this.activeIsland ? this.getIslandGravityBasis(this.activeIsland) : { outward: { x: 0, y: -1 } };
      const outwardSpeed = player.vx * basis.outward.x + player.vy * basis.outward.y;
      return outwardSpeed > 20 ? 'rising' : 'falling';
    }
    return Math.abs(moveX) > 0.08 ? 'run' : 'idle';
  }

  getIslandGravityCatchState(island, player) {
    const center = island.getCenterLocal();
    const dx = player.centerX - center.x;
    const dy = player.centerY - center.y;
    const distance = Math.hypot(dx, dy) || 1;
    const angle = Math.atan2(dy, dx);
    const surfaceRadius = island.getSurfaceRadiusAtAngle(angle);
    const catchRadius = island.playerGravityRadius || island.gravityFieldRadius;
    const catchDistance = catchRadius * ISLAND_GRAVITY_CATCH_FIELD_RATIO;
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
      excess: clamp01((distance - catchDistance) / Math.max(1, catchRadius - catchDistance)),
    };
  }

  updateIslandGravityRecoveryState(island, player) {
    const state = this.getIslandGravityCatchState(island, player);
    const shouldAutoStabilize = !player.onGround && state.distance > state.catchDistance;
    const canReset = player.onGround && state.distance <= state.releaseDistance;
    this.islandGravityRecovery = false;
    this.islandGravityRecoveryBlend = 0;
    if (shouldAutoStabilize && !this.islandFreefall) {
      if (!this.hasGravityMachine()) {
        this.islandFreefall = true;
        this.game.audio.playError?.();
        this.game.ui.showToast('No Gravity Machine installed. Craft one to recover from bad angles.', 'danger', 1600);
        return state;
      }
      this.islandFreefall = true;
      this.engageIslandGravityStabilizer();
      this.game.audio.playSuccess?.();
      this.game.ui.showToast('Gravity Machine auto-engaged', 'success', 900);
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
      const maxStepHeight = options.maxStepHeight || PLANET_PLAYER_FEEL.maxStepHeight || PLANET_PLAYER_STEP_UP;
      for (let lift = 2; lift <= maxStepHeight; lift += 2) {
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
    const probeDistance = Math.min(4, Math.max(2, PLANET_PLAYER_GROUND_PROBE * 0.35));
    if (this.planetPlayerCollidesAt(
      player,
      island,
      x + basis.inward.x * probeDistance,
      y + basis.inward.y * probeDistance,
    )) return true;
    return Boolean(this.getPlanetPlayerPlatformContact(player, island, basis, {
      x,
      y,
      probeDistance: PLANET_PLAYER_GROUND_PROBE,
      requireCrossing: false,
    }));
  }

  getPlanetPlayerFootPoint(player, island, x = player.x, y = player.y, basis = this.getIslandGravityBasis(island)) {
    return {
      x: x + player.width * 0.5 + basis.inward.x * PLANET_PLAYER_FOOT_OFFSET,
      y: y + player.height * 0.5 + basis.inward.y * PLANET_PLAYER_FOOT_OFFSET,
    };
  }

  getPlanetPlayerPlatformContact(player, island, basis = this.getIslandGravityBasis(island), {
    x = player.x,
    y = player.y,
    previousX = x,
    previousY = y,
    probeDistance = PLANET_PLAYER_GROUND_PROBE,
    requireCrossing = true,
  } = {}) {
    if (!island?.placedPlatforms?.length || (this.platformDropTimer || 0) > 0) return null;
    const foot = this.getPlanetPlayerFootPoint(player, island, x, y, basis);
    const previousFoot = this.getPlanetPlayerFootPoint(player, island, previousX, previousY, basis);
    const playerHalfWidth = PLANET_PLAYER_HALF_WIDTH + 3;
    let best = null;
    for (const platform of island.placedPlatforms) {
      const frame = platform.getFrame();
      const surface = platform.getSurfacePoint();
      const currentDx = foot.x - surface.x;
      const currentDy = foot.y - surface.y;
      const previousDx = previousFoot.x - surface.x;
      const previousDy = previousFoot.y - surface.y;
      const currentHeight = currentDx * frame.outward.x + currentDy * frame.outward.y;
      const previousHeight = previousDx * frame.outward.x + previousDy * frame.outward.y;
      const tangentOffset = currentDx * frame.tangent.x + currentDy * frame.tangent.y;
      if (Math.abs(tangentOffset) > platform.length * 0.5 + playerHalfWidth) continue;
      const approachSpeed = player.vx * frame.outward.x + player.vy * frame.outward.y;
      if (approachSpeed > 70) continue;
      if (requireCrossing) {
        if (previousHeight < -2 || currentHeight > probeDistance || currentHeight < -Math.max(16, platform.thickness * 2.8)) continue;
      } else if (currentHeight < -Math.max(8, platform.thickness * 1.5) || currentHeight > probeDistance) continue;
      const score = Math.abs(currentHeight) + Math.abs(tangentOffset) * 0.025;
      if (!best || score < best.score) {
        best = {
          platform,
          frame,
          surface,
          currentHeight,
          tangentOffset,
          score,
        };
      }
    }
    return best;
  }

  resolvePlanetPlayerPlatformContact(player, island, basis = this.getIslandGravityBasis(island), {
    previousX = player.x,
    previousY = player.y,
  } = {}) {
    const contact = this.getPlanetPlayerPlatformContact(player, island, basis, {
      previousX,
      previousY,
      probeDistance: PLANET_PLAYER_GROUND_PROBE + 5,
      requireCrossing: true,
    });
    if (!contact) return false;
    const correction = 0.5 - contact.currentHeight;
    player.x += contact.frame.outward.x * correction;
    player.y += contact.frame.outward.y * correction;
    const intoPlatformSpeed = player.vx * contact.frame.outward.x + player.vy * contact.frame.outward.y;
    if (intoPlatformSpeed < 0) {
      player.vx -= contact.frame.outward.x * intoPlatformSpeed;
      player.vy -= contact.frame.outward.y * intoPlatformSpeed;
    }
    player.onGround = true;
    player.standingPlatformId = contact.platform.id;
    player.coyoteTimer = PLANET_PLAYER_FEEL.coyoteTime;
    player.groundGraceTimer = PLANET_PLAYER_FEEL.coyoteTime;
    return true;
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
    if (this.doesPlanetPlayerCollideWithClosedDoor(shape, island, left, top, right, bottom)) return true;
    if (terrain.intersectsCollisionShape) return terrain.intersectsCollisionShape(shape);
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

  doesPlanetPlayerCollideWithClosedDoor(shape, island, left, top, right, bottom) {
    const doors = island?.placedDoors || [];
    if (!doors.length) return false;
    for (const door of doors) {
      if (!door.isBlocking?.()) continue;
      const aabb = door.getCollisionAabb?.();
      if (!aabb) continue;
      if (aabb.right < left || aabb.left > right || aabb.bottom < top || aabb.top > bottom) continue;
      if (this.orientedBoxIntersectsAabb(shape, aabb.left, aabb.top, aabb.right, aabb.bottom)) return true;
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

  updateIslandViewRotationManual(delta) {
    if (!this.activeIsland || !this.islandPlayer) return;
    const gravityMachineActive = this.isGravityMachineRotationModeActive();
    if (!this.islandRotationSettling) return;

    const remaining = angleDifference(this.islandViewRotation, this.islandRotationTarget);
    if (!gravityMachineActive && Math.abs(remaining) <= ISLAND_STABILIZE_EPSILON) {
      this.islandViewRotation = this.islandRotationTarget;
      this.islandRotationSettling = false;
      return;
    }
    const maxSpeed = gravityMachineActive ? ISLAND_STABILIZE_HOLD_MAX_SPEED : ISLAND_STABILIZE_MAX_SPEED;
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
    if (!this.activeIsland) {
      this.islandMode = 'flight';
      this.resumeSpaceObjectsAfterIsland();
      return;
    }
    const duration = Math.max(0.001, this.islandBoardingDuration || ISLAND_BOARDING_DURATION);
    this.islandBoardingTimer -= delta;
    const progress = smoothStep(clamp01(1 - Math.max(0, this.islandBoardingTimer) / duration));
    this.islandViewRotation = normalizeAngle(
      this.islandBoardingStartRotation
        + angleDifference(this.islandBoardingStartRotation, this.islandBoardingTargetRotation) * progress,
    );
    const shipLocal = this.activeIsland.getShipParkLocal();
    const shipWorld = this.localToActiveIslandWorld(shipLocal.x, shipLocal.y, this.getIslandViewRotation());
    this.ship.x = shipWorld.x;
    this.ship.y = shipWorld.y;
    this.ship.vx = 0;
    this.ship.vy = 0;
    this.ship.angle = normalizeAngle(this.activeIsland.landingAngle + this.getIslandViewRotation());
    this.hud?.landingPrompt?.classList.remove('is-hidden');
    this.setHudText('landingPrompt', this.hud.landingPrompt, 'Boarding ship...', true);
    if (this.islandBoardingTimer > 0) return;

    const departingIsland = this.activeIsland;
    this.islandViewRotation = this.islandBoardingTargetRotation;
    const exit = this.localToActiveIslandWorld(shipLocal.x, shipLocal.y, this.getIslandViewRotation());
    this.ship.x = exit.x;
    this.ship.y = exit.y;
    this.ship.angle = normalizeAngle(this.activeIsland.landingAngle + this.getIslandViewRotation());
    this.bakeLandingAnchorIntoIsland();
    if (departingIsland) {
      this.game.systems.islands.saveShipAnchor?.(departingIsland.id, {
        landingAngle: departingIsland.landingAngle,
        landingSurfaceLocal: departingIsland.landingSurfaceLocal,
      }, { skipSave: true });
    }
    this.islandMode = 'flight';
    this.islandPlayer = null;
    this.gravityMachineManualActive = false;
    this.gravityMachineHotbarSuppressed = false;
    this.gravityMachineWasActive = false;
    this.setGravityMachineInputFlag(false);
    this.islandFreefall = false;
    this.islandGravityRecovery = false;
    this.islandGravityRecoveryBlend = 0;
    this.landingIsland = null;
    this.landingTargetPreview = null;
    this.enemySystem?.clear();
    this.islandPickups.forEach((pickup) => this.releaseIslandPickup(pickup));
    this.islandPickups.length = 0;
    this.activeIsland = null;
    this.atmosphereIsland = departingIsland;
    this.recentAtmosphereIslandId = departingIsland?.id || '';
    this.recentAtmosphereCacheKeepUntil = this.time + 20;
    this.autoParkGraceIslandId = departingIsland?.id || '';
    this.autoParkGraceUntil = this.time + 4.5;
    this.atmosphereStrength = clamp01(departingIsland?.getAtmosphereStrength?.(this.ship) ?? 1);
    this.atmosphereSurfaceDistance = departingIsland
      ? Math.max(0, departingIsland.getSurfaceClearanceToPoint?.(this.ship.x, this.ship.y) ?? 0)
      : Infinity;
    this.gravityIsland = departingIsland;
    this.gravityFieldStrength = this.atmosphereStrength;
    this.islandLandingTarget = null;
    this.islandLandingAnchor = null;
    this.islandViewRotation = 0;
    this.islandRotationTarget = 0;
    this.islandRotationSettling = false;
    this.resumeSpaceObjectsAfterIsland({ keepAtmosphereBackground: Boolean(departingIsland) });
    this.game.systems.quests?.record?.('boardedShip', {
      planetId: departingIsland?.id || '',
      tag: departingIsland?.tag || departingIsland?.planetTag || '',
    }, { save: false, notify: true });
    this.game.saveGame();
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
    const departingIsland = this.activeIsland;
    const preservedViewRotation = this.getIslandViewRotation();
    const shipLocal = departingIsland.getShipParkLocal();
    const target = this.localToActiveIslandWorld(shipLocal.x, shipLocal.y, preservedViewRotation);
    this.islandLandingAnchor = {
      island: departingIsland,
      local: { x: shipLocal.x, y: shipLocal.y },
      world: { x: target.x, y: target.y },
    };
    this.ship.x = target.x;
    this.ship.y = target.y;
    this.ship.vx = 0;
    this.ship.vy = 0;
    this.ship.angle = normalizeAngle(departingIsland.landingAngle + preservedViewRotation);
    this.game.systems.islands.saveShipAnchor?.(departingIsland.id, {
      landingAngle: departingIsland.landingAngle,
      landingSurfaceLocal: departingIsland.landingSurfaceLocal,
    }, { skipSave: true });
    this.islandMode = 'flight';
    this.islandPlayer = null;
    this.gravityMachineManualActive = false;
    this.gravityMachineHotbarSuppressed = false;
    this.gravityMachineWasActive = false;
    this.setGravityMachineInputFlag(false);
    this.islandFreefall = false;
    this.islandGravityRecovery = false;
    this.islandGravityRecoveryBlend = 0;
    this.landingIsland = null;
    this.landingTargetPreview = null;
    this.enemySystem?.clear();
    this.islandPickups.forEach((pickup) => this.releaseIslandPickup(pickup));
    this.islandPickups.length = 0;
    this.activeIsland = null;
    this.atmosphereIsland = departingIsland;
    this.recentAtmosphereIslandId = departingIsland?.id || '';
    this.recentAtmosphereCacheKeepUntil = this.time + 20;
    this.autoParkGraceIslandId = departingIsland?.id || '';
    this.autoParkGraceUntil = this.time + 4.5;
    this.atmosphereStrength = Math.max(0.98, clamp01(departingIsland.getAtmosphereStrength?.(this.ship) ?? 1));
    this.atmosphereSurfaceDistance = Math.max(0, departingIsland.getSurfaceClearanceToPoint?.(this.ship.x, this.ship.y) ?? 0);
    this.atmosphereViewRotation = preservedViewRotation;
    this.departedIslandDecorId = departingIsland.id;
    this.gravityIsland = departingIsland;
    this.gravityFieldStrength = this.atmosphereStrength;
    this.arrivalNoticeIslandId = departingIsland.id;
    this.approachNoticeIslandId = departingIsland.id;
    this.islandLandingTarget = null;
    this.islandLandingAnchor = null;
    this.islandRotationSettling = false;
    this.resumeSpaceObjectsAfterIsland();
    this.stopIslandTerrainLaser();
    this.hud?.landingPrompt?.classList.add('is-hidden');
    this.shipSmoke?.clear();
    this.game.saveGame();
    this.game.audio.playBoardShip?.();
    this.game.ui.showToast('Ship controls online.', 'success', 1100);
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
    this.game.systems.quests?.record?.('shipRepaired', {}, { save: false, notify: true });
    this.game.state.navigation.gpsUnlocked = true;
    this.game.state.navigation.scannerLevel = Math.max(1, this.game.state.navigation.scannerLevel || 0);
    const nextTarget = this.assignPostRepairDestination({ save: false });
    if (!nextTarget) {
      this.game.state.navigation.selectedDestinationId = 'base';
      this.game.systems.navigation.refreshLocations?.();
      this.game.systems.navigation.discoverLocation('base', { notify: false, save: false });
    }
    this.game.saveGame();
    this.game.audio.playSuccess?.();
    this.spawnBurst(this.ship.x, this.ship.y, '#76f3ff', 28, 160);
    const targetLabel = nextTarget?.getDisplayName?.() || (nextTarget?.tag ? `${nextTarget.tag} ${nextTarget.name}` : nextTarget?.name);
    this.game.ui.showToast(
      targetLabel
        ? `Thrusters repaired. GPS locked onto ${targetLabel}.`
        : 'Thrusters repaired. Your base GPS is online.',
      'success',
      3200,
    );
    if (gameBalance.tutorialDialogueEnabled !== false) {
      this.game.systems.dialogue.startSet('sparksTutorial', 'repaired', {
        speaker: 'Sparks',
        portraitStyle: { tone: 'forge', shape: 'drone' },
        enqueue: true,
      });
    }
    this.crashStart = false;
  }

  suspendSpaceObjectsForIsland(island) {
    if (this.spaceObjectsSuspended) return;
    this.backgroundAsteroids = [];
    this.backgroundAsteroidSourceId = '';
    this.asteroids.forEach((asteroid) => this.releaseAsteroid(asteroid));
    this.asteroids.length = 0;
    this.pickups.forEach((pickup) => this.releasePickup(pickup));
    this.pickups.length = 0;
    this.scheduleInactiveIslandRenderCacheRelease(island);
    this.loadedIslandFocusId = island?.id || '';
    this.laserTarget = null;
    this.laserAimPoint = null;
    this.spaceObjectsSuspended = true;
  }

  resumeSpaceObjectsAfterIsland({ keepAtmosphereBackground = false } = {}) {
    if (!this.spaceObjectsSuspended) return;
    this.backgroundAsteroids = [];
    this.backgroundAsteroidSourceId = '';
    this.spaceSpawnWarmupTimer = Math.max(
      this.spaceSpawnWarmupTimer,
      gameBalance.mining.spaceSpawnWarmupDuration || 1.4,
    );
    this.spaceObjectsSuspended = false;
  }

  releaseInactiveIslandRenderCaches(keepIsland = null) {
    const keepIds = new Set([
      keepIsland?.id,
      this.activeIsland?.id,
      this.atmosphereIsland?.id,
      this.gravityIsland?.id,
      this.landingIsland?.id,
      this.loadedIslandFocusId || '',
    ].filter(Boolean));
    if (
      this.recentAtmosphereIslandId
      && this.time < (this.recentAtmosphereCacheKeepUntil || 0)
    ) {
      keepIds.add(this.recentAtmosphereIslandId);
    }
    this.rockIslands.forEach((island) => {
      if (!keepIds.has(island.id)) island.terrain?.releaseRenderCache?.();
    });
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
    let text = this.islandFreefall ? 'Gravity Machine auto-engaged - falling back to the planet' : 'Mine terrain - G uses Gravity Machine';
    if (!this.hasGravityMachine()) text = 'Craft a Gravity Machine to rotate around the planet';
    if (!this.canUseGravityStabilizerOnIsland(this.activeIsland)) {
      text = this.hasGravityMachine()
        ? `${this.activeIsland.getAtmosphereLabel?.() || 'Dense atmosphere'} - Gravity Machine Mk ${this.activeIsland.gravityStabilizerRequirement || 2} needed`
        : 'Craft a Gravity Machine to rotate around the planet';
    }
    if (this.isGravityMachineRotationModeActive()) {
      text = 'Gravity Machine active - scroll / LB-RB rotate, G/Y toggles off';
    } else if (this.isGravityMachineToolSelected() && this.canUseGravityStabilizerOnIsland(this.activeIsland)) {
      text = 'Gravity Machine - select or press G/Y, then scroll / LB-RB rotate';
    }
    if (this.isFlagToolSelected()) text = 'Flag tool - aim at ground and click Use';
    if (this.isTorchToolSelected()) text = 'Torch - aim at ground and click Use';
    if (this.isPlatformToolSelected()) text = 'Platform - aim at open grid space and click Use';
    if (this.isPlatformPlacerToolSelected()) text = 'PP5 - click to place five thin platforms forward';
    if (this.isDoorToolSelected()) {
      text = 'Door - aim at a four-tile doorway with solid blocks above and below';
      if (this.doorPlacementPreview && !this.doorPlacementPreview.valid && this.doorPlacementPreview.reason) {
        text = `Door - ${this.doorPlacementPreview.reason}`;
      }
    }
    if (this.isCraftingStationToolSelected()) text = 'Crafting station - aim at ground and click Use';
    if (this.isResearchStationToolSelected()) text = 'Research station - aim at ground and click Use';
    if (this.isFurnaceToolSelected()) text = 'Furnace tool - aim at ground and click Use';
    if (this.isBuildToolSelected()) {
      const preview = this.buildPlacementPreview;
      const itemName = this.game.systems.materials.getDisplayName(preview?.itemId || this.game.systems.building.getSelectedBuildItem(this)?.itemId);
      const mode = preview?.mode === 'backgroundWall' ? 'wall' : 'block';
      text = `${itemName} ${mode} - click grid cells; hold-drag paints one cell at a time`;
      if (preview && !preview.valid && preview.reason) text = `${itemName} ${mode} - ${preview.reason}`;
    }
    if (this.crashStart && !this.getStoryState().thrustersRepaired) text = this.getCrashObjectiveText();
    const interactLabel = this.getInteractControlLabel();
    const nearbyWorkbench = this.getNearbyWorkbench(this.islandPlayer);
    if (nearbyWorkbench?.type === 'crafting') text = `Press ${interactLabel} to open crafting station`;
    if (nearbyWorkbench?.type === 'research') text = `Press ${interactLabel} to open research station`;
    if (this.getNearbyFlag(this.islandPlayer)) text = `Press ${interactLabel} to pack base flag`;
    const nearbyFurnace = this.getNearbyFurnace(this.islandPlayer);
    if (nearbyFurnace) text = `Press ${interactLabel} to open furnace`;
    if (this.activeIsland.isPlayerNearShip(this.islandPlayer)) {
      text = this.crashStart && !this.getStoryState().thrustersRepaired
        ? `Press ${interactLabel} to inspect broken thrusters`
        : `Press ${interactLabel} to Board Ship`;
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
    const gravityRecipe = crash.gravityMachineRecipe?.requirements || {};
    if (!story.gravityMachineBuilt && !this.hasGravityMachine()) {
      const missing = Object.entries(gravityRecipe).filter(([itemId, amount]) => inventory.getStoredAmount(itemId) < amount);
      if (!story.craftingStationPlaced) return 'Select Craft slot 5 and place the crafting station';
      if (missing.length) {
        const text = Object.entries(gravityRecipe).map(([itemId, amount]) => {
          const have = inventory.getStoredAmount(itemId);
          return `${this.game.systems.materials.getDisplayName(itemId)} ${have}/${amount}`;
        }).join(', ');
        return `Craft Gravity Machine first - ${text}`;
      }
      return 'Open the crafting station and craft a Gravity Machine';
    }
    if (!story.furnaceBuilt) {
      const recipe = crash.furnaceRecipe?.requirements || {};
      if (!story.craftingStationPlaced) return 'Select Craft slot 5 and place the crafting station';
      const missing = Object.entries(recipe).filter(([itemId, amount]) => inventory.getStoredAmount(itemId) < amount);
      if (missing.length) {
        const text = Object.entries(recipe).map(([itemId, amount]) => {
          const have = inventory.getStoredAmount(itemId);
          return `${this.game.systems.materials.getDisplayName(itemId)} ${have}/${amount}`;
        }).join(', ');
        return `Mine furnace materials - ${text}`;
      }
      return 'Open crafting station: make 9 open spaces, Fire Core on Iron Dust';
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
    const broken = island.terrain.mineCircle(hit.x, hit.y, TERRAIN_MINING_BRUSH_RADIUS, power, delta, {
      targetCol: hit.col,
      targetRow: hit.row,
    });
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
    this.removeUnsupportedTorches({ brokenCells: broken, drop: true });
    this.collectIslandTerrainCells(broken);
    this.game.audio.playMineNode?.();
  }

  getTerrainMiningPower() {
    const base = gameBalance.mining.terrainMiningPowerBase ?? 0.42;
    const scale = gameBalance.mining.terrainMiningPowerScale ?? 0.78;
    const power = base + Math.max(0, this.stats.miningPower || 0) * scale;
    return this.isGodMode() ? power * GOD_MODE_MINING_MULTIPLIER : power;
  }

  canMineTerrainMaterial(material) {
    if (this.isGodMode()) return true;
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
    for (const cell of cells) {
      if (!cell.data?.materialId || !cell.data.yield) continue;
      const entry = grouped.get(cell.data.materialId) || {
        amount: 0,
        x: cell.x,
        y: cell.y,
        chip: cell.chip,
      };
      entry.amount += cell.data.yield;
      entry.x = (entry.x + cell.x) * 0.5;
      entry.y = (entry.y + cell.y) * 0.5;
      entry.chip ||= cell.chip;
      grouped.set(cell.data.materialId, entry);
    }
    let index = 0;
    for (const [materialId, entry] of grouped.entries()) {
      const material = this.game.systems.materials.getMaterial(materialId);
      const spawn = this.getIslandPickupSpawnPoint(entry, index);
      this.islandPickups.push(this.acquireIslandPickup({
        materialId,
        amount: entry.amount,
        x: spawn.x + Math.cos(index * 2.3 + this.time) * 4,
        y: spawn.y + Math.sin(index * 1.7 + this.time) * 4,
        seed: Math.random(),
        material,
        chip: entry.chip,
      }));
      index += 1;
    }
  }

  getIslandPickupSpawnPoint(entry, index = 0) {
    const island = this.activeIsland;
    const terrain = island?.terrain;
    if (!island || !terrain) return entry;
    const center = island.getCenterLocal();
    const dx = entry.x - center.x;
    const dy = entry.y - center.y;
    const distance = Math.hypot(dx, dy) || 1;
    const outward = { x: dx / distance, y: dy / distance };
    const tangent = { x: -outward.y, y: outward.x };
    const push = Math.max(terrain.cellSize * 0.18, 5);
    const wobble = (index - 0.5) * terrain.cellSize * 0.24;
    const candidates = [
      { x: entry.x, y: entry.y },
      { x: entry.x + outward.x * push, y: entry.y + outward.y * push },
      { x: entry.x + tangent.x * wobble, y: entry.y + tangent.y * wobble },
      { x: entry.x + outward.x * push + tangent.x * wobble, y: entry.y + outward.y * push + tangent.y * wobble },
    ];
    for (const candidate of candidates) {
      if (!terrain.containsCollisionPoint?.(candidate.x, candidate.y)) return candidate;
    }
    return candidates[0];
  }

  acquireIslandPickup(options) {
    const pickup = this.islandPickupPool.pop() || new MineralPickup();
    return pickup.reset(options);
  }

  releaseIslandPickup(pickup) {
    pickup.active = false;
    if (this.islandPickupPool.length < (gameBalance.mining.maxPickupPool || 80)) this.islandPickupPool.push(pickup);
  }

  updateIslandPickups(delta) {
    if (!this.activeIsland || !this.islandPlayer) return;
    this.pickupSurfaceChecksThisFrame = 0;
    let writeIndex = 0;
    for (let index = 0; index < this.islandPickups.length; index += 1) {
      const pickup = this.islandPickups[index];
      this.updateIslandPickupPhysics(pickup, delta);
      const dx = this.islandPlayer.centerX - pickup.x;
      const dy = this.islandPlayer.centerY - pickup.y;
      const distanceSq = dx * dx + dy * dy;
      if (distanceSq > (pickup.radius + 28) ** 2) {
        if (pickup.age < 45) {
          this.islandPickups[writeIndex] = pickup;
          writeIndex += 1;
        } else {
          this.releaseIslandPickup(pickup);
        }
        continue;
      }
      if (pickup.age < (pickup.pickupDelay || 0)) {
        this.islandPickups[writeIndex] = pickup;
        writeIndex += 1;
        continue;
      }
      if (!this.collectIslandPickup(pickup)) {
        this.islandPickups[writeIndex] = pickup;
        writeIndex += 1;
        continue;
      }
      this.releaseIslandPickup(pickup);
    }
    this.islandPickups.length = writeIndex;
  }

  updateIslandPickupPhysics(pickup, delta) {
    pickup.update(delta);
    const terrain = this.activeIsland?.terrain;
    if (!terrain?.getClosestTerrainSurfacePoint) return;
    pickup.surfaceCheckTimer = Math.max(0, (pickup.surfaceCheckTimer || 0) - delta);
    if (pickup.surfaceCheckTimer > 0) return;
    pickup.surfaceCheckTimer = 0.12 + (pickup.seed % 0.07);
    const inside = terrain.containsCollisionPoint?.(pickup.x, pickup.y);
    if (!inside) return;
    const maxSurfaceChecks = gameBalance.performance?.maxIslandPickupSurfaceChecksPerFrame ?? 8;
    if ((this.pickupSurfaceChecksThisFrame || 0) >= maxSurfaceChecks) {
      pickup.surfaceCheckTimer = 0.035 + (pickup.seed % 0.045);
      return;
    }
    this.pickupSurfaceChecksThisFrame += 1;
    const surface = terrain.getClosestTerrainSurfacePoint(pickup.x, pickup.y, pickup.radius + 4);
    if (!surface) return;
    const dx = pickup.x - surface.surfaceX;
    const dy = pickup.y - surface.surfaceY;
    const normalDistance = dx * surface.normal.x + dy * surface.normal.y;
    if (!inside && normalDistance > pickup.radius + 6) return;
    pickup.x = surface.x;
    pickup.y = surface.y;
    const tangentSpeed = pickup.vx * surface.tangent.x + pickup.vy * surface.tangent.y;
    pickup.vx = surface.tangent.x * tangentSpeed * 0.72;
    pickup.vy = surface.tangent.y * tangentSpeed * 0.72;
  }

  collectIslandPickup(pickup) {
    if (pickup.storagePickup) {
      this.game.systems.inventory.add(pickup.materialId, pickup.amount, { skipSave: true });
      this.schedulePickupSave();
      this.game.systems.objectives.record('materialCollected', {
        materialId: pickup.materialId,
        amount: pickup.amount,
      });
      const material = this.game.systems.materials.getMaterial(pickup.materialId);
      const world = this.activeIsland.localToWorldRotated(pickup.x, pickup.y, this.getIslandViewRotation());
      this.addPickupFloatingText(
        world.x,
        world.y,
        pickup.materialId,
        pickup.amount,
        { color: material?.color || '#fff2cf', rarity: material?.rarity || 'common' },
      );
      this.game.audio.playIslandPickup?.();
      return true;
    }
    if (this.crashStart && this.activeIsland?.id === this.getStoryState().starterPlanetId) {
      this.collectCrashStarterMaterial(pickup.materialId, pickup.amount, pickup);
      return true;
    }
    const result = this.game.systems.inventory.addToRunCargo(pickup.materialId, pickup.amount, {
      capacity: this.stats.cargoCapacity,
    });
    const world = this.activeIsland.localToWorldRotated(pickup.x, pickup.y, this.getIslandViewRotation());
    if (!result.ok) {
      if (this.cargoFullToastReady) {
        this.cargoFullToastReady = false;
        this.game.ui.showToast('Cargo Full', 'danger');
        this.game.audio.playCargoFull();
        this.addFloatingText(world.x, world.y, 'Cargo Full', { color: '#ff756f', rarity: 'rare' });
        window.setTimeout(() => {
          this.cargoFullToastReady = true;
        }, 1200);
      }
      return false;
    }
    this.runCargo = result.cargo;
    this.runCargoWeight = result.currentWeight;
    this.runCargoSlots = result.currentSlots;
    this.stats.cargo = this.runCargoSlots;
    this.runCargoCount += pickup.amount;
    this.game.systems.objectives.record('materialCollected', {
      materialId: pickup.materialId,
      amount: pickup.amount,
    });
    const material = this.game.systems.materials.getMaterial(pickup.materialId);
    this.addPickupFloatingText(
      world.x,
      world.y,
      pickup.materialId,
      pickup.amount,
      { color: material?.color || '#fff2cf', rarity: material?.rarity || 'common' },
    );
    this.game.audio.playIslandPickup?.();
    if (material && material.rarity !== 'common') {
      this.game.systems.achievements.record('rareFind', { materialId: pickup.materialId, rarity: material.rarity });
    }
    if (material?.rarity === 'rare' || material?.rarity === 'epic') {
      this.game.audio.playRareFind();
      this.rareFindBurst(world.x, world.y, material.color);
    }
    return true;
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
    this.addPickupFloatingText(
      world.x,
      world.y,
      materialId,
      amount,
      { color: material?.color || '#fff2cf', rarity: material?.rarity || 'common' },
    );
    if (materialId === 'stoneOre' && !this.getStoryState().furnaceBuilt) this.startCrashTutorialHint('furnaceHint');
    this.game.audio.playIslandPickup?.();
    this.schedulePickupSave();
  }

  handleIslandEnemyDefeated(enemy) {
    if (!enemy || enemy.rewarded) return;
    enemy.rewarded = true;
    const world = enemy.getPosition?.() || { x: enemy.worldX, y: enemy.worldY };
    this.spawnBurst(world.x, world.y, enemy.accent || '#7ee36d', 16, 130);
    this.addFloatingText(world.x, world.y - 26, enemy.data?.name || 'Enemy defeated', {
      color: enemy.accent || '#7ee36d',
      rarity: 'uncommon',
    });
    this.game.audio.playAnimalDefeated?.();

    const drops = enemy.data?.drops || {};
    Object.entries(drops).forEach(([materialId, amount], index) => {
      const material = this.game.systems.materials.getMaterial(materialId);
      this.spawnIslandLootDrop(materialId, amount, {
        worldX: world.x + Math.cos(index * 2.4) * 18,
        worldY: world.y - 8 + Math.sin(index * 2.4) * 18,
        material,
        storagePickup: this.crashStart && this.activeIsland?.id === this.getStoryState().starterPlanetId,
      });
    });
  }

  spawnIslandLootDrop(materialId, amount = 1, {
    worldX = 0,
    worldY = 0,
    material = null,
    storagePickup = false,
    pickupDelay = 0.25,
  } = {}) {
    if (!this.activeIsland) return null;
    const local = this.activeIsland.worldToLocalRotated(worldX, worldY, this.getIslandViewRotation());
    const pickup = this.acquireIslandPickup({
      materialId,
      amount,
      x: local.x,
      y: local.y,
      seed: Math.random(),
      material: material || this.game.systems.materials.getMaterial(materialId),
      storagePickup,
      pickupDelay,
    });
    const angle = Math.random() * Math.PI * 2;
    pickup.vx = Math.cos(angle) * 74;
    pickup.vy = Math.sin(angle) * 74 - 28;
    this.islandPickups.push(pickup);
    this.addFloatingText(worldX, worldY - 34, `${amount} ${this.game.systems.materials.getDisplayName(materialId)} dropped`, {
      color: pickup.material?.color || '#7ee36d',
      rarity: pickup.material?.rarity || 'common',
    });
    return pickup;
  }

  getIslandAimPoint() {
    const controllerAim = this.getControllerIslandAimPoint();
    if (controllerAim) return controllerAim;
    const pointer = this.game.input.mousePointer;
    if (pointer?.inside && pointer.source === 'canvas' && document.documentElement.dataset.inputMode !== 'touch') {
      return this.screenToIslandLocal(pointer.canvasX, pointer.canvasY);
    }
    const foot = this.getIslandPlayerFootCursorPoint();
    if (foot) return foot;
    return {
      x: this.islandPlayer.centerX,
      y: this.islandPlayer.centerY + this.islandPlayer.height * 0.5,
    };
  }

  getIslandPlayerFootCursorPoint({ intoGround = 0 } = {}) {
    if (!this.activeIsland || !this.islandPlayer) return null;
    const basis = this.getIslandGravityBasis(this.activeIsland);
    const foot = this.getPlanetPlayerFootPoint(
      this.islandPlayer,
      this.activeIsland,
      this.islandPlayer.x,
      this.islandPlayer.y,
      basis,
    );
    return {
      x: foot.x + basis.inward.x * intoGround,
      y: foot.y + basis.inward.y * intoGround,
    };
  }

  getControllerIslandAimPoint() {
    const direction = this.getControllerIslandAimVector();
    if (!direction || !this.islandPlayer) return null;
    const range = this.getControllerToolAimRange('island');
    const distance = Math.max(Math.min(42, range * 0.36), range * Math.min(1, direction.magnitude));
    const localAim = this.rotateScreenVectorToIslandLocal(direction.x, direction.y);
    return {
      x: this.islandPlayer.centerX + localAim.x * distance,
      y: this.islandPlayer.centerY - 7 + localAim.y * distance,
    };
  }

  getControllerIslandAimVector() {
    const inputMode = document.documentElement.dataset.inputMode;
    const controllerActive = Boolean(this.game.input.isControllerActive?.());
    const forceTouchControls = document.documentElement.dataset.forceTouchControls === 'true';
    const allowDirectionalAim = controllerActive || inputMode === 'touch' || forceTouchControls;
    if (!allowDirectionalAim) return null;

    const aim = this.game.input.aimVector || { x: 0, y: 0 };
    const aimMagnitude = Math.hypot(aim.x, aim.y);
    if (aimMagnitude > 0.12) {
      return {
        x: aim.x / aimMagnitude,
        y: aim.y / aimMagnitude,
        magnitude: clamp01(aimMagnitude),
        source: 'aim',
      };
    }

    const move = controllerActive
      ? (this.game.input.gamepadMove || { x: 0, y: 0 })
      : (this.game.input.virtualMove || { x: 0, y: 0 });
    const moveMagnitude = Math.hypot(move.x, move.y);
    if (moveMagnitude <= 0.18) return null;
    return {
      x: move.x / moveMagnitude,
      y: move.y / moveMagnitude,
      magnitude: clamp01(moveMagnitude),
      source: 'move',
    };
  }

  rotateScreenVectorToIslandLocal(x, y) {
    const rotation = -this.getIslandViewRotation();
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    return {
      x: x * cos - y * sin,
      y: x * sin + y * cos,
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
    const snapAim = this.getMinerSnapAimState();
    const laser = this.getIslandTerrainLaserState(snapAim?.aimPoint || this.getIslandAimPoint(), { updateFacing });
    const hit = laser.length > 8
      ? this.activeIsland.terrain.raycast(laser.start.x, laser.start.y, laser.end.x, laser.end.y)
      : null;
    const target = hit
      ? { col: hit.col, row: hit.row }
      : (snapAim?.target || null);
    return {
      ...laser,
      terrain: this.activeIsland.terrain,
      hit,
      end: hit ? { x: hit.x, y: hit.y } : laser.end,
      target,
      center: target ? this.game.systems.building?.planetTileToWorld?.(target.col, target.row, { terrain: this.activeIsland.terrain }) : null,
      valid: hit ? this.canMineTerrainMaterial(hit.material) : false,
      snapCursor: Boolean(snapAim?.snapped),
    };
  }

  getMinerSnapAimState() {
    if (!this.buildSnapCursorEnabled || !this.isMinerToolSelected() || !this.activeIsland?.terrain || !this.islandPlayer) return null;
    const building = this.game.systems.building;
    const aim = building?.getAimState?.(this, { rangeOverride: TERRAIN_MINER_RANGE });
    if (!aim?.snapped) return null;
    const terrain = this.activeIsland.terrain;
    const target = building.worldToPlanetTile(aim.aimPoint.x, aim.aimPoint.y, { terrain });
    if (!terrain.isInside(target.col, target.row)) return null;
    return {
      ...aim,
      target,
    };
  }

  updateIslandPlayerFacingFromAim(aimPoint) {
    if (!this.islandPlayer || !aimPoint) return;
    const dx = aimPoint.x - this.islandPlayer.centerX;
    const dy = aimPoint.y - this.islandPlayer.centerY;
    const rotation = this.getIslandViewRotation();
    const screenDx = dx * Math.cos(rotation) - dy * Math.sin(rotation);
    if (Math.abs(screenDx) > 4) this.islandPlayer.facing = screenDx >= 0 ? 1 : -1;
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
    const range = this.isMinerToolSelected() ? TERRAIN_MINER_RANGE : TERRAIN_LASER_RANGE;
    const length = Math.min(distance, range);
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
      range,
      rangeRatio: range > 0 ? length / range : 0,
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
    const hit = this.findShipSurfaceCollision();
    if (!hit) return;
    this.resolveShipSurfaceCollision(hit);
    if (this.ship.hitCooldown > 0) return;
    if (this.tryAbsorbCollision()) {
      this.spawnBurst(this.ship.x, this.ship.y, '#76f3ff', 18);
      this.addScreenShake(0.35);
      this.ship.hitCooldown = 0.45;
      this.game.ui.showToast('Shield absorbed impact', 'success');
      this.game.audio.playSuccess();
      return;
    }
    const force = this.isInvincible() ? Math.min(hit.force || 260, 190) : (hit.force || 300);
    this.applyShipImpactImpulse(hit, force);
    this.spawnBurst(this.ship.x, this.ship.y, this.isInvincible() ? '#76f3ff' : '#ff756f', this.isInvincible() ? 10 : 14);
    if (this.isInvincible()) return;
    this.stats.hull = Math.max(0, this.stats.hull - hit.damage);
    this.addScreenShake(0.75);
    this.game.audio.playShipHit();
    if (this.stats.hull <= 0) this.crash();
  }

  findShipSurfaceCollision() {
    let best = null;
    for (let index = 0; index < this.asteroids.length; index += 1) {
      const asteroid = this.asteroids[index];
      const collision = asteroid.getCollisionWith?.(this.ship);
      if (!collision) continue;
      const hit = {
        x: collision.x,
        y: collision.y,
        normalX: collision.normalX,
        normalY: collision.normalY,
        penetration: collision.penetration,
        damage: Math.max(1, Math.round((asteroid.data.damage || 8) * (gameBalance.mining.shipAsteroidCollisionDamageScale || 1))),
        force: asteroid.data.slippery ? 430 : (gameBalance.mining.shipAsteroidCollisionKnockback || 330),
        slippery: asteroid.data.slippery,
        color: asteroid.data.accent,
      };
      if (!best || (hit.penetration || 0) > (best.penetration || 0)) best = hit;
    }
    const planetHit = this.findShipPlanetSurfaceHit();
    if (planetHit && (!best || (planetHit.penetration || 0) > (best.penetration || 0))) {
      best = planetHit;
    }
    return best;
  }

  resolveShipSurfaceCollision(hit) {
    const normal = this.getCollisionNormal(hit);
    const push = Math.min(96, Math.max(0, hit.penetration || 0) + 4);
    this.ship.x += normal.x * push;
    this.ship.y += normal.y * push;
    const inwardSpeed = this.ship.vx * normal.x + this.ship.vy * normal.y;
    if (inwardSpeed < 0) {
      this.ship.vx -= normal.x * inwardSpeed * 1.28;
      this.ship.vy -= normal.y * inwardSpeed * 1.28;
    }
  }

  applyShipImpactImpulse(hit, force = 300) {
    const normal = this.getCollisionNormal(hit);
    this.ship.vx += normal.x * force;
    this.ship.vy += normal.y * force;
    this.ship.hitCooldown = 0.85;
  }

  getCollisionNormal(hit) {
    if (Number.isFinite(hit?.normalX) && Number.isFinite(hit?.normalY)) {
      const length = Math.hypot(hit.normalX, hit.normalY) || 1;
      return { x: hit.normalX / length, y: hit.normalY / length };
    }
    const dx = this.ship.x - (hit?.x || 0);
    const dy = this.ship.y - (hit?.y || 0);
    const distance = Math.hypot(dx, dy) || 1;
    return { x: dx / distance, y: dy / distance };
  }

  findShipPlanetSurfaceHit() {
    if (this.islandMode !== 'flight') return null;
    const shipRadius = this.ship.radius || 0;
    let closest = null;
    let closestClearance = Infinity;
    for (const island of this.rockIslands) {
      if (!island?.getSurfaceClearanceToPoint) continue;
      const distanceSq = island.distanceSqToPoint?.(this.ship.x, this.ship.y) ?? Infinity;
      const broadRadius = (island.atmosphereRadius || island.gravityFieldRadius || island.radius || 0) + shipRadius + 160;
      if (distanceSq > broadRadius * broadRadius) continue;
      const clearance = island.getSurfaceClearanceToPoint(this.ship.x, this.ship.y, shipRadius * 0.94);
      if (clearance >= closestClearance) continue;
      closestClearance = clearance;
      closest = island;
    }
    if (!closest || closestClearance > 0) return null;

    const local = closest.worldToLocal(this.ship.x, this.ship.y);
    const center = closest.getCenterLocal?.() || { x: closest.width * 0.5, y: closest.height * 0.5 };
    const angle = Math.atan2(local.y - center.y, local.x - center.x);
    const nx = Math.cos(angle);
    const ny = Math.sin(angle);
    const surface = closest.getSurfaceLocalAtAngle?.(angle, 0) || {
      x: center.x + nx * (closest.radius || 0),
      y: center.y + ny * (closest.radius || 0),
    };
    const surfaceWorld = closest.localToWorld(surface.x, surface.y);
    return {
      x: surfaceWorld.x,
      y: surfaceWorld.y,
      normalX: nx,
      normalY: ny,
      penetration: -closestClearance,
      damage: gameBalance.mining.shipPlanetCollisionDamage || 12,
      force: gameBalance.mining.shipPlanetCollisionKnockback || 360,
      color: '#ff756f',
    };
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

  addPickupFloatingText(x, y, materialId, amount, { color = '#fff2cf', rarity = 'common' } = {}) {
    this.floatingTextFx.addStacked(x, y, {
      key: `pickup:${materialId}`,
      label: this.game.systems.materials.getDisplayName(materialId),
      amount,
      color,
      rarity,
    });
  }

  rareFindBurst(x, y, color) {
    this.spawnBurst(x, y, color, 28, 170);
    this.addFloatingText(x, y - 24, 'Rare Find!', { color, rarity: 'rare' });
  }

  dock() {
    if (gameBalance.stationEnabled === false) return;
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
    this.game.ui.showToast('Out of fuel. Base recovery engaged.', 'danger', 2400);
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
    const cargoRatio = this.stats.cargo / Math.max(1, this.stats.cargoCapacity);
    this.setHudText('hullText', this.hud.hullText, `${Math.ceil(this.stats.hull)}/${this.stats.maxHull}`, force);
    this.setHudText('cargoText', this.hud.cargoText, `${this.stats.cargo}/${this.stats.cargoCapacity}`, force);
    this.setHudWidth('hullFill', this.hud.hullFill, Math.round(hullRatio * 100), force);
    this.setHudWidth('cargoFill', this.hud.cargoFill, Math.round(cargoRatio * 100), force);
    this.updatePlayerHealthHud(force);
    this.updateModeHud(force);

    const distance = this.distanceFromStation;
    this.setHudText('distanceText', this.hud.distanceText, `${Math.round(distance)}m`, force);
    this.setHudText('zoneChip', this.hud.zoneChip, this.currentZone.name, force);
    this.setHudText('zoneBanner', this.hud.zoneBanner, this.currentZone.name, force);
    this.setHudClass('zoneBannerVisible', this.hud.zoneBanner, 'is-visible', this.zoneBannerTimer > 0, force);
    const planetVisor = this.getPlanetVisorState();
    this.setHudClass('planetVisorVisible', this.hud.planetVisor, 'is-hidden', !planetVisor.visible, force);
    if (planetVisor.visible) {
      this.setHudText('planetTag', this.hud.planetTag, planetVisor.tag, force);
      this.setHudText('planetStatus', this.hud.planetStatus, planetVisor.status, force);
    }
    const baseDestination = this.game.systems.navigation.getLocation('base');
    const beaconX = baseDestination?.worldPosition?.x ?? 0;
    const beaconY = baseDestination?.worldPosition?.y ?? 0;
    const angleToBeacon = Math.atan2(beaconY - this.ship.y, beaconX - this.ship.x);
    this.hud.stationArrow.style.transform = `rotate(${angleToBeacon + Math.PI / 2}rad)`;
    const dockVisible = gameBalance.stationEnabled !== false && distance * distance <= DOCK_RADIUS_SQ && !this.cargoDumping;
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
    if (hullRatio <= 0.25) warnings.push('HULL CRITICAL');
    if (this.stats.cargo >= this.stats.cargoCapacity) warnings.push('CARGO FULL');
    this.setHudText('warning', this.hud.warning, warnings.join('  '), force);
    this.setHudClass('warningPulse', this.hud.warning, 'is-pulsing', warnings.length > 0, force);
    this.setHudClass('hullLow', this.hud.hullBar, 'is-low', hullRatio <= 0.25, force);
    this.game.audio.setDangerMode(hullRatio <= 0.25);
    this.miniMap?.draw({
      ship: this.ship,
      distance,
      zone: this.currentZone,
    });
  }

  updatePlayerHealthHud(force = false) {
    if (!this.hud?.playerHearts?.length) return;
    const maxHealth = Math.max(1, this.islandPlayer?.maxHealth ?? 50);
    const health = Math.max(0, Math.min(maxHealth, this.islandPlayer?.health ?? maxHealth));
    const heartCount = this.hud.playerHearts.length;
    const healthKey = `${Math.ceil(health)}/${Math.ceil(maxHealth)}`;
    if (force || this.hudCache.playerHealth !== healthKey) {
      this.hudCache.playerHealth = healthKey;
      const healthPerHeart = maxHealth / heartCount;
      this.hud.playerHearts.forEach((heart, index) => {
        const fill = Math.max(0, Math.min(1, (health - index * healthPerHeart) / healthPerHeart));
        heart.style.setProperty('--heart-fill', `${Math.round(fill * 100)}%`);
        heart.classList.toggle('is-full', fill >= 0.98);
        heart.classList.toggle('is-partial', fill > 0.02 && fill < 0.98);
        heart.classList.toggle('is-empty', fill <= 0.02);
      });
      this.hud.playerHealth?.setAttribute('aria-label', `Player health ${Math.ceil(health)} of ${Math.ceil(maxHealth)}`);
    }
    this.setHudClass('playerHealthLow', this.hud.playerHealth, 'is-low', health / maxHealth <= 0.3, force);
  }

  updateModeHud(force = false) {
    const onFoot = this.islandMode === 'onIsland' || this.islandMode === 'boarding';
    this.setHudClass('mapStackOnFoot', this.hud.mapStack, 'is-on-foot', onFoot, force);
    this.setHudClass('mapStackShip', this.hud.mapStack, 'is-ship', !onFoot, force);
  }

  getPlanetVisorState() {
    const island = this.activeIsland || this.landingIsland || this.atmosphereIsland;
    if (!island) return { visible: false, tag: '', status: '' };
    const tag = island.tag || island.planetTag || this.game.systems.islands.getPlanetTag(island.id) || 'P??';
    if (this.activeIsland && this.islandMode === 'onIsland') {
      return { visible: true, tag, status: 'Surface' };
    }
    if (this.activeIsland && this.islandMode === 'landing') {
      return { visible: true, tag, status: 'Landing' };
    }
    if (this.activeIsland && this.islandMode === 'boarding') {
      return { visible: true, tag, status: 'Boarding' };
    }
    if (this.landingIsland) {
      return { visible: true, tag, status: 'Landing Range' };
    }
    if (this.atmosphereIsland) {
      return { visible: true, tag, status: 'Atmosphere' };
    }
    return { visible: false, tag: '', status: '' };
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

  shouldRenderIsland(island) {
    if (!island) return false;
    if (this.islandMode !== 'flight') return island === this.activeIsland;
    if (island === this.landingIsland || island === this.atmosphereIsland || island === this.gravityIsland) return true;
    const loadRadius = (island.atmosphereRadius || island.gravityFieldRadius || island.radius || 0) + 1400;
    const dx = island.x - this.ship.x;
    const dy = island.y - this.ship.y;
    if (dx * dx + dy * dy > loadRadius * loadRadius) return false;
    const clearance = island.getSurfaceClearanceToPoint?.(this.ship.x, this.ship.y) ?? Infinity;
    return clearance <= (island.atmosphereDepth || 5000) + 1400;
  }

  render(ctx) {
    const { width, height } = this.game.viewport;
    const dpr = this.game.viewport?.dpr || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    this.drawSpace(ctx, width, height);
    this.drawAmbientParticles(ctx);
    this.drawBackgroundAsteroids(ctx);
    ctx.save();
    this.applyWorldScale(ctx, width, height);
    this.drawDistanceRings(ctx);
    if (gameBalance.stationEnabled !== false) this.drawStation(ctx);
    const camera = this.cameraView;
    for (const island of this.rockIslands) {
      if (!this.shouldRenderIsland(island)) continue;
      const distanceSq = island.distanceSqToPoint(this.camera.x, this.camera.y);
      const visibleRange = Math.max(2200, island.width + island.height, island.gravityFieldRadius * 1.2);
      if (
        distanceSq > visibleRange * visibleRange
        && island !== this.landingIsland
        && island !== this.activeIsland
        && island !== this.gravityIsland
      ) continue;
      const renderViewRotation = island === this.activeIsland
        ? this.getIslandViewRotation()
        : (island === this.atmosphereIsland ? this.atmosphereViewRotation : 0);
      const drawLocalIslandDetails = island === this.activeIsland || island.id === this.departedIslandDecorId;
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
        viewRotation: renderViewRotation,
        anchorLocal: island === this.activeIsland && this.islandLandingAnchor?.island === island ? this.islandLandingAnchor.local : null,
        anchorWorld: island === this.activeIsland && this.islandLandingAnchor?.island === island ? this.islandLandingAnchor.world : null,
        placedFlags: island.placedFlags || [],
        placedTorches: island.placedTorches || [],
        placedPlatforms: island.placedPlatforms || [],
        placedDoors: island.placedDoors || [],
        baseLab: drawLocalIslandDetails && this.baseLab?.id ? this.baseLab : null,
        placedCraftingStations: drawLocalIslandDetails && this.placedCraftingStation ? [this.placedCraftingStation] : [],
        placedResearchStations: drawLocalIslandDetails && this.placedResearchStation ? [this.placedResearchStation] : [],
        placedFurnaces: drawLocalIslandDetails ? this.placedFurnaces : [],
        enemies: island === this.activeIsland ? this.enemySystem?.getDrawableEnemies() : [],
        materialPickups: island === this.activeIsland ? this.islandPickups : [],
        terrainDebug: this.game.state.debug?.terrain,
        drawCombatEffects: island === this.activeIsland ? (localCtx) => this.drawIslandCombatEffectsLocal(localCtx) : null,
        drawPlayerEquipment: island === this.activeIsland ? (localCtx) => this.drawIslandPlayerEquipmentLocal(localCtx) : null,
        drawMovementDebug: island === this.activeIsland ? (localCtx) => this.drawPlanetMovementDebug(localCtx) : null,
      });
    }
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
      this.drawControllerShipAimIndicator(ctx);
    }
    this.drawParticles(ctx);
    ctx.restore();
    this.drawShipSmoke(ctx);
    ctx.save();
    this.applyWorldScale(ctx, width, height);
    if (this.islandMode !== 'onIsland' && this.islandMode !== 'boarding') {
      this.ship.draw(ctx, camera, this.game.input, { boost: this.isShipBoosting() });
      this.drawShipDestinationIndicator(ctx);
    }
    if (this.isWeaponToolSelected() && this.islandMode === 'flight') {
      this.combatDrone.draw(ctx, camera);
    }
    this.drawCargoTransferEffects(ctx);
    this.drawFloatingText(ctx);
    ctx.restore();
    this.drawAtmosphereEscapeOverlay(ctx, width, height);
  }

  drawAtmosphereEscapeOverlay(ctx, width, height) {
    const fx = clamp01(this.atmosphereEscapeFx || 0);
    if (fx > 0.01) this.drawAtmosphereEscapeCinematic(ctx, width, height, fx);
    if (!this.isAtmosphereEscapeBoostAvailable() || fx > 0.82) return;

    const promptAlpha = clamp01(0.74 + Math.sin(this.time * 4.5) * 0.12);
    const control = this.getBoostControlLabel();
    const message = `Hold ${control} to Void Burn`;
    const x = width * 0.5;
    const y = height - Math.max(138, (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hotbar-slot-size')) || 48) + 96);
    ctx.save();
    ctx.globalAlpha = promptAlpha;
    ctx.font = '900 17px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const metrics = ctx.measureText(message);
    const boxW = Math.max(236, metrics.width + 42);
    const boxH = 42;
    ctx.fillStyle = 'rgba(5, 12, 22, 0.82)';
    ctx.strokeStyle = 'rgba(118, 243, 255, 0.48)';
    ctx.lineWidth = 1.4;
    ctx.shadowColor = 'rgba(118, 243, 255, 0.28)';
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.roundRect(x - boxW * 0.5, y - boxH * 0.5, boxW, boxH, 12);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffd36b';
    ctx.strokeStyle = 'rgba(3, 7, 13, 0.72)';
    ctx.lineWidth = 3.4;
    ctx.strokeText(message, x, y + 1);
    ctx.fillText(message, x, y + 1);
    ctx.restore();
  }

  getBoostControlLabel() {
    if (this.isControllerPromptMode()) return 'A';
    if (document.documentElement.dataset.inputMode === 'touch') return 'Boost';
    return 'Space';
  }

  drawAtmosphereEscapeCinematic(ctx, width, height, amount) {
    const barHeight = Math.round((44 + width * 0.012) * amount);
    ctx.save();
    ctx.fillStyle = `rgba(1, 4, 9, ${0.82 * amount})`;
    ctx.fillRect(0, 0, width, barHeight);
    ctx.fillRect(0, height - barHeight, width, barHeight);

    const streakCount = Math.round(24 + amount * 34);
    ctx.lineCap = 'round';
    for (let index = 0; index < streakCount; index += 1) {
      const seed = index * 97.31;
      const phase = (this.time * (360 + amount * 780) + seed * 13) % (height + 180);
      const x = ((Math.sin(seed) * 10000) % 1 + 1) % 1 * width;
      const y = phase - 120;
      const length = 34 + (((Math.sin(seed * 2.17) * 10000) % 1 + 1) % 1) * 78 * amount;
      const drift = Math.sin(this.time * 2.4 + seed) * 12;
      const alpha = (0.12 + amount * 0.34) * (0.55 + (index % 5) * 0.08);
      ctx.strokeStyle = `rgba(188, 244, 255, ${alpha})`;
      ctx.lineWidth = 1 + amount * 1.4;
      ctx.beginPath();
      ctx.moveTo(x + drift, y);
      ctx.lineTo(x + drift * 0.35, y + length);
      ctx.stroke();
    }

    const vignette = ctx.createRadialGradient(width * 0.5, height * 0.5, height * 0.18, width * 0.5, height * 0.5, height * 0.76);
    vignette.addColorStop(0, `rgba(118, 243, 255, ${0.04 * amount})`);
    vignette.addColorStop(1, `rgba(1, 4, 9, ${0.34 * amount})`);
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);
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
    const fadeDuration = gameBalance.mining.backgroundAsteroidFadeDuration || 1.2;
    const fadeStrength = this.backgroundAsteroidFadeTimer > 0
      ? clamp01(this.backgroundAsteroidFadeTimer / fadeDuration)
      : 0;
    const atmosphere = Math.max(this.atmosphereStrength || 0, this.gravityFieldStrength || 0, fadeStrength);
    for (const rock of this.backgroundAsteroids) {
      const parallax = 0.38;
      const driftX = Math.cos(this.time * rock.drift + rock.seed) * 18;
      const driftY = Math.sin(this.time * rock.drift * 0.7 + rock.seed) * 10;
      const x = centerX + (rock.x - this.camera.x) * parallax + driftX;
      const y = centerY + (rock.y - this.camera.y) * parallax + driftY;
      if (x < -80 || x > this.game.viewport.width + 80 || y < -80 || y > this.game.viewport.height + 80) continue;
      ctx.globalAlpha = this.islandMode === 'flight' ? 0.08 + 0.28 * atmosphere : 0.28;
      if (isGameArtReady()) {
        drawGameArtSprite(ctx, 'asteroid', x, y, rock.radius * 2.6, rock.radius * 2.1, {
          alpha: 1,
          rotation: rock.seed * 0.01 + this.time * 0.035,
        });
        continue;
      }
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

    const gravityZoom = clamp01(Math.max(
      this.atmosphereStrength || 0,
      this.gravityFieldStrength || 0,
    ));
    if (gravityZoom > 0) {
      const easedZoom = Math.pow(gravityZoom, 0.78);
      return this.viewScale + (this.islandViewScale - this.viewScale) * easedZoom;
    }

    return this.viewScale;
  }

  drawShipDestinationIndicator(ctx) {
    const indicator = this.destinationIndicator;
    if (!indicator || this.islandMode === 'onIsland' || this.islandMode === 'boarding') return;
    const scale = Math.max(0.1, this.getActiveViewScale());
    const shipScreen = this.cameraView.worldToScreen(this.ship.x, this.ship.y);
    const ringRadius = 104 / scale;
    const markerSize = 13 / scale;
    const labelGap = 24 / scale;
    const angle = indicator.angle;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const markerX = shipScreen.x + cos * ringRadius;
    const markerY = shipScreen.y + sin * ringRadius;
    const distanceLabel = `${Math.round(indicator.distance)}m`;

    ctx.save();
    ctx.lineWidth = 1.25 / scale;
    ctx.strokeStyle = 'rgba(118, 243, 255, 0.22)';
    ctx.setLineDash([6 / scale, 9 / scale]);
    ctx.beginPath();
    ctx.arc(shipScreen.x, shipScreen.y, ringRadius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.strokeStyle = indicator.warning ? 'rgba(255, 117, 111, 0.72)' : 'rgba(118, 243, 255, 0.78)';
    ctx.lineWidth = 1.8 / scale;
    ctx.beginPath();
    ctx.arc(shipScreen.x, shipScreen.y, ringRadius, angle - 0.22, angle + 0.22);
    ctx.stroke();

    ctx.save();
    ctx.translate(markerX, markerY);
    ctx.rotate(angle);
    ctx.fillStyle = indicator.warning ? '#ff756f' : '#76f3ff';
    ctx.strokeStyle = 'rgba(3, 9, 18, 0.82)';
    ctx.lineWidth = 2.2 / scale;
    ctx.shadowColor = indicator.warning ? 'rgba(255, 117, 111, 0.55)' : 'rgba(118, 243, 255, 0.55)';
    ctx.shadowBlur = 10 / scale;
    ctx.beginPath();
    ctx.moveTo(markerSize * 1.35, 0);
    ctx.lineTo(-markerSize * 0.75, -markerSize * 0.72);
    ctx.lineTo(-markerSize * 0.32, 0);
    ctx.lineTo(-markerSize * 0.75, markerSize * 0.72);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    const labelX = markerX + cos * labelGap;
    const labelY = markerY + sin * labelGap;
    ctx.font = `800 ${Math.max(11 / scale, 10)}px system-ui, sans-serif`;
    ctx.textAlign = cos > 0.28 ? 'left' : cos < -0.28 ? 'right' : 'center';
    ctx.textBaseline = sin > 0.32 ? 'top' : sin < -0.32 ? 'bottom' : 'middle';
    ctx.lineWidth = 3.5 / scale;
    ctx.strokeStyle = 'rgba(2, 7, 14, 0.88)';
    ctx.fillStyle = indicator.warning ? '#ffb0a9' : '#dff9ff';
    ctx.strokeText(distanceLabel, labelX, labelY);
    ctx.fillText(distanceLabel, labelX, labelY);
    ctx.font = `700 ${Math.max(9 / scale, 8)}px system-ui, sans-serif`;
    ctx.fillStyle = 'rgba(236, 231, 216, 0.78)';
    const nameOffset = sin < -0.32 ? 13 / scale : -11 / scale;
    ctx.strokeText(indicator.name, labelX, labelY + nameOffset);
    ctx.fillText(indicator.name, labelX, labelY + nameOffset);
    ctx.restore();
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
    this.drawAtmosphereOverlay(ctx, width, height);
  }

  drawAtmosphereOverlay(ctx, width, height) {
    const island = this.islandMode === 'flight'
      ? (this.atmosphereIsland || this.landingIsland || this.activeIsland)
      : (this.activeIsland || this.landingIsland || this.atmosphereIsland);
    const strength = clamp01(this.islandMode === 'flight' ? (this.atmosphereStrength || 0) : (island ? 1 : 0));
    if (!island || strength <= 0.015) return;
    const palette = this.getAtmospherePalette(island.biome);
    const phaseSeed = ((island.id || '').split('').reduce((sum, char) => sum + char.charCodeAt(0), 0) % 100) / 100;
    const day = (Math.sin(this.time * 0.055 + phaseSeed * Math.PI * 2) + 1) * 0.5;
    const dusk = 1 - Math.abs(day - 0.5) * 2;
    const atmosphereDepth = island.atmosphereDepth || gameBalance.mining.planetAtmosphereDepth || 5000;
    const surfaceDistance = this.islandMode === 'flight'
      ? Math.max(0, Math.min(atmosphereDepth, this.atmosphereSurfaceDistance || atmosphereDepth))
      : 0;
    const altitudeProgress = clamp01(surfaceDistance / Math.max(1, atmosphereDepth));
    const altitudeCloseness = 1 - altitudeProgress;
    const alpha = Math.min(0.42, 0.045 + strength * 0.32);
    const horizonY = height * (1.08 - altitudeCloseness * 0.43 + Math.sin(this.time * 0.025 + phaseSeed) * 0.012);
    const topColor = lerpColor(palette.nightTop, palette.dayTop, day);
    const midColor = lerpColor(palette.nightMid, palette.dayMid, day);
    const horizonColor = lerpColor(palette.horizon, palette.sunset, dusk * 0.72);
    const planetScreen = this.cameraView.worldToScreen(island.x, island.y);
    const horizonAngle = this.getAtmosphereHorizonAngle(island, planetScreen);
    const diagonal = Math.hypot(width, height) * 1.45;
    const horizonLocalY = horizonY - height * 0.5;
    const cos = Math.cos(-horizonAngle);
    const sin = Math.sin(-horizonAngle);
    const dx = planetScreen.x - width * 0.5;
    const dy = planetScreen.y - height * 0.5;
    const localPlanetX = dx * cos - dy * sin;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(width * 0.5, height * 0.5);
    ctx.rotate(horizonAngle);
    const sky = ctx.createLinearGradient(0, horizonLocalY - diagonal * 0.42, 0, horizonLocalY + diagonal * 0.22);
    sky.addColorStop(0, colorWithAlpha(topColor, 0));
    sky.addColorStop(0.48, colorWithAlpha(midColor, 0.14 + strength * 0.12));
    sky.addColorStop(1, colorWithAlpha(horizonColor, 0.34 + strength * 0.24));
    ctx.fillStyle = sky;
    ctx.fillRect(-diagonal, -diagonal, diagonal * 2, diagonal * 2);

    const glow = ctx.createRadialGradient(
      localPlanetX,
      horizonLocalY + height * 0.08,
      10,
      localPlanetX,
      horizonLocalY + height * 0.08,
      width * (0.28 + strength * 0.42),
    );
    glow.addColorStop(0, `${palette.haze}${Math.round((0.12 + strength * 0.18) * 255).toString(16).padStart(2, '0')}`);
    glow.addColorStop(1, `${palette.haze}00`);
    ctx.fillStyle = glow;
    ctx.fillRect(-diagonal, -diagonal, diagonal * 2, diagonal * 2);

    ctx.globalAlpha = Math.min(0.78, 0.08 + strength * 0.48);
    const horizon = ctx.createLinearGradient(0, horizonLocalY - 60, 0, horizonLocalY + 90);
    horizon.addColorStop(0, `${palette.haze}00`);
    horizon.addColorStop(0.52, `${palette.haze}88`);
    horizon.addColorStop(1, `${palette.ground}00`);
    ctx.fillStyle = horizon;
    ctx.fillRect(-diagonal, horizonLocalY - 80, diagonal * 2, 180);
    ctx.strokeStyle = `${palette.haze}${Math.round((0.18 + strength * 0.36) * 255).toString(16).padStart(2, '0')}`;
    ctx.lineWidth = 1.2 + strength * 1.8;
    ctx.beginPath();
    ctx.moveTo(-diagonal * 0.58, horizonLocalY + Math.sin(this.time * 0.06) * 5);
    ctx.quadraticCurveTo(0, horizonLocalY - 28 * strength, diagonal * 0.58, horizonLocalY + Math.cos(this.time * 0.05) * 4);
    ctx.stroke();
    ctx.restore();
  }

  getAtmosphereHorizonAngle(island, planetScreen = null) {
    if (!island) return 0;
    if (island === this.activeIsland && this.islandMode !== 'flight') {
      return this.getIslandViewRotation();
    }
    const reference = this.ship || this.camera || { x: island.x, y: island.y - 1 };
    const planet = planetScreen || this.cameraView.worldToScreen(island.x, island.y);
    const referenceScreen = this.cameraView.worldToScreen(reference.x, reference.y);
    const dx = referenceScreen.x - planet.x;
    const dy = referenceScreen.y - planet.y;
    if (Math.abs(dx) + Math.abs(dy) > 0.001) {
      return normalizeAngle(Math.atan2(dy, dx) + Math.PI * 0.5);
    }
    const local = island.worldToLocal?.(reference.x, reference.y);
    const center = island.getCenterLocal?.() || { x: island.width * 0.5, y: island.height * 0.5 };
    if (local) {
      return normalizeAngle(Math.atan2(local.y - center.y, local.x - center.x) + Math.PI * 0.5);
    }
    return 0;
  }

  getAtmospherePalette(biome = 'scrap') {
    return {
      scrap: {
        nightTop: '#07142a',
        nightMid: '#102844',
        dayTop: '#1b4266',
        dayMid: '#275f7d',
        horizon: '#5f7c87',
        sunset: '#d58a52',
        haze: '#76f3ff',
        ground: '#243342',
      },
      forest: {
        nightTop: '#061b1f',
        nightMid: '#143333',
        dayTop: '#204d57',
        dayMid: '#416f5f',
        horizon: '#8bb673',
        sunset: '#d6a35c',
        haze: '#8df0a4',
        ground: '#1d3128',
      },
      crystal: {
        nightTop: '#071534',
        nightMid: '#142858',
        dayTop: '#1c4a78',
        dayMid: '#345f95',
        horizon: '#8ee8ff',
        sunset: '#b58cff',
        haze: '#8ee8ff',
        ground: '#202b4f',
      },
      ember: {
        nightTop: '#18090d',
        nightMid: '#321414',
        dayTop: '#4e2117',
        dayMid: '#6e331b',
        horizon: '#ff9f43',
        sunset: '#ffd36b',
        haze: '#ff8f3d',
        ground: '#2b1715',
      },
    }[biome] || {
      nightTop: '#070b18',
      nightMid: '#15162c',
      dayTop: '#1e315a',
      dayMid: '#34406b',
      horizon: '#a983ff',
      sunset: '#ffd36b',
      haze: '#a983ff',
      ground: '#111424',
    };
  }

  drawDistanceRings(ctx) {
    if (this.islandMode !== 'flight') return;
    const atmosphereFade = 1 - clamp01(((this.atmosphereStrength || 0) - 0.05) / 0.36) * 0.82;
    if (atmosphereFade <= 0.03) return;
    const maxDistance = gameBalance.mining.miniMapMaxDistance || RING_SIZE * 5;
    const ringCount = Math.ceil(maxDistance / RING_SIZE);
    const center = this.cameraView.worldToScreen(0, 0);
    const distance = this.distanceFromStation;
    const scale = Math.max(0.1, this.getActiveViewScale());
    ctx.save();
    ctx.lineWidth = Math.max(0.75, 1.35 / scale);
    ctx.font = `${Math.max(12, 13 / scale)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let ring = 1; ring <= ringCount; ring += 1) {
      const radius = ring * RING_SIZE;
      const distanceToRing = Math.abs(distance - radius);
      const closeAlpha = clamp01(1 - distanceToRing / 1600);
      const pulse = this.ringCrossingPulse > 0 && closeAlpha > 0.35
        ? Math.sin(this.ringCrossingPulse * 12) * 0.035 + 0.055
        : 0;
      const alpha = (0.028 + closeAlpha * 0.16 + pulse) * atmosphereFade;
      const color = this.getRingColor(ring);
      ctx.strokeStyle = `${color}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`;
      ctx.setLineDash(closeAlpha > 0.18 ? [] : [30 / scale, 34 / scale]);
      ctx.beginPath();
      ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
      ctx.stroke();

      if (closeAlpha > 0.28 && atmosphereFade > 0.5) {
        const shipAngle = Math.atan2(this.ship.y, this.ship.x);
        const label = this.cameraView.worldToScreen(Math.cos(shipAngle) * radius, Math.sin(shipAngle) * radius);
        ctx.setLineDash([]);
        ctx.fillStyle = `rgba(236, 231, 216, ${(0.22 + closeAlpha * 0.34) * atmosphereFade})`;
        ctx.fillText(`${Math.round(radius / 1000)}k circle`, label.x, label.y - 18 / scale);
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
    const visualAimPoint = this.getShipAimEndpoint();
    this.laserRenderer.drawRangeField(ctx, {
      camera: this.cameraView,
      ship: this.ship,
      radius: this.stats.miningRange,
      aimPoint: visualAimPoint,
      active: this.game.input.actions.mine,
      time: this.time,
    });
    this.laserRenderer.drawBeam(ctx, {
      camera: this.cameraView,
      ship: this.ship,
      target: this.laserTarget,
      aimPoint: visualAimPoint,
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
    const torchPlacementMode = this.isTorchToolSelected();
    const platformPlacementMode = this.isPlatformToolSelected() || this.isPlatformPlacerToolSelected();
    const doorPlacementMode = this.isDoorToolSelected();
    const furnacePlacementMode = this.isFurnaceToolSelected();
    const craftingStationPlacementMode = this.isCraftingStationToolSelected();
    const researchStationPlacementMode = this.isResearchStationToolSelected();
    const buildPlacementMode = this.isBuildToolSelected();
    const placementMode = flagPlacementMode
      || torchPlacementMode
      || platformPlacementMode
      || doorPlacementMode
      || furnacePlacementMode
      || craftingStationPlacementMode
      || researchStationPlacementMode
      || buildPlacementMode;
    const terrainToolMode = this.isMinerToolSelected() || placementMode || Boolean(this.islandMiningBeam);
    const minerSnapGridMode = Boolean(this.buildSnapCursorEnabled && this.isMinerToolSelected());
    const gridCursorMode = Boolean(this.buildSnapCursorEnabled && (buildPlacementMode || this.isMinerToolSelected()));
    const state = placementMode
      ? (
        flagPlacementMode
          ? (this.flagPlacementPreview || this.getFlagPlacementPreview())
          : torchPlacementMode
            ? (this.torchPlacementPreview || this.getTorchPlacementPreview())
            : platformPlacementMode
              ? (this.platformPlacementPreview || this.getPlatformPlacementPreview({ line: this.isPlatformPlacerToolSelected() }))
              : doorPlacementMode
                ? (this.doorPlacementPreview || this.getDoorPlacementPreview())
                : furnacePlacementMode
                  ? (this.furnacePlacementPreview || this.getFurnacePlacementPreview())
                  : craftingStationPlacementMode
                    ? (this.craftingStationPlacementPreview || this.getCraftingStationPlacementPreview())
                    : researchStationPlacementMode
                      ? (this.researchStationPlacementPreview || this.getResearchStationPlacementPreview())
                      : (this.buildPlacementPreview || this.game.systems.building?.getPreview?.(this))
      )
      : (terrainToolMode ? (this.islandAimPreview || this.islandMiningBeam || this.getIslandTerrainPreview({ updateFacing: false })) : null);
    if (state) {
      if (!gridCursorMode) {
        this.terrainLaserRenderer.drawRangeField(ctx, {
          worldToScreen: (x, y) => ({ x, y }),
          origin: state.origin,
          radius: state.range,
          aimPoint: state.aimPoint,
          active: Boolean(this.islandMiningBeam),
          time: this.time,
        });
      }
      if (minerSnapGridMode && state?.snapCursor) this.drawMinerSnapCursorPreview(ctx, state);
      if (!this.islandMiningBeam && !buildPlacementMode && !(minerSnapGridMode && state?.snapCursor)) {
        this.drawIslandTerrainTargetGlow(ctx, state);
      }
      if (flagPlacementMode) this.drawFlagPlacementPreview(ctx, state);
      if (torchPlacementMode) this.drawTorchPlacementPreview(ctx, state);
      if (platformPlacementMode) this.drawPlatformPlacementPreview(ctx, state);
      if (doorPlacementMode) this.drawDoorPlacementPreview(ctx, state);
      if (furnacePlacementMode) this.drawFurnacePlacementPreview(ctx, state);
      if (craftingStationPlacementMode) this.drawCraftingStationPlacementPreview(ctx, state);
      if (researchStationPlacementMode) this.drawResearchStationPlacementPreview(ctx, state);
      if (buildPlacementMode) this.game.systems.building?.drawPreview?.(ctx, state, this.time);
    }
    if (!gridCursorMode) this.drawControllerIslandAimIndicator(ctx);
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

  drawIslandCombatEffectsLocal(ctx) {
    if (!this.sword?.effects?.length && !this.laserGun?.effects?.length) return;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const effect of this.laserGun?.effects || []) this.drawLaserGunShotEffect(ctx, effect);
    for (const effect of this.sword.effects) {
      if (effect.kind === 'slash') this.drawSwordSlashEffect(ctx, effect);
      else if (effect.kind === 'spark') this.drawSwordSparkEffect(ctx, effect);
    }
    if (this.movementDebug.showHitboxes && this.sword.active) {
      const slash = this.sword.active;
      ctx.globalAlpha = 0.26;
      ctx.strokeStyle = '#ffd36b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(slash.origin.x, slash.origin.y);
      ctx.arc(slash.origin.x, slash.origin.y, slash.range, slash.aimAngle - slash.arc * 0.5, slash.aimAngle + slash.arc * 0.5);
      ctx.closePath();
      ctx.stroke();
    }
    ctx.restore();
  }

  getIslandGunOriginLocal() {
    if (!this.islandPlayer) return { x: 0, y: 0 };
    return {
      x: this.islandPlayer.centerX,
      y: this.islandPlayer.centerY - 5,
    };
  }

  getIslandPlayerAimScreenAngle() {
    if (!this.islandPlayer) return 0;
    const origin = this.getIslandGunOriginLocal();
    const aim = this.getIslandAimPoint();
    const dx = aim.x - origin.x;
    const dy = aim.y - origin.y;
    const rotation = this.getIslandViewRotation();
    const screenDx = dx * Math.cos(rotation) - dy * Math.sin(rotation);
    const screenDy = dx * Math.sin(rotation) + dy * Math.cos(rotation);
    if (Math.hypot(screenDx, screenDy) < 0.01) return this.islandPlayer.facing >= 0 ? 0 : Math.PI;
    return Math.atan2(screenDy, screenDx);
  }

  drawIslandPlayerEquipmentLocal(ctx) {
    if (!this.isLaserGunToolSelected() || !this.islandPlayer) return;
    this.drawLaserGunOnPlayer(ctx);
  }

  drawLaserGunOnPlayer(ctx) {
    const player = this.islandPlayer;
    const angle = this.getIslandPlayerAimScreenAngle();
    const torsoX = player.centerX + Math.cos(angle) * 4;
    const torsoY = player.centerY + 2 + Math.sin(angle) * 2;
    const craftedShape = this.getCraftedEquipmentShape('laserGun');
    if (craftedShape?.cells?.length) {
      this.drawCraftedEquipmentShapeOnPlayer(ctx, craftedShape, {
        x: torsoX,
        y: torsoY,
        angle,
        maxWidth: 35,
        maxHeight: 18,
        accent: '#6ee7ff',
      });
      return;
    }
    ctx.save();
    ctx.translate(torsoX, torsoY);
    ctx.rotate(angle);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.fillStyle = '#1c3448';
    ctx.strokeStyle = 'rgba(4, 10, 18, 0.78)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.roundRect(-5, -6, 28, 12, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#6ee7ff';
    ctx.beginPath();
    ctx.roundRect(4, -3, 12, 6, 3);
    ctx.fill();
    ctx.strokeStyle = 'rgba(110, 231, 255, 0.72)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(20, 0);
    ctx.lineTo(29, 0);
    ctx.stroke();
    ctx.fillStyle = '#bf8352';
    ctx.strokeStyle = 'rgba(4, 10, 18, 0.68)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(-1, 5, 8, 13, 3);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  getCraftedEquipmentShape(itemId) {
    const blueprint = this.getStoryState().equipmentBlueprints?.[itemId];
    return blueprint?.shape || null;
  }

  drawCraftedEquipmentShapeOnPlayer(ctx, shape, {
    x = 0,
    y = 0,
    angle = 0,
    maxWidth = 34,
    maxHeight = 18,
    accent = '#6ee7ff',
  } = {}) {
    const cells = shape?.cells || [];
    if (!cells.length) return;
    const xs = cells.map((cell) => cell.x);
    const ys = cells.map((cell) => cell.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const widthCells = maxX - minX + 1;
    const heightCells = maxY - minY + 1;
    const tile = Math.max(2.1, Math.min(
      maxWidth / Math.max(1, widthCells),
      maxHeight / Math.max(1, heightCells),
      4.2,
    ));
    const width = widthCells * tile;
    const height = heightCells * tile;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.translate(4 - width * 0.36, -height * 0.5);
    ctx.lineJoin = 'round';
    ctx.shadowColor = accent;
    ctx.shadowBlur = 7;
    for (const cell of cells) {
      const cx = (cell.x - minX) * tile;
      const cy = (cell.y - minY) * tile;
      const layers = Array.isArray(cell.layers) && cell.layers.length
        ? cell.layers
        : [cell.itemId || cell.materialId].filter(Boolean);
      const baseId = layers[0] || cell.itemId || cell.materialId;
      const topId = layers[layers.length - 1] || baseId;
      const baseVisual = this.getVoxelCraftMaterialVisual(baseId);
      const topVisual = this.getVoxelCraftMaterialVisual(topId);
      ctx.fillStyle = baseVisual.color || cell.color || '#a7adb4';
      ctx.strokeStyle = 'rgba(4, 10, 18, 0.72)';
      ctx.lineWidth = Math.max(0.65, tile * 0.16);
      ctx.beginPath();
      PlacedFurnace.traceVoxelCell(ctx, cx, cy, tile, cell.shapeState || cell.shape || 'full');
      ctx.fill();
      ctx.stroke();
      if (layers.length > 1) {
        ctx.fillStyle = topVisual.color || ctx.fillStyle;
        ctx.beginPath();
        ctx.roundRect(cx + tile * 0.24, cy + tile * 0.24, tile * 0.52, tile * 0.52, Math.max(1.2, tile * 0.18));
        ctx.fill();
      }
      if (layers.includes('fireCore')) {
        ctx.fillStyle = 'rgba(255, 244, 204, 0.78)';
        ctx.beginPath();
        ctx.arc(cx + tile * 0.5, cy + tile * 0.5, tile * 0.28, 0, Math.PI * 2);
        ctx.fill();
      }
      if (cell.detailId === 'bolts' || cell.shapeState === 'boltedPlate') {
        ctx.fillStyle = 'rgba(255, 242, 207, 0.46)';
        [[0.28, 0.28], [0.72, 0.28], [0.28, 0.72], [0.72, 0.72]].forEach(([px, py]) => {
          ctx.beginPath();
          ctx.arc(cx + tile * px, cy + tile * py, Math.max(0.45, tile * 0.06), 0, Math.PI * 2);
          ctx.fill();
        });
      }
      if (cell.detailId === 'glowingLines' || topId === 'copperIngot') {
        ctx.strokeStyle = `${accent}cc`;
        ctx.lineWidth = Math.max(0.7, tile * 0.12);
        ctx.beginPath();
        ctx.moveTo(cx + tile * 0.22, cy + tile * 0.5);
        ctx.lineTo(cx + tile * 0.78, cy + tile * 0.5);
        ctx.stroke();
      }
    }
    ctx.shadowBlur = 0;
    ctx.strokeStyle = `${accent}dd`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(width + 1, height * 0.5);
    ctx.lineTo(width + 9, height * 0.5);
    ctx.stroke();
    ctx.restore();
  }

  drawLaserGunShotEffect(ctx, effect) {
    const progress = clamp01(effect.age / Math.max(0.001, effect.life));
    const fade = 1 - progress;
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.strokeStyle = effect.hit ? 'rgba(110, 231, 255, 0.96)' : 'rgba(110, 231, 255, 0.56)';
    ctx.lineWidth = effect.hit ? 7 : 5;
    ctx.shadowColor = '#6ee7ff';
    ctx.shadowBlur = effect.hit ? 16 : 9;
    ctx.beginPath();
    ctx.moveTo(effect.origin.x, effect.origin.y);
    ctx.lineTo(effect.end.x, effect.end.y);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(effect.origin.x, effect.origin.y);
    ctx.lineTo(effect.end.x, effect.end.y);
    ctx.stroke();
    if (effect.hit) {
      ctx.fillStyle = 'rgba(110, 231, 255, 0.55)';
      ctx.beginPath();
      ctx.arc(effect.end.x, effect.end.y, 10 + progress * 8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawSwordSlashEffect(ctx, effect) {
    const progress = clamp01(effect.age / Math.max(0.001, effect.life));
    const sweep = Math.sin(Math.min(1, progress * 1.35) * Math.PI * 0.5);
    const fade = Math.max(0, 1 - progress);
    const arc = effect.arc * (0.62 + sweep * 0.38);
    const start = effect.aimAngle - arc * 0.5;
    const end = effect.aimAngle + arc * 0.5;
    const range = effect.range * (0.86 + sweep * 0.14);
    ctx.save();
    ctx.globalAlpha = fade * (effect.beat === 3 ? 0.92 : 0.74);
    ctx.shadowColor = effect.beat === 3 ? '#ffd36b' : '#8ee8ff';
    ctx.shadowBlur = effect.beat === 3 ? 18 : 10;
    ctx.strokeStyle = effect.beat === 3 ? 'rgba(255, 211, 107, 0.98)' : 'rgba(142, 232, 255, 0.9)';
    ctx.lineWidth = effect.beat === 3 ? 18 : 13;
    ctx.beginPath();
    ctx.arc(effect.origin.x, effect.origin.y, range, start, end);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.globalAlpha *= 0.9;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.lineWidth = effect.beat === 3 ? 5 : 3.5;
    ctx.beginPath();
    ctx.arc(effect.origin.x, effect.origin.y, range, start, end);
    ctx.stroke();
    ctx.restore();
  }

  drawSwordSparkEffect(ctx, effect) {
    const progress = clamp01(effect.age / Math.max(0.001, effect.life));
    const fade = 1 - progress;
    ctx.save();
    ctx.translate(effect.x, effect.y);
    ctx.globalAlpha = fade;
    ctx.strokeStyle = effect.color || '#fff2cf';
    ctx.lineWidth = effect.beat === 3 ? 2.4 : 1.6;
    const rays = effect.beat === 3 ? 9 : 6;
    for (let index = 0; index < rays; index += 1) {
      const angle = (index / rays) * Math.PI * 2 + this.time * 0.6;
      const inner = 4 + progress * 5;
      const outer = (effect.beat === 3 ? 28 : 18) * fade + inner;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
      ctx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawPlanetMovementDebug(ctx) {
    if (!this.activeIsland || !this.islandPlayer) return;
    const debug = this.movementDebug;
    if (!debug.showGroundProbes && !debug.showTerrainNormal && !debug.showVelocity && !debug.showGroundedState && !debug.showSurfaceTangent && !debug.showHitboxes) return;
    const player = this.islandPlayer;
    const basis = this.getIslandGravityBasis(this.activeIsland);
    const groundedProbe = this.isPlanetPlayerGrounded(player, this.activeIsland, basis);
    const footX = player.centerX + basis.inward.x * PLANET_PLAYER_FOOT_OFFSET;
    const footY = player.centerY + basis.inward.y * PLANET_PLAYER_FOOT_OFFSET;
    ctx.save();
    if (debug.showHitboxes) {
      const shape = this.getPlanetPlayerCollisionShape(player, this.activeIsland);
      ctx.strokeStyle = player.onGround ? 'rgba(118, 243, 255, 0.9)' : 'rgba(255, 117, 111, 0.86)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      shape.corners.forEach((corner, index) => {
        if (index === 0) ctx.moveTo(corner.x, corner.y);
        else ctx.lineTo(corner.x, corner.y);
      });
      ctx.closePath();
      ctx.stroke();
    }
    if (debug.showGroundProbes) {
      ctx.fillStyle = 'rgba(255, 211, 107, 0.92)';
      for (const point of this.getPlanetPlayerFootProbePoints(player, this.activeIsland, player.x, player.y, basis)) {
        ctx.beginPath();
        ctx.arc(point.x, point.y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (debug.showTerrainNormal || debug.showSurfaceTangent || debug.showGroundedState) {
      ctx.lineWidth = 2;
      if (debug.showTerrainNormal) {
        ctx.strokeStyle = 'rgba(126, 227, 109, 0.95)';
        ctx.beginPath();
        ctx.moveTo(footX, footY);
        ctx.lineTo(footX + basis.outward.x * 42, footY + basis.outward.y * 42);
        ctx.stroke();
      }
      if (debug.showSurfaceTangent) {
        ctx.strokeStyle = 'rgba(142, 232, 255, 0.95)';
        ctx.beginPath();
        ctx.moveTo(footX - basis.tangent.x * 32, footY - basis.tangent.y * 32);
        ctx.lineTo(footX + basis.tangent.x * 32, footY + basis.tangent.y * 32);
        ctx.stroke();
      }
      if (debug.showGroundedState) {
        ctx.fillStyle = groundedProbe ? 'rgba(126, 227, 109, 0.9)' : 'rgba(255, 117, 111, 0.85)';
        ctx.beginPath();
        ctx.arc(footX, footY, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (debug.showVelocity) {
      ctx.strokeStyle = 'rgba(255, 117, 111, 0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(player.centerX, player.centerY);
      ctx.lineTo(player.centerX + player.vx * 0.12, player.centerY + player.vy * 0.12);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawLandingTargetPreview(ctx) {
    const target = this.islandMode === 'landing' ? this.islandLandingTarget : this.landingTargetPreview;
    if (!target?.island || !target.hit || this.islandMode === 'onIsland' || this.islandMode === 'boarding') return;
    const island = target.island;
    const viewRotation = island === this.activeIsland
      ? this.getIslandViewRotation()
      : (island === this.atmosphereIsland ? this.atmosphereViewRotation : 0);
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
    const normalX = Math.cos(target.angle);
    const normalY = Math.sin(target.angle);
    ctx.save();
    island.terrain?.drawCellTargetGlow(ctx, hit, this.time, { brushRadius: 0 });

    ctx.setLineDash([]);
    ctx.globalAlpha = 0.78;
    ctx.strokeStyle = 'rgba(118, 243, 255, 0.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(hit.x + normalX * size * 0.62, hit.y + normalY * size * 0.62);
    ctx.lineTo(hit.x + normalX * size * 2.3, hit.y + normalY * size * 2.3);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255, 211, 107, 0.95)';
    ctx.beginPath();
    ctx.arc(hit.x + normalX * size * 2.45, hit.y + normalY * size * 2.45, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawIslandTerrainTargetGlow(ctx, state) {
    if (!state?.hit || !this.activeIsland?.terrain) return;
    this.activeIsland.terrain.drawCellTargetGlow(ctx, state.hit, this.time, {
      brushRadius: TERRAIN_MINING_BRUSH_RADIUS,
    });
  }

  drawMinerSnapCursorPreview(ctx, state) {
    const terrain = this.activeIsland?.terrain;
    const target = state?.target || (state?.hit ? { col: state.hit.col, row: state.hit.row } : null);
    const building = this.game.systems.building;
    if (!terrain || !target || !building) return;
    const canMine = state.hit ? this.canMineTerrainMaterial(state.hit.material) : false;
    const rgb = canMine ? { r: 118, g: 243, b: 255 } : { r: 255, g: 117, b: 111 };
    building.drawSnapCursorGrid?.(ctx, { terrain, target, snapCursor: true }, this.time);
    building.drawSnapCursorFrame?.(ctx, terrain, target.col, target.row, rgb, canMine);
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

  drawTorchPlacementPreview(ctx, state) {
    if (!state || !this.activeIsland?.terrain) return;
    const normal = state.normal || { x: 0, y: -1 };
    const torchX = Number.isFinite(state.x) ? state.x : (state.hit?.x || 0) + normal.x * 4;
    const torchY = Number.isFinite(state.y) ? state.y : (state.hit?.y || 0) + normal.y * 4;
    const ready = Boolean(state.valid);
    if (state.hit) {
      this.activeIsland.terrain.drawCellTargetGlow(ctx, state.hit, this.time, { brushRadius: 0 });
    } else if (Number.isInteger(state.supportCol) && Number.isInteger(state.supportRow)) {
      const rgb = ready ? { r: 255, g: 180, b: 95 } : { r: 255, g: 117, b: 111 };
      this.game.systems.building?.drawSnapCursorFrame?.(
        ctx,
        this.activeIsland.terrain,
        state.supportCol,
        state.supportRow,
        rgb,
        ready,
      );
    }
    ctx.save();
    ctx.globalAlpha = state.supportSide === 'back' ? (ready ? 0.42 : 0.25) : (ready ? 0.52 : 0.3);
    ctx.strokeStyle = ready ? 'rgba(255, 180, 95, 0.88)' : 'rgba(255, 117, 111, 0.7)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 7]);
    ctx.lineDashOffset = -this.time * 22;
    const size = this.activeIsland.terrain.cellSize || 25;
    const previewOffset = state.supportSide === 'back' ? 0 : size * 0.35;
    const previewRadius = state.supportSide === 'back' ? size * 0.46 : size * 0.58;
    ctx.beginPath();
    ctx.arc(torchX + normal.x * previewOffset, torchY + normal.y * previewOffset, previewRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    PlacedTorch.drawGhost(ctx, {
      x: torchX,
      y: torchY,
      rotation: state.rotation ?? getTorchRotationForSupport(state.supportSide),
      time: this.time,
      color: ready ? '#ff9f43' : '#ff756f',
      accent: '#ffd36b',
      supportSide: state.supportSide || 'top',
    });
  }

  drawPlatformPlacementPreview(ctx, state) {
    if (!state?.tiles?.length || !this.activeIsland?.terrain) return;
    const terrain = this.activeIsland.terrain;
    const basis = this.getIslandGravityBasis(this.activeIsland);
    const angle = Math.atan2(basis.tangent.y, basis.tangent.x);
    const size = terrain.cellSize || 25;
    ctx.save();
    state.tiles.forEach((tile) => {
      const platform = new PlacedPlatform({
        col: tile.col,
        row: tile.row,
        x: tile.center.x,
        y: tile.center.y,
        angle,
        length: size * 0.96,
        thickness: Math.max(5, size * 0.22),
        color: '#a9c7d8',
        edge: '#273647',
      });
      platform.draw(ctx, { time: this.time, ghost: true, valid: tile.valid });
    });
    if (state.snapCursor && state.tiles[0]) {
      const tile = state.tiles[0];
      const rgb = tile.valid ? { r: 126, g: 231, b: 255 } : { r: 255, g: 117, b: 111 };
      this.game.systems.building?.drawSnapCursorFrame?.(ctx, terrain, tile.col, tile.row, rgb, tile.valid);
    }
    ctx.restore();
  }

  drawDoorPlacementPreview(ctx, state) {
    if (!state || !this.activeIsland?.terrain) return;
    const terrain = this.activeIsland.terrain;
    ctx.save();
    PlacedDoor.drawGhost(ctx, {
      x: (state.col + 0.5) * (terrain.cellSize || 25),
      y: (state.topRow + DOOR_HEIGHT_TILES * 0.5) * (terrain.cellSize || 25),
      width: (terrain.cellSize || 25) * 0.78,
      height: (terrain.cellSize || 25) * DOOR_HEIGHT_TILES,
      tileSize: terrain.cellSize || 25,
      color: '#9fafbd',
      edge: '#26313d',
      accent: '#76f3ff',
      time: this.time,
      valid: state.valid,
    });
    const rgb = state.valid ? { r: 126, g: 231, b: 255 } : { r: 255, g: 117, b: 111 };
    for (let row = state.topRow; row < state.topRow + DOOR_HEIGHT_TILES; row += 1) {
      if (terrain.isInside(state.col, row)) {
        this.game.systems.building?.drawSnapCursorFrame?.(ctx, terrain, state.col, row, rgb, state.valid);
      }
    }
    ctx.restore();
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
      tileSize: blueprint.shape?.tileSize || Math.max(7, Math.round((this.activeIsland.terrain?.cellSize || 22) / 3)),
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
      compact: true,
      time: this.time,
      color: ready ? '#76f3ff' : '#ff756f',
      accent: '#ffd36b',
    });
  }

  drawResearchStationPlacementPreview(ctx, state) {
    if (!state?.hit || !this.activeIsland?.terrain) return;
    const story = this.getStoryState();
    const viewRotation = this.getIslandViewRotation();
    const outwardAngle = -Math.PI / 2 - viewRotation;
    const outward = { x: Math.cos(outwardAngle), y: Math.sin(outwardAngle) };
    const tangent = { x: -outward.y, y: outward.x };
    const stationX = state.hit.x + outward.x * 4;
    const stationY = state.hit.y + outward.y * 4;
    const ready = Boolean(!story.researchStationPlaced && this.game.systems.inventory.getStoredAmount('researchStationKit') > 0);
    ctx.save();
    ctx.globalAlpha = ready ? 0.78 : 0.42;
    ctx.strokeStyle = ready ? 'rgba(183, 148, 255, 0.96)' : 'rgba(255, 117, 111, 0.82)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.setLineDash([13, 10]);
    ctx.lineDashOffset = -this.time * 22;
    ctx.beginPath();
    ctx.moveTo(state.hit.x - tangent.x * 118 * 0.5, state.hit.y - tangent.y * 118 * 0.5);
    ctx.lineTo(state.hit.x + tangent.x * 118 * 0.5, state.hit.y + tangent.y * 118 * 0.5);
    ctx.stroke();
    ctx.restore();

    PlacedResearchStation.drawGhost(ctx, {
      x: stationX,
      y: stationY,
      viewRotation,
      compact: true,
      time: this.time,
      color: ready ? '#b794ff' : '#ff756f',
      accent: '#76f3ff',
    });
  }

  drawMouseAimReticle(ctx) {
    if (this.islandMode === 'onIsland') return;
    this.laserRenderer.drawAimReticle(ctx, {
      camera: this.cameraView,
      mouseAimWorld: this.getShipAimEndpoint() || this.mouseAimWorld,
      mouseAimTarget: this.mouseAimTarget,
      snapRadius: gameBalance.mining.mouseAimSnapRadius || 18,
      time: this.time,
      inputMode: document.documentElement.dataset.inputMode,
    });
  }

  isControllerAimIndicatorActive() {
    if (this.buildSnapCursorEnabled && (this.isBuildToolSelected() || this.isMinerToolSelected())) return false;
    if (!this.isControllerPromptMode()) return false;
    if (this.islandMode === 'onIsland') return Boolean(this.getControllerIslandAimVector());
    const aim = this.game.input.aimVector || { x: 0, y: 0 };
    return Math.hypot(aim.x, aim.y) > 0.12;
  }

  drawControllerShipAimIndicator(ctx) {
    if (!this.isControllerAimIndicatorActive()) return;
    const aimWorld = this.getControllerShipAimWorld();
    if (!aimWorld) return;
    const start = this.cameraView.worldToScreen(this.ship.x, this.ship.y);
    const endpoint = this.getShipAimEndpoint() || aimWorld;
    const end = this.cameraView.worldToScreen(endpoint.x, endpoint.y);
    this.drawControllerAimBall(ctx, start, end, { subtle: true, showDot: false });
  }

  getCurrentTerrainToolPreview() {
    if (this.isMinerToolSelected()) {
      return this.islandMiningBeam
        || this.islandAimPreview
        || this.getIslandTerrainPreview({ updateFacing: false });
    }
    if (this.isFlagToolSelected()) return this.flagPlacementPreview || this.getFlagPlacementPreview();
    if (this.isTorchToolSelected()) return this.torchPlacementPreview || this.getTorchPlacementPreview();
    if (this.isPlatformToolSelected() || this.isPlatformPlacerToolSelected()) {
      return this.platformPlacementPreview || this.getPlatformPlacementPreview({ line: this.isPlatformPlacerToolSelected() });
    }
    if (this.isDoorToolSelected()) return this.doorPlacementPreview || this.getDoorPlacementPreview();
    if (this.isFurnaceToolSelected()) return this.furnacePlacementPreview || this.getFurnacePlacementPreview();
    if (this.isCraftingStationToolSelected()) return this.craftingStationPlacementPreview || this.getCraftingStationPlacementPreview();
    if (this.isResearchStationToolSelected()) return this.researchStationPlacementPreview || this.getResearchStationPlacementPreview();
    if (this.isBuildToolSelected()) return this.buildPlacementPreview || this.game.systems.building?.getPreview?.(this);
    return null;
  }

  drawControllerIslandAimIndicator(ctx) {
    if (!this.isControllerAimIndicatorActive() || !this.islandPlayer) return;
    const direction = this.getControllerIslandAimVector();
    if (
      direction?.source === 'move'
      && !this.isTerrainToolSelected()
      && !this.isWeaponToolSelected()
      && !this.isLaserGunToolSelected()
    ) return;
    if (this.isTerrainToolSelected()) {
      const state = this.getCurrentTerrainToolPreview();
      if (!state?.origin || !state?.end) return;
      this.drawControllerAimBall(ctx, state.origin, state.end, {
        subtle: true,
        showDot: false,
        magnitudeOverride: direction?.magnitude,
      });
      return;
    }
    const aimPoint = this.getControllerIslandAimPoint();
    if (!aimPoint) return;
    const start = {
      x: this.islandPlayer.centerX,
      y: this.islandPlayer.centerY - 7,
    };
    this.drawControllerAimBall(ctx, start, aimPoint, {
      subtle: true,
      showDot: false,
      magnitudeOverride: direction?.magnitude,
    });
  }

  drawControllerAimBall(ctx, start, end, { subtle = false, showDot = true, magnitudeOverride = null } = {}) {
    const aim = this.game.input.aimVector || { x: 0, y: 0 };
    const magnitude = magnitudeOverride ?? clamp01(Math.hypot(aim.x, aim.y));
    const pulse = 1 + Math.sin(this.time * 9) * 0.08;
    const lineAlpha = subtle ? 0.54 : 0.72;
    const ringAlpha = subtle ? 0.62 : 0.58;
    const ringRadius = subtle ? 9 + magnitude * 6 : 15 + magnitude * 8;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = lineAlpha;
    ctx.strokeStyle = subtle ? 'rgba(118, 243, 255, 0.44)' : 'rgba(118, 243, 255, 0.38)';
    ctx.lineWidth = subtle ? 1.65 : 2;
    ctx.setLineDash(subtle ? [5, 9] : [8, 8]);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    ctx.setLineDash([]);
    if (showDot) {
      ctx.globalAlpha = 0.92;
      ctx.fillStyle = 'rgba(118, 243, 255, 0.82)';
      ctx.strokeStyle = 'rgba(9, 20, 34, 0.74)';
      ctx.lineWidth = 2.2;
      ctx.shadowColor = '#76f3ff';
      ctx.shadowBlur = 13;
      ctx.beginPath();
      ctx.arc(end.x, end.y, (5.5 + magnitude * 4.5) * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = ringAlpha;
    ctx.strokeStyle = subtle ? 'rgba(157, 242, 255, 0.9)' : 'rgba(255, 255, 255, 0.74)';
    ctx.lineWidth = subtle ? 1.45 : 1.2;
    ctx.beginPath();
    ctx.arc(end.x, end.y, ringRadius * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
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
