export class FloatingTextSystem {
  constructor({ maxItems = 24 } = {}) {
    this.maxItems = maxItems;
    this.items = [];
    this.pool = [];
  }

  update(delta) {
    let writeIndex = 0;
    for (let index = 0; index < this.items.length; index += 1) {
      const item = this.items[index];
      item.age += delta;
      item.y -= 24 * delta;
      if (item.age < 1.15) {
        this.items[writeIndex] = item;
        writeIndex += 1;
      } else {
        this.release(item);
      }
    }
    this.items.length = writeIndex;
  }

  add(x, y, text, { color = '#fff2cf', rarity = 'common' } = {}) {
    if (this.items.length >= this.maxItems) {
      const oldest = this.items.shift();
      if (oldest) this.release(oldest);
    }
    const item = this.pool.pop() || {};
    Object.assign(item, { x, y, text, color, rarity, age: 0 });
    this.items.push(item);
  }

  draw(ctx, camera) {
    ctx.save();
    ctx.font = '800 14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 4;
    this.items.forEach((item) => {
      const screen = camera.worldToScreen(item.x, item.y);
      ctx.globalAlpha = 1 - item.age / 1.15;
      ctx.strokeStyle = '#081626';
      ctx.fillStyle = item.color || '#fff2cf';
      if (item.rarity === 'rare' || item.rarity === 'epic') {
        ctx.shadowColor = item.color;
        ctx.shadowBlur = item.rarity === 'epic' ? 14 : 8;
      } else {
        ctx.shadowBlur = 0;
      }
      ctx.strokeText(item.text, screen.x, screen.y);
      ctx.fillText(item.text, screen.x, screen.y);
    });
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  release(item) {
    if (this.pool.length < this.maxItems) this.pool.push(item);
  }

  clear() {
    this.items.length = 0;
    this.pool.length = 0;
  }
}
