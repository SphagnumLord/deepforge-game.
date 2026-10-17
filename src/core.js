export { LEVELS, TROPHIES, CAMPAIGN_LENGTH } from "./levels.js";
import { LEVELS, TROPHIES, CAMPAIGN_LENGTH } from "./levels.js";
// Keep the existing key so already saved v2 campaigns migrate in place.
export const STORAGE = "deepforge-save-v2";
export const LEGACY_STORAGE = "deepforge-mvp-v1";
export const BALANCE = Object.freeze({
  capacity: 12,
  maxTier: 12,
  maxActive: 5,
  maxPower: 60,
  startingCoins: 180,
  rewardAd: 80,
  columns: 7,
  rows: 10,
  challengeHp: 2.75,
  treasureReward: 1.8,
});
export const MATERIALS = [
  { name: "Песчаник", hp: 2, reward: 5, color: "#81533a", face: "#ba8054" },
  { name: "Сланец", hp: 4, reward: 9, color: "#455a68", face: "#738f9b" },
  { name: "Медная руда", hp: 7, reward: 14, color: "#653e36", face: "#c68255" },
  { name: "Обсидиан", hp: 12, reward: 23, color: "#39344e", face: "#79659d" },
  {
    name: "Золотая жила",
    hp: 5,
    reward: 32,
    color: "#716038",
    face: "#d0b374",
  },
  {
    name: "Кварцит",
    hp: 14,
    reward: 38,
    color: "#315a62",
    face: "#a0c9ba",
  },
];
const toolNames = [
  "Походная кирка",
  "Бронзовая кирка",
  "Золотая кирка",
  "Алмазная кирка",
  "Огненная кирка",
  "Изумрудная кирка",
  "Аметистовое пламя",
  "Кирка чёрного сияния",
  "Кирка мастера",
  "Кирка глубин",
  "Кирка хранителя",
  "Сердце кузни",
];
const toolMaterials = [
  ["steel", "#a8b6b3", "#e2e8dd", "#475956"],
  ["bronze", "#bf8b61", "#f0cc9e", "#654737"],
  ["gold", "#efba4c", "#fff2bb", "#996021"],
  ["diamond", "#72d9ef", "#e2ffff", "#287b9c"],
  ["fire", "#f0943e", "#ffe6a0", "#8c3425"],
  ["emerald", "#52c798", "#c1ffe0", "#20654f"],
  ["violet-fire", "#ae78ed", "#eed2ff", "#503079"],
  ["black", "#202737", "#cbdcf3", "#060a11"],
  ["master", "#d6bd81", "#fff2ca", "#605640"],
  ["depth", "#729ebc", "#d2edf3", "#2d475f"],
  ["guardian", "#cba2c5", "#ffe3e4", "#5c4266"],
  ["heart", "#e0ab72", "#fff2c6", "#81503e"],
];
export const TOOLS = toolNames.map((name, index) => ({
  name,
  tier: index + 1,
  kind: index % 3,
  material: toolMaterials[index][0],
  color: toolMaterials[index][1],
  light: toolMaterials[index][2],
  shade: toolMaterials[index][3],
  hits: 10 + index * 3,
  multiplier: 1.85 ** index,
}));
const integer = (v, fallback, min, max) =>
  Number.isSafeInteger(v) ? Math.min(max, Math.max(min, v)) : fallback;
export function random(seed) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function createState() {
  return {
    version: 4,
    coins: BALANCE.startingCoins,
    gems: 0,
    level: 1,
    best: 1,
    power: 0,
    runs: 0,
    purchasesThisMine: 0,
    campaignWins: 0,
    rescueUsed: false,
    attemptNumber: 1,
    entry: null,
    inventory: [1, 1, 1, 1, 2, ...Array(7).fill(null)],
    board: null,
    boss: null,
    trophies: [],
    levelComplete: false,
    muted: false,
    musicMuted: false,
    tutorialDone: false,
    updatedAt: 0,
  };
}
export function generateLevel(level) {
  const config = LEVELS[Math.max(0, Math.min(CAMPAIGN_LENGTH - 1, level - 1))],
    rng = random(config.seed);
  const blocks = Array.from({ length: BALANCE.columns * BALANCE.rows }, (_, id) => {
    const row = Math.floor(id / BALANCE.columns),
      col = id % BALANCE.columns;
    const vein =
      config.layout === 0
        ? col === 3
        : config.layout === 1
          ? (row + col) % 4 === 0
          : config.layout === 2
            ? col === row % 7
            : config.layout === 3
              ? row % 3 === 0
              : col === 1 || col === 5;
    let material = Math.min(
      3,
      Math.max(
        0,
        config.material - 1 + Math.floor(row / 4) + (rng() > 0.6 ? 1 : 0),
      ),
    );
    const roll = rng();
    let type =
      roll < config.bombRate
        ? "bomb"
        : "normal";
    if (config.treasure) {
      if (rng() < config.goldRate) material = 4;
    } else if (vein && rng() < 0.35) material = config.id > 65 ? 5 : 4;
    else if (rng() < config.goldRate) material = 4;
    if (row === 0 && col === 3) {
      type = "bomb";
      material = 0;
    }
    const geologicalHp = Math.ceil(
      (MATERIALS[material].hp + config.hpBonus) *
        config.depthScale *
        config.hpFactor,
    );
    // Armoured floors keep even soft seams in every eighth mine challenging;
    // otherwise a shop-tier jump could trivialise an entire trial (e.g. #24).
    const expectedPower = Math.floor(Math.log2(config.id + 1));
    const armourFactor = config.challenge
      ? 1.6 + Math.max(0, config.id - 16) * 0.03
      : config.boss ? 1.2 : row >= 6 ? config.treasure ? 0.3 : 0.8 : 0;
    const armourHp = Math.ceil(
      damage(recommendedTier(config.id), expectedPower) * armourFactor,
    );
    const maxHp = Math.max(geologicalHp, armourHp);
    const minTier =
      row >= 6 || config.challenge || config.boss
        ? recommendedTier(config.id)
        : shopTier({ level: config.id });
    return { id, row, col, material, type, minTier, hp: maxHp, maxHp, alive: true };
  });
  // Deep, deterministic diamond seams: no extra diamonds from decorative quartz.
  const seamRandom = random(config.seed ^ 0x4d1a);
  const candidates = blocks
    .filter((b) => b.row >= 5 && b.type !== "bomb")
    .map((b) => ({ block: b, order: seamRandom() }))
    .sort((a, b) => a.order - b.order);
  for (const { block } of candidates.slice(0, config.diamonds)) {
    block.type = "gem";
    block.minTier = recommendedTier(config.id);
    block.maxHp = Math.ceil(block.maxHp * 1.65);
    block.hp = block.maxHp;
  }
  return blocks;
}
export function getBoosts(s) {
  const owned = new Set(s.trophies || []),
    total = { damage: 1, gold: 1, discount: 0, hits: 0 };
  for (const t of TROPHIES)
    if (owned.has(t.level)) {
      if (t.effect === "discount") total.discount += t.value;
      else total[t.effect] += t.value;
    }
  total.discount = Math.min(0.15, total.discount);
  return total;
}
export const shopTier = (s) => Math.min(7, 1 + Math.floor((s.level - 1) / 20));
export function recommendedTier(level) {
  const config = LEVELS[level - 1];
  const extra = level === 1 ? 0 : config.challenge || config.boss ? 2 : 1;
  return Math.min(10, shopTier({ level }) + extra);
}
export const isHardMine = (s) =>
  LEVELS[s.level - 1].challenge || LEVELS[s.level - 1].boss;
export function attemptBudget(s) {
  if (s.level === 1) return BALANCE.startingCoins;
  return Math.ceil(
    buyCost({ ...s, purchasesThisMine: 0 }) * (isHardMine(s) ? 48 : 12),
  );
}
export const rescueTier = (s) => Math.max(1, shopTier(s) - 1);
export const buyCost = (s) =>
  Math.round(
    (25 + (s.level - 1) * 1.4) *
      (1 + (s.level - 1) * 0.002) *
      (1 + Math.min(8, s.purchasesThisMine || 0) * 0.035) *
      (1 - getBoosts(s).discount),
  );
export const upgradeCost = (s) => 3 + Math.floor(s.power * 1.5);
export const forgeCost = (s) => 5 + Math.floor((s.level - 1) / 20) * 2;
export const forgeTier = (s) => Math.min(BALANCE.maxTier, shopTier(s) + 1);
export const damage = (tier, power = 0, multiplier = 1) =>
  Math.max(
    1,
    Math.round(TOOLS[tier - 1].multiplier * (power + 2) * multiplier),
  );
export function toolStats(s, tier) {
  const buffs = getBoosts(s);
  return {
    damage: damage(tier, s.power, buffs.damage),
    hits: TOOLS[tier - 1].hits + buffs.hits,
  };
}
export function blockReward(s, block) {
  const level = LEVELS[s.level - 1];
  return (
    Math.round(
      (MATERIALS[block.material].reward * 1.1 + 1) *
        level.incomeScale *
        level.rewardFactor *
        getBoosts(s).gold,
    ) + (block.type === "gem" ? Math.ceil(3 * level.incomeScale) : 0)
  );
}
function createBoss(level) {
  const config = LEVELS[level - 1];
  return config.boss
    ? { level, hp: config.bossHp, maxHp: config.bossHp, hits: 0 }
    : null;
}
export function bossActive(s) {
  return (
    !!s.boss && s.boss.hp > 0 && !!s.board && s.board.hp.every((hp) => hp === 0)
  );
}
export function bossVulnerable(s) {
  return !!s.boss && s.boss.hits % 4 === 3;
}
export function restoreState(raw) {
  if (
    !raw ||
    typeof raw !== "object" ||
    !Array.isArray(raw.inventory) ||
    raw.inventory.length !== BALANCE.capacity
  )
    return createState();
  const s = createState();
  for (const [key, min, max] of [
    ["coins", 0, 1e9],
    ["gems", 0, 1e6],
    ["level", 1, CAMPAIGN_LENGTH],
    ["best", 1, CAMPAIGN_LENGTH],
    ["power", 0, BALANCE.maxPower],
    ["runs", 0, 1e6],
    ["purchasesThisMine", 0, 1e6],
    ["campaignWins", 0, 1e6],
    ["updatedAt", 0, 1e15],
  ])
    s[key] = integer(raw[key], s[key], min, max);
  s.best = Math.max(s.best, s.level);
  s.inventory = raw.inventory.map((v) =>
    Number.isInteger(v) && v >= 1 && v <= BALANCE.maxTier ? v : null,
  );
  s.trophies = TROPHIES.filter(
    (t) => Array.isArray(raw.trophies) && raw.trophies.includes(t.level),
  ).map((t) => t.level);
  s.muted = raw.muted === true;
  s.musicMuted = raw.musicMuted === true;
  s.tutorialDone = raw.tutorialDone === true;
  const blocks = generateLevel(s.level);
  s.boss = createBoss(s.level);
  if (
    [2, 3, 4].includes(raw.version) &&
    raw.board?.level === s.level &&
    Array.isArray(raw.board.hp) &&
    raw.board.hp.length === blocks.length
  ) {
    const hp = blocks.map((b, i) =>
      integer(raw.board.hp[i], b.maxHp, 0, b.maxHp),
    );
    s.board = {
      level: s.level,
      hp,
      checkpoints: integer(
        raw.board.checkpoints,
        Math.floor(hp.filter((v) => v === 0).length / 10),
        0,
        7,
      ),
      earned: integer(raw.board.earned, 0, 0, 1e9),
      spent: integer(raw.board.spent, 0, 0, 1e9),
      throws: integer(raw.board.throws, 0, 0, 1e6),
    };
    if (s.boss && raw.version >= 3 && raw.boss?.level === s.level) {
      s.boss.hp = integer(raw.boss.hp, s.boss.maxHp, 0, s.boss.maxHp);
      s.boss.hits = integer(raw.boss.hits, 0, 0, 1e6);
    }
    // Preserve already cleared v2 mines, without inventing a trophy for a boss that never existed.
    if (s.boss && raw.version === 2 && hp.every((v) => v === 0)) s.boss.hp = 0;
    s.levelComplete = hp.every((v) => v === 0) && (!s.boss || s.boss.hp === 0);
  }
  s.rescueUsed = raw.rescueUsed === true;
  s.attemptNumber = integer(raw.attemptNumber, 1, 1, 1e6);
  if (
    raw.version === 4 && raw.entry?.level === s.level &&
    Array.isArray(raw.entry.inventory) &&
    raw.entry.inventory.length === BALANCE.capacity
  ) {
    s.entry = snapshotEntry({
      ...s,
      coins: integer(raw.entry.coins, s.coins, 0, 1e9),
      gems: integer(raw.entry.gems, s.gems, 0, 1e6),
      power: integer(raw.entry.power, s.power, 0, BALANCE.maxPower),
      runs: integer(raw.entry.runs, s.runs, 0, 1e6),
      inventory: raw.entry.inventory.map((v) =>
        Number.isInteger(v) && v >= 1 && v <= BALANCE.maxTier ? v : null,
      ),
    });
  }
  return s;
}
export function loadState(storage) {
  for (const key of [STORAGE, LEGACY_STORAGE])
    try {
      const raw = JSON.parse(storage.getItem(key));
      if (
        raw &&
        Array.isArray(raw.inventory) &&
        raw.inventory.length === BALANCE.capacity
      )
        return restoreState(raw);
    } catch {
      /* The in-memory game remains playable. */
    }
  return createState();
}
export function openBoard(s) {
  if (!s.entry || s.entry.level !== s.level) {
    // A checkpoint needs enough finite supplies for a fair replay. Only a new
    // mine receives this minimum; reloads retain the existing entry and wallet.
    if (!s.board || s.board.level !== s.level)
      s.coins = Math.max(s.coins, attemptBudget(s));
    s.entry = snapshotEntry(s);
  }
  const blocks = generateLevel(s.level);
  if (s.board?.level === s.level)
    blocks.forEach((b, i) => {
      b.hp = s.board.hp[i];
      b.alive = b.hp > 0;
    });
  const previous = s.board?.level === s.level ? s.board : null;
  s.board = {
    level: s.level,
    hp: blocks.map((b) => b.hp),
    checkpoints:
      previous?.checkpoints ??
      Math.floor(blocks.filter((b) => !b.alive).length / 10),
    earned: previous?.earned || 0,
    spent: previous?.spent || 0,
    throws: previous?.throws || 0,
  };
  if (LEVELS[s.level - 1].boss && s.boss?.level !== s.level)
    s.boss = createBoss(s.level);
  if (!LEVELS[s.level - 1].boss) s.boss = null;
  s.levelComplete =
    blocks.every((b) => !b.alive) && (!s.boss || s.boss.hp === 0);
  return blocks;
}
export function forgeTool(s) {
  const index = s.inventory.indexOf(null),
    cost = forgeCost(s);
  if (s.levelComplete || index < 0 || s.gems < cost) return -1;
  s.gems -= cost;
  s.inventory[index] = forgeTier(s);
  return index;
}
export function buyTool(s) {
  const index = s.inventory.indexOf(null),
    cost = buyCost(s);
  if (s.levelComplete || index < 0 || s.coins < cost) return -1;
  s.coins -= cost;
  if (s.board) s.board.spent += cost;
  s.inventory[index] = shopTier(s);
  s.runs++;
  s.purchasesThisMine++;
  return index;
}
export function upgrade(s) {
  const cost = upgradeCost(s);
  if (s.levelComplete || s.power >= BALANCE.maxPower || s.gems < cost)
    return false;
  s.gems -= cost;
  s.power++;
  return true;
}
export function merge(s, from, to) {
  if (
    s.levelComplete ||
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    to < 0 ||
    from >= BALANCE.capacity ||
    to >= BALANCE.capacity ||
    from === to
  )
    return false;
  const tier = s.inventory[from];
  if (!tier || tier !== s.inventory[to] || tier >= BALANCE.maxTier)
    return false;
  s.inventory[to]++;
  s.inventory[from] = null;
  return true;
}
export function findMergePair(s) {
  if (s.levelComplete) return null;
  // Start with the lowest tiers so new tools participate in the same cascade.
  for (let tier = 1; tier < BALANCE.maxTier; tier++) {
    const from = s.inventory.indexOf(tier);
    if (from < 0) continue;
    const to = s.inventory.indexOf(tier, from + 1);
    if (to >= 0) return [from, to];
  }
  return null;
}
export function mergeAll(s) {
  const merged = [];
  let pair;
  while ((pair = findMergePair(s))) {
    const [from, to] = pair, tier = s.inventory[from];
    if (!merge(s, from, to)) break;
    merged.push({ from, to, tier });
  }
  return merged;
}
function snapshotEntry(s) {
  // Old saves have no checkpoint. A fair replay is funded without generating
  // emergency picks or changing that save's current loot and equipment.
  return {
    level: s.level,
    coins: Math.max(s.coins, attemptBudget(s)),
    gems: s.gems,
    power: s.power,
    runs: s.runs,
    inventory: [...s.inventory],
  };
}
export function isStranded(s, active = 0) {
  return (
    !s.levelComplete &&
    active === 0 &&
    !s.inventory.some(Boolean) &&
    s.coins < buyCost(s) &&
    s.gems < forgeCost(s)
  );
}
export function canRescue(s, active = 0) {
  return isStranded(s, active) && !isHardMine(s) && !s.rescueUsed;
}
export function needsRestart(s, active = 0) {
  return isStranded(s, active) && (isHardMine(s) || s.rescueUsed);
}
export function restartAttempt(s, active = 0) {
  if (!needsRestart(s, active)) return false;
  return restartMine(s);
}
// A manual restart uses the same checkpoint as a failed attempt, even while
// tools are flying. The caller discards those bodies when rebuilding the mine.
export function restartMine(s) {
  if (s.levelComplete) return false;
  const entry = s.entry?.level === s.level ? s.entry : snapshotEntry(s);
  Object.assign(s, {
    coins: entry.coins,
    gems: entry.gems,
    power: entry.power,
    runs: entry.runs,
    inventory: [...entry.inventory],
    entry: { ...entry, inventory: [...entry.inventory] },
    board: null,
    boss: null,
    levelComplete: false,
    purchasesThisMine: 0,
    rescueUsed: false,
    attemptNumber: Math.min(1e6, s.attemptNumber + 1),
  });
  return true;
}
export function rescue(s, active = 0) {
  if (!canRescue(s, active)) return false;
  s.inventory[0] = rescueTier(s);
  s.rescueUsed = true;
  return true;
}
export function launch(s, index, active = 0) {
  if (
    s.levelComplete ||
    active >= BALANCE.maxActive ||
    !Number.isInteger(index) ||
    !s.inventory[index]
  )
    return null;
  const tier = s.inventory[index];
  s.inventory[index] = null;
  if (s.board) s.board.throws++;
  return tier;
}
function completeLevel(s) {
  if (
    s.levelComplete ||
    !s.board.hp.every((hp) => hp === 0) ||
    (s.boss && s.boss.hp > 0)
  )
    return { completed: false, trophy: null };
  s.levelComplete = true;
  const config = LEVELS[s.level - 1];
  s.coins += config.bonus;
  s.board.earned += config.bonus;
  s.best = Math.max(s.best, Math.min(CAMPAIGN_LENGTH, s.level + 1));
  if (config.challenge) s.gems++;
  let trophy = null;
  if (config.boss) {
    s.gems += 1;
    if (!s.trophies.includes(config.trophy.level)) {
      s.trophies.push(config.trophy.level);
      trophy = config.trophy;
    }
  }
  return { completed: true, trophy };
}
export function hitBlock(s, blocks, id, amount, tier = 1) {
  const empty = {
    destroyed: [],
    completed: false,
    coins: 0,
    gems: 0,
    checkpointCoins: 0,
    chainCoins: 0,
    trophy: null,
    bossRevealed: false,
    blocked: false,
  };
  if (
    s.levelComplete ||
    !blocks[id]?.alive ||
    !Number.isFinite(amount) ||
    amount <= 0
  )
    return empty;
  if (tier < blocks[id].minTier) return { ...empty, blocked: true };
  const coinsBefore = s.coins,
    gemsBefore = s.gems,
    destroyed = [],
    queue = [[id, amount]];
  for (let q = 0; q < queue.length; q++) {
    const [index, hit] = queue[q],
      b = blocks[index];
    if (!b?.alive) continue;
    b.hp = Math.max(0, b.hp - Math.round(hit));
    s.board.hp[index] = b.hp;
    if (b.hp > 0) continue;
    b.alive = false;
    destroyed.push(b);
    s.coins += blockReward(s, b);
    if (b.type === "gem") s.gems++;
    if (b.type === "bomb")
      for (const n of blocks)
        if (
          n.alive &&
          Math.abs(n.col - b.col) <= 1 &&
          Math.abs(n.row - b.row) <= 1
        )
          queue.push([n.id, Math.max(3, Math.ceil(n.maxHp * 0.8))]);
  }
  const config = LEVELS[s.level - 1],
    reached = Math.floor(blocks.filter((b) => !b.alive).length / 10);
  const checkpointCoins =
    Math.max(0, reached - s.board.checkpoints) *
    Math.round(6 * config.incomeScale);
  s.board.checkpoints = Math.max(s.board.checkpoints, reached);
  const chainCoins = Math.round(
    Math.max(0, destroyed.length - 1) * 2 * config.incomeScale,
  );
  s.coins += checkpointCoins + chainCoins;
  s.board.earned += s.coins - coinsBefore;
  const completion = completeLevel(s);
  return {
    destroyed,
    ...completion,
    coins: s.coins - coinsBefore,
    gems: s.gems - gemsBefore,
    checkpointCoins,
    chainCoins,
    bossRevealed: bossActive(s),
    blocked: false,
  };
}
export function hitBoss(s, amount, tier = 1) {
  if (
    !bossActive(s) ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    s.levelComplete
  )
    return { damage: 0, completed: false, trophy: null, coins: 0 };
  if (tier < recommendedTier(s.level))
    return { damage: 0, completed: false, trophy: null, coins: 0, blocked: true };
  const weak = bossVulnerable(s),
    dealt = Math.max(1, Math.round(amount * (weak ? 1.65 : 0.55)));
  s.boss.hp = Math.max(0, s.boss.hp - dealt);
  s.boss.hits++;
  const before = s.coins,
    completion = completeLevel(s);
  return {
    damage: dealt,
    vulnerable: weak,
    ...completion,
    coins: s.coins - before,
  };
}
export function nextLevel(s) {
  if (!s.levelComplete) return false;
  if (s.level === CAMPAIGN_LENGTH) {
    s.campaignWins++;
    s.level = 1;
  } else s.level++;
  s.board = null;
  s.boss = null;
  s.purchasesThisMine = 0;
  s.levelComplete = false;
  s.entry = null;
  s.rescueUsed = false;
  s.attemptNumber = 1;
  return true;
}
