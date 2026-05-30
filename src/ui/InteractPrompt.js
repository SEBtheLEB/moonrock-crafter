export class InteractPrompt {
  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'interact-prompt is-hidden';
    this.element.innerHTML = `
      <span class="interact-key">E</span>
      <div>
        <strong data-interact-title></strong>
        <span data-interact-copy></span>
      </div>
    `;
    this.title = this.element.querySelector('[data-interact-title]');
    this.copy = this.element.querySelector('[data-interact-copy]');
    this.key = this.element.querySelector('.interact-key');
  }

  mount(parent) {
    parent.append(this.element);
  }

  update({ interactable = null, x = 0, y = 0, actionLabel = 'E' } = {}) {
    if (!interactable) {
      this.element.classList.add('is-hidden');
      return;
    }

    this.title.textContent = interactable.label;
    this.copy.textContent = interactable.prompt;
    this.key.textContent = actionLabel;
    this.element.style.left = `${Math.round(x)}px`;
    this.element.style.top = `${Math.round(y)}px`;
    this.element.classList.remove('is-hidden');
  }

  destroy() {
    this.element.remove();
  }
}
