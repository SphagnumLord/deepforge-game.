import { LEVELS, MATERIALS, TROPHIES, bossActive } from "./core.js";
import { FIELD, blockRect } from "./physics.js";
import { drawTool, loadToolArt, drawTrophy, drawBoss } from "./art.js";
import { createRockTextures, createLampMist } from "./geology.js";
import { createCampScene, createCampMistMask, drawCampfire } from "./camp.js";

export class MineRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.particles = [];
    this.waves = [];
    this.time = 0;
    this.ready = loadToolArt();
    this.rocks = createRockTextures();
    this.mist = createLampMist();
    this.camp = createCampScene();
    this.mistMask = createCampMistMask();
    this.mistLayer = document.createElement("canvas");
    this.mistLayer.width = FIELD.width;
    this.mistLayer.height = 112;
    this.resize(canvas.getBoundingClientRect().width);
    this.resizeObserver = new ResizeObserver(([entry]) => this.resize(entry.contentRect.width));
    this.resizeObserver.observe(canvas);
    this.reducedMotion = globalThis.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
  }
  resize(width) {
    const density = Math.min(3, Math.max(1, width / FIELD.width) * (globalThis.devicePixelRatio || 1));
    const pixels = Math.round(FIELD.width * density);
    if (this.canvas.width === pixels && this.canvas.height === Math.round(FIELD.height * density)) return;
    this.canvas.width = pixels;
    this.canvas.height = Math.round(FIELD.height * density);
    this.ctx.setTransform(pixels / FIELD.width, 0, 0, this.canvas.height / FIELD.height, 0, 0);
  }
  burst(x, y, color, count = 12) {
    if (this.reducedMotion) count = Math.min(count, 4);
    for (let n = 0; n < count; n++) {
      const a = Math.random() * Math.PI * 2,
        v = 0.7 + Math.random() * 2.5;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - 1,
        color,
        life: 30 + Math.random() * 20,
        size: 1.5 + Math.random() * 3,
      });
    }
    this.particles = this.particles.slice(-220);
  }
  update() {
    this.time++;
    this.waves = this.waves.filter((wave) => --wave.life > 0);
    for (const p of this.particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.07;
      p.life--;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }
  blast(x, y) {
    if (!this.reducedMotion) this.waves.push({ x, y, life: 24 });
  }
  drawMist(target) {
    const c = this.mistLayer.getContext("2d");
    c.clearRect(0, 0, FIELD.width, 112);
    const seconds = this.reducedMotion ? 0 : this.time / 60;
    c.save();
    // A feathered mask keeps trophy silhouettes clear without rectangular gaps.
    c.globalCompositeOperation = "screen";
    for (let n = 0; n < 6; n++) {
      const phase = seconds * (0.25 + n * 0.017) + n * 1.9;
      const x = 210 + Math.sin(phase) * (17 + n * 2);
      const y = 30 + n * 5 + Math.cos(phase * 0.8) * 7;
      c.save();
      c.translate(x, y);
      c.rotate(Math.sin(phase * 0.65) * 0.12);
      c.globalAlpha = 0.31 + Math.sin(phase + 1) * 0.065;
      c.drawImage(this.mist[n % 3], -104, -25, 208, 50 + n * 3);
      c.restore();
    }
    // A slender rising curl catches the warm light above the fire.
    c.globalAlpha = 0.42;
    c.drawImage(this.mist[1], 180 + Math.sin(seconds * 0.36) * 9,
      35 + Math.cos(seconds * 0.22) * 7, 68, 58);
    c.restore();
    c.save();
    c.globalCompositeOperation = "destination-in";
    c.drawImage(this.mistMask, 0, 0);
    c.restore();
    target.save();
    target.globalCompositeOperation = "screen";
    target.drawImage(this.mistLayer, 0, 0);
    target.restore();
  }
  draw(state, blocks, physics, selected, pointerX) {
    const c = this.ctx,
      { width: w, height: h } = FIELD,
      theme = LEVELS[state.level - 1];
    c.drawImage(this.camp, 0, 0, w, h);
    this.drawMist(c);
    drawCampfire(c, this.time, this.reducedMotion);
    if (state.trophies.length) {
      c.fillStyle = "#65583e";
      c.fillRect(22, 75, 160, 3);
      c.fillRect(238, 75, 160, 3);
      // Leave the upper-right touch target clear on narrow mobile canvases.
      const slots = [42, 84, 126, 168, 244, 272, 300, 328];
      TROPHIES.forEach((trophy, index) => {
        if (state.trophies.includes(trophy.level))
          drawTrophy(c, trophy, slots[index], 58, 0.73);
      });
    }
    c.fillStyle = "#a1b0a4";
    c.font = '8px "Segoe UI", sans-serif';
    c.textAlign = "center";
    c.fillText(
      selected >= 0
        ? "НАЖМИ, ЧТОБЫ БРОСИТЬ ИНСТРУМЕНТ"
        : "ВЫБЕРИ КИРКУ В МАСТЕРСКОЙ",
      210,
      113,
    );
    if (selected >= 0 && !state.levelComplete) {
      const x = pointerX ?? 210;
      c.setLineDash([2, 5]);
      c.strokeStyle = "#d3be7788";
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(x, 118);
      c.lineTo(x, 136);
      c.stroke();
      c.setLineDash([]);
      c.fillStyle = "#ecd196";
      c.beginPath();
      c.moveTo(x - 4, 131);
      c.lineTo(x, 137);
      c.lineTo(x + 4, 131);
      c.fill();
    }
    for (const b of blocks) {
      const { x, y, w: bw, h: bh } = blockRect(b);
      if (!b.alive) {
        c.fillStyle = "#101e2444";
        c.fillRect(x + 1, y + 1, bw - 2, bh - 2);
        continue;
      }
      const m = MATERIALS[b.material];
      c.fillStyle = "#09191f";
      c.fillRect(x, y, bw, bh);
      c.fillStyle = m.color;
      c.beginPath();
      c.roundRect(x + 1, y + 1, bw - 3, bh - 3, 3);
      c.fill();
      c.save();
      c.clip();
      c.drawImage(this.rocks[b.material][(state.level * 13 + b.id * 7) % 6], x + 1, y + 1, bw - 3, bh - 3);
      c.restore();
      c.fillStyle = m.face;
      c.globalAlpha = 0.8;
      c.fillRect(x + 3, y + 2, bw - 7, 3);
      c.globalAlpha = 1;
      c.fillStyle = "#ffffff09";
      c.fillRect(x + 3, y + 6, 3, bh - 12);
      c.fillStyle = "#00000025";
      c.fillRect(x + 2, y + bh - 7, bw - 5, 4);
      if (b.type === "gem") {
        c.fillStyle = "#9cddc9";
        c.beginPath();
        c.moveTo(x + 27, y + 7);
        c.lineTo(x + 36, y + 15);
        c.lineTo(x + 27, y + 29);
        c.lineTo(x + 18, y + 15);
        c.closePath();
        c.fill();
        c.fillStyle = "#d1f0ce";
        c.beginPath();
        c.moveTo(x + 27, y + 7);
        c.lineTo(x + 27, y + 27);
        c.lineTo(x + 19, y + 15);
        c.fill();
      } else if (b.type === "bomb") {
        c.fillStyle = "#20282b";
        c.beginPath();
        c.arc(x + 27, y + 20, 8, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = "#d5ac63";
        c.lineWidth = 1.5;
        c.beginPath();
        c.moveTo(x + 29, y + 13);
        c.quadraticCurveTo(x + 33, y + 5, x + 37, y + 11);
        c.stroke();
        c.fillStyle = "#e8b06c";
        c.fillRect(x + 36, y + 8, 3, 3);
        c.fillStyle = "#ced1b8";
        c.fillRect(x + 22, y + 17, 3, 2);
      } else {
        c.fillStyle = b.material === 4 ? "#f3d392" : "#e2d8be";
        c.font = '600 11px "Segoe UI",sans-serif';
        const label = String(Math.ceil(b.hp));
        const labelWidth = c.measureText(label).width + 8;
        c.save();
        c.fillStyle = "#1220288c";
        c.beginPath();
        c.roundRect(x + 27 - labelWidth / 2, y + 13, labelWidth, 14, 3);
        c.fill();
        c.restore();
        c.save();
        c.shadowColor = "#101a20";
        c.shadowBlur = 3;
        c.fillText(label, x + 27, y + 24);
        c.restore();
      }
      if (b.minTier > 1) {
        c.fillStyle = "#101e28bb";
        c.fillRect(x + bw - 18, y + 3, 14, 9);
        c.fillStyle = "#d2d0b2";
        c.font = '6px "Segoe UI",sans-serif';
        c.textAlign = "right";
        c.fillText(`${b.minTier}+`, x + bw - 6, y + 10);
        c.textAlign = "center";
      }
      if (b.hp < b.maxHp) {
        c.strokeStyle = "#151e27aa";
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(x + 34, y + 4);
        c.lineTo(x + 29, y + 10);
        c.lineTo(x + 34, y + 15);
        c.lineTo(x + 31, y + 23);
        c.stroke();
        c.fillStyle = "#0c1a21";
        c.fillRect(x + 8, y + 30, 36, 2);
        c.fillStyle = "#c9d19c";
        c.fillRect(x + 8, y + 30, (36 * b.hp) / b.maxHp, 2);
      }
    }
    for (const tool of physics?.tools || [])
      drawTool(
        c,
        tool.tier,
        tool.body.position.x,
        tool.body.position.y,
        tool.body.angle,
        1.06,
      );
    if (bossActive(state))
      drawBoss(c, theme, state.boss, physics?.boss?.body, this.time);
    for (const wave of this.waves) {
      c.strokeStyle = `rgba(244, 204, 136, ${wave.life / 40})`;
      c.lineWidth = 1 + wave.life / 8;
      c.beginPath();
      c.arc(wave.x, wave.y, 6 + (24 - wave.life) * 2.2, 0, Math.PI * 2);
      c.stroke();
    }
    for (const p of this.particles) {
      c.globalAlpha = Math.max(0, p.life / 50);
      c.fillStyle = p.color;
      c.fillRect(p.x, p.y, p.size, p.size);
    }
    c.globalAlpha = 1;
    c.fillStyle = "#92a394";
    c.font = '7px "Segoe UI",sans-serif';
    c.textAlign = "left";
    c.fillText(`DEEPFORGE  /  ${theme.biome.toUpperCase()}`, 23, 539);
    c.fillStyle = theme.color;
    c.textAlign = "right";
    c.fillText(`${state.level * 100} М`, 396, 539);
  }
}
