export class InventorySystem {
  constructor(game) {
    this.game = game;
  }

  get storage() {
    this.game.state.inventory ||= {};
    return this.game.state.inventory;
  }

  get runCargo() {
    this.game.state.runCargo ||= {};
    return this.game.state.runCargo;
  }

  add(itemId, amount = 1, { skipSave = false } = {}) {
    const inventory = this.storage;
    inventory[itemId] = (inventory[itemId] || 0) + amount;
    this.game.state.station.storageUsed = this.getTotalStored();
    this.notifyInventoryChanged();
    if (!skipSave) this.game.saveGame();
  }

  remove(itemId, amount = 1, { skipSave = false } = {}) {
    const inventory = this.storage;
    if ((inventory[itemId] || 0) < amount) return false;
    inventory[itemId] -= amount;
    if (inventory[itemId] <= 0) delete inventory[itemId];
    this.game.state.station.storageUsed = this.getTotalStored();
    this.notifyInventoryChanged();
    if (!skipSave) this.game.saveGame();
    return true;
  }

  notifyInventoryChanged() {
    this.game.input?.syncHotbarWithInventory?.({ notify: false });
    if (this.game.input?.hotbarSlotIds) this.game.state.hotbar = [...this.game.input.hotbarSlotIds];
    this.game.sceneManager?.current?.refreshHotbar?.(true);
    this.game.sceneManager?.current?.updateQuickInventory?.();
    this.game.systems.quests?.refresh?.({ notify: true, save: false });
  }

  getStoredAmount(itemId) {
    return this.storage[itemId] || 0;
  }

  getTotalStored() {
    return Object.values(this.storage).reduce((total, amount) => total + amount, 0);
  }

  getStorageValue() {
    return this.game.systems.materials.getCargoValue(this.storage);
  }

  beginRunCargo() {
    this.game.state.runCargo = {};
    return this.game.state.runCargo;
  }

  clearRunCargo() {
    this.game.state.runCargo = {};
  }

  setRunCargo(cargo = {}) {
    this.game.state.runCargo = { ...cargo };
    return this.game.state.runCargo;
  }

  getRunCargo() {
    return this.runCargo;
  }

  getRunCargoWeight(cargo = this.runCargo) {
    return this.game.systems.materials.getCargoWeight(cargo);
  }

  getRunCargoValue(cargo = this.runCargo) {
    return this.game.systems.materials.getCargoValue(cargo);
  }

  canAddToRunCargo(itemId, amount = 1, capacity = this.game.state.ship.cargoMax) {
    const addedWeight = this.game.systems.materials.getWeight(itemId) * amount;
    return this.getRunCargoWeight() + addedWeight <= capacity;
  }

  addToRunCargo(itemId, amount = 1, { capacity = this.game.state.ship.cargoMax } = {}) {
    if (!this.canAddToRunCargo(itemId, amount, capacity)) {
      return {
        ok: false,
        reason: 'cargo-full',
        currentWeight: this.getRunCargoWeight(),
        addedWeight: this.game.systems.materials.getWeight(itemId) * amount,
        capacity,
      };
    }
    this.runCargo[itemId] = (this.runCargo[itemId] || 0) + amount;
    return {
      ok: true,
      cargo: this.runCargo,
      currentWeight: this.getRunCargoWeight(),
      capacity,
    };
  }

  depositRunCargo({ skipSave = false } = {}) {
    const deposited = { ...this.runCargo };
    Object.entries(deposited).forEach(([itemId, amount]) => {
      if (amount > 0) this.add(itemId, amount, { skipSave: true });
    });
    this.clearRunCargo();
    if (!skipSave) this.game.saveGame();
    return deposited;
  }

  loseRunCargo(lossRatio = 0.7) {
    const kept = {};
    const lost = {};
    Object.entries(this.runCargo).forEach(([itemId, amount]) => {
      const keptAmount = Math.floor(amount * Math.max(0, 1 - lossRatio));
      if (keptAmount > 0) kept[itemId] = keptAmount;
      const lostAmount = amount - keptAmount;
      if (lostAmount > 0) lost[itemId] = lostAmount;
    });
    this.setRunCargo(kept);
    return { kept, lost };
  }

  getPreview(limit = 3) {
    return Object.entries(this.storage)
      .filter(([, amount]) => amount > 0)
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit)
      .map(([itemId, amount]) => ({ itemId, amount }));
  }
}
