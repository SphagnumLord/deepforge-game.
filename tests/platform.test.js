import test from "node:test";
import assert from "node:assert/strict";
import { YandexPlatform } from "../src/platform.js";

test("outside Yandex the game never requests SDK, authentication or ads", async () => {
  const p = new YandexPlatform({
    host: { location: { hostname: "localhost", search: "" } },
  });
  assert.equal(await p.init(), null);
  assert.equal(
    p.reward(() => assert.fail()),
    false,
  );
  assert.equal(await p.load(), null);
});
test("reward requires explicit call, is granted once, pauses/resumes and recovers from errors", async () => {
  const reasons = new Set();
  let callbacks,
    rewarded = 0,
    ready = 0,
    starts = 0,
    stops = 0;
  const p = new YandexPlatform({
    onPause: (r) => reasons.add(r),
    onResume: (r) => reasons.delete(r),
    host: {
      location: { hostname: "localhost", search: "" },
      YaGames: {
        init: async () => ({
          getPlayer: async () => {
            throw Error("guest");
          },
          adv: {
            showRewardedVideo: (options) => {
              callbacks = options.callbacks;
            },
          },
          features: {
            LoadingAPI: { ready: () => ready++ },
            GameplayAPI: { start: () => starts++, stop: () => stops++ },
          },
        }),
      },
    },
  });
  await p.init();
  assert.equal(callbacks, undefined);
  p.ready();
  assert.equal(ready, 1);
  p.setPlaying(true);
  p.setPlaying(true);
  p.setPlaying(false);
  assert.equal(starts, 1);
  assert.equal(stops, 1);
  assert.equal(
    p.reward(() => rewarded++),
    true,
  );
  assert.equal(reasons.has("ad"), true);
  assert.equal(
    p.reward(() => rewarded++),
    false,
  );
  callbacks.onRewarded();
  callbacks.onRewarded();
  assert.equal(rewarded, 1);
  callbacks.onClose();
  assert.equal(reasons.size, 0);
  callbacks.onRewarded();
  assert.equal(rewarded, 1);
  p.reward(() => rewarded++);
  callbacks.onError();
  assert.equal(p.adActive, false);
  assert.equal(reasons.size, 0);
});
test("cloud writes are serialized and newest queued state wins", async () => {
  const writes = [];
  let release;
  const p = new YandexPlatform();
  p.player = {
    setData: async (data) => {
      writes.push(data.deepforgeSave.coins);
      if (writes.length === 1)
        await new Promise((resolve) => {
          release = resolve;
        });
    },
  };
  const first = p.save({ coins: 1 });
  await p.save({ coins: 2 });
  await p.save({ coins: 3 });
  release();
  await first;
  assert.deepEqual(writes, [1, 3]);
});
