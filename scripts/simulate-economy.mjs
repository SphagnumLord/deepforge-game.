import {
  createState,
  LEVELS,
  openBoard,
  buyTool,
  buyCost,
  forgeTool,
  upgrade,
  upgradeCost,
  rescue,
  launch,
  toolStats,
  hitBlock,
  hitBoss,
  bossActive,
  nextLevel,
} from "../src/core.js";

// A budget model, not a replacement for playtesting: 65% of a tool's nominal
// contacts reach useful targets, with no rewards for contacts that miss.
export function simulateCampaign(efficiency = 0.65) {
  const state = createState(),
    report = [];
  for (const level of LEVELS) {
    openBoard(state);
    const opening = state.coins;
    while (
      state.coins - upgradeCost(state) >= buyCost(state) * 10 &&
      state.power < 60
    )
      upgrade(state);
    const blocks = openBoard(state);
    let throws = 0,
      rescues = 0;
    while (!state.levelComplete && throws < 1000) {
      let index = state.inventory.indexOf(
        Math.max(...state.inventory.map((v) => v || 0)),
      );
      if (index < 0 || !state.inventory[index]) {
        index = forgeTool(state);
        if (index < 0) index = buyTool(state);
        if (index < 0) {
          if (!rescue(state)) throw Error(`Budget stalled at mine ${level.id}`);
          index = state.inventory.findIndex(Boolean);
          rescues++;
        }
      }
      const tier = launch(state, index),
        stats = toolStats(state, tier);
      throws++;
      for (
        let hit = 0;
        hit < Math.max(1, Math.floor(stats.hits * efficiency)) &&
        !state.levelComplete;
        hit++
      ) {
        if (bossActive(state)) hitBoss(state, stats.damage);
        else {
          const target = blocks.find((b) => b.alive);
          if (target) hitBlock(state, blocks, target.id, stats.damage);
        }
      }
    }
    if (!state.levelComplete)
      throw Error(`Mine ${level.id} exceeded tool budget`);
    report.push({
      level: level.id,
      kind: level.kind,
      challenge: level.challenge,
      treasure: level.treasure,
      throws,
      rescues,
      power: state.power,
      earned: state.board.earned,
      spent: state.board.spent,
      net: state.board.earned - state.board.spent,
      wallet: state.coins,
      opening,
    });
    nextLevel(state);
  }
  return report;
}
if (process.argv[1]?.endsWith("simulate-economy.mjs")) {
  const report = simulateCampaign();
  console.table(
    report.filter((r) =>
      [1, 7, 8, 13, 14, 15, 29, 30, 103, 104, 105, 119, 120, 128, 130].includes(
        r.level,
      ),
    ),
  );
  console.log(
    JSON.stringify({
      mines: report.length,
      rescueTools: report.reduce((n, r) => n + r.rescues, 0),
      maxToolsPerMine: Math.max(...report.map((r) => r.throws)),
      endingCoins: report.at(-1).wallet,
      endingPower: report.at(-1).power,
    }),
  );
}
