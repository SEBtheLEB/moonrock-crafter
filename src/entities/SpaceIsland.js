import { PlacedFlag } from './PlacedFlag.js?v=158';
import { PlacedTorch } from './PlacedTorch.js?v=158';
import { PlacedPlatform } from './PlacedPlatform.js?v=158';
import { PlacedDoor } from './PlacedDoor.js?v=158';
import { gameBalance } from '../data/gameBalance.js?v=158';

const clamp01 = (value) => Math.max(0, Math.min(1, value));
const smoothStep = (value) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

export class SpaceIsland {
  constructor(data, terrain) {
    this.data = data;
    this.id = data.id;
    this.tag = data.tag || data.planetTag || '';
    this.planetTag = this.tag;
    this.name = data.name;
    this.x = data.worldPosition.x;
    this.y = data.worldPosition.y;
    this.biome = data.biome || 'scrap';
    this.kind = data.kind || 'poi';
    this.ringIndex = data.ringIndex ?? 0;
    this.circleName = data.circleName || 'Inner Circle';
    this.atmosphereClass = data.atmosphereClass || 'stable';
    this.gravityStabilizerRequirement = data.gravityStabilizerRequirement || 1;
    this.objectiveRole = data.objectiveRole || '';
    this.width = terrain?.width || data.size?.width || 1500;
    this.height = terrain?.height || data.size?.height || 760;
    this.radius = Math.min(this.width, this.height) * 0.39;
    this.landingZoneRadius = data.landingZoneRadius || Math.max(320, this.radius * 0.28);
    this.atmosphereDepth = data.atmosphereDepth || gameBalance.mining?.planetAtmosphereDepth || 5000;
    this.landingAngle = data.landingAngle ?? -Math.PI / 2;
    this.landingSurfaceLocal = data.landingSurfaceLocal || null;
    this.atmosphereRadius = data.atmosphereRadius || this.radius + this.atmosphereDepth;
    this.playerGravityRadius = data.playerGravityRadius
      || Math.hypot(this.width * 0.5, this.height * 0.5) + Math.max(620, this.landingZoneRadius * 1.75);
    this.gravityFieldRadius = data.gravityFieldRadius
      || this.atmosphereRadius;
    const savedShipAnchor = data.shipAnchor || null;
    if (savedShipAnchor?.landingSurfaceLocal) {
      this.landingAngle = savedShipAnchor.landingAngle ?? this.landingAngle;
      this.landingSurfaceLocal = savedShipAnchor.landingSurfaceLocal;
    }
    this.terrain = terrain;
    this.placedFlags = (data.placedFlags || []).map((flag) => PlacedFlag.deserialize(flag));
    this.placedTorches = (data.placedTorches || []).map((torch) => PlacedTorch.deserialize(torch));
    this.placedPlatforms = (data.placedPlatforms || []).map((platform) => PlacedPlatform.deserialize(platform));
    this.placedDoors = (data.placedDoors || []).map((door) => PlacedDoor.deserialize(door));
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

  getDisplayName() {
    return this.tag ? `${this.tag} ${this.name}` : this.name;
  }

  getAtmosphereLabel() {
    return this.atmosphereClass === 'dense' ? 'Dense Atmosphere' : 'Stable Atmosphere';
  }

  requiresUpgradedGravityStabilizer(level = 1) {
    return (this.gravityStabilizerRequirement || 1) > level;
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

  getPlayerExitLocal(playerSize = { width: 30, height: 60 }) {
    const local = this.getLandingLocal(36);
    return {
      x: local.x - (playerSize.width || 30) * 0.5,
      y: local.y - (playerSize.height || 60) * 0.48,
    };
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
    return this.getAtmosphereStrength(ship);
  }

  getAtmosphereStrength(ship) {
    const distance = Math.sqrt(this.distanceSqTo(ship));
    const local = this.worldToLocal(ship.x, ship.y);
    const angle = this.getAngleForLocal(local.x, local.y);
    const surfaceRadius = this.getSurfaceRadiusAtAngle(angle);
    const surfaceDistance = Math.max(0, distance - surfaceRadius);
    if (surfaceDistance >= this.atmosphereDepth) return 0;
    return smoothStep((this.atmosphereDepth - surfaceDistance) / Math.max(1, this.atmosphereDepth));
  }

  getSurfaceClearanceToPoint(x, y, extraRadius = 0) {
    const local = this.worldToLocal(x, y);
    const center = this.getCenterLocal();
    const dx = local.x - center.x;
    const dy = local.y - center.y;
    const angle = Math.atan2(dy, dx);
    const distance = Math.hypot(dx, dy);
    return distance - this.getSurfaceRadiusAtAngle(angle) - extraRadius;
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
    return distance < this.playerGravityRadius * 0.95;
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
    placedTorches = this.placedTorches,
    placedPlatforms = this.placedPlatforms,
    placedDoors = this.placedDoors,
    baseLab = null,
    placedCraftingStations = [],
    placedResearchStations = [],
    placedFurnaces = [],
    enemies = [],
    materialPickups = [],
    terrainDebug = null,
    drawCombatEffects = null,
    drawPlayerEquipment = null,
    drawMovementDebug = null,
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
    const torches = placedTorches || this.placedTorches || [];
    this.terrain.setExtraLightSources?.(torches.map((torch) => (
      typeof torch.getLightSource === 'function'
        ? torch.getLightSource({ time })
        : {
          id: torch.id,
          x: torch.x,
          y: torch.y - 42,
          color: torch.color || '#ff9f43',
          radius: 300,
          intensity: 0.9,
        }
    )));
    this.drawGravityField(ctx, gravityActive, gravityStrength, time);
    this.drawLandingAura(ctx, active, discovered, time);
    this.terrain.draw(ctx, { x: 0, y: 0 }, this.width, this.height, terrainDebug);
    this.terrain.drawDebug?.(ctx, terrainDebug);
    this.drawEmbeddedLights(ctx, time, discovered);
    baseLab?.draw?.(ctx, { time });
    (placedCraftingStations || []).forEach((station) => station.draw(ctx, { time }));
    (placedResearchStations || []).forEach((station) => station.draw(ctx, { time }));
    (placedFurnaces || []).forEach((furnace) => furnace.draw(ctx, { time }));
    (placedPlatforms || []).forEach((platform) => platform.draw(ctx, { time }));
    (placedDoors || []).forEach((door) => door.draw(ctx, { time }));
    (placedFlags || []).forEach((flag) => flag.draw(ctx, { time }));
    torches.forEach((torch) => torch.draw?.(ctx, { time }));
    (materialPickups || []).forEach((pickup) => pickup.drawLocal?.(ctx));
    (enemies || []).forEach((enemy) => enemy.draw?.(ctx, { time, viewRotation }));
    if (drawShip) this.drawParkedShip(ctx, ship, time, { broken: shipBroken });
    if (player) {
      ctx.save();
      ctx.translate(player.centerX, player.centerY);
      ctx.rotate(-viewRotation);
      ctx.translate(-player.centerX, -player.centerY);
      player.draw(ctx, { x: 0 }, time);
      drawPlayerEquipment?.(ctx);
      this.drawPlayerDepthShadow(ctx, player, time);
      ctx.restore();
    }
    drawCombatEffects?.(ctx);
    drawMovementDebug?.(ctx);
    ctx.restore();
  }

  getPlayerDepthDarkness(player) {
    if (!player || !this.terrain?.getDarknessAtWithLights) return 0;
    const samples = [
      [player.centerX, player.centerY],
      [player.centerX, player.y + 8],
      [player.centerX, player.y + player.height - 6],
      [player.x + 5, player.centerY],
      [player.x + player.width - 5, player.centerY],
    ];
    return samples.reduce((max, sample) => Math.max(max, this.terrain.getDarknessAtWithLights(sample[0], sample[1])), 0);
  }

  drawPlayerDepthShadow(ctx, player, time = 0) {
    const darkness = this.getPlayerDepthDarkness(player);
    if (darkness <= 0.035) return;
    const alpha = clamp01((darkness - 0.03) * 0.82);
    ctx.save();
    ctx.fillStyle = `rgba(2, 4, 10, ${alpha})`;
    ctx.beginPath();
    ctx.roundRect(player.x + 2.5, player.y, player.width - 5, player.height, 8);
    ctx.fill();
    if (alpha > 0.32) {
      ctx.globalAlpha = Math.min(0.22, alpha * 0.45);
      ctx.fillStyle = '#66d8e8';
      ctx.beginPath();
      ctx.arc(player.x + (player.facing > 0 ? 21 : 9), player.y + 18, 3.2 + Math.sin(time * 5) * 0.25, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawGravityField(ctx, active, strength, time) {
    const alpha = active ? 0.045 + strength * 0.075 : 0.018;
    const radius = this.gravityFieldRadius * 1.55;
    ctx.save();
    const center = this.getCenterLocal();
    ctx.translate(center.x, center.y);
    ctx.rotate(time * 0.11);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = active ? '#7bd8ff' : '#5e91bb';
    ctx.lineWidth = active ? 1.35 : 0.8;
    ctx.setLineDash([34, 34]);
    ctx.lineDashOffset = -time * 38;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.globalAlpha = alpha * 0.42;
    ctx.strokeStyle = active ? '#ffd36b' : '#7bd8ff';
    ctx.lineWidth = active ? 0.95 : 0.65;
    ctx.setLineDash([8, 46]);
    ctx.lineDashOffset = time * 28;
    ctx.rotate(-time * 0.24);
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.94, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  drawLandingAura(ctx, active, discovered, time) {
    const center = this.getCenterLocal();
    const radius = this.radius + this.landingZoneRadius * 1.08;
    ctx.save();
    ctx.globalAlpha = active ? 0.22 + Math.sin(time * 5) * 0.035 : discovered ? 0.055 : 0.025;
    ctx.strokeStyle = active ? '#ffd36b' : '#76f3ff';
    ctx.lineWidth = active ? 1.4 : 0.85;
    ctx.setLineDash(active ? [22, 22] : [8, 28]);
    ctx.lineDashOffset = -time * 24;
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
    ctx.stroke();
    if (active) {
      ctx.globalAlpha = 0.055 + Math.sin(time * 4) * 0.018;
      ctx.setLineDash([]);
      ctx.lineWidth = 10;
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
    const base = this.getLandingBaseLocal();
    const bob = Math.sin(time * 2.2) * 1.5;
    ctx.save();
    ctx.translate(base.x, base.y + 4);
    ctx.rotate(this.landingAngle + Math.PI / 2);
    ctx.fillStyle = 'rgba(2, 7, 13, 0.32)';
    ctx.beginPath();
    ctx.ellipse(0, 12, 112, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#263846';
    ctx.strokeStyle = 'rgba(3, 9, 15, 0.82)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-105, -10, 210, 18, 5);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(118, 243, 255, 0.38)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([14, 10]);
    ctx.beginPath();
    ctx.moveTo(-86, -1);
    ctx.lineTo(86, -1);
    ctx.stroke();
    ctx.restore();
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
