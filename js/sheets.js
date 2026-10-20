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
    ...MARKS.map(({ key, icon, label, max }) => {
      const row = document.createElement("div");
      row.className = "mark-row";
      const name = Object.assign(document.createElement("span"), { className: "mark-label", textContent: `${icon} ${label}` });
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
function renderGoals() {
  $("goals").replaceChildren(
    ...state.goals.map((g, i) => {
      const row = document.createElement("div");
      row.className = "goal";
      const side = Object.assign(document.createElement("span"), { className: "side", textContent: g.side === "t" ? "相手" : "自チーム" });
      const min = Object.assign(document.createElement("input"), { value: g.min || "", placeholder: "分", inputMode: "numeric", maxLength: 4 });
      const name = Object.assign(document.createElement("input"), { value: g.name || "", placeholder: g.side === "t" ? "（任意）" : "名前", maxLength: 12 });
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
        state.goals.splice(i, 1);
        render();
      });
      row.append(side, min, name, remove);
      return row;
    })
  );
}
