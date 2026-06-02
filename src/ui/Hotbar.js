import { EMPTY_HOTBAR_SLOT, HOTBAR_SLOT_COUNT } from '../data/hotbar.js?v=130';

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
      const scene = this.game.sceneManager?.current;
      if (scene?.handleHotbarSlotClick?.(index, event)) {
        this.update(true);
        return;
      }
      this.game.input.selectHotbarSlot(index);
      this.update(true);
    });
    button.addEventListener('pointerdown', (event) => {
      const scene = this.game.sceneManager?.current;
      if (scene?.hasHeldInventoryItem?.()) {
        event.preventDefault();
        return;
      }
      const slot = this.game.input.getHotbarSlotAt?.(index) || EMPTY_HOTBAR_SLOT;
      if (slot.id === EMPTY_HOTBAR_SLOT.id || !slot.inventoryItemId || event.button !== 0) return;
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
    const slotSignature = this.getSlotSignature();
    if (!force && selectedIndex === this.lastSelectedIndex && inputMode === this.lastInputMode && slotSignature === this.lastSlotSignature) return;
    this.lastSelectedIndex = selectedIndex;
    this.lastInputMode = inputMode;
    this.lastSlotSignature = slotSignature;
    this.buttons.forEach((button, index) => {
      const selected = index === selectedIndex;
      const slot = this.game.input.getHotbarSlotAt?.(index) || EMPTY_HOTBAR_SLOT;
      const isEmpty = slot.id === EMPTY_HOTBAR_SLOT.id;
      const amount = !isEmpty && slot.inventoryItemId
        ? this.game.systems.inventory.getStoredAmount(slot.inventoryItemId)
        : 0;
      const itemName = slot.inventoryItemId
        ? this.game.systems.materials.getDisplayName(slot.inventoryItemId)
        : slot.label;
      const tooltip = isEmpty
        ? `Slot ${index + 1}: Empty`
        : `${itemName} x${this.formatCount(amount)}`;
      button.className = `tool-hotbar-slot tone-${slot.tone || 'empty'} ${isEmpty ? 'is-empty' : ''}`.trim();
      button.setAttribute('aria-label', isEmpty ? `Empty slot ${index + 1}` : `Select slot ${index + 1}: ${slot.label}`);
      button.title = tooltip;
      if (isEmpty) button.removeAttribute('data-item-tooltip');
      else button.dataset.itemTooltip = tooltip;
      button.innerHTML = `
        <kbd>${index + 1}</kbd>
        <span class="tool-hotbar-icon" aria-hidden="true">${slot.iconHtml || slot.icon || '+'}</span>
        ${!isEmpty && slot.inventoryItemId ? `<span class="tool-hotbar-count">x${this.formatCount(amount)}</span>` : ''}
        <strong>${slot.shortLabel || slot.label || 'Empty'}</strong>
      `;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
    const selectedSlot = this.game.input.getSelectedHotbarSlot?.() || EMPTY_HOTBAR_SLOT;
    this.element.style.setProperty('--selected-tool-color', this.getToneColor(selectedSlot?.tone));
  }

  getSlotSignature() {
    return (this.game.input.hotbarSlotIds || [])
      .map((slotId, index) => {
        const slot = this.game.input.getHotbarSlotAt?.(index, { ignoreOwnership: true })
          || EMPTY_HOTBAR_SLOT;
        const amount = slot.inventoryItemId ? this.game.systems.inventory.getStoredAmount(slot.inventoryItemId) : 0;
        return `${slotId || ''}:${amount}`;
      })
      .join('|');
  }

  formatCount(amount = 0) {
    const value = Math.max(0, Math.floor(Number(amount) || 0));
    if (value >= 1000000) return `${Math.floor(value / 100000) / 10}m`;
    if (value >= 10000) return `${Math.floor(value / 100) / 10}k`;
    return String(value);
  }

  getToneColor(tone = 'empty') {
    return {
      forge: '#d98642',
      tech: '#66d8e8',
      laser: '#6ee7ff',
      utility: '#b794ff',
      platform: '#7ee7ff',
      flag: '#ffd36b',
      torch: '#ffb45f',
      crafting: '#76f3ff',
      research: '#b794ff',
      furnace: '#ff9f43',
      stone: '#a7adb4',
      metal: '#c2a889',
      copper: '#d9824a',
      glass: '#8ee8ff',
      fire: '#ff9f43',
      redCrystal: '#ff6f7d',
      crystal: '#a988ff',
      empty: '#6d7480',
    }[tone] || '#d98642';
  }
}

export { HOTBAR_SLOT_COUNT };
