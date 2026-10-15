// さくせん盤：画面：ピッチの描き直し・相手・選手のこま・ドラッグ・範囲選択
// ファイルは index.html に書いた順（core → board → ink → tactics → sheets → share → events → app.js）に読み、同じ範囲の変数（state など）を使う
"use strict";

// ---- 画面 ----
const board = $("board");
const ink = $("ink");
const tokens = $("tokens");

function render() {
  save(STORE_KEY, state);
  // タブ
  for (const tab of document.querySelectorAll(".tab")) tab.setAttribute("aria-selected", String(tab.dataset.tab === state.tab));
  $("panelLineup").hidden = state.tab !== "lineup";
  $("panelResult").hidden = state.tab !== "result";
  // コート（作戦盤の右上）
  $("courtSelect").replaceChildren(...FORMATION_GROUPS.map((g) => Object.assign(document.createElement("option"), { value: g.id, textContent: g.label })));
  $("courtSelect").value = state.court;
  const court = courtDef(state.court);
  // 自チーム：人数・フォーメーション（人数を変えて決まった並びがないときは「10人」）
  $("playerCount").textContent = `${state.players.length}人`;
  $("removePlayer").disabled = state.players.length <= MIN_PLAYERS;
  $("addPlayer").disabled = state.players.length >= MAX_PLAYERS;
  // 相手のフォーメーション（人数を変えたあとは ""＝今の相手をそのまま使う）。
  // 今のコートにない並び（フットサルなのにサッカーの 4-4-2 など）は、自チームの並びにそろえる
  if (state.oppFormation !== "" && (!fieldCount(state.oppFormation) || !court.list.includes(state.oppFormation))) {
    state.oppFormation = state.formation || autoFormation(state.players.length - 1);
    if (!state.showOpp) state.opp = null; // 出していない相手は、次に出すときに自チームの人数で並べ直す
  }
  if (state.oppFormation === "" && !Array.isArray(state.opp)) state.oppFormation = state.formation || autoFormation(state.players.length - 1);
  // フォーメーション：同じ並びを同じ行に（左が自チーム、右が相手）。人数を変えて決まった並びがないときは「10人（自由）」
  const pickOurs = (f) => {
    remember();
    animateTokens = true;
    // 人数が変わるときは、相手も同じ並びにする
    if (fieldCount(f) !== state.players.length - 1) state.oppFormation = f;
    state.formation = f;
    state.players = freshPlayers(state.mode, f, state.players);
    state.opp = opponents();
    selected.clear();
    render();
  };
  const pickTheirs = (f) => {
    remember();
    animateTokens = true;
    state.oppFormation = f;
    state.opp = opponents();
    setShowOpp(true);
    render();
  };
  const oppFree = state.showOpp && !state.oppFormation;
  const rows = [];
  if (!state.formation || oppFree) {
    rows.push([
      state.formation ? null : chip(`${state.players.length}人（自由）`, true, () => {}, "radio"),
      oppFree ? chip(`${oppTotal()}人（自由）`, true, () => {}, "radio") : null
    ]);
  }
  const names = [...new Set([...(state.formation && !court.list.includes(state.formation) ? [state.formation] : []), ...(state.oppFormation && !court.list.includes(state.oppFormation) ? [state.oppFormation] : []), ...court.list])];
  for (const f of names) {
    rows.push([
      chip(f, state.formation === f, () => pickOurs(f), "radio"),
      chip(f, state.showOpp && state.oppFormation === f, () => pickTheirs(f), "radio")
    ]);
  }
  $("formationRows").replaceChildren(
    ...rows.flatMap(([ours, theirs]) => [ours || document.createElement("span"), theirs || document.createElement("span")])
  );
  $("oppHint").textContent = state.showOpp ? "" : "（選ぶと表示）";
  // チームの色
  const swatches = (key) => {
    const pick = (hex) => {
      remember();
      state[key] = hex;
      if (key === "oppColor") setShowOpp(true);
      render();
    };
    const current = String(state[key]).toLowerCase();
    const isPreset = TEAM_COLORS.some((c) => c.hex === current);
    const buttons = TEAM_COLORS.map((c) => {
      const b = chip("", current === c.hex, () => pick(c.hex));
      b.classList.add("color");
      b.style.background = c.hex;
      b.setAttribute("aria-label", c.label);
      return b;
    });
    // カスタム：自由な色（選んでいる間は、その色で丸を塗る）
    const custom = document.createElement("label");
    custom.className = "chip color is-custom";
    custom.setAttribute("aria-label", "カスタム");
    custom.setAttribute("aria-pressed", String(!isPreset));
    if (!isPreset) custom.style.background = current;
    const input = Object.assign(document.createElement("input"), { type: "color", value: /^#[0-9a-f]{6}$/.test(current) ? current : "#ffffff" });
    input.addEventListener("change", () => pick(input.value));
    custom.append(input);
    return [...buttons, custom];
  };
  $("ourColors").replaceChildren(...swatches("ourColor"));
  $("oppColors").replaceChildren(...swatches("oppColor"));
  board.classList.toggle("is-futsal", state.mode === "futsal");
  renderTokens();
  drawInk();
  // 作戦盤の道具
  $("toggleOpp").setAttribute("aria-pressed", String(state.showOpp));
  $("toggleBall").setAttribute("aria-pressed", String(state.showBall));
  $("togglePen").setAttribute("aria-pressed", String(drawing));
  $("toggleEdit").setAttribute("aria-pressed", String(editMode));
  $("undo").disabled = !undoStack.length;
  $("penTools").hidden = !drawing;
  board.classList.toggle("is-drawing", drawing);
  board.classList.toggle("is-editing", editMode);
  $("boardHint").textContent = drawing
    ? "指でなぞって線を描けます。"
    : editMode
      ? "選手をタップすると、名前・背番号を変えられます。"
      : "ドラッグで移動。タップや、何もない所をなぞって選ぶと、まとめて動かせます。";
  // チームの欄：人数（相手を出しているときは差も）
  const ours = state.players.length;
  const theirs = oppTotal();
  const vs = `${ours} 対 ${theirs}${ours > theirs ? "（数的有利）" : ours < theirs ? "（数的不利）" : ""}`;
  $("oppCount").textContent = `${theirs}人`;
  $("countVs").textContent = state.showOpp ? vs : "";
  $("teamMeta").textContent = [state.team && state.opponent ? `${state.team} vs ${state.opponent}` : state.team, state.formation || `${ours}人`].filter(Boolean).join("・");
  $("removeOpp").disabled = theirs <= MIN_PLAYERS;
  $("addOpp").disabled = theirs >= MAX_PLAYERS;
  $("infoMeta").textContent = [whenText(), state.where].filter(Boolean).join("・") || "なし";
  $("penColors").replaceChildren(
    ...PEN_COLORS.map((color) => {
      const b = chip("", state.penColor === color, () => {
        state.penColor = color;
        render();
      });
      b.classList.add("color");
      b.style.background = color;
      b.setAttribute("aria-label", "ペンの色");
      return b;
    })
  );
  // 名簿
  const people = parseRoster();
  $("rosterCount").textContent = people.length ? `${people.length}人` : "なし";
  $("rosterNames").replaceChildren(...people.map((p) => Object.assign(document.createElement("option"), { value: p.name })));
  renderGoals();
  // 得点者・MVP の欄の見出しの右
  const goalCount = state.goals.length;
  $("goalsMeta").textContent = [goalCount ? `${goalCount}点` : "", state.mvp ? "MVP あり" : ""].filter(Boolean).join("・") || "なし";
  // 内訳の欄の見出しの右：入っているもの（例：前半・後半・PK）、なければ「なし」
  const periods = [["前半", "halfUs", "halfThem"], ["後半", "secondUs", "secondThem"], ["延長", "extraUs", "extraThem"], ["PK", "pkUs", "pkThem"]]
    .filter(([, a, b]) => state[a] !== "" && state[b] !== "")
    .map(([label]) => label);
  $("periodMeta").textContent = periods.join("・") || "なし";
  // おくるんへのリンク（押したときに最新を作る）
  $("sendLineup").href = lineupCardUrl();
  $("sendResult").href = resultCardUrl();
}

function chip(text, pressed, onClick, role) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "chip";
  b.textContent = text;
  if (role) {
    b.setAttribute("role", role);
    b.setAttribute("aria-checked", String(pressed));
  } else {
    b.setAttribute("aria-pressed", String(pressed));
  }
  b.addEventListener("click", onClick);
  return b;
}

// 相手を出す・消す
function setShowOpp(on) {
  if (state.showOpp === on) return;
  state.showOpp = on;
  // 自チームの高さを、GK と最前線の位置に合わせて縮める・広げる（横はそのまま）。なめらかに動かす
  const [from, to] = on ? [FULL, VERSUS] : [VERSUS, FULL];
  state.players = state.players.map((p) => ({ ...p, y: Math.min(98, Math.max(2, fitY(p.y, from, to))) }));
  if (on) {
    // 相手がまだいない・今のコートに合わない人数（フットサルなのに 11 人など）のときは、自チームの人数・並びで出す
    const court = courtDef(state.court);
    const tooMany = Array.isArray(state.opp) && state.opp.length > Math.max(...court.list.map((f) => fieldCount(f) || 0)) + 1;
    if (!Array.isArray(state.opp) || !state.opp.length || tooMany) {
      state.oppFormation = state.formation || autoFormation(state.players.length - 1);
      state.opp = opponents();
    }
  }
  animateTokens = true;
}

// 相手は選んだフォーメーション（最初は自チームと同じ）を、上下・左右反対に置く
// 相手の人数（並べる前は、フォーメーションの人数）
const oppTotal = () => (Array.isArray(state.opp) && state.opp.length ? state.opp.length : fieldCount(state.oppFormation || state.formation) ? fieldCount(state.oppFormation || state.formation) + 1 : state.players.length);

function opponents() {
  const formation = state.oppFormation || autoFormation(oppTotal() - 1);
  return formationPositions(state.mode, formation, true).map((p, i) => ({ number: String(i + 1), name: "", x: 100 - p.x, y: 100 - p.y }));
}

// 範囲で選んだもの（"p3"＝自チームの4人目、"o0"＝相手のGK、"ball"）。選んだものはまとめて動く
const selected = new Set();
const keyOf = (target) => (target.kind === "ball" ? "ball" : `${target.kind === "player" ? "p" : "o"}${target.index}`);

// 並べ直したとき（相手の出し入れ・フォーメーション・戻すなど）は、前の位置からなめらかに動かす
let animateTokens = false;

function renderTokens() {
  const before = animateTokens ? new Map([...tokens.children].map((n) => [n.dataset.key, { left: n.style.left, top: n.style.top }])) : null;
  animateTokens = false;
  // 重なり：相手 → 自チーム → ボールの順に置く（自チームが相手より上、ボールが一番上）
  const list = [];
  if (state.showOpp) {
    if (!Array.isArray(state.opp) || (state.oppFormation && state.opp.length !== fieldCount(state.oppFormation) + 1)) state.opp = opponents();
    state.opp.forEach((p, i) => list.push(tokenEl(p, "is-opp", { kind: "opp", index: i })));
  }
  state.players.forEach((p, i) => list.push(tokenEl(p, "", { kind: "player", index: i })));
  if (state.showBall) {
    const ball = document.createElement("span");
    ball.className = "token is-ball";
    ball.dataset.key = "ball";
    ball.textContent = "⚽";
    place(ball, state.ball);
    ball.classList.toggle("is-selected", selected.has("ball"));
    bindDrag(ball, { kind: "ball" });
    list.push(ball);
  }
  tokens.replaceChildren(...list);
  if (!before || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const moving = [];
  for (const el of list) {
    const from = before.get(el.dataset.key);
    if (!from) {
      el.classList.add("is-appearing"); // 新しく出たもの（相手など）はふわっと出す
      continue;
    }
    if (from.left === el.style.left && from.top === el.style.top) continue;
    moving.push([el, el.style.left, el.style.top]);
    el.style.left = from.left;
    el.style.top = from.top;
  }
  if (!moving.length) return;
  tokens.getBoundingClientRect(); // 前の位置を確定させてから動かす
  for (const [el, left, top] of moving) {
    el.classList.add("is-moving");
    el.style.left = left;
    el.style.top = top;
    el.addEventListener("transitionend", () => el.classList.remove("is-moving"), { once: true });
  }
}

function tokenEl(p, extra, target) {
  const el = document.createElement("span");
  el.className = `token ${extra}`;
  el.dataset.key = keyOf(target);
  // GK（先頭）はチームと同じ色で、🧤 を付けて見分ける
  el.innerHTML = target.index === 0 ? '<b></b><i class="gk" aria-label="GK">🧤</i><small></small>' : "<b></b><small></small>";
  const number = el.querySelector("b");
  number.textContent = p.number || "";
  // 色：自チーム・相手（GK も同じ色）
  const fill = target.kind === "opp" ? state.oppColor : state.ourColor;
  number.style.background = fill;
  number.style.color = inkOn(fill);
  number.style.borderColor = isLight(fill) ? "#23302a" : "#ffffff";
  el.querySelector("small").textContent = p.name || "";
  place(el, p);
  el.classList.toggle("is-selected", selected.has(keyOf(target)));
  bindDrag(el, target);
  return el;
}

const place = (el, p) => {
  el.style.left = `${p.x}%`;
  el.style.top = `${p.y}%`;
};

function targetOf(key) {
  if (key === "ball") return { kind: "ball" };
  return { kind: key[0] === "p" ? "player" : "opp", index: Number(key.slice(1)) };
}

function itemOf(target) {
  if (target.kind === "player") return state.players[target.index];
  if (target.kind === "opp") return state.opp[target.index];
  return state.ball;
}

// ドラッグや線を描いたあと、指を離したときにブラウザが出す「クリック」が、別の場所（人数・フォーメーションの
// ボタンなど）に届いて押されてしまうことがあるので、ドラッグの直後のクリックは捨てる
let swallowClickUntil = 0;
document.addEventListener(
  "click",
  (event) => {
    if (Date.now() < swallowClickUntil) {
      event.preventDefault();
      event.stopPropagation();
    }
  },
  true
);

// ドラッグで移動、動かさずに離したらタップ（自分の選手なら入力シート）
function bindDrag(el, target) {
  el.addEventListener("pointerdown", (event) => {
    if (drawing) return;
    event.preventDefault();
    try {
      el.setPointerCapture(event.pointerId);
    } catch {
      // つかめない端末でも、要素の上で動かせば移動できる
    }
    const rect = board.getBoundingClientRect();
    const start = { x: event.clientX, y: event.clientY };
    const adding = event.ctrlKey || event.metaKey || event.shiftKey;
    let moved = false;
    // まとめて動かすもの（選ばれたものをつかんだとき）と、それぞれの最初の位置
    const group = selected.has(keyOf(target)) && selected.size > 1 ? [...selected] : [keyOf(target)];
    const origin = group.map((key) => ({ key, item: itemOf(targetOf(key)), x: itemOf(targetOf(key))?.x, y: itemOf(targetOf(key))?.y }));
    const clamp = (v) => Math.round(Math.min(98, Math.max(2, v)));
    const onMove = (e) => {
      if (!moved && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 6) return;
      if (!moved) remember();
      moved = true;
      el.classList.add("is-dragging");
      const dx = ((e.clientX - start.x) / rect.width) * 100;
      const dy = ((e.clientY - start.y) / rect.height) * 100;
      for (const o of origin) {
        if (!o.item) continue;
        o.item.x = clamp(o.x + dx);
        o.item.y = clamp(o.y + dy);
      }
      renderTokensKeepDrag(el, target);
    };
    const onUp = () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.classList.remove("is-dragging");
      if (moved) swallowClickUntil = Date.now() + 400;
      if (moved) render();
      else if (editMode && !adding) {
        if (target.kind === "player") openPlayer(target.index);
      } else {
        // タップは選ぶ・外す（選んだものはまとめて動く）
        const key = keyOf(target);
        if (selected.has(key)) selected.delete(key);
        else selected.add(key);
        render();
      }
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
  });
}

// ドラッグ中は、つかんでいる要素はそのまま動かし、ほかの選ばれたものの位置だけ直す（要素を作り直すとつかみが外れる）
function renderTokensKeepDrag(el, target) {
  place(el, itemOf(target));
  for (const node of tokens.children) {
    if (node === el || !node.dataset.key) continue;
    const item = itemOf(targetOf(node.dataset.key));
    if (item && selected.has(node.dataset.key)) place(node, item);
  }
}

// 範囲選択：ピッチの何もない所をなぞる。動かさずに離したら選択を外す
const marquee = $("marquee");
tokens.addEventListener("pointerdown", (event) => {
  if (drawing || event.target !== tokens) return;
  event.preventDefault();
  const rect = board.getBoundingClientRect();
  const start = { x: event.clientX - rect.left, y: event.clientY - rect.top };
  const adding = event.ctrlKey || event.metaKey || event.shiftKey;
  let box = null;
  const onMove = (e) => {
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    box = { left: Math.min(start.x, x), top: Math.min(start.y, y), width: Math.abs(x - start.x), height: Math.abs(y - start.y) };
    if (box.width < 6 && box.height < 6) return;
    Object.assign(marquee.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` });
    marquee.hidden = false;
  };
  const onUp = () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    marquee.hidden = true;
    if (!adding) selected.clear();
    if (box && (box.width >= 6 || box.height >= 6)) {
      const inBox = (item) => {
        const x = (item.x / 100) * rect.width;
        const y = (item.y / 100) * rect.height;
        return x >= box.left && x <= box.left + box.width && y >= box.top && y <= box.top + box.height;
      };
      state.players.forEach((p, i) => inBox(p) && selected.add(`p${i}`));
      if (state.showOpp) (state.opp || []).forEach((p, i) => inBox(p) && selected.add(`o${i}`));
      if (state.showBall && inBox(state.ball)) selected.add("ball");
      swallowClickUntil = Date.now() + 400;
    }
    render();
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
});
