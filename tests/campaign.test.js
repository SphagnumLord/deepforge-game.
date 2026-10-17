import test from "node:test";
import assert from "node:assert/strict";
import {
  createState,
  restoreState,
  openBoard,
  generateLevel,
  LEVELS,
  TROPHIES,
  bossActive,
  bossVulnerable,
  hitBoss,
  hitBlock,
  getBoosts,
  toolStats,
  blockReward,
  buyCost,
  buyTool,
  shopTier,
  nextLevel,
} from "../src/core.js";
import { simulateCampaign } from "../scripts/simulate-economy.mjs";

function clearMine(s) {
  const blocks = openBoard(s);
  for (const b of blocks) if (b.alive) hitBlock(s, blocks, b.id, 1e7);
  return blocks;
}
const totalHp = (n) => generateLevel(n).reduce((sum, b) => sum + b.maxHp, 0);
const revenue = (n) => {
  const s = createState();
  s.level = n;
  return generateLevel(n).reduce((sum, b) => sum + blockReward(s, b), 0);
};

test("the 130-mine cadence includes all 16 trials, eight bosses and eight preceding gold mines", () => {
  assert.equal(LEVELS.length, 130);
  assert.equal(LEVELS.filter((l) => l.challenge).length, 16);
  assert.equal(LEVELS.filter((l) => l.boss).length, 8);
  assert.equal(LEVELS.filter((l) => l.treasure).length, 8);
  for (let n = 8; n <= 130; n += 8) assert.equal(LEVELS[n - 1].challenge, true);
  for (let n = 15; n <= 130; n += 15) {
    assert.equal(LEVELS[n - 1].boss, true);
    assert.equal(LEVELS[n - 2].treasure, true);
  }
  assert.equal(LEVELS[103].challenge && LEVELS[103].treasure, true);
  assert.equal(LEVELS[119].challenge && LEVELS[119].boss, true);
});
test("gold mines are softer and richer while mine 104 keeps its trial armour", () => {
  for (const l of LEVELS.filter((l) => l.treasure)) {
    assert.ok(
      revenue(l.id) > revenue(l.id - 1) * 1.5,
      `gold ${l.id} should reward more`,
    );
    assert.ok(
      revenue(l.id) < revenue(l.id - 1) * 4,
      `gold ${l.id} must not inflate the campaign`,
    );
    if (!l.challenge)
      assert.ok(
        totalHp(l.id) < totalHp(l.id - 1) * 0.8,
        `gold ${l.id} should be a breather`,
      );
  }
  assert.ok(totalHp(104) > totalHp(103) * 1.5);
});
test("clearing a guardian chamber reveals the boss but pays no completion reward or trophy yet", () => {
  const s = createState();
  s.level = 15;
  openBoard(s);
  assert.equal(hitBoss(s, 10000).damage, 0);
  clearMine(s);
  assert.equal(bossActive(s), true);
  assert.equal(s.levelComplete, false);
  assert.deepEqual(s.trophies, []);
  const before = s.coins;
  for (let i = 0; i < 3; i++) assert.equal(hitBoss(s, 10).damage, 6);
  assert.equal(bossVulnerable(s), true);
  assert.equal(hitBoss(s, 10).damage, 17);
  assert.equal(bossVulnerable(s), false);
  const result = hitBoss(s, 10000);
  assert.equal(result.completed, true);
  assert.equal(result.trophy.level, 15);
  assert.equal(s.coins - before, LEVELS[14].bonus);
  assert.deepEqual(s.trophies, [15]);
  assert.equal(hitBoss(s, 10000).coins, 0);
  assert.deepEqual(s.trophies, [15]);
});
test("a partially defeated boss, armour cycle and earned trophy survive reload without duplicate rewards", () => {
  const s = createState();
  s.level = 30;
  clearMine(s);
  hitBoss(s, 50);
  hitBoss(s, 50);
  const restored = restoreState(JSON.parse(JSON.stringify(s)));
  openBoard(restored);
  assert.equal(restored.boss.hp, s.boss.hp);
  assert.equal(restored.boss.hits, 2);
  assert.equal(bossActive(restored), true);
  hitBoss(restored, 1e7);
  const coins = restored.coins;
  const won = restoreState(JSON.parse(JSON.stringify(restored)));
  openBoard(won);
  assert.equal(won.levelComplete, true);
  assert.equal(hitBoss(won, 1e7).coins, 0);
  assert.equal(won.coins, coins);
  assert.deepEqual(won.trophies, [30]);
  nextLevel(won);
  assert.equal(won.level, 31);
  assert.deepEqual(won.trophies, [30]);
});
test("trophies give small actual bonuses and duplicates or unknown trophies cannot stack", () => {
  const s = createState();
  s.level = 81;
  s.power = 10;
  const original = toolStats(s, 6),
    price = buyCost(s);
  s.trophies = TROPHIES.flatMap((t) => [t.level, t.level]);
  const buffs = getBoosts(s),
    stats = toolStats(s, 6);
  assert.ok(
    stats.damage > original.damage && stats.damage < original.damage * 1.2,
  );
  assert.equal(stats.hits, original.hits + 1);
  assert.ok(buyCost(s) < price);
  assert.ok(buffs.gold < 1.1);
  assert.ok(buffs.discount < 0.1);
  const restored = restoreState({
    ...s,
    trophies: [...s.trophies, -1, 999, "15"],
  });
  assert.equal(restored.trophies.length, 8);
  assert.deepEqual(getBoosts(restored), buffs);
});
test("v2 progress migrates in place without replaying a completed old mine or inventing a boss trophy", () => {
  const s = createState();
  s.version = 2;
  s.level = 15;
  s.best = 18;
  openBoard(s);
  s.board.hp.fill(0);
  s.boss = null;
  s.coins = 1234;
  const restored = restoreState(s);
  openBoard(restored);
  assert.equal(restored.version, 3);
  assert.equal(restored.levelComplete, true);
  assert.equal(restored.coins, 1234);
  assert.deepEqual(restored.trophies, []);
  assert.equal(nextLevel(restored), true);
  assert.equal(restored.level, 16);
});
test("supply tiers scale to late mines and per-mine scarcity resets at the next mine", () => {
  const s = createState();
  s.level = 121;
  s.coins = 100000;
  s.inventory.fill(null);
  openBoard(s);
  const base = buyCost(s);
  const index = buyTool(s);
  assert.equal(s.inventory[index], 7);
  assert.equal(shopTier(s), 7);
  assert.ok(buyCost(s) > base);
  s.levelComplete = true;
  nextLevel(s);
  assert.equal(s.purchasesThisMine, 0);
  assert.ok(buyCost(s) < base * 1.03);
});
test("checkpoint and chain rewards survive save/reload and cannot be paid a second time", () => {
  const s = createState();
  const board = openBoard(s);
  for (let i = 0; i < 10; i++) hitBlock(s, board, i, 1e6);
  assert.ok(s.board.checkpoints >= 1);
  const restored = restoreState(s),
    b = openBoard(restored),
    coins = restored.coins;
  assert.equal(hitBlock(restored, b, 0, 1e6).coins, 0);
  assert.equal(restored.coins, coins);
  assert.equal(restored.board.checkpoints, s.board.checkpoints);
});
test("budget simulations complete all 130 mines without forced rescue at 50–80% useful contacts", () => {
  for (const efficiency of [0.5, 0.65, 0.8]) {
    const report = simulateCampaign(efficiency);
    assert.equal(report.length, 130);
    assert.equal(
      report.reduce((n, r) => n + r.rescues, 0),
      0,
    );
    assert.ok(report.every((r) => r.wallet >= 0 && r.throws <= 30));
    assert.ok(report.at(-1).wallet < 100000);
    assert.ok(report.at(-1).power < 35);
  }
});
test("every eighth mine takes materially more tools than surrounding normal mines in the budget model", () => {
  const report = simulateCampaign();
  for (const trial of report.filter((r) => r.challenge)) {
    const neighbours = report.filter(
      (r) => r.kind === "normal" && Math.abs(r.level - trial.level) <= 3,
    );
    const mean =
      neighbours.reduce((sum, r) => sum + r.throws, 0) / neighbours.length;
    assert.ok(
      trial.throws >= mean * 1.4,
      `mine ${trial.level}: ${trial.throws} tools vs ${mean.toFixed(1)} in normal mines`,
    );
  }
});
