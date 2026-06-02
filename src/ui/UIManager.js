import { Button } from './Button.js';
import { Modal } from './Modal.js';
import { Panel } from './Panel.js';
import { Toast } from './Toast.js';
import { TooltipManager } from './TooltipManager.js?v=153';

export class UIManager {
  constructor(root, events, audio) {
    this.root = root;
    this.events = events;
    this.audio = audio;
    this.sceneLayer = document.createElement('div');
    this.controlsLayer = document.createElement('div');
    this.globalLayer = document.createElement('div');
    this.modalLayer = document.createElement('div');
    this.toastLayer = document.createElement('div');
    this.highlightLayer = document.createElement('div');
    this.dialogueOverlay = this.createDialogueOverlay();
    this.dialogueRenderState = {};
    this.layers = [this.sceneLayer, this.controlsLayer, this.globalLayer, this.modalLayer, this.toastLayer];
    this.highlightTarget = null;
    this.game = null;
    this.dialogueMood = '';
    this.tooltipManager = new TooltipManager();

    this.sceneLayer.className = 'ui-scene-layer';
    this.controlsLayer.className = 'ui-controls-layer';
    this.globalLayer.className = 'ui-global-layer';
    this.modalLayer.className = 'ui-modal-layer';
    this.toastLayer.className = 'ui-toast-layer';
    this.highlightLayer.className = 'tutorial-highlight-layer';
    this.root.replaceChildren(...this.layers);

    this.root.addEventListener('pointerdown', (event) => {
      if (event.target.closest('button')) this.audio.unlock();
    }, true);
    this.root.addEventListener('click', (event) => {
      if (event.target.closest('button')) this.audio.playButtonClick();
    });
    this.root.addEventListener('pointerenter', (event) => {
      if (event.target.closest?.('button')) this.audio.playButtonHover();
    }, true);
  }

  setupGlobalControls(game) {
    this.game = game;
    this.globalLayer.replaceChildren(
      this.highlightLayer,
      this.dialogueOverlay,
      new Button('Pause', () => game.togglePause(), {
        icon: 'II',
        className: 'pause-button',
        variant: 'metal',
      }).element,
    );
  }

  clear() {
    this.clearScene();
  }

  clearScene() {
    this.sceneLayer.replaceChildren();
    this.controlsLayer.replaceChildren();
    this.clearHighlight();
  }

  setScreen(className) {
    this.root.className = `ui-root ${className}`;
    this.root.classList.add('scene-enter');
    window.clearTimeout(this.sceneEnterTimer);
    this.sceneEnterTimer = window.setTimeout(() => {
      this.root.classList.remove('scene-enter');
    }, 360);
  }

  addHud(html) {
    const hud = document.createElement('div');
    hud.className = 'hud';
    hud.innerHTML = html;
    this.sceneLayer.append(hud);
    return hud;
  }

  addPanel(options) {
    const panel = new Panel(options).element;
    this.sceneLayer.append(panel);
    return panel;
  }

  addSceneElement(element) {
    this.sceneLayer.append(element);
    return element;
  }

  addControls(children = []) {
    const controls = document.createElement('div');
    controls.className = 'mobile-controls';
    children.forEach((child) => controls.append(child));
    this.controlsLayer.append(controls);
    return controls;
  }

  createDialogueOverlay() {
    const overlay = document.createElement('section');
    overlay.className = 'global-dialogue-box is-hidden';
    overlay.innerHTML = `
      <button type="button" class="dialogue-hit-area" aria-label="Continue dialogue"></button>
      <div class="dialogue-avatar" aria-hidden="true"></div>
      <div class="dialogue-main">
        <strong data-dialogue-speaker></strong>
        <p data-dialogue-text></p>
        <div class="dialogue-choice-row"></div>
      </div>
      <button type="button" class="dialogue-next-button">Continue</button>
    `;
    overlay.querySelector('.dialogue-hit-area').addEventListener('click', () => {
      this.game?.systems.dialogue.continue();
    });
    overlay.querySelector('.dialogue-next-button').addEventListener('click', (event) => {
      event.stopPropagation();
      this.game?.systems.dialogue.continue();
    });
    return overlay;
  }

  setDialogueMood(mood = '') {
    this.dialogueMood = mood;
  }

  updateDialogue(active) {
    if (!active || active.done) {
      if (!this.dialogueOverlay.classList.contains('is-hidden')) {
        this.dialogueOverlay.classList.add('is-hidden');
      }
      this.dialogueRenderState = {};
      return;
    }

    const mood = active.mood || this.dialogueMood || '';
    const className = `global-dialogue-box ${mood}`.trim();
    if (this.dialogueRenderState.className !== className) {
      this.dialogueOverlay.className = className;
      this.dialogueRenderState.className = className;
    }

    if (this.dialogueRenderState.id !== active.id) {
      this.dialogueRenderState = { id: active.id, className };
      this.dialogueOverlay.querySelector('[data-dialogue-speaker]').textContent = active.speaker || '';
      const avatar = this.dialogueOverlay.querySelector('.dialogue-avatar');
      avatar.className = `dialogue-avatar ${active.portraitStyle?.shape || ''}`.trim();
      avatar.style.setProperty('--portrait-primary', active.portraitStyle?.primary || '#ff8f3d');
      avatar.style.setProperty('--portrait-secondary', active.portraitStyle?.secondary || '#ffd36b');
      avatar.style.setProperty('--portrait-accent', active.portraitStyle?.accent || '#76f3ff');
      this.dialogueOverlay.querySelector('.dialogue-choice-row').replaceChildren();
    }

    if (this.dialogueRenderState.text !== active.displayedText) {
      this.dialogueOverlay.querySelector('[data-dialogue-text]').textContent = active.displayedText || '';
      this.dialogueRenderState.text = active.displayedText;
    }

    const nextButton = this.dialogueOverlay.querySelector('.dialogue-next-button');
    const nextLabel = active.complete ? 'Continue' : 'Skip';
    if (this.dialogueRenderState.nextLabel !== nextLabel) {
      nextButton.textContent = nextLabel;
      this.dialogueRenderState.nextLabel = nextLabel;
    }
    const choices = this.dialogueOverlay.querySelector('.dialogue-choice-row');
    const choiceKey = active.complete ? (active.choices || []).map((choice) => choice.label).join('|') : '';
    if (this.dialogueRenderState.choiceKey !== choiceKey) {
      choices.replaceChildren();
      this.dialogueRenderState.choiceKey = choiceKey;
    }
    if (active.complete && active.choices?.length && choices.childElementCount === 0) {
      active.choices.forEach((choice) => {
        const button = new Button(choice.label, () => this.game.systems.dialogue.choose(choice), {
          variant: choice.variant || 'metal',
        }).element;
        choices.append(button);
      });
    }
  }

  hideDialogue() {
    this.game?.systems.dialogue.clear();
    this.dialogueOverlay.classList.add('is-hidden');
  }

  hasBlockingOverlay() {
    return Boolean(this.modalLayer?.children.length)
      || !this.dialogueOverlay.classList.contains('is-hidden');
  }

  highlightElement(selector, label = '', { placement = 'auto' } = {}) {
    window.setTimeout(() => {
      this.clearHighlight();
      const target = typeof selector === 'string' ? document.querySelector(selector) : selector;
      if (!target) return;
      this.highlightTarget = target;
      target.classList.add('tutorial-highlight-target');
      const rect = target.getBoundingClientRect();
      const arrow = document.createElement('div');
      arrow.textContent = label;
      const left = Math.max(12, Math.min(window.innerWidth - 190, rect.left + rect.width / 2 - 86));
      const preferAbove = placement === 'above' || (placement === 'auto' && rect.top > window.innerHeight * 0.48);
      arrow.className = `tutorial-arrow ${preferAbove ? 'is-above' : 'is-below'}`;
      const top = preferAbove
        ? Math.max(12, rect.top - 58)
        : Math.min(window.innerHeight - 74, rect.bottom + 14);
      arrow.style.left = `${left}px`;
      arrow.style.top = `${top}px`;
      this.highlightLayer.replaceChildren(arrow);
    }, 40);
  }

  clearHighlight() {
    this.highlightTarget?.classList.remove('tutorial-highlight-target');
    this.highlightTarget = null;
    this.highlightLayer.replaceChildren();
  }

  showPauseMenu(game) {
    const mutedLabel = game.audio.enabled ? 'Mute Audio' : 'Unmute Audio';
    const touchLabel = game.state.settings?.touchControlsEnabled ? 'Hide Touch Controls' : 'Show Touch Controls';
    this.audio.playModalOpen();
    game.blockControllerUiActivationUntilRelease?.();
    const modal = new Modal({
      title: 'Paused',
      body: 'Tune the expedition kit, then jump back in.',
      className: 'pause-modal',
      children: [
        new Button('Resume', () => game.togglePause(false), { icon: '>', variant: 'success' }).element,
        new Button('Settings', () => this.showToast('Settings panel coming soon.', 'default'), { icon: '*' }).element,
        new Button(touchLabel, () => {
          game.toggleTouchControls();
          this.showPauseMenu(game);
        }, { icon: 'T', variant: 'metal' }).element,
        new Button('Manual Save', () => game.manualSave(), { icon: 'S', variant: 'metal' }).element,
        new Button('Refresh App', () => game.refreshApp(), { icon: 'R', variant: 'metal' }).element,
        new Button('Exit Fullscreen', () => game.exitFullscreen(), { icon: '[]', variant: 'metal' }).element,
        new Button('Set Base GPS', () => game.returnToBase(), { icon: '<' }).element,
        new Button('Reset Save', () => game.resetSave(), { icon: '!', variant: 'danger' }).element,
        new Button(mutedLabel, () => {
          const isMuted = game.audio.toggleMuted();
          game.saveGame();
          this.showToast(isMuted ? 'Audio muted' : 'Audio on', 'success');
          this.showPauseMenu(game);
        }, { icon: game.audio.enabled ? 'S' : 'M', variant: 'metal' }).element,
      ],
    }).element;
    this.modalLayer.replaceChildren(modal);
  }

  showModal(element) {
    this.audio.playModalOpen();
    this.game?.blockControllerUiActivationUntilRelease?.();
    this.modalLayer.replaceChildren(element);
  }

  hideModal() {
    if (this.modalLayer.children.length) this.audio.playModalClose();
    this.modalLayer.replaceChildren();
  }

  hidePauseMenu() {
    if (this.modalLayer.children.length) this.audio.playModalClose();
    this.modalLayer.replaceChildren();
  }

  showToast(message, tone = 'default', duration = 1800) {
    const toast = new Toast(message, { tone }).element;
    this.toastLayer.append(toast);
    window.setTimeout(() => toast.remove(), duration);
    return toast;
  }
}
