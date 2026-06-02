export class PlacedPlatform {
  constructor({
    id = `platform-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    col = 0,
    row = 0,
    x = 0,
    y = 0,
    angle = 0,
    length = 24,
    thickness = 6,
    color = '#a9c7d8',
    edge = '#273647',
  } = {}) {
    this.id = id;
    this.col = Math.round(col);
    this.row = Math.round(row);
    this.x = Number(x) || 0;
    this.y = Number(y) || 0;
    this.angle = Number(angle) || 0;
    this.length = Math.max(8, Number(length) || 24);
    this.thickness = Math.max(3, Number(thickness) || 6);
    this.color = color;
    this.edge = edge;
  }

  getFrame() {
    const cos = Math.cos(this.angle);
    const sin = Math.sin(this.angle);
    return {
      tangent: { x: cos, y: sin },
      outward: { x: sin, y: -cos },
    };
  }

  getSurfacePoint() {
    const frame = this.getFrame();
    return {
      x: this.x + frame.outward.x * this.thickness * 0.5,
      y: this.y + frame.outward.y * this.thickness * 0.5,
    };
  }

  serialize() {
    return {
      id: this.id,
      col: this.col,
      row: this.row,
      x: Math.round(this.x * 10) / 10,
      y: Math.round(this.y * 10) / 10,
      angle: Math.round(this.angle * 10000) / 10000,
      length: Math.round(this.length * 10) / 10,
      thickness: Math.round(this.thickness * 10) / 10,
      color: this.color,
      edge: this.edge,
    };
  }

  static deserialize(data) {
    return new PlacedPlatform(data || {});
  }

  draw(ctx, { time = 0, ghost = false, valid = true } = {}) {
    const shimmer = ghost ? 1 + Math.sin(time * 9) * 0.04 : 1;
    const width = this.length * shimmer;
    const height = this.thickness;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    ctx.globalAlpha = ghost ? (valid ? 0.58 : 0.34) : 1;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    const left = -width * 0.5;
    const top = -height * 0.5;
    ctx.fillStyle = ghost ? (valid ? 'rgba(118, 243, 255, 0.28)' : 'rgba(255, 117, 111, 0.24)') : this.color;
    ctx.strokeStyle = ghost ? (valid ? 'rgba(118, 243, 255, 0.9)' : 'rgba(255, 117, 111, 0.82)') : this.edge;
    ctx.lineWidth = Math.max(1.2, height * 0.32);
    ctx.beginPath();
    ctx.roundRect(left, top, width, height, Math.max(2, height * 0.5));
    ctx.fill();
    ctx.stroke();

    ctx.globalAlpha *= ghost ? 0.6 : 0.42;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.72)';
    ctx.lineWidth = Math.max(1, height * 0.18);
    ctx.beginPath();
    ctx.moveTo(left + width * 0.16, top + height * 0.24);
    ctx.lineTo(left + width * 0.84, top + height * 0.24);
    ctx.stroke();
    ctx.restore();
  }
}
