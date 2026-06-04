const LAB_DEFAULT_WIDTH = 390;
const LAB_DEFAULT_HEIGHT = 178;

const clamp01 = (value) => Math.max(0, Math.min(1, value));

export class BaseLab {
  constructor({
    id = 'starter-base-lab',
    x = 0,
    y = 0,
    width = LAB_DEFAULT_WIDTH,
    height = LAB_DEFAULT_HEIGHT,
    rotation = 0,
    doorSide = 'left',
    cellSize = 25,
    leftCol = null,
    rightCol = null,
    floorRow = null,
    ceilingRow = null,
    interiorHeightCells = null,
    buildVersion = 1,
    window = null,
    supportCols = [],
    doorCells = null,
  } = {}) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.rotation = rotation;
    this.doorSide = doorSide;
    this.cellSize = cellSize;
    this.leftCol = leftCol;
    this.rightCol = rightCol;
    this.floorRow = floorRow;
    this.ceilingRow = ceilingRow;
    this.interiorHeightCells = interiorHeightCells;
    this.buildVersion = buildVersion;
    this.window = window;
    this.supportCols = supportCols;
    this.doorCells = doorCells;
    this.doorOpen = 0;
    this.doorTarget = 0;
  }

  static deserialize(data = {}) {
    return new BaseLab(data);
  }

  serialize() {
    return {
      id: this.id,
      x: Math.round(this.x * 10) / 10,
      y: Math.round(this.y * 10) / 10,
      width: Math.round(this.width),
      height: Math.round(this.height),
      rotation: Math.round(this.rotation * 10000) / 10000,
      doorSide: this.doorSide,
      cellSize: this.cellSize,
      leftCol: this.leftCol,
      rightCol: this.rightCol,
      floorRow: this.floorRow,
      ceilingRow: this.ceilingRow,
      interiorHeightCells: this.interiorHeightCells,
      buildVersion: this.buildVersion,
      window: this.window,
      supportCols: this.supportCols,
      doorCells: this.doorCells,
    };
  }

  get left() {
    return this.x - this.width * 0.5;
  }

  get right() {
    return this.x + this.width * 0.5;
  }

  get top() {
    return this.y - this.height;
  }

  get bottom() {
    return this.y;
  }

  getCraftingStationPoint() {
    if (Number.isFinite(this.leftCol) && this.cellSize) {
      return {
        x: (this.leftCol + 16.5) * this.cellSize,
        y: this.y - this.cellSize * 0.06,
        rotation: this.rotation,
      };
    }
    return {
      x: this.x,
      y: this.y - 8,
      rotation: this.rotation,
    };
  }

  getResearchStationPoint() {
    if (Number.isFinite(this.leftCol) && this.cellSize) {
      return {
        x: (this.leftCol + 26.5) * this.cellSize,
        y: this.y,
        rotation: this.rotation,
      };
    }
    return {
      x: this.x + this.width * 0.22,
      y: this.y - 8,
      rotation: this.rotation,
    };
  }

  getSpawnPoint(playerSize = { width: 30, height: 60 }) {
    if (Number.isFinite(this.leftCol) && this.cellSize) {
      return {
        x: (this.leftCol + 3.2) * this.cellSize - playerSize.width * 0.5,
        y: this.y - playerSize.height - this.cellSize * 0.35,
      };
    }
    return {
      x: this.x - playerSize.width * 0.5,
      y: this.y - playerSize.height - 12,
    };
  }

  containsPoint(x, y, padding = 0) {
    return x >= this.left - padding
      && x <= this.right + padding
      && y >= this.top - padding
      && y <= this.bottom + padding;
  }

  containsPlayer(player, padding = 18) {
    if (!player) return false;
    return this.containsPoint(player.centerX, player.centerY, padding);
  }

  update(delta, player = null) {
    this.doorTarget = this.containsPlayer(player, 34) ? 1 : 0;
    this.doorOpen += (this.doorTarget - this.doorOpen) * Math.min(1, delta * 9);
  }

  draw(ctx, { time = 0 } = {}) {
    const w = this.width;
    const h = this.height;
    const block = this.cellSize || 25;

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);

    ctx.fillStyle = 'rgba(2, 7, 12, 0.22)';
    ctx.beginPath();
    ctx.ellipse(0, block * 0.68, w * 0.54, block * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.globalAlpha = 0.52;
    ctx.strokeStyle = 'rgba(161, 181, 199, 0.22)';
    ctx.lineWidth = 1.2;
    for (let x = -w * 0.5 + block; x < w * 0.5; x += block) {
      ctx.beginPath();
      ctx.moveTo(x, -h + block * 0.9);
      ctx.lineTo(x, -block * 0.45);
      ctx.stroke();
    }
    for (let y = -h + block; y < -block * 0.5; y += block) {
      ctx.beginPath();
      ctx.moveTo(-w * 0.5 + block * 0.8, y);
      ctx.lineTo(w * 0.5 - block * 0.8, y);
      ctx.stroke();
    }
    ctx.restore();

    const glow = 0.55 + Math.sin(time * 2.4) * 0.12;
    const windowX = this.window
      ? (this.window.col * block - this.x)
      : -w * 0.36;
    const windowY = this.window
      ? (this.window.row * block - this.y)
      : -h + block * 2;
    const windowW = this.window ? this.window.width * block : block * 5;
    const windowH = this.window ? this.window.height * block : block * 2;
    ctx.fillStyle = 'rgba(5, 13, 22, 0.72)';
    ctx.strokeStyle = 'rgba(9, 18, 30, 0.82)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(windowX, windowY, windowW, windowH, block * 0.16);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = `rgba(112, 225, 255, ${0.22 + glow * 0.1})`;
    ctx.beginPath();
    ctx.roundRect(windowX + block * 0.22, windowY + block * 0.2, windowW - block * 0.44, windowH - block * 0.4, block * 0.12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(118, 243, 255, 0.22)';
    ctx.beginPath();
    ctx.moveTo(windowX + windowW * 0.5, windowY + block * 0.22);
    ctx.lineTo(windowX + windowW * 0.5, windowY + windowH - block * 0.22);
    ctx.stroke();

    this.drawCeilingSignals(ctx, block, time);

    ctx.restore();
  }

  drawCeilingSignals(ctx, block, time) {
    const top = -this.height + block * 0.35;
    const blink = 0.45 + Math.sin(time * 3.4) * 0.18;
    const lights = [-this.width * 0.23, 0, this.width * 0.23];
    lights.forEach((x, index) => {
      ctx.save();
      ctx.translate(x, top);
      ctx.fillStyle = index === 1 ? `rgba(118, 243, 255, ${blink})` : `rgba(255, 211, 107, ${blink * 0.88})`;
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.roundRect(-block * 0.38, -block * 0.08, block * 0.76, block * 0.16, block * 0.08);
      ctx.fill();
      ctx.restore();
    });
  }

  drawConsoleHint(ctx, point, color, accent) {
    ctx.save();
    ctx.translate(point.x - this.x, point.y - this.y);
    ctx.scale(0.54, 0.54);
    ctx.fillStyle = '#16232d';
    ctx.strokeStyle = 'rgba(2, 7, 13, 0.78)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(-48, -64, 96, 56, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.roundRect(-34, -52, 68, 22, 5);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(0, -18, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
