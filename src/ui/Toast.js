export class Toast {
  constructor(message = '', { tone = 'default' } = {}) {
    this.element = document.createElement('div');
    this.element.className = `toast ${tone}`.trim();
    this.element.textContent = message;
  }
}
