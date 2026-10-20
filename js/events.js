// さくせん盤：操作（ボタン・入力）
// ファイルは index.html に書いた順（core → board → ink → tactics → sheets → share → events → app.js）に読み、同じ範囲の変数（state など）を使う
"use strict";

// ---- 操作 ----
for (const tab of document.querySelectorAll(".tab")) {
  tab.addEventListener("click", () => {
    state.tab = tab.dataset.tab;
    render();
  });
}
$("courtSelect").addEventListener("change", (event) => {
  const court = courtDef(event.target.value);
  remember();
  animateTokens = true;
  if (court.mode !== state.mode) state.strokes = []; // ピッチが変わるときは線を消す
  state.court = court.id;
  state.mode = court.mode;
  state.formation = court.list[0];
  state.oppFormation = court.list[0];
  state.players = freshPlayers(court.mode, court.list[0], state.players);
  state.opp = opponents();
  selected.clear();
  render();
});
// 👁 表示：ボール・選手名を出す／出さない
const setShowBall = (on) => {
  if (state.showBall === on) return;
  remember();
  state.showBall = on;
  render();
};
$("ballOn").addEventListener("click", () => setShowBall(true));
$("ballOff").addEventListener("click", () => setShowBall(false));
const setShowNames = (on) => {
  state.showNames = on;
  render();
};
$("namesOn").addEventListener("click", () => setShowNames(true));
$("namesOff").addEventListener("click", () => setShowNames(false));
// 📐 並びのタブ（自チーム・相手）
$("shapeTabOurs").addEventListener("click", () => {
  shapeSide = "ours";
  render();
});
$("shapeTabOpp").addEventListener("click", () => {
  shapeSide = "opp";
  render();
});
// 盤の下の欄（表示・並び・ペンの色）は、どれか1つだけ開く
$("toggleView").addEventListener("click", () => {
  viewMode = !viewMode;
  if (viewMode) drawing = shapeMode = false;
  render();
});
$("toggleShape").addEventListener("click", () => {
  shapeMode = !shapeMode;
  if (shapeMode) drawing = viewMode = false;
  render();
});
$("togglePen").addEventListener("click", () => {
  drawing = !drawing;
  if (drawing) {
    editMode = false;
    shapeMode = false;
    viewMode = false;
  }
  render();
});
$("toggleEdit").addEventListener("click", () => {
  editMode = !editMode;
  if (editMode) drawing = false;
  selected.clear();
  render();
});
// 👁 表示 →「相手」：出さない／フルコート／コート別。消しても、前に並べた相手（人数・位置）は残す
$("oppLayoutNone").addEventListener("click", () => {
  if (!state.showOpp) return;
  remember();
  setShowOpp(false);
  render();
});
const showOppAs = (layout) => {
  if (state.showOpp) return setOppLayout(layout);
  remember();
  state.oppLayout = layout;
  setShowOpp(true);
  render();
};
$("oppLayoutFull").addEventListener("click", () => showOppAs("full"));
$("oppLayoutHalf").addEventListener("click", () => showOppAs("half"));
$("undo").addEventListener("click", undo);
// 相手の人数を1人ずつ変える（ほかの相手の位置はそのまま）
$("addOpp").addEventListener("click", () => {
  if (oppTotal() >= MAX_PLAYERS) return;
  remember();
  if (!Array.isArray(state.opp)) state.opp = opponents();
  const used = new Set(state.opp.map((p) => p.number));
  let number = 1;
  while (used.has(String(number))) number += 1;
  const all = [...state.players, ...state.opp];
  const spot = [50, 65, 35, 80, 20].map((x) => ({ x, y: 40 })).find((c) => all.every((p) => Math.hypot(p.x - c.x, p.y - c.y) > 8)) || { x: 50, y: 40 };
  state.opp.push({ number: String(number), name: "", ...spot });
  state.oppFormation = "";
  setShowOpp(true);
  render();
});
$("removeOpp").addEventListener("click", () => {
  if (oppTotal() <= MIN_PLAYERS) return;
  remember();
  if (!Array.isArray(state.opp)) state.opp = opponents();
  state.opp.pop();
  state.oppFormation = "";
  setShowOpp(true);
  selected.clear();
  render();
});
$("saveTactic").addEventListener("click", saveTactic);
$("tacticName").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.isComposing) saveTactic();
});
// 人数を1人ずつ変える（ほかの選手の位置はそのまま。決まったフォーメーションからは外れる）
$("addPlayer").addEventListener("click", () => {
  if (state.players.length >= MAX_PLAYERS) return;
  remember();
  const used = new Set(state.players.map((p) => p.number));
  let number = 1;
  while (used.has(String(number))) number += 1;
  // 空いている所に置く（真ん中から左右へ）
  const spot = [50, 35, 65, 20, 80].map((x) => ({ x, y: 50 })).find((c) => state.players.every((p) => Math.hypot(p.x - c.x, p.y - c.y) > 8)) || { x: 50, y: 50 };
  state.players.push({ number: String(number), name: "", ...spot });
  state.formation = "";
  render();
});
$("removePlayer").addEventListener("click", () => {
  if (state.players.length <= MIN_PLAYERS) return;
  remember();
  state.players.pop();
  state.formation = "";
  selected.clear();
  render();
});
$("inkClear").addEventListener("click", () => {
  if (!state.strokes.length) return;
  remember();
  state.strokes = [];
  render();
});
$("resetPositions").addEventListener("click", () => {
  remember();
  animateTokens = true;
  state.players = freshPlayers(state.mode, state.formation || autoFormation(state.players.length - 1), state.players);
  state.opp = opponents();
  state.ball = { x: 50, y: 50 };
  selected.clear();
  render();
});
// LINE で共有：カードか画像かを選ぶシート
const shareSheet = $("shareSheet");
$("shareLineup").addEventListener("click", () => {
  $("sendLineup").href = lineupCardUrl();
  $("imageStatus").textContent = "";
  shareSheet.hidden = false;
});
$("shareCancel").addEventListener("click", () => (shareSheet.hidden = true));
shareSheet.addEventListener("click", (e) => {
  if (e.target === shareSheet && !$("sendBoardImage").disabled) shareSheet.hidden = true;
});
$("saveBoard").addEventListener("click", saveBoardImage);
$("sendBoardImage").addEventListener("click", sendBoardImage);

// 入力欄（チーム名などは2つのタブで共通。同じクラスの欄をそろえる）
const shared = { team: ".team", opponent: ".opponent", whenDate: ".when-date", whenTime: ".when-time", where: ".where" };
for (const [key, selector] of Object.entries(shared)) {
  for (const input of document.querySelectorAll(selector)) {
    input.value = state[key];
    input.addEventListener("input", () => {
      state[key] = input.value.trim();
      document.querySelectorAll(selector).forEach((other) => other !== input && (other.value = input.value));
      render();
    });
  }
}
const single = { subs: "subs", lineupNote: "lineupNote", mvp: "mvp", resultNote: "resultNote", scoreUs: "scoreUs", scoreThem: "scoreThem", halfUs: "halfUs", halfThem: "halfThem",
  secondUs: "secondUs", secondThem: "secondThem", extraUs: "extraUs", extraThem: "extraThem", pkUs: "pkUs", pkThem: "pkThem" };
for (const [key, id] of Object.entries(single)) {
  $(id).value = state[key];
  $(id).addEventListener("input", () => {
    state[key] = $(id).value.trim();
    render();
  });
}
$("roster").value = roster;
$("roster").addEventListener("input", () => {
  roster = $("roster").value;
  save(ROSTER_KEY, roster);
  render();
});
$("addGoalUs").addEventListener("click", () => {
  state.goals.push({ side: "u", min: "", name: "" });
  state.scoreUs = state.goals.filter((g) => g.side === "u").length;
  $("scoreUs").value = state.scoreUs;
  render();
});
$("addGoalThem").addEventListener("click", () => {
  state.goals.push({ side: "t", min: "", name: "" });
  state.scoreThem = state.goals.filter((g) => g.side === "t").length;
  $("scoreThem").value = state.scoreThem;
  render();
});
// 送る直前に最新のリンクにする
$("sendLineup").addEventListener("click", () => ($("sendLineup").href = lineupCardUrl()));
$("sendResult").addEventListener("click", () => ($("sendResult").href = resultCardUrl()));
window.addEventListener("resize", drawInk);
