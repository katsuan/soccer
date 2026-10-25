// さくせん盤：フォーメーション・コート・選手の並ぶ位置（後ろの列から。GK は別に先頭）
// ファイルは index.html に書いた順（page → formation → marks → store → link → board → ink → tactics → sheets → card → image → events → app.js）に読み、同じ範囲の変数（state など）を使う
"use strict";

// フォーメーションは後ろの列から（"4-4-2"）。GK は別に先頭に置く。mode はピッチの描き方（サッカー／フットサル）
const FORMATION_GROUPS = [
  { id: "soccer11", label: "サッカー（11人）", mode: "soccer", list: ["4-4-2", "4-3-3", "4-2-3-1", "3-5-2", "3-4-3"] },
  { id: "soccer8", label: "サッカー（8人制）", mode: "soccer", list: ["3-3-1", "2-3-2", "3-2-2", "2-4-1"] },
  { id: "futsal", label: "フットサル（5人）", mode: "futsal", list: ["1-2-1", "2-2", "3-1", "2-1-1"] }
];
// 人数は変則もある（退場で10人、7人制、練習試合で12人以上など）。GK を入れて 2〜16 人
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 16;
// フォーメーションの文字（"4-4-2"）を、列ごとの人数のならび（[4, 4, 2]）にする。形がちがえば []
const parseFormation = (f) => (/^\d{1,2}(-\d{1,2}){0,4}$/.test(String(f)) ? String(f).split("-").map(Number) : []);
// フォーメーションのフィールドの人数（GK を除く）を返す
const fieldCount = (f) => parseFormation(f).reduce((a, b) => a + b, 0);
// 決まったフォーメーションがない人数のときの並び（後ろ 4 割・前 2 割・残りが中盤）
function autoFormation(n) {
  if (n <= 2) return String(Math.max(1, n));
  if (n <= 4) return `${Math.ceil(n / 2)}-${Math.floor(n / 2)}`;
  const back = Math.ceil(n * 0.4);
  const front = Math.max(1, Math.floor(n * 0.2));
  return `${back}-${n - back - front}-${front}`;
}
// コート（サッカー 11人・8人制・フットサル）。決まったフォーメーションが無いときは、ピッチと人数から決める
const courtOf = (mode, f, count) =>
  (FORMATION_GROUPS.find((g) => g.mode === mode && g.list.includes(f)) || FORMATION_GROUPS.find((g) => g.id === (mode === "futsal" ? "futsal" : count <= 8 ? "soccer8" : "soccer11"))).id;
// コートの id から、コートの決まり（名前・ピッチ・フォーメーションの一覧）を返す
const courtDef = (id) => FORMATION_GROUPS.find((g) => g.id === id) || FORMATION_GROUPS[0];

// フォーメーションから位置を作る（GK が一番下、列は後ろから前へ）
// 自チームの GK と最前線の高さ（%）。相手がいないときはコート全体、相手を出すときは前を下げて相手と互い違いにする。
// ほかの列は、この2つの間で同じ割合の位置に動く（選手を動かしたあとでも、同じ割合で縮む・広がる）
const FULL = { gk: 90, front: 18 };
const VERSUS = { gk: 90, front: 33 };
// 相手の並べ方「コート別」：自チームは自陣（下半分）だけ、相手は上半分だけに並べる（重ならない）
const HALF = { gk: 90, front: 56 };
// 相手を出しているときの高さ。state.oppLayout が "half" ならコート別、それ以外はフルコート（互い違い）
const versusFrame = () => (state.oppLayout === "half" ? HALF : VERSUS);
// 高さ y を、from の GK・最前線の高さから、to の高さへ同じ割合で移した値を返す
const fitY = (y, from, to) => Math.round((to.gk - ((from.gk - y) * (to.gk - to.front)) / (from.gk - from.front)) * 10) / 10;

// 列ごとの形（フォーメーションの数字だけでは決まらない並び）。人数ごとに選べる形。何も選んでいないときは default のもの（なければ先頭）。
// 343 の 4 をダイヤに、中盤の 2 を開く・しぼる、3 を三角（頂点が前・後ろ）に、など
const LINE_SHAPES = {
  // 2人は幅の順（しぼる → ふつう → ワイド）。何も選んでいないときは default の「ふつう」
  2: [{ id: "narrow", label: "しぼる" }, { id: "normal", label: "ふつう", default: true }, { id: "wide", label: "ワイド" }],
  3: [{ id: "flat", label: "フラット" }, { id: "front", label: "▲ 三角", title: "三角（頂点が前）" }, { id: "back", label: "▼ 逆三角", title: "逆三角（頂点が後ろ）" }],
  4: [{ id: "flat", label: "フラット" }, { id: "diamond", label: "◆ ダイヤ" }, { id: "box", label: "▢ ボックス" }],
  5: [{ id: "flat", label: "フラット" }, { id: "wings", label: "サイド前", title: "両サイドが前（ウイングバック）" }, { id: "anchor", label: "アンカー", title: "真ん中が後ろ（アンカー）" }]
};
// 列の呼び名（後ろから）。列の数で変える
const LINE_NAMES = { 1: ["フィールド"], 2: ["後ろ", "前"], 3: ["DF", "MF", "FW"], 4: ["DF", "ボランチ", "2列目", "FW"], 5: ["DF", "ボランチ", "MF", "2列目", "FW"] };
// 今のフォーメーションで選んでいる列ごとの形（フォーメーションごとに覚える。相手は oppLineShapes）。
// state を作る前に呼ばれても空で返す
function lineShapesOf(formation, side = "ours") {
  try {
    const store = side === "opp" ? state.oppLineShapes : state.lineShapes;
    return (store && store[formation]) || [];
  } catch {
    return [];
  }
}

// 1列分の位置（y は列の高さ、gap は列と列の間。前＝上＝y が小さい）
function lineSpots(mode, count, y, gap, shape) {
  const cap = mode === "futsal" ? 26 : 36;
  const d = Math.max(6, gap * 0.4); // 前後にずらす幅
  // n 人を、まんなかから左右に half ずつ広げた1列の位置を返す
  const row = (half, yy, n = count) =>
    Array.from({ length: n }, (_, j) => ({ x: n === 1 ? 50 : Math.round(50 - half + (2 * half * j) / (n - 1)), y: yy }));
  if (count === 2) {
    const half = Math.min(cap, { wide: 30, narrow: 9 }[shape] ?? 16);
    return row(half, y);
  }
  if (count === 3 && (shape === "front" || shape === "back")) {
    const half = Math.min(cap, 26);
    const middle = shape === "front" ? y - d : y + d;
    return [{ x: 50 - half, y }, { x: 50, y: middle }, { x: 50 + half, y }];
  }
  if (count === 4 && shape === "diamond") {
    const half = Math.min(cap, 24);
    return [{ x: 50, y: y + d }, { x: 50 - half, y }, { x: 50 + half, y }, { x: 50, y: y - d }];
  }
  if (count === 4 && shape === "box") {
    const half = Math.min(cap, 14);
    return [{ x: 50 - half, y: y + d * 0.6 }, { x: 50 + half, y: y + d * 0.6 }, { x: 50 - half, y: y - d * 0.6 }, { x: 50 + half, y: y - d * 0.6 }];
  }
  if (count === 5 && (shape === "wings" || shape === "anchor")) {
    const spots = row(Math.min(cap, 36), y);
    if (shape === "wings") [0, 4].forEach((j) => (spots[j].y = y - d));
    if (shape === "anchor") spots[2].y = y + d;
    return spots;
  }
  const half = Math.min(cap, { 2: 16, 3: 26 }[count] ?? 36);
  return row(half, y);
}

// versus：相手も出すとき。上から 相手GK → 相手DF → 自チームFW → 相手MF → 自チームMF → 相手FW → 自チームDF → 自チームGK の順に、
// 相手と互い違いに並ぶ高さ（相手は上下反対に置く）。FW を前に出しすぎないので、並べ直しが少なくて済む。
// 相手がいないときは、コート全体に広げる
function formationPositions(mode, formation, versus = true, shapes = []) {
  const parsed = parseFormation(formation);
  const lines = parsed.length ? parsed : parseFormation(mode === "futsal" ? "1-2-1" : "4-4-2");
  // コート全体に並べてから、相手を出すときは GK と最前線の高さに合わせて縦に縮める
  // GK は少しゴール寄り（y=92）に置き、後ろの列（逆三角の頂点など）との間をあける
  const spots = [{ x: 50, y: FULL.gk + 2 }];
  const back = 74;
  const gap = lines.length > 1 ? (back - FULL.front) / (lines.length - 1) : 20;
  lines.forEach((count, i) => {
    const y = lines.length === 1 ? 46 : Math.round(back - ((back - FULL.front) * i) / (lines.length - 1));
    // 横の広がりは人数で変える（2人は中央寄り、4人以上はサイドいっぱい）。列ごとの形（shapes[i]）があればその形に
    // 前の端にはみ出す形は、形を保ったまま列ごと内側へずらす。
    // 後ろ（GK の前）にはみ出す選手（逆三角の頂点など）は、その選手だけ GK の手前（y=79）までにとどめる。
    // 列ごと前にずらすと、ほかの選手が相手の FW とぶつかるため
    const line = lineSpots(mode, count, y, gap, shapes[i]);
    const top = Math.min(...line.map((spot) => spot.y));
    const shift = top < 12 ? 12 - top : 0;
    line.forEach((spot) => spots.push({ x: spot.x, y: Math.round(Math.min(79, spot.y + shift) * 10) / 10 }));
  });
  return versus ? spots.map((spot) => ({ x: spot.x, y: fitY(spot.y, FULL, versusFrame()) })) : spots;
}

// フォーメーションの位置に選手を並べる（前の選手の背番号・名前・印は、同じ順番の選手に引きつぐ）
function freshPlayers(mode, formation, old = [], versus = state.showOpp, shapes = lineShapesOf(formation)) {
  return formationPositions(mode, formation, versus, shapes).map((spot, i) => ({
    number: old[i]?.number ?? String(i + 1),
    name: old[i]?.name ?? "",
    ...(old[i]?.marks ? { marks: old[i].marks } : {}),
    ...spot
  }));
}
