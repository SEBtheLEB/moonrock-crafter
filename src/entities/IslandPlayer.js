const WIDTH = 30;
const HEIGHT = 60;
const COLLIDER_INSET_X = 3;
const COLLIDER_INSET_TOP = 1;
const COLLIDER_INSET_BOTTOM = 0;
const MAX_STEP_HEIGHT = 22;
const GROUND_SNAP_DISTANCE = 18;
const FOOT_PROBE_INSET = 2;

export class IslandPlayer {
  constructor({ x = 170, y = 0 } = {}) {
    this.x = x;
    this.y = y;
    this.previousY = y;
    this.width = WIDTH;
    this.height = HEIGHT;
    this.vx = 0;
    this.vy = 0;
    this.facing = 1;
    this.onGround = false;
    this.health = 100;
    this.maxHealth = 100;
    this.hitCooldown = 0;
    this.step = 0;
    this.groundGraceTimer = 0;
    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
    this.animationState = 'idle';
    this.landingCompression = 0;
    this.groundNormal = { x: 0, y: -1 };
  }

  get centerX() {
    return this.x + this.width / 2;
  }

  get centerY() {
    return this.y + this.height / 2;
  }

  get bounds() {
    return {
      left: this.x,
      right: this.x + this.width,
      top: this.y,
      bottom: this.y + this.height,
    };
  }

  get collisionBounds() {
    return this.getCollisionBoundsAt(this.x, this.y);
  }

  getCollisionBoundsAt(x = this.x, y = this.y) {
    return {
      left: x + COLLIDER_INSET_X,
      right: x + this.width - COLLIDER_INSET_X,
      top: y + COLLIDER_INSET_TOP,
      bottom: y + this.height - COLLIDER_INSET_BOTTOM,
    };
  }

  terrainCollisionAt(x, y, terrain) {
    const bounds = this.getCollisionBoundsAt(x, y);
    return terrain.collidesAabb(bounds.left, bounds.top, bounds.right, bounds.bottom);
  }

  update(delta, input, world, terrain = null) {
    const dt = Math.min(delta, 0.05);
    const wasOnGround = this.onGround;
    this.previousY = this.y;
    this.hitCooldown = Math.max(0, this.hitCooldown - dt);
    const moveX = Math.max(-1, Math.min(1, input.moveX || 0));
    if (Math.abs(moveX) > 0.05) {
      this.vx += (moveX * 235 - this.vx) * Math.min(1, dt * 14);
      this.facing = moveX > 0 ? 1 : -1;
      this.step += dt * 8;
    } else {
      this.vx *= Math.max(0, 1 - dt * 13);
      if (Math.abs(this.vx) < 1) this.vx = 0;
    }
    if (input.jumpPressed && this.onGround) {
      this.vy = -590;
      this.onGround = false;
    }
    this.vy += (world.gravity ?? 1560) * dt;
    this.x += this.vx * dt;
    if (terrain) this.resolveHorizontal(world, terrain);
    this.y += this.vy * dt;
    if (terrain) {
      this.resolveVertical(world, terrain);
      this.snapToGround(world, terrain, wasOnGround);
    } else {
      this.resolve(world);
    }
  }

  resolve(world) {
    if (!world.allowExitBounds) this.x = Math.max(24, Math.min(world.width - this.width - 24, this.x));
    this.onGround = false;
    if (this.y + this.height >= world.floorY) {
      this.y = world.floorY - this.height;
      this.vy = 0;
      this.onGround = true;
    }
  }

  resolveHorizontal(world, terrain) {
    if (!world.allowExitBounds) this.x = Math.max(24, Math.min(world.width - this.width - 24, this.x));
    if (!this.terrainCollisionAt(this.x, this.y, terrain)) return;

    if (this.onGround && this.vy >= 0) {
      const originalY = this.y;
      for (let step = 2; step <= MAX_STEP_HEIGHT; step += 2) {
        if (!this.terrainCollisionAt(this.x, originalY - step, terrain)) {
          this.y = originalY - step;
          return;
        }
      }
    }

    const direction = Math.sign(this.vx) || 1;
    for (let i = 0; i < 72; i += 1) {
      this.x -= direction;
      if (!this.terrainCollisionAt(this.x, this.y, terrain)) break;
    }
    this.vx = 0;
  }

  resolveVertical(world, terrain) {
    this.onGround = false;
    if (!this.terrainCollisionAt(this.x, this.y, terrain)) {
      if (!world.allowFreefall && this.y > world.height + 180) {
        this.y = Math.max(0, terrain.getSurfaceY(world.landingX || 150) - this.height - 4);
        this.vy = 0;
      }
      return;
    }
    const direction = Math.sign(this.vy) || 1;
    for (let i = 0; i < 120; i += 1) {
      this.y -= direction;
      if (!this.terrainCollisionAt(this.x, this.y, terrain)) break;
    }
    if (direction > 0) this.onGround = true;
    this.vy = 0;
  }

  snapToGround(world, terrain, wasOnGround = false) {
    if (this.vy < 0) return;
    const bounds = this.collisionBounds;
    const snapDistance = wasOnGround || this.onGround ? GROUND_SNAP_DISTANCE : 5;
    const groundY = terrain.sampleGroundY(
      bounds.left + FOOT_PROBE_INSET,
      bounds.right - FOOT_PROBE_INSET,
      bounds.bottom - MAX_STEP_HEIGHT,
      bounds.bottom + snapDistance,
    );
    if (groundY === null) return;
    const delta = groundY - bounds.bottom;
    if (delta < -MAX_STEP_HEIGHT || delta > snapDistance) return;
    this.y += delta;
    this.vy = 0;
    this.onGround = true;
  }

  damage(amount, sourceX = this.centerX) {
    if (this.hitCooldown > 0) return false;
    this.health = Math.max(0, this.health - amount);
    this.hitCooldown = 0.8;
    this.vx += this.centerX < sourceX ? -190 : 190;
    this.vy = Math.min(this.vy, -180);
    return true;
  }

  draw(ctx, camera, time) {
    const x = this.x - camera.x;
    const y = this.y;
    const bob = this.onGround ? Math.sin(this.step) * Math.min(3, Math.abs(this.vx) / 70) : 0;
    const compression = Math.max(0, this.landingCompression || 0);
    const squashX = 1 + compression * 0.16;
    const squashY = 1 - compression * 0.2;
    ctx.save();
    ctx.translate(x + this.width / 2, y + bob + this.height / 2);
    ctx.scale(squashX, squashY);
    if (this.hitCooldown > 0 && Math.sin(time * 32) > 0) ctx.globalAlpha = 0.55;
    ctx.translate(-this.width / 2, -this.height / 2);

    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(this.width / 2, this.height + 4, 14, 3.8, 0, 0, Math.PI * 2);
    ctx.fill();

    const bodyGradient = ctx.createLinearGradient(0, 1, 0, this.height - 1);
    bodyGradient.addColorStop(0, '#f3e9ce');
    bodyGradient.addColorStop(0.5, '#d7c59a');
    bodyGradient.addColorStop(1, '#ae8554');
    ctx.fillStyle = bodyGradient;
    ctx.strokeStyle = 'rgba(6, 13, 22, 0.72)';
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.roundRect(3, 1, 24, 58, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = 'rgba(194, 111, 52, 0.36)';
    ctx.beginPath();
    ctx.roundRect(6, 39, 18, 8, 3);
    ctx.fill();

    ctx.fillStyle = '#101a24';
    ctx.beginPath();
    ctx.roundRect(6, 12, 18, 12, 4);
    ctx.fill();

    const visorGradient = ctx.createLinearGradient(6, 12, 24, 24);
    visorGradient.addColorStop(0, 'rgba(102, 216, 232, 0.9)');
    visorGradient.addColorStop(1, 'rgba(102, 216, 232, 0.28)');
    ctx.fillStyle = visorGradient;
    ctx.beginPath();
    ctx.roundRect(this.facing > 0 ? 14 : 7, 15, 8, 5, 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(40, 36, 32, 0.45)';
    ctx.fillRect(7, 54, 6, 4);
    ctx.fillRect(17, 54, 6, 4);

    ctx.fillStyle = 'rgba(102, 216, 232, 0.5)';
    ctx.beginPath();
    ctx.arc(this.facing > 0 ? 6 : 24, 8, 2.2 + Math.sin(time * 2.8) * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
