// さくせん盤：画面：ピッチの描き直し・相手・選手のこま・ドラッグ・範囲選択
// ファイルは index.html に書いた順（core → board → ink → tactics → sheets → share → events → app.js）に読み、同じ範囲の変数（state など）を使う
"use strict";

// ---- 画面 ----
const board = $("board");
const ink = $("ink");
const tokens = $("tokens");

function render() {
  save(STORE_KEY, state);
  // コート（作戦盤の右上）
  $("courtSelect").replaceChildren(...FORMATION_GROUPS.map((g) => Object.assign(document.createElement("option"), { value: g.id, textContent: g.label })));
  $("courtSelect").value = state.court;
  const court = courtDef(state.court);
  // 自チーム：人数・フォーメーション（人数を変えて決まった並びがないときは「10人」）
  $("playerCount").textContent = `${state.players.length}人`;
  $("removePlayer").disabled = state.players.length <= MIN_PLAYERS;
  $("addPlayer").disabled = state.players.length >= MAX_PLAYERS;
  // 相手のフォーメーション（人数を変えたあとは ""＝今の相手をそのまま使う）。
  // 今のコートより人数が多い並び（フットサルなのにサッカーの 4-4-2 など）は、自チームの並びにそろえる。
  // カスタム（4-4-1 など一覧にない並び）でも、コートの人数に収まれば残す（11人制のコートは、12人以上の練習試合もあるので上限まで）
  const courtMax = Math.max(...court.list.map((f) => fieldCount(f) || 0));
  const oppMax = courtMax >= 10 ? MAX_PLAYERS - 1 : courtMax;
  if (state.oppFormation !== "" && (!fieldCount(state.oppFormation) || fieldCount(state.oppFormation) > oppMax)) {
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
  // 📐 並びの欄：自チーム・相手のタブ、人数、フォーメーション（プルダウン）、列ごとの形
  const opp = shapeSide === "opp";
  $("shapeTabOurs").setAttribute("aria-selected", String(!opp));
  $("shapeTabOpp").setAttribute("aria-selected", String(opp));
  $("ourStepper").hidden = opp;
  $("oppLayoutNone").setAttribute("aria-checked", String(!state.showOpp));
  $("oppLayoutFull").setAttribute("aria-checked", String(state.showOpp && state.oppLayout !== "half"));
  $("oppLayoutHalf").setAttribute("aria-checked", String(state.showOpp && state.oppLayout === "half"));
  $("oppStepper").hidden = !opp;
  const current = opp ? (state.showOpp ? state.oppFormation : "") : state.formation;
  const count = opp ? oppTotal() : state.players.length;
  const names = [...new Set([...(current && !court.list.includes(current) ? [current] : []), ...court.list])];
  const options = names.map((f) => Object.assign(document.createElement("option"), { value: f, textContent: f }));
  // 人数を変えて決まった並びがないとき・相手をまだ出していないときの見出し
  if (!current) options.unshift(Object.assign(document.createElement("option"), { value: "", textContent: opp && !state.showOpp ? "相手を出す…" : `${count}人（自由）` }));
  // カスタム：4-4-1 のように数を入れて決める（入れた数に合わせて人数も変わる）
  options.push(Object.assign(document.createElement("option"), { value: "__custom", textContent: "カスタム…（4-4-1 など）" }));
  $("formationSelect").replaceChildren(...options);
  $("formationSelect").value = current || "";
  const customInput = $("customFormation");
  const showCustom = (on) => {
    $("customRow").hidden = !on;
    if (on) {
      customInput.value = (current || "").replace(/-/g, "");
      customInput.focus();
    }
  };
  $("formationSelect").onchange = (e) => {
    const f = e.target.value;
    if (f === "__custom") return showCustom(true);
    showCustom(false);
    if (!f) return;
    if (opp) pickTheirs(f);
    else pickOurs(f);
  };
  $("customApply").onclick = () => {
    // 全角の数字・ハイフンも受け付ける（「４ー４ー１」→「4-4-1」）。
    // スマホの数字キーボードにはハイフンがないので、数字だけなら1けたずつ1列とみなす（「3241」→「3-2-4-1」）
    const typed = customInput.value
      .replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0))
      .replace(/[ー－‐−―\s・,、.]+/g, "-")
      .replace(/^-|-$/g, "");
    const f = /^\d+$/.test(typed) ? typed.split("").join("-") : typed;
    const field = fieldCount(f);
    if (!parseFormation(f).length || field < 1 || field > MAX_PLAYERS - 1 || parseFormation(f).some((n) => n < 1)) {
      $("shapeNote").textContent = `「441」か「4-4-1」のように、後ろの列から数を入れてください（GK のほかに 1〜${MAX_PLAYERS - 1} 人、5列まで）。`;
      return;
    }
    showCustom(false);
    if (opp) pickTheirs(f);
    else pickOurs(f);
  };
  customInput.onkeydown = (e) => {
    if (e.key === "Enter" && !e.isComposing) $("customApply").click();
  };
  if ($("customRow").hidden) $("shapeNote").textContent = opp && !state.showOpp ? "相手はいま出していません。「👁️ 表示」で出すか、ここでフォーメーションを選ぶと出ます。" : "";
  renderLineShapes(opp ? "opp" : "ours");
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
    // もう片方のチームと同じ色も選べるが、見分けにくいので薄くする（並びは変えない）
    const other = String(key === "ourColor" ? state.oppColor : state.ourColor).toLowerCase();
    const buttons = TEAM_COLORS.map((c) => {
      const b = chip("", current === c.hex, () => pick(c.hex));
      b.classList.add("color");
      b.style.background = c.hex;
      const taken = c.hex === other;
      b.classList.toggle("is-taken", taken);
      b.setAttribute("aria-label", taken ? `${c.label}（${key === "ourColor" ? "相手" : "自チーム"}と同じ色）` : c.label);
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
  $("toggleView").setAttribute("aria-pressed", String(viewMode));
  $("viewTools").hidden = !viewMode;
  $("ballOn").setAttribute("aria-checked", String(!!state.showBall));
  $("ballOff").setAttribute("aria-checked", String(!state.showBall));
  document.querySelectorAll("[data-marks]").forEach((b) => b.setAttribute("aria-checked", String((b.dataset.marks === "on") === (state.showMarks !== false))));
  board.classList.toggle("hide-marks", state.showMarks === false);
  document.querySelectorAll("[data-names]").forEach((b) => b.setAttribute("aria-checked", String((b.dataset.names === "on") === (state.showNames !== false))));
  // 👁️ 表示を開いているときは、そちらに同じ切りかえがあるので出さない
  $("clearMarks").hidden = !anyCardMarks();
  // 得点者の行が変わると、盤の ⚽ の印も変わる（得点者から数えるので）
  $("togglePen").setAttribute("aria-pressed", String(drawing));
  $("undo").disabled = !undoStack.length;
  $("penTools").hidden = !drawing;
  board.classList.toggle("hide-names", state.showNames === false);
  $("toggleShape").setAttribute("aria-pressed", String(shapeMode));
  $("shapeTools").hidden = !shapeMode;
  board.classList.toggle("is-drawing", drawing);
  $("boardHint").textContent = drawing
    ? "指でなぞって線を描けます。"
    : viewMode
      ? "盤に出すもの（相手・ボール・選手名・得点など）を選べます。"
    : shapeMode
      ? "フォーメーションと列の形を選ぶと、その形に並べ直します（背番号・名前はそのまま）。"
      : "ドラッグで移動。長押しで背番号・名前・得点やカード。タップや、何もない所をなぞって選ぶと、まとめて動かせます。";
  // チームの欄：人数（相手を出しているときは差も）
  const ours = state.players.length;
  const theirs = oppTotal();
  const vs = `${ours} 対 ${theirs}${ours > theirs ? "（数的有利）" : ours < theirs ? "（数的不利）" : ""}`;
  $("oppCount").textContent = `${theirs}人`;
  $("countVs").textContent = state.showOpp ? vs : "";
  $("removeOpp").disabled = theirs <= MIN_PLAYERS;
  $("addOpp").disabled = theirs >= MAX_PLAYERS;
  $("infoMeta").textContent = [whenText(), state.where].filter(Boolean).join("・") || "なし";
  renderVenues(); // 保存した場所のプルダウン（今の場所を選んでおく・保存ボタンの押せる／押せない）
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
  // 得点者の見出しの右
  const goalCount = state.goals.length;
  $("goalsMeta").textContent = goalCount ? `${goalCount}点` : "";
  // 👕 チーム・試合結果の欄の見出し：チーム名、試合結果を入れていれば間にスコア（「FC青 2 - 1 赤SC」）
  const played = Number(state.scoreUs) || Number(state.scoreThem) || state.goals.length;
  const score = played ? `${Number(state.scoreUs) || 0} - ${Number(state.scoreThem) || 0}` : "";
  $("teamMeta").textContent = score
    ? [state.team, score, state.opponent].filter(Boolean).join(" ")
    : state.team && state.opponent ? `${state.team} vs ${state.opponent}` : state.team || state.opponent;
  // 作戦盤の印のアシスト・カードは、そのまま結果のカードに入る（ゴール・OG は得点者そのもの）
  const { assists, cards } = marksForResult();
  const noteParts = [
    assists.length ? `👟 ${assists.map(([n, c]) => (c > 1 ? `${n}×${c}` : n)).join("・")}` : "",
    cards.length ? cards.map(([k, n, c]) => `${(k === "r" ? "🟥" : "🟨").repeat(c)} ${n}`).join("　") : ""
  ].filter(Boolean);
  $("marksNote").hidden = !noteParts.length;
  $("marksNote").textContent = noteParts.length ? `作戦盤の印から、カードにも入ります：${noteParts.join("　")}` : "";
  // 内訳の欄の見出しの右：入っているもの（例：前半・後半・PK）、なければ「なし」
  const periods = [["前半", "halfUs", "halfThem"], ["後半", "secondUs", "secondThem"], ["延長", "extraUs", "extraThem"], ["PK", "pkUs", "pkThem"]]
    .filter(([, a, b]) => state[a] !== "" && state[b] !== "")
    .map(([label]) => label);
  $("periodMeta").textContent = periods.join("・") || "なし";
  // おくるんへのリンク（押したときに最新を作る）
}

// 列ごとの形（自チームの今のフォーメーション）。2〜5人の列だけ、形のボタンを並べる。選ぶとその形で並べ直す
function renderLineShapes(side = "ours") {
  const opp = side === "opp";
  const formation = opp ? (state.showOpp ? state.oppFormation : "") : state.formation;
  const lines = parseFormation(formation);
  const box = $("lineShapes");
  const shapes = lineShapesOf(formation, side);
  const names = LINE_NAMES[lines.length] || lines.map((_, i) => `${i + 1}列目`);
  const rows = lines
    .map((count, i) => ({ count, i, options: LINE_SHAPES[count] }))
    .filter((line) => line.options)
    // 盤と同じ順：自チームは上が前（FW から）、相手は上が後ろ（相手の DF から。盤の上で向かい合うため）
    .sort((a, b) => (opp ? a.i - b.i : b.i - a.i));
  box.hidden = !rows.length;
  if (!rows.length) {
    box.replaceChildren();
    return;
  }
  const pick = (i, id) => {
    remember();
    animateTokens = true;
    const next = lines.map((_, j) => shapes[j] || "");
    next[i] = id;
    if (opp) {
      state.oppLineShapes = { ...(state.oppLineShapes || {}), [formation]: next };
      state.opp = opponents();
    } else {
      state.lineShapes = { ...(state.lineShapes || {}), [formation]: next };
      state.players = freshPlayers(state.mode, formation, state.players, state.showOpp, next);
    }
    selected.clear();
    render();
  };
  const title = document.createElement("p");
  title.className = "line-shapes-title";
  // 自チームは上が前、相手は下が前（盤の上で向かい合うため）
  title.textContent = `列ごとの形（${formation}・${opp ? "下" : "上"}が前）`;
  box.replaceChildren(
    title,
    ...rows.map(({ count, i, options }) => {
      const row = document.createElement("div");
      row.className = "line-shape-row";
      const label = document.createElement("span");
      label.className = "line-shape-label";
      label.textContent = `${names[i]} ${count}人`;
      const chips = document.createElement("div");
      chips.className = "chips";
      chips.setAttribute("role", "radiogroup");
      chips.setAttribute("aria-label", `${names[i]}の形`);
      const current = shapes[i] || (options.find((o) => o.default) || options[0]).id;
      chips.append(
        ...options.map((o) => {
          const b = chip(o.label, current === o.id, () => pick(i, o.id), "radio");
          if (o.title) b.title = o.title;
          return b;
        })
      );
      row.append(label, chips);
      return row;
    })
  );
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
  const [from, to] = on ? [FULL, versusFrame()] : [versusFrame(), FULL];
  state.players = state.players.map((p) => ({ ...p, y: Math.min(98, Math.max(2, fitY(p.y, from, to))) }));
  if (on) {
    // 相手がまだいない・今のコートに合わない人数（フットサルなのに 11 人など）のときは、自チームの人数・並びで出す
    const court = courtDef(state.court);
    const courtMax = Math.max(...court.list.map((f) => fieldCount(f) || 0));
    const tooMany = Array.isArray(state.opp) && state.opp.length > (courtMax >= 10 ? MAX_PLAYERS : courtMax + 1);
    if (!Array.isArray(state.opp) || !state.opp.length || tooMany) {
      state.oppFormation = state.formation || autoFormation(state.players.length - 1);
      state.opp = opponents();
    }
  }
  animateTokens = true;
}

// 相手の並べ方（フルコート・コート別）を切りかえる。自チームも相手も、GK はそのままで縦の広がりだけ変える
function setOppLayout(layout) {
  if ((state.oppLayout === "half" ? "half" : "full") === layout) return;
  remember();
  const from = versusFrame();
  state.oppLayout = layout;
  const to = versusFrame();
  if (state.showOpp) {
    const clamp = (y) => Math.min(98, Math.max(2, y));
    state.players = state.players.map((p) => ({ ...p, y: clamp(fitY(p.y, from, to)) }));
    if (Array.isArray(state.opp)) state.opp = state.opp.map((p) => ({ ...p, y: clamp(100 - fitY(100 - p.y, from, to)) }));
    animateTokens = true;
  }
  render();
}

// 相手は選んだフォーメーション（最初は自チームと同じ）を、上下・左右反対に置く
// 相手の人数（並べる前は、フォーメーションの人数）
const oppTotal = () => (Array.isArray(state.opp) && state.opp.length ? state.opp.length : fieldCount(state.oppFormation || state.formation) ? fieldCount(state.oppFormation || state.formation) + 1 : state.players.length);

function opponents() {
  const formation = state.oppFormation || autoFormation(oppTotal() - 1);
  const list = formationPositions(state.mode, formation, true, lineShapesOf(formation, "opp")).map((p, i) => ({ number: String(i + 1), name: "", x: 100 - p.x, y: 100 - p.y }));
  return spreadFromOurs(list);
}

// 並べ直したとき、自チームの選手とほとんど重なる相手は、横に少しずらす（自チームはそのまま）。
// 盤は 横3：縦4 なので、縦の差は 4/3 倍して見た目の距離で比べる。
// ずらす先がほかの相手とも重ならないところを、真ん中寄り → 反対側 の順に探す。見つからなければ動かさない
const OVERLAP = 8; // これより近いと「重なっている」（丸の大きさの7割ほど）
const SPREAD = 10; // ずらしたあとの距離
function spreadFromOurs(list) {
  const dist = (a, b) => Math.hypot(a.x - b.x, ((a.y - b.y) * 4) / 3);
  const out = list.map((o) => ({ ...o }));
  out.forEach((o, i) => {
    const p = state.players.find((q) => dist(o, q) < OVERLAP);
    if (!p) return;
    const others = out.filter((_, j) => j !== i);
    const free = (c) => state.players.every((q) => dist(c, q) >= OVERLAP) && others.every((q) => dist(c, q) >= OVERLAP);
    const dy = ((o.y - p.y) * 4) / 3;
    const dx = Math.sqrt(Math.max(0, SPREAD * SPREAD - dy * dy));
    const first = o.x === p.x ? (p.x <= 50 ? 1 : -1) : Math.sign(o.x - p.x);
    // 横にずらす → 足りなければ少し縦にも（相手側＝上へ）
    const tries = [first, -first].flatMap((dir) => [0, 4].map((up) => ({ x: Math.round(Math.min(96, Math.max(4, p.x + dir * dx)) * 10) / 10, y: o.y - up })));
    const spot = tries.find(free);
    if (spot) Object.assign(o, spot);
  });
  return out;
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
  fitMarks();
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
  // 交代して入った選手：丸の左上に小さく 🔄
  if (target.kind === "player" && p.subs?.length) el.append(Object.assign(document.createElement("i"), { className: "sub-mark", textContent: "🔄", ariaLabel: "交代" }));
  // 印（イエロー・レッド・ゴール・アシスト）：いつも丸の右下（盤からはみ出すときは fitMarks で選手をずらす）。
  // 相手は、試合結果の得点者から数えた ⚽・OG
  const marks = target.kind === "opp" ? oppMarksOf(p) : playerMarksOf(p);
  const parts = markParts(marks);
  if (parts.length) {
    const badge = document.createElement("em");
    badge.className = "marks";
    badge.setAttribute("aria-label", markText(marks));
    parts.forEach((part) => {
      for (let k = 0; k < part.count; k += 1) {
        if (part.red) {
          // オウンゴール：⚽ に赤を重ねた絵（作戦盤の画像と同じ。share.js の redBallDataUrl）
          const img = Object.assign(document.createElement("img"), { className: "mark-icon is-own-goal", src: redBallDataUrl(), alt: "" });
          badge.append(img);
        } else {
          const icon = Object.assign(document.createElement("span"), { className: "mark-icon" });
          icon.textContent = part.icon;
          badge.append(icon);
        }
      }
      if (part.label) badge.append(part.label);
    });
    el.append(badge);
  }
  place(el, p);
  el.classList.toggle("is-selected", selected.has(keyOf(target)));
  bindDrag(el, target);
  return el;
}

// 右下の印の札が盤の右からはみ出す選手は、はみ出さないところまで左へずらす（位置も残す）。
// 札は丸の中心から 7px 右が左端（style.css の .token .marks）
function fitMarks() {
  const width = board.clientWidth;
  if (!width) return;
  [...tokens.children].forEach((el) => {
    const badge = el.querySelector(".marks");
    const match = /^([po])(\d+)$/.exec(el.dataset.key || "");
    if (!badge || !match) return;
    const p = (match[1] === "p" ? state.players : state.opp || [])[Number(match[2])];
    const max = Math.floor((1 - (7 + badge.offsetWidth + 2) / width) * 1000) / 10;
    if (p && p.x > max) {
      p.x = max;
      place(el, p);
      save(STORE_KEY, state);
    }
  });
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
const LONG_PRESS_MS = 450; // 長押しとみなす長さ（ミリ秒）
function bindDrag(el, target) {
  // 長押しで出る OS のメニュー（画像の保存など）は出さない
  el.addEventListener("contextmenu", (event) => event.preventDefault());
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
    // 自チームの選手を動かさずに長押しすると、印（ゴール・カードなど）をすぐ付けるメニュー（sheets.js の openQuickMarks）
    let longPressed = false;
    // 相手を長押しすると、相手の得点（OG も）を記録するポップアップ
    const timer = (target.kind === "player" || target.kind === "opp") && !adding
      ? setTimeout(() => {
          longPressed = true;
          if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.(15); // 触れた合図（震えない端末は何もしない）
          if (target.kind === "opp") openOppQuick(target.index, el);
          else openQuickMarks(target.index, el);
        }, LONG_PRESS_MS)
      : 0;
    const onMove = (e) => {
      const far = Math.hypot(e.clientX - start.x, e.clientY - start.y);
      // 長押しでメニューが出たあとでも、押したまま動かしはじめたらメニューを閉じて移動にする
      // （少し止まってから動かす人もいるので、長押しが移動のじゃまをしないように。ずれは大きめに 12px で判断）
      if (longPressed) {
        if (far < 12) return;
        longPressed = false;
        closeQuickMarks();
      }
      if (!moved && far < 6) return;
      clearTimeout(timer);
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
      clearTimeout(timer);
      if (longPressed) return; // メニューのボタンはすぐ押せるように、あとのクリックは止めない
      if (moved) swallowClickUntil = Date.now() + 400;
      if (moved) render();
      else {
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
