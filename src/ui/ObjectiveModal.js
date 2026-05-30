import { Button } from './Button.js';
import { Modal } from './Modal.js';

function requirementRow(requirement) {
  const remaining = Math.max(0, requirement.required - requirement.owned);
  return `
    <li class="${requirement.met ? 'is-complete' : ''}">
      <span class="objective-material-icon" style="--material-color: ${requirement.color}">${requirement.icon}</span>
      <div>
        <strong>${requirement.name}</strong>
        <small>${requirement.owned}/${requirement.required}${remaining ? ` - need ${remaining}` : ''}</small>
      </div>
    </li>
  `;
}

export function createObjectiveModal(game, { onClose = () => {} } = {}) {
  const objective = game.systems.objectives.getCurrentObjective();
  const details = game.systems.objectives.getObjectiveDetails(objective);
  const progressPercent = details.progress.target
    ? Math.min(100, Math.round((details.progress.current / details.progress.target) * 100))
    : 100;

  const modal = new Modal({
    title: details.title,
    body: details.description,
    className: 'objective-detail-modal',
    children: [
      new Button('Got It', onClose, { icon: 'O', variant: 'success' }).element,
    ],
  }).element;

  const panel = modal.querySelector('.modal-panel');
  const actions = modal.querySelector('.modal-actions');
  const content = document.createElement('div');
  content.className = 'objective-detail-content';
  content.innerHTML = `
    <section class="objective-progress-card">
      <div class="objective-progress-label">
        <span>Progress</span>
        <strong>${details.progress.text}</strong>
      </div>
      <div class="objective-progress-track" aria-hidden="true">
        <i style="width: ${progressPercent}%"></i>
      </div>
    </section>

    <section class="objective-info-grid">
      <div>
        <span>Go To</span>
        <strong>${details.location}</strong>
      </div>
      <div>
        <span>Reward</span>
        <strong>${details.reward}</strong>
      </div>
    </section>

    <section class="objective-next-step">
      <span>Next Step</span>
      <p>${details.nextStep}</p>
    </section>

    ${details.requirements.length ? `
      <section class="objective-requirements">
        <span>Needs</span>
        <ul>${details.requirements.map(requirementRow).join('')}</ul>
      </section>
    ` : ''}

    ${details.tips.length ? `
      <section class="objective-tips">
        <span>Tips</span>
        <ul>${details.tips.map((tip) => `<li>${tip}</li>`).join('')}</ul>
      </section>
    ` : ''}
  `;

  panel.insertBefore(content, actions);
  modal.addEventListener('click', (event) => {
    if (event.target === modal) onClose();
  });
  return modal;
}
