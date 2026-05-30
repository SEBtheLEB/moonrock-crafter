export class Button {
  constructor(label, onClick, { className = '', icon = '', variant = 'primary', holdAction = null } = {}) {
    this.element = document.createElement('button');
    this.element.type = 'button';
    this.element.className = `game-button ${variant} ${className}`.trim();
    this.element.dataset.holdAction = holdAction || '';
    this.element.innerHTML = icon
      ? `<span class="button-icon" aria-hidden="true">${icon}</span><span>${label}</span>`
      : `<span>${label}</span>`;
    this.element.addEventListener('click', onClick);
  }
}
