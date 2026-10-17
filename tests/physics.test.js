import test from "node:test";
import assert from "node:assert/strict";
import Matter from "matter-js";
import { MinePhysics } from "../src/physics.js";
import { generateLevel, BALANCE } from "../src/core.js";

test("Matter collisions hit real blocks, reflect tools and respect the body cap", () => {
  let hits = 0;
  const physics = new MinePhysics(generateLevel(1), { onHit: () => hits++ });
  for (let i = 0; i < BALANCE.maxActive; i++)
    assert.equal(physics.add(1, 60 + i * 60), true);
  assert.equal(physics.add(1, 30), false);
  let bounced = false;
  for (let i = 0; i < 240; i++) {
    physics.step();
    if (physics.tools.some((t) => t.hits && t.body.velocity.y < -1))
      bounced = true;
  }
  assert.ok(hits > 0);
  assert.ok(bounced);
  assert.ok(physics.tools.length <= BALANCE.maxActive);
  for (let i = 0; i < 1200; i++) physics.step();
  assert.equal(physics.tools.length, 0);
  physics.destroy();
});
test("tools collide with one another and removed blocks stop taking hits", () => {
  const physics = new MinePhysics([], {});
  physics.add(1, 140);
  physics.add(2, 180);
  Matter.Body.setVelocity(physics.tools[0].body, { x: 3, y: 0 });
  Matter.Body.setVelocity(physics.tools[1].body, { x: -3, y: 0 });
  let collided = false;
  Matter.Events.on(physics.engine, "collisionStart", ({ pairs }) => {
    if (pairs.some((p) => p.bodyA.plugin.tool && p.bodyB.plugin.tool))
      collided = true;
  });
  for (let i = 0; i < 10; i++) physics.step();
  assert.ok(collided);
  assert.ok(physics.tools[0].body.velocity.x < 0);
  physics.destroy();
  let hits = 0;
  const p = new MinePhysics(generateLevel(1), {
    onHit: (id) => {
      hits++;
      p.removeBlock(id);
    },
  });
  p.add(1, 48);
  for (let i = 0; i < 100; i++) p.step();
  assert.ok(hits > 0);
  assert.equal(p.blocks.size, 70 - hits);
  p.destroy();
});
test("a moving guardian takes real tool collisions and disappears after defeat", () => {
  let hits = 0;
  const physics = new MinePhysics([], { onBossHit: () => hits++ });
  physics.showBoss();
  physics.add(4, 210, 4, { damage: 100, hits: 15 });
  const initialX = physics.boss.body.position.x;
  for (let n = 0; n < 240; n++) physics.step();
  assert.ok(hits > 0);
  assert.notEqual(physics.boss.body.position.x, initialX);
  assert.equal(physics.tools[0]?.maxHits ?? 15, 15);
  physics.hideBoss();
  const before = hits;
  for (let n = 0; n < 120; n++) physics.step();
  assert.equal(hits, before);
  physics.destroy();
});
