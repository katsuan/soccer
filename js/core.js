// さくせん盤：定数・フォーメーションの位置・状態（この端末に残す）・戻す・リンクからの読み込み
// ファイルは index.html に書いた順（core → board → ink → tactics → sheets → share → events → app.js）に読み、同じ範囲の変数（state など）を使う
"use strict";

const EDITOR_URL = "https://katsuan.github.io/soccer/"; // このページ（画像をタップしたときに開く）
const LINK_MAX = 1000; // LINE のリンクは 1000 文字まで
const STORE_KEY = "soccer:state";
const ROSTER_KEY = "soccer:roster";
const $ = (id) => document.getElementById(id);

// フォーメーションは後ろの列から（"4-4-2"）。GK は別に先頭に置く。mode はピッチの描き方（サッカー／フットサル）
const FORMATION_GROUPS = [
  { id: "soccer11", label: "サッカー（11人）", mode: "soccer", list: ["4-4-2", "4-3-3", "4-2-3-1", "3-5-2", "3-4-3"] },
  { id: "soccer8", label: "サッカー（8人制）", mode: "soccer", list: ["3-3-1", "2-3-2", "3-2-2", "2-4-1"] },
  { id: "futsal", label: "フットサル（5人）", mode: "futsal", list: ["1-2-1", "2-2", "3-1", "2-1-1"] }
];
// 人数は変則もある（退場で10人、7人制、練習試合で12人以上など）。GK を入れて 2〜16 人
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 16;
const parseFormation = (f) => (/^\d{1,2}(-\d{1,2}){0,4}$/.test(String(f)) ? String(f).split("-").map(Number) : []);
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
const courtDef = (id) => FORMATION_GROUPS.find((g) => g.id === id) || FORMATION_GROUPS[0];
const PEN_COLORS = ["#ffffff", "#ffd23f", "#ff5a5f", "#38bdf8"];
// チームの色（自チーム・相手で選ぶ）。明るい色の丸は背番号を濃い色にする
// 最後に「カスタム」（自由な色）
// ユニフォームの色は見分けやすい3色にしぼる（緑・黄・白。白は相手の最初の色）。ほかの色はカスタムで。ろくがと同じ3色
const TEAM_COLORS = [
  { label: "緑", hex: "#22a447" },
  { label: "黄", hex: "#ffd23f" },
  { label: "白", hex: "#ffffff" }
];
const isLight = (hex) => {
  const n = parseInt(String(hex).slice(1), 16);
  return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114 > 170;
};
const inkOn = (hex) => (isLight(hex) ? "#23302a" : "#ffffff");
// おくるんのカードの見出しの帯に使う色：さくせん盤の緑（チームの色ではなく、ツールの色にそろえる）
const cardColor = () => "#2e8b4a";

// フォーメーションから位置を作る（GK が一番下、列は後ろから前へ）
// 自チームの GK と最前線の高さ（%）。相手がいないときはコート全体、相手を出すときは前を下げて相手と互い違いにする。
// ほかの列は、この2つの間で同じ割合の位置に動く（選手を動かしたあとでも、同じ割合で縮む・広がる）
const FULL = { gk: 90, front: 18 };
const VERSUS = { gk: 90, front: 33 };
// 相手の並べ方「コート別」：自チームは自陣（下半分）だけ、相手は上半分だけに並べる（重ならない）
const HALF = { gk: 90, front: 56 };
// 相手を出しているときの高さ。state.oppLayout が "half" ならコート別、それ以外はフルコート（互い違い）
const versusFrame = () => (state.oppLayout === "half" ? HALF : VERSUS);
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

// 選手の印（イエロー・レッド・ゴール・アシスト）。p.marks = { y: 0〜2, r: 0〜1, g: 0〜, a: 0〜 }（なければ印なし）
const MARKS = [
  { key: "y", icon: "🟨", label: "イエロー", max: 2 },
  { key: "r", icon: "🟥", label: "レッド", max: 1 },
  { key: "g", icon: "⚽", label: "ゴール", max: 9 },
  { key: "a", icon: "👟", label: "アシスト", max: 9 },
  { key: "o", icon: "⚽", label: "OG", max: 9, red: true } // ボールを赤く描く（markParts の red）
];
// 盤・画像に出す部品（[{ icon: "⚽", count: 1, label: "2" }, ...]）。2つ以上は「⚽2」「🟨2」のように数で（交代前・出場中とも）。
// red はオウンゴール（ボールを赤く描く）
function markParts(marks) {
  if (!marks) return [];
  return MARKS.map(({ key, icon, red }) => {
    const n = Math.max(0, Math.floor(Number(marks[key]) || 0));
    if (n <= 0) return null;
    return n === 1 ? { icon, count: n, red: Boolean(red) } : { icon, count: 1, label: String(n), red: Boolean(red) };
  }).filter(Boolean);
}
// 文字だけの形（「🟨⚽⚽」）。印があるかどうかの判定や、文字で出すときに使う
const markText = (marks) => markParts(marks).map((part) => part.icon.repeat(part.count) + (part.label || "")).join("");
// リンクに入れる短い形（「y1g2」）と、その読み戻し
const encodeMarks = (marks) => MARKS.map(({ key }) => (Number(marks?.[key]) > 0 ? `${key}${Math.floor(Number(marks[key]))}` : "")).join("");
function decodeMarks(text) {
  const marks = {};
  for (const [, key, n] of String(text || "").matchAll(/([yrgao])(\d+)/g)) {
    const def = MARKS.find((m) => m.key === key);
    marks[key] = Math.min(def.max, Number(n));
  }
  return Object.keys(marks).length ? marks : undefined;
}

// 相手の得点は、試合結果の得点者（相手側「相手10番」）として残す。相手のオウンゴールは自チーム側「相手10番（OG）」。
// 相手のこまの印は、イエロー・レッド・アシストは相手の選手の印（p.marks）、ゴール・OG は得点者から数える
// 相手の呼び名：名前を入れていれば名前（得点者の欄で名前を書き換えると、相手のこまにも入る）、なければ「相手10番」
const oppLabel = (p) => p.name || `相手${p.number || ""}番`;
function oppMarksOf(p) {
  const name = oppLabel(p);
  const g = state.goals.filter((x) => x.side === "t" && x.name === name).length;
  const o = state.goals.filter((x) => x.side === "u" && x.name === `${name}（OG）`).length;
  const marks = { ...(p.marks || {}), ...(g ? { g } : {}), ...(o ? { o } : {}) };
  return Object.keys(marks).length ? marks : undefined;
}
// 印（カード・アシスト）を持っている選手がいるか（自チーム・相手）
const anyCardMarks = () => [...state.players, ...(state.opp || [])].some((p) => p.marks && Object.keys(p.marks).length);
// 自チームの選手のゴール・OG も、試合結果の得点者から数える（得点者が正。長押しで足すと得点者に入り、− で消える）。
// 選手の印 p.marks に持つのは、イエロー・レッド・アシストだけ
const GOAL_KEYS = ["g", "o"];
function goalMarksOf(p) {
  const name = playerLabel(p);
  const g = state.goals.filter((x) => x.side === "u" && x.name === name).length;
  const o = state.goals.filter((x) => x.side === "t" && x.name === `${name}（OG）`).length;
  return { ...(g ? { g } : {}), ...(o ? { o } : {}) };
}
// 盤・画像・リンクに出す印（イエロー・レッド・アシスト ＋ 得点者から数えたゴール・OG）
function playerMarksOf(p) {
  const marks = { ...(p.marks || {}) };
  GOAL_KEYS.forEach((k) => delete marks[k]);
  Object.assign(marks, goalMarksOf(p));
  return Object.keys(marks).length ? marks : undefined;
}
// 前の形（選手の印にゴール・OG を持っていた）や、リンクで渡された印のゴール・OG は、得点者に移す（足りない分だけ）
function moveGoalMarksToGoals() {
  let moved = false;
  state.players.forEach((p) => {
    if (!p.marks) return;
    const have = goalMarksOf(p);
    const name = playerLabel(p);
    for (let n = (Number(p.marks.g) || 0) - (have.g || 0); n > 0; n--) state.goals.push({ side: "u", min: "", name }), (moved = true);
    for (let n = (Number(p.marks.o) || 0) - (have.o || 0); n > 0; n--) state.goals.push({ side: "t", min: "", name: `${name}（OG）` }), (moved = true);
    GOAL_KEYS.forEach((k) => delete p.marks[k]);
    if (!Object.keys(p.marks).length) delete p.marks;
  });
  if (moved) {
    state.scoreUs = Math.max(Number(state.scoreUs) || 0, state.goals.filter((g) => g.side === "u").length);
    state.scoreThem = Math.max(Number(state.scoreThem) || 0, state.goals.filter((g) => g.side === "t").length);
  }
}
// 選手の呼び名が変わったら（背番号・名前を変えたとき）、得点者の名前もそろえる。
// side は選手のチーム（"u"＝自チーム・"t"＝相手）。その選手の得点（side 側）と、オウンゴール（反対側の「名前（OG）」）
function renameGoals(oldName, newName, side = "u") {
  if (!oldName || oldName === newName) return;
  const other = side === "u" ? "t" : "u";
  state.goals.forEach((g) => {
    if (g.side === side && g.name === oldName) g.name = newName;
    if (g.side === other && g.name === `${oldName}（OG）`) g.name = `${newName}（OG）`;
  });
}

// 得点者の欄で名前を書き換えたとき：その得点の選手（盤の自チーム・相手）の名前も変え、同じ選手のほかの得点もそろえる。
// g は書き換えた得点、oldName は書き換える前の名前。盤にその名前の選手がいなければ、その得点だけ変わる
function renameScorer(g, oldName) {
  const og = /（OG）$/.test(oldName);
  const base = (name) => String(name || "").replace(/（OG）$/, "");
  const from = base(oldName);
  const to = base(g.name);
  if (!from || !to || from === to) return;
  // OG はオウンゴールした選手のチーム（得点の反対側）、それ以外は得点した側
  const team = og ? (g.side === "u" ? "t" : "u") : g.side;
  const player = team === "u" ? state.players.find((p) => playerLabel(p) === from) : (state.opp || []).find((p) => oppLabel(p) === from);
  if (!player) return;
  g.name = og ? `${from}（OG）` : from; // いったん戻して、まとめてそろえる
  player.name = to.slice(0, 8);
  renameGoals(from, team === "u" ? playerLabel(player) : oppLabel(player), team);
}
// 交代前の選手（この丸から交代で出た選手）の得点（g）とオウンゴール（o）。印と同じ形 { g, o }（なければ undefined）。
// いまの選手と同じ名前（また入った選手）は、いまの印に入っているので数えない。team は "u"＝自チーム・"t"＝相手
function subGoalsOf(p, team = "u") {
  const label = team === "t" ? oppLabel : playerLabel;
  const now = label(p);
  const outs = new Set((p.subs || []).map((s) => label({ number: s.outNumber, name: s.outName })).filter((n) => n && n !== now));
  const other = team === "u" ? "t" : "u";
  const g = state.goals.filter((x) => x.side === team && outs.has(x.name)).length;
  const o = state.goals.filter((x) => x.side === other && outs.has(String(x.name).replace(/（OG）$/, "")) && /（OG）$/.test(x.name)).length;
  return g || o ? { ...(g ? { g } : {}), ...(o ? { o } : {}) } : undefined;
}
// 交代（結果のカードに「🔄 60' たなか → すずき」）。[[分, 出た選手, 入った選手], ...] を時間の順に
// 相手の交代は「相手 ジョン」「相手10番」のように、相手とわかる名前にする（相手を出しているときだけ）
function subsForResult() {
  const name = (number, n) => n || (number ? `${number}番` : "");
  const oppName = (number, n) => (n ? `相手 ${n}` : `相手${number || ""}番`);
  return [
    ...state.players.flatMap((p) => (p.subs || []).map((s) => [s.min || "", name(s.outNumber, s.outName), name(s.inNumber, s.inName)])),
    ...(state.showOpp ? (state.opp || []).flatMap((p) => (p.subs || []).map((s) => [s.min || "", oppName(s.outNumber, s.outName), oppName(s.inNumber, s.inName)])) : [])
  ].sort((a, b) => (parseInt(a[0], 10) || 0) - (parseInt(b[0], 10) || 0));
}
// 結果に使う選手の呼び名（名前がなければ「7番」）
const playerLabel = (p) => p.name || (p.number ? `${p.number}番` : "");
// 作戦盤の印から、結果のカードに入れるアシスト・カード（[[名前, 数], ...]・[["y"|"r", 名前, 数], ...]）
function marksForResult() {
  const assists = [];
  const cards = [];
  // 交代で出た選手のカード・アシストも（交代のときに残した印から）
  const outs = state.players.flatMap((p) => (p.subs || []).filter((s) => s.outMarks).map((s) => ({ number: s.outNumber, name: s.outName, marks: s.outMarks })));
  [...outs, ...state.players].forEach((p) => {
    const name = playerLabel(p);
    if (!name) return;
    if (Number(p.marks?.a) > 0) assists.push([name, Number(p.marks.a)]);
    if (Number(p.marks?.y) > 0) cards.push(["y", name, Number(p.marks.y)]);
    if (Number(p.marks?.r) > 0) cards.push(["r", name, 1]);
  });
  // 相手のカード・アシストも「相手10番」で入れる（相手を出しているときだけ。交代で出た相手の分も）
  const oppOuts = (state.opp || []).flatMap((p) => (p.subs || []).filter((s) => s.outMarks).map((s) => ({ number: s.outNumber, name: s.outName, marks: s.outMarks })));
  if (state.showOpp) [...oppOuts, ...(state.opp || [])].forEach((p) => {
    const name = oppLabel(p);
    if (Number(p.marks?.a) > 0) assists.push([name, Number(p.marks.a)]);
    if (Number(p.marks?.y) > 0) cards.push(["y", name, Number(p.marks.y)]);
    if (Number(p.marks?.r) > 0) cards.push(["r", name, 1]);
  });
  return { assists, cards };
}

function freshPlayers(mode, formation, old = [], versus = state.showOpp, shapes = lineShapesOf(formation)) {
  return formationPositions(mode, formation, versus, shapes).map((spot, i) => ({
    number: old[i]?.number ?? String(i + 1),
    name: old[i]?.name ?? "",
    ...(old[i]?.marks ? { marks: old[i].marks } : {}),
    ...spot
  }));
}

// ---- 状態（この端末に残す） ----
const load = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};
const save = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 残せなくても使える
  }
};

const state = Object.assign(
  {
    court: "soccer11",
    mode: "soccer",
    formation: "4-4-2",
    players: freshPlayers("soccer", "4-4-2", [], false),
    showOpp: false,
    showBall: false,
    oppLayout: "full", // 相手を出したときの並べ方："full"＝フルコート（互い違い）・"half"＝コート別（半分ずつ）
    showNames: true, // 盤・画像・リンクに選手の名前を出すか（👁️ 表示で切りかえ）
    courtView: "auto", // コートの向き（👁️ 表示）："auto"・"portrait"・"landscape"
    showMarks: true, // 盤・画像・リンクに得点・カードなどの印を出すか（👁️ 表示で切りかえ）
    ball: { x: 50, y: 50 },
    strokes: [],
    penColor: PEN_COLORS[0],
    team: "",
    opponent: "",
    whenDate: "",
    whenTime: "",
    where: "",
    lineupNote: "",
    scoreUs: 0,
    scoreThem: 0,
    halfUs: "",
    halfThem: "",
    secondUs: "",
    secondThem: "",
    extraUs: "",
    extraThem: "",
    pkUs: "",
    pkThem: "",
    oppFormation: "4-4-2",
    lineShapes: {}, // { "3-4-3": ["flat", "diamond", "front"] } 列ごとの形（フォーメーションごと）
    oppLineShapes: {}, // 相手の列ごとの形
    ourColor: "#22a447",
    oppColor: "#ffffff",
    goals: [],
    resultNote: ""
  },
  (() => {
    const saved = load(STORE_KEY, {});
    return saved && typeof saved === "object" && !Array.isArray(saved) && (saved.players === undefined || Array.isArray(saved.players)) ? saved : {};
  })()
);
let drawing = false; // ペンで描くモード（作戦盤の線）
// コートの向き：データ（選手・ボールの位置、線）はいつも縦のコートの % で持つ。
// 横のコートのときは、描くときとさわるときだけ 90° 回す（自陣が左、攻める向きが右）。
// state.courtView："auto"（横に広い画面なら横）・"portrait"（縦）・"landscape"（横）
let landscape = false;
const toView = (x, y) => (landscape ? [100 - y, x] : [x, y]);
const fromView = (vx, vy) => (landscape ? [vy, 100 - vx] : [vx, vy]);
const wideScreen = () => window.matchMedia("(min-aspect-ratio: 5/4) and (min-width: 600px)").matches;
function updateLandscape() {
  landscape = state.courtView === "landscape" || ((state.courtView || "auto") === "auto" && wideScreen());
  return landscape;
}
let viewMode = false; // 👁️ 表示：盤の下に、相手・ボール・選手名を出すかの欄を出す
let shapeMode = false; // 📐 並び：盤のすぐ下に人数・フォーメーション・列ごとの形を出す
let shapeSide = "ours"; // 📐 並びのタブ（"ours"＝自チーム・"opp"＝相手）

// 戻す：作戦盤の変更の前に、そのときの様子を残しておく（この画面を開いている間だけ）
const BOARD_KEYS = ["court", "mode", "formation", "oppFormation", "lineShapes", "oppLineShapes", "players", "opp", "ball", "showOpp", "oppLayout", "showBall", "strokes", "ourColor", "oppColor"];
const undoStack = [];
function remember() {
  undoStack.push(JSON.stringify(Object.fromEntries(BOARD_KEYS.map((k) => [k, state[k]]))));
  if (undoStack.length > 50) undoStack.shift();
}
function undo() {
  const last = undoStack.pop();
  if (!last) return;
  animateTokens = true;
  Object.assign(state, JSON.parse(last));
  selected.clear();
  render();
}
let roster = load(ROSTER_KEY, "");
// 日にち（2026-10-18）と時間（09:00）は別々に選ぶ。前の「日時」の自由入力は選択に入らないので捨てる
delete state.when;
if (!/^\d{4}-\d{2}-\d{2}$/.test(state.whenDate || "")) state.whenDate = "";
if (!/^\d{2}:\d{2}$/.test(state.whenTime || "")) state.whenTime = "";
// なくした欄の中身は、ひとことの行へ移す（控え → ひとこと（作戦盤）、MVP → ひとこと（結果））。タブもなくした
const subsLine = (subs) => (subs ? `控え：${subs}` : "");
const mvpLine = (mvp) => (mvp ? `MVP：${mvp}` : "");
const addLine = (text, line) => (line && !String(text || "").includes(line) ? [text, line].filter(Boolean).join("\n") : text || "");
state.lineupNote = addLine(state.lineupNote, subsLine(state.subs));
state.resultNote = addLine(state.resultNote, mvpLine(state.mvp));
delete state.subs;
delete state.mvp;
delete state.tab;
if (!courtDef(state.court) || courtDef(state.court).id !== state.court || courtDef(state.court).mode !== state.mode) state.court = courtOf(state.mode, state.formation, state.players.length);

// リンク（?data=）の中身は外から来たもの。形・長さ・数・位置の範囲を確かめてから使う
// （長さは入力欄と同じか少し多め。前の版のリンクも開けるように）
const LINK_LIMIT = { number: 4, name: 20, team: 20, note: 200, goals: 40, min: 6, strokes: 60, points: 400 };
const textIn = (v, max) => (typeof v === "string" || typeof v === "number" ? [...String(v)].slice(0, max).join("") : "");
const posIn = (v) => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 50;
};
const listIn = (v, max) => (Array.isArray(v) ? v.slice(0, max) : []);
// 点（空はそのまま空。数でなければ 0。0〜99）
const scoreIn = (v) => (v === "" || v === null || v === undefined ? "" : Math.min(99, Math.max(0, Math.floor(Number(v)) || 0)));
const hexIn = (v) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : "");
const formationIn = (v, count) => (typeof v === "string" && fieldCount(v) === count - 1 ? v : "");

// おくるんの「さくせん盤で直す」から戻ってきたとき
let openResultOnLoad = false;
applyQuery();
moveGoalMarksToGoals();

function applyQuery() {
  const q = new URLSearchParams(location.search);
  const data = readLinkData(q.get("data"));
  // 試合結果のリンク（?tab=result）からは、👕 チーム・試合結果の欄を開いて見せる（1ページになったのでタブはない）
  openResultOnLoad = q.get("tab") === "result";
  if (data?.lineup) {
    const d = data.lineup;
    Object.assign(state, { mode: d.mode, players: d.players, formation: d.formation, court: courtOf(d.mode, d.formation, d.players.length) });
    Object.assign(state, { team: d.team || state.team, opponent: d.opponent || state.opponent });
    // 前のリンクの控え（s）は、ひとこと（作戦盤）の行として入れる
    state.lineupNote = addLine(state.lineupNote, subsLine(d.subs));
    if (d.ourColor) state.ourColor = d.ourColor;
    // 画像のリンクからは、相手・ボール・線も戻す（スタメンのカードからは選手だけ）
    if (d.opp) {
      Object.assign(state, { opp: d.opp, oppFormation: d.oppFormation, showOpp: true });
      if (d.oppColor) state.oppColor = d.oppColor;
    }
    if (d.ball) Object.assign(state, { ball: d.ball, showBall: true });
    if (d.strokes) state.strokes = d.strokes;
  } else if (data?.result) {
    const { mvp, ...result } = data.result;
    Object.assign(state, { ...result, team: result.team || state.team, opponent: result.opponent || state.opponent });
    // 前のリンクの MVP は、ひとこと（結果）の行として入れる
    state.resultNote = addLine(state.resultNote, mvpLine(mvp));
  }
  if (q.has("data")) history.replaceState(null, "", location.pathname);
}

// ?data= の文字から、作戦盤（lineup）か試合結果（result）の中身を作る。読めない・形がちがうときは null
function readLinkData(text) {
  const data = decode(text);
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const L = LINK_LIMIT;
  if (Array.isArray(data.pl)) {
    const players = listIn(data.pl, MAX_PLAYERS)
      .filter(Array.isArray)
      .map((p) => {
        const marks = decodeMarks(textIn(p[4], 20));
        return { number: textIn(p[0], L.number), name: textIn(p[1], L.name), x: posIn(p[2]), y: posIn(p[3]), ...(marks ? { marks } : {}) };
      });
    if (!players.length) return null;
    const mode = data.m === "futsal" ? "futsal" : "soccer";
    const lineup = { mode, players, formation: formationIn(data.f, players.length), team: textIn(data.t, L.team), opponent: textIn(data.o, L.team), subs: textIn(data.s, L.note), ourColor: hexIn(data.c) };
    if (Array.isArray(data.op)) {
      // [x, y] だけのときは背番号が 1・2・3… の順。さくせん盤のカードからは [背番号, 名前, x, y]
      lineup.opp = listIn(data.op, MAX_PLAYERS)
        .filter(Array.isArray)
        .map((p, i) => {
          const [number, name, x, y] = p.length === 2 ? [String(i + 1), "", p[0], p[1]] : p.length === 3 ? [p[0], "", p[1], p[2]] : p;
          return { number: textIn(number, L.number), name: textIn(name, L.name), x: posIn(x), y: posIn(y) };
        });
      lineup.oppFormation = formationIn(data.of, lineup.opp.length);
      lineup.oppColor = hexIn(data.oc);
    }
    if (Array.isArray(data.b)) lineup.ball = { x: posIn(data.b[0]), y: posIn(data.b[1]) };
    if (Array.isArray(data.k)) {
      lineup.strokes = listIn(data.k, L.strokes)
        .filter((k) => Array.isArray(k) && Array.isArray(k[1]))
        .map(([color, flat]) => {
          const nums = listIn(flat, L.points * 2).map(posIn);
          const points = [];
          for (let i = 0; i + 1 < nums.length; i += 2) points.push([nums[i], nums[i + 1]]);
          return { color: hexIn(color) || "#ffffff", points };
        })
        .filter((k) => k.points.length > 1);
    }
    return { lineup };
  }
  if ("us" in data) {
    return {
      result: {
        team: textIn(data.t, L.team),
        opponent: textIn(data.o, L.team),
        scoreUs: scoreIn(data.us) || 0,
        scoreThem: scoreIn(data.th) || 0,
        halfUs: scoreIn(data.hu),
        halfThem: scoreIn(data.ht),
        secondUs: scoreIn(data.su),
        secondThem: scoreIn(data.st),
        extraUs: scoreIn(data.eu),
        extraThem: scoreIn(data.et),
        pkUs: scoreIn(data.pu),
        pkThem: scoreIn(data.pt),
        goals: listIn(data.g, L.goals)
          .filter(Array.isArray)
          .map((g) => ({ side: g[0] === "t" ? "t" : "u", min: textIn(g[1], L.min), name: textIn(g[2], L.name) })),
        mvp: textIn(data.mvp, L.name)
      }
    };
  }
  return null;
}

function encode(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decode(text) {
  if (!text) return null;
  try {
    const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0))));
  } catch {
    return null;
  }
}

// 日にち・時間をカード・画像に出す形にする（例：10/18（土）9:00。どちらかだけでもよい）
function whenText() {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(state.whenDate || "");
  const t = /^(\d{2}):(\d{2})$/.exec(state.whenTime || "");
  const date = d ? `${Number(d[2])}/${Number(d[3])}（${"日月火水木金土"[new Date(Number(d[1]), Number(d[2]) - 1, Number(d[3])).getDay()]}）` : "";
  const time = t ? `${Number(t[1])}:${t[2]}` : "";
  return `${date}${time}`;
}
