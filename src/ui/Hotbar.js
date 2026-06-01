import { EMPTY_HOTBAR_SLOT, HOTBAR_SLOT_COUNT } from '../data/hotbar.js?v=115';

export class Hotbar {
  constructor(game, { className = '' } = {}) {
    this.game = game;
    this.lastSelectedIndex = -1;
    this.lastInputMode = '';
    this.lastSlotSignature = '';
    this.element = document.createElement('nav');
    this.element.className = `tool-hotbar ${className}`.trim();
    this.element.setAttribute('aria-label', 'Tool hotbar');
    this.buttons = Array.from({ length: HOTBAR_SLOT_COUNT }, (_, index) => this.createSlotButton(index));
    this.element.replaceChildren(...this.buttons);
    this.update(true);
  }

  createSlotButton(index) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tool-hotbar-slot tone-empty';
    button.dataset.hotbarIndex = String(index);
    button.addEventListener('click', (event) => {
      if (event.defaultPrevented) return;
      this.game.input.selectHotbarSlot(index);
      this.update(true);
    });
    button.addEventListener('pointerdown', (event) => {
      const slot = this.game.input.getHotbarSlotAt?.(index) || EMPTY_HOTBAR_SLOT;
      if (slot.id === EMPTY_HOTBAR_SLOT.id || !slot.inventoryItemId || event.button !== 0) return;
      const scene = this.game.sceneManager?.current;
      scene?.beginItemDrag?.({
        itemId: slot.inventoryItemId,
        source: 'hotbar',
        hotbarSlotIndex: index,
        pointerEvent: event,
      });
    });
    return button;
  }

  update(force = false) {
    const selectedIndex = this.game.input.selectedHotbarIndex ?? 0;
    const inputMode = document.documentElement.dataset.inputMode || '';
    const slotSignature = (this.game.input.hotbarSlotIds || []).join('|');
    if (!force && selectedIndex === this.lastSelectedIndex && inputMode === this.lastInputMode && slotSignature === this.lastSlotSignature) return;
    this.lastSelectedIndex = selectedIndex;
    this.lastInputMode = inputMode;
    this.lastSlotSignature = slotSignature;
    this.buttons.forEach((button, index) => {
      const selected = index === selectedIndex;
      const slot = this.game.input.getHotbarSlotAt?.(index) || EMPTY_HOTBAR_SLOT;
      const isEmpty = slot.id === EMPTY_HOTBAR_SLOT.id;
      button.className = `tool-hotbar-slot tone-${slot.tone || 'empty'} ${isEmpty ? 'is-empty' : ''}`.trim();
      button.setAttribute('aria-label', isEmpty ? `Empty slot ${index + 1}` : `Select slot ${index + 1}: ${slot.label}`);
      button.title = isEmpty ? `${index + 1}: Empty slot` : `${index + 1}: ${slot.label} - ${slot.description}`;
      button.innerHTML = `
        <kbd>${index + 1}</kbd>
        <span class="tool-hotbar-icon" aria-hidden="true">${slot.iconHtml || slot.icon || '+'}</span>
        <strong>${slot.shortLabel || slot.label || 'Empty'}</strong>
      `;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
    const selectedSlot = this.game.input.getSelectedHotbarSlot?.() || EMPTY_HOTBAR_SLOT;
    this.element.style.setProperty('--selected-tool-color', this.getToneColor(selectedSlot?.tone));
  }

  getToneColor(tone = 'empty') {
    return {
      forge: '#d98642',
      tech: '#66d8e8',
      laser: '#6ee7ff',
      utility: '#b794ff',
      flag: '#ffd36b',
      crafting: '#76f3ff',
      furnace: '#ff9f43',
      empty: '#6d7480',
    }[tone] || '#d98642';
  }
}

export { HOTBAR_SLOT_COUNT };
