import { quests as questDefinitions } from '../data/quests.js?v=158';

const AUTOSAVE_EVENTS = new Set([
  'boardedShip',
  'enteredSpace',
  'arrivedPlanet',
  'shipRepaired',
]);

function getPathValue(source, path = '') {
  return path.split('.').reduce((value, key) => (value && key ? value[key] : value), source);
}

export class QuestSystem {
  constructor(game) {
    this.game = game;
    this.quests = questDefinitions;
    this.lastSignature = '';
  }

  get state() {
    this.game.state.quests ||= {};
    this.game.state.quests.version ||= 1;
    this.game.state.quests.completedSteps ||= {};
    this.game.state.quests.completedQuests ||= {};
    this.game.state.quests.events ||= {};
    this.game.state.quests.arrivedPlanets ||= {};
    this.game.state.quests.trackedQuestId ||= null;
    return this.game.state.quests;
  }

  init() {
    this.refresh({ notify: false, save: false });
  }

  record(eventName, payload = {}, { save = AUTOSAVE_EVENTS.has(eventName), notify = true } = {}) {
    const state = this.state;
    state.events[eventName] ||= { count: 0, lastPayload: null };
    state.events[eventName].count += payload.amount || 1;
    state.events[eventName].lastPayload = { ...payload, at: Date.now() };

    if (eventName === 'arrivedPlanet') {
      const planetId = payload.planetId || payload.islandId || payload.id || 'unknown';
      state.arrivedPlanets[planetId] ||= {
        planetId,
        tag: payload.tag || '',
        name: payload.name || '',
        count: 0,
        starter: Boolean(payload.starter),
      };
      state.arrivedPlanets[planetId].count += 1;
      state.arrivedPlanets[planetId].tag = payload.tag || state.arrivedPlanets[planetId].tag;
      state.arrivedPlanets[planetId].name = payload.name || state.arrivedPlanets[planetId].name;
      state.arrivedPlanets[planetId].starter = Boolean(payload.starter);
    }

    const changed = this.refresh({ notify, save: false });
    if (save || changed) this.game.saveGame();
    return changed;
  }

  refresh({ notify = false, save = false } = {}) {
    const changed = this.syncCompletions({ notify });
    this.ensureTrackedQuest();
    const signature = this.getSignature();
    if (changed || signature !== this.lastSignature) {
      this.lastSignature = signature;
      this.game.events.emit('quests:changed', this.getTrackerSummary());
      if (save) this.game.saveGame();
      return true;
    }
    return false;
  }

  syncCompletions({ notify = false } = {}) {
    const state = this.state;
    let changed = false;
    this.quests.forEach((quest) => {
      if (!this.isQuestUnlocked(quest)) return;
      const completedSteps = state.completedSteps[quest.id] ||= {};
      const directComplete = quest.steps.map((step) => this.isConditionComplete(step.condition));
      let deepestCompleteIndex = directComplete.reduce((deepest, complete, index) => (complete ? index : deepest), -1);
      if (this.isQuestComplete(quest)) deepestCompleteIndex = quest.steps.length - 1;
      for (let index = 0; index <= deepestCompleteIndex; index += 1) {
        const step = quest.steps[index];
        if (!completedSteps[step.id]) {
          completedSteps[step.id] = true;
          changed = true;
        }
      }

      let currentIndex = quest.steps.findIndex((step) => !completedSteps[step.id]);
      while (currentIndex >= 0 && this.isConditionComplete(quest.steps[currentIndex].condition)) {
        completedSteps[quest.steps[currentIndex].id] = true;
        changed = true;
        currentIndex = quest.steps.findIndex((step) => !completedSteps[step.id]);
      }

      const questComplete = quest.steps.every((step) => completedSteps[step.id]);
      if (questComplete && !state.completedQuests[quest.id]) {
        state.completedQuests[quest.id] = true;
        changed = true;
        if (notify) {
          this.game.ui.showToast(`Quest complete: ${quest.title}`, 'success', 2600);
          this.game.audio.playSuccess?.();
        }
      }
    });
    return changed;
  }

  ensureTrackedQuest() {
    const state = this.state;
    const tracked = state.trackedQuestId ? this.getQuest(state.trackedQuestId) : null;
    if (tracked && this.getQuestStatus(tracked) === 'active') return tracked;
    const next = this.getActiveQuests()[0] || this.getTodoQuests()[0] || null;
    state.trackedQuestId = next?.id || null;
    return next;
  }

  getQuest(questId) {
    return this.quests.find((quest) => quest.id === questId) || null;
  }

  setTrackedQuest(questId) {
    const quest = this.getQuest(questId);
    if (!quest) return false;
    this.state.trackedQuestId = quest.id;
    this.refresh({ notify: false, save: true });
    return true;
  }

  getCurrentQuest() {
    return this.ensureTrackedQuest();
  }

  getCurrentStep(quest = this.getCurrentQuest()) {
    if (!quest) return null;
    const completedSteps = this.state.completedSteps[quest.id] || {};
    return quest.steps.find((step) => !completedSteps[step.id]) || quest.steps[quest.steps.length - 1] || null;
  }

  getActiveQuests() {
    return this.quests
      .filter((quest) => this.getQuestStatus(quest) === 'active')
      .sort((a, b) => (a.priority || 0) - (b.priority || 0));
  }

  getTodoQuests() {
    return this.quests
      .filter((quest) => this.getQuestStatus(quest) === 'todo')
      .sort((a, b) => (a.priority || 0) - (b.priority || 0));
  }

  getCompletedQuests() {
    return this.quests
      .filter((quest) => this.getQuestStatus(quest) === 'completed')
      .sort((a, b) => (a.priority || 0) - (b.priority || 0));
  }

  getQuestStatus(quest) {
    if (!this.isQuestUnlocked(quest)) return 'todo';
    if (this.isQuestComplete(quest)) return 'completed';
    return 'active';
  }

  isQuestUnlocked(quest) {
    return (quest.prerequisites || []).every((condition) => this.isConditionComplete(condition));
  }

  isQuestComplete(quest) {
    const completedSteps = this.state.completedSteps[quest.id] || {};
    return quest.steps.every((step) => completedSteps[step.id]);
  }

  isStepComplete(quest, step) {
    return Boolean(this.state.completedSteps[quest.id]?.[step.id]) || this.isConditionComplete(step.condition);
  }

  isConditionComplete(condition = {}) {
    return this.getConditionProgress(condition).complete;
  }

  getConditionProgress(condition = {}) {
    if (!condition || !condition.type) return { current: 0, target: 1, complete: false, text: '0/1', requirements: [] };
    if (condition.type === 'any') {
      const results = (condition.conditions || []).map((entry) => this.getConditionProgress(entry));
      const complete = results.some((entry) => entry.complete);
      const best = results.find((entry) => entry.complete) || results.sort((a, b) => (b.current / Math.max(1, b.target)) - (a.current / Math.max(1, a.target)))[0];
      return {
        ...(best || { current: 0, target: 1, text: '0/1', requirements: [] }),
        complete,
      };
    }
    if (condition.type === 'questCompleted') {
      const complete = Boolean(this.state.completedQuests[condition.questId]);
      return { current: complete ? 1 : 0, target: 1, complete, text: complete ? 'Done' : 'Locked', requirements: [] };
    }
    if (condition.type === 'storyFlag') {
      const complete = Boolean(getPathValue(this.game.state, condition.path));
      return { current: complete ? 1 : 0, target: 1, complete, text: complete ? 'Done' : 'Pending', requirements: [] };
    }
    if (condition.type === 'inventoryItem') {
      const current = this.game.systems.inventory.getStoredAmount(condition.itemId);
      const target = condition.amount || 1;
      return {
        current: Math.min(current, target),
        target,
        complete: current >= target,
        text: `${Math.min(current, target)}/${target}`,
        requirements: this.getMaterialRequirements({ [condition.itemId]: target }),
      };
    }
    if (condition.type === 'inventoryAll') {
      const requirements = this.getMaterialRequirements(condition.items || {});
      const current = requirements.filter((entry) => entry.met).length;
      const target = requirements.length || 1;
      return {
        current,
        target,
        complete: requirements.length > 0 && requirements.every((entry) => entry.met),
        text: `${current}/${target} ready`,
        requirements,
      };
    }
    if (condition.type === 'eventCount') {
      const current = this.state.events[condition.eventId]?.count || 0;
      const target = condition.amount || 1;
      return {
        current: Math.min(current, target),
        target,
        complete: current >= target,
        text: `${Math.min(current, target)}/${target}`,
        requirements: [],
      };
    }
    if (condition.type === 'arrivedPlanet') {
      const starterId = this.game.state.story?.starterPlanetId || 'crashPlanet';
      const count = Object.values(this.state.arrivedPlanets || {}).filter((entry) => {
        if (!entry?.count) return false;
        if (condition.excludeStarter && (entry.starter || entry.planetId === starterId)) return false;
        return true;
      }).length;
      const target = condition.amount || 1;
      return {
        current: Math.min(count, target),
        target,
        complete: count >= target,
        text: `${Math.min(count, target)}/${target}`,
        requirements: [],
      };
    }
    if (condition.type === 'achievement') {
      const complete = Boolean(this.game.state.achievements?.[condition.achievementId]);
      return { current: complete ? 1 : 0, target: 1, complete, text: complete ? 'Done' : 'Pending', requirements: [] };
    }
    if (condition.type === 'distanceReached') {
      const current = Math.floor(Math.max(
        this.game.state.stats?.farthestDistanceReached || 0,
        this.game.state.progression?.stats?.maxDistance || 0,
      ));
      const target = condition.amount || 1;
      return {
        current: Math.min(current, target),
        target,
        complete: current >= target,
        text: `${Math.min(current, target)}/${target}m`,
        requirements: [],
      };
    }
    return { current: 0, target: 1, complete: false, text: 'Pending', requirements: [] };
  }

  getMaterialRequirements(requiredMaterials = {}) {
    return Object.entries(requiredMaterials).map(([itemId, required]) => {
      const material = this.game.systems.materials.getMaterial(itemId);
      const owned = this.game.systems.inventory.getStoredAmount(itemId);
      return {
        id: itemId,
        name: material?.name || itemId,
        owned,
        required,
        color: material?.color || '#76f3ff',
        icon: material?.icon || '?',
        met: owned >= required,
      };
    });
  }

  getQuestProgress(quest) {
    const completedSteps = this.state.completedSteps[quest.id] || {};
    const current = quest.steps.filter((step) => completedSteps[step.id]).length;
    const target = quest.steps.length || 1;
    return {
      current,
      target,
      percent: Math.round((current / target) * 100),
      text: `${current}/${target}`,
    };
  }

  getTrackerSummary() {
    const quest = this.getCurrentQuest();
    const step = this.getCurrentStep(quest);
    if (!quest || !step) {
      return {
        title: 'No Active Quest',
        stepTitle: 'Explore and expand',
        progress: { current: 1, target: 1, percent: 100, text: 'Done' },
        requirements: [],
      };
    }
    return {
      quest,
      step,
      title: quest.shortTitle || quest.title,
      stepTitle: step.trackerText || step.label,
      detail: step.detail || quest.summary || '',
      location: step.location || quest.location || 'Field Base',
      tips: step.tips || [],
      stepProgress: this.getConditionProgress(step.condition),
      progress: this.getQuestProgress(quest),
      requirements: this.getConditionProgress(step.condition).requirements || [],
    };
  }

  getJournalData() {
    return {
      active: this.getActiveQuests(),
      todo: this.getTodoQuests(),
      completed: this.getCompletedQuests(),
    };
  }

  getSignature() {
    const state = this.state;
    const tracked = this.getCurrentQuest()?.id || '';
    const currentStep = this.getCurrentStep()?.id || '';
    return JSON.stringify({
      tracked,
      currentStep,
      completedSteps: state.completedSteps,
      completedQuests: state.completedQuests,
      events: state.events,
      arrivedPlanets: state.arrivedPlanets,
      inventory: this.game.state.inventory,
      story: this.game.state.story,
    });
  }
}
