const withTimeout = (promise, ms = 4000) => {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("SDK timeout")), ms);
    }),
  ]).finally(() => clearTimeout(timer));
};

export class YandexPlatform {
  constructor({
    host = globalThis.window,
    onPause = () => {},
    onResume = () => {},
    onStatus = () => {},
  } = {}) {
    this.host = host;
    this.onPause = onPause;
    this.onResume = onResume;
    this.onStatus = onStatus;
    this.sdk = null;
    this.player = null;
    this.playing = false;
    this.reportedPlaying = false;
    this.adActive = false;
    this.pendingSave = null;
    this.saving = false;
    this.generation = 0;
  }
  async init() {
    const hostname = this.host.location.hostname;
    const requested =
      new URLSearchParams(this.host.location.search).get("platform") ===
      "yandex";
    if (
      !this.host.YaGames &&
      !requested &&
      !/(^|\.)((games\.s3\.)?yandex\.(net|ru|com))$/.test(hostname)
    ) {
      this.onStatus("Локальное сохранение");
      return null;
    }
    try {
      if (!this.host.YaGames)
        await withTimeout(
          new Promise((resolve, reject) => {
            const script = this.host.document.createElement("script");
            script.src = "/sdk.js";
            script.onload = resolve;
            script.onerror = reject;
            this.host.document.head.append(script);
          }),
        );
      this.sdk = await withTimeout(
        Promise.resolve().then(() => this.host.YaGames.init()),
      );
      this.sdk.on?.("game_api_pause", () => this.onPause("platform"));
      this.sdk.on?.("game_api_resume", () => this.onResume("platform"));
      this.onStatus("Яндекс Игры · подключено");
      try {
        this.player = await withTimeout(this.sdk.getPlayer({ scopes: false }));
      } catch {
        this.onStatus("Яндекс Игры · сохранение на устройстве");
      }
      return this.sdk;
    } catch {
      this.sdk = null;
      this.onStatus("Локальный режим · SDK недоступен");
      return null;
    }
  }
  async load() {
    if (!this.player) return null;
    try {
      const data = await withTimeout(this.player.getData(["deepforgeSave"]));
      return data.deepforgeSave || null;
    } catch {
      this.onStatus("Облако недоступно · сохранение на устройстве");
      return null;
    }
  }
  async save(state) {
    if (!this.player) return;
    this.pendingSave = {
      state: JSON.parse(JSON.stringify(state)),
      generation: this.generation,
    };
    if (this.saving) return;
    this.saving = true;
    while (this.pendingSave) {
      const { state: snapshot, generation } = this.pendingSave;
      this.pendingSave = null;
      if (generation !== this.generation) continue;
      try {
        await withTimeout(
          this.player.setData({ deepforgeSave: snapshot }, true),
        );
      } catch {
        this.onStatus("Облако недоступно · сохранение на устройстве");
      }
    }
    this.saving = false;
  }
  ready() {
    try {
      this.sdk?.features?.LoadingAPI?.ready();
    } catch {
      /* Local fallback stays playable. */
    }
  }
  setPlaying(playing) {
    this.playing = playing;
    if (!this.sdk || this.reportedPlaying === playing) return;
    try {
      if (playing) this.sdk.features?.GameplayAPI?.start();
      else this.sdk.features?.GameplayAPI?.stop();
      this.reportedPlaying = playing;
    } catch {
      /* Optional API. */
    }
  }
  get canReward() {
    return !!this.sdk?.adv?.showRewardedVideo;
  }
  reward(onReward) {
    if (!this.canReward || this.adActive) return false;
    this.adActive = true;
    let rewarded = false,
      closed = false;
    const finish = () => {
      if (closed) return;
      closed = true;
      this.adActive = false;
      this.onResume("ad");
    };
    this.onPause("ad");
    try {
      this.sdk.adv.showRewardedVideo({
        callbacks: {
          onOpen: () => this.onPause("ad"),
          onRewarded: () => {
            if (!rewarded && !closed) {
              rewarded = true;
              onReward();
            }
          },
          onClose: finish,
          onError: () => {
            this.onStatus("Реклама недоступна · попробуйте позже");
            finish();
          },
        },
      });
    } catch {
      finish();
      return false;
    }
    return true;
  }
}
