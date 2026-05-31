import { locations } from '../data/locations.js?v=93';
import { gpsUnlockCost, scannerUpgrades } from '../data/scannerUpgrades.js?v=93';

export class NavigationSystem {
  constructor(game) {
    this.game = game;
    this.locations = locations;
    this.upgrades = scannerUpgrades;
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
      this.game.ui.showToast(`Discovered: ${location.name}`, 'success', 2200);
      this.game.audio.playRareFind();
    }
    if (save) this.game.saveGame();
    return true;
  }

  getLocation(locationId) {
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
    this.game.ui.showToast(`Destination set: ${location.name}`, 'success');
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
