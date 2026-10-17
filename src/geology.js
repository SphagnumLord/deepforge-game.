import { MATERIALS, random } from "./core.js";

// Small cached rock samples. Every material has six repeatable variations;
// painting frames only blits them, without generating noise or loading images.
export function createRockTextures() {
  return MATERIALS.map((material, kind) => Array.from({ length: 6 }, (_, variant) => {
    const tile = document.createElement("canvas");
    tile.width = 104;
    tile.height = 68;
    const c = tile.getContext("2d"), rng = random(8107 + kind * 997 + variant * 71);
    c.scale(2, 2);
    c.fillStyle = material.color;
    c.fillRect(0, 0, 52, 34);
    const light = c.createLinearGradient(0, 0, 12, 34);
    light.addColorStop(0, material.face + "66");
    light.addColorStop(0.5, "#ffffff00");
    light.addColorStop(1, "#02080b55");
    c.fillStyle = light;
    c.fillRect(0, 0, 52, 34);
    for (let n = 0; n < 270; n++) {
      c.fillStyle = n % 3 ? material.face : "#07151c";
      c.globalAlpha = 0.08 + rng() * 0.18;
      const grain = 0.25 + rng() * (kind === 0 ? 1.2 : 0.65);
      c.fillRect(rng() * 52, rng() * 34, grain, grain);
    }
    c.globalAlpha = 1;
    // Sandstone and slate have sedimentary bedding, quartzite pale seams.
    if (kind === 0 || kind === 1 || kind === 5) {
      const layers = kind === 1 ? 9 : kind === 5 ? 4 : 6;
      for (let n = 0; n < layers; n++) {
        const y = rng() * 34, tilt = (rng() - 0.5) * 15;
        c.strokeStyle = kind === 5 ? "#c0d6c24d" : n % 2 ? "#101b2955" : material.face + "66";
        c.lineWidth = kind === 5 ? 1.4 + rng() : 0.35 + rng() * 0.8;
        c.beginPath();
        c.moveTo(-2, y);
        c.bezierCurveTo(16, y - 3, 30, y + tilt + 4, 55, y + tilt);
        c.stroke();
      }
    }
    if (kind === 2 || kind === 4) {
      // Irregular branching metallic veins, with mineral flecks along them.
      for (let n = 0; n < (kind === 4 ? 4 : 3); n++) {
        const y = rng() * 34;
        c.beginPath();
        c.moveTo(-2, y);
        c.lineTo(12, y - 5 + rng() * 9);
        c.lineTo(24, y + 4 - rng() * 8);
        c.lineTo(38, y - 4 + rng() * 10);
        c.lineTo(54, y - 2);
        c.strokeStyle = "#192528aa";
        c.lineWidth = kind === 4 ? 3 : 2;
        c.stroke();
        c.strokeStyle = kind === 4 ? "#d7b269b0" : "#b47e58a0";
        c.lineWidth = kind === 4 ? 1.25 : 0.8;
        c.stroke();
      }
      c.fillStyle = kind === 4 ? "#ead197b0" : "#d29c7066";
      for (let n = 0; n < 22; n++) c.fillRect(rng() * 52, rng() * 34, 0.7 + rng(), 0.6 + rng());
    }
    if (kind === 3) {
      // Obsidian fractures into angular, glassy faces.
      for (let n = 0; n < 11; n++) {
        const x = rng() * 52, y = rng() * 34;
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x + 4 + rng() * 18, y - 5 + rng() * 15);
        c.lineTo(x - 6 + rng() * 12, y + 5 + rng() * 15);
        c.closePath();
        c.fillStyle = n % 2 ? "#171a2f55" : "#a28fa12b";
        c.fill();
        c.strokeStyle = "#abb6bd22";
        c.lineWidth = 0.4;
        c.stroke();
      }
    }
    // Hairline cracks differ per sample, without obscuring the HP labels.
    c.strokeStyle = "#07121b55";
    c.lineWidth = 0.55;
    const x = 8 + rng() * 36;
    c.beginPath();
    c.moveTo(x, 0);
    c.lineTo(x - 3, 6);
    c.lineTo(x + 2, 12);
    c.lineTo(x - 2, 17);
    c.stroke();
    return tile;
  }));
}

export function createLampMist() {
  const mist = document.createElement("canvas");
  mist.width = 192;
  mist.height = 96;
  const c = mist.getContext("2d");
  c.scale(1, 0.5);
  const veil = c.createRadialGradient(96, 96, 0, 96, 96, 96);
  veil.addColorStop(0, "#d9d5b82e");
  veil.addColorStop(0.35, "#d0d1ba16");
  veil.addColorStop(1, "#ced6c000");
  c.fillStyle = veil;
  c.fillRect(0, 0, 192, 192);
  return mist;
}
