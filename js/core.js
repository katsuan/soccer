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
// 人数は変則もある（退場で10人、7人制など）。GK を入れて 2〜11 人
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 11;
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
// ユニフォームの色は見分けやすい3色にしぼる（紫・赤・白。白は相手の最初の色）。ほかの色はカスタムで
const TEAM_COLORS = [
  { label: "おくるん", hex: "#6c47ff" },
  { label: "ベリー", hex: "#e5484d" },
  { label: "白", hex: "#ffffff" }
];
const isLight = (hex) => {
  const n = parseInt(String(hex).slice(1), 16);
  return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114 > 170;
};
const inkOn = (hex) => (isLight(hex) ? "#23302a" : "#ffffff");
// カードの見出しの帯に使う色（白や黄色は帯にすると文字が読めないので、濃い緑にする）
const cardColor = () => (isLight(state.ourColor) ? "#2e8b4a" : state.ourColor);

// フォーメーションから位置を作る（GK が一番下、列は後ろから前へ）
// 自チームの GK と最前線の高さ（%）。相手がいないときはコート全体、相手を出すときは前を下げて相手と互い違いにする。
// ほかの列は、この2つの間で同じ割合の位置に動く（選手を動かしたあとでも、同じ割合で縮む・広がる）
const FULL = { gk: 90, front: 18 };
const VERSUS = { gk: 90, front: 33 };
const fitY = (y, from, to) => Math.round((to.gk - ((from.gk - y) * (to.gk - to.front)) / (from.gk - from.front)) * 10) / 10;

// versus：相手も出すとき。上から 相手GK → 相手DF → 自チームFW → 相手MF → 自チームMF → 相手FW → 自チームDF → 自チームGK の順に、
// 相手と互い違いに並ぶ高さ（相手は上下反対に置く）。FW を前に出しすぎないので、並べ直しが少なくて済む。
// 相手がいないときは、コート全体に広げる
function formationPositions(mode, formation, versus = true) {
  const parsed = parseFormation(formation);
  const lines = parsed.length ? parsed : parseFormation(mode === "futsal" ? "1-2-1" : "4-4-2");
  // コート全体に並べてから、相手を出すときは GK と最前線の高さに合わせて縦に縮める
  const spots = [{ x: 50, y: FULL.gk }];
  const back = 74;
  lines.forEach((count, i) => {
    const y = lines.length === 1 ? 46 : Math.round(back - ((back - FULL.front) * i) / (lines.length - 1));
    // 横の広がりは人数で変える（2人は中央寄り、4人以上はサイドいっぱい）
    const half = Math.min(mode === "futsal" ? 26 : 36, { 2: 16, 3: 26 }[count] ?? 36);
    const [left, right] = [50 - half, 50 + half];
    for (let j = 0; j < count; j += 1) {
      spots.push({ x: count === 1 ? 50 : Math.round(left + ((right - left) * j) / (count - 1)), y });
    }
  });
  return versus ? spots.map((spot) => ({ x: spot.x, y: fitY(spot.y, FULL, VERSUS) })) : spots;
}

function freshPlayers(mode, formation, old = [], versus = state.showOpp) {
  return formationPositions(mode, formation, versus).map((spot, i) => ({
    number: old[i]?.number ?? String(i + 1),
    name: old[i]?.name ?? "",
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
    tab: "lineup",
    court: "soccer11",
    mode: "soccer",
    formation: "4-4-2",
    players: freshPlayers("soccer", "4-4-2", [], false),
    showOpp: false,
    showBall: false,
    ball: { x: 50, y: 50 },
    strokes: [],
    penColor: PEN_COLORS[0],
    team: "",
    opponent: "",
    whenDate: "",
    whenTime: "",
    where: "",
    subs: "",
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
    ourColor: "#6c47ff",
    oppColor: "#ffffff",
    goals: [],
    mvp: "",
    resultNote: ""
  },
  load(STORE_KEY, {})
);
let drawing = false; // ペンで描くモード（作戦盤の線）
let editMode = false; // 選手の名前・背番号を変えるモード（それ以外のときは、タップは選ぶだけ）

// 戻す：作戦盤の変更の前に、そのときの様子を残しておく（この画面を開いている間だけ）
const BOARD_KEYS = ["court", "mode", "formation", "oppFormation", "players", "opp", "ball", "showOpp", "showBall", "strokes", "ourColor", "oppColor"];
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
if (!courtDef(state.court) || courtDef(state.court).id !== state.court || courtDef(state.court).mode !== state.mode) state.court = courtOf(state.mode, state.formation, state.players.length);

// おくるんの「さくせん盤で直す」から戻ってきたとき
applyQuery();

function applyQuery() {
  const q = new URLSearchParams(location.search);
  const data = decode(q.get("data"));
  if (q.get("tab") === "result") state.tab = "result";
  if (q.get("tab") === "lineup") state.tab = "lineup";
  if (data && Array.isArray(data.pl)) {
    state.mode = data.m === "futsal" ? "futsal" : "soccer";
    state.players = data.pl.slice(0, MAX_PLAYERS).map((p) => ({ number: String(p[0] ?? ""), name: String(p[1] ?? ""), x: Number(p[2]) || 50, y: Number(p[3]) || 50 }));
    state.formation = fieldCount(data.f) === state.players.length - 1 ? data.f : "";
    state.court = courtOf(state.mode, state.formation, state.players.length);
    Object.assign(state, { team: data.t || state.team, opponent: data.o || state.opponent, subs: data.s || "" });
    const hex = (v) => (/^#[0-9a-f]{6}$/i.test(v || "") ? v.toLowerCase() : "");
    if (hex(data.c)) state.ourColor = hex(data.c);
    // 画像のリンクからは、相手・ボール・線も戻す（スタメンのカードからは選手だけ）
    if (Array.isArray(data.op)) {
      // [x, y] だけのときは背番号が 1・2・3… の順
      state.opp = data.op.slice(0, MAX_PLAYERS).map((p, i) => {
        const [number, x, y] = p.length === 2 ? [String(i + 1), p[0], p[1]] : p;
        return { number: String(number ?? ""), name: "", x: Number(x) || 50, y: Number(y) || 50 };
      });
      state.oppFormation = fieldCount(data.of) === state.opp.length - 1 ? data.of : "";
      state.showOpp = true;
      if (hex(data.oc)) state.oppColor = hex(data.oc);
    }
    if (Array.isArray(data.b)) {
      state.ball = { x: Number(data.b[0]) || 50, y: Number(data.b[1]) || 50 };
      state.showBall = true;
    }
    if (Array.isArray(data.k)) {
      state.strokes = data.k
        .filter((k) => Array.isArray(k) && Array.isArray(k[1]))
        .map(([color, flat]) => ({ color: hex(color) || "#ffffff", points: flat.reduce((pts, v, i) => (i % 2 ? (pts[pts.length - 1].push(Number(v) || 0), pts) : [...pts, [Number(v) || 0]]), []) }))
        .filter((k) => k.points.length > 1);
    }
  } else if (data && "us" in data) {
    Object.assign(state, {
      team: data.t || state.team,
      opponent: data.o || state.opponent,
      scoreUs: data.us,
      scoreThem: data.th,
      halfUs: data.hu ?? "",
      halfThem: data.ht ?? "",
      secondUs: data.su ?? "",
      secondThem: data.st ?? "",
      extraUs: data.eu ?? "",
      extraThem: data.et ?? "",
      pkUs: data.pu ?? "",
      pkThem: data.pt ?? "",
      goals: (data.g || []).map((g) => ({ side: g[0], min: g[1], name: g[2] })),
      mvp: data.mvp || ""
    });
  }
  if (q.has("data")) history.replaceState(null, "", location.pathname);
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
