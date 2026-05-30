export class RadialButton {
  constructor(label, onClick, { className = '' } = {}) {
    this.element = document.createElement('button');
    this.element.type = 'button';
    this.element.className = `radial-button ${className}`.trim();
    this.element.textContent = label;
    this.element.addEventListener('click', onClick);
  }
}
