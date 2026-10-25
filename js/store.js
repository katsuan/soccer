// さくせん盤：覚えておくこと（state）。この端末に残す・端末やリンクの中身の形の確かめ・保存した作戦の形・戻す
// ファイルは index.html に書いた順（page → formation → marks → store → link → board → ink → tactics → sheets → card → image → events → app.js）に読み、同じ範囲の変数（state など）を使う
"use strict";

const STORE_KEY = "soccer:state";
const ROSTER_KEY = "soccer:roster";

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

// 端末に残った中身は、前の版・ろくが（チーム名・色だけ書く）・壊れたものもあるので、1つずつ形を確かめてから使う。
// 形のちがうものは捨てて初めの値に（選手・得点・線は、読めるものだけ残す）
const isObj = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const marksIn = (v) => (isObj(v) ? decodeMarks(encodeMarks(v)) : undefined);
const subIn = (s) => ({
  min: textIn(s.min, LINK_LIMIT.min),
  outNumber: textIn(s.outNumber, LINK_LIMIT.number),
  outName: textIn(s.outName, LINK_LIMIT.name),
  inNumber: textIn(s.inNumber, LINK_LIMIT.number),
  inName: textIn(s.inName, LINK_LIMIT.name),
  ...(marksIn(s.outMarks) ? { outMarks: marksIn(s.outMarks) } : {})
});
const pieceIn = (p) => {
  const subs = listIn(p.subs, 40).filter(isObj).map(subIn);
  return {
    number: textIn(p.number, LINK_LIMIT.number),
    name: textIn(p.name, LINK_LIMIT.name),
    x: posIn(p.x),
    y: posIn(p.y),
    ...(marksIn(p.marks) ? { marks: marksIn(p.marks) } : {}),
    ...(subs.length ? { subs } : {})
  };
};
const piecesIn = (v) => listIn(v, MAX_PLAYERS).filter(isObj).map(pieceIn);
function cleanSaved(saved, base) {
  if (!isObj(saved)) return {};
  const out = {};
  for (const [key, value] of Object.entries(saved)) {
    const want = base[key];
    if (want === undefined) out[key] = value; // 前の版の欄（控え・MVP など。下で移す）
    else if (typeof want === "boolean") out[key] = value === true || (value === false ? false : want);
    else if (typeof want === "string") out[key] = typeof value === "string" ? value : want;
    else if (isObj(want)) out[key] = isObj(value) ? value : want;
  }
  const players = piecesIn(saved.players);
  if (players.length >= MIN_PLAYERS) out.players = players;
  if (Array.isArray(saved.opp)) out.opp = piecesIn(saved.opp);
  else delete out.opp;
  out.goals = listIn(saved.goals, 200)
    .filter(isObj)
    .map((g) => ({ side: g.side === "t" ? "t" : "u", min: textIn(g.min, LINK_LIMIT.min), name: textIn(g.name, LINK_LIMIT.name + 4) }));
  out.strokes = listIn(saved.strokes, 200)
    .filter((k) => isObj(k) && Array.isArray(k.points))
    .map((k) => ({ color: hexIn(k.color) || "#ffffff", points: k.points.filter((pt) => Array.isArray(pt) && pt.slice(0, 2).every(Number.isFinite)).map(([x, y]) => [x, y]) })) // 盤の外まで引いた線もそのまま
    .filter((k) => k.points.length > 1);
  out.ball = isObj(saved.ball) ? { x: posIn(saved.ball.x), y: posIn(saved.ball.y) } : { ...base.ball };
  out.ourColor = hexIn(saved.ourColor) || base.ourColor;
  out.oppColor = hexIn(saved.oppColor) || base.oppColor;
  out.penColor = PEN_COLORS.includes(saved.penColor) ? saved.penColor : base.penColor;
  out.mode = saved.mode === "futsal" ? "futsal" : "soccer";
  if (!parseFormation(out.formation).length) out.formation = out.mode === "futsal" ? "1-2-1" : base.formation;
  if (!parseFormation(out.oppFormation).length) out.oppFormation = base.oppFormation;
  out.scoreUs = scoreIn(saved.scoreUs) || 0;
  out.scoreThem = scoreIn(saved.scoreThem) || 0;
  ["halfUs", "halfThem", "secondUs", "secondThem", "extraUs", "extraThem", "pkUs", "pkThem"].forEach((k) => (out[k] = scoreIn(saved[k])));
  return out;
}

// 保存した作戦（soccer:tactics）：[{ id, name, savedAt, board: 盤の中身 }]。盤の中身も state と同じに確かめる
const TACTIC_KEYS = ["court", "mode", "formation", "oppFormation", "lineShapes", "oppLineShapes", "players", "opp", "ball", "showOpp", "oppLayout", "showBall", "strokes"];
function tacticsIn(list) {
  return listIn(list, 100)
    .filter((t) => isObj(t) && isObj(t.board))
    .map((t, i) => {
      const board = cleanSaved(t.board, STATE_BASE);
      return {
        id: textIn(t.id, 40) || `t${i}`,
        name: textIn(t.name, 20) || "作戦",
        savedAt: Number(t.savedAt) || 0,
        board: Object.fromEntries(TACTIC_KEYS.filter((k) => k in board).map((k) => [k, board[k]]))
      };
    });
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

const STATE_BASE = {
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
};
const state = Object.assign(JSON.parse(JSON.stringify(STATE_BASE)), cleanSaved(load(STORE_KEY, {}), STATE_BASE));

// 戻す：作戦盤の変更の前に、そのときの様子を残しておく（この画面を開いている間だけ）
const BOARD_KEYS = [...TACTIC_KEYS, "ourColor", "oppColor"]; // 作戦の保存に入れるもの ＋ チームの色
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
