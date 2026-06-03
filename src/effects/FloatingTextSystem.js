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
      item.pop = Math.max(0, (item.pop || 0) - delta * 3.8);
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

  addStacked(x, y, { key, label, amount = 1, color = '#fff2cf', rarity = 'common' } = {}) {
    if (!key) {
      this.add(x, y, `${label || 'Item'} x${amount}`, { color, rarity });
      return;
    }
    const existing = this.items.find((item) => item.stackKey === key);
    if (existing) {
      existing.stackAmount = (existing.stackAmount || 0) + amount;
      existing.text = `${label || existing.stackLabel || 'Item'} x${existing.stackAmount}`;
      existing.stackLabel = label || existing.stackLabel || 'Item';
      existing.x = existing.x * 0.45 + x * 0.55;
      existing.y = existing.y * 0.45 + y * 0.55;
      existing.color = color;
      existing.rarity = rarity;
      existing.age = 0;
      existing.pop = 1;
      return;
    }
    if (this.items.length >= this.maxItems) {
      const oldest = this.items.shift();
      if (oldest) this.release(oldest);
    }
    const item = this.pool.pop() || {};
    Object.assign(item, {
      x,
      y,
      text: `${label || 'Item'} x${amount}`,
      color,
      rarity,
      age: 0,
      pop: 1,
      stackKey: key,
      stackLabel: label || 'Item',
      stackAmount: amount,
    });
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
      const scale = 1 + (item.pop || 0) * 0.13;
      ctx.save();
      ctx.translate(screen.x, screen.y);
      ctx.scale(scale, scale);
      ctx.translate(-screen.x, -screen.y);
      ctx.strokeText(item.text, screen.x, screen.y);
      ctx.fillText(item.text, screen.x, screen.y);
      ctx.restore();
    });
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  release(item) {
    item.stackKey = '';
    item.stackLabel = '';
    item.stackAmount = 0;
    if (this.pool.length < this.maxItems) this.pool.push(item);
  }

  clear() {
    this.items.length = 0;
    this.pool.length = 0;
  }
}
