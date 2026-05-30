import { items } from '../data/items.js';
import { recipes } from '../data/recipes.js';

export const QUALITY_GRADES = [
  { id: 'broken', label: 'Broken', minScore: 0, pay: 0.15, reputation: -2, tipChanceBonus: -0.2, trust: -2 },
  { id: 'poor', label: 'Poor', minScore: 18, pay: 0.55, reputation: -1, tipChanceBonus: -0.12, trust: -1 },
  { id: 'decent', label: 'Decent', minScore: 42, pay: 0.85, reputation: 0, tipChanceBonus: 0, trust: 0 },
  { id: 'good', label: 'Good', minScore: 62, pay: 1, reputation: 1, tipChanceBonus: 0.04, trust: 1 },
  { id: 'excellent', label: 'Excellent', minScore: 80, pay: 1.3, reputation: 2, tipChanceBonus: 0.1, trust: 2 },
  { id: 'masterwork', label: 'Masterwork', minScore: 94, pay: 1.75, reputation: 4, tipChanceBonus: 0.18, trust: 3 },
];

export class CraftingSystem {
  constructor(game) {
    this.game = game;
    this.recipes = recipes;
    this.items = items;
  }

  getAvailableRecipes() {
    return this.items.filter((item) => this.isItemUnlocked(item.id));
  }

  getRecipeForItem(itemId) {
    return this.recipes.find((recipe) => recipe.output === itemId);
  }

  getItem(itemId) {
    return this.items.find((item) => item.id === itemId);
  }

  isItemUnlocked(itemId) {
    const item = this.getItem(itemId);
    if (!item) return false;
    const requirement = item.unlockRequirement || {};
    if ((this.game.state.reputation || 0) < (requirement.reputation || 0)) return false;
    if ((requirement.research || []).some((researchId) => !this.game.systems.research.isUnlocked(researchId))) return false;
    return Object.entries(requirement.upgrades || {}).every(([upgradeId, level]) => {
      return this.game.systems.upgrades.getLevel(upgradeId) >= level;
    });
  }

  canCraftItem(itemId) {
    return this.getMissingMaterials(itemId).length === 0;
  }

  getMissingMaterials(itemId) {
    const item = this.getItem(itemId);
    if (!item) return [];
    return Object.entries(item.requiredMaterials).filter(([materialId, required]) => {
      return this.game.systems.inventory.getStoredAmount(materialId) < required;
    }).map(([materialId, required]) => ({
      materialId,
      required,
      owned: this.game.systems.inventory.getStoredAmount(materialId),
      name: this.game.systems.materials.getDisplayName(materialId),
    }));
  }

  consumeMaterials(itemId) {
    const item = this.getItem(itemId);
    if (!item || !this.canCraftItem(itemId)) return false;
    Object.entries(item.requiredMaterials).forEach(([materialId, amount]) => {
      this.game.systems.inventory.remove(materialId, amount, { skipSave: true });
    });
    this.game.saveGame();
    return true;
  }

  getMiniGameSequence(item) {
    return (item.requiredMiniGames || ['oreCracking', 'furnaceHeating']).slice(0, Math.max(2, Math.min(4, item.requiredMiniGames?.length || 2)));
  }

  createCraftRun({ itemId, orderId = null, customerName = '', source = 'free' }) {
    const item = this.getItem(itemId);
    const recipe = this.getRecipeForItem(itemId);
    if (!item || !recipe) return null;
    return {
      item,
      recipe,
      orderId,
      customerName,
      source,
      sequence: this.getMiniGameSequence(item),
      stepIndex: 0,
      stepResults: [],
      startedAt: performance.now(),
      consumed: false,
    };
  }

  calculateFinalQuality(stepResults, item) {
    const scores = stepResults.map((result) => result.score);
    const average = scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : 0;
    const difficultyPenalty = Math.max(0, (item.difficulty - 1) * 2);
    const finalScore = Math.max(0, Math.min(100, average - difficultyPenalty));
    const grade = [...QUALITY_GRADES].reverse().find((entry) => finalScore >= entry.minScore) || QUALITY_GRADES[0];
    return {
      score: Math.round(finalScore),
      quality: grade.id,
      label: grade.label,
      grade,
    };
  }

  getQualityMeta(quality) {
    return QUALITY_GRADES.find((grade) => grade.id === quality) || QUALITY_GRADES[3];
  }
}
