// Placeholder "app demo" scenes (abstract UI, no real product content), drawn on a 960×600 canvas.
// Each scene takes (ctx, t) where t runs 0 → 1 over the clip.
export const W = 960, H = 600;

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const ease = (t) => { t = clamp(t); return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const seg = (t, a, b) => ease((t - a) / (b - a));
const lerp = (a, b, t) => a + (b - a) * t;

const fill = (c, col) => { c.globalAlpha = 1; c.fillStyle = col; c.fillRect(0, 0, W, H); };
function rect(c, x, y, w, h, r, col, a = 1) {
  if (a <= 0 || w <= 0 || h <= 0) return;
  c.globalAlpha = Math.min(1, a);
  c.fillStyle = col;
  c.beginPath();
  c.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
  c.fill();
  c.globalAlpha = 1;
}
const circle = (c, cx, cy, rad, col, a = 1) => rect(c, cx - rad, cy - rad, rad * 2, rad * 2, rad, col, a);
function shadow(c, x, y, w, h, r, a = .12, s = 18) {
  if (a <= 0) return;
  c.save();
  c.shadowColor = `rgba(16,20,32,${Math.min(1, a * 2.2)})`;
  c.shadowBlur = s * 1.6;
  c.shadowOffsetX = 10000;
  c.shadowOffsetY = s * .45;
  c.fillStyle = '#000';
  c.beginPath();
  c.roundRect(x - 10000, y, w, h, Math.min(r, w / 2, h / 2));
  c.fill();
  c.restore();
}

// 1. Field guide: map with climate zones, pins drop, result cards slide in
function fieldGuide(b, t) {
  fill(b, '#f3f5f1');
  rect(b, 0, 0, W, 56, 0, '#ffffff');
  rect(b, 24, 18, 90, 20, 6, '#1f5f46');
  const q = seg(t, .05, .3);
  rect(b, 300, 12, 360, 32, 16, '#eef1ec');
  rect(b, 318, 24, 220 * q, 8, 4, '#56605a', .8);
  rect(b, 24, 76, 580, 500, 14, '#dfe8e0');
  const zones = [['#9fd39a', 60, 120, 260, 150], ['#f2c46b', 300, 110, 260, 120], ['#7fc1d9', 80, 300, 220, 220], ['#c9a2e0', 330, 270, 240, 180], ['#e88f73', 200, 200, 170, 120]];
  zones.forEach(([col, x, y, w, h], i) => rect(b, x, y, w, h, 60, col, i === 4 ? .35 + .5 * seg(t, .2, .35) : .6));
  const pins = [[170, 190], [420, 160], [180, 400], [450, 340], [300, 250]];
  pins.forEach(([x, y], i) => {
    const p = seg(t, .25 + i * .06, .35 + i * .06);
    const yy = y - (1 - p) * 40;
    shadow(b, x - 6, y + 8, 12, 4, 2, .25 * p, 4);
    circle(b, x, yy, 11, '#1f5f46', p);
    circle(b, x, yy, 4, '#ffffff', p);
  });
  for (let i = 0; i < 4; i++) {
    const p = seg(t, .45 + i * .07, .6 + i * .07);
    const x = 628 + (1 - p) * 60, y = 76 + i * 126;
    shadow(b, x, y, 308, 110, 12, .1 * p);
    rect(b, x, y, 308, 110, 12, '#ffffff', p);
    rect(b, x + 14, y + 14, 82, 82, 8, ['#9fd39a', '#f2c46b', '#7fc1d9', '#c9a2e0'][i], p);
    rect(b, x + 110, y + 20, 150, 10, 5, '#2a2f2c', p * .85);
    rect(b, x + 110, y + 42, 170, 8, 4, '#8a938d', p * .7);
    rect(b, x + 110, y + 58, 120, 8, 4, '#8a938d', p * .7);
    rect(b, x + 110, y + 78, 54, 18, 9, '#e3efe7', p);
  }
}

// 2. Bill splitting: phone with people rows and a split slider
function billSplit(b, t) {
  fill(b, '#eef0fb');
  rect(b, 70, 120, 200, 360, 28, '#ffffff', .55);
  rect(b, 690, 120, 200, 360, 28, '#ffffff', .55);
  const px = 330, py = 30, pw = 300, ph = 600;
  shadow(b, px, py, pw, ph, 36, .16, 28);
  rect(b, px, py, pw, ph, 36, '#ffffff');
  rect(b, px + 24, py + 40, 120, 14, 7, '#1d2033');
  rect(b, px + 24, py + 72, pw - 48, 96, 18, '#4b3df5');
  rect(b, px + 44, py + 92, 70, 8, 4, '#ffffff', .6);
  rect(b, px + 44, py + 112, 80 + 70 * seg(t, .05, .25), 26, 8, '#ffffff', .95);
  const s = seg(t, .35, .6);
  const from = [.25, .25, .25, .25], to = [.4, .2, .25, .15];
  for (let i = 0; i < 4; i++) {
    const y = py + 196 + i * 72;
    const v = lerp(from[i], to[i], s);
    circle(b, px + 48, y + 22, 18, ['#ff9f7a', '#7ad0ff', '#ffd36b', '#9be3b5'][i]);
    rect(b, px + 78, y + 10, 90, 9, 4, '#1d2033', .8);
    rect(b, px + 78, y + 28, 150, 6, 3, '#e6e8f4');
    rect(b, px + 78, y + 28, 150 * v / .4, 6, 3, '#4b3df5');
    rect(b, px + pw - 70, y + 12, 44 * (.6 + v), 14, 6, '#1d2033', .75);
  }
  const press = seg(t, .72, .78) - seg(t, .78, .86);
  const done = seg(t, .82, .9);
  rect(b, px + 24 + press * 5, py + ph - 92, pw - 48 - press * 10, 54, 27, done > .5 ? '#13a36b' : '#1d2033');
  rect(b, px + pw / 2 - 40, py + ph - 70, 80, 10, 5, '#ffffff', .9);
  if (done > 0 && done < 1) circle(b, px + pw / 2, py + ph - 65, 80 * done, '#13a36b', .25 * (1 - done));
}

// 3. Patient portal: calendar, moving selection, time slots, confirmation sheet
function portal(b, t) {
  fill(b, '#f4f7fb');
  rect(b, 0, 0, 210, H, 0, '#0f3d5e');
  for (let i = 0; i < 5; i++) rect(b, 28, 90 + i * 46, 120 - i * 10, 10, 5, '#ffffff', i === 1 ? .95 : .4);
  rect(b, 240, 34, 200, 18, 8, '#0f3d5e');
  rect(b, 240, 76, 400, 380, 16, '#ffffff');
  const sel = Math.round(lerp(9, 17, seg(t, .1, .35)));
  for (let i = 0; i < 35; i++) {
    const cx = 262 + (i % 7) * 52, cy = 104 + Math.floor(i / 7) * 66;
    const on = i === sel;
    if (on) circle(b, cx + 16, cy + 18, 20, '#1b8ad9');
    rect(b, cx + 8, cy + 14, 16, 8, 4, on ? '#ffffff' : '#9aa7b4', on ? 1 : .7);
    if ([4, 12, 22, 30].includes(i)) circle(b, cx + 16, cy + 36, 3, '#f08c4a');
  }
  for (let i = 0; i < 6; i++) {
    const p = seg(t, .35 + i * .03, .45 + i * .03);
    const x = 670 + (i % 2) * 130, y = 76 + Math.floor(i / 2) * 60;
    const chosen = i === 3 && t > .58;
    rect(b, x, y + (1 - p) * 10, 118, 44, 12, chosen ? '#1b8ad9' : '#ffffff', p);
    rect(b, x + 28, y + 18 + (1 - p) * 10, 62, 8, 4, chosen ? '#ffffff' : '#3b4a58', p * .8);
  }
  const c = seg(t, .62, .74);
  const sy = lerp(H + 30, 300, c);
  shadow(b, 670, sy, 250, 220, 16, .16 * c);
  rect(b, 670, sy, 250, 220, 16, '#ffffff', c);
  circle(b, 700, sy + 40, 16, '#13a36b', c);
  rect(b, 726, sy + 34, 140, 12, 6, '#0f3d5e', c);
  rect(b, 690, sy + 80, 200, 8, 4, '#9aa7b4', c);
  rect(b, 690, sy + 100, 160, 8, 4, '#9aa7b4', c);
  rect(b, 690, sy + 150, 210, 44, 22, '#0f3d5e', c);
}

// 4. Offline sync: queue items fill and turn green once back online
function offlineSync(b, t) {
  fill(b, '#f6f3ee');
  const px = 140, pw = 300;
  for (const ox of [px, px + 380]) {
    shadow(b, ox, 30, pw, 600, 36, .14, 26);
    rect(b, ox, 30, pw, 600, 36, '#ffffff');
  }
  const online = seg(t, .3, .4);
  rect(b, px + 20, 70, pw - 40, 40, 12, '#3a3a3a', 1 - online);
  rect(b, px + 20, 70, pw - 40, 40, 12, '#1f8f5a', online);
  rect(b, px + 40, 86, 120, 8, 4, '#ffffff', .9);
  for (let i = 0; i < 6; i++) {
    const y = 130 + i * 72;
    const prog = seg(t, .4 + i * .06, .55 + i * .06);
    rect(b, px + 20, y, pw - 40, 60, 12, '#f6f3ee');
    rect(b, px + 36, y + 14, 120, 8, 4, '#2e2a24', .85);
    rect(b, px + 36, y + 32, pw - 110, 6, 3, '#e4ddd2');
    rect(b, px + 36, y + 32, (pw - 110) * prog, 6, 3, '#1f8f5a');
    circle(b, px + pw - 44, y + 30, 8, prog >= 1 ? '#1f8f5a' : '#e0a030');
  }
  const rx = px + 380;
  rect(b, rx + 20, 70, pw - 40, 200, 16, '#e7efe9');
  for (let i = 1; i < 5; i++) rect(b, rx + 20, 70 + 40 * i, pw - 40, 1.5, 0, '#cfdcd3');
  const pin = seg(t, .2, .3);
  circle(b, rx + 150, 170 - (1 - pin) * 30, 12, '#d9532b', pin);
  for (let i = 0; i < 4; i++) {
    const ch = t > .5 + i * .08;
    rect(b, rx + 24, 300 + i * 56, 24, 24, 7, ch ? '#1f8f5a' : '#e4ddd2');
    rect(b, rx + 62, 308 + i * 56, 150, 8, 4, '#2e2a24', .75);
  }
}

// 5. Dashboard builder: growing bars, a dragged widget snapping into an empty slot
function dashboard(b, t) {
  fill(b, '#f2f2f6');
  rect(b, 0, 0, W, 52, 0, '#16161f');
  for (let i = 0; i < 4; i++) rect(b, 24 + i * 90, 22, 64, 8, 4, '#ffffff', i === 0 ? .9 : .35);
  [[24, 76, 300, 220], [340, 76, 300, 220], [24, 312, 616, 264], [656, 76, 280, 500]].forEach(([x, y, w, h], i) => {
    if (i === 1) { rect(b, x, y, w, h, 14, '#e2e2ea'); return; }
    rect(b, x, y, w, h, 14, '#ffffff');
    rect(b, x + 18, y + 18, 110, 10, 5, '#16161f', .8);
  });
  for (let i = 0; i < 12; i++) {
    const g = seg(t, .05 + i * .02, .3 + i * .02);
    const hgt = (60 + ((i * 37) % 120)) * g;
    rect(b, 50 + i * 48, 556 - hgt, 28, hgt, 6, i === 8 ? '#7b5cff' : '#c9c1ff');
  }
  circle(b, 174, 200, 70, '#7b5cff');
  circle(b, 174, 200, 70 * (.55 + .2 * (1 - seg(t, .1, .4))), '#ffffff');
  for (let i = 0; i < 8; i++) {
    rect(b, 676, 120 + i * 54, 40, 40, 10, '#ecebff');
    rect(b, 728, 130 + i * 54, 140 - (i % 3) * 30, 8, 4, '#16161f', .7);
    rect(b, 728, 146 + i * 54, 90, 6, 3, '#a5a5b5', .7);
  }
  const d = seg(t, .35, .7);
  const x = lerp(700, 340, d), y = lerp(420, 76, d);
  const lift = 1 - seg(t, .68, .75);
  shadow(b, x, y, 300, 220, 14, .22 * lift + .05, 26);
  rect(b, x, y, 300, 220, 14, '#ffffff');
  rect(b, x + 18, y + 18, 100, 10, 5, '#16161f', .8);
  for (let k = 0; k < 3; k++) {
    const v = [128, 88, 164][k] * seg(t, .72 + k * .04, .85 + k * .04);
    rect(b, x + 18, y + 54 + k * 50, v, 30, 8, ['#7b5cff', '#ff8a5c', '#36c2a0'][k]);
  }
  // pointer
  if (lift > 0) {
    b.save(); b.globalAlpha = lift; b.translate(x + 150, y + 30);
    b.fillStyle = '#16161f'; b.strokeStyle = '#ffffff'; b.lineWidth = 2;
    b.beginPath(); b.moveTo(0, 0); b.lineTo(0, 22); b.lineTo(6, 16); b.lineTo(11, 26); b.lineTo(15, 24); b.lineTo(10, 15); b.lineTo(18, 15); b.closePath();
    b.stroke(); b.fill(); b.restore();
  }
}

export const SCENES = { 'field-guide': fieldGuide, 'bill-split': billSplit, portal, 'offline-sync': offlineSync, dashboard };
