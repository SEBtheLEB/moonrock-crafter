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

  getObjectiveDetails(objective = this.getCurrentObjective()) {
    if (!objective) {
      return {
        title: 'Keep forging',
        description: 'All current starter objectives are complete.',
        progress: { current: 1, target: 1, text: 'Done' },
        reward: 'Progress',
        location: 'Station',
        nextStep: 'Mine, craft, sell, and upgrade to keep expanding the station.',
        tips: ['Check the shop for new customers or fly farther out for rarer materials.'],
        requirements: [],
      };
    }

    const condition = objective.condition;
    const progress = this.getProgress(objective);
    const details = {
      title: objective.label,
      description: objective.description || '',
      progress,
      reward: this.describeReward(objective.reward),
      location: 'Station',
      nextStep: 'Keep going.',
      tips: [],
      requirements: [],
    };

    if (condition.type === 'materialCollected') {
      const material = this.game.systems.materials.getMaterial(condition.materialId);
      details.location = 'Launch Bay -> Mining';
      details.nextStep = `Launch the ship and mine asteroids that drop ${material?.name || condition.materialId}.`;
      details.requirements = [{
        id: condition.materialId,
        name: material?.name || condition.materialId,
        owned: progress.current,
        required: progress.target,
        color: material?.color || '#ffd36b',
        icon: material?.icon || '?',
        met: progress.current >= progress.target,
      }];
      details.tips = [
        `${material?.name || 'This material'} is found around: ${(material?.zoneAvailability || ['nearby space']).join(', ')}.`,
        'Glide through the dock beam to unload cargo without ending the run.',
      ];
    }

    if (condition.type === 'itemCrafted') {
      const item = this.game.systems.crafting.getItem(condition.itemId);
      details.location = 'Forge';
      details.nextStep = item
        ? `Walk to the FORGE sign, press Interact, then craft ${item.name}.`
        : 'Walk to the FORGE sign and press Interact.';
      details.requirements = this.getMaterialRequirements(item?.requiredMaterials || {});
      const missing = details.requirements.filter((requirement) => !requirement.met);
      details.tips = [
        missing.length
          ? `Missing: ${missing.map((requirement) => `${requirement.required - requirement.owned} ${requirement.name}`).join(', ')}.`
          : 'You have the materials. Head to the Forge.',
        item?.requiredMiniGames?.length
          ? `Crafting steps: ${item.requiredMiniGames.map((step) => this.formatMiniGameName(step)).join(', ')}.`
          : 'Crafting starts with Ore Cracking and Furnace Heating.',
      ];
    }

    if (condition.type === 'saleCompleted') {
      details.location = 'Shop Counter';
      details.nextStep = 'Open the shop, accept a customer order, craft the requested item, then complete the sale.';
      details.tips = [
        'Better craft quality gives more credits and reputation.',
        'If you lack materials, mine another run and unload at the dock.',
      ];
    }

    if (condition.type === 'upgradePurchased') {
      details.location = 'Upgrade Bench';
      details.nextStep = 'Walk to the ENGINEERING sign and buy any available upgrade.';
      details.tips = [
        'Fuel Tank and Cargo Hold are strong first upgrades.',
        'Upgrade costs use station storage, so unload mining cargo first.',
      ];
    }

    if (condition.type === 'docked') {
      details.location = 'Station Dock';
      details.nextStep = 'Fly back to the station. Glide through the dock beam to unload, or tap Dock to go inside.';
      details.tips = ['The station direction arrow on the mining HUD always points home.'];
    }

    if (condition.type === 'distanceReached') {
      details.location = 'Launch Bay -> Mining';
      details.nextStep = `Fly at least ${condition.amount}m from the station in any direction.`;
      details.tips = [
        'Space loot is arranged in distance rings around the station.',
        'Around 3000m you start seeing more crystal asteroids; around 6000m rarer rocks begin appearing.',
      ];
    }

    if (condition.type === 'researchEarned') {
      details.location = 'Shop or Deep Mining';
      details.nextStep = 'Serve Professor Quibble or mine relic asteroids for research fragments.';
      details.tips = ['Research unlocks farther zones and advanced recipes.'];
    }

    if (condition.type === 'researchUnlocked') {
      const node = this.game.systems.research.getNode(condition.researchId);
      const state = node ? this.game.systems.research.getNodeState(condition.researchId) : null;
      details.location = 'Research Terminal';
      details.nextStep = `Open the RESEARCH terminal and unlock ${node?.name || condition.researchId}.`;
      details.requirements = node ? [{
        id: 'researchPoints',
        name: 'Research',
        owned: this.game.state.researchPoints || 0,
        required: node.cost || 0,
        color: '#76f3ff',
        icon: 'R',
        met: (this.game.state.researchPoints || 0) >= (node.cost || 0),
      }] : [];
      details.tips = [
        node?.description || 'Research opens new progression routes.',
        ...(state?.missing || []).filter((missing) => missing.type === 'research').map((missing) => `Prerequisite: ${missing.label}.`),
      ];
    }

    return details;
  }

  getMaterialRequirements(requiredMaterials = {}) {
    return Object.entries(requiredMaterials).map(([materialId, required]) => {
      const material = this.game.systems.materials.getMaterial(materialId);
      const owned = this.game.systems.inventory.getStoredAmount(materialId);
      return {
        id: materialId,
        name: material?.name || materialId,
        owned,
        required,
        color: material?.color || '#ffd36b',
        icon: material?.icon || '?',
        met: owned >= required,
      };
    });
  }

  formatMiniGameName(id) {
    return id
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (letter) => letter.toUpperCase());
  }

  describeReward(reward = {}) {
    const parts = [];
    if (reward.credits) parts.push(`+${reward.credits} credits`);
    if (reward.researchPoints) parts.push(`+${reward.researchPoints} research`);
    if (reward.reputation) parts.push(`+${reward.reputation} rep`);
    return parts.join(', ') || 'Progress';
  }
}
