import { upgrades } from '../data/upgrades.js?v=133';
import { gameBalance } from '../data/gameBalance.js?v=133';

export class UpgradeSystem {
  constructor(game) {
    this.game = game;
    this.upgrades = upgrades;
    this.computedStats = this.computeStats();
  }

  getUpgrade(upgradeId) {
    return this.upgrades.find((entry) => entry.id === upgradeId);
  }

  getByCategory(categoryId) {
    return this.upgrades.filter((upgrade) => upgrade.category === categoryId);
  }

  getLevel(upgradeId) {
    const level = this.game.state.upgrades?.[upgradeId];
    return Number.isFinite(level) ? level : 0;
  }

  getNextCost(upgradeId) {
    const upgrade = this.getUpgrade(upgradeId);
    if (!upgrade) return null;
    const level = this.getLevel(upgradeId);
    if (level >= upgrade.maxLevel) return null;
    return upgrade.costs[level] || upgrade.costs.at(-1) || {};
  }

  getPurchaseState(upgradeId) {
    const upgrade = this.getUpgrade(upgradeId);
    if (!upgrade) return { ok: false, missing: [{ label: 'Unknown upgrade' }] };
    const level = this.getLevel(upgradeId);
    const maxed = level >= upgrade.maxLevel;
    const cost = this.getNextCost(upgradeId);
    const missing = maxed ? [] : [
      ...this.getMissingCost(cost),
      ...this.getMissingRequirements(upgrade.requirements),
    ];
    return {
      ok: !maxed && missing.length === 0,
      maxed,
      level,
      nextLevel: Math.min(level + 1, upgrade.maxLevel),
      cost,
      missing,
      preview: this.getStatPreview(upgrade),
      upgrade,
    };
  }

  canAfford(upgradeId) {
    return this.getPurchaseState(upgradeId).ok;
  }

  purchase(upgradeId) {
    const state = this.getPurchaseState(upgradeId);
    if (!state.ok) return { ok: false, reason: state.maxed ? 'maxed' : 'requirements', state };

    this.spendCost(state.cost);
    this.game.state.upgrades = { ...(this.game.state.upgrades || {}) };
    this.game.state.upgrades[upgradeId] = state.level + 1;
    this.applyUpgrades({ refuel: true, repair: true });
    this.game.systems.objectives.record('upgradePurchased', { upgradeId, level: state.level + 1 });
    this.game.systems.achievements.record('upgradePurchased', { upgradeId });
    this.game.saveGame();
    return { ok: true, state: this.getPurchaseState(upgradeId), purchasedLevel: state.level + 1 };
  }

  spendCost(cost = {}) {
    return this.game.systems.economy.spendCost(cost, { save: false });
  }

  getMissingCost(cost = {}) {
    const missing = [];
    if ((cost.credits || 0) > this.game.state.credits) {
      missing.push({ type: 'credits', label: 'Credits', needed: cost.credits, owned: this.game.state.credits });
    }
    if ((cost.researchPoints || 0) > (this.game.state.researchPoints || 0)) {
      missing.push({ type: 'researchPoints', label: 'Research', needed: cost.researchPoints, owned: this.game.state.researchPoints || 0 });
    }
    Object.entries(cost.materials || {}).forEach(([materialId, needed]) => {
      const owned = this.game.systems.inventory.getStoredAmount(materialId);
      if (owned < needed) {
        missing.push({
          type: 'material',
          materialId,
          label: this.game.systems.materials.getDisplayName(materialId),
          needed,
          owned,
        });
      }
    });
    return missing;
  }

  getMissingRequirements(requirements = {}) {
    const missing = [];
    Object.entries(requirements.upgrades || {}).forEach(([upgradeId, neededLevel]) => {
      if (this.getLevel(upgradeId) < neededLevel) {
        missing.push({ type: 'upgrade', label: `${this.getUpgrade(upgradeId)?.name || upgradeId} Lv ${neededLevel}` });
      }
    });
    (requirements.research || []).forEach((researchId) => {
      if (!this.game.systems.research.isUnlocked(researchId)) {
        missing.push({ type: 'research', label: this.game.systems.research.getNode(researchId)?.name || researchId });
      }
    });
    return missing;
  }

  applyUpgrades({ refuel = false, repair = false } = {}) {
    const previousShip = this.game.state.ship || {};
    const stats = this.computeStats();
    this.computedStats = stats;

    const maxFuel = Math.round(stats.ship.maxFuel);
    const maxHull = Math.round(stats.ship.maxHull);
    this.game.state.ship = {
      ...previousShip,
      ...stats.ship,
      maxFuel,
      maxHull,
      cargoMax: Math.round(stats.ship.cargoMax),
      miningRange: Math.round(stats.ship.miningRange),
      fuel: refuel ? maxFuel : Math.min(previousShip.fuel ?? maxFuel, maxFuel),
      hull: repair ? maxHull : Math.min(previousShip.hull ?? maxHull, maxHull),
      cargo: previousShip.cargo || 0,
    };
    this.game.state.station = {
      ...(this.game.state.station || {}),
      ...stats.station,
      storageMax: Math.round(stats.station.storageMax),
    };
    this.game.state.mining = { ...stats.mining };
    return stats;
  }

  computeStats(extraLevels = {}) {
    const stats = {
      ship: { ...gameBalance.shipBaseStats },
      station: { ...gameBalance.stationBaseStats },
      mining: {},
    };

    this.upgrades.forEach((upgrade) => {
      const level = Math.min(upgrade.maxLevel, this.getLevel(upgrade.id) + (extraLevels[upgrade.id] || 0));
      for (let index = 0; index < level; index += 1) {
        upgrade.effects.forEach((effect) => this.applyEffect(stats, effect, index));
      }
    });

    stats.mining.collectionMagnet = stats.ship.collectionMagnet || 0;
    stats.mining.rareScanner = stats.ship.rareScanner || 0;
    stats.mining.precisionCutter = stats.ship.precisionCutter || 0;
    return stats;
  }

  applyEffect(stats, effect, levelIndex = 0) {
    const value = Array.isArray(effect.value) ? effect.value[levelIndex] ?? effect.value.at(-1) : effect.value;
    const current = this.getNested(stats, effect.target);
    if (effect.mode === 'set') this.setNested(stats, effect.target, value);
    else this.setNested(stats, effect.target, (Number(current) || 0) + value);
  }

  getStatPreview(upgrade) {
    const current = this.computeStats();
    const next = this.computeStats({ [upgrade.id]: 1 });
    return upgrade.effects.map((effect) => ({
      label: effect.label,
      current: this.formatStatValue(this.getNested(current, effect.target), effect),
      next: this.formatStatValue(this.getNested(next, effect.target), effect),
    }));
  }

  formatStatValue(value, effect = {}) {
    if (typeof value === 'boolean') return value ? 'On' : 'Off';
    const multiplier = effect.multiplier || 1;
    const precision = effect.precision ?? (multiplier === 100 ? 0 : 0);
    const numeric = (Number(value) || 0) * multiplier;
    return `${numeric.toFixed(precision)}${effect.unit || ''}`;
  }

  getNested(source, path) {
    return path.split('.').reduce((value, key) => value?.[key], source);
  }

  setNested(source, path, value) {
    const keys = path.split('.');
    const finalKey = keys.pop();
    const target = keys.reduce((object, key) => {
      object[key] = object[key] || {};
      return object[key];
    }, source);
    target[finalKey] = value;
  }
}
