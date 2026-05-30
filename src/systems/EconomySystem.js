import { gameBalance } from '../data/gameBalance.js?v=30';

export class EconomySystem {
  constructor(game) {
    this.game = game;
    this.balance = gameBalance;
  }

  addCredits(amount = 0, { save = true } = {}) {
    const value = Math.max(0, Math.round(Number(amount) || 0));
    this.game.state.stats ||= {};
    this.game.state.credits = (this.game.state.credits || 0) + value;
    this.game.state.stats.totalCreditsEarned = (this.game.state.stats.totalCreditsEarned || 0) + value;
    if (save) this.game.saveGame();
    return this.game.state.credits;
  }

  spendCredits(amount = 0, { save = true } = {}) {
    const value = Math.max(0, Math.round(Number(amount) || 0));
    this.game.state.credits ||= 0;
    if (this.game.state.credits < value) return false;
    this.game.state.credits -= value;
    if (save) this.game.saveGame();
    return true;
  }

  addResearch(amount = 0, { save = true, recordObjective = true } = {}) {
    const value = Math.max(0, Math.round(Number(amount) || 0));
    this.game.state.researchPoints = (this.game.state.researchPoints || 0) + value;
    if (value > 0 && recordObjective) this.game.systems.objectives.record('researchEarned', { amount: value });
    if (save) this.game.saveGame();
    return this.game.state.researchPoints;
  }

  spendResearch(amount = 0, { save = true } = {}) {
    const value = Math.max(0, Math.round(Number(amount) || 0));
    if ((this.game.state.researchPoints || 0) < value) return false;
    this.game.state.researchPoints -= value;
    if (save) this.game.saveGame();
    return true;
  }

  canAfford(cost = {}) {
    if ((cost.credits || 0) > (this.game.state.credits || 0)) return false;
    if ((cost.researchPoints || 0) > (this.game.state.researchPoints || 0)) return false;
    return Object.entries(cost.materials || {}).every(([materialId, amount]) => {
      return this.game.systems.inventory.getStoredAmount(materialId) >= amount;
    });
  }

  spendCost(cost = {}, { save = true } = {}) {
    if (!this.canAfford(cost)) return false;
    if (cost.credits) this.spendCredits(cost.credits, { save: false });
    if (cost.researchPoints) this.spendResearch(cost.researchPoints, { save: false });
    Object.entries(cost.materials || {}).forEach(([materialId, amount]) => {
      this.game.systems.inventory.remove(materialId, amount, { skipSave: true });
    });
    if (save) this.game.saveGame();
    return true;
  }

  sell(value) {
    return this.addCredits(value);
  }
}
