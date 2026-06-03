import { drawGameArtTexture, isGameArtReady } from '../data/gameArt.js?v=158';

const SIZE_PROFILES = {
  pebble: { width: 34, height: 24, radius: 22, health: 0.38, yield: 1 },
  rock: { width: 66, height: 46, radius: 40, health: 0.92, yield: 2 },
  boulder: { width: 118, height: 82, radius: 68, health: 1.75, yield: 5 },
  giant: { width: 168, height: 112, radius: 94, health: 2.65, yield: 8 },
};

const clamp01 = (value) => Math.max(0, Math.min(1, value));

function hashString(value) {
  let hash = 2166136261;
  const text = String(value || '');
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createRandom(seedValue) {
  let seed = Math.floor(seedValue) >>> 0;
  return () => {
    seed += 0x6D2B79F5;
    let value = seed;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function angleDifference(from, to) {
  let value = to - from;
  while (value > Math.PI) value -= Math.PI * 2;
  while (value < -Math.PI) value += Math.PI * 2;
  return value;
}

function pickKind(random, forcedKind = '') {
  if (SIZE_PROFILES[forcedKind]) return forcedKind;
  const roll = random();
  if (roll < 0.22) return 'pebble';
  if (roll < 0.72) return 'rock';
  if (roll < 0.94) return 'boulder';
  return 'giant';
}

function getSegmentCircleHit(start, end, center, radius) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const fx = start.x - center.x;
  const fy = start.y - center.y;
  const a = dx * dx + dy * dy;
  if (a <= 0.0001) return null;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - radius * radius;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;
  const root = Math.sqrt(discriminant);
  const t0 = (-b - root) / (2 * a);
  const t1 = (-b + root) / (2 * a);
  const t = t0 >= 0 && t0 <= 1 ? t0 : (t1 >= 0 && t1 <= 1 ? t1 : null);
  if (t === null) return null;
  const distance = Math.sqrt(a) * t;
  return {
    x: start.x + dx * t,
    y: start.y + dy * t,
    distance,
    t,
  };
}

export class PlanetSurfaceIronNode {
  constructor(data = {}) {
    const profile = SIZE_PROFILES[data.kind] || SIZE_PROFILES.rock;
    this.id = data.id || `iron-rock-${Math.round(data.x || 0)}-${Math.round(data.y || 0)}`;
    this.kind = SIZE_PROFILES[data.kind] ? data.kind : 'rock';
    this.materialId = 'ironDust';
    this.x = Number(data.x) || 0;
    this.y = Number(data.y) || 0;
    this.surfaceX = Number(data.surfaceX) || this.x;
    this.surfaceY = Number(data.surfaceY) || this.y;
    this.angle = Number(data.angle) || 0;
    this.seed = Number(data.seed) || hashString(this.id);
    this.width = Number(data.width) || profile.width;
    this.height = Number(data.height) || profile.height;
    this.radius = Number(data.radius) || profile.radius;
    this.maxHealth = Number(data.maxHealth) || profile.health;
    this.health = Number.isFinite(data.health) ? Number(data.health) : this.maxHealth;
    this.yield = Math.max(1, Math.round(Number(data.yield) || profile.yield));
    this.active = data.active !== false && this.health > 0;
    this.flash = 0;
  }

  static generateForIsland(island = {}, terrain = null) {
    if (!terrain) return [];
    const seed = hashString(`${island.id || island.name}:surface-iron:${terrain.seed || 1}:${island.terrainRevision || 0}`);
    const random = createRandom(seed);
    const nodes = [];
    const addNode = (angle, kind = '', salt = nodes.length) => {
      const nodeSeed = hashString(`${seed}:${salt}:${angle.toFixed(4)}:${kind || 'auto'}`);
      nodes.push(PlanetSurfaceIronNode.createAtAngle({
        island,
        terrain,
        angle,
        kind: pickKind(random, kind),
        seed: nodeSeed,
        id: `iron-rock-${island.id || 'planet'}-${salt}`,
      }));
    };

    if (island.type === 'crashPlanet') {
      [
        [-Math.PI / 2 - 0.74, 'rock'],
        [-Math.PI / 2 - 0.52, 'pebble'],
        [-Math.PI / 2 + 0.48, 'boulder'],
        [-Math.PI / 2 + 0.66, 'rock'],
        [-Math.PI / 2 + 1.08, 'pebble'],
        [-Math.PI / 2 - 1.12, 'rock'],
      ].forEach(([angle, kind], index) => addNode(angle, kind, `starter-${index}`));
      return nodes.filter(Boolean);
    }

    const sizeFactor = Math.max(0.85, Math.min(2.2, Math.min(terrain.width, terrain.height) / 2600));
    const baseCount = Math.round(3 + sizeFactor * 2 + random() * 3);
    const clusterCount = Math.max(2, Math.min(5, Math.round(baseCount / 2)));
    let salt = 0;
    for (let cluster = 0; cluster < clusterCount; cluster += 1) {
      let centerAngle = random() * Math.PI * 2;
      if (Number.isFinite(island.landingAngle) && Math.abs(angleDifference(centerAngle, island.landingAngle)) < 0.28) {
        centerAngle += 0.45 + random() * 0.35;
      }
      const items = 1 + Math.floor(random() * 3);
      for (let item = 0; item < items; item += 1) {
        if (nodes.length >= baseCount) break;
        const angle = centerAngle + (random() - 0.5) * (0.18 + random() * 0.26);
        addNode(angle, '', salt);
        salt += 1;
      }
    }
    return nodes.filter(Boolean);
  }

  static createAtAngle({ island = {}, terrain, angle = 0, kind = 'rock', seed = 1, id = '' } = {}) {
    const profile = SIZE_PROFILES[kind] || SIZE_PROFILES.rock;
    const random = createRandom(seed);
    const sample = terrain.getSurfacePointAtAngle?.(angle, 0) || {
      x: terrain.planetCenterX + Math.cos(angle) * terrain.planetRadius,
      y: terrain.planetCenterY + Math.sin(angle) * terrain.planetRadius,
    };
    const outward = { x: Math.cos(angle), y: Math.sin(angle) };
    const width = profile.width * (0.88 + random() * 0.24);
    const height = profile.height * (0.88 + random() * 0.24);
    return new PlanetSurfaceIronNode({
      id,
      kind,
      seed,
      x: sample.x + outward.x * height * 0.46,
      y: sample.y + outward.y * height * 0.46,
      surfaceX: sample.x,
      surfaceY: sample.y,
      angle,
      width,
      height,
      radius: Math.max(profile.radius, width * 0.45, height * 0.58),
      maxHealth: profile.health,
      health: profile.health,
      yield: profile.yield,
      active: true,
      islandId: island.id,
    });
  }

  static deserialize(data) {
    return new PlanetSurfaceIronNode(data);
  }

  serialize() {
    return {
      id: this.id,
      kind: this.kind,
      materialId: this.materialId,
      x: Math.round(this.x * 10) / 10,
      y: Math.round(this.y * 10) / 10,
      surfaceX: Math.round(this.surfaceX * 10) / 10,
      surfaceY: Math.round(this.surfaceY * 10) / 10,
      angle: Math.round(this.angle * 10000) / 10000,
      seed: this.seed,
      width: Math.round(this.width * 10) / 10,
      height: Math.round(this.height * 10) / 10,
      radius: Math.round(this.radius * 10) / 10,
      maxHealth: this.maxHealth,
      health: Math.max(0, Math.round(this.health * 1000) / 1000),
      yield: this.yield,
      active: this.active,
    };
  }

  get damageRatio() {
    return 1 - clamp01(this.health / Math.max(0.001, this.maxHealth));
  }

  update(delta) {
    this.flash = Math.max(0, this.flash - delta);
  }

  raycast(start, end) {
    if (!this.active) return null;
    const hit = getSegmentCircleHit(start, end, { x: this.x, y: this.y }, this.radius);
    if (!hit) return null;
    return {
      ...hit,
      material: 2,
      nodeType: 'surfaceIron',
      node: this,
      ratio: this.damageRatio,
    };
  }

  mine(power, delta) {
    if (!this.active) return false;
    this.health = Math.max(0, this.health - Math.max(0, power) * Math.max(0, delta));
    this.flash = 0.12;
    if (this.health > 0) return false;
    this.active = false;
    return true;
  }

  draw(ctx, { time = 0 } = {}) {
    if (!this.active) return;
    const outward = { x: Math.cos(this.angle), y: Math.sin(this.angle) };
    const tangent = { x: -outward.y, y: outward.x };
    const wobble = Math.sin(time * 1.6 + this.seed * 0.01) * 0.5;
    ctx.save();
    ctx.transform(tangent.x, tangent.y, outward.x, outward.y, this.surfaceX, this.surfaceY);
    if (this.flash > 0) ctx.filter = 'brightness(1.45)';
    ctx.globalAlpha = 0.36;
    ctx.fillStyle = '#050910';
    ctx.beginPath();
    ctx.ellipse(0, -2, this.width * 0.5, Math.max(6, this.height * 0.11), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    this.drawRockShape(ctx, wobble);
    this.drawCracks(ctx);
    ctx.restore();
  }

  drawRockShape(ctx, wobble = 0) {
    const w = this.width;
    const h = this.height;
    const chip = (this.seed % 17) / 17;
    const points = [
      { x: -w * 0.5, y: 0 },
      { x: -w * (0.42 - chip * 0.04), y: h * 0.42 },
      { x: -w * 0.22, y: h * (0.78 + chip * 0.08) },
      { x: w * 0.05, y: h + wobble },
      { x: w * 0.32, y: h * (0.78 - chip * 0.05) },
      { x: w * 0.5, y: h * 0.16 },
      { x: w * 0.45, y: 0 },
    ];
    ctx.save();
    ctx.beginPath();
    points.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.closePath();
    ctx.clip();
    const textureReady = isGameArtReady() && drawGameArtTexture(ctx, 'ironOreTile', -w * 0.52, -h * 0.02, w * 1.05, h * 1.08, {
      seed: this.seed,
      tint: '#c2a889',
      sourceJitter: 0.22,
    });
    if (!textureReady) {
      const gradient = ctx.createLinearGradient(-w * 0.5, 0, w * 0.35, h);
      gradient.addColorStop(0, '#d2b58f');
      gradient.addColorStop(0.38, '#8f7660');
      gradient.addColorStop(1, '#4e4b52');
      ctx.fillStyle = gradient;
      ctx.fillRect(-w * 0.55, -h * 0.08, w * 1.1, h * 1.16);
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(20, 23, 29, 0.82)';
    ctx.lineWidth = Math.max(2.2, w * 0.035);
    ctx.lineJoin = 'round';
    ctx.beginPath();
    points.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.closePath();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 224, 172, 0.32)';
    ctx.lineWidth = Math.max(1, w * 0.012);
    ctx.beginPath();
    ctx.moveTo(-w * 0.34, h * 0.3);
    ctx.lineTo(-w * 0.1, h * 0.55);
    ctx.lineTo(w * 0.18, h * 0.42);
    ctx.stroke();
  }

  drawCracks(ctx) {
    if (this.damageRatio <= 0.05) return;
    const w = this.width;
    const h = this.height;
    const alpha = clamp01(0.18 + this.damageRatio * 0.54);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = '#1c1512';
    ctx.lineWidth = Math.max(1.2, w * 0.014);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-w * 0.08, h * 0.86);
    ctx.lineTo(-w * 0.01, h * 0.62);
    ctx.lineTo(w * 0.14, h * 0.48);
    if (this.damageRatio > 0.44) {
      ctx.moveTo(w * 0.08, h * 0.56);
      ctx.lineTo(w * 0.25, h * 0.32);
      ctx.moveTo(-w * 0.02, h * 0.63);
      ctx.lineTo(-w * 0.24, h * 0.42);
    }
    ctx.stroke();
    ctx.restore();
  }

  drawTargetGlow(ctx, time = 0) {
    if (!this.active) return;
    const pulse = 0.65 + Math.sin(time * 8 + this.seed * 0.01) * 0.18;
    ctx.save();
    ctx.strokeStyle = `rgba(255, 210, 140, ${0.48 + pulse * 0.18})`;
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 6]);
    ctx.lineDashOffset = -time * 28;
    ctx.beginPath();
    ctx.ellipse(this.x, this.y, this.radius * 0.92, this.radius * 0.64, this.angle, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }
}
