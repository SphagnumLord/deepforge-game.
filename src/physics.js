import Matter from "matter-js";
import { BALANCE, TOOLS, damage } from "./core.js";
const { Engine, Bodies, Body, Composite, Events } = Matter;
export const FIELD = {
  width: 420,
  height: 560,
  top: 151,
  left: 21,
  cell: 54,
  rowHeight: 36,
};
export function blockRect(b) {
  return {
    x: FIELD.left + b.col * FIELD.cell,
    y: FIELD.top + b.row * FIELD.rowHeight,
    w: FIELD.cell,
    h: FIELD.rowHeight,
  };
}
export const prizePosition = (col) => ({ x: FIELD.left + col * FIELD.cell + FIELD.cell / 2, y: 530 });

export class MinePhysics {
  constructor(
    blocks,
    { onHit = () => {}, onBossHit = () => {}, onRetire = () => {},
      onCollect = () => {}, onBombHit = () => {}, goals = [] } = {},
  ) {
    this.engine = Engine.create({ gravity: { x: 0, y: 1.05 } });
    this.blocks = new Map();
    this.tools = [];
    this.pending = new Map();
    this.rewards = new Map();
    this.time = 0;
    this.onHit = onHit;
    this.onBossHit = onBossHit;
    this.boss = null;
    this.onRetire = onRetire;
    this.onCollect = onCollect;
    this.onBombHit = onBombHit;
    Composite.add(this.engine.world, [
      Bodies.rectangle(-9, 250, 24, 800, { isStatic: true, restitution: 0.85 }),
      Bodies.rectangle(429, 250, 24, 800, {
        isStatic: true,
        restitution: 0.85,
      }),
      Bodies.rectangle(210, -26, 460, 30, {
        isStatic: true,
        restitution: 0.75,
      }),
    ]);
    for (const b of blocks.filter((b) => b.alive)) {
      const r = blockRect(b),
        body = Bodies.rectangle(
          r.x + r.w / 2,
          r.y + r.h / 2,
          r.w - 3,
          r.h - 3,
          {
            isStatic: true,
            chamfer: { radius: 2 },
            restitution: 0.65,
            friction: 0.02,
          },
        );
      body.plugin.block = b.id;
      this.blocks.set(b.id, body);
      Composite.add(this.engine.world, body);
    }
    for (const goal of goals.filter((goal) => !goal.claimed)) {
      const { x, y } = prizePosition(goal.col);
      const body = Bodies.rectangle(x, y, 40, 26, { isStatic: true, isSensor: true });
      body.plugin.reward = goal.col;
      this.rewards.set(goal.col, body);
      Composite.add(this.engine.world, body);
    }
    const collisions = (event) => {
      for (const { bodyA, bodyB } of event.pairs) {
        const body = bodyA.plugin.tool
          ? bodyA
          : bodyB.plugin.tool
            ? bodyB
            : null;
        const brick =
          bodyA.plugin.block !== undefined || bodyA.plugin.boss || bodyA.plugin.reward !== undefined
            ? bodyA
            : bodyB.plugin.block !== undefined || bodyB.plugin.boss || bodyB.plugin.reward !== undefined
              ? bodyB
              : null;
        if (!body || !brick) continue;
        const tool = body.plugin.tool,
          key = `${body.id}:${brick.id}`;
        if (this.time - (tool.lastHit.get(brick.id) ?? -Infinity) > 220)
          this.pending.set(key, { tool, brick });
      }
    };
    Events.on(this.engine, "collisionStart collisionActive", collisions);
  }
  add(tier, x, power = 0, stats = {}) {
    if (this.tools.length >= BALANCE.maxActive) return false;
    const body = Bodies.circle(
      Math.max(16, Math.min(404, x)),
      64,
      12 + Math.min(3, tier / 4),
      {
        restitution: 0.8,
        friction: 0.015,
        frictionAir: 0.0015,
        density: 0.003,
      },
    );
    const tool = {
      kind: "pick",
      tier,
      body,
      power: stats.damage ?? damage(tier, power),
      maxHits: stats.hits ?? TOOLS[tier - 1].hits,
      hits: 0,
      born: this.time,
      lastHit: new Map(),
    };
    body.plugin.tool = tool;
    Body.setVelocity(body, { x: 0, y: 0.5 });
    Body.setAngularVelocity(body, 0.08);
    this.tools.push(tool);
    Composite.add(this.engine.world, body);
    return true;
  }
  addBomb(x) {
    if (!this.add(1, x, 0, { damage: 0, hits: 1 })) return false;
    this.tools.at(-1).kind = "bomb";
    return true;
  }
  removeReward(col) {
    const body = this.rewards.get(col);
    if (body) Composite.remove(this.engine.world, body);
    this.rewards.delete(col);
  }
  removeBlock(id) {
    const body = this.blocks.get(id);
    if (body) {
      Composite.remove(this.engine.world, body);
      this.blocks.delete(id);
    }
  }
  showBoss() {
    if (this.boss) return;
    const body = Bodies.rectangle(210, 390, 122, 92, {
      isStatic: true,
      restitution: 0.8,
      friction: 0.01,
      chamfer: { radius: 18 },
    });
    body.plugin.boss = true;
    this.boss = { body, spawned: this.time, enraged: false };
    Composite.add(this.engine.world, body);
  }
  hideBoss() {
    if (this.boss) Composite.remove(this.engine.world, this.boss.body);
    this.boss = null;
  }
  step(dt = 1000 / 60) {
    this.time += dt;
    if (this.boss)
      Body.setPosition(this.boss.body, {
        x:
          210 +
          Math.sin(
            (this.time - this.boss.spawned) / (this.boss.enraged ? 1250 : 2300),
          ) *
            (this.boss.enraged ? 92 : 52),
        y: 390 + Math.sin(this.time / 1700) * 8,
      });
    Engine.update(this.engine, dt);
    for (const { tool, brick } of this.pending.values()) {
      if (tool.spent || tool.extracted) continue;
      if (brick.plugin.reward !== undefined) {
        if (tool.kind === "pick" && this.rewards.has(brick.plugin.reward)) this.onCollect(brick.plugin.reward, tool);
        continue;
      }
      if (
        (brick.plugin.boss
          ? this.boss?.body !== brick
          : !this.blocks.has(brick.plugin.block)) ||
        tool.hits >= tool.maxHits
      )
        continue;
      tool.lastHit.set(brick.id, this.time);
      tool.hits++;
      if (tool.kind === "bomb") {
        tool.spent = true;
        this.onBombHit(brick.plugin.block, tool, !!brick.plugin.boss);
        continue;
      }
      if (brick.plugin.boss) this.onBossHit(tool.power, tool);
      else this.onHit(brick.plugin.block, tool.power, tool);
      // Restore a small separating bounce when a rotating tool comes to rest on a ledge.
      if (tool.body.position.y < brick.position.y && tool.body.velocity.y > -2)
        Body.setVelocity(tool.body, { x: tool.body.velocity.x, y: -4.4 });
    }
    this.pending.clear();
    const retired = this.tools.filter(
      (t) =>
        t.spent || t.extracted || t.hits >= t.maxHits ||
        t.body.position.y > FIELD.height + 60 ||
        this.time - t.born > 18000,
    );
    for (const t of retired) Composite.remove(this.engine.world, t.body);
    this.tools = this.tools.filter((t) => !retired.includes(t));
    for (const t of this.tools)
      if (t.body.speed > 12)
        Body.setVelocity(t.body, {
          x: (t.body.velocity.x * 12) / t.body.speed,
          y: (t.body.velocity.y * 12) / t.body.speed,
        });
    if (retired.length) this.onRetire(retired);
  }
  destroy() {
    Events.off(this.engine);
    Composite.clear(this.engine.world, false);
    Engine.clear(this.engine);
    this.tools = [];
    this.blocks.clear();
    this.rewards.clear();
    this.boss = null;
  }
}
