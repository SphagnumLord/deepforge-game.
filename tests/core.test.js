import test from "node:test";
import assert from "node:assert/strict";
import {
  createState,
  restoreState,
  loadState,
  openBoard,
  generateLevel,
  buyTool,
  buyCost,
  forgeTool,
  forgeCost,
  forgeTier,
  upgrade,
  merge,
  mergeAll,
  findMergePair,
  rescue,
  canRescue,
  launch,
  hitBlock,
  nextLevel,
  routeColumns, collectRoute,
  LEVELS,
  BALANCE,
  STORAGE,
  LEGACY_STORAGE,
} from "../src/core.js";

test("130 deterministic mines have different layouts, bounded HP and rare resources", () => {
  assert.equal(LEVELS.length, 130);
  const signatures = new Set();
  for (let level = 1; level <= 130; level++) {
    const board = generateLevel(level);
    assert.deepEqual(board, generateLevel(level));
    assert.equal(board.length, 70);
    assert.ok(board.every((b) => b.hp > 0 && b.hp <= 15000));
    assert.ok(board.some((b) => b.material >= 4));
    assert.ok(board.some((b) => b.type === "bomb"));
    signatures.add(JSON.stringify(board));
  }
  assert.equal(signatures.size, 130);
});
test("merge validates indices, matching tiers and maximum tier without consuming invalid tools", () => {
  const s = createState();
  assert.equal(merge(s, 0, 1), true);
  assert.equal(s.inventory[1], 2);
  assert.equal(s.inventory[0], null);
  const before = [...s.inventory];
  for (const [a, b] of [
    [1, 1],
    [2, 1],
    [-1, 2],
    [NaN, 1],
    [12, 0],
    [0, 3],
  ])
    assert.equal(merge(s, a, b), false);
  assert.deepEqual(s.inventory, before);
  s.inventory[0] = s.inventory[1] = 12;
  assert.equal(merge(s, 0, 1), false);
});
test("automatic merging cascades through a full mixed inventory, conserves tools and stops at the maximum", () => {
  const s = createState();
  s.inventory = [1, 1, 1, 1, 1, 1, 1, 1, 11, 11, 12, 12];
  openBoard(s);
  const entry = structuredClone(s.entry), before = structuredClone(s);
  const value = (inventory) => inventory.reduce((total, tier) => total + (tier ? 2 ** (tier - 1) : 0), 0);
  const merged = mergeAll(s);
  assert.equal(merged.length, 8);
  assert.deepEqual(s.inventory.filter(Boolean).sort((a, b) => a - b), [4, 12, 12, 12]);
  assert.equal(value(s.inventory), value(before.inventory));
  assert.equal(findMergePair(s), null);
  assert.deepEqual(mergeAll(s), []);
  for (const key of ["coins", "gems", "power", "runs", "board", "entry"])
    assert.deepEqual(s[key], before[key], `merging must not change ${key}`);
  assert.deepEqual(s.entry, entry);
  const completed = { ...createState(), levelComplete: true };
  const inventory = [...completed.inventory];
  assert.deepEqual(mergeAll(completed), []);
  assert.deepEqual(completed.inventory, inventory);
});

test("purchases and upgrades debit exact cost; full inventory and low funds are safe", () => {
  const s = createState(),
    cost = buyCost(s),
    index = buyTool(s);
  assert.equal(s.coins, 180 - cost);
  assert.equal(s.inventory[index], 1);
  s.gems = 3;
  assert.equal(upgrade(s), true);
  assert.equal(s.power, 1);
  assert.equal(s.coins, 180 - cost);
  assert.equal(s.gems, 0);
  const full = createState();
  full.inventory.fill(1);
  assert.equal(buyTool(full), -1);
  assert.equal(full.coins, 180);
  s.coins = 0;
  assert.equal(buyTool(s), -1);
  assert.equal(upgrade(s), false);
  s.runs = 100000;
  assert.ok(buyCost(s) < 40);
});
test("one emergency pick is available per normal attempt, including after it is thrown", () => {
  const s = createState();
  s.coins = 0;
  s.inventory.fill(null);
  assert.equal(canRescue(s, 1), false);
  assert.equal(rescue(s, 1), false);
  assert.equal(rescue(s), true);
  assert.equal(rescue(s), false);
  assert.equal(launch(s, 0, BALANCE.maxActive), null);
  assert.equal(launch(s, 0), 1);
  assert.equal(launch(s, 0), null);
  assert.equal(rescue(s), false);
  assert.equal(s.inventory[0], null);
});
test("crystal forging spends gems for biome-scaled tools and rejects insufficient resources", () => {
  const s = createState();
  assert.equal(forgeTool(s), -1);
  s.gems = 20;
  s.level = 81;
  const cost = forgeCost(s),
    tier = forgeTier(s),
    coins = s.coins;
  const index = forgeTool(s);
  assert.equal(s.inventory[index], tier);
  assert.equal(tier, 6);
  assert.equal(s.gems, 20 - cost);
  assert.equal(s.coins, coins);
  s.inventory.fill(1);
  const gems = s.gems;
  assert.equal(forgeTool(s), -1);
  assert.equal(s.gems, gems);
});
test("bomb chains pay each block once and clear bonus is awarded once", () => {
  const s = createState(),
    blocks = openBoard(s);
  for (const b of blocks) {
    b.hp = 1;
    b.type = "bomb";
    s.board.hp[b.id] = 1;
  }
  const result = hitBlock(s, blocks, 3, 1);
  assert.equal(result.destroyed.length, 70);
  assert.equal(result.completed, false);
  assert.equal(collectRoute(s, routeColumns(s.level)[0]).completed, true);
  const coins = s.coins;
  assert.equal(hitBlock(s, blocks, 3, 999).coins, 0);
  assert.equal(s.coins, coins);
  const restored = restoreState(JSON.parse(JSON.stringify(s)));
  openBoard(restored);
  assert.equal(restored.levelComplete, true);
  assert.equal(restored.coins, coins);
  assert.equal(nextLevel(restored), true);
  assert.equal(restored.level, 2);
});
test("partially damaged blocks survive save and reload, legacy saves migrate", () => {
  const s = createState(),
    blocks = openBoard(s);
  hitBlock(s, blocks, 0, 1);
  const restored = restoreState(JSON.parse(JSON.stringify(s)));
  assert.equal(openBoard(restored)[0].hp, blocks[0].hp);
  const legacy = {
    ...createState(),
    version: undefined,
    coins: 333,
    board: undefined,
  };
  const storage = {
    getItem: (key) =>
      key === STORAGE
        ? "{broken"
        : key === LEGACY_STORAGE
          ? JSON.stringify(legacy)
          : null,
  };
  assert.equal(loadState(storage).coins, 333);
});
test("corrupt or manipulated saves cannot inject negative currency, invalid tiers or properties", () => {
  const s = restoreState({
    inventory: [99, -1, 1.5, ...Array(9).fill(null)],
    coins: -20,
    power: Infinity,
    level: 999,
    evil: true,
  });
  assert.equal(s.coins, 0);
  assert.equal(s.power, 0);
  assert.equal(s.level, 130);
  assert.ok(s.inventory.every((v) => v === null));
  assert.equal(s.evil, undefined);
  assert.deepEqual(
    loadState({
      getItem() {
        throw Error("denied");
      },
    }),
    createState(),
  );
});
test("completion cannot be skipped and mine 130 starts a new campaign without losing economy", () => {
  const s = createState();
  assert.equal(nextLevel(s), false);
  s.level = 130;
  s.levelComplete = true;
  const coins = s.coins;
  assert.equal(nextLevel(s), true);
  assert.equal(s.level, 1);
  assert.equal(s.campaignWins, 1);
  assert.equal(s.coins, coins);
});
