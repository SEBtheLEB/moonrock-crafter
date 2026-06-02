import { gameBalance } from '../data/gameBalance.js?v=156';

const AUTOSAVE_EVENTS = new Set([
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
      upgradesPurchased: 0,
      docked: 0,
      maxDistance: 0,
      researchEarned: 0,
      researchUnlocked: {},
    };
    this.game.state.progression.stats.materialsCollected ||= {};
    this.game.state.progression.stats.researchUnlocked ||= {};
    return this.game.state.progression;
  }

  getCurrentObjective() {
    return this.objectives[this.state.objectiveIndex] || null;
  }

  record(eventName, payload = {}) {
    this.game.systems.quests?.record?.(eventName, payload, { save: false, notify: true });
    const stats = this.state.stats;
    if (eventName === 'materialCollected') {
      stats.materialsCollected[payload.materialId] = (stats.materialsCollected[payload.materialId] || 0) + (payload.amount || 0);
    }
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
    if (condition.type === 'inventoryItem') {
      return (this.game.systems.inventory.getStoredAmount(condition.itemId) || 0) >= condition.amount;
    }
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
    if (condition.type === 'inventoryItem') current = this.game.systems.inventory.getStoredAmount(condition.itemId) || 0;
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
        title: 'Reach the far planet',
        description: 'All current starter objectives are complete.',
        progress: { current: 1, target: 1, text: 'Done' },
        reward: 'Progress',
        location: 'Field Base',
        nextStep: 'Mine, build, repair the ship, then follow the GPS toward the next planet signal.',
        tips: ['Use the base lab inventory and crafting stations to review materials, repair gear, and prepare for deeper circles.'],
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
      details.location = 'Starter Planet -> Mining';
      details.nextStep = `Mine terrain or nearby asteroids that drop ${material?.name || condition.materialId}.`;
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
        'Glide through the dock beam to unload cargo and earn assay credits without ending the run.',
      ];
    }

    if (condition.type === 'inventoryItem') {
      const item = this.game.systems.materials.getMaterial(condition.itemId);
      const gravityRecipe = condition.itemId === 'gravityStabilizer'
        ? gameBalance.earlyGame?.crashStart?.gravityMachineRecipe
        : null;
      details.location = gravityRecipe ? 'Starter Planet Base -> Crafting Station' : 'Inventory';
      details.nextStep = gravityRecipe
        ? 'Gather stone, iron, and a Fire Core, then open the crafting station and craft the Gravity Machine.'
        : `Collect or craft ${item?.name || condition.itemId}.`;
      details.requirements = gravityRecipe
        ? this.getMaterialRequirements(gravityRecipe.requirements)
        : [{
          id: condition.itemId,
          name: item?.name || condition.itemId,
          owned: progress.current,
          required: progress.target,
          color: item?.color || '#ffd36b',
          icon: item?.icon || '?',
          met: progress.current >= progress.target,
        }];
      details.tips = gravityRecipe ? [
        'Fire Cores are larger now and live at the exact center of P01.',
        'After crafting the Gravity Machine, press G to reorient around P01 and reach the copper patch on the underside.',
        'The purple Moon Crystal ore is intentionally too hard for the Mark I miner, so mark it and come back later.',
      ] : [];
    }

    if (condition.type === 'upgradePurchased') {
      details.location = 'Upgrade Bench';
      details.nextStep = 'Walk to the ENGINEERING sign and buy any available upgrade.';
      details.tips = [
        'Fuel Tank, Cargo Hold, Laser Power, Engine Speed, and Ship Frame all help the long-range goal.',
        'Upgrade costs use station storage and assay credits, so unload mining cargo first.',
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
        'Space loot is arranged in distance circles around the origin.',
        'The Inner Circle is safest; the Inner Mid Circle starts pushing you toward stronger gear.',
        'The faraway planet is a long-term destination. Upgrade fuel, engines, cargo, and ship frame before committing.',
      ];
    }

    if (condition.type === 'researchEarned') {
      details.location = 'Deep Mining';
      details.nextStep = 'Mine relic asteroids and recover research fragments.';
      details.tips = ['Research unlocks farther zones and stronger navigation routes.'];
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

  describeReward(reward = {}) {
    const parts = [];
    if (reward.credits) parts.push(`+${reward.credits} credits`);
    if (reward.researchPoints) parts.push(`+${reward.researchPoints} research`);
    return parts.join(', ') || 'Progress';
  }
}
