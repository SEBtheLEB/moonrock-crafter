import { gameBalance } from '../data/gameBalance.js';

const AUTOSAVE_EVENTS = new Set([
  'itemCrafted',
  'saleCompleted',
  'upgradePurchased',
  'docked',
  'researchEarned',
  'researchUnlocked',
]);

export class ObjectiveSystem {
  constructor(game) {
    this.game = game;
    this.objectives = gameBalance.progression.objectives;
  }

  get state() {
    this.game.state.progression ||= {};
    this.game.state.progression.objectiveIndex ||= 0;
    this.game.state.progression.completedObjectives ||= {};
    this.game.state.progression.stats ||= {
      materialsCollected: {},
      itemsCrafted: {},
      salesCompleted: 0,
      upgradesPurchased: 0,
      docked: 0,
      maxDistance: 0,
      researchEarned: 0,
      researchUnlocked: {},
    };
    this.game.state.progression.stats.materialsCollected ||= {};
    this.game.state.progression.stats.itemsCrafted ||= {};
    this.game.state.progression.stats.researchUnlocked ||= {};
    return this.game.state.progression;
  }

  getCurrentObjective() {
    return this.objectives[this.state.objectiveIndex] || null;
  }

  record(eventName, payload = {}) {
    const stats = this.state.stats;
    if (eventName === 'materialCollected') {
      stats.materialsCollected[payload.materialId] = (stats.materialsCollected[payload.materialId] || 0) + (payload.amount || 0);
    }
    if (eventName === 'itemCrafted') {
      stats.itemsCrafted[payload.itemId] = (stats.itemsCrafted[payload.itemId] || 0) + 1;
    }
    if (eventName === 'saleCompleted') stats.salesCompleted += 1;
    if (eventName === 'upgradePurchased') stats.upgradesPurchased += 1;
    if (eventName === 'docked') stats.docked += 1;
    if (eventName === 'distanceReached') stats.maxDistance = Math.max(stats.maxDistance || 0, payload.distance || 0);
    if (eventName === 'researchEarned') stats.researchEarned += payload.amount || 0;
    if (eventName === 'researchUnlocked') stats.researchUnlocked[payload.researchId] = true;

    const completed = this.checkCurrentObjective();
    if (!completed && AUTOSAVE_EVENTS.has(eventName)) this.game.saveGame();
    return completed;
  }

  checkCurrentObjective() {
    let completedAny = false;
    let current = this.getCurrentObjective();
    while (current && this.isObjectiveComplete(current)) {
      this.completeObjective(current);
      completedAny = true;
      current = this.getCurrentObjective();
    }
    return completedAny;
  }

  isObjectiveComplete(objective) {
    const condition = objective.condition;
    const stats = this.state.stats;
    if (condition.type === 'materialCollected') {
      return (stats.materialsCollected[condition.materialId] || 0) >= condition.amount;
    }
    if (condition.type === 'itemCrafted') {
      return (stats.itemsCrafted[condition.itemId] || 0) >= condition.amount;
    }
    if (condition.type === 'saleCompleted') return stats.salesCompleted >= condition.amount;
    if (condition.type === 'upgradePurchased') return stats.upgradesPurchased >= condition.amount;
    if (condition.type === 'docked') return stats.docked >= condition.amount;
    if (condition.type === 'distanceReached') return stats.maxDistance >= condition.amount;
    if (condition.type === 'researchEarned') return stats.researchEarned >= condition.amount;
    if (condition.type === 'researchUnlocked') return Boolean(stats.researchUnlocked[condition.researchId]);
    return false;
  }

  completeObjective(objective) {
    this.state.completedObjectives[objective.id] = true;
    this.state.objectiveIndex += 1;
    this.grantReward(objective.reward);
    this.game.ui.showToast(`Objective complete: ${objective.label}`, 'success', 2600);
    this.game.audio.playSuccess();
    this.game.saveGame();
  }

  grantReward(reward = {}) {
    this.game.systems.economy.addCredits(reward.credits || 0, { save: false });
    this.game.systems.economy.addResearch(reward.researchPoints || 0, { save: false, recordObjective: false });
    this.game.systems.economy.addReputation(reward.reputation || 0, { save: false });
    Object.entries(reward.materials || {}).forEach(([materialId, amount]) => {
      this.game.systems.inventory.add(materialId, amount, { skipSave: true });
    });
  }

  getProgress(objective = this.getCurrentObjective()) {
    if (!objective) return { current: 0, target: 0, text: 'All set' };
    const condition = objective.condition;
    const stats = this.state.stats;
    let current = 0;
    if (condition.type === 'materialCollected') current = stats.materialsCollected[condition.materialId] || 0;
    if (condition.type === 'itemCrafted') current = stats.itemsCrafted[condition.itemId] || 0;
    if (condition.type === 'saleCompleted') current = stats.salesCompleted || 0;
    if (condition.type === 'upgradePurchased') current = stats.upgradesPurchased || 0;
    if (condition.type === 'docked') current = stats.docked || 0;
    if (condition.type === 'distanceReached') current = Math.floor(stats.maxDistance || 0);
    if (condition.type === 'researchEarned') current = stats.researchEarned || 0;
    if (condition.type === 'researchUnlocked') current = stats.researchUnlocked[condition.researchId] ? 1 : 0;
    const target = condition.amount || 1;
    return {
      current: Math.min(current, target),
      target,
      text: `${Math.min(current, target)}/${target}`,
    };
  }

  describeReward(reward = {}) {
    const parts = [];
    if (reward.credits) parts.push(`+${reward.credits} credits`);
    if (reward.researchPoints) parts.push(`+${reward.researchPoints} research`);
    if (reward.reputation) parts.push(`+${reward.reputation} rep`);
    return parts.join(', ') || 'Progress';
  }
}
