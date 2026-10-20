// さくせん盤：作戦の保存（場面ごとの配置と線。この端末に残す）
// ファイルは index.html に書いた順（core → board → ink → tactics → sheets → share → events → app.js）に読み、同じ範囲の変数（state など）を使う
"use strict";

// ---- 作戦の保存（場面ごとの配置と線。チームの色は含めない。この端末に残す） ----
const TACTICS_KEY = "soccer:tactics";
const TACTIC_KEYS = ["court", "mode", "formation", "oppFormation", "lineShapes", "oppLineShapes", "players", "opp", "ball", "showOpp", "oppLayout", "showBall", "strokes"];
const MAX_TACTICS = 30;
let tactics = load(TACTICS_KEY, []);
if (!Array.isArray(tactics)) tactics = [];
const saveTactics = () => save(TACTICS_KEY, tactics);
const snapshot = () => JSON.parse(JSON.stringify(Object.fromEntries(TACTIC_KEYS.map((k) => [k, state[k]]))));

function saveTactic() {
  const input = $("tacticName");
  const name = input.value.trim().slice(0, 20) || `作戦 ${tactics.length + 1}`;
  const same = tactics.findIndex((t) => t.name === name);
  if (same >= 0 && !confirm(`「${name}」を今の作戦盤で上書きしますか？`)) return;
  const entry = { id: same >= 0 ? tactics[same].id : `t${Date.now().toString(36)}`, name, savedAt: Date.now(), board: snapshot() };
  if (same >= 0) tactics.splice(same, 1);
  else if (tactics.length >= MAX_TACTICS) {
    alert(`保存できるのは ${MAX_TACTICS} 件までです。使わないものを消してください。`);
    return;
  }
  tactics.unshift(entry);
  saveTactics();
  input.value = "";
  renderTactics();
}

function openTactic(entry) {
  remember();
  animateTokens = true;
  Object.assign(state, JSON.parse(JSON.stringify(entry.board)));
  selected.clear();
  drawing = false;
  editMode = false;
  render();
  board.scrollIntoView({ behavior: "smooth", block: "center" });
}

function copyTactic(entry) {
  if (tactics.length >= MAX_TACTICS) return alert(`保存できるのは ${MAX_TACTICS} 件までです。`);
  let name = `${entry.name}（コピー）`.slice(0, 20);
  for (let n = 2; tactics.some((t) => t.name === name); n += 1) name = `${entry.name}（コピー${n}）`.slice(0, 20);
  tactics.splice(tactics.indexOf(entry) + 1, 0, { ...JSON.parse(JSON.stringify(entry)), id: `t${Date.now().toString(36)}`, name, savedAt: Date.now() });
  saveTactics();
  renderTactics();
}

function renameTactic(entry) {
  const name = prompt("作戦の名前", entry.name);
  if (!name || !name.trim()) return;
  entry.name = name.trim().slice(0, 20);
  saveTactics();
  renderTactics();
}

function removeTactic(entry) {
  if (!confirm(`「${entry.name}」を消しますか？`)) return;
  tactics = tactics.filter((t) => t !== entry);
  saveTactics();
  renderTactics();
}

function renderTactics() {
  $("tacticsMeta").textContent = tactics.length ? `${tactics.length}件` : "なし";
  $("tacticList").replaceChildren(
    ...tactics.map((entry) => {
      const b = entry.board || {};
      const li = Object.assign(document.createElement("li"), { className: "tactic" });
      const open = Object.assign(document.createElement("button"), { type: "button", className: "tactic-open" });
      const lines = (b.strokes || []).length;
      const detail = [
        `${b.mode === "futsal" ? "フットサル" : "サッカー"} ${(b.players || []).length}人${b.formation ? `・${b.formation}` : ""}`,
        b.showOpp ? "相手あり" : "",
        lines ? `線${lines}本` : ""
      ].filter(Boolean).join("・");
      open.append(Object.assign(document.createElement("b"), { textContent: entry.name }), Object.assign(document.createElement("small"), { textContent: detail }));
      open.addEventListener("click", () => openTactic(entry));
      const actions = Object.assign(document.createElement("div"), { className: "tactic-actions" });
      const action = (text, label, fn) => {
        const btn = Object.assign(document.createElement("button"), { type: "button", textContent: text });
        btn.setAttribute("aria-label", `${entry.name}を${label}`);
        btn.addEventListener("click", () => fn(entry));
        return btn;
      };
      const go = action("開く", "開く", openTactic);
      go.className = "is-main";
      actions.append(go, action("複製", "複製", copyTactic), action("名前", "名前を変える", renameTactic), action("消す", "消す", removeTactic));
      li.append(open, actions);
      return li;
    })
  );
}
