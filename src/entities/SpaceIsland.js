import { PlacedFlag } from './PlacedFlag.js?v=93';

const clamp01 = (value) => Math.max(0, Math.min(1, value));
const smoothStep = (value) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

export class SpaceIsland {
  constructor(data, terrain) {
    this.data = data;
    this.id = data.id;
    this.name = data.name;
    this.x = data.worldPosition.x;
    this.y = data.worldPosition.y;
    this.biome = data.biome || 'scrap';
    this.kind = data.kind || 'poi';
    this.width = terrain?.width || data.size?.width || 1500;
    this.height = terrain?.height || data.size?.height || 760;
    this.radius = Math.min(this.width, this.height) * 0.39;
    this.landingZoneRadius = data.landingZoneRadius || Math.max(320, this.radius * 0.28);
    this.landingAngle = data.landingAngle ?? -Math.PI / 2;
    this.landingSurfaceLocal = data.landingSurfaceLocal || null;
    this.gravityFieldRadius = data.gravityFieldRadius
      || Math.hypot(this.width * 0.5, this.height * 0.5) + Math.max(620, this.landingZoneRadius * 1.75);
    this.terrain = terrain;
    this.placedFlags = (data.placedFlags || []).map((flag) => PlacedFlag.deserialize(flag));
    this.world = {
      width: this.width,
      height: this.height,
      floorY: terrain?.landingY || this.height * 0.62,
      landingX: terrain?.landingX || this.width * 0.22,
      gravity: 1560,
      allowExitBounds: true,
      allowFreefall: true,
    };
  }

  get left() {
    return this.x - this.width / 2;
  }

  get top() {
    return this.y - this.height / 2;
  }

  distanceSqTo(ship) {
    return this.distanceSqToPoint(ship.x, ship.y);
  }

  distanceSqToPoint(x, y) {
    const dx = x - this.x;
    const dy = y - this.y;
    return dx * dx + dy * dy;
  }

  worldToLocal(x, y) {
    return {
      x: x - this.left,
      y: y - this.top,
    };
  }

  localToWorld(x, y) {
    return this.localToWorldRotated(x, y, 0);
  }

  localToWorldRotated(x, y, viewRotation = 0) {
    if (Math.abs(viewRotation) < 0.0001) {
      return {
        x: this.left + x,
        y: this.top + y,
      };
    }
    const center = this.getCenterLocal();
    const dx = x - center.x;
    const dy = y - center.y;
    const cos = Math.cos(viewRotation);
    const sin = Math.sin(viewRotation);
    return {
      x: this.x + dx * cos - dy * sin,
      y: this.y + dx * sin + dy * cos,
    };
  }

  worldToLocalRotated(x, y, viewRotation = 0) {
    if (Math.abs(viewRotation) < 0.0001) return this.worldToLocal(x, y);
    const dx = x - this.x;
    const dy = y - this.y;
    const cos = Math.cos(-viewRotation);
    const sin = Math.sin(-viewRotation);
    const center = this.getCenterLocal();
    return {
      x: center.x + dx * cos - dy * sin,
      y: center.y + dx * sin + dy * cos,
    };
  }

  getCenterLocal() {
    return {
      x: this.terrain?.planetCenterX || this.width * 0.5,
      y: this.terrain?.planetCenterY || this.height * 0.5,
    };
  }

  getSurfaceLocalAtAngle(angle, offset = 0) {
    if (this.terrain?.getSurfacePointAtAngle) return this.terrain.getSurfacePointAtAngle(angle, offset);
    const center = this.getCenterLocal();
    const radius = this.radius + offset;
    return {
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius,
      radius,
    };
  }

  getSurfaceRadiusAtAngle(angle) {
    return this.terrain?.getSurfaceRadiusAtAngle?.(angle) || this.radius;
  }

  getAngleForLocal(x, y) {
    const center = this.getCenterLocal();
    return Math.atan2(y - center.y, x - center.x);
  }

  setLandingAngleFromWorld(worldX, worldY) {
    const local = this.worldToLocal(worldX, worldY);
    this.landingAngle = this.getAngleForLocal(local.x, local.y);
    this.landingSurfaceLocal = null;
  }

  setLandingTargetLocal(local) {
    if (!local) {
      this.landingSurfaceLocal = null;
      return;
    }
    this.landingAngle = this.getAngleForLocal(local.x, local.y);
    this.landingSurfaceLocal = {
      x: local.x,
      y: local.y,
    };
  }

  getLandingWorldPoint(viewRotation = 0) {
    const local = this.getLandingLocal();
    return this.localToWorldRotated(local.x, local.y, viewRotation);
  }

  getShipParkWorldPoint(viewRotation = 0) {
    const local = this.getShipParkLocal();
    return this.localToWorldRotated(local.x, local.y, viewRotation);
  }

  getShipParkLocal() {
    return this.getLandingLocal(96);
  }

  getPlayerExitLocal() {
    const local = this.getLandingLocal(36);
    return { x: local.x - 17, y: local.y - 29 };
  }

  getLandingBaseLocal() {
    if (this.landingSurfaceLocal) {
      return {
        x: this.landingSurfaceLocal.x,
        y: this.landingSurfaceLocal.y,
        radius: Math.hypot(
          this.landingSurfaceLocal.x - this.getCenterLocal().x,
          this.landingSurfaceLocal.y - this.getCenterLocal().y,
        ),
      };
    }
    return this.getSurfaceLocalAtAngle(this.landingAngle, 0);
  }

  getLandingLocal(offset = 0) {
    const base = this.getLandingBaseLocal();
    return {
      x: base.x + Math.cos(this.landingAngle) * offset,
      y: base.y + Math.sin(this.landingAngle) * offset,
      radius: base.radius + offset,
    };
  }

  isNearLandingZone(ship) {
    const local = this.worldToLocal(ship.x, ship.y);
    const center = this.getCenterLocal();
    const dx = local.x - center.x;
    const dy = local.y - center.y;
    const distance = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);
    const surfaceRadius = this.getSurfaceRadiusAtAngle(angle);
    const innerRadius = surfaceRadius + 46;
    const outerRadius = surfaceRadius + this.landingZoneRadius;
    return distance >= innerRadius && distance <= outerRadius;
  }

  getGravityFieldStrength(ship) {
    const distance = Math.sqrt(this.distanceSqTo(ship));
    if (distance >= this.gravityFieldRadius) return 0;
    const fullStrengthRadius = Math.max(this.radius * 0.9, this.gravityFieldRadius * 0.5);
    if (distance <= fullStrengthRadius) return 1;
    const falloff = (this.gravityFieldRadius - distance) / Math.max(1, this.gravityFieldRadius - fullStrengthRadius);
    return smoothStep(falloff);
  }

  isPlayerNearShip(player) {
    const ship = this.getShipParkLocal();
    const dx = player.centerX - ship.x;
    const dy = player.centerY - ship.y;
    return dx * dx + dy * dy < 132 * 132;
  }

  containsPlayerInGravity(player) {
    const center = this.getCenterLocal();
    const distance = Math.hypot(player.centerX - center.x, player.centerY - center.y);
    return distance < this.gravityFieldRadius * 0.95;
  }

  draw(ctx, camera, {
    active = false,
    discovered = false,
    gravityActive = false,
    gravityStrength = 0,
    time = 0,
    player = null,
    drawShip = false,
    ship = null,
    shipBroken = false,
    viewRotation = 0,
    anchorLocal = null,
    anchorWorld = null,
    placedFlags = this.placedFlags,
    placedCraftingStations = [],
    placedFurnaces = [],
  } = {}) {
    if (!this.terrain) return;
    const screen = anchorLocal && anchorWorld
      ? camera.worldToScreen(anchorWorld.x, anchorWorld.y)
      : camera.worldToScreen(this.x, this.y);
    ctx.save();
    ctx.translate(screen.x, screen.y);
    ctx.rotate(viewRotation);
    if (anchorLocal && anchorWorld) ctx.translate(-anchorLocal.x, -anchorLocal.y);
    else ctx.translate(-this.width / 2, -this.height / 2);
    this.drawGravityField(ctx, gravityActive, gravityStrength, time);
    this.drawLandingAura(ctx, active, discovered, time);
    this.terrain.draw(ctx, { x: 0, y: 0 }, this.width, this.height);
    this.drawEmbeddedLights(ctx, time, discovered);
    (placedCraftingStations || []).forEach((station) => station.draw(ctx, { time }));
    (placedFurnaces || []).forEach((furnace) => furnace.draw(ctx, { time, tileSize: this.terrain?.cellSize }));
    (placedFlags || []).forEach((flag) => flag.draw(ctx, { time }));
    if (drawShip) this.drawParkedShip(ctx, ship, time, { broken: shipBroken });
    if (player) {
      ctx.save();
      ctx.translate(player.centerX, player.centerY);
      ctx.rotate(-viewRotation);
      ctx.translate(-player.centerX, -player.centerY);
      player.draw(ctx, { x: 0 }, time);
      ctx.restore();
    }
    ctx.restore();
  }

  drawGravityField(ctx, active, strength, time) {
    const alpha = active ? 0.16 + strength * 0.22 : 0.055;
    const radius = this.gravityFieldRadius;
    ctx.save();
    const center = this.getCenterLocal();
    ctx.translate(center.x, center.y);
    ctx.rotate(time * 0.11);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = active ? '#7bd8ff' : '#5e91bb';
    ctx.lineWidth = active ? 3 : 1.5;
    ctx.setLineDash([28, 24]);
    ctx.lineDashOffset = -time * 72;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.globalAlpha = alpha * 0.72;
    ctx.strokeStyle = active ? '#ffd36b' : '#7bd8ff';
    ctx.lineWidth = active ? 2 : 1;
    ctx.setLineDash([10, 34]);
    ctx.lineDashOffset = time * 54;
    ctx.rotate(-time * 0.24);
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.84, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  drawLandingAura(ctx, active, discovered, time) {
    const center = this.getCenterLocal();
    const radius = this.radius + this.landingZoneRadius * 0.78;
    ctx.save();
    ctx.globalAlpha = active ? 0.42 + Math.sin(time * 5) * 0.08 : discovered ? 0.16 : 0.08;
    ctx.strokeStyle = active ? '#ffd36b' : '#76f3ff';
    ctx.lineWidth = active ? 3 : 1.5;
    ctx.setLineDash(active ? [20, 14] : [10, 20]);
    ctx.lineDashOffset = -time * 46;
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
    ctx.stroke();
    if (active) {
      ctx.globalAlpha = 0.16 + Math.sin(time * 4) * 0.04;
      ctx.setLineDash([]);
      ctx.lineWidth = 18;
      ctx.beginPath();
      ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawEmbeddedLights(ctx, time, discovered) {
    const palette = {
      scrap: '#76f3ff',
      forest: '#57c77c',
      crystal: '#8ee8ff',
      ember: '#ff8f3d',
    };
    const accent = palette[this.biome] || '#76f3ff';
    ctx.save();
    ctx.globalAlpha = discovered ? 0.82 : 0.48;
    ctx.fillStyle = accent;
    ctx.shadowColor = accent;
    ctx.shadowBlur = 14;
    for (let i = 0; i < 4; i += 1) {
      const x = ((i * 337 + this.width * 0.23) % Math.max(1, this.width * 0.72)) + this.width * 0.12;
      const y = this.height * (0.38 + ((i * 19) % 24) / 100);
      const pulse = 2 + Math.sin(time * 2.4 + i) * 0.8;
      ctx.beginPath();
      ctx.arc(x, y, Math.max(2, pulse), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawParkedShip(ctx, ship, time, { broken = false } = {}) {
    const landing = this.getShipParkLocal();
    const bob = Math.sin(time * 2.2) * 1.5;
    if (ship?.drawAt) {
      ship.drawAt(
        ctx,
        landing.x,
        landing.y + bob,
        this.landingAngle,
        { moveVector: { x: 0, y: 0 } },
        { boost: false },
      );
      if (broken) this.drawBrokenShipSparks(ctx, landing.x, landing.y + bob, time);
      return;
    }
    ctx.save();
    ctx.translate(landing.x, landing.y + bob);
    ctx.rotate(this.landingAngle + Math.PI / 2 - 0.04);
    ctx.fillStyle = '#f4e6c3';
    ctx.strokeStyle = 'rgba(8, 17, 26, 0.62)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(76, 8);
    ctx.lineTo(24, -24);
    ctx.lineTo(-58, -14);
    ctx.lineTo(-78, 12);
    ctx.lineTo(-38, 34);
    ctx.lineTo(36, 30);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#66d8e8';
    ctx.beginPath();
    ctx.ellipse(4, 0, 20, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    if (ship) {
      ctx.fillStyle = 'rgba(255, 143, 61, 0.22)';
      ctx.beginPath();
      ctx.ellipse(-62, 15, 18, 8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    if (broken) this.drawBrokenShipSparks(ctx, landing.x, landing.y + bob, time);
  }

  drawBrokenShipSparks(ctx, x, y, time) {
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = 0.65 + Math.sin(time * 8) * 0.18;
    ctx.strokeStyle = '#ff9f43';
    ctx.lineWidth = 2;
    for (let index = 0; index < 3; index += 1) {
      const phase = time * 9 + index * 1.7;
      const sx = -34 + index * 26 + Math.sin(phase) * 5;
      const sy = 18 + Math.cos(phase) * 4;
      ctx.beginPath();
      ctx.moveTo(sx - 4, sy);
      ctx.lineTo(sx + 5, sy - 7);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(12, 18, 24, 0.46)';
    ctx.beginPath();
    ctx.ellipse(-54 + Math.sin(time * 2.1) * 2, 22 - time % 1 * 12, 18, 8, -0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
