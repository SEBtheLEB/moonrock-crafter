export class ProgressBar {
  constructor(label, value, max, { className = '' } = {}) {
    const percent = Math.max(0, Math.min(100, (value / max) * 100));
    this.element = document.createElement('div');
    this.element.className = `progress-wrap ${className}`.trim();
    this.element.innerHTML = `
      <div class="progress-label">
        <span>${label}</span>
        <strong>${Math.round(value)}/${Math.round(max)}</strong>
      </div>
      <div class="progress-track"><div class="progress-fill" style="width: ${percent}%"></div></div>
    `;
  }
}
