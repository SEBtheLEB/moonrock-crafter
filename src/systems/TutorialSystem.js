const SPARKS = {
  name: 'Sparks',
  portraitStyle: {
    shape: 'drone',
    primary: '#ff8f3d',
    secondary: '#ffd36b',
    accent: '#76f3ff',
  },
};

export class TutorialSystem {
  constructor(game) {
    this.game = game;
  }

  get state() {
    this.game.state.tutorial ||= {};
    return this.game.state.tutorial;
  }

  isComplete() {
    return Boolean(this.state.completed);
  }

  has(step) {
    return Boolean(this.state[step]);
  }

  mark(step, { save = true } = {}) {
    this.state[step] = true;
    if (save) this.game.saveGame();
  }

  clearPrompt() {
    this.game.ui.clearHighlight();
  }

  onStationEnter(payload = {}) {
    if (this.isComplete()) return;
    if (!this.has('stationIntro')) {
      this.queueSparks([
        { key: 'stationIntro', mark: 'stationIntro', highlight: null },
        {
          key: 'stationMovePrompt',
          mark: 'stationMovePrompt',
          highlight: '.station-joystick',
          label: 'Walk',
          placement: 'above',
        },
        {
          key: 'stationJumpPrompt',
          mark: 'stationJumpPrompt',
          highlight: '.station-jump-button',
          label: 'Jump',
          placement: 'above',
        },
        {
          key: 'stationLaunchPrompt',
          mark: 'stationLaunchPrompt',
          highlight: '.station-interact-button',
          label: 'Interact',
          placement: 'above',
        },
      ]);
      return;
    }

    if (payload.miningSummary && this.has('firstDocked') && !this.has('shopIntroQueued')) {
      this.mark('shopIntroQueued', { save: false });
      return;
    }

    if (this.has('saleComplete') && !this.has('upgradePrompt')) {
      this.showUpgradePrompt();
    }
  }

  onLaunch() {
    if (this.isComplete()) return;
    this.mark('launched', { save: false });
    this.game.systems.dialogue.clear();
    this.clearPrompt();
    this.game.saveGame();
  }

  onMiningEnter() {
    if (this.isComplete() || !this.has('launched') || this.has('miningIntro')) return;
    this.mark('miningIntro', { save: false });
    this.queueSparks([
      { key: 'miningMove', highlight: '.joystick', label: 'Move', placement: 'above' },
      { key: 'miningLaser', highlight: '.mine-hold-button', label: 'Hold Mine', placement: 'above' },
      { key: 'miningCollect', highlight: null },
      { key: 'miningHud', highlight: '.mining-hud', label: 'Ship Status' },
      { key: 'miningReturn', highlight: '.station-radar', label: 'Station Beacon' },
    ], {
      onAllComplete: () => {
        this.mark('miningIntroRead');
      },
    });
  }

  onDockAvailable() {
    if (this.isComplete() || this.has('miningDockPrompt')) return;
    this.mark('miningDockPrompt', { save: false });
    this.startSparks('miningDock', {
      highlight: '.dock-button:not(.is-hidden)',
      label: 'Dock',
      placement: 'above',
      onComplete: () => this.mark('miningDockRead'),
      enqueue: true,
    });
  }

  onDocked() {
    if (this.isComplete()) return;
    this.mark('firstDocked', { save: false });
    this.clearPrompt();
    this.game.saveGame();
  }

  onMiningSummaryClosed() {
    if (this.isComplete() || this.has('shopIntro')) return;
    this.showShopIntro();
  }

  showShopIntro() {
    this.queueSparks([
      {
        key: 'shopIntro',
        mark: 'shopIntro',
        highlight: '.station-interact-button',
        label: 'Shop Counter',
        placement: 'above',
      },
    ]);
  }

  onOpenShop() {
    if (this.isComplete()) return;
    this.mark('shopOpened', { save: false });
    this.game.systems.dialogue.clear();
    this.clearPrompt();
    this.game.saveGame();
  }

  onShopEnter() {
    if (this.isComplete() || !this.has('shopOpened') || this.has('shopCustomer')) return;
    this.mark('shopCustomer', { save: false });
    this.startSparks('shopCustomer', {
      enqueue: true,
      highlight: '.accept-order-button',
      label: 'Accept Order',
      placement: 'above',
      onComplete: () => this.mark('shopCustomerRead'),
    });
  }

  onOrderAccepted() {
    if (this.isComplete() || this.has('craftButtonPrompt')) return;
    this.mark('craftButtonPrompt', { save: false });
    this.game.ui.highlightElement('.craft-order-button', 'Craft Order', { placement: 'above' });
    this.game.saveGame();
  }

  onCraftingEnter({ source = '' } = {}) {
    if (this.isComplete() || source !== 'shop' || this.has('craftingIntro')) return;
    this.mark('craftingIntro', { save: false });
    this.startSparks('craftingIntro', {
      highlight: '.crafting-top-bar',
      label: 'Craft Steps',
      onComplete: () => this.mark('craftingIntroRead'),
      enqueue: true,
    });
  }

  onSaleComplete() {
    if (this.isComplete() || this.has('saleComplete')) return;
    this.mark('saleComplete', { save: false });
    this.queueSparks([
      { key: 'saleComplete', mark: 'saleCompleteRead' },
      { key: 'upgradesIntro', mark: 'upgradeExplained' },
    ]);
  }

  showUpgradePrompt() {
    if (this.isComplete() || this.has('upgradePrompt')) return;
    if (this.has('upgradeExplained')) {
      this.mark('upgradePrompt', { save: false });
      this.game.ui.highlightElement('.station-interact-button', 'Upgrade Bench', { placement: 'above' });
      this.game.saveGame();
      return;
    }
    this.startSparks('upgradesIntro', {
      highlight: '.station-interact-button',
      label: 'Upgrade Bench',
      placement: 'above',
      onComplete: () => this.mark('upgradePrompt'),
      enqueue: true,
    });
  }

  onUpgradeSceneEnter() {
    if (this.isComplete() || !this.has('upgradePrompt') || this.has('upgradeSceneIntro')) return;
    this.mark('upgradeSceneIntro', { save: false });
    this.startSparks('upgradeScene', {
      highlight: '.upgrade-card.is-available',
      label: 'Buy Upgrade',
      onComplete: () => {
        this.mark('completed');
        this.clearPrompt();
      },
      enqueue: true,
    });
  }

  startSparks(key, { highlight = null, label = '', placement = 'auto', onComplete = null, enqueue = false } = {}) {
    const lines = this.game.systems.dialogue.getLines('sparksTutorial', key);
    return this.game.systems.dialogue.start({
      speaker: SPARKS.name,
      portraitStyle: SPARKS.portraitStyle,
      lines,
      meta: { tutorialKey: key },
      onStart: () => this.applyHighlight(highlight, label, placement),
      onComplete: () => {
        onComplete?.();
      },
    }, { enqueue });
  }

  queueSparks(entries = [], { onAllComplete = null } = {}) {
    const normalized = entries.map((entry, index) => ({
      speaker: SPARKS.name,
      portraitStyle: SPARKS.portraitStyle,
      lines: this.game.systems.dialogue.getLines('sparksTutorial', entry.key),
      meta: { tutorialKey: entry.key },
      onStart: () => this.applyHighlight(entry.highlight, entry.label || '', entry.placement || 'auto'),
      onComplete: () => {
        if (entry.mark) this.mark(entry.mark, { save: false });
        entry.onComplete?.();
        if (index === entries.length - 1) {
          onAllComplete?.();
          this.game.saveGame();
        }
      },
    }));
    return this.game.systems.dialogue.queueDialogue(normalized);
  }

  applyHighlight(selector, label, placement) {
    if (!selector) {
      this.clearPrompt();
      return;
    }
    this.game.ui.highlightElement(selector, label, { placement });
  }
}
