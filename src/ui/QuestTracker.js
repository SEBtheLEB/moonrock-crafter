import { Button } from './Button.js';
import { Modal } from './Modal.js';

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function requirementMarkup(requirement) {
  const remaining = Math.max(0, requirement.required - requirement.owned);
  return `
    <li class="${requirement.met ? 'is-complete' : ''}">
      <span class="quest-material-icon" style="--quest-material: ${escapeHtml(requirement.color)}">${escapeHtml(requirement.icon)}</span>
      <strong>${escapeHtml(requirement.name)}</strong>
      <em>${escapeHtml(requirement.owned)}/${escapeHtml(requirement.required)}${remaining ? ` need ${escapeHtml(remaining)}` : ''}</em>
    </li>
  `;
}

export class QuestTracker {
  constructor(game) {
    this.game = game;
    this.expanded = false;
    this.activeJournalTab = 'active';
    this.lastRenderKey = '';
    this.element = document.createElement('section');
    this.element.className = 'quest-tracker';
    this.element.setAttribute('aria-label', 'Quest tracker');
    this.unsubscribe = this.game.events.on('quests:changed', () => this.render(true));
    this.render(true);
  }

  destroy() {
    this.unsubscribe?.();
  }

  render(force = false) {
    this.game.systems.quests?.refresh?.({ notify: false, save: false });
    const summary = this.game.systems.quests.getTrackerSummary();
    const renderKey = JSON.stringify({
      expanded: this.expanded,
      quest: summary.quest?.id || '',
      step: summary.step?.id || '',
      progress: summary.progress?.text || '',
      stepProgress: summary.stepProgress?.text || '',
      requirements: summary.requirements?.map((entry) => `${entry.id}:${entry.owned}/${entry.required}`).join('|') || '',
    });
    if (!force && renderKey === this.lastRenderKey) return;
    this.lastRenderKey = renderKey;

    const progressPercent = summary.progress?.percent ?? 0;
    const stepPercent = summary.stepProgress?.target
      ? Math.round((summary.stepProgress.current / Math.max(1, summary.stepProgress.target)) * 100)
      : progressPercent;

    this.element.classList.toggle('is-expanded', this.expanded);
    this.element.innerHTML = `
      <button type="button" class="quest-chip" aria-expanded="${this.expanded ? 'true' : 'false'}">
        <span>Quest</span>
        <strong>${escapeHtml(summary.stepTitle || summary.title)}</strong>
        <em>${escapeHtml(summary.stepProgress?.text || summary.progress?.text || '')}</em>
        <i aria-hidden="true" style="width: ${progressPercent}%"></i>
      </button>
      <div class="quest-popover ${this.expanded ? '' : 'is-hidden'}">
        <div class="quest-popover-head">
          <span>${escapeHtml(summary.quest?.category || 'Main')}</span>
          <button type="button" class="quest-journal-button" aria-label="Open quest journal">Log</button>
        </div>
        <h2>${escapeHtml(summary.title || 'Quest Log')}</h2>
        <h3>${escapeHtml(summary.stepTitle || 'Explore')}</h3>
        <div class="quest-step-track" aria-hidden="true"><i style="width: ${stepPercent}%"></i></div>
        <p>${escapeHtml(summary.detail || 'Keep exploring and expanding your field base.')}</p>
        <dl>
          <div><dt>Go To</dt><dd>${escapeHtml(summary.location || 'Field Base')}</dd></div>
          <div><dt>Quest</dt><dd>${escapeHtml(summary.progress?.text || '0/0')}</dd></div>
        </dl>
        ${summary.requirements?.length ? `<ul class="quest-requirement-list">${summary.requirements.map(requirementMarkup).join('')}</ul>` : ''}
        ${summary.tips?.length ? `<ul class="quest-tip-list">${summary.tips.slice(0, 2).map((tip) => `<li>${escapeHtml(tip)}</li>`).join('')}</ul>` : ''}
      </div>
    `;

    this.element.querySelector('.quest-chip')?.addEventListener('click', () => {
      this.expanded = !this.expanded;
      this.game.audio.playButtonClick?.();
      this.render(true);
    });
    this.element.querySelector('.quest-journal-button')?.addEventListener('click', (event) => {
      event.stopPropagation();
      this.game.audio.playButtonClick?.();
      this.showJournal();
    });
  }

  showJournal(tab = this.activeJournalTab) {
    this.activeJournalTab = tab;
    this.game.ui.showModal(this.createJournalModal(tab));
  }

  createJournalModal(tab = 'active') {
    const data = this.game.systems.quests.getJournalData();
    const tabs = [
      { id: 'active', label: `Active ${data.active.length}` },
      { id: 'todo', label: `To-Do ${data.todo.length}` },
      { id: 'completed', label: `Past ${data.completed.length}` },
    ];

    const modal = new Modal({
      title: 'Quest Module',
      body: 'Track the route from P01 survival to first planetfall.',
      className: 'quest-journal-modal',
      children: [
        new Button('Close', () => this.game.ui.hideModal(), { icon: 'X', variant: 'metal' }).element,
      ],
    }).element;

    const panel = modal.querySelector('.modal-panel');
    const actions = modal.querySelector('.modal-actions');
    const content = document.createElement('div');
    content.className = 'quest-journal-content';
    content.innerHTML = `
      <nav class="quest-journal-tabs" aria-label="Quest filters">
        ${tabs.map((entry) => `
          <button type="button" class="${entry.id === tab ? 'is-active' : ''}" data-quest-tab="${entry.id}">
            ${escapeHtml(entry.label)}
          </button>
        `).join('')}
      </nav>
      <div class="quest-journal-list">
        ${this.renderQuestCards(data[tab] || [], tab)}
      </div>
    `;
    panel.insertBefore(content, actions);

    content.querySelectorAll('[data-quest-tab]').forEach((button) => {
      button.addEventListener('click', () => this.showJournal(button.dataset.questTab));
    });
    content.querySelectorAll('[data-track-quest]').forEach((button) => {
      button.addEventListener('click', () => {
        this.game.systems.quests.setTrackedQuest(button.dataset.trackQuest);
        this.game.ui.hideModal();
        this.expanded = true;
        this.render(true);
      });
    });
    modal.addEventListener('click', (event) => {
      if (event.target === modal) this.game.ui.hideModal();
    });
    return modal;
  }

  renderQuestCards(quests = [], tab = 'active') {
    if (!quests.length) {
      return `
        <article class="quest-card is-empty">
          <h2>${tab === 'completed' ? 'No past quests yet' : 'Nothing here yet'}</h2>
          <p>More quests will appear as the prototype grows.</p>
        </article>
      `;
    }
    return quests.map((quest) => this.renderQuestCard(quest, tab)).join('');
  }

  renderQuestCard(quest, tab) {
    const progress = this.game.systems.quests.getQuestProgress(quest);
    const currentStep = this.game.systems.quests.getCurrentStep(quest);
    const status = this.game.systems.quests.getQuestStatus(quest);
    return `
      <article class="quest-card ${status === 'completed' ? 'is-complete' : ''}">
        <header>
          <span>${escapeHtml(quest.category || 'Quest')}</span>
          <strong>${escapeHtml(progress.text)}</strong>
        </header>
        <h2>${escapeHtml(quest.title)}</h2>
        <p>${escapeHtml(quest.summary || '')}</p>
        <div class="quest-step-track" aria-hidden="true"><i style="width: ${progress.percent}%"></i></div>
        ${currentStep && status !== 'completed' ? `<small>Now: ${escapeHtml(currentStep.label)}</small>` : ''}
        <ol>
          ${quest.steps.map((step) => {
            const complete = this.game.systems.quests.isStepComplete(quest, step);
            const stepProgress = this.game.systems.quests.getConditionProgress(step.condition);
            return `
              <li class="${complete ? 'is-complete' : ''}">
                <span>${complete ? '✓' : '•'}</span>
                <div>
                  <strong>${escapeHtml(step.label)}</strong>
                  <em>${escapeHtml(stepProgress.text)}</em>
                </div>
              </li>
            `;
          }).join('')}
        </ol>
        ${tab !== 'completed' ? `<button type="button" data-track-quest="${escapeHtml(quest.id)}">Track</button>` : ''}
      </article>
    `;
  }
}
