import { drawPlayerSpriteAnimation } from '../data/playerSpriteSheet.js?v=182';

const PLAYER_WIDTH = 34;
const PLAYER_HEIGHT = 58;
const MOVE_ACCELERATION = 14;
const GROUND_DRAG = 13;
const AIR_DRAG = 4.5;
const MAX_RUN_SPEED = 255;
const JUMP_SPEED = 610;
const GRAVITY = 1680;

export class StationPlayer {
  constructor({ x = 520, y = 0 } = {}) {
    this.x = x;
    this.y = y;
    this.previousY = y;
    this.width = PLAYER_WIDTH;
    this.height = PLAYER_HEIGHT;
    this.vx = 0;
    this.vy = 0;
    this.facing = 1;
    this.onGround = false;
    this.stepTimer = 0;
    this.squash = 0;
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

  update(delta, input, world) {
    const dt = Math.min(delta, 0.05);
    this.previousY = this.y;
    const moveX = Math.max(-1, Math.min(1, input.moveX || 0));

    if (Math.abs(moveX) > 0.05) {
      const targetSpeed = moveX * MAX_RUN_SPEED;
      this.vx += (targetSpeed - this.vx) * Math.min(1, MOVE_ACCELERATION * dt);
      this.facing = moveX > 0 ? 1 : -1;
      this.stepTimer += dt * Math.abs(moveX) * 8;
    } else {
      const drag = this.onGround ? GROUND_DRAG : AIR_DRAG;
      this.vx *= Math.max(0, 1 - drag * dt);
      if (Math.abs(this.vx) < 1) this.vx = 0;
    }

    if (input.jumpPressed && this.onGround) {
      this.vy = -JUMP_SPEED;
      this.onGround = false;
      this.squash = 1;
    }

    this.vy += (world.gravity || GRAVITY) * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.resolveCollisions(world);
    this.squash = Math.max(0, this.squash - dt * 5);
  }

  resolveCollisions(world) {
    this.x = Math.max(world.minX || 0, Math.min((world.width || 0) - this.width, this.x));
    this.onGround = false;

    for (const platform of world.platforms || []) {
      if (this.vy < 0) continue;
      const previousBottom = this.previousY + this.height;
      const currentBottom = this.y + this.height;
      const withinX = this.x + this.width > platform.x && this.x < platform.x + platform.width;
      const landed = previousBottom <= platform.y + 8 && currentBottom >= platform.y;
      if (withinX && landed) {
        this.y = platform.y - this.height;
        this.vy = 0;
        this.onGround = true;
      }
    }

    if (this.y + this.height >= world.floorY) {
      this.y = world.floorY - this.height;
      if (this.vy > 0 && !this.onGround) this.squash = Math.max(this.squash, 0.35);
      this.vy = 0;
      this.onGround = true;
    }
  }

  snapToGround(world) {
    this.y = world.floorY - this.height;
    this.vy = 0;
    this.onGround = true;
  }

  draw(ctx, camera, time) {
    const sx = Math.round(this.x - camera.x);
    const sy = Math.round(this.y);
    const walkBob = this.onGround ? Math.sin(this.stepTimer) * Math.min(3, Math.abs(this.vx) / 62) : 0;
    const squashY = 1 - this.squash * 0.08;
    const squashX = 1 + this.squash * 0.08;

    ctx.save();
    ctx.translate(sx + this.width / 2, sy + this.height / 2 + walkBob);
    ctx.scale(squashX, squashY);
    ctx.translate(-this.width / 2, -this.height / 2);

    const spriteState = !this.onGround ? 'jump' : Math.abs(this.vx) > 18 ? 'run' : 'idle';
    if (spriteState && drawPlayerSpriteAnimation(ctx, {
      state: spriteState,
      time,
      width: this.width,
      height: this.height,
      facing: this.facing,
      velocityY: this.vy,
    })) {
      ctx.restore();
      return;
    }

    const bodyGradient = ctx.createLinearGradient(0, 6, 0, this.height - 4);
    bodyGradient.addColorStop(0, '#f1e6c8');
    bodyGradient.addColorStop(0.52, '#d9c79a');
    bodyGradient.addColorStop(1, '#b9915e');
    ctx.fillStyle = bodyGradient;
    ctx.strokeStyle = 'rgba(8, 17, 26, 0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(5, 8, 24, 45, 12);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = 'rgba(217, 134, 66, 0.38)';
    ctx.beginPath();
    ctx.roundRect(8, 36, 18, 9, 5);
    ctx.fill();

    ctx.fillStyle = '#101923';
    ctx.beginPath();
    ctx.roundRect(8, 14, 18, 13, 7);
    ctx.fill();

    const visorGradient = ctx.createLinearGradient(8, 14, 26, 27);
    visorGradient.addColorStop(0, 'rgba(102, 216, 232, 0.9)');
    visorGradient.addColorStop(1, 'rgba(102, 216, 232, 0.28)');
    ctx.fillStyle = visorGradient;
    ctx.beginPath();
    ctx.roundRect(this.facing > 0 ? 15 : 8, 17, 9, 5, 3);
    ctx.fill();

    ctx.fillStyle = 'rgba(102, 216, 232, 0.5)';
    ctx.beginPath();
    ctx.arc(this.facing > 0 ? 7 : 27, 10, 2.6 + Math.sin(time * 2.8) * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
