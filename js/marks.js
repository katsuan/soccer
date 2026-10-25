// さくせん盤：選手の印（イエロー・レッド・ゴール・アシスト）と、得点者・交代・結果のカードに入れる名前
// ファイルは index.html に書いた順（page → formation → marks → store → link → board → ink → tactics → sheets → card → image → events → app.js）に読み、同じ範囲の変数（state など）を使う
"use strict";

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
// リンクの短い形（「y1g2」）から印（{ y: 1, g: 2 }）にもどす。印がなければ undefined
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
// 相手の選手の印を返す（イエロー・レッド・アシストは選手の印、ゴール・OG は得点者から数える）
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
// 自チームの選手のゴール・OG の数を、得点者から数えて返す
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
  // 名前から「（OG）」を外す
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
  // 自チームの選手の呼び名（名前、なければ「7番」）を返す
  const name = (number, n) => n || (number ? `${number}番` : "");
  // 相手の選手の呼び名（「相手 ジョン」「相手10番」）を返す
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
  const outsOf = (list) => list.flatMap((p) => (p.subs || []).filter((s) => s.outMarks).map((s) => ({ number: s.outNumber, name: s.outName, marks: s.outMarks })));
  // 選手のならび（交代で出た選手もふくむ）のアシスト・カードを、結果に足す
  const add = (list, label) =>
    [...outsOf(list), ...list].forEach((p) => {
      const name = label(p);
      if (!name) return;
      if (Number(p.marks?.a) > 0) assists.push([name, Number(p.marks.a)]);
      if (Number(p.marks?.y) > 0) cards.push(["y", name, Number(p.marks.y)]);
      if (Number(p.marks?.r) > 0) cards.push(["r", name, 1]);
    });
  add(state.players, playerLabel);
  // 相手のカード・アシストも「相手10番」で入れる（相手を出しているときだけ。交代で出た相手の分も）
  if (state.showOpp) add(state.opp || [], oppLabel);
  return { assists, cards };
}
