export class TooltipManager {
  constructor({ root = document.body } = {}) {
    this.root = root;
    this.activeTarget = null;
    this.pointer = null;
    this.element = document.createElement('div');
    this.element.className = 'floating-tooltip';
    this.element.setAttribute('role', 'tooltip');
    this.element.setAttribute('aria-hidden', 'true');
    this.root.append(this.element);

    this.handlePointerOver = this.handlePointerOver.bind(this);
    this.handlePointerOut = this.handlePointerOut.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handleFocusIn = this.handleFocusIn.bind(this);
    this.handleFocusOut = this.handleFocusOut.bind(this);
    this.hide = this.hide.bind(this);

    document.addEventListener('pointerover', this.handlePointerOver, true);
    document.addEventListener('pointerout', this.handlePointerOut, true);
    document.addEventListener('pointermove', this.handlePointerMove, true);
    document.addEventListener('mouseover', this.handlePointerOver, true);
    document.addEventListener('mouseout', this.handlePointerOut, true);
    document.addEventListener('mousemove', this.handlePointerMove, true);
    document.addEventListener('focusin', this.handleFocusIn, true);
    document.addEventListener('focusout', this.handleFocusOut, true);
    window.addEventListener('resize', this.hide, { passive: true });
    window.addEventListener('scroll', this.hide, { passive: true, capture: true });
  }

  getTooltipTarget(target) {
    return target?.closest?.('[data-item-tooltip]') || null;
  }

  getTooltipText(target) {
    return String(target?.dataset?.itemTooltip || '').trim();
  }

  handlePointerOver(event) {
    const target = this.getTooltipTarget(event.target);
    if (!target) return;
    this.pointer = { x: event.clientX, y: event.clientY };
    this.show(target);
  }

  handlePointerOut(event) {
    if (!this.activeTarget) return;
    const leaving = this.getTooltipTarget(event.target);
    if (leaving !== this.activeTarget) return;
    if (event.relatedTarget && this.activeTarget.contains(event.relatedTarget)) return;
    this.hide();
  }

  handlePointerMove(event) {
    if (!this.activeTarget) return;
    this.pointer = { x: event.clientX, y: event.clientY };
    this.updateText();
    this.position();
  }

  handleFocusIn(event) {
    const target = this.getTooltipTarget(event.target);
    if (!target) return;
    this.pointer = null;
    this.show(target);
  }

  handleFocusOut(event) {
    if (this.getTooltipTarget(event.target) === this.activeTarget) this.hide();
  }

  show(target) {
    const text = this.getTooltipText(target);
    if (!text) {
      this.hide();
      return;
    }
    this.activeTarget = target;
    this.element.textContent = text;
    this.element.classList.add('is-visible');
    this.element.setAttribute('aria-hidden', 'false');
    this.position();
  }

  updateText() {
    if (!this.activeTarget?.isConnected) {
      this.hide();
      return;
    }
    const text = this.getTooltipText(this.activeTarget);
    if (!text) {
      this.hide();
      return;
    }
    if (this.element.textContent !== text) this.element.textContent = text;
  }

  position() {
    if (!this.activeTarget) return;
    const margin = 10;
    const targetRect = this.activeTarget.getBoundingClientRect();
    const anchor = this.pointer || {
      x: targetRect.left + targetRect.width * 0.5,
      y: targetRect.top,
    };
    const tooltipRect = this.element.getBoundingClientRect();
    let left = anchor.x + 14;
    let top = anchor.y - tooltipRect.height - 14;

    if (left + tooltipRect.width > window.innerWidth - margin) {
      left = anchor.x - tooltipRect.width - 14;
    }
    if (left < margin) left = margin;
    if (top < margin) top = anchor.y + 18;
    if (top + tooltipRect.height > window.innerHeight - margin) {
      top = window.innerHeight - tooltipRect.height - margin;
    }

    this.element.style.left = `${Math.round(left)}px`;
    this.element.style.top = `${Math.round(top)}px`;
  }

  hide() {
    this.activeTarget = null;
    this.pointer = null;
    this.element.classList.remove('is-visible');
    this.element.setAttribute('aria-hidden', 'true');
  }

  destroy() {
    document.removeEventListener('pointerover', this.handlePointerOver, true);
    document.removeEventListener('pointerout', this.handlePointerOut, true);
    document.removeEventListener('pointermove', this.handlePointerMove, true);
    document.removeEventListener('mouseover', this.handlePointerOver, true);
    document.removeEventListener('mouseout', this.handlePointerOut, true);
    document.removeEventListener('mousemove', this.handlePointerMove, true);
    document.removeEventListener('focusin', this.handleFocusIn, true);
    document.removeEventListener('focusout', this.handleFocusOut, true);
    window.removeEventListener('resize', this.hide, { passive: true });
    window.removeEventListener('scroll', this.hide, { passive: true, capture: true });
    this.element.remove();
  }
}
