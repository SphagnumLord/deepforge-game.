import test from "node:test";
import assert from "node:assert/strict";
import {
  createState, openBoard, restoreState, routeColumns, routeProgress, collectRoute,
  pendingPrizes, hitBlock, nextLevel, hitBoss, bossActive, restartMine,
  launchBomb, detonateBomb, claimBonusTool, launch, needsRestart, LEVELS,
} from "../src/core.js";
import { MinePhysics, prizePosition } from "../src/physics.js";
import Matter from "matter-js";

function clearRoute(s, blocks, col) {
  for (const b of blocks) if (b.col === col && b.alive) hitBlock(s, blocks, b.id, 1e8, 12);
}

test("one route and a physical cache pickup win a normal mine with other blocks still standing", () => {
  const s = createState(), blocks = openBoard(s), col = routeColumns(1)[0];
  assert.equal(collectRoute(s, col), null);
  clearRoute(s, blocks, col);
  assert.equal(s.levelComplete, false, "a cleared passage alone is not a collected cache");
  assert.equal(collectRoute(s, 0), null);
  assert.deepEqual(pendingPrizes(s), []);
  const result = collectRoute(s, col);
  assert.equal(result.completed, true);
  assert.ok(blocks.filter((b) => b.alive).length > 40);
  assert.deepEqual(pendingPrizes(s), [{ kind: "tool", tier: 2 }]);
  const coins = s.coins;
  assert.equal(collectRoute(s, col), null);
  assert.equal(s.coins, coins);
  const restored = restoreState(JSON.parse(JSON.stringify(s)));
  openBoard(restored);
  assert.equal(restored.levelComplete, true);
  assert.equal(restored.coins, coins);
  assert.deepEqual(restored.board.claimed, [col]);
});

test("hard mines need two or three distinct pickups, and guardians still need a real fight", () => {
  for (const level of [8, 15, 64, 104, 120]) {
    const s = { ...createState(), level }, blocks = openBoard(s), columns = routeColumns(level);
    assert.equal(columns.length, level >= 64 ? 3 : 2);
    columns.forEach((col, index) => {
      clearRoute(s, blocks, col);
      const result = collectRoute(s, col);
      assert.equal(result.completed, index === columns.length - 1 && !s.boss);
      assert.equal(collectRoute(s, col), null);
    });
    if (s.boss) {
      assert.equal(bossActive(s), true);
      assert.equal(s.levelComplete, false);
      assert.equal(hitBoss(s, 1e8, 1).blocked, true);
      assert.equal(hitBoss(s, 1e8, 12).completed, true);
    }
  }
});

test("prize picks arrive only on nextLevel and overflow safely into a saved reserve", () => {
  const s = createState(), blocks = openBoard(s);
  s.inventory.fill(1);
  clearRoute(s, blocks, 3);
  collectRoute(s, 3);
  assert.deepEqual(s.bonusTools, []);
  assert.ok(s.inventory.every((tier) => tier === 1));
  const restored = restoreState(JSON.parse(JSON.stringify(s)));
  openBoard(restored);
  assert.equal(nextLevel(restored), true);
  assert.deepEqual(restored.bonusTools, [2]);
  assert.equal(nextLevel(restored), false);
  assert.equal(claimBonusTool(restored), -1);
  launch(restored, 0);
  assert.equal(claimBonusTool(restored), 0);
  assert.equal(restored.inventory[0], 2);
  assert.deepEqual(restored.bonusTools, []);
  assert.equal(claimBonusTool(restored), -1);
});

test("a carried bomb costs one charge, detonates once and cannot collect a cache", () => {
  const s = { ...createState(), level: 2 }, blocks = openBoard(s);
  clearRoute(s, blocks, 3); collectRoute(s, 3);
  assert.equal(s.bombs, 0);
  nextLevel(s);
  const next = openBoard(s);
  assert.equal(s.bombs, 1);
  assert.equal(launchBomb(s, 5), false);
  assert.equal(s.bombs, 1);
  assert.equal(launchBomb(s), true);
  assert.equal(s.bombs, 0);
  const target = next.find((b) => b.col === 3 && b.row === 0);
  const result = detonateBomb(s, next, target.id);
  assert.ok(result.destroyed.length > 0);
  assert.ok(result.coins > 0);
  const coins = s.coins;
  assert.equal(detonateBomb(s, next, target.id).coins, 0);
  assert.equal(s.coins, coins);
  assert.equal(launchBomb(s), false);
  assert.equal(s.levelComplete, false);
});

test("restarting rolls back cache claims and used bonus supplies without farming future prizes", () => {
  const s = { ...createState(), level: 8, bombs: 3, bonusTools: [4] }, blocks = openBoard(s);
  const entry = structuredClone(s.entry);
  const col = routeColumns(8)[0];
  clearRoute(s, blocks, col); collectRoute(s, col);
  assert.equal(pendingPrizes(s).length, 1);
  launchBomb(s); claimBonusTool(s);
  assert.equal(restartMine(s), true);
  openBoard(s);
  assert.deepEqual(pendingPrizes(s), []);
  assert.deepEqual(s.board.claimed, []);
  assert.equal(s.bombs, entry.bombs);
  assert.deepEqual(s.bonusTools, entry.bonusTools);
});

test("bomb-only supplies keep a guardian fight alive but cannot replace a pick for cache collection", () => {
  const s = { ...createState(), level: 15, bombs: 1, inventory: Array(12).fill(null) };
  const blocks = openBoard(s);
  s.coins = 0;
  for (const col of routeColumns(s.level)) clearRoute(s, blocks, col);
  s.coins = 0;
  assert.equal(needsRestart(s), true, "an open cache still needs a pick");
  for (const col of routeColumns(s.level)) collectRoute(s, col);
  assert.equal(bossActive(s), true);
  assert.equal(needsRestart(s), false, "a remaining bomb can damage the guardian");
  assert.equal(launchBomb(s), true);
  assert.equal(needsRestart(s, 1), false, "an active bomb is still usable");
  assert.equal(needsRestart(s), true, "exhausted supplies end the attempt");
});

test("v4 completed saves stay completed without invented prizes; incomplete and corrupt claims are safe", () => {
  const old = { ...createState(), version: 4, coins: 777, gems: 6, power: 3 };
  openBoard(old); old.board.hp.fill(0);
  const restored = restoreState(old);
  openBoard(restored);
  assert.equal(restored.version, 5);
  assert.equal(restored.levelComplete, true);
  assert.deepEqual(pendingPrizes(restored), []);
  assert.equal(restored.coins, 777);
  nextLevel(restored);
  assert.equal(restored.bombs, 0);
  assert.deepEqual(restored.bonusTools, []);
  const bad = createState(); openBoard(bad);
  bad.board.claimed = [3, 3, 0, 999]; bad.bombs = -10; bad.bonusTools = [0, 13, "4", 4];
  const safe = restoreState(bad);
  assert.deepEqual(safe.board.claimed, []);
  assert.equal(safe.levelComplete, false);
  assert.equal(safe.bombs, 0);
  assert.deepEqual(safe.bonusTools, [4]);
});

test("Matter sensors collect with a real pick, never with a bomb, and cannot bypass an uncleared route", () => {
  for (const kind of ["pick", "bomb"]) {
    const s = createState(), blocks = openBoard(s);
    clearRoute(s, blocks, 3);
    let collected = 0;
    const physics = new MinePhysics(blocks, { goals: routeProgress(s), onCollect: (col, tool) => {
      if (collectRoute(s, col)) { collected++; tool.extracted = true; physics.removeReward(col); }
    }});
    if (kind === "bomb") physics.addBomb(210); else physics.add(2, 210);
    Matter.Body.setPosition(physics.tools[0].body, prizePosition(3));
    physics.step(); physics.step();
    assert.equal(collected, kind === "pick" ? 1 : 0);
    physics.destroy();
  }
  const s = createState(), blocks = openBoard(s);
  let invalid = 0;
  const physics = new MinePhysics(blocks, { goals: routeProgress(s), onCollect: (col) => { if (collectRoute(s, col)) invalid++; } });
  physics.add(1, 210); Matter.Body.setPosition(physics.tools[0].body, prizePosition(3));
  physics.step();
  assert.equal(invalid, 0);
  assert.equal(s.levelComplete, false);
  physics.destroy();
});
