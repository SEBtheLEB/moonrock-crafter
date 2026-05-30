export class TabButton {
  constructor(label, onClick, { active = false } = {}) {
    this.element = document.createElement('button');
    this.element.type = 'button';
    this.element.className = `tab-button ${active ? 'is-active' : ''}`.trim();
    this.element.textContent = label;
    this.element.addEventListener('click', onClick);
  }
}
