// さくせん盤：選手のポップアップ（長押し）・結果の得点
// ファイルは index.html に書いた順（core → board → ink → tactics → sheets → share → events → app.js）に読み、同じ範囲の変数（state など）を使う
"use strict";

// ---- 選手の名簿 ----
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

// ---- 選手のポップアップ（自チームの選手を長押し）：選手のことはここだけで変える ----
//   ・上の「10 たなか ✏️」をタップ → 背番号・名前を入れる（選手名簿からも選べる）
//   ・印のボタンをタップ → 1つ足す（試合中の記録）。下の小さな − で1つ減らす（取り消し）
//     ゴール・OG は試合結果の得点者そのもの（足すと得点者とスコアに入り、− で消える）
// 変えるとすぐ盤に出る。× か外を触ると閉じる
let quickIndex = -1;
let quickEditing = false; // 背番号・名前を入れているところ
let quickRemembered = false; // 背番号・名前は、開いている間に1回だけ「戻す」に残す

function renderQuickMarks() {
  const p = state.players[quickIndex];
  if (!p) return closeQuickMarks();
  const close = Object.assign(document.createElement("button"), { type: "button", className: "quick-close", textContent: "×" });
  close.setAttribute("aria-label", "閉じる");
  close.addEventListener("click", closeQuickMarks);
  const head = Object.assign(document.createElement("div"), { className: "quick-head" });
  if (quickEditing) {
    head.append(Object.assign(document.createElement("p"), { className: "quick-title", textContent: quickIndex === 0 ? "GK" : `${quickIndex + 1}人目` }), close);
  } else {
    const title = Object.assign(document.createElement("button"), { type: "button", className: "quick-title is-edit", textContent: `${`${p.number || ""} ${p.name || ""}`.trim() || "背番号・名前"} ✏️` });
    title.setAttribute("aria-label", "背番号・名前を変える");
    title.addEventListener("click", () => {
      quickEditing = true;
      renderQuickMarks();
      $("quickName").focus();
    });
    head.append(title, close);
  }
  const parts = [head];
  if (quickEditing) parts.push(...quickEditRows(p));
  const grid = Object.assign(document.createElement("div"), { className: "quick-grid" });
  grid.append(
    ...MARKS.map(({ key, icon, label, max, red }) => {
      const n = Number(playerMarksOf(p)?.[key]) || 0;
      const cell = Object.assign(document.createElement("div"), { className: "quick-cell" });
      const add = Object.assign(document.createElement("button"), { type: "button", className: "quick-mark", disabled: n >= max });
      add.setAttribute("aria-label", `${label}を足す（今 ${n}）`);
      if (red) add.append(Object.assign(document.createElement("img"), { className: "is-own-goal", src: redBallDataUrl(), alt: "" }));
      else add.append(icon);
      add.append(Object.assign(document.createElement("small"), { textContent: label }));
      if (n) add.append(Object.assign(document.createElement("i"), { className: "quick-count", textContent: String(n) }));
      add.addEventListener("click", () => stepMark(p, key, max, n + 1));
      const minus = Object.assign(document.createElement("button"), { type: "button", className: "quick-minus", textContent: "−", disabled: n <= 0 });
      minus.setAttribute("aria-label", `${label}を1つ減らす`);
      minus.addEventListener("click", () => stepMark(p, key, max, n - 1));
      cell.append(add, minus);
      return cell;
    })
  );
  parts.push(grid);
  $("quickMarks").replaceChildren(...parts);
}

// ゴール・OG は試合結果の得点者を足す・消す（スコアも合わせる）。イエロー・レッド・アシストは選手の印
function stepMark(p, key, max, next) {
  remember();
  if (GOAL_KEYS.includes(key)) {
    const name = key === "g" ? playerLabel(p) : `${playerLabel(p)}（OG）`;
    const side = key === "g" ? "u" : "t";
    const before = [...state.goals];
    const now = state.goals.filter((g) => g.side === side && g.name === name).length;
    if (next > now) state.goals.push({ side, min: "", name });
    else if (next < now) state.goals.splice(state.goals.map((g) => g.side === side && g.name === name).lastIndexOf(true), 1);
    syncScore(before);
    render();
    renderQuickMarks();
    return;
  }
  const marks = { ...(p.marks || {}), [key]: Math.min(max, Math.max(0, next)) };
  Object.keys(marks).forEach((k) => !marks[k] && delete marks[k]);
  if (Object.keys(marks).length) p.marks = marks;
  else delete p.marks;
  render();
  renderQuickMarks();
}

// 背番号・名前の欄と、選手名簿のボタン（ほかの選手が使っている名前は薄く）
function quickEditRows(p) {
  const change = () => {
    if (!quickRemembered) remember();
    quickRemembered = true;
    const before = playerLabel(p);
    p.number = $("quickNumber").value.trim().slice(0, 3);
    p.name = $("quickName").value.trim().slice(0, 8);
    renameGoals(before, playerLabel(p)); // 得点者の名前もそろえる
    render();
  };
  const row = Object.assign(document.createElement("div"), { className: "quick-edit" });
  const number = Object.assign(document.createElement("input"), { id: "quickNumber", value: p.number || "", inputMode: "numeric", maxLength: 3, placeholder: "番号" });
  number.setAttribute("aria-label", "背番号");
  const name = Object.assign(document.createElement("input"), { id: "quickName", value: p.name || "", maxLength: 8, placeholder: "名前" });
  name.setAttribute("aria-label", "名前");
  [number, name].forEach((input) => {
    input.addEventListener("input", change);
    input.addEventListener("keydown", (e) => e.key === "Enter" && !e.isComposing && input.blur());
  });
  row.append(number, name);
  const used = new Set(state.players.map((x) => x.name).filter(Boolean));
  const people = parseRoster();
  if (!people.length) return [row];
  const chips = Object.assign(document.createElement("div"), { className: "chips quick-roster" });
  chips.append(
    ...people.map((person) => {
      const b = chip(`${person.number ? `${person.number} ` : ""}${person.name}`, false, () => {
        number.value = person.number || number.value;
        name.value = person.name;
        change();
      });
      if (used.has(person.name) && person.name !== p.name) b.style.opacity = "0.45";
      return b;
    })
  );
  return [row, chips];
}

function openQuickMarks(index, el) {
  quickIndex = index;
  quickEditing = false;
  quickRemembered = false;
  renderQuickMarks();
  placeQuick(el);
}

// ---- 相手の長押し：相手の得点を記録する（試合結果の得点者の相手側に「相手10番」として入る。スコアも合わせる）。
// OG（相手のオウンゴール）は自チームの得点として「相手10番（OG）」 ----
let oppQuickIndex = -1;

function renderOppQuick() {
  const p = (state.opp || [])[oppQuickIndex];
  if (!p) return closeQuickMarks();
  const name = oppLabel(p);
  const close = Object.assign(document.createElement("button"), { type: "button", className: "quick-close", textContent: "×" });
  close.setAttribute("aria-label", "閉じる");
  close.addEventListener("click", closeQuickMarks);
  const head = Object.assign(document.createElement("div"), { className: "quick-head" });
  head.append(Object.assign(document.createElement("p"), { className: "quick-title", textContent: name }), close);
  const kinds = [
    { side: "t", goalName: name, label: "ゴール", icon: "⚽" },
    { side: "u", goalName: `${name}（OG）`, label: "OG", red: true }
  ];
  const grid = Object.assign(document.createElement("div"), { className: "quick-grid is-opp" });
  grid.append(
    ...kinds.map(({ side, goalName, label, icon, red }) => {
      const n = state.goals.filter((g) => g.side === side && g.name === goalName).length;
      const cell = Object.assign(document.createElement("div"), { className: "quick-cell" });
      const add = Object.assign(document.createElement("button"), { type: "button", className: "quick-mark" });
      add.setAttribute("aria-label", `${name}の${label}を足す（今 ${n}）`);
      if (red) add.append(Object.assign(document.createElement("img"), { className: "is-own-goal", src: redBallDataUrl(), alt: "" }));
      else add.append(icon);
      add.append(Object.assign(document.createElement("small"), { textContent: label }));
      if (n) add.append(Object.assign(document.createElement("i"), { className: "quick-count", textContent: String(n) }));
      add.addEventListener("click", () => {
        const before = [...state.goals];
        state.goals.push({ side, min: "", name: goalName });
        syncScore(before);
        render();
        renderOppQuick();
      });
      const minus = Object.assign(document.createElement("button"), { type: "button", className: "quick-minus", textContent: "−", disabled: n <= 0 });
      minus.setAttribute("aria-label", `${name}の${label}を1つ減らす`);
      minus.addEventListener("click", () => {
        const before = [...state.goals];
        const i = state.goals.map((g) => g.side === side && g.name === goalName).lastIndexOf(true);
        if (i >= 0) state.goals.splice(i, 1);
        syncScore(before);
        render();
        renderOppQuick();
      });
      cell.append(add, minus);
      return cell;
    })
  );
  const note = Object.assign(document.createElement("p"), { className: "quick-note", textContent: "試合結果の得点者に入ります（時間や名前は「👕 チーム・試合結果」で）" });
  $("quickMarks").replaceChildren(head, grid, note);
}

function openOppQuick(index, el) {
  oppQuickIndex = index;
  renderOppQuick();
  placeQuick(el);
}

// ポップアップを丸の下（入らなければ上）に、画面からはみ出さないように置く
function placeQuick(el) {
  const menu = $("quickMarks");
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
  oppQuickIndex = -1;
  quickEditing = false;
  $("quickMarks").hidden = true;
}
// メニューの外を触る・画面を動かすと閉じる（文字を入れているとき、キーボードで画面が動くのでは閉じない）
document.addEventListener("pointerdown", (e) => {
  if (!$("quickMarks").hidden && !$("quickMarks").contains(e.target)) closeQuickMarks();
}, true);
window.addEventListener("scroll", () => !$("quickMarks").contains(document.activeElement) && closeQuickMarks(), { passive: true });

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
        renderTokens(); // 盤の ⚽ の印は得点者の名前から数えるので、こまだけ描き直す（入力中の欄は作り直さない）
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
