import {
  BALANCE,
  STORAGE,
  LEVELS,
  TOOLS,
  loadState,
  restoreState,
  openBoard,
  buyCost,
  upgradeCost,
  forgeCost,
  forgeTier,
  forgeTool,
  buyTool,
  upgrade,
  merge,
  mergeAll,
  findMergePair,
  rescue,
  canRescue,
  launch,
  hitBlock,
  nextLevel,
  CAMPAIGN_LENGTH,
  TROPHIES,
  getBoosts,
  shopTier,
  toolStats,
  bossActive,
  bossVulnerable,
  hitBoss,
  recommendedTier,
  isHardMine,
  restartAttempt,
  restartMine,
  routeColumns, routeProgress, collectRoute, pendingPrizes, prizeLabel,
  claimBonusTool, launchBomb, detonateBomb,
} from "./src/core.js";
import { MinePhysics, blockRect, FIELD, prizePosition } from "./src/physics.js";
import { MineRenderer } from "./src/renderer.js";
import { toolMarkup, trophyMarkup } from "./src/art.js";
import { GameAudio } from "./src/audio.js";
import { YandexPlatform } from "./src/platform.js";

const $ = (id) => document.getElementById(id);
const canvas = $("game"),
  renderer = new MineRenderer(canvas),
  pauses = new Set();
let storage;
try {
  storage = window.localStorage;
} catch {
  storage = {
    getItem: () => null,
    setItem: () => {
      throw new Error("Storage unavailable");
    },
    removeItem: () => {},
  };
}
let state = loadState(storage),
  blocks = [],
  physics,
  selected = -1,
  pointerX = null,
  cloudTimer,
  lastTime = 0,
  accumulator = 0,
  booting = true;
let aimCol = 3, prizeUntil = 0;
const audio = new GameAudio(state.muted, state.musicMuted);
const platform = new YandexPlatform({
  onPause: (reason) => pause(reason, true),
  onResume: (reason) => pause(reason, false),
  onStatus: (text) => {
    $("saveStatus").textContent = text;
  },
});
const number = (n) => n.toLocaleString("ru-RU");
const isPaused = () => booting || pauses.size > 0;
function hint(message) {
  $("hint").textContent = message;
}
function pause(reason, enabled) {
  if (enabled) pauses.add(reason);
  else pauses.delete(reason);
  audio.setPaused(isPaused());
  platform.setPlaying(!isPaused() && !state.levelComplete);
  $("pauseShade").classList.toggle("hidden", !pauses.has("manual"));
  refresh();
}
function persist() {
  state.updatedAt = Date.now();
  try {
    storage.setItem(STORAGE, JSON.stringify(state));
  } catch {
    $("saveStatus").textContent = "Сохранение на устройстве недоступно";
  }
  clearTimeout(cloudTimer);
  cloudTimer = setTimeout(() => platform.save(state), 2500);
}
function refresh() {
  const active = physics?.tools.length || 0,
    locked = isPaused() || state.levelComplete;
  $("coins").textContent = number(state.coins);
  $("gems").textContent = number(state.gems);
  $("level").textContent = String(state.level).padStart(2, "0");
  $("best").textContent = String(state.best).padStart(2, "0");
  $("capacity").textContent =
    `${state.inventory.filter(Boolean).length} / ${BALANCE.capacity}`;
  $("buyCost").textContent = buyCost(state);
  $("shopTier").textContent = shopTier(state);
  $("upgradeCost").textContent =
    state.power >= BALANCE.maxPower ? "МАКС." : number(upgradeCost(state));
  $("damage").textContent = state.power + 2;
  $("buy").disabled =
    locked || state.coins < buyCost(state) || !state.inventory.includes(null);
  $("forge").disabled =
    locked || state.gems < forgeCost(state) || !state.inventory.includes(null);
  $("forgeCost").textContent = forgeCost(state);
  $("forgeTier").textContent = forgeTier(state);
  $("upgrade").disabled =
    locked ||
    state.gems < upgradeCost(state) ||
    state.power >= BALANCE.maxPower;
  $("autoMerge").disabled = locked || !findMergePair(state);
  $("upgradeLabel").textContent = state.power >= BALANCE.maxPower
    ? "Сила на максимуме" : "Улучшить силу (+1)";
  const previewTier = state.inventory[selected] || 1;
  const currentDamage = toolStats(state, previewTier).damage;
  const nextDamage = toolStats({ ...state, power: Math.min(BALANCE.maxPower, state.power + 1) }, previewTier).damage;
  $("upgrade").title = state.power >= BALANCE.maxPower ? "Максимальная базовая сила достигнута"
    : `Базовая сила: ${state.power + 2} → ${state.power + 3}. Урон кирки ур. ${previewTier}: ${currentDamage} → ${nextDamage} (+${nextDamage - currentDamage}).`;
  $("reset").disabled = booting || state.levelComplete || platform.adActive;
  $("rescue").classList.toggle("hidden", !canRescue(state, active));
  $("rescue").disabled = locked;
  $("attemptNumber").textContent = state.attemptNumber;
  $("tierNeed").textContent = recommendedTier(state.level);
  $("rescueRule").textContent = isHardMine(state)
    ? "Без аварийных кирок: потеря запасов перезапустит шахту."
    : state.rescueUsed
      ? "Аварийная кирка использована. Потеря запасов перезапустит шахту."
      : "Одна аварийная кирка на попытку. Затем шахта начинается заново.";
  canvas.dataset.attempt = state.attemptNumber;
  $("dropSelected").classList.toggle("hidden", selected < 0 || locked);
  $("dropSelected").disabled = active >= BALANCE.maxActive;
  $("rewardAd").classList.toggle("hidden", !platform.canReward);
  $("rewardAd").disabled = locked || platform.adActive;
  $("activeTools").textContent = `${active} / ${BALANCE.maxActive}`;
  $("supplies").classList.toggle("hidden", !state.bombs && !state.bonusTools.length);
  $("throwBomb").disabled = locked || active >= BALANCE.maxActive || !state.bombs;
  $("bombCount").textContent = state.bombs;
  $("claimBonusTool").classList.toggle("hidden", !state.bonusTools.length);
  $("claimBonusTool").disabled = locked || !state.inventory.includes(null);
  $("claimBonusTool").textContent = `Взять кирку ур. ${state.bonusTools[0] || 1} · запас ${state.bonusTools.length}`;
  canvas.dataset.active = active;
  const destroyed = blocks.filter((b) => !b.alive).length;
  const routes = routeProgress(state), claimed = routes.filter((route) => route.claimed).length;
  $("remaining").textContent = `${claimed} / ${routes.length} тайников`;
  canvas.dataset.claimed = claimed;
  canvas.dataset.routes = routes.length;
  canvas.dataset.bombs = state.bombs;
  canvas.dataset.prizeGlow = Number(renderer.time < prizeUntil);
  $("objectiveText").textContent = routes.length === 1
    ? "Пробей отмеченный проход и подбери тайник киркой внизу."
    : `Пройди ${routes.length} отмеченных прохода и подбери тайник в конце каждого.`;
  for (const route of routes) {
    const button = $("routeTargets").querySelector(`[data-col="${route.col}"]`);
    if (button) {
      button.textContent = `${["I", "II", "III"][route.index]} · ${route.claimed ? "✓" : route.open ? "тайник открыт" : `${route.cleared}/10`}`;
      button.disabled = locked || route.claimed && !bossActive(state);
      button.setAttribute("aria-pressed", String(route.col === aimCol));
    }
  }
  const prizes = pendingPrizes(state);
  $("prizePreview").textContent = prizes.length
    ? `В следующую шахту: ${prizes.map(prizeLabel).join(" + ")}.`
    : `Награда внизу: ${routes.map((route) => prizeLabel(route.prize)).join(" + ")}.`;
  canvas.dataset.destroyed = destroyed;
  canvas.dataset.kind = LEVELS[state.level - 1].kind;
  canvas.dataset.boss = bossActive(state)
    ? "active"
    : state.boss
      ? state.boss.hp === 0
        ? "defeated"
        : "waiting"
      : "none";
  $("mineEarned").textContent = number(state.board?.earned || 0);
  $("mineSpent").textContent = number(state.board?.spent || 0);
  const toCheckpoint =
    Math.min(70, ((state.board?.checkpoints || 0) + 1) * 10) - destroyed;
  $("nextMilestone").textContent =
    claimed === routes.length
      ? bossActive(state)
        ? "Путь свободен. Добейся победы над хранителем!"
        : "Все тайники подобраны. Можно идти дальше."
      : `Ещё ${toCheckpoint} блоков — премия ${Math.round(6 * LEVELS[state.level - 1].incomeScale)} монет.`;
  $("bossStatus").classList.toggle("hidden", !state.boss);
  if (state.boss) {
    $("bossName").textContent = LEVELS[state.level - 1].trophy.boss;
    $("bossHp").textContent =
      `${number(state.boss.hp)} / ${number(state.boss.maxHp)}`;
    $("bossFill").style.width = `${(state.boss.hp / state.boss.maxHp) * 100}%`;
    $("bossStatus").classList.toggle(
      "vulnerable",
      bossActive(state) && bossVulnerable(state),
    );
    $("bossHint").textContent =
      state.boss.hp === 0
        ? "Хранитель побеждён. Трофей сохранён."
        : !bossActive(state)
          ? "Подбери тайники в проходах, чтобы разбудить хранителя."
          : bossVulnerable(state)
            ? "Слабое место открыто! Следующий удар ×1,65."
            : `Броня поглощает часть урона. До слабого места: ${3 - (state.boss.hits % 4)} удара.`;
  }
  $("progressFill").style.width =
    `${routes.reduce((sum, route) => sum + (route.claimed ? 11 : route.cleared), 0) / (routes.length * 11) * 100}%`;
  for (const [i, slot] of [...$("inventory").children].entries()) {
    const tier = state.inventory[i];
    if (slot.dataset.tier !== String(tier)) {
      slot.innerHTML = tier
        ? `${toolMarkup(tier)}<small>УР. ${tier}</small>`
        : "";
      slot.dataset.tier = String(tier);
    }
    slot.classList.toggle("empty", !tier);
    slot.classList.toggle("selected", selected === i);
    slot.classList.toggle(
      "merge-target",
      !!tier &&
        selected >= 0 &&
        selected !== i &&
        tier === state.inventory[selected] &&
        tier < BALANCE.maxTier,
    );
    slot.setAttribute(
      "aria-label",
      tier
        ? `${TOOLS[tier - 1].name}, уровень ${tier}, ячейка ${i + 1}`
        : `Пустая ячейка ${i + 1}`,
    );
    slot.setAttribute("aria-pressed", String(selected === i));
    slot.setAttribute("aria-disabled", String(locked));
    slot.title = tier
      ? `${TOOLS[tier - 1].name} · урон ${toolStats(state, tier).damage} · ${toolStats(state, tier).hits} ударов`
      : "Пустая ячейка";
  }
  const tier = state.inventory[selected];
  $("selectedIcon").innerHTML = toolMarkup(tier || 1);
  $("selectedIcon").style.opacity = tier ? "1" : ".35";
  $("selectedName").textContent = tier
    ? TOOLS[tier - 1].name
    : "Выбери инструмент";
  $("selectedInfo").textContent = tier
    ? `Уровень ${tier} · урон ${toolStats(state, tier).damage} · ${toolStats(state, tier).hits} ударов`
    : "И брось его в шахту";
  $("levelOverlay").classList.toggle("hidden", !state.levelComplete || renderer.time < prizeUntil);
  if (state.levelComplete) {
    $("winTitle").textContent =
      state.level === CAMPAIGN_LENGTH
        ? "Сердце горы найдено!"
        : state.boss && state.trophies.includes(state.level)
          ? "Хранитель побеждён!"
          : LEVELS[state.level - 1].treasure
            ? "Золотая жила собрана!"
            : "Проход пройден!";
    $("winText").textContent =
      state.level === CAMPAIGN_LENGTH
        ? `Все ${CAMPAIGN_LENGTH} шахт пройдены. Начни новый поход с накоплениями и трофеями.`
        : state.boss
          ? state.trophies.includes(state.level)
            ? `Трофей «${LEVELS[state.level - 1].trophy.name}» на полке. Постоянно: ${LEVELS[state.level - 1].trophy.description}.`
            : "Эта шахта уже завершена в предыдущей версии. Продолжай экспедицию: новые хранители и трофеи впереди."
          : `Найдено ${number(state.board?.earned || 0)} монет, на кирки потрачено ${number(state.board?.spent || 0)}. Впереди — ${LEVELS[state.level].name.toLowerCase()}.`;
    $("winPrizes").textContent = prizes.length ? `В следующей шахте: ${prizes.map(prizeLabel).join(" + ")}` : "Снаряжение и трофеи сохранятся.";
    $("nextLevel").textContent =
      state.level === CAMPAIGN_LENGTH
        ? "Ещё один поход →"
        : "В следующую шахту →";
  }
  const soundButton = $("sound");
  soundButton.textContent = state.muted ? "♪̸" : "♪";
  soundButton.setAttribute(
    "aria-label",
    state.muted ? "Включить звук" : "Выключить звук",
  );
  soundButton.setAttribute("aria-pressed", String(state.muted));
  $("music").textContent = state.musicMuted ? "Мелодия: выкл" : "Мелодия: вкл";
  $("music").setAttribute("aria-pressed", String(state.musicMuted));
  $("trophyCount").textContent =
    `${state.trophies.length} / ${TROPHIES.length}`;
  const trophyKey = state.trophies.join(",");
  if ($("trophyList").dataset.owned !== trophyKey) {
    $("trophyList").dataset.owned = trophyKey;
    $("trophyList").innerHTML = TROPHIES.filter((t) =>
      state.trophies.includes(t.level),
    )
      .map(
        (t) =>
          `<div class="trophy-item" data-trophy="${t.level}" title="${t.name}: ${t.description}">${trophyMarkup(t)}<span>${t.name}<small>${t.description}</small></span></div>`,
      )
      .join("");
  }
  const buffs = getBoosts(state);
  $("trophyBoosts").textContent = state.trophies.length
    ? `Бонусы: урон +${Math.round((buffs.damage - 1) * 100)}% · золото +${Math.round((buffs.gold - 1) * 100)}% · скидка ${Math.round(buffs.discount * 100)}%${buffs.hits ? ` · +${buffs.hits} удар` : ""}.`
    : "Первый хранитель ждёт в 15-й шахте. Его трофей останется на фоне и усилит инструменты.";
}
function syncBoss() {
  if (bossActive(state)) {
    physics.showBoss();
    physics.boss.enraged = state.boss.hp < state.boss.maxHp * 0.35;
  } else physics.hideBoss();
}
function setupLevel() {
  cancelDrag();
  physics?.destroy();
  selected = -1;
  renderer.particles = [];
  renderer.waves = [];
  renderer.prizeFlares = [];
  prizeUntil = 0;
  blocks = openBoard(state);
  aimCol = routeProgress(state).find((route) => !route.claimed)?.col ?? routeColumns(state.level)[0];
  pointerX = prizePosition(aimCol).x;
  $("routeTargets").innerHTML = routeColumns(state.level).map((col) => `<button type="button" data-col="${col}"></button>`).join("");
  physics = new MinePhysics(blocks, {
    goals: routeProgress(state),
    onCollect: (col, tool) => {
      const result = collectRoute(state, col);
      if (!result) return;
      tool.extracted = true;
      physics.removeReward(col);
      const { x, y } = prizePosition(col);
      renderer.celebrate(x, y, prizeLabel(result.prize));
      prizeUntil = renderer.time + 75;
      audio.play("prize");
      syncBoss();
      const next = routeProgress(state).find((route) => !route.claimed);
      if (next) { aimCol = next.col; pointerX = prizePosition(aimCol).x; }
      if (result.completed) { platform.setPlaying(false); hint("Тайник твой! Награда ждёт в следующей шахте."); }
      else if (result.bossRevealed) hint(`Тайники собраны. Проснулся ${LEVELS[state.level - 1].trophy.boss}!`);
      else hint(`Подобрано: ${prizeLabel(result.prize)}. Осталось проходов: ${routeProgress(state).filter((route) => !route.claimed).length}.`);
      persist(); refresh();
    },
    onBombHit: (id, tool, boss) => {
      if (state.levelComplete) return;
      const { x, y } = tool.body.position;
      const result = boss
        ? hitBoss(state, toolStats(state, recommendedTier(state.level)).damage * 2, recommendedTier(state.level))
        : detonateBomb(state, blocks, id);
      for (const block of result.destroyed || []) {
        physics.removeBlock(block.id);
        const rect = blockRect(block);
        renderer.burst(rect.x + 27, rect.y + 18, "#e9c58e", 10);
      }
      renderer.blast(x, y); renderer.burst(x, y, "#f0cc87", 28);
      audio.play("explosion");
      canvas.dataset.explosions = Number(canvas.dataset.explosions || 0) + 1;
      syncBoss();
      if (result.completed) { platform.setPlaying(false); hint("Хранитель побеждён! Тайники отправятся в следующую шахту."); }
      else hint("Бомба расчистила породу. Тайник подбирается киркой.");
      persist(); refresh();
    },
    onHit: (id, power, tool) => {
      if (state.levelComplete) return;
      const result = hitBlock(state, blocks, id, power, tool.tier),
        { x, y } = tool.body.position;
      const explosions = result.destroyed.filter((b) => b.type === "bomb");
      renderer.burst(x, y, "#e9cca0", 4);
      for (const b of result.destroyed) {
        physics.removeBlock(b.id);
        const r = blockRect(b);
        if (b.type === "bomb") renderer.blast(r.x + 27, r.y + 18);
        renderer.burst(
          r.x + 27,
          r.y + 18,
          b.type === "gem"
            ? "#a3e6cc"
            : b.type === "bomb"
              ? "#edbf73"
              : "#c99c70",
          b.type === "bomb" ? 25 : 12,
        );
      }
      syncBoss();
      if (result.blocked) {
        canvas.dataset.blockedHits = Number(canvas.dataset.blockedHits || 0) + 1;
        hint(`Эта порода требует кирку ур. ${blocks[id].minTier}+. Объедини одинаковые инструменты.`);
        return;
      }
      if (explosions.length) {
        audio.play("explosion");
        canvas.dataset.explosions = Number(canvas.dataset.explosions || 0) + explosions.length;
      }
      if (!explosions.length || result.completed || result.gems) audio.play(
        result.completed
          ? "win"
          : result.gems
            ? "gem"
            : result.destroyed.length
              ? "break"
              : "hit",
      );
      if (result.completed) {
        platform.setPlaying(false);
        hint("Отличная работа! Следующая глубина ждёт.");
      } else if (result.bossRevealed)
        hint(
          `Проснулся ${LEVELS[state.level - 1].trophy.boss}! Три удара по броне откроют слабое место.`,
        );
      else if (result.chainCoins)
        hint(
          `Цепная добыча: ${result.destroyed.length} блоков · +${result.chainCoins} монет за серию!`,
        );
      else if (result.checkpointCoins)
        hint(
          `Ещё десять блоков пройдены. Премия: ${result.checkpointCoins} монет.`,
        );
      persist();
      refresh();
    },
    onBossHit: (power, tool) => {
      const result = hitBoss(state, power, tool.tier);
      if (result.blocked) {
        hint(`Броню хранителя пробивает кирка ур. ${recommendedTier(state.level)}+. Сила удара не заменяет крепкий металл.`);
        return;
      }
      renderer.burst(
        tool.body.position.x,
        tool.body.position.y,
        result.vulnerable ? "#e1c68b" : "#9aad9a",
        result.vulnerable ? 20 : 7,
      );
      audio.play(result.completed ? "win" : result.vulnerable ? "gem" : "boss");
      syncBoss();
      if (result.completed) {
        platform.setPlaying(false);
        hint(
          result.trophy
            ? `Трофей «${result.trophy.name}»: ${result.trophy.description}!`
            : "Хранитель побеждён. Бонус трофея уже действует.",
        );
      }
      persist();
      refresh();
    },
    onRetire: (retired) => {
      const broken = retired.filter((tool) => tool.kind !== "bomb" && !tool.extracted);
      if (broken.length) audio.play("toolBreak");
      canvas.dataset.brokenTools = Number(canvas.dataset.brokenTools || 0) + broken.length;
      for (const tool of broken)
        renderer.burst(tool.body.position.x, tool.body.position.y, "#b49b72", 6);
      refresh();
      if (canRescue(state, physics.tools.length))
        hint("Последний шанс: одна аварийная кирка в мастерской. Потом — новая попытка.");
    },
  });
  const level = LEVELS[state.level - 1];
  syncBoss();
  document.documentElement.style.setProperty("--theme", level.color);
  $("mineName").textContent = level.name;
  $("mineKind").textContent = level.label;
  document.querySelector(".mine-panel").dataset.kind = level.kind;
  $("biome").textContent = level.biome;
  $("depth").textContent = `${state.level * 100} м под землёй`;
  $("journalPage").textContent = `ЗАПИСЬ ${String(state.level).padStart(3, "0")}`;
  const chapterStart = Math.floor((state.level - 1) / 15) * 15 + 1;
  const chapterEnd = Math.min(CAMPAIGN_LENGTH, chapterStart + 14);
  $("journeyRange").textContent =
    `Ближайший участок: ${chapterStart}–${chapterEnd}`;
  $("journeyTrack").style.gridTemplateColumns =
    `repeat(${chapterEnd - chapterStart + 1},1fr)`;
  $("journeyTrack").innerHTML = LEVELS.filter(
    (l) => l.id >= chapterStart && l.id <= chapterEnd,
  )
    .map(
      (l) =>
        `<span class="${l.id < state.level ? "done" : l.id === state.level ? "current" : ""}" title="${l.id}. ${l.name}"></span>`,
    )
    .join("");
  $("mineMap").innerHTML = LEVELS.map(
    (l) =>
      `<div class="map-cell ${l.id === state.level ? "current" : l.id > state.best ? "locked" : ""}" data-level="${l.id}" data-kind="${l.kind}"><b>${String(l.id).padStart(2, "0")}</b><small>${l.label.toLowerCase()}${l.id === state.level ? " · ты здесь" : ""}</small></div>`,
  ).join("");
  $("journalTitle").textContent = level.boss
    ? `Трофей: ${level.trophy.name}`
    : level.treasure
      ? level.challenge
        ? "Золото достаётся смелым"
        : "Время выдохнуть"
      : level.challenge
        ? "Порода не сдастся без боя"
        : "Готовься к следующей глубине";
  const nextBoss = TROPHIES.find((t) => t.level > state.level);
  $("journalText").textContent = level.boss
    ? `${level.trophy.boss} проснётся после тайников в проходах. Три удара раскалывают броню, четвёртый бьёт в слабое место. Награда: ${level.trophy.description}.`
    : level.treasure
      ? `${level.challenge ? "Испытание остаётся сложным, но " : ""}Много золотых жил. Пополни кошелёк перед хранителем и собери запас усиленных кирок.`
      : level.challenge
        ? "Несколько проходов, твёрдая броня и ни одной аварийной кирки. Готовь усиленные инструменты заранее. За победу — дополнительный алмаз."
        : nextBoss
          ? `Хранитель на ${nextBoss.level}-м горизонте. Перед ним будет богатая шахта, а после победы — «${nextBoss.name}»: ${nextBoss.description}.`
          : "Все хранители позади. Впереди сердце горы — и последние открытия экспедиции.";
  hint(
    level.challenge
      ? "Испытание: крепкая порода. Запасись кирками и ищи цепочки бомб."
      : level.treasure
        ? "Золотая передышка. Собери запас перед встречей с хранителем."
        : "Выбери кирку в мастерской и нажми на точку сброса в шахте.",
  );
  platform.setPlaying(!isPaused() && !state.levelComplete);
  refresh();
  persist();
}
function choose(index) {
  if (isPaused() || state.levelComplete) return;
  audio.unlock();
  if (
    selected >= 0 &&
    selected !== index &&
    state.inventory[selected] === state.inventory[index] &&
    state.inventory[index]
  ) {
    doMerge(selected, index);
    return;
  }
  selected = state.inventory[index] ? index : -1;
  hint(
    selected >= 0
      ? "Кирка выбрана. Нажми на шахту, чтобы бросить, или выбери такую же для объединения."
      : "Выбери инструмент или купи новую кирку.",
  );
  refresh();
}
function doMerge(from, to) {
  const tier = state.inventory[from];
  const source = $("inventory").children[from]?.getBoundingClientRect();
  const target = $("inventory").children[to]?.getBoundingClientRect();
  if (isPaused() || !merge(state, from, to)) {
    hint(
      "Объединяются только разные ячейки с одинаковыми инструментами до уровня 12.",
    );
    return false;
  }
  if (!drag?.moved && !renderer.reducedMotion) animateMerge(tier, source, target);
  selected = to;
  audio.unlock();
  audio.play("merge");
  hint(`Получен инструмент «${TOOLS[state.inventory[to] - 1].name}»!`);
  $("mergeFeedback").textContent = `✦ Уровень ${state.inventory[to]} · ${TOOLS[state.inventory[to] - 1].name}`;
  persist();
  refresh();
  const slot = $("inventory").children[to];
  slot.classList.remove("just-merged");
  void slot.offsetWidth;
  slot.classList.add("just-merged");
  return true;
}
function shoot(x) {
  if (isPaused() || state.levelComplete) return;
  if (physics.tools.length >= BALANCE.maxActive) {
    hint("В шахте уже пять инструментов. Подожди немного.");
    return;
  }
  if (selected < 0 || !state.inventory[selected]) {
    hint("Сначала выбери инструмент в мастерской.");
    return;
  }
  audio.unlock();
  const tier = launch(state, selected, physics.tools.length);
  if (!tier) return;
  physics.add(tier, x, state.power, toolStats(state, tier));
  selected = -1;
  hint("Добыча идёт! Можно бросить ещё инструменты или заняться мастерской.");
  persist();
  refresh();
}
function openDialog(id) {
  if ($(id).open) return;
  cancelDrag();
  pause(`dialog:${id}`, true);
  $(id).showModal();
}
function closeTutorial() {
  $("tutorial").close();
}
for (const id of ["tutorial", "mapDialog", "resetDialog"]) {
  $(id).addEventListener("close", () => {
    if (id === "tutorial") {
      state.tutorialDone = true;
      persist();
    }
    pause(`dialog:${id}`, false);
  });
}
for (let i = 0; i < BALANCE.capacity; i++) {
  const slot = document.createElement("button");
  slot.type = "button";
  slot.className = "slot";
  slot.dataset.index = i;
  $("inventory").append(slot);
}
let drag = null,
  suppressClickUntil = 0;
function flyingTool(tier) {
  const ghost = document.createElement("div");
  ghost.className = "drag-ghost";
  ghost.setAttribute("aria-hidden", "true");
  ghost.innerHTML = `${toolMarkup(tier)}<small>УР. ${tier}</small>`;
  document.body.append(ghost);
  return ghost;
}
function animateMerge(tier, source, target) {
  if (!source || !target) return;
  const ghost = flyingTool(tier);
  ghost.classList.add("merge-flight");
  const position = (rect) => `translate3d(${rect.x + rect.width / 2 - 34}px, ${rect.y + rect.height / 2 - 42}px, 0)`;
  const animation = ghost.animate([
    { transform: position(source), opacity: 1 },
    { transform: `${position(target)} scale(.6)`, opacity: 0.15 },
  ], { duration: 240, easing: "cubic-bezier(.4,0,.2,1)" });
  animation.finished.then(() => ghost.remove(), () => ghost.remove());
}
function cancelDrag(fade = false) {
  if (!drag) return;
  const previous = drag;
  drag = null;
  const source = $("inventory").children[previous.from];
  source.classList.remove("drag-source");
  if (source.hasPointerCapture(previous.pointer)) source.releasePointerCapture(previous.pointer);
  $("inventory").querySelectorAll(".drop-ready, .drop-invalid").forEach((slot) => {
    slot.classList.remove("drop-ready", "drop-invalid");
  });
  document.body.classList.remove("dragging-tools");
  if (previous.ghost) {
    if (fade && !renderer.reducedMotion) {
      previous.ghost.classList.add("settling");
      const animation = previous.ghost.animate([{ opacity: 1 }, { opacity: 0, scale: ".65" }], { duration: 160 });
      animation.finished.then(() => previous.ghost.remove(), () => previous.ghost.remove());
    } else previous.ghost.remove();
  }
}
$("inventory").addEventListener("click", (event) => {
  const slot = event.target.closest(".slot");
  if (slot && performance.now() > suppressClickUntil)
    choose(Number(slot.dataset.index));
});
$("inventory").addEventListener("pointerdown", (event) => {
  if (isPaused() || state.levelComplete || event.button !== 0) return;
  const slot = event.target.closest(".slot");
  if (!slot || !state.inventory[slot.dataset.index]) return;
  drag = {
    from: Number(slot.dataset.index),
    x: event.clientX,
    y: event.clientY,
    pointer: event.pointerId,
    moved: false,
    ghost: null,
  };
  slot.setPointerCapture(event.pointerId);
  audio.unlock();
});
$("inventory").addEventListener("pointermove", (event) => {
  if (!drag || drag.pointer !== event.pointerId) return;
  if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 8) return;
  event.preventDefault();
  if (!drag.moved) {
    drag.moved = true;
    selected = drag.from;
    refresh();
    drag.ghost = flyingTool(state.inventory[drag.from]);
    $("inventory").children[drag.from].classList.add("drag-source");
    document.body.classList.add("dragging-tools");
  }
  drag.ghost.style.transform = `translate3d(${event.clientX - 34}px, ${event.clientY - 47}px, 0)`;
  $("inventory").querySelectorAll(".drop-ready, .drop-invalid").forEach((slot) => {
    slot.classList.remove("drop-ready", "drop-invalid");
  });
  const target = document.elementFromPoint(event.clientX, event.clientY)?.closest(".slot");
  const tier = state.inventory[drag.from];
  const matching = target && Number(target.dataset.index) !== drag.from
    && state.inventory[target.dataset.index] === tier && tier < BALANCE.maxTier;
  if (target && Number(target.dataset.index) !== drag.from)
    target.classList.add(matching ? "drop-ready" : "drop-invalid");
  drag.ghost.classList.toggle("can-merge", !!matching);
  drag.ghost.querySelector("small").textContent = matching ? `✦ УР. ${tier + 1}` : `УР. ${tier}`;
});
$("inventory").addEventListener("pointerup", (event) => {
  if (!drag || drag.pointer !== event.pointerId) return;
  if (drag.moved) {
    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest(".slot");
    suppressClickUntil = performance.now() + 400;
    if (target) doMerge(drag.from, Number(target.dataset.index));
  }
  cancelDrag(true);
});
$("inventory").addEventListener("pointercancel", () => cancelDrag());
$("inventory").addEventListener("lostpointercapture", () => cancelDrag());
window.addEventListener("blur", () => cancelDrag());
canvas.addEventListener("pointermove", (event) => {
  const rect = canvas.getBoundingClientRect();
  pointerX = ((event.clientX - rect.left) * FIELD.width) / rect.width;
});
canvas.addEventListener("pointerleave", () => {
  pointerX = null;
});
canvas.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  const rect = canvas.getBoundingClientRect();
  shoot(((event.clientX - rect.left) * FIELD.width) / rect.width);
});
canvas.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    shoot(prizePosition(aimCol).x);
  }
});
$("dropSelected").onclick = () => {
  shoot(prizePosition(aimCol).x);
  canvas.scrollIntoView({
    behavior: renderer.reducedMotion ? "instant" : "smooth",
    block: "center",
  });
};
$("routeTargets").onclick = (event) => {
  const target = event.target.closest("button[data-col]");
  if (!target || isPaused() || state.levelComplete) return;
  aimCol = Number(target.dataset.col);
  pointerX = prizePosition(aimCol).x;
  hint("Прицел выбран. Брось кирку в этот проход или нажми на нужное место в шахте.");
  refresh();
};
$("throwBomb").onclick = () => {
  if (isPaused() || !launchBomb(state, physics.tools.length)) return;
  audio.unlock();
  physics.addBomb(prizePosition(aimCol).x);
  hint("Бомба летит в выбранный проход. Тайник забирается киркой.");
  persist(); refresh();
};
$("claimBonusTool").onclick = () => {
  if (isPaused()) return;
  const index = claimBonusTool(state);
  if (index < 0) return;
  selected = index;
  audio.unlock(); audio.play("gem");
  persist(); refresh();
};
$("buy").onclick = () => {
  if (isPaused()) return;
  const index = buyTool(state);
  if (index < 0) return;
  selected = index;
  audio.unlock();
  audio.play("buy");
  hint(
    `Кирка уровня ${shopTier(state)} в мастерской. Поставки обновятся в следующей шахте.`,
  );
  persist();
  refresh();
};
$("autoMerge").onclick = () => {
  if (isPaused() || state.levelComplete) return;
  cancelDrag();
  const rectangles = [...$("inventory").children].map((slot) => slot.getBoundingClientRect());
  const merged = mergeAll(state);
  if (!merged.length) return;
  selected = state.inventory.indexOf(Math.max(...state.inventory.filter(Boolean)));
  audio.unlock();
  audio.play("merge");
  if (!renderer.reducedMotion) {
    merged.forEach(({ from, to, tier }) => animateMerge(tier, rectangles[from], rectangles[to]));
  }
  persist();
  refresh();
  for (const { to } of merged) {
    if (!state.inventory[to]) continue;
    const slot = $("inventory").children[to];
    slot.classList.remove("just-merged");
    void slot.offsetWidth;
    slot.classList.add("just-merged");
  }
  const result = `✦ Слияний: ${merged.length} · ${TOOLS[state.inventory[selected] - 1].name}`;
  $("mergeFeedback").textContent = result;
  hint(result);
};
$("forge").onclick = () => {
  if (isPaused()) return;
  const index = forgeTool(state);
  if (index < 0) return;
  selected = index;
  audio.unlock();
  audio.play("gem");
  hint(
    `Алмазы превратились в инструмент «${TOOLS[state.inventory[index] - 1].name}»!`,
  );
  persist();
  refresh();
};
$("upgrade").onclick = () => {
  if (isPaused() || !upgrade(state)) return;
  audio.unlock();
  audio.play("merge");
  hint("Каждый следующий бросок стал сильнее!");
  persist();
  refresh();
};
$("rescue").onclick = () => {
  if (isPaused() || !rescue(state, physics.tools.length)) return;
  selected = 0;
  hint("Аварийная кирка получена. Это последняя помощь в этой попытке.");
  persist();
  refresh();
};
$("nextLevel").onclick = () => {
  if (isPaused() || !nextLevel(state)) return;
  setupLevel();
};
$("sound").onclick = () => {
  audio.unlock();
  state.muted = !state.muted;
  audio.setMuted(state.muted);
  if (!state.muted) audio.play("buy");
  persist();
  refresh();
};
$("music").onclick = () => {
  audio.unlock();
  state.musicMuted = !state.musicMuted;
  audio.setMusicMuted(state.musicMuted);
  persist();
  refresh();
};
$("help").onclick = () => openDialog("tutorial");
$("tutorialStart").onclick = () => {
  audio.unlock();
  closeTutorial();
};
$("tutorialClose").onclick = closeTutorial;
$("mapOpen").onclick = () => {
  openDialog("mapDialog");
  requestAnimationFrame(() =>
    $("mineMap").querySelector(".current")?.scrollIntoView({ block: "center" }),
  );
};
$("mapClose").onclick = () => $("mapDialog").close();
$("pause").onclick = () => pause("manual", true);
$("resume").onclick = () => pause("manual", false);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && drag) {
    suppressClickUntil = performance.now() + 400;
    cancelDrag();
    return;
  }
  if (event.key === "Escape" && !document.querySelector("dialog[open]"))
    pause("manual", !pauses.has("manual"));
});
$("rewardAd").onclick = () => {
  if (isPaused() || state.levelComplete) return;
  platform.reward(() => {
    state.coins += BALANCE.rewardAd;
    hint(`Награда за просмотр: ${BALANCE.rewardAd} монет. Спасибо!`);
    persist();
    refresh();
  });
  refresh();
};
$("reset").onclick = () => {
  if (!booting && !state.levelComplete && !platform.adActive) openDialog("resetDialog");
};
$("resetCancel").onclick = () => $("resetDialog").close();
$("resetConfirm").onclick = () => {
  if (!restartMine(state)) return;
  clearTimeout(cloudTimer);
  accumulator = 0;
  pauses.delete("manual");
  setupLevel();
  $("resetDialog").close();
  hint("Шахта начата заново. Запасы на входе возвращены; пройденные уровни и трофеи сохранены.");
};
document.addEventListener("visibilitychange", () => {
  if (document.hidden) cancelDrag();
  pause("hidden", document.hidden);
  if (document.hidden) {
    clearTimeout(cloudTimer);
    platform.save(state);
  }
});
window.addEventListener("pagehide", () => {
  clearTimeout(cloudTimer);
  platform.save(state);
});
function frame(time) {
  accumulator += Math.min(50, Math.max(0, time - (lastTime || time)));
  lastTime = time;
  if (!isPaused() && restartAttempt(state, physics.tools.length)) {
    accumulator = 0;
    setupLevel();
    hint("Запасы закончились. Шахта начата заново: стартовое снаряжение возвращено, находки попытки потеряны.");
  }
  if (!isPaused())
    while (accumulator >= 1000 / 60) {
      if (!state.levelComplete) physics.step();
      renderer.update();
      accumulator -= 1000 / 60;
    }
  else accumulator = 0;
  renderer.draw(state, blocks, physics, selected, pointerX);
  canvas.dataset.prizeGlow = Number(renderer.time < prizeUntil);
  if (state.levelComplete && renderer.time >= prizeUntil && $("levelOverlay").classList.contains("hidden")) refresh();
  requestAnimationFrame(frame);
}
async function boot() {
  refresh();
  await platform.init();
  const cloud = await platform.load();
  if (
    [2, 3, 4, 5].includes(cloud?.version) &&
    Array.isArray(cloud.inventory) &&
    cloud.inventory.length === BALANCE.capacity &&
    Number.isSafeInteger(cloud.updatedAt) &&
    cloud.updatedAt > state.updatedAt
  )
    state = restoreState(cloud);
  audio.setMuted(state.muted);
  audio.setMusicMuted(state.musicMuted);
  await renderer.ready;
  setupLevel();
  if (document.hidden) pause("hidden", true);
  if (!state.tutorialDone) openDialog("tutorial");
  renderer.draw(state, blocks, physics, selected, pointerX);
  platform.ready();
  booting = false;
  pause("boot", false);
  requestAnimationFrame(frame);
}
boot().catch((error) => {
  console.error("Deepforge startup failed", error);
  hint("Не удалось открыть шахту. Перезагрузи страницу.");
});
