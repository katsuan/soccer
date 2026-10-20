// さくせん盤：操作（ボタン・入力）
// ファイルは index.html に書いた順（core → board → ink → tactics → sheets → share → events → app.js）に読み、同じ範囲の変数（state など）を使う
"use strict";

// ---- 操作 ----
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
// 👁️ 表示：ボール・選手名を出す／出さない
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
// 印だけを全員分消す（次の試合の前など）。名前・背番号・位置はそのまま。「戻す」で元に戻せる
$("clearMarks").addEventListener("click", () => {
  remember();
  state.players.forEach((p) => delete p.marks);
  render();
});
// 得点・アシスト・カードなどの印
document.querySelectorAll("[data-marks]").forEach((b) =>
  b.addEventListener("click", () => {
    state.showMarks = b.dataset.marks === "on";
    render();
  })
);
// 👁️ 表示の「選手名」
document.querySelectorAll("[data-names]").forEach((b) => b.addEventListener("click", () => setShowNames(b.dataset.names === "on")));
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
    shapeMode = false;
    viewMode = false;
  }
  render();
});
// 👁️ 表示 →「相手」：出さない／フルコート／コート別。消しても、前に並べた相手（人数・位置）は残す
$("oppLayoutNone").addEventListener("click", () => {
  if (!state.showOpp) return;
  remember();
  setShowOpp(false);
  render();
});
const showOppAs = (layout) => {
  if (state.showOpp) return setOppLayout(layout);
  remember();
  // 出していない間に残っている相手は、前に出していたときの並べ方の位置。
  // 並べ方を変えて出すときは、その並べ方の高さに直す（コート別なのに相手が自陣に入り込まないように）
  const from = versusFrame();
  state.oppLayout = layout;
  const to = versusFrame();
  if (from !== to && Array.isArray(state.opp)) state.opp = state.opp.map((p) => ({ ...p, y: Math.min(98, Math.max(2, 100 - fitY(100 - p.y, from, to))) }));
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
  // 足した選手は真ん中あたり。コート別で相手を出しているときは自陣（下半分）に置く
  const y = state.showOpp && state.oppLayout === "half" ? 62 : 50;
  const spot = [50, 35, 65, 20, 80].map((x) => ({ x, y })).find((c) => state.players.every((p) => Math.hypot(p.x - c.x, p.y - c.y) > 8)) || { x: 50, y };
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
// LINE で共有：スタメンのカード・作戦の画像・試合結果のカードから選ぶシート
const shareSheet = $("shareSheet");
$("shareLineup").addEventListener("click", () => {
  // 試合結果を入れてあれば、最初から2枚（メンバー・試合結果）を選んでおく
  $("pickLineup").checked = true;
  $("pickResult").checked = hasResult();
  // 送る前のプレビュー：それぞれのカードに入る中身を短く
  $("previewLineup").replaceChildren(lineupPreviewEl());
  $("previewResult").replaceChildren(hasResult() ? resultPreviewEl() : el("p", "cp-empty", "まだ入れていません（「👕 チーム・試合結果」の欄で入れます）"));
  updateSendCards();
  $("imageStatus").textContent = "";
  shareSheet.hidden = false;
});
$("shareCancel").addEventListener("click", () => (shareSheet.hidden = true));
shareSheet.addEventListener("click", (e) => {
  if (e.target === shareSheet && !$("sendBoardImage").disabled) shareSheet.hidden = true;
});
$("saveBoard").addEventListener("click", saveBoardImage);
$("sendBoardImage").addEventListener("click", sendBoardImage);

// 入力欄（同じクラスの欄があればそろえる）
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
const single = { lineupNote: "lineupNote", resultNote: "resultNote", scoreUs: "scoreUs", scoreThem: "scoreThem", halfUs: "halfUs", halfThem: "halfThem",
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
// 作戦盤の印（ゴール・オウンゴール）から得点者を作り直す。
// 前に入れた時間は、同じ名前の得点に引き継ぐ。相手の得点者（手で入れたもの。オウンゴール以外）は残す。
// スコアは、得点者の数より少なければ増やす（名前のわからない得点を手で入れていることもあるので減らさない）
$("goalsFromMarks").addEventListener("click", () => {
  const old = state.goals;
  const used = new Set();
  const minOf = (side, name) => {
    const i = old.findIndex((g, j) => !used.has(j) && g.side === side && g.name === name);
    if (i < 0) return "";
    used.add(i);
    return old[i].min || "";
  };
  const goals = [];
  state.players.forEach((p) => {
    const name = playerLabel(p);
    for (let n = Number(p.marks?.g) || 0; n > 0; n--) goals.push({ side: "u", min: minOf("u", name), name });
    const og = `${name}（OG）`;
    for (let n = Number(p.marks?.o) || 0; n > 0; n--) goals.push({ side: "t", min: minOf("t", og), name: og });
  });
  old.forEach((g, j) => {
    if (g.side === "t" && !used.has(j) && !/（OG）$/.test(g.name || "")) goals.push(g);
  });
  state.goals = goals;
  syncScore(old);
  render();
});
// 試合結果をリセット：スコア・内訳・得点者・ひとこと（結果）を消す（チーム名・色はそのまま）。
// 作戦盤に得点・カードの印があれば、それも消すかを続けて聞く
$("resetResult").addEventListener("click", () => {
  if (!confirm("スコア・内訳・得点者・ひとこと（結果）を消しますか？（チーム名・色はそのまま）")) return;
  const fields = ["scoreUs", "scoreThem", "halfUs", "halfThem", "secondUs", "secondThem", "extraUs", "extraThem", "pkUs", "pkThem", "resultNote"];
  fields.forEach((k) => {
    state[k] = k === "scoreUs" || k === "scoreThem" ? 0 : "";
    $(k).value = state[k];
  });
  state.goals = [];
  if (state.players.some((p) => p.marks) && confirm("作戦盤の得点・カードの印も消しますか？")) {
    remember();
    state.players.forEach((p) => delete p.marks);
  }
  render();
});
$("venueAction").addEventListener("click", () => (venues.includes(String(state.where || "").trim()) ? removeVenue() : saveVenue()));
$("venueSelect").addEventListener("change", (e) => {
  if (e.target.value) applyVenue(e.target.value);
});
// スコアの − ＋（0〜99）。得点者は変えない（得点者を足す・消すと、スコアのほうが合わせて動く）
document.querySelectorAll("[data-score]").forEach((b) =>
  b.addEventListener("click", () => {
    const key = b.dataset.score;
    state[key] = Math.min(99, Math.max(0, (Number(state[key]) || 0) + Number(b.dataset.delta)));
    $(key).value = state[key];
    render();
  })
);
const addGoal = (side) => {
  const before = [...state.goals];
  state.goals.push({ side, min: "", name: "" });
  syncScore(before);
  render();
};
$("addGoalUs").addEventListener("click", () => addGoal("u"));
$("addGoalThem").addEventListener("click", () => addGoal("t"));
// ひとことのひな形：タップで次の行に足し、そのまま続きを打てるようにする
document.querySelectorAll("[data-note]").forEach((b) =>
  b.addEventListener("click", () => {
    const box = $(b.dataset.note);
    const text = box.value.replace(/\s+$/, "");
    box.value = text ? `${text}\n${b.dataset.text}` : b.dataset.text;
    box.dispatchEvent(new Event("input"));
    box.focus();
    box.setSelectionRange(box.value.length, box.value.length);
  })
);
// はじめて開いた人への案内（この端末で一度「わかった」を押したら出さない）
const TIP_KEY = "soccer:tip-seen";
$("firstTip").hidden = Boolean(load(TIP_KEY, false));
$("firstTipClose").addEventListener("click", () => {
  save(TIP_KEY, true);
  $("firstTip").hidden = true;
});
// 送る直前に最新のリンクにする
// 送るカードの選択：ボタンに枚数を出し、選んでいなければ押せなくする。押す直前に最新のリンクにする
function updateSendCards() {
  const picks = { lineup: $("pickLineup").checked, result: $("pickResult").checked };
  const count = Object.values(picks).filter(Boolean).length;
  const send = $("sendCards");
  send.textContent = count ? `💬 カードで送る（${count}枚）` : "💬 送るカードを選んでください";
  send.classList.toggle("is-disabled", !count);
  send.setAttribute("aria-disabled", String(!count));
  send.href = count ? cardsUrl(picks) : "#";
}
$("pickLineup").addEventListener("change", updateSendCards);
$("pickResult").addEventListener("change", updateSendCards);
$("sendCards").addEventListener("click", (e) => {
  if ($("sendCards").getAttribute("aria-disabled") === "true") return e.preventDefault();
  updateSendCards();
});
window.addEventListener("resize", drawInk);
