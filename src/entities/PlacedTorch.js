import { drawGameArtSprite, isGameArtReady } from '../data/gameArt.js?v=158';

const TORCH_HEIGHT = 38;
const TORCH_VISUAL_SCALE = 0.62;
const TORCH_LIGHT_RADIUS = 155;
const TORCH_LIGHT_INTENSITY = 0.68;
const TORCH_IGNITE_DURATION = 0.8;
const SUPPORT_NORMALS = {
  top: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  back: { x: 0, y: 0 },
};

export function getTorchRotationForSupport(side = 'top') {
  if (side === 'back') return 0;
  if (side === 'right') return Math.atan2(-0.72, 0.7) + Math.PI / 2;
  if (side === 'left') return Math.atan2(-0.72, -0.7) + Math.PI / 2;
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
    igniteStart = -Infinity,
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
    this.igniteStart = Number.isFinite(igniteStart) ? igniteStart : -Infinity;
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

  getIgniteProgress(time = Infinity) {
    if (!Number.isFinite(this.igniteStart)) return 1;
    return Math.max(0, Math.min(1, (time - this.igniteStart) / TORCH_IGNITE_DURATION));
  }

  getLightSource({ time = Infinity } = {}) {
    const normal = SUPPORT_NORMALS[this.supportSide] || SUPPORT_NORMALS.top;
    return {
      id: this.id,
      x: this.x + normal.x * TORCH_HEIGHT * TORCH_VISUAL_SCALE * 0.72,
      y: this.y + normal.y * TORCH_HEIGHT * TORCH_VISUAL_SCALE * 0.72,
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
      ignite: ghost ? 1 : this.getIgniteProgress(time),
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
    ignite = 1,
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
      ignite,
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
    ignite = 1,
  } = {}) {
    const flicker = 0.86 + Math.sin(time * 14 + x * 0.037) * 0.08 + Math.sin(time * 23 + y * 0.019) * 0.05;
    const isWallMounted = supportSide === 'left' || supportSide === 'right';
    const isCeilingMounted = supportSide === 'bottom';
    const isBackMounted = supportSide === 'back';
    const lightFade = Math.max(0, Math.min(1, ignite));
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.scale(TORCH_VISUAL_SCALE, TORCH_VISUAL_SCALE);
    ctx.globalAlpha *= ghost ? 0.56 : (0.58 + lightFade * 0.42);

    ctx.fillStyle = ghost ? 'rgba(255, 159, 67, 0.12)' : 'rgba(3, 9, 16, 0.3)';
    ctx.beginPath();
    ctx.ellipse(0, 4, isWallMounted ? 7 : isBackMounted ? 10 : 12, isBackMounted ? 5.5 : 3.6, 0, 0, Math.PI * 2);
    ctx.fill();

    if (isGameArtReady()) {
      const flameY = -TORCH_HEIGHT * 0.82;
      drawGameArtSprite(ctx, 'torch', 0, -TORCH_HEIGHT * 0.38, 20, 42, {
        alpha: ghost ? 0.72 : 1,
      });
      if (!ghost) {
        const glowRadius = 32 * flicker * (0.35 + lightFade * 0.65);
        const glow = ctx.createRadialGradient(0, flameY, 0, 0, flameY, glowRadius);
        glow.addColorStop(0, `rgba(255, 211, 107, ${0.28 * lightFade})`);
        glow.addColorStop(0.45, `rgba(255, 132, 62, ${0.09 * lightFade})`);
        glow.addColorStop(1, 'rgba(255, 132, 62, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(0, flameY, glowRadius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      return;
    }

    ctx.strokeStyle = ghost ? 'rgba(255, 242, 207, 0.42)' : 'rgba(5, 12, 19, 0.68)';
    ctx.lineWidth = ghost ? 1.35 : 1.8;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    if (isBackMounted) {
      ctx.moveTo(-7, 0);
      ctx.lineTo(7, 0);
      ctx.moveTo(-5, -5);
      ctx.lineTo(5, 5);
    } else if (isWallMounted) {
      ctx.moveTo(0, 0);
      ctx.lineTo(7, -6);
      ctx.moveTo(0, 0);
      ctx.lineTo(7, 6);
    } else if (isCeilingMounted) {
      ctx.moveTo(-7, 0);
      ctx.lineTo(7, 0);
      ctx.moveTo(0, 0);
      ctx.lineTo(0, 6);
    } else {
      ctx.moveTo(-8, 0);
      ctx.lineTo(8, 0);
      ctx.moveTo(0, 0);
      ctx.lineTo(0, 6);
    }
    ctx.stroke();

    ctx.strokeStyle = ghost ? 'rgba(255, 242, 207, 0.5)' : 'rgba(5, 12, 19, 0.78)';
    ctx.lineWidth = ghost ? 1.55 : 1.9;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -TORCH_HEIGHT * 0.64);
    ctx.stroke();

    ctx.strokeStyle = ghost ? 'rgba(255, 211, 107, 0.72)' : '#755033';
    ctx.lineWidth = ghost ? 2.2 : 3;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -TORCH_HEIGHT * 0.64);
    ctx.stroke();

    ctx.fillStyle = ghost ? 'rgba(255, 211, 107, 0.42)' : '#3b2a1d';
    ctx.strokeStyle = ghost ? 'rgba(255, 211, 107, 0.54)' : 'rgba(5, 12, 19, 0.72)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(-5.2, -TORCH_HEIGHT * 0.7, 10.4, 7.2, 2.4);
    ctx.fill();
    ctx.stroke();

    const flameY = -TORCH_HEIGHT * 0.82;
    if (!ghost) {
      const glowRadius = 32 * flicker * (0.35 + lightFade * 0.65);
      const glow = ctx.createRadialGradient(0, flameY, 0, 0, flameY, glowRadius);
      glow.addColorStop(0, `rgba(255, 211, 107, ${0.28 * lightFade})`);
      glow.addColorStop(0.45, `rgba(255, 132, 62, ${0.09 * lightFade})`);
      glow.addColorStop(1, 'rgba(255, 132, 62, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, flameY, glowRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.save();
    ctx.translate(0, flameY);
    ctx.scale(0.62 + flicker * 0.14, 0.68 + flicker * 0.13);
    ctx.globalAlpha *= ghost ? 1 : (0.35 + lightFade * 0.65);
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
