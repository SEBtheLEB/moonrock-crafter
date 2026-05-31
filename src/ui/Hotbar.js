import { HOTBAR_SLOT_COUNT, hotbarSlots } from '../data/hotbar.js?v=93';

export class Hotbar {
  constructor(game, { className = '' } = {}) {
    this.game = game;
    this.lastSelectedIndex = -1;
    this.lastInputMode = '';
    this.element = document.createElement('nav');
    this.element.className = `tool-hotbar ${className}`.trim();
    this.element.setAttribute('aria-label', 'Tool hotbar');
    this.buttons = hotbarSlots.map((slot, index) => this.createSlotButton(slot, index));
    this.element.replaceChildren(...this.buttons);
    this.update(true);
  }

  createSlotButton(slot, index) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `tool-hotbar-slot tone-${slot.tone || 'empty'}`;
    button.setAttribute('aria-label', `Select slot ${index + 1}: ${slot.label}`);
    button.title = `${index + 1}: ${slot.label} - ${slot.description}`;
    button.innerHTML = `
      <kbd>${index + 1}</kbd>
      <span class="tool-hotbar-icon" aria-hidden="true">${slot.iconHtml || slot.icon}</span>
      <strong>${slot.shortLabel || slot.label}</strong>
    `;
    button.addEventListener('click', () => {
      this.game.input.selectHotbarSlot(index);
      this.update(true);
    });
    return button;
  }

  update(force = false) {
    const selectedIndex = this.game.input.selectedHotbarIndex ?? 0;
    const inputMode = document.documentElement.dataset.inputMode || '';
    if (!force && selectedIndex === this.lastSelectedIndex && inputMode === this.lastInputMode) return;
    this.lastSelectedIndex = selectedIndex;
    this.lastInputMode = inputMode;
    this.buttons.forEach((button, index) => {
      const selected = index === selectedIndex;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
    const selectedSlot = hotbarSlots[selectedIndex];
    this.element.style.setProperty('--selected-tool-color', this.getToneColor(selectedSlot?.tone));
  }

  getToneColor(tone = 'empty') {
    return {
      forge: '#d98642',
      tech: '#66d8e8',
      utility: '#b794ff',
      flag: '#ffd36b',
      crafting: '#76f3ff',
      furnace: '#ff9f43',
      empty: '#6d7480',
    }[tone] || '#d98642';
  }
}

export { HOTBAR_SLOT_COUNT, hotbarSlots };
