import { test as base, expect } from "@playwright/test";
import {
  createState,
  openBoard,
  STORAGE,
  LEGACY_STORAGE,
} from "../../src/core.js";
const test = base.extend({
  page: async ({ page }, use) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await use(page);
    expect(errors, "no unhandled browser errors").toEqual([]);
  },
});
async function seed(page, changes = {}, key = STORAGE) {
  const save = { ...createState(), tutorialDone: true, ...changes };
  await page.addInitScript(
    ({ save, key }) => {
      if (localStorage.getItem(key) === null)
        localStorage.setItem(key, JSON.stringify(save));
    },
    { save, key },
  );
}
const slot = (page, i) => page.locator(`.slot[data-index="${i}"]`);
async function start(page) {
  await page.goto("/");
  await expect(page.locator("#mineName")).toHaveText("Первый свет");
  await expect(page.locator("#buy")).toBeEnabled();
}

test("first visit teaches the game; help, map and controls fit the viewport", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#tutorial")).toBeVisible();
  await page.locator("#tutorialStart").click();
  await expect(page.locator("#tutorial")).not.toBeVisible();
  await expect(page.locator(".slot")).toHaveCount(12);
  await page.locator("#mapOpen").click();
  await expect(page.locator(".map-cell")).toHaveCount(130);
  await expect(page.locator(".map-cell.locked")).toHaveCount(129);
  await page.locator("#mapClose").click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.locator("#help").click();
  await expect(page.locator("#tutorial")).toBeVisible();
  await page.locator("#tutorialClose").click();
});

test("merge, buy, upgrade, real mining and damaged blocks persist through reload", async ({
  page,
  isMobile,
}) => {
  await seed(page, { gems: 3 });
  await start(page);
  await slot(page, 0).click();
  await slot(page, 1).click();
  await expect(slot(page, 1)).toHaveAttribute("data-tier", "2");
  await page.locator("#buy").click();
  await expect(page.locator("#coins")).toHaveText("155");
  await page.locator("#upgrade").click();
  await expect(page.locator("#damage")).toHaveText("3");
  await slot(page, 1).click();
  if (isMobile) await page.locator("#dropSelected").click();
  else await page.locator("#game").click({ position: { x: 250, y: 85 } });
  await expect(page.locator("#game")).not.toHaveAttribute(
    "data-destroyed",
    "0",
  );
  await page.locator("#pause").click();
  const saved = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    STORAGE,
  );
  expect(saved.board.hp.some((hp) => hp === 0)).toBe(true);
  await page.reload();
  await expect(page.locator("#damage")).toHaveText("3");
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)).board.hp,
      STORAGE,
    ),
  ).toEqual(saved.board.hp);
  await expect(slot(page, 1)).toHaveAttribute("data-tier", "null");
});

test("broke players recover without ads or resetting their progress", async ({
  page,
}) => {
  const save = createState();
  openBoard(save);
  await seed(page, { ...save, coins: 0, inventory: Array(12).fill(null), tutorialDone: true });
  await page.goto("/");
  await expect(page.locator("#rescue")).toBeVisible();
  await expect(page.locator("#buy")).toBeDisabled();
  await page.locator("#rescue").click();
  await expect(slot(page, 0)).toHaveAttribute("data-tier", "1");
  await expect(page.locator("#rescue")).not.toBeVisible();
  await expect(page.locator("#coins")).toHaveText("0");
  await expect(page.locator("#rewardAd")).not.toBeVisible();
});
test("crystals forge a stronger tool without spending coins", async ({
  page,
}) => {
  await seed(page, { gems: 10 });
  await start(page);
  await page.locator("#forge").click();
  await expect(slot(page, 5)).toHaveAttribute("data-tier", "2");
  await expect(page.locator("#gems")).toHaveText("5");
  await expect(page.locator("#coins")).toHaveText("180");
});

test("touch dragging merges once without a duplicate tap", async ({
  page,
  context,
}) => {
  await seed(page);
  await start(page);
  await slot(page, 0).scrollIntoViewIfNeeded();
  const a = await slot(page, 0).boundingBox(),
    b = await slot(page, 1).boundingBox();
  const session = await context.newCDPSession(page);
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: a.x + a.width / 2, y: a.y + a.height / 2 }],
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: b.x + b.width / 2, y: b.y + b.height / 2 }],
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect(slot(page, 0)).toHaveAttribute("data-tier", "null");
  await expect(slot(page, 1)).toHaveAttribute("data-tier", "2");
});

test("manual pause freezes simulation and resumed tools continue mining", async ({
  page,
}) => {
  await seed(page);
  await start(page);
  await slot(page, 4).click();
  await page.locator("#game").click({ position: { x: 185, y: 65 } });
  await page.locator("#pause").click();
  const count = await page.locator("#game").getAttribute("data-destroyed");
  await page.waitForTimeout(800);
  await expect(page.locator("#game")).toHaveAttribute("data-destroyed", count);
  await expect(page.locator("#buy")).toBeDisabled();
  await page.locator("#resume").click();
  await expect(page.locator("#game")).not.toHaveAttribute(
    "data-destroyed",
    "0",
  );
});

test("legacy progress migrates and reset requires confirmation", async ({
  page,
}) => {
  await seed(
    page,
    { version: undefined, power: 4, coins: 777 },
    LEGACY_STORAGE,
  );
  await page.goto("/");
  await expect(page.locator("#damage")).toHaveText("6");
  await expect(page.locator("#coins")).toHaveText("777");
  await page.locator("#reset").click();
  await page.locator("#resetCancel").click();
  await expect(page.locator("#coins")).toHaveText("777");
  await page.locator("#reset").click();
  await page.locator("#resetConfirm").click();
  await expect(page.locator("#coins")).toHaveText("180");
  await expect(page.locator("#damage")).toHaveText("2");
  expect(
    await page.evaluate((key) => localStorage.getItem(key), LEGACY_STORAGE),
  ).toBeNull();
});

test("cleared final mine restores without duplicate payout and starts a new campaign", async ({
  page,
}) => {
  const save = { ...createState(), level: 130, best: 130 };
  openBoard(save);
  save.board.hp.fill(0);
  save.coins = 180;
  await seed(page, { ...save, tutorialDone: true });
  await page.goto("/");
  await expect(page.locator("#winTitle")).toHaveText("Сердце горы найдено!");
  await expect(page.locator("#coins")).toHaveText("180");
  await page.locator("#nextLevel").click();
  await expect(page.locator("#mineName")).toHaveText("Первый свет");
  await expect(page.locator("#best")).toHaveText("130");
  await expect(page.locator("#coins")).toHaveText("180");
});

test("sound preference persists and local mode makes no platform requests", async ({
  page,
}) => {
  const requests = [];
  page.on("request", (request) => {
    if (
      /^https?:/.test(request.url()) &&
      !new URL(request.url()).hostname.match(/^(127\.0\.0\.1|localhost)$/)
    )
      requests.push(request.url());
  });
  await seed(page);
  await start(page);
  await page.locator("#sound").click();
  await expect(page.locator("#sound")).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(page.locator("#sound")).toHaveAttribute("aria-pressed", "true");
  expect(requests).toEqual([]);
});

test("a real mining hit reveals the guardian, victory earns a persistent trophy and its boost", async ({
  page,
}) => {
  const save = {
    ...createState(),
    level: 15,
    best: 15,
    power: 2,
    coins: 500,
    inventory: [12, 4, ...Array(10).fill(null)],
  };
  openBoard(save);
  save.board.hp.fill(0);
  save.board.hp[3] = 1;
  await seed(page, { ...save, tutorialDone: true });
  await page.goto("/");
  await expect(page.locator("#game")).toHaveAttribute("data-boss", "waiting");
  await slot(page, 0).click();
  const box = await page.locator("#game").boundingBox();
  await page.locator("#game").click({ position: { x: box.width / 2, y: 65 } });
  await expect(page.locator("#game")).toHaveAttribute("data-boss", "active");
  await expect(page.locator("#winTitle")).toHaveText("Хранитель побеждён!");
  await expect(page.locator("#levelOverlay")).toBeVisible();
  await expect(page.locator('[data-trophy="15"]')).toContainText("Медный рог");
  await page.locator("#nextLevel").click();
  await expect(page.locator("#level")).toHaveText("16");
  await slot(page, 1).click();
  await expect(page.locator("#selectedInfo")).toContainText("урон 26");
  await page.reload();
  await expect(page.locator('[data-trophy="15"]')).toBeVisible();
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)).trophies,
      STORAGE,
    ),
  ).toEqual([15]);
});

test("guardian health and armour phase survive reloading in the middle of a fight", async ({
  page,
}) => {
  const save = {
    ...createState(),
    level: 30,
    best: 30,
    power: 6,
    inventory: [4, 4, ...Array(10).fill(null)],
  };
  openBoard(save);
  save.board.hp.fill(0);
  save.boss.hp = 300;
  save.boss.hits = 2;
  await seed(page, { ...save, tutorialDone: true });
  await page.goto("/");
  await expect(page.locator("#game")).toHaveAttribute("data-boss", "active");
  await slot(page, 0).click();
  const box = await page.locator("#game").boundingBox();
  await page.locator("#game").click({ position: { x: box.width / 2, y: 65 } });
  await page.waitForFunction(
    (key) => JSON.parse(localStorage.getItem(key)).boss.hits > 2,
    STORAGE,
  );
  await page.locator("#pause").click();
  const saved = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)).boss,
    STORAGE,
  );
  await page.reload();
  await expect(page.locator("#game")).toHaveAttribute("data-boss", "active");
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)).boss,
      STORAGE,
    ),
  ).toEqual(saved);
  await expect(page.locator('[data-trophy="30"]')).toHaveCount(0);
});

test("the late map keeps mine 104 golden and hard and mine 120 a trial boss", async ({
  page,
}) => {
  await seed(page, { level: 104, best: 104, coins: 5000 });
  await page.goto("/");
  await expect(page.locator("#mineKind")).toHaveText("ЗОЛОТОЕ ИСПЫТАНИЕ");
  await page.locator("#mapOpen").click();
  await expect(page.locator(".map-cell")).toHaveCount(130);
  await expect(page.locator(".map-cell.current")).toHaveAttribute(
    "data-level",
    "104",
  );
  await page.locator("#mapClose").click();
  const next = { ...createState(), level: 120, best: 120, tutorialDone: true };
  await page.evaluate(
    ({ key, save }) => localStorage.setItem(key, JSON.stringify(save)),
    { key: STORAGE, save: next },
  );
  await page.reload();
  await expect(page.locator("#mineKind")).toHaveText("БОСС · ИСПЫТАНИЕ");
  await expect(page.locator("#bossName")).toHaveText("Древний под горой");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("ambient music produces audio, pauses with the game, and has an independent saved mute", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const Native = window.AudioContext;
    window.gameAudioContexts = [];
    window.gameAudioGains = [];
    window.AudioContext = class extends Native {
      constructor(...args) {
        super(...args);
        window.gameAudioContexts.push(this);
      }
      createGain(...args) {
        const gain = super.createGain(...args);
        window.gameAudioGains.push(gain);
        return gain;
      }
    };
  });
  await seed(page);
  await page.goto("/");
  await slot(page, 0).click();
  await page.waitForFunction(
    () => window.gameAudioContexts[0]?.state === "running",
  );
  await page.evaluate(() => {
    const analyser = window.gameAudioContexts[0].createAnalyser();
    analyser.fftSize = 2048;
    window.gameAudioGains[1].connect(analyser);
    window.musicAnalyser = analyser;
  });
  const rms = () =>
    page.evaluate(() => {
      const data = new Float32Array(window.musicAnalyser.fftSize);
      window.musicAnalyser.getFloatTimeDomainData(data);
      return Math.sqrt(data.reduce((sum, x) => sum + x * x, 0) / data.length);
    });
  await expect.poll(rms).toBeGreaterThan(0.00001);
  const audible = await rms();
  expect(audible).toBeLessThan(0.3);
  await page.locator("#pause").click();
  await page.waitForFunction(
    () => window.gameAudioContexts[0].state === "suspended",
  );
  await page.locator("#resume").click();
  await page.waitForFunction(
    () => window.gameAudioContexts[0].state === "running",
  );
  await page.locator("#music").click();
  await expect(page.locator("#music")).toHaveAttribute("aria-pressed", "true");
  await expect.poll(rms).toBeLessThan(audible * 0.1);
  await page.reload();
  await expect(page.locator("#music")).toHaveAttribute("aria-pressed", "true");
  await page.locator("#sound").click();
  await page.waitForFunction(
    () => window.gameAudioContexts[0].state === "suspended",
  );
});

test("SDK failure keeps local play usable", async ({ page }) => {
  await seed(page);
  await page.route("**/sdk.js", (route) => route.abort());
  await page.goto("/?platform=yandex");
  await expect(page.locator("#buy")).toBeEnabled();
  await expect(page.locator("#saveStatus")).toContainText("SDK недоступен");
  await expect(page.locator("#rewardAd")).not.toBeVisible();
});

test("Yandex adapter restores cloud, pauses for ads, grants one reward and reports readiness", async ({
  page,
}) => {
  await seed(page);
  const cloud = {
    ...createState(),
    coins: 456,
    tutorialDone: true,
    updatedAt: Date.now() + 10000,
  };
  await page.addInitScript((cloud) => {
    window.sdkCalls = { ads: 0, ready: 0, start: 0, stop: 0, writes: [] };
    window.sdkEvents = {};
    window.YaGames = {
      init: async () => ({
        on: (event, callback) => {
          window.sdkEvents[event] = callback;
        },
        getPlayer: async () => ({
          getData: async () => ({ deepforgeSave: cloud }),
          setData: async (value) => {
            window.sdkCalls.writes.push(value);
          },
        }),
        features: {
          LoadingAPI: { ready: () => window.sdkCalls.ready++ },
          GameplayAPI: {
            start: () => window.sdkCalls.start++,
            stop: () => window.sdkCalls.stop++,
          },
        },
        adv: {
          showRewardedVideo: ({ callbacks }) => {
            window.sdkCalls.ads++;
            window.adCallbacks = callbacks;
            callbacks.onOpen();
          },
        },
      }),
    };
  }, cloud);
  await page.goto("/");
  await expect(page.locator("#coins")).toHaveText("456");
  expect(await page.evaluate(() => window.sdkCalls.ready)).toBe(1);
  expect(await page.evaluate(() => window.sdkCalls.ads)).toBe(0);
  await page.locator("#rewardAd").click();
  await expect(page.locator("#buy")).toBeDisabled();
  await page.evaluate(() => {
    window.adCallbacks.onRewarded();
    window.adCallbacks.onRewarded();
    window.adCallbacks.onClose();
  });
  await expect(page.locator("#coins")).toHaveText("536");
  await expect(page.locator("#buy")).toBeEnabled();
  await page.evaluate(() => window.sdkEvents.game_api_pause());
  await expect(page.locator("#buy")).toBeDisabled();
  await page.evaluate(() => window.sdkEvents.game_api_resume());
  await expect(page.locator("#buy")).toBeEnabled();
  await expect
    .poll(() => page.evaluate(() => window.sdkCalls.writes.length))
    .toBeGreaterThan(0);
});

test("one normal rescue survives reload; losing that pick starts a clean second attempt", async ({ page }) => {
  const save = createState();
  openBoard(save);
  save.coins = 0;
  save.inventory.fill(null);
  save.board.hp[0] = 0;
  await seed(page, { ...save, tutorialDone: true });
  await page.goto("/");
  await expect(page.locator("#rescue")).toBeVisible();
  await page.locator("#rescue").click();
  await page.reload();
  await expect(slot(page, 0)).toHaveAttribute("data-tier", "1");
  await expect(page.locator("#rescue")).not.toBeVisible();
  await expect(page.locator("#rescueRule")).toContainText("использована");
  await slot(page, 0).click();
  await page.locator("#game").click({ position: { x: 65, y: 65 } });
  await page.locator("#pause").click();
  await page.reload();
  await expect(page.locator("#game")).toHaveAttribute("data-attempt", "2");
  await expect(page.locator("#game")).toHaveAttribute("data-destroyed", "0");
  await expect(page.locator("#coins")).toHaveText("180");
  await expect(page.locator("#rescueRule")).toContainText("Одна аварийная");
  const restored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE);
  expect(restored.inventory).toEqual(save.entry.inventory);
  expect(restored.rescueUsed).toBe(false);
});

test("an exhausted trial restarts immediately and never offers a free pick", async ({ page }) => {
  const save = { ...createState(), level: 8, best: 8 };
  openBoard(save);
  const starting = save.coins;
  save.coins = 0;
  save.inventory.fill(null);
  save.board.hp[0] = 0;
  await seed(page, { ...save, tutorialDone: true });
  await page.goto("/");
  await expect(page.locator("#game")).toHaveAttribute("data-attempt", "2");
  await expect(page.locator("#game")).toHaveAttribute("data-destroyed", "0");
  await expect(page.locator("#rescue")).not.toBeVisible();
  await expect(page.locator("#rescueRule")).toContainText("Без аварийных");
  const state = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE);
  expect(state.coins).toBe(starting);
  expect(state.inventory).toEqual(save.entry.inventory);
  await page.reload();
  await expect(page.locator("#game")).toHaveAttribute("data-attempt", "2");
});

test("strength spends diamonds and stays unavailable when only gold remains", async ({ page }) => {
  await seed(page, { coins: 1000, gems: 3 });
  await start(page);
  await page.locator("#upgrade").click();
  await expect(page.locator("#gems")).toHaveText("0");
  await expect(page.locator("#coins")).toHaveText("1 000");
  await expect(page.locator("#damage")).toHaveText("3");
  await expect(page.locator("#upgrade")).toBeDisabled();
  await page.reload();
  await expect(page.locator("#damage")).toHaveText("3");
  await expect(page.locator("#upgrade")).toBeDisabled();
});

test("real trial collisions require upgraded metal even with maximum strength", async ({ page }) => {
  await seed(page, { level: 8, best: 8, power: 60, coins: 5000, inventory: [1, 3, ...Array(10).fill(null)] });
  await page.goto("/");
  await slot(page, 0).click();
  const box = await page.locator("#game").boundingBox();
  await page.locator("#game").click({ position: { x: box.width / 2, y: 65 } });
  await expect(page.locator("#game")).toHaveAttribute("data-blocked-hits", /[1-9]/);
  await expect(page.locator("#game")).toHaveAttribute("data-destroyed", "0");
  await expect(page.locator("#hint")).toContainText("требует кирку ур. 3+");
  await slot(page, 1).click();
  await page.locator("#game").click({ position: { x: box.width / 2, y: 65 } });
  await expect(page.locator("#game")).not.toHaveAttribute("data-destroyed", "0");
});

async function mistChanges(page) {
  return page.evaluate(async () => {
    const canvas = document.getElementById("game"), c = canvas.getContext("2d"), scale = canvas.width / 420;
    const sample = () => c.getImageData(70 * scale, 8 * scale, 280 * scale, 105 * scale).data;
    const before = sample();
    for (let i = 0; i < 18; i++) await new Promise(requestAnimationFrame);
    const after = sample();
    return before.reduce((count, value, i) => count + (value !== after[i] ? 1 : 0), 0);
  });
}

test("lamp mist moves gently, freezes on pause and respects reduced motion", async ({ page }) => {
  await seed(page);
  await start(page);
  expect(await mistChanges(page)).toBeGreaterThan(0);
  await page.locator("#pause").click();
  expect(await mistChanges(page)).toBe(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await expect(page.locator("#buy")).toBeEnabled();
  expect(await mistChanges(page)).toBe(0);
});

test("a real pick breaking produces a quiet crack on the effects bus", async ({ page }) => {
  await page.addInitScript(() => {
    const Native = window.AudioContext;
    window.breakSources = 0;
    window.breakRms = 0;
    window.breakFinished = false;
    window.AudioContext = class extends Native {
      createGain(...args) {
        const gain = super.createGain(...args);
        this.firstGain ||= gain;
        return gain;
      }
      createBufferSource(...args) {
        const source = super.createBufferSource(...args), start = source.start.bind(source), context = this;
        source.start = (...parameters) => {
          window.breakSources++;
          const analyser = context.createAnalyser();
          analyser.fftSize = 1024;
          context.firstGain.connect(analyser);
          let frames = 0;
          const sample = () => {
            const data = new Float32Array(analyser.fftSize);
            analyser.getFloatTimeDomainData(data);
            window.breakRms = Math.max(window.breakRms, Math.sqrt(data.reduce((sum, x) => sum + x * x, 0) / data.length));
            if (++frames < 20) requestAnimationFrame(sample);
            else { context.firstGain.disconnect(analyser); window.breakFinished = true; }
          };
          requestAnimationFrame(sample);
          return start(...parameters);
        };
        return source;
      }
    };
  });
  await seed(page, { level: 8, best: 8, coins: 5000, musicMuted: true, inventory: [1, ...Array(11).fill(null)] });
  await page.goto("/");
  await slot(page, 0).click();
  const box = await page.locator("#game").boundingBox();
  await page.locator("#game").click({ position: { x: box.width / 2, y: 65 } });
  await page.waitForFunction(() => window.breakFinished);
  expect(await page.evaluate(() => window.breakSources)).toBe(1);
  const rms = await page.evaluate(() => window.breakRms);
  expect(rms).toBeGreaterThan(0.00001);
  expect(rms).toBeLessThan(0.025);
  await expect(page.locator("#game")).toHaveAttribute("data-broken-tools", "1");
});
