const DOOR_HEIGHT_TILES = 3;

const round1 = (value) => Math.round(value * 10) / 10;

function approach(current, target, amount) {
  if (current < target) return Math.min(target, current + amount);
  return Math.max(target, current - amount);
}

export class PlacedDoor {
  constructor({
    id = null,
    col = 0,
    topRow = 0,
    tileSize = 25,
    color = '#9fafbd',
    edge = '#26313d',
    accent = '#76f3ff',
    openDirection = 1,
    openAmount = 0,
  } = {}) {
    this.id = id || `door-${Date.now().toString(36)}-${Math.floor(Math.random() * 9999).toString(36)}`;
    this.col = Math.round(col);
    this.topRow = Math.round(topRow);
    this.tileSize = Math.max(8, Number(tileSize) || 25);
    this.color = color;
    this.edge = edge;
    this.accent = accent;
    this.openDirection = openDirection < 0 ? -1 : 1;
    this.openAmount = Math.max(0, Math.min(1, Number(openAmount) || 0));
    this.isOpen = this.openAmount > 0.5;
    this.closeDelay = 0;
  }

  static deserialize(data = {}) {
    return new PlacedDoor(data);
  }

  serialize() {
    return {
      id: this.id,
      col: this.col,
      topRow: this.topRow,
      tileSize: round1(this.tileSize),
      color: this.color,
      edge: this.edge,
      accent: this.accent,
      openDirection: this.openDirection,
    };
  }

  get row() {
    return this.topRow;
  }

  get bottomRow() {
    return this.topRow + DOOR_HEIGHT_TILES - 1;
  }

  get x() {
    return (this.col + 0.5) * this.tileSize;
  }

  get y() {
    return (this.topRow + DOOR_HEIGHT_TILES * 0.5) * this.tileSize;
  }

  get width() {
    return this.tileSize * 0.78;
  }

  get height() {
    return this.tileSize * DOOR_HEIGHT_TILES;
  }

  containsTile(col, row) {
    return col === this.col && row >= this.topRow && row <= this.bottomRow;
  }

  getFootprintTiles() {
    return Array.from({ length: DOOR_HEIGHT_TILES }, (_, index) => ({
      col: this.col,
      row: this.topRow + index,
    }));
  }

  isBlocking() {
    return !this.isOpen && this.openAmount < 0.18;
  }

  getCollisionAabb() {
    const insetY = this.tileSize * 0.08;
    return {
      left: this.x - this.width * 0.5,
      right: this.x + this.width * 0.5,
      top: this.topRow * this.tileSize + insetY,
      bottom: (this.topRow + DOOR_HEIGHT_TILES) * this.tileSize - insetY,
    };
  }

  update(delta, player = null) {
    const wasOpen = this.isOpen;
    const near = this.isPlayerNear(player);
    if (near) {
      this.openDirection = this.getApproachDirection(player);
      this.isOpen = true;
      this.closeDelay = 0.16;
    } else {
      this.closeDelay = Math.max(0, this.closeDelay - delta);
      if (this.closeDelay <= 0) this.isOpen = false;
    }

    const target = this.isOpen ? 1 : 0;
    const speed = (this.isOpen ? 11.5 : 7.5) * delta;
    this.openAmount = approach(this.openAmount, target, speed);
    return wasOpen !== this.isOpen;
  }

  isPlayerNear(player) {
    if (!player) return false;
    const dx = player.centerX - this.x;
    const dy = player.centerY - this.y;
    return Math.abs(dx) <= this.tileSize * 1.65
      && Math.abs(dy) <= this.height * 0.56 + this.tileSize * 0.72;
  }

  getApproachDirection(player) {
    if (!player) return this.openDirection || 1;
    if (Math.abs(player.vx || 0) > 16) return player.vx > 0 ? 1 : -1;
    const dx = player.centerX - this.x;
    if (Math.abs(dx) > 2) return dx < 0 ? 1 : -1;
    return this.openDirection || 1;
  }

  draw(ctx, { time = 0, ghost = false, valid = true } = {}) {
    PlacedDoor.drawShape(ctx, {
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height,
      tileSize: this.tileSize,
      openAmount: ghost ? 0 : this.openAmount,
      openDirection: this.openDirection,
      color: this.color,
      edge: this.edge,
      accent: this.accent,
      time,
      ghost,
      valid,
    });
  }

  static drawGhost(ctx, options = {}) {
    PlacedDoor.drawShape(ctx, {
      ...options,
      openAmount: 0,
      ghost: true,
    });
  }

  static drawShape(ctx, {
    x = 0,
    y = 0,
    width = 20,
    height = 75,
    tileSize = 25,
    openAmount = 0,
    openDirection = 1,
    color = '#9fafbd',
    edge = '#26313d',
    accent = '#76f3ff',
    time = 0,
    ghost = false,
    valid = true,
  } = {}) {
    const open = Math.max(0, Math.min(1, openAmount));
    const direction = openDirection < 0 ? -1 : 1;
    const bodyWidth = width * (1 - open) + tileSize * 0.22 * open;
    const hingeOffset = direction * tileSize * 0.36 * open;
    const bob = ghost ? Math.sin(time * 7) * 1.2 : 0;
    const drawX = x + hingeOffset;
    const top = -height * 0.5 + tileSize * 0.06 + bob;
    const drawHeight = height - tileSize * 0.12;
    const radius = Math.max(2, tileSize * 0.13 * (1 - open * 0.35));

    ctx.save();
    ctx.translate(drawX, y);
    ctx.globalAlpha *= ghost ? (valid ? 0.58 : 0.34) : 1;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    ctx.fillStyle = ghost
      ? (valid ? 'rgba(118, 243, 255, 0.22)' : 'rgba(255, 117, 111, 0.2)')
      : color;
    ctx.strokeStyle = ghost
      ? (valid ? 'rgba(118, 243, 255, 0.9)' : 'rgba(255, 117, 111, 0.84)')
      : edge;
    ctx.lineWidth = Math.max(1.4, tileSize * 0.08);
    ctx.beginPath();
    ctx.roundRect(-bodyWidth * 0.5, top, bodyWidth, drawHeight, radius);
    ctx.fill();
    ctx.stroke();

    const panelInset = Math.max(2, tileSize * 0.12);
    ctx.globalAlpha *= ghost ? 0.72 : 1;
    ctx.strokeStyle = ghost
      ? (valid ? 'rgba(255,255,255,0.62)' : 'rgba(255,210,210,0.45)')
      : 'rgba(255,255,255,0.34)';
    ctx.lineWidth = Math.max(1, tileSize * 0.045);
    if (open < 0.78) {
      const panelWidth = Math.max(2, bodyWidth - panelInset * 2);
      ctx.beginPath();
      ctx.roundRect(-panelWidth * 0.5, top + panelInset, panelWidth, drawHeight * 0.38, radius * 0.72);
      ctx.stroke();
      ctx.beginPath();
      ctx.roundRect(-panelWidth * 0.5, top + drawHeight * 0.53, panelWidth, drawHeight * 0.32, radius * 0.72);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(direction * -bodyWidth * 0.18, top + panelInset);
      ctx.lineTo(direction * -bodyWidth * 0.18, top + drawHeight - panelInset);
      ctx.stroke();
    }

    ctx.fillStyle = ghost ? 'rgba(255, 211, 107, 0.68)' : accent;
    const knobX = open < 0.78 ? bodyWidth * 0.22 : -direction * bodyWidth * 0.12;
    ctx.beginPath();
    ctx.arc(knobX, top + drawHeight * 0.54, Math.max(2, tileSize * 0.08), 0, Math.PI * 2);
    ctx.fill();

    if (!ghost && open > 0.06) {
      ctx.strokeStyle = `rgba(118, 243, 255, ${0.12 + open * 0.16})`;
      ctx.lineWidth = Math.max(1, tileSize * 0.04);
      ctx.beginPath();
      ctx.moveTo(-direction * tileSize * 0.48, top + 4);
      ctx.quadraticCurveTo(direction * tileSize * 0.28, top + drawHeight * 0.45, -direction * tileSize * 0.48, top + drawHeight - 4);
      ctx.stroke();
    }

    ctx.restore();
  }
}

export { DOOR_HEIGHT_TILES };
