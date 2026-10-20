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
//   ・上の「🔄 交代」→ 入る選手（名簿からも）と時間を入れる。丸（ポジション）はそのまま、中の人が入れかわる。
//     出た選手の記録は p.subs に残る（得点は名前で得点者に残り、カード・アシストは出た選手の分として結果に入る）
// 変えるとすぐ盤に出る。× か外を触ると閉じる
let quickIndex = -1;
let quickEditing = false; // 背番号・名前を入れているところ
let quickSubbing = false; // 交代を入れているところ
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
      quickSubbing = false;
      renderQuickMarks();
      $("quickName").focus();
    });
    // 選手の行に「🔄 交代」
    const sub = Object.assign(document.createElement("button"), { type: "button", className: "quick-sub-open", textContent: "🔄 交代" });
    sub.setAttribute("aria-pressed", String(quickSubbing));
    sub.addEventListener("click", () => {
      quickSubbing = !quickSubbing;
      renderQuickMarks();
      if (quickSubbing) $("subMin").focus();
    });
    head.append(title, sub, close);
  }
  const parts = [head];
  if (quickEditing) parts.push(...quickEditRows(p));
  if (p.subs?.length) parts.push(subHistoryEl(p, "u"));
  if (quickSubbing) {
    parts.push(subFormEl(p, "u"));
    $("quickMarks").replaceChildren(...parts);
    return;
  }
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
// team は "u"＝自チーム・"t"＝相手（紅白戦などで相手にも名前を付ける）
function quickEditRows(p, team = "u") {
  const label = team === "t" ? oppLabel : playerLabel;
  const change = () => {
    if (!quickRemembered) remember();
    quickRemembered = true;
    const before = label(p);
    p.number = $("quickNumber").value.trim().slice(0, 3);
    p.name = $("quickName").value.trim().slice(0, 8);
    renameGoals(before, label(p), team); // 得点者の名前もそろえる
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
  // 選手名簿は両チームで使える（紅白戦など）。どちらかのチームで盤にいる名前は薄く
  const used = new Set([...state.players, ...(state.opp || [])].map((x) => x.name).filter(Boolean));
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

// ---- 交代 ----
// 呼び名：自チームは「たなか」か「10番」、相手は「ジョン」か「相手10番」（得点者の名前と同じ）
const subLabel = (number, name, team = "u") => name || (number ? (team === "t" ? `相手${number}番` : `${number}番`) : "");
const rerenderQuick = (team) => (team === "t" ? renderOppQuick() : renderQuickMarks());

// これまでの交代（「🔄 60' たなか → すずき」）と、出た選手の記録（得点は得点者から、カード・アシストは残した印から）。最後の交代は取り消せる
function subHistoryEl(p, team = "u") {
  const box = Object.assign(document.createElement("div"), { className: "quick-subs" });
  p.subs.forEach((s) => {
    const out = subLabel(s.outNumber, s.outName, team);
    const goals = state.goals.filter((g) => g.side === team && g.name === out).length;
    const record = [goals ? "⚽".repeat(Math.min(goals, 3)) + (goals > 3 ? goals : "") : "", markText(s.outMarks)].filter(Boolean).join("");
    box.append(Object.assign(document.createElement("p"), { textContent: `🔄 ${s.min ? `${s.min}' ` : ""}${out} → ${subLabel(s.inNumber, s.inName, team)}${record ? `（${out}：${record}）` : ""}` }));
  });
  const undoSub = Object.assign(document.createElement("button"), { type: "button", className: "quick-more", textContent: "最後の交代を取り消す" });
  undoSub.addEventListener("click", () => {
    remember();
    const last = p.subs.pop();
    p.number = last.outNumber;
    p.name = last.outName;
    if (last.outMarks) p.marks = last.outMarks;
    else delete p.marks;
    if (!p.subs.length) delete p.subs;
    render();
    rerenderQuick(team);
  });
  box.append(undoSub);
  return box;
}

// 交代の入力：時間（分）・入る選手の背番号と名前（選手名簿のボタンからも。いま盤にいる選手は薄く）
function subFormEl(p, team = "u") {
  const form = Object.assign(document.createElement("div"), { className: "quick-subform" });
  form.append(Object.assign(document.createElement("p"), { className: "quick-subhead", textContent: `🔄 ${subLabel(p.number, p.name, team) || "この選手"} と交代で入る選手` }));
  const row = Object.assign(document.createElement("div"), { className: "quick-edit is-sub" });
  const min = Object.assign(document.createElement("input"), { id: "subMin", inputMode: "numeric", maxLength: 4, placeholder: "分" });
  min.setAttribute("aria-label", "交代した時間（分）");
  const number = Object.assign(document.createElement("input"), { id: "subNumber", inputMode: "numeric", maxLength: 3, placeholder: "番号" });
  number.setAttribute("aria-label", "入る選手の背番号");
  const name = Object.assign(document.createElement("input"), { id: "subName", maxLength: 8, placeholder: "名前" });
  name.setAttribute("aria-label", "入る選手の名前");
  row.append(min, number, name);
  form.append(row);
  // 選手名簿は両チームで使える（紅白戦など）。どちらかのチームで盤にいる名前は薄く
  const onPitch = new Set([...state.players, ...(state.opp || [])].map((x) => x.name).filter(Boolean));
  const people = parseRoster();
  if (people.length) {
    const chips = Object.assign(document.createElement("div"), { className: "chips quick-roster" });
    chips.append(
      ...people.map((person) => {
        const b = chip(`${person.number ? `${person.number} ` : ""}${person.name}`, false, () => {
          number.value = person.number;
          name.value = person.name;
        });
        if (onPitch.has(person.name)) b.style.opacity = "0.45";
        return b;
      })
    );
    form.append(chips);
  }
  const go = Object.assign(document.createElement("button"), { type: "button", className: "btn small", textContent: "交代する" });
  go.addEventListener("click", () => {
    const inNumber = number.value.trim().slice(0, 3);
    const inName = name.value.trim().slice(0, 8);
    if (!inNumber && !inName) return name.focus();
    remember();
    // 出た選手の記録を残し、丸の中を入った選手にする（カード・アシストは引き継がない）
    p.subs = [...(p.subs || []), { min: min.value.trim().slice(0, 4), outNumber: p.number, outName: p.name, ...(p.marks ? { outMarks: p.marks } : {}), inNumber, inName }];
    p.number = inNumber;
    p.name = inName;
    delete p.marks;
    quickSubbing = false;
    oppSubbing = false;
    render();
    rerenderQuick(team);
  });
  const cancel = Object.assign(document.createElement("button"), { type: "button", className: "quick-more", textContent: "やめる" });
  cancel.addEventListener("click", () => {
    quickSubbing = false;
    oppSubbing = false;
    rerenderQuick(team);
  });
  const actions = Object.assign(document.createElement("div"), { className: "quick-actions" });
  actions.append(cancel, go);
  form.append(actions);
  return form;
}

function openQuickMarks(index, el) {
  quickIndex = index;
  quickEditing = false;
  quickSubbing = false;
  quickRemembered = false;
  renderQuickMarks();
  placeQuick(el);
}

// ---- 相手の長押し：相手の印を記録する（自チームと同じボタン。下の小さな − で取り消し）。
// ゴールは試合結果の得点者の相手側に「相手10番」、OG（相手のオウンゴール）は自チーム側に「相手10番（OG）」として入り、スコアも合わせる。
// イエロー・レッド・アシストは相手の選手の印（結果のカードにも「相手10番」で入る） ----
let oppQuickIndex = -1;
let oppSubbing = false; // 相手の交代を入れているところ
let oppEditing = false; // 相手の背番号・名前を入れているところ

function renderOppQuick() {
  const p = (state.opp || [])[oppQuickIndex];
  if (!p) return closeQuickMarks();
  const name = oppLabel(p);
  const close = Object.assign(document.createElement("button"), { type: "button", className: "quick-close", textContent: "×" });
  close.setAttribute("aria-label", "閉じる");
  close.addEventListener("click", closeQuickMarks);
  const head = Object.assign(document.createElement("div"), { className: "quick-head" });
  // 相手も選手の行に「🔄 交代」（入れ替えは自由）
  const subOpen = Object.assign(document.createElement("button"), { type: "button", className: "quick-sub-open", textContent: "🔄 交代" });
  subOpen.setAttribute("aria-pressed", String(oppSubbing));
  subOpen.addEventListener("click", () => {
    oppSubbing = !oppSubbing;
    oppEditing = false;
    renderOppQuick();
    if (oppSubbing) $("subMin").focus();
  });
  // 相手も「相手10番 ✏️」をタップで背番号・名前を入れられる（紅白戦など）
  const title = Object.assign(document.createElement("button"), { type: "button", className: "quick-title is-edit", textContent: `${p.name ? `${p.number || ""} ${p.name}`.trim() : name} ✏️` });
  title.setAttribute("aria-label", "相手の背番号・名前を変える");
  title.addEventListener("click", () => {
    oppEditing = !oppEditing;
    oppSubbing = false;
    renderOppQuick();
    if (oppEditing) $("quickName").focus();
  });
  head.append(title, subOpen, close);
  const top = [head, ...(oppEditing ? quickEditRows(p, "t") : []), ...(p.subs?.length ? [subHistoryEl(p, "t")] : [])];
  if (oppSubbing) {
    $("quickMarks").replaceChildren(...top, subFormEl(p, "t"));
    return;
  }
  const goalOf = { g: { side: "t", goalName: name }, o: { side: "u", goalName: `${name}（OG）` } };
  const step = (key, max, n, next) => {
    if (goalOf[key]) {
      const { side, goalName } = goalOf[key];
      const before = [...state.goals];
      if (next > n) state.goals.push({ side, min: "", name: goalName });
      else state.goals.splice(state.goals.map((g) => g.side === side && g.name === goalName).lastIndexOf(true), 1);
      syncScore(before);
    } else {
      remember();
      const marks = { ...(p.marks || {}), [key]: Math.min(max, Math.max(0, next)) };
      Object.keys(marks).forEach((k) => !marks[k] && delete marks[k]);
      if (Object.keys(marks).length) p.marks = marks;
      else delete p.marks;
    }
    render();
    renderOppQuick();
  };
  const grid = Object.assign(document.createElement("div"), { className: "quick-grid" });
  grid.append(
    ...MARKS.map(({ key, icon, label, max, red }) => {
      const n = Number(oppMarksOf(p)?.[key]) || 0;
      const cell = Object.assign(document.createElement("div"), { className: "quick-cell" });
      const add = Object.assign(document.createElement("button"), { type: "button", className: "quick-mark", disabled: !goalOf[key] && n >= max });
      add.setAttribute("aria-label", `${name}の${label}を足す（今 ${n}）`);
      if (red) add.append(Object.assign(document.createElement("img"), { className: "is-own-goal", src: redBallDataUrl(), alt: "" }));
      else add.append(icon);
      add.append(Object.assign(document.createElement("small"), { textContent: label }));
      if (n) add.append(Object.assign(document.createElement("i"), { className: "quick-count", textContent: String(n) }));
      add.addEventListener("click", () => step(key, max, n, n + 1));
      const minus = Object.assign(document.createElement("button"), { type: "button", className: "quick-minus", textContent: "−", disabled: n <= 0 });
      minus.setAttribute("aria-label", `${name}の${label}を1つ減らす`);
      minus.addEventListener("click", () => step(key, max, n, n - 1));
      cell.append(add, minus);
      return cell;
    })
  );
  const note = Object.assign(document.createElement("p"), { className: "quick-note", textContent: "ゴール・OG は試合結果の得点者に入ります\n（時間は「👕 チーム・試合結果」で編集）" });
  $("quickMarks").replaceChildren(...top, grid, note);
}

function openOppQuick(index, el) {
  oppQuickIndex = index;
  oppSubbing = false;
  oppEditing = false;
  quickRemembered = false;
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
      // 打っている間は得点だけを変え、打ち終わったら（欄を離れたら）盤の選手の名前とほかの得点もそろえる
      let nameBefore = g.name || "";
      name.addEventListener("focus", () => (nameBefore = g.name || ""));
      name.addEventListener("input", () => {
        g.name = name.value.trim();
        save(STORE_KEY, state);
      });
      name.addEventListener("change", () => {
        renameScorer(g, nameBefore);
        nameBefore = g.name;
        render();
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
