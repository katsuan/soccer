// さくせん盤：選手の入力シート・結果の得点
// ファイルは index.html に書いた順（core → board → ink → tactics → sheets → share → events → app.js）に読み、同じ範囲の変数（state など）を使う
"use strict";

// ---- 選手の入力シート ----
let editing = -1;

function parseRoster() {
  return String(roster)
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const m = /^(\d{1,3})\s*[　\s]\s*(.+)$/.exec(line);
      return m ? { number: m[1], name: m[2].slice(0, 8) } : { number: "", name: line.slice(0, 8) };
    });
}

// 選手のシートで入れている印（決定まで state には書かない）
let editingMarks = {};

function renderPlayerMarks() {
  $("playerMarks").replaceChildren(
    ...MARKS.map(({ key, icon, label, max, red }) => {
      const row = document.createElement("div");
      row.className = "mark-row";
      const name = Object.assign(document.createElement("span"), { className: "mark-label", textContent: `${icon} ${label}` });
      // オウンゴールは盤・画像と同じ赤いボール（share.js の redBallDataUrl）
      if (red) name.replaceChildren(Object.assign(document.createElement("img"), { className: "is-own-goal", src: redBallDataUrl(), alt: "" }), ` ${label}`);
      const n = Number(editingMarks[key]) || 0;
      const step = (delta) => {
        editingMarks[key] = Math.min(max, Math.max(0, n + delta));
        renderPlayerMarks();
      };
      const minus = Object.assign(document.createElement("button"), { type: "button", textContent: "−", disabled: n <= 0 });
      minus.setAttribute("aria-label", `${label}を減らす`);
      minus.addEventListener("click", () => step(-1));
      const count = Object.assign(document.createElement("span"), { className: "mark-count", textContent: String(n) });
      const plus = Object.assign(document.createElement("button"), { type: "button", textContent: "＋", disabled: n >= max });
      plus.setAttribute("aria-label", `${label}を増やす`);
      plus.addEventListener("click", () => step(1));
      const stepper = document.createElement("div");
      stepper.className = "stepper mark-stepper";
      stepper.append(minus, count, plus);
      row.append(name, stepper);
      return row;
    })
  );
}

// ---- 長押しのメニュー：印をその場で増やす・減らす（試合中に片手で記録する用。得点の取り消しもここで）。
// 選手のシートと同じ − 数 ＋ の並び。押すたびにすぐ盤に出る。「↩️ 戻す」でも戻せる ----
let quickIndex = -1;

function renderQuickMarks() {
  const p = state.players[quickIndex];
  if (!p) return closeQuickMarks();
  const title = Object.assign(document.createElement("p"), { className: "quick-title", textContent: `${p.number || ""} ${p.name || ""}`.trim() || `${quickIndex + 1}人目` });
  const close = Object.assign(document.createElement("button"), { type: "button", className: "quick-close", textContent: "×" });
  close.setAttribute("aria-label", "閉じる");
  close.addEventListener("click", closeQuickMarks);
  const head = Object.assign(document.createElement("div"), { className: "quick-head" });
  head.append(title, close);
  const rows = MARKS.map(({ key, icon, label, max, red }) => {
    const n = Number(p.marks?.[key]) || 0;
    const row = Object.assign(document.createElement("div"), { className: "mark-row" });
    const name = Object.assign(document.createElement("span"), { className: "mark-label", textContent: `${icon} ${label}` });
    if (red) name.replaceChildren(Object.assign(document.createElement("img"), { className: "is-own-goal", src: redBallDataUrl(), alt: "" }), ` ${label}`);
    const step = (delta) => {
      remember();
      const marks = { ...(p.marks || {}), [key]: Math.min(max, Math.max(0, n + delta)) };
      Object.keys(marks).forEach((k) => !marks[k] && delete marks[k]);
      if (Object.keys(marks).length) p.marks = marks;
      else delete p.marks;
      render();
      renderQuickMarks();
    };
    const minus = Object.assign(document.createElement("button"), { type: "button", textContent: "−", disabled: n <= 0 });
    minus.setAttribute("aria-label", `${label}を減らす`);
    minus.addEventListener("click", () => step(-1));
    const count = Object.assign(document.createElement("span"), { className: "mark-count", textContent: String(n) });
    const plus = Object.assign(document.createElement("button"), { type: "button", textContent: "＋", disabled: n >= max });
    plus.setAttribute("aria-label", `${label}を増やす`);
    plus.addEventListener("click", () => step(1));
    const stepper = Object.assign(document.createElement("div"), { className: "stepper mark-stepper" });
    stepper.append(minus, count, plus);
    row.append(name, stepper);
    return row;
  });
  const more = Object.assign(document.createElement("button"), { type: "button", className: "quick-more", textContent: "✏️ 名前・背番号を変える" });
  more.addEventListener("click", () => {
    const index = quickIndex;
    closeQuickMarks();
    openPlayer(index);
  });
  $("quickMarks").replaceChildren(head, ...rows, more);
}

function openQuickMarks(index, el) {
  quickIndex = index;
  const menu = $("quickMarks");
  renderQuickMarks();
  // 丸の下（入らなければ上）に、画面からはみ出さないように置く
  menu.hidden = false;
  const r = el.getBoundingClientRect();
  const w = menu.offsetWidth;
  const h = menu.offsetHeight;
  const left = Math.min(window.innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2));
  const below = r.top + 36;
  const top = below + h + 8 <= window.innerHeight ? below : Math.max(8, Math.min(window.innerHeight - h - 8, r.top - h - 4));
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
}

function closeQuickMarks() {
  quickIndex = -1;
  $("quickMarks").hidden = true;
}
// メニューの外を触る・画面を動かすと閉じる
document.addEventListener("pointerdown", (e) => {
  if (!$("quickMarks").hidden && !$("quickMarks").contains(e.target)) closeQuickMarks();
}, true);
window.addEventListener("scroll", closeQuickMarks, { passive: true });

function openPlayer(index) {
  editing = index;
  const p = state.players[index];
  editingMarks = { ...(p.marks || {}) };
  renderPlayerMarks();
  $("playerSheetTitle").textContent = index === 0 ? "GK" : `${index + 1}人目`;
  $("playerNumber").value = p.number;
  $("playerName").value = p.name;
  const used = new Set(state.players.map((x) => x.name).filter(Boolean));
  $("rosterChips").replaceChildren(
    ...parseRoster().map((person) => {
      const b = chip(`${person.number ? `${person.number} ` : ""}${person.name}`, false, () => {
        $("playerNumber").value = person.number;
        $("playerName").value = person.name;
      });
      if (used.has(person.name) && person.name !== p.name) b.style.opacity = "0.45";
      return b;
    })
  );
  $("playerSheet").hidden = false;
  $("playerName").focus();
}

$("playerDone").addEventListener("click", () => {
  // 入力中に人数を変えたときなど、もういない選手には書かない
  if (state.players[editing]) {
    remember();
    state.players[editing].number = $("playerNumber").value.trim().slice(0, 3);
    state.players[editing].name = $("playerName").value.trim().slice(0, 8);
    // 印は、1つでもあれば残す（全部 0 なら消す）
    const marks = Object.fromEntries(Object.entries(editingMarks).filter(([, n]) => Number(n) > 0));
    if (Object.keys(marks).length) state.players[editing].marks = marks;
    else delete state.players[editing].marks;
  }
  $("playerSheet").hidden = true;
  render();
});
$("playerCancel").addEventListener("click", () => ($("playerSheet").hidden = true));
$("playerSheet").addEventListener("click", (e) => {
  if (e.target === $("playerSheet")) $("playerSheet").hidden = true;
});

// ---- 結果の得点 ----
// 得点者が増えた・減ったら、スコアも合わせる（before＝変える前の得点者）。
// スコアが得点者の数とそろっていたときは、そのまま数に合わせる。そろっていなかったとき（名前のわからない得点を
// スコアにだけ入れていたときなど）は、得点者の数より少なくならないようにだけする
function syncScore(before) {
  [["u", "scoreUs"], ["t", "scoreThem"]].forEach(([side, key]) => {
    const was = before.filter((g) => g.side === side).length;
    const now = state.goals.filter((g) => g.side === side).length;
    const score = Number(state[key]) || 0;
    if (score === was || score < now) state[key] = now;
    $(key).value = state[key];
  });
}

function renderGoals() {
  $("goals").replaceChildren(
    ...state.goals.map((g, i) => {
      // 1行に 自チームの得点者 | 時間 | 相手の得点者（得点した側にだけ名前の欄、もう片方は空ける）
      const row = document.createElement("div");
      row.className = g.side === "t" ? "goal is-them" : "goal";
      const min = Object.assign(document.createElement("input"), { className: "min", value: g.min || "", placeholder: "分", inputMode: "numeric", maxLength: 4 });
      min.setAttribute("aria-label", "時間（分）");
      const name = Object.assign(document.createElement("input"), { value: g.name || "", placeholder: "名前", maxLength: 12 });
      name.setAttribute("list", "rosterNames");
      min.addEventListener("input", () => {
        g.min = min.value.trim();
        save(STORE_KEY, state);
      });
      name.addEventListener("input", () => {
        g.name = name.value.trim();
        save(STORE_KEY, state);
      });
      const remove = Object.assign(document.createElement("button"), { type: "button", className: "remove", textContent: "×" });
      remove.setAttribute("aria-label", "この得点を消す");
      remove.addEventListener("click", () => {
        const before = [...state.goals];
        state.goals.splice(i, 1);
        syncScore(before);
        render();
      });
      name.setAttribute("aria-label", g.side === "t" ? "相手の得点者" : "自チームの得点者");
      const scorer = document.createElement("div");
      scorer.className = "scorer";
      // × は外側（自チームは左端、相手は右端）
      if (g.side === "t") scorer.append(name, remove);
      else scorer.append(remove, name);
      const blank = document.createElement("span");
      row.append(...(g.side === "t" ? [blank, min, scorer] : [scorer, min, blank]));
      return row;
    })
  );
}
