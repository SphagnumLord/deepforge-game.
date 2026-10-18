import test from "node:test";
import assert from "node:assert/strict";
import {
  BALANCE, LEVELS, createState, restoreState, openBoard, generateLevel,
  rescue, canRescue, launch, buyTool, forgeTool, forgeCost, upgrade, upgradeCost,
  needsRestart, restartAttempt, restartMine, recommendedTier, merge, hitBlock, hitBoss,
  nextLevel, attemptBudget, routeColumns, collectRoute,
} from "../src/core.js";
import { simulateCampaign, simulateMine } from "../scripts/simulate-economy.mjs";

function expendSupplies(s) {
  for (let i = 0; i < s.inventory.length; i++) launch(s, i);
  let index;
  while ((index = buyTool(s)) >= 0) launch(s, index);
  while ((index = forgeTool(s)) >= 0) launch(s, index);
}

test("manual restart restores only the current mine checkpoint, including a damaged boss", () => {
  const s = { ...createState(), level: 30, best: 46, coins: 5000, gems: 20,
    power: 4, trophies: [15], campaignWins: 2, muted: true, musicMuted: true,
    tutorialDone: true };
  const blocks = openBoard(s), entry = structuredClone(s.entry);
  buyTool(s);
  upgrade(s);
  hitBlock(s, blocks, 0, 1e6, 12);
  s.boss.hp = 10;
  s.boss.hits = 7;
  s.rescueUsed = true;
  assert.equal(needsRestart(s), false);
  assert.equal(restartMine(s), true);
  assert.equal(s.level, 30);
  assert.equal(s.best, 46);
  assert.equal(s.campaignWins, 2);
  assert.deepEqual(s.trophies, [15]);
  assert.equal(s.muted, true);
  assert.equal(s.musicMuted, true);
  for (const key of ["coins", "gems", "power", "runs", "inventory"])
    assert.deepEqual(s[key], entry[key]);
  assert.deepEqual(openBoard(s), generateLevel(30));
  assert.equal(s.boss.hp, s.boss.maxHp);
  assert.equal(s.boss.hits, 0);
  assert.equal(s.board.earned, 0);
  assert.equal(s.board.spent, 0);
  assert.equal(s.attemptNumber, 2);
  const restored = restoreState(JSON.parse(JSON.stringify(s)));
  assert.equal(restored.level, 30);
  assert.deepEqual(restored.entry, s.entry);
  s.levelComplete = true;
  const completed = structuredClone(s);
  assert.equal(restartMine(s), false);
  assert.deepEqual(s, completed, "a completed mine cannot be replayed to farm its reward");
});

test("rescue quota survives reload; a failed normal attempt rolls back its loot and expenses", () => {
  const s = createState(), blocks = openBoard(s), entry = structuredClone(s.entry);
  hitBlock(s, blocks, 0, 1e6);
  expendSupplies(s);
  assert.equal(canRescue(s, 1), false);
  assert.equal(rescue(s), true);
  assert.equal(s.rescueUsed, true);
  launch(s, 0);
  const restored = restoreState(JSON.parse(JSON.stringify(s)));
  openBoard(restored);
  assert.equal(rescue(restored), false);
  assert.equal(needsRestart(restored, 1), false);
  assert.equal(restartAttempt(restored), true);
  assert.equal(restored.attemptNumber, 2);
  assert.deepEqual(restored.inventory, entry.inventory);
  assert.equal(restored.coins, entry.coins);
  assert.equal(restored.gems, entry.gems);
  assert.equal(restored.power, entry.power);
  assert.equal(restored.rescueUsed, false);
  assert.deepEqual(openBoard(restored), generateLevel(1));
  assert.equal(restored.board.earned, 0);
  assert.equal(restored.board.spent, 0);
});

test("trials, guardians and the overlapping golden trial allow no emergency pick", () => {
  for (const level of [8, 15, 104, 120, 128]) {
    const s = createState();
    s.level = level;
    openBoard(s);
    expendSupplies(s);
    assert.equal(canRescue(s), false);
    assert.equal(rescue(s), false);
    assert.equal(needsRestart(s, 1), false);
    assert.equal(restartAttempt(s, 1), false);
    assert.equal(restartAttempt(s), true);
    assert.equal(s.level, level);
    assert.equal(s.attemptNumber, 2);
    assert.equal(s.rescueUsed, false);
  }
});

test("diamonds that can fund a forged tool prevent premature rescue or restart", () => {
  const s = createState();
  s.level = 8;
  s.coins = 0;
  s.inventory.fill(null);
  s.gems = forgeCost(s);
  assert.equal(needsRestart(s), false);
  assert.equal(canRescue(s), false);
  const index = forgeTool(s);
  assert.ok(index >= 0);
  launch(s, index);
  assert.equal(needsRestart(s), true);
});

test("gold cannot buy strength; a diamond upgrade spends only the exact diamond price", () => {
  const s = createState();
  s.coins = 1e6;
  assert.equal(upgrade(s), false);
  s.gems = upgradeCost(s);
  assert.equal(upgrade(s), true);
  assert.equal(s.gems, 0);
  assert.equal(s.coins, 1e6);
  assert.equal(s.power, 1);
});

test("even enormous raw damage cannot bypass rock or guardian tier requirements", () => {
  const s = createState();
  s.level = 8;
  const blocks = openBoard(s), target = blocks[0], hp = target.hp;
  assert.equal(hitBlock(s, blocks, target.id, 1e9, 1).blocked, true);
  assert.equal(target.hp, hp);
  s.inventory = [2, 2, ...Array(10).fill(null)];
  assert.equal(merge(s, 0, 1), true);
  const tier = launch(s, 1);
  assert.equal(tier, recommendedTier(s.level));
  assert.equal(hitBlock(s, blocks, target.id, 1, tier).blocked, false);
  assert.equal(target.hp, hp - 1);
  s.level = 15;
  s.entry = null;
  s.board = null;
  openBoard(s);
  s.board.hp.fill(0);
  for (const col of routeColumns(s.level)) collectRoute(s, col);
  const bossHp = s.boss.hp;
  assert.equal(hitBoss(s, 1e9, 1).blocked, true);
  assert.equal(s.boss.hp, bossHp);
  assert.equal(s.boss.hits, 0);
});

test("all diamond seams are rare, deep and reinforced; quartz is no diamond reward", () => {
  for (const config of LEVELS) {
    const seams = generateLevel(config.id).filter((b) => b.type === "gem");
    assert.equal(seams.length, config.diamonds);
    assert.ok(seams.length >= 1 && seams.length <= 2);
    assert.ok(seams.every((b) => b.row >= 5 && b.minTier === recommendedTier(config.id)));
  }
  const s = createState();
  s.level = 100;
  const blocks = openBoard(s), quartz = blocks.find((b) => b.material === 5 && b.type === "normal");
  assert.ok(quartz);
  assert.equal(hitBlock(s, blocks, quartz.id, 1e9, 12).gems, 0);
  const diamond = blocks.find((b) => b.type === "gem");
  assert.equal(hitBlock(s, blocks, diamond.id, 1e9, 12).gems, 1);
  const restored = restoreState(s), again = openBoard(restored);
  assert.equal(hitBlock(restored, again, diamond.id, 1e9, 12).gems, 0);
});

test("restarts cannot bank mined gold, diamonds, bought power or duplicate trophies", () => {
  const s = createState();
  s.level = 16;
  s.gems = 30;
  s.trophies = [15];
  openBoard(s);
  const baseline = structuredClone(s.entry);
  for (let attempt = 0; attempt < 4; attempt++) {
    const blocks = openBoard(s);
    const diamond = blocks.find((b) => b.type === "gem");
    hitBlock(s, blocks, diamond.id, 1e9, 12);
    upgrade(s);
    expendSupplies(s);
    assert.equal(restartAttempt(s), true);
    assert.equal(s.coins, baseline.coins);
    assert.equal(s.gems, baseline.gems);
    assert.equal(s.power, baseline.power);
    assert.deepEqual(s.trophies, [15]);
    assert.equal(s.attemptNumber, attempt + 2);
  }
});

test("new-mine funding is finite; reloading never refills an active attempt", () => {
  const s = createState();
  s.level = 24;
  s.coins = 0;
  s.inventory.fill(null);
  openBoard(s);
  assert.equal(s.coins, attemptBudget(s));
  expendSupplies(s);
  const wallet = s.coins, raw = JSON.parse(JSON.stringify(s));
  const restored = restoreState(raw);
  openBoard(restored);
  assert.equal(restored.coins, wallet);
  assert.equal(restartAttempt(restored), true);
  assert.equal(restored.coins, attemptBudget(restored));
  assert.ok(restored.inventory.every((tier) => tier === null));
});

test("v3 progress migrates without losing wallet, upgrades, trophies or damaged rock", () => {
  const s = createState();
  s.level = 30;
  s.coins = 321;
  s.gems = 17;
  s.power = 7;
  s.trophies = [15];
  openBoard(s);
  s.coins = 321;
  s.board.hp[0] = 1;
  s.version = 3;
  delete s.entry;
  const migrated = restoreState(s);
  assert.equal(migrated.version, 5);
  assert.equal(migrated.coins, 321);
  assert.equal(migrated.gems, 17);
  assert.equal(migrated.power, 7);
  assert.deepEqual(migrated.trophies, [15]);
  assert.equal(openBoard(migrated)[0].hp, 1);
});

test("poor efficiency causes a real defeat; replaying with better tools and aim remains viable", () => {
  const poor = simulateCampaign(0.4);
  assert.ok(poor.length < 130);
  assert.equal(poor.at(-1).completed, false);
  assert.equal(poor.at(-1).challenge, true);
  const withoutMerges = simulateCampaign(0.8, { mergeTools: false });
  assert.ok(withoutMerges.length < 130);
  let state = createState(), recovered = 0;
  for (let level = 1; level <= 130; level++) {
    if (!simulateMine(state, 0.4).completed) {
      assert.equal(restartAttempt(state), true);
      const checkpoint = JSON.stringify(state);
      let won = false;
      for (const tierBoost of [0, 1, 2]) {
        const replay = restoreState(JSON.parse(checkpoint));
        if (simulateMine(replay, 0.8, { tierBoost }).completed) {
          state = replay;
          won = true;
          recovered++;
          break;
        }
      }
      assert.ok(won, `mine ${level} must offer a viable replay`);
    }
    nextLevel(state);
  }
  assert.ok(recovered > 0);
  assert.equal(state.campaignWins, 1);
});
