// さくせん盤：ペン（作戦盤の線。位置は % で持つ）
// ファイルは index.html に書いた順（page → formation → marks → store → link → board → ink → tactics → sheets → card → image → events → app.js）に読み、同じ範囲の変数（state など）を使う
"use strict";

// ---- ペン（作戦盤の線。位置は % で持つ） ----
function drawInk() {
  const rect = board.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  ink.width = Math.round(rect.width * dpr);
  ink.height = Math.round(rect.height * dpr);
  const ctx = ink.getContext("2d");
  ctx.scale(dpr, dpr);
  // 横のコートでは、線の点も回して描く（線は縦のコートの % で持っている）
  for (const stroke of state.strokes) drawStroke(ctx, { ...stroke, points: stroke.points.map(([x, y]) => toView(x, y)) }, rect.width, rect.height, 3);
}

// 線を1本描く（点を曲線でなめらかにつなぐ）。w・h は描く大きさ、width は線の太さ
function drawStroke(ctx, stroke, w, h, width) {
  const pts = stroke.points.map(([x, y]) => [(x / 100) * w, (y / 100) * h]);
  if (pts.length < 2) return;
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  // 点と点を曲線でつなぐ（リンクで点を間引いた線でも、カクカクせずになめらかに見える）
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length - 1; i += 1) {
    const [x, y] = pts[i];
    ctx.quadraticCurveTo(x, y, (x + pts[i + 1][0]) / 2, (y + pts[i + 1][1]) / 2);
  }
  ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
  ctx.stroke();
}

// 線の点を max 個以下に減らす。曲がり角を残すように、元の線から離れた点を優先して残す（Douglas–Peucker）
function simplifyPoints(points, max) {
  if (points.length <= max) return points;
  // 点をへらす（まっすぐな所の点を間引く。ダグラス・ポーカー法）
  const rdp = (pts, eps) => {
    if (pts.length < 3) return pts;
    const [ax, ay] = pts[0];
    const [bx, by] = pts[pts.length - 1];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    let far = 0;
    let index = 0;
    for (let i = 1; i < pts.length - 1; i += 1) {
      const d = Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / len;
      if (d > far) [far, index] = [d, i];
    }
    if (far <= eps) return [pts[0], pts[pts.length - 1]];
    return [...rdp(pts.slice(0, index + 1), eps).slice(0, -1), ...rdp(pts.slice(index), eps)];
  };
  let [low, high] = [0, 50];
  let best = null;
  for (let i = 0; i < 14; i += 1) {
    const eps = (low + high) / 2;
    const out = rdp(points, eps);
    if (out.length <= max) [best, high] = [out, eps];
    else low = eps;
  }
  return best || [points[0], points[points.length - 1]];
}

ink.addEventListener("pointerdown", (event) => {
  if (!drawing) return;
  event.preventDefault();
  try {
    ink.setPointerCapture(event.pointerId);
  } catch {
    // つかめなくても描ける
  }
  const rect = board.getBoundingClientRect();
  // 画面の位置 → 縦のコートの %（横のコートでは回して戻す）
  const point = (e) => fromView(((e.clientX - rect.left) / rect.width) * 100, ((e.clientY - rect.top) / rect.height) * 100).map((v) => Math.round(v * 10) / 10);
  remember();
  const stroke = { color: state.penColor, points: [point(event)] };
  state.strokes.push(stroke);
  // ペンで描いているあいだ、点を足して描きなおす
  const onMove = (e) => {
    stroke.points.push(point(e));
    drawInk();
  };
  // ペンをはなしたら線を決める（点が1つだけなら捨てる）
  const onUp = () => {
    ink.removeEventListener("pointermove", onMove);
    ink.removeEventListener("pointerup", onUp);
    if (stroke.points.length < 2) {
      state.strokes.pop();
      undoStack.pop();
    }
    swallowClickUntil = Date.now() + 400;
    render();
  };
  ink.addEventListener("pointermove", onMove);
  ink.addEventListener("pointerup", onUp);
});
