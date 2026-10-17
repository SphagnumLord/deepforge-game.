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
    // Decorative ore never changes a block's reward or creates diamonds.
    // A shadowed seam, branching mineral and small facets stay visible at 1x.
    const ore = [
      ["#bf8150", "#f0c28b"], ["#7eabba", "#d2e7e5"],
      ["#d58457", "#ffd0a0"], ["#9973c4", "#e4c1ff"],
      ["#dfac46", "#fff0b3"], ["#51b99d", "#c5ffe1"],
    ][kind];
    const points = Array.from({ length: 6 }, (_, i) => ({
      x: -3 + i * 12, y: 8 + rng() * 18,
    }));
    const seam = new Path2D();
    seam.moveTo(points[0].x, points[0].y);
    for (const point of points.slice(1)) seam.lineTo(point.x, point.y);
    for (const i of [1, 3, 4]) {
      seam.moveTo(points[i].x, points[i].y);
      seam.lineTo(points[i].x + 5, points[i].y + (i % 2 ? -10 : 9));
    }
    c.lineJoin = "round";
    c.strokeStyle = "#08151dba";
    c.lineWidth = 3.7;
    c.stroke(seam);
    c.strokeStyle = ore[0];
    c.lineWidth = 1.9;
    c.stroke(seam);
    c.strokeStyle = ore[1] + "b0";
    c.lineWidth = 0.6;
    c.stroke(seam);
    for (const point of points.slice(1, 5)) {
      const x = point.x + 1, y = point.y - 1, size = 1.5 + rng() * 1.8;
      c.beginPath();
      c.moveTo(x, y - size);
      c.lineTo(x + size * 1.1, y);
      c.lineTo(x + 0.4, y + size);
      c.lineTo(x - size * 0.8, y + 0.3);
      c.closePath();
      c.fillStyle = ore[0];
      c.fill();
      c.strokeStyle = ore[1];
      c.lineWidth = 0.65;
      c.stroke();
      c.fillStyle = ore[1];
      c.fillRect(x - 0.5, y - size + 0.5, 1, 1);
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
  // Three coherent-noise wisps are generated once, then advected in opposite
  // directions. The feathered density gives rolling fog instead of flat halos.
  return Array.from({ length: 3 }, (_, variant) => {
    const mist = document.createElement("canvas");
    mist.width = 256;
    mist.height = 128;
    const c = mist.getContext("2d"), pixels = c.createImageData(256, 128);
    const rng = random(3257 + variant * 173);
    const grid = Float32Array.from({ length: 33 * 33 }, () => rng());
    const smooth = (n) => n * n * (3 - 2 * n);
    const noise = (x, y) => {
      const ix = Math.floor(x) % 32, iy = Math.floor(y) % 32;
      const fx = smooth(x % 1), fy = smooth(y % 1);
      const top = grid[iy * 33 + ix] * (1 - fx) + grid[iy * 33 + ix + 1] * fx;
      const bottom = grid[(iy + 1) * 33 + ix] * (1 - fx) + grid[(iy + 1) * 33 + ix + 1] * fx;
      return top * (1 - fy) + bottom * fy;
    };
    for (let y = 0; y < 128; y++) for (let x = 0; x < 256; x++) {
      const nx = (x - 128) / 128, ny = (y - 64) / 64;
      const edge = Math.max(0, 1 - nx * nx - ny * ny) ** 1.6;
      const swirl = Math.sin(x / 29 + Math.sin(y / 17) * 1.8) * 6;
      const density = noise(x / 42, (y + 12 + swirl) / 26) * 0.6
        + noise(x / 18, (y + 12) / 13) * 0.28
        + noise(x / 8, y / 7) * 0.12;
      const ridge = Math.max(0, 1 - Math.abs(density - 0.47) * 3.1);
      const i = (y * 256 + x) * 4;
      pixels.data[i] = 221;
      pixels.data[i + 1] = 219;
      pixels.data[i + 2] = 197;
      pixels.data[i + 3] = Math.round(edge * ridge ** 2 * 112);
    }
    c.putImageData(pixels, 0, 0);
    return mist;
  });
}
