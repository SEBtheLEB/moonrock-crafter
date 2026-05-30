const PLAYER_WIDTH = 42;
const PLAYER_HEIGHT = 68;
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

    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.beginPath();
    ctx.ellipse(this.width / 2, this.height + 7, 22, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffd36b';
    ctx.strokeStyle = '#102033';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(6, 21, 30, 38, 12);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ff8f3d';
    ctx.beginPath();
    ctx.roundRect(8, 17, 26, 16, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#fff2cf';
    ctx.beginPath();
    ctx.roundRect(10, 7, 22, 22, 9);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#102033';
    const eyeX = this.facing > 0 ? 24 : 15;
    ctx.beginPath();
    ctx.arc(eyeX, 17, 2.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#102033';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(this.facing > 0 ? 33 : 9, 37);
    ctx.lineTo(this.facing > 0 ? 42 : 0, 47 + Math.sin(time * 6) * 2);
    ctx.moveTo(15, 58);
    ctx.lineTo(11, 69);
    ctx.moveTo(27, 58);
    ctx.lineTo(31, 69);
    ctx.stroke();

    ctx.fillStyle = 'rgba(118, 243, 255, 0.55)';
    ctx.beginPath();
    ctx.arc(this.facing > 0 ? 6 : 36, 11, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
