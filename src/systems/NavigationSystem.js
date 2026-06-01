import { locations } from '../data/locations.js?v=116';
import { gpsUnlockCost, scannerUpgrades } from '../data/scannerUpgrades.js?v=116';
import { gameBalance } from '../data/gameBalance.js?v=116';

export class NavigationSystem {
  constructor(game, islandSystem = null) {
    this.game = game;
    this.islandSystem = islandSystem;
    this.locations = this.createLocations();
    this.upgrades = scannerUpgrades;
  }

  refreshLocations() {
    this.locations = this.createLocations();
    return this.locations;
  }

  createLocations() {
    const merged = new Map(
      locations
        .filter((location) => location.id !== 'station' || gameBalance.stationEnabled !== false)
        .map((location) => [location.id, { ...location }]),
    );
    const islands = this.islandSystem?.getAllIslands?.() || [];
    islands.forEach((island) => {
      if (!island?.id || island.id === 'crashPlanet') return;
      const existing = merged.get(island.id) || {};
      merged.set(island.id, {
        ...existing,
        id: island.id,
        tag: island.tag || island.planetTag || existing.tag || '',
        planetTag: island.tag || island.planetTag || existing.planetTag || '',
        name: island.name || existing.name || 'Unknown Island',
        type: island.kind === 'story' ? 'story' : 'island',
        worldPosition: { ...island.worldPosition },
        discovered: Boolean(island.discovered || existing.discovered),
        dangerLevel: island.dangerLevel ?? existing.dangerLevel ?? 1,
        recommendedFuel: existing.recommendedFuel || Math.max(48, Math.round(Math.hypot(island.worldPosition.x, island.worldPosition.y) / 155)),
        description: island.description || existing.description || 'A drifting planetoid with a breathable pocket of atmosphere.',
        resources: island.resources?.length ? [...island.resources] : (existing.resources || []),
        icon: existing.icon || 'IS',
        requiredScannerLevel: island.requiredScannerLevel || existing.requiredScannerLevel || 1,
        biome: island.biome || existing.biome || 'scrap',
        canSetDestination: true,
      });
    });
    const baseLocation = this.getBaseLocationFromIslands(islands);
    if (baseLocation) merged.set(baseLocation.id, baseLocation);
    return [...merged.values()];
  }

  getBaseLocationFromIslands(islands = this.islandSystem?.getAllIslands?.() || []) {
    const base = this.game.state.base || {};
    if (!base.established || !base.islandId) return null;
    const island = islands.find((entry) => entry.id === base.islandId);
    if (!island) return null;
    const local = base.local || null;
    const size = island.size || { width: 0, height: 0 };
    const worldPosition = local
      ? {
        x: island.worldPosition.x - size.width / 2 + local.x,
        y: island.worldPosition.y - size.height / 2 + local.y,
      }
      : { ...island.worldPosition };
    return {
      id: 'base',
      name: `${island.tag || island.planetTag || 'Base'} Field Base`,
      type: 'base',
      tag: 'BASE',
      planetTag: island.tag || island.planetTag || '',
      worldPosition,
      discovered: true,
      dangerLevel: island.dangerLevel || 1,
      recommendedFuel: 0,
      description: 'Your current flagged field base. Move the flag to make another planet home.',
      resources: island.resources || [],
      icon: 'B',
      requiredScannerLevel: 0,
      biome: island.biome || 'scrap',
      canSetDestination: true,
    };
  }

  get state() {
    this.game.state.navigation ||= {};
    this.game.state.navigation.gpsUnlocked ||= false;
    this.game.state.navigation.scannerLevel ||= this.game.state.navigation.gpsUnlocked ? 1 : 0;
    this.game.state.navigation.discoveredLocations ||= {};
    this.game.state.navigation.scannerUpgrades ||= {};
    this.locations.forEach((location) => {
      if (location.discovered && this.game.state.navigation.discoveredLocations[location.id] === undefined) {
        this.game.state.navigation.discoveredLocations[location.id] = true;
      }
    });
    return this.game.state.navigation;
  }

  isUnlocked() {
    return Boolean(this.state.gpsUnlocked);
  }

  getScannerLevel() {
    return this.state.scannerLevel || 0;
  }

  getUnlockCost() {
    return gpsUnlockCost;
  }

  canUnlock() {
    return !this.isUnlocked() && this.game.systems.economy.canAfford(gpsUnlockCost);
  }

  unlock() {
    if (this.isUnlocked()) return { ok: true, alreadyUnlocked: true };
    if (!this.game.systems.economy.spendCost(gpsUnlockCost, { save: false })) {
      return { ok: false, reason: 'missing-cost' };
    }
    this.state.gpsUnlocked = true;
    this.state.scannerLevel = Math.max(1, this.state.scannerLevel || 0);
    this.state.scannerUpgrades.level1 = true;
    this.game.audio.playPurchase();
    this.game.ui.showToast('GPS repaired. Star map online.', 'success');
    this.game.saveGame();
    return { ok: true };
  }

  getNextUpgrade() {
    const nextLevel = this.getScannerLevel() + 1;
    return this.upgrades.find((upgrade) => upgrade.level === nextLevel) || null;
  }

  upgradeScanner() {
    if (!this.isUnlocked()) return { ok: false, reason: 'locked' };
    const upgrade = this.getNextUpgrade();
    if (!upgrade) return { ok: false, reason: 'max-level' };
    if (!this.game.systems.economy.spendCost(upgrade.cost, { save: false })) {
      return { ok: false, reason: 'missing-cost', upgrade };
    }
    this.state.scannerLevel = upgrade.level;
    this.state.scannerUpgrades[`level${upgrade.level}`] = true;
    this.game.audio.playPurchase();
    this.game.ui.showToast(`${upgrade.name} installed`, 'success');
    this.game.saveGame();
    return { ok: true, upgrade };
  }

  getLocations({ tab = 'locations', includeLocked = false } = {}) {
    const level = this.getScannerLevel();
    return this.locations.filter((location) => {
      if (!includeLocked && location.requiredScannerLevel > level) return false;
      if (tab === 'resources') return location.type === 'resource';
      if (tab === 'islands') return location.type === 'island';
      if (tab === 'wrecks') return location.type === 'wreck';
      if (tab === 'story') return location.type === 'story';
      if (tab === 'base') return location.type === 'base';
      return true;
    });
  }

  isDiscovered(locationId) {
    return Boolean(this.state.discoveredLocations?.[locationId]);
  }

  discoverLocation(locationId, { notify = true, save = true } = {}) {
    const location = this.getLocation(locationId);
    if (!location || this.isDiscovered(locationId)) return false;
    this.state.discoveredLocations[locationId] = true;
    if (notify) {
      const label = location.tag ? `${location.tag} ${location.name}` : location.name;
      this.game.ui.showToast(`Discovered: ${label}`, 'success', 2200);
      this.game.audio.playRareFind();
    }
    if (save) this.game.saveGame();
    return true;
  }

  getLocation(locationId) {
    if (locationId === 'base') {
      const base = this.getBaseLocationFromIslands();
      if (base) return base;
    }
    return this.locations.find((location) => location.id === locationId) || null;
  }

  getSelectedDestination() {
    const destination = this.getLocation(this.state.selectedDestinationId);
    if (!destination) return null;
    if (!destination.canSetDestination) return null;
    return destination;
  }

  setDestination(locationId) {
    if (!this.isUnlocked()) return false;
    const location = this.getLocation(locationId);
    if (!location || !location.canSetDestination || location.requiredScannerLevel > this.getScannerLevel()) return false;
    this.state.selectedDestinationId = locationId;
    this.discoverLocation(locationId, { notify: false, save: false });
    this.game.audio.playDestinationSet?.();
    this.game.ui.showToast(`Destination set: ${location.tag ? `${location.tag} ` : ''}${location.name}`, 'success');
    this.game.saveGame();
    return true;
  }

  clearDestination() {
    this.state.selectedDestinationId = null;
    this.game.audio.playGpsPing?.();
    this.game.saveGame();
  }

  findNearestByResource(resourceId, origin = { x: 0, y: 0 }, { type = null } = {}) {
    const candidates = this.getLocations({ tab: 'locations' })
      .filter((location) => this.isDiscovered(location.id) || location.requiredScannerLevel <= this.getScannerLevel())
      .filter((location) => !type || location.type === type)
      .filter((location) => location.resources?.includes(resourceId) || (resourceId === 'rockIsland' && location.type === 'island'));
    return candidates
      .map((location) => ({
        location,
        distanceSq: (location.worldPosition.x - origin.x) ** 2 + (location.worldPosition.y - origin.y) ** 2,
      }))
      .sort((a, b) => a.distanceSq - b.distanceSq)[0]?.location || null;
  }

  setNearestResourceDestination(resourceId, origin = { x: 0, y: 0 }) {
    const type = resourceId === 'rockIsland' ? 'island' : null;
    const location = this.findNearestByResource(resourceId, origin, { type });
    if (!location) return false;
    return this.setDestination(location.id);
  }

  getDistanceTo(location, position = { x: 0, y: 0 }) {
    const dx = location.worldPosition.x - position.x;
    const dy = location.worldPosition.y - position.y;
    return Math.hypot(dx, dy);
  }
}
