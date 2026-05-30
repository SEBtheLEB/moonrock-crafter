export class ResourceCounter {
  constructor(label, value, { icon = '' } = {}) {
    this.element = document.createElement('span');
    this.element.className = 'resource-counter';
    this.value = value;
    this.element.innerHTML = `
      ${icon ? `<span class="resource-icon" aria-hidden="true">${icon}</span>` : ''}
      <span>${label}</span>
      <strong data-resource-value>${value}</strong>
    `;
    this.valueElement = this.element.querySelector('[data-resource-value]');
  }

  update(value) {
    if (this.value === value) return;
    this.value = value;
    this.valueElement.textContent = value;
  }
}
