import {
  createState, LEVELS, openBoard, buyTool, forgeTool, upgrade, upgradeCost,
  rescue, launch, toolStats, hitBlock, hitBoss, bossActive, nextLevel,
  recommendedTier, merge,
  routeProgress, collectRoute, claimBonusTool, launchBomb, detonateBomb,
} from "../src/core.js";

function prepareTool(state, target, allowMerge) {
  for (let step = 0; step < 100; step++) {
    const ready = state.inventory.findIndex((tier) => tier >= target);
    if (ready >= 0) return ready;
    let combined = false;
    if (allowMerge) {
      for (let tier = target - 1; tier >= 1; tier--) {
        const first = state.inventory.indexOf(tier);
        const second = state.inventory.indexOf(tier, first + 1);
        if (first >= 0 && second >= 0) {
          merge(state, first, second);
          combined = true;
          break;
        }
      }
    }
    if (combined) continue;
    if (buyTool(state) >= 0 || forgeTool(state) >= 0) continue;
    return state.inventory.findIndex((tier) => tier && tier === Math.max(...state.inventory));
  }
  return -1;
}

// Useful-contact budget, not a trajectory simulator. It uses the actual merge,
// tier gates, diamond costs, finite rescue and reward rules, with no ads.
export function simulateMine(state, efficiency = 0.65, { mergeTools = true, tierBoost = 0 } = {}) {
  const blocks = openBoard(state), level = LEVELS[state.level - 1];
  const opening = state.coins;
  let throws = 0, rescues = 0, merges = 0;
  let bombUses = 0;
  while (!state.levelComplete && throws < 500) {
    while (claimBonusTool(state) >= 0) { /* Equip carried picks when slots are free. */ }
    while (state.gems >= upgradeCost(state) && state.power < 60) upgrade(state);
    const route = routeProgress(state).find((route) => !route.claimed);
    const front = route && blocks.find((block) => block.alive && block.col === route.col);
    if (!bossActive(state) && front && state.bombs && bombUses < LEVELS[state.level - 1].routes) {
      launchBomb(state); detonateBomb(state, blocks, front.id); throws++; bombUses++;
      continue;
    }
    const before = state.inventory.filter(Boolean).length, runs = state.runs;
    let index = prepareTool(state, Math.min(12, recommendedTier(state.level) + tierBoost), mergeTools);
    merges += Math.max(0, before + state.runs - runs - state.inventory.filter(Boolean).length);
    if (index < 0 || !state.inventory[index]) {
      if (!rescue(state)) break;
      rescues++;
      index = state.inventory.findIndex(Boolean);
    }
    const tier = launch(state, index), stats = toolStats(state, tier);
    throws++;
    for (let hit = 0; hit < Math.max(1, Math.floor(stats.hits * efficiency)) && !state.levelComplete; hit++) {
      if (bossActive(state)) hitBoss(state, stats.damage, tier);
      else {
        const route = routeProgress(state).find((route) => !route.claimed);
        if (!route) break;
        if (route.open) { collectRoute(state, route.col); continue; }
        const target = blocks.find((b) => b.alive && b.col === route.col);
        if (!target || target.minTier > tier) break;
        hitBlock(state, blocks, target.id, stats.damage, tier);
      }
    }
  }
  return {
    level: level.id, kind: level.kind, challenge: level.challenge, treasure: level.treasure,
    completed: state.levelComplete, throws, rescues, merges, power: state.power,
    earned: state.board.earned, spent: state.board.spent,
    net: state.board.earned - state.board.spent, wallet: state.coins, opening,
  };
}

export function simulateCampaign(efficiency = 0.65, options = {}) {
  const state = createState(), report = [];
  for (const level of LEVELS) {
    const result = simulateMine(state, efficiency, options);
    report.push(result);
    if (!result.completed) break;
    nextLevel(state);
  }
  return report;
}

if (process.argv[1]?.endsWith("simulate-economy.mjs")) {
  for (const efficiency of [0.4, 0.65, 0.8]) {
    const report = simulateCampaign(efficiency);
    console.table(report.filter((r) => [1, 7, 8, 14, 15, 104, 120, 128, 130].includes(r.level) || !r.completed));
    console.log(JSON.stringify({
      efficiency, completedMines: report.filter((r) => r.completed).length,
      stalledAt: report.at(-1).completed ? null : report.at(-1).level,
      rescueTools: report.reduce((n, r) => n + r.rescues, 0),
      maxToolsPerMine: Math.max(...report.map((r) => r.throws)),
      endingCoins: report.at(-1).wallet, endingPower: report.at(-1).power,
    }));
  }
}
