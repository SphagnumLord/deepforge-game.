import { random } from "./core.js";
import { FIELD } from "./physics.js";

// A painted evening field, cached once. Only the fire, embers and fog move.
export function createCampScene() {
  const scene = document.createElement("canvas");
  scene.width = FIELD.width * 2;
  scene.height = FIELD.height * 2;
  const c = scene.getContext("2d"), rng = random(45207);
  c.scale(2, 2);
  const sky = c.createLinearGradient(0, 0, 0, 118);
  sky.addColorStop(0, "#263449");
  sky.addColorStop(.46, "#69606a");
  sky.addColorStop(.78, "#b18a74");
  sky.addColorStop(1, "#78735d");
  c.fillStyle = sky;
  c.fillRect(0, 0, FIELD.width, FIELD.height);
  // The last light of sunset, with smooth distant hills instead of rock shards.
  const dusk = c.createRadialGradient(82, 63, 2, 82, 63, 115);
  dusk.addColorStop(0, "#edc09d27");
  dusk.addColorStop(1, "#edc09d00");
  c.fillStyle = dusk;
  c.fillRect(0, 0, FIELD.width, 140);
  for (const [height, color, shift] of [[59, "#46565b", 0], [72, "#364d4b", 85], [85, "#2c4540", 160]]) {
    c.fillStyle = color;
    c.beginPath();
    c.moveTo(0, height);
    c.bezierCurveTo(80, height - 18, 120 + shift / 2, height + 11, 220, height - 2);
    c.bezierCurveTo(290, height - 12, 350, height - 12, 420, height + 3);
    c.lineTo(420, 560); c.lineTo(0, 560); c.closePath(); c.fill();
  }
  const grass = c.createLinearGradient(0, 88, 0, 560);
  grass.addColorStop(0, "#344a3c");
  grass.addColorStop(.16, "#253b33");
  grass.addColorStop(.35, "#1b2e2d");
  grass.addColorStop(1, "#14272b");
  c.fillStyle = grass;
  c.fillRect(0, 88, 420, 472);
  const firelight = c.createRadialGradient(210, 79, 2, 210, 79, 91);
  firelight.addColorStop(0, "#edb26037");
  firelight.addColorStop(.45, "#d7a15d13");
  firelight.addColorStop(1, "#e5b77b00");
  c.fillStyle = firelight;
  c.fillRect(100, 0, 220, 170);
  for (let n = 0; n < 235; n++) {
    const x = rng() * 420, y = 78 + rng() * 62, size = 1.5 + rng() * 4;
    c.strokeStyle = n % 3 ? "#70836a55" : "#172e2d88";
    c.lineWidth = .55;
    c.beginPath(); c.moveTo(x, y);
    c.quadraticCurveTo(x - 1, y - size, x - 3 + rng() * 6, y - size * 1.5);
    c.stroke();
  }
  for (const [x, y, opacity] of [[62, 19, .4], [135, 13, .28], [291, 18, .4], [347, 34, .25]]) {
    c.fillStyle = `rgba(236, 220, 191, ${opacity})`;
    c.beginPath(); c.arc(x, y, .65, 0, Math.PI * 2); c.fill();
  }
  // A quiet edge between the camp and the excavation below.
  c.fillStyle = "#162b2b";
  c.fillRect(18, 143, 384, 2);
  c.fillStyle = "#9d9e7133";
  c.fillRect(24, 142, 372, 1);
  return scene;
}

export function createCampMistMask() {
  const mask = document.createElement("canvas");
  mask.width = FIELD.width; mask.height = 112;
  const c = mask.getContext("2d"), pixels = c.createImageData(mask.width, mask.height);
  const smooth = (a, b, x) => {
    const v = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return v * v * (3 - 2 * v);
  };
  const shelf = (x, y, left, right) => smooth(left - 14, left, x)
    * (1 - smooth(right, right + 14, x)) * smooth(26, 41, y) * (1 - smooth(72, 89, y));
  for (let y = 0; y < mask.height; y++) for (let x = 0; x < mask.width; x++) {
    const alpha = smooth(0, 18, y) * (1 - smooth(93, 112, y))
      * (1 - Math.max(shelf(x, y, 23, 181), shelf(x, y, 230, 342)));
    const i = (y * mask.width + x) * 4;
    pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = 255;
    pixels.data[i + 3] = Math.round(alpha * 255);
  }
  c.putImageData(pixels, 0, 0);
  return mask;
}

export function drawCampfire(c, time, reducedMotion) {
  const t = reducedMotion ? 0 : time / 60;
  c.save();
  c.translate(210, 81);
  c.fillStyle = "#17282a";
  c.beginPath(); c.ellipse(0, 2, 22, 6, 0, 0, Math.PI * 2); c.fill();
  for (let n = 0; n < 8; n++) {
    const a = n / 8 * Math.PI * 2;
    c.fillStyle = n % 2 ? "#7c7d6a" : "#5c665b";
    c.beginPath(); c.ellipse(Math.cos(a) * 18, Math.sin(a) * 3 + 2, 3.7, 2.4, a * .1, 0, Math.PI * 2); c.fill();
  }
  c.lineCap = "round";
  c.strokeStyle = "#49372b"; c.lineWidth = 5;
  c.beginPath(); c.moveTo(-13, 3); c.lineTo(11, -1); c.moveTo(-11, -2); c.lineTo(13, 4); c.stroke();
  c.strokeStyle = "#ad7441"; c.lineWidth = 1;
  c.beginPath(); c.moveTo(-12, 2); c.lineTo(9, -1); c.moveTo(-10, -3); c.lineTo(12, 3); c.stroke();
  const sway = Math.sin(t * 3.1) * 2.5, reach = Math.sin(t * 4.3) * 2;
  const flame = c.createLinearGradient(0, -30, 0, 1);
  flame.addColorStop(0, "#e69e4ac0"); flame.addColorStop(.45, "#ef9a47"); flame.addColorStop(1, "#df6734");
  c.fillStyle = flame;
  c.beginPath(); c.moveTo(-11, 0);
  c.bezierCurveTo(-15, -9, -6, -13, -7 + sway, -23);
  c.quadraticCurveTo(-2, -18, -2, -12);
  c.quadraticCurveTo(5 + sway, -21, 3 + reach, -32);
  c.bezierCurveTo(14, -22, 8, -15, 12, -8);
  c.quadraticCurveTo(17, 1, 4, 2); c.closePath(); c.fill();
  c.fillStyle = "#f9c96e";
  c.beginPath(); c.moveTo(-6, 0); c.quadraticCurveTo(-8, -7, -2 + sway, -16);
  c.quadraticCurveTo(-1, -9, 3, -8); c.quadraticCurveTo(7, -15, 6 + reach, -18);
  c.quadraticCurveTo(13, -1, 1, 2); c.closePath(); c.fill();
  c.fillStyle = "#fff0b3";
  c.beginPath(); c.ellipse(1, -3, 4, 5, sway * .08, 0, Math.PI * 2); c.fill();
  for (let n = 0; n < 4; n++) {
    const phase = (t * .28 + n / 4) % 1;
    c.globalAlpha = (1 - phase) * .65;
    c.fillStyle = "#efca85";
    c.fillRect(Math.sin(t + n * 2) * 6 + phase * 5, -14 - phase * 31, 1, 1.5);
  }
  c.restore();
}
