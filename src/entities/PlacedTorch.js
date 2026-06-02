const TORCH_HEIGHT = 56;
const TORCH_LIGHT_RADIUS = 300;
const TORCH_LIGHT_INTENSITY = 0.9;
const SUPPORT_NORMALS = {
  top: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
};

export function getTorchRotationForSupport(side = 'top') {
  const normal = SUPPORT_NORMALS[side] || SUPPORT_NORMALS.top;
  return Math.atan2(normal.y, normal.x) + Math.PI / 2;
}

const round1 = (value) => Math.round(value * 10) / 10;
const round4 = (value) => Math.round(value * 10000) / 10000;

export class PlacedTorch {
  constructor({
    id = null,
    x = 0,
    y = 0,
    rotation = 0,
    supportCol = -1,
    supportRow = -1,
    supportSide = 'top',
    color = '#ff9f43',
    accent = '#ffd36b',
  } = {}) {
    this.id = id || `torch-${Date.now().toString(36)}-${Math.floor(Math.random() * 9999).toString(36)}`;
    this.x = x;
    this.y = y;
    this.rotation = rotation;
    this.supportCol = Number.isFinite(supportCol) ? supportCol : -1;
    this.supportRow = Number.isFinite(supportRow) ? supportRow : -1;
    this.supportSide = supportSide || 'top';
    this.color = color;
    this.accent = accent;
  }

  static deserialize(data = {}) {
    return new PlacedTorch(data);
  }

  serialize() {
    return {
      id: this.id,
      x: round1(this.x),
      y: round1(this.y),
      rotation: round4(this.rotation),
      supportCol: this.supportCol,
      supportRow: this.supportRow,
      supportSide: this.supportSide,
      color: this.color,
      accent: this.accent,
    };
  }

  getLightSource() {
    const normal = SUPPORT_NORMALS[this.supportSide] || SUPPORT_NORMALS.top;
    return {
      id: this.id,
      x: this.x + normal.x * TORCH_HEIGHT * 0.72,
      y: this.y + normal.y * TORCH_HEIGHT * 0.72,
      color: this.color,
      radius: TORCH_LIGHT_RADIUS,
      intensity: TORCH_LIGHT_INTENSITY,
    };
  }

  draw(ctx, { time = 0, ghost = false } = {}) {
    PlacedTorch.drawShape(ctx, {
      x: this.x,
      y: this.y,
      rotation: this.rotation,
      time,
      ghost,
      color: this.color,
      accent: this.accent,
      supportSide: this.supportSide,
    });
  }

  static drawGhost(ctx, {
    x,
    y,
    viewRotation = 0,
    rotation = -viewRotation,
    time = 0,
    color = '#ff9f43',
    accent = '#ffd36b',
    supportSide = 'top',
  } = {}) {
    PlacedTorch.drawShape(ctx, {
      x,
      y,
      rotation,
      time,
      ghost: true,
      color,
      accent,
      supportSide,
    });
  }

  static drawShape(ctx, {
    x,
    y,
    rotation = 0,
    time = 0,
    ghost = false,
    color = '#ff9f43',
    accent = '#ffd36b',
    supportSide = 'top',
  } = {}) {
    const flicker = 0.86 + Math.sin(time * 14 + x * 0.037) * 0.08 + Math.sin(time * 23 + y * 0.019) * 0.05;
    const isWallMounted = supportSide === 'left' || supportSide === 'right';
    const isCeilingMounted = supportSide === 'bottom';
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.globalAlpha *= ghost ? 0.56 : 1;

    ctx.fillStyle = ghost ? 'rgba(255, 159, 67, 0.12)' : 'rgba(3, 9, 16, 0.3)';
    ctx.beginPath();
    ctx.ellipse(0, 4, isWallMounted ? 11 : 16, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = ghost ? 'rgba(255, 242, 207, 0.42)' : 'rgba(5, 12, 19, 0.68)';
    ctx.lineWidth = ghost ? 1.6 : 2.1;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    if (isWallMounted) {
      ctx.moveTo(0, 0);
      ctx.lineTo(8, -8);
      ctx.moveTo(0, 0);
      ctx.lineTo(8, 8);
    } else if (isCeilingMounted) {
      ctx.moveTo(-9, 0);
      ctx.lineTo(9, 0);
      ctx.moveTo(0, 0);
      ctx.lineTo(0, 8);
    } else {
      ctx.moveTo(-10, 0);
      ctx.lineTo(10, 0);
      ctx.moveTo(0, 0);
      ctx.lineTo(0, 8);
    }
    ctx.stroke();

    ctx.strokeStyle = ghost ? 'rgba(255, 242, 207, 0.5)' : 'rgba(5, 12, 19, 0.78)';
    ctx.lineWidth = ghost ? 1.8 : 2.3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -TORCH_HEIGHT * 0.64);
    ctx.stroke();

    ctx.strokeStyle = ghost ? 'rgba(255, 211, 107, 0.72)' : '#755033';
    ctx.lineWidth = ghost ? 3 : 4;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -TORCH_HEIGHT * 0.64);
    ctx.stroke();

    ctx.fillStyle = ghost ? 'rgba(255, 211, 107, 0.42)' : '#3b2a1d';
    ctx.strokeStyle = ghost ? 'rgba(255, 211, 107, 0.54)' : 'rgba(5, 12, 19, 0.72)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(-7, -TORCH_HEIGHT * 0.7, 14, 9, 3);
    ctx.fill();
    ctx.stroke();

    const flameY = -TORCH_HEIGHT * 0.82;
    if (!ghost) {
      const glow = ctx.createRadialGradient(0, flameY, 0, 0, flameY, 48 * flicker);
      glow.addColorStop(0, 'rgba(255, 211, 107, 0.36)');
      glow.addColorStop(0.45, 'rgba(255, 132, 62, 0.12)');
      glow.addColorStop(1, 'rgba(255, 132, 62, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, flameY, 48 * flicker, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.save();
    ctx.translate(0, flameY);
    ctx.scale(0.85 + flicker * 0.18, 0.9 + flicker * 0.16);
    ctx.fillStyle = ghost ? 'rgba(255, 159, 67, 0.64)' : color;
    ctx.strokeStyle = ghost ? 'rgba(255, 242, 207, 0.58)' : 'rgba(5, 12, 19, 0.44)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, -15);
    ctx.bezierCurveTo(13, -2, 8, 14, 0, 16);
    ctx.bezierCurveTo(-9, 13, -13, -1, 0, -15);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = ghost ? 'rgba(255, 242, 207, 0.42)' : accent;
    ctx.beginPath();
    ctx.moveTo(1, -7);
    ctx.bezierCurveTo(7, 2, 5, 10, 0, 11);
    ctx.bezierCurveTo(-5, 8, -5, 1, 1, -7);
    ctx.fill();
    ctx.restore();

    ctx.restore();
  }
}
