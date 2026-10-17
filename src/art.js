import { TOOLS } from "./core.js";
let serial = 0;
const sprites = new Map();
let loading;
export function toolMarkup(tier) {
  const t = TOOLS[tier - 1],
    id = `pick-${++serial}`,
    broad = t.kind === 1,
    premium = tier > 5;
  const head = broad
    ? "M5 23 Q16 10 30 13 L40 14 Q54 17 66 38 L54 29 40 24 30 24 Q18 25 5 23Z"
    : t.kind === 2
      ? "M4 29 Q12 14 29 13 L39 14 Q57 17 68 36 L56 28 40 23 30 23 Q16 22 4 29Z"
      : "M3 30 Q15 10 31 13 L40 15 Q57 19 68 37 L53 28 40 24 30 23 Q16 22 3 30Z";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 76 88" aria-hidden="true"><defs><linearGradient id="${id}-wood" x1="0" x2="1"><stop stop-color="#554130"/><stop offset=".35" stop-color="#a17b50"/><stop offset=".62" stop-color="#c09a66"/><stop offset="1" stop-color="#624a35"/></linearGradient><linearGradient id="${id}-steel" x1="0" y1="0" x2=".25" y2="1"><stop stop-color="#dde0cc"/><stop offset=".22" stop-color="${t.color}"/><stop offset=".52" stop-color="#748580"/><stop offset=".7" stop-color="${t.color}"/><stop offset="1" stop-color="#37484a"/></linearGradient><linearGradient id="${id}-collar"><stop stop-color="#495854"/><stop offset=".5" stop-color="#c6c7aa"/><stop offset="1" stop-color="#59625a"/></linearGradient></defs><g transform="rotate(24 37 44)"><path d="M33 22Q37 43 29 76Q28 81 33 82Q38 82 39 76L43 25Z" fill="#101f23" opacity=".45" transform="translate(2 2)"/><path d="M32 21Q36 44 29 76Q28 80 33 81Q37 81 38 76L42 23Z" fill="url(#${id}-wood)" stroke="#493b2e" stroke-width="1"/><path d="M36 31Q39 47 33 73M32 67l4-2M34 57l4-2" fill="none" stroke="#e2bf7b" stroke-width=".6" opacity=".5"/><path d="M31 64l7 2m-8 2 7 2m-8 2 7 2m-8 2 7 2" stroke="#5b5140" stroke-width="2"/><path d="${head}" fill="url(#${id}-steel)" stroke="#314347" stroke-width="1.3" stroke-linejoin="round"/><path d="M6 26Q17 13 31 16L40 18Q54 21 64 32" fill="none" stroke="#e1e2ca" stroke-width="1.1" opacity=".75"/><path d="m13 23 5-3m31 4 4 2m-3-6 2 3" stroke="#526460" stroke-width=".6" opacity=".7"/><path d="M31 15l10 2-1 14-9-1Z" fill="url(#${id}-collar)" stroke="#394c4a" stroke-width="1"/><path d="m34 19 4 .6-.5 7-4-.5Z" fill="#4a5145"/><path d="m34.5 19.5 2.5.3-.4 5-2.5-.3Z" fill="#bb9c64"/>${premium ? '<path d="m30 33 10 1-.6 5-10-1Z" fill="#93845b" stroke="#cec49c" stroke-width=".5"/>' : ""}${tier >= 9 ? '<path d="m34 21 1.5 2-1.5 2-1-2Z" fill="#a8ccb1"/>' : ""}</g></svg>`;
}
export function loadToolArt() {
  if (!loading)
    loading = Promise.all(
      TOOLS.map(
        (t) =>
          new Promise((resolve) => {
            const image = new Image();
            image.onload = () => {
              sprites.set(t.tier, image);
              resolve();
            };
            image.onerror = () => resolve();
            image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(toolMarkup(t.tier))}`;
          }),
      ),
    );
  return loading;
}
export function drawTool(ctx, tier, x, y, angle = 0, size = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(size, size);
  const sprite = sprites.get(tier);
  if (sprite) ctx.drawImage(sprite, -25, -29, 50, 58);
  else {
    ctx.strokeStyle = "#b08c5c";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-6, 19);
    ctx.lineTo(3, -13);
    ctx.stroke();
    ctx.strokeStyle = TOOLS[tier - 1].color;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-17, -8);
    ctx.quadraticCurveTo(0, -23, 18, -4);
    ctx.stroke();
  }
  ctx.restore();
}
const trophyPaths = {
  horn: "M12 29Q4 17 12 5Q9 19 21 22L28 30Z",
  eye: "M5 19Q20 2 35 19Q20 37 5 19ZM15 19A5 7 0 1 0 25 19A5 7 0 1 0 15 19Z",
  fang: "M11 5L29 9Q29 29 11 35Q19 23 11 5Z",
  crystal: "M20 3L31 13 26 30 16 35 8 15Z",
  shield: "M8 7L20 3 32 7 30 23 20 35 10 23Z",
  root: "M18 4L24 5 23 15 32 9 34 14 25 22 28 34 20 32 18 25 8 33 5 28 15 18Z",
  seal: "M10 5L29 5 34 12 31 31 22 36 8 28 5 14Z",
  crown: "M5 12L13 18 20 4 27 18 35 12 31 32 9 32Z",
};
export function trophyMarkup(trophy) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" aria-hidden="true"><path d="${trophyPaths[trophy.kind]}" fill="${trophy.color}" fill-rule="evenodd" stroke="#e3d4ac" stroke-width="1"/><path d="M11 35h19" stroke="#817452" stroke-width="2"/></svg>`;
}
export function drawTrophy(ctx, trophy, x, y, scale = 1) {
  ctx.save();
  ctx.translate(x - 20 * scale, y - 20 * scale);
  ctx.scale(scale, scale);
  ctx.fillStyle = trophy.color;
  ctx.strokeStyle = "#d9ccaa";
  ctx.lineWidth = 0.8;
  const path = new Path2D(trophyPaths[trophy.kind]);
  ctx.fill(path, "evenodd");
  ctx.stroke(path);
  ctx.restore();
}
export function drawBoss(ctx, config, boss, body, time = 0) {
  if (!body) return;
  const { x, y } = body.position,
    weak = boss.hits % 4 === 3;
  ctx.save();
  ctx.translate(x, y);
  const stone = ctx.createLinearGradient(-60, -50, 50, 60);
  stone.addColorStop(0, "#899084");
  stone.addColorStop(0.45, config.glow);
  stone.addColorStop(1, "#263c3c");
  ctx.fillStyle = "#101c21";
  ctx.beginPath();
  ctx.ellipse(0, 56, 68, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = stone;
  ctx.strokeStyle = "#a8a88c";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-59, -22);
  ctx.lineTo(-37, -49);
  ctx.lineTo(22, -52);
  ctx.lineTo(57, -27);
  ctx.lineTo(62, 22);
  ctx.lineTo(36, 49);
  ctx.lineTo(-34, 48);
  ctx.lineTo(-61, 22);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = "#152b2e";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-31, -42);
  ctx.lineTo(-14, -17);
  ctx.lineTo(-19, 4);
  ctx.moveTo(35, -39);
  ctx.lineTo(16, -16);
  ctx.lineTo(28, 0);
  ctx.moveTo(-10, 27);
  ctx.lineTo(0, 38);
  ctx.lineTo(23, 30);
  ctx.stroke();
  ctx.fillStyle = weak ? "#e9c981" : "#95b7a1";
  ctx.shadowColor = ctx.fillStyle;
  ctx.shadowBlur = weak ? 16 : 5;
  ctx.fillRect(-36, -13, 21, 6);
  ctx.fillRect(15, -13, 21, 6);
  ctx.shadowBlur = 0;
  ctx.fillStyle = weak ? "#e8bc74" : "#a3b69d";
  ctx.beginPath();
  ctx.moveTo(0, -4);
  ctx.lineTo(9, 9);
  ctx.lineTo(0, 24);
  ctx.lineTo(-9, 9);
  ctx.closePath();
  ctx.fill();
  drawTrophy(ctx, config.trophy, 0, -43, 0.66);
  ctx.fillStyle = "#d8d4ba";
  ctx.font = '8px "Segoe UI",sans-serif';
  ctx.textAlign = "center";
  ctx.fillText(weak ? "СЛАБОЕ МЕСТО ОТКРЫТО" : "РАЗБЕЙ БРОНЮ: 3 УДАРА", 0, -70);
  ctx.restore();
}
