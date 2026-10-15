// スタメン・作戦盤。選手をピッチに並べ、おくるん（お知らせカード）に JSON で渡して LINE にカードで送る。
// 試合結果も同じように渡す。作戦盤として、相手・ボール・ペンの線も使える（線と相手はカードには入れず、画像で保存できる）。
//
// おくるんへの渡し方: https://liff.line.me/<LIFF ID>/card/?kind=lineup|match&data=<JSON を UTF-8 → base64url>&…
//   lineup: { m: "futsal"|"soccer"（ピッチの描き方）, f（決まった並びでなければ ""）, t, o, s, pl: [[背番号, 名前, x, y], ...] }   x・y は 0〜100（左上から。上が攻める向き。先頭は GK）
//   match:  { t, o, us, th, hu, ht, g: [["u"|"t", 分, 名前], ...], mvp }
// おくるんの「配置・結果を直す」からは ?tab=lineup|result&data=… で戻ってくる。
(function () {
  "use strict";
  const OQRN_CARD = "https://liff.line.me/2009927876-DioOJd0z/card/";
  const STORE_KEY = "soccer:state";
  const ROSTER_KEY = "soccer:roster";
  const $ = (id) => document.getElementById(id);

  // フォーメーションは後ろの列から（"4-4-2"）。GK は別に先頭に置く。mode はピッチの描き方（サッカー／フットサル）
  const FORMATION_GROUPS = [
    { id: "soccer11", label: "サッカー（11人）", mode: "soccer", list: ["4-4-2", "4-3-3", "4-2-3-1", "3-5-2", "3-4-3"] },
    { id: "soccer8", label: "サッカー（8人制）", mode: "soccer", list: ["3-3-1", "2-3-2", "3-2-2", "2-4-1"] },
    { id: "futsal", label: "フットサル（5人）", mode: "futsal", list: ["1-2-1", "2-2", "3-1", "2-1-1"] }
  ];
  // 人数は変則もある（退場で10人、7人制など）。GK を入れて 2〜11 人
  const MIN_PLAYERS = 2;
  const MAX_PLAYERS = 11;
  const parseFormation = (f) => (/^\d{1,2}(-\d{1,2}){0,4}$/.test(String(f)) ? String(f).split("-").map(Number) : []);
  const fieldCount = (f) => parseFormation(f).reduce((a, b) => a + b, 0);
  // 決まったフォーメーションがない人数のときの並び（後ろ 4 割・前 2 割・残りが中盤）
  function autoFormation(n) {
    if (n <= 2) return String(Math.max(1, n));
    if (n <= 4) return `${Math.ceil(n / 2)}-${Math.floor(n / 2)}`;
    const back = Math.ceil(n * 0.4);
    const front = Math.max(1, Math.floor(n * 0.2));
    return `${back}-${n - back - front}-${front}`;
  }
  // コート（サッカー 11人・8人制・フットサル）。決まったフォーメーションが無いときは、ピッチと人数から決める
  const courtOf = (mode, f, count) =>
    (FORMATION_GROUPS.find((g) => g.mode === mode && g.list.includes(f)) || FORMATION_GROUPS.find((g) => g.id === (mode === "futsal" ? "futsal" : count <= 8 ? "soccer8" : "soccer11"))).id;
  const courtDef = (id) => FORMATION_GROUPS.find((g) => g.id === id) || FORMATION_GROUPS[0];
  const PEN_COLORS = ["#ffffff", "#ffd23f", "#ff5a5f", "#38bdf8"];
  // チームの色（自チーム・相手で選ぶ）。明るい色の丸は背番号を濃い色にする
  // おくるんの基本の色の並び（紫・スカイ・リーフ・サンセット・ベリー）。最後に「カスタム」（自由な色）
  const TEAM_COLORS = [
    { label: "おくるん", hex: "#6c47ff" },
    { label: "スカイ", hex: "#3e7bfa" },
    { label: "リーフ", hex: "#30a46c" },
    { label: "サンセット", hex: "#f5a524" },
    { label: "ベリー", hex: "#e5484d" }
  ];
  const GK_COLOR = "#f5a524";
  const isLight = (hex) => {
    const n = parseInt(String(hex).slice(1), 16);
    return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114 > 170;
  };
  const inkOn = (hex) => (isLight(hex) ? "#23302a" : "#ffffff");
  // GK は見分けやすいオレンジ。自チームがオレンジ系のときは黒
  const gkColor = () => (["#f97316", GK_COLOR, "#f5a524"].includes(String(state.ourColor).toLowerCase()) ? "#1f2937" : GK_COLOR);
  // カードの見出しの帯に使う色（白や黄色は帯にすると文字が読めないので、濃い緑にする）
  const cardColor = () => (isLight(state.ourColor) ? "#2e8b4a" : state.ourColor);

  // フォーメーションから位置を作る（GK が一番下、列は後ろから前へ）
  function formationPositions(mode, formation) {
    const parsed = parseFormation(formation);
    const lines = parsed.length ? parsed : parseFormation(mode === "futsal" ? "1-2-1" : "4-4-2");
    const spots = [{ x: 50, y: 88 }];
    const back = 70;
    const front = mode === "futsal" ? 26 : 18;
    lines.forEach((count, i) => {
      const y = lines.length === 1 ? 44 : Math.round(back - ((back - front) * i) / (lines.length - 1));
      const [left, right] = mode === "futsal" ? [24, 76] : [14, 86];
      for (let j = 0; j < count; j += 1) {
        spots.push({ x: count === 1 ? 50 : Math.round(left + ((right - left) * j) / (count - 1)), y });
      }
    });
    return spots;
  }

  function freshPlayers(mode, formation, old = []) {
    return formationPositions(mode, formation).map((spot, i) => ({
      number: old[i]?.number ?? String(i + 1),
      name: old[i]?.name ?? "",
      ...spot
    }));
  }

  // ---- 状態（この端末に残す） ----
  const load = (key, fallback) => {
    try {
      return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch {
      return fallback;
    }
  };
  const save = (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // 残せなくても使える
    }
  };

  const state = Object.assign(
    {
      tab: "lineup",
      court: "soccer11",
      mode: "soccer",
      formation: "4-4-2",
      players: freshPlayers("soccer", "4-4-2"),
      showOpp: false,
      showBall: false,
      ball: { x: 50, y: 50 },
      strokes: [],
      penColor: PEN_COLORS[0],
      team: "",
      opponent: "",
      when: "",
      where: "",
      subs: "",
      lineupNote: "",
      scoreUs: 0,
      scoreThem: 0,
      halfUs: "",
      halfThem: "",
      secondUs: "",
      secondThem: "",
      extraUs: "",
      extraThem: "",
      pkUs: "",
      pkThem: "",
      oppFormation: "4-4-2",
      ourColor: "#6c47ff",
      oppColor: "#ffffff",
      goals: [],
      mvp: "",
      resultNote: ""
    },
    load(STORE_KEY, {})
  );
  let drawing = false; // ペンで描くモード（作戦盤の線）
  let editMode = false; // 選手の名前・背番号を変えるモード（それ以外のときは、タップは選ぶだけ）

  // 戻す：作戦盤の変更の前に、そのときの様子を残しておく（この画面を開いている間だけ）
  const BOARD_KEYS = ["court", "mode", "formation", "oppFormation", "players", "opp", "ball", "showOpp", "showBall", "strokes", "ourColor", "oppColor"];
  const undoStack = [];
  function remember() {
    undoStack.push(JSON.stringify(Object.fromEntries(BOARD_KEYS.map((k) => [k, state[k]]))));
    if (undoStack.length > 50) undoStack.shift();
  }
  function undo() {
    const last = undoStack.pop();
    if (!last) return;
    Object.assign(state, JSON.parse(last));
    selected.clear();
    render();
  }
  let roster = load(ROSTER_KEY, "");
  if (!courtDef(state.court) || courtDef(state.court).id !== state.court || courtDef(state.court).mode !== state.mode) state.court = courtOf(state.mode, state.formation, state.players.length);

  // おくるんの「配置・結果を直す」から戻ってきたとき
  applyQuery();

  function applyQuery() {
    const q = new URLSearchParams(location.search);
    const data = decode(q.get("data"));
    if (q.get("tab") === "result") state.tab = "result";
    if (q.get("tab") === "lineup") state.tab = "lineup";
    if (data && Array.isArray(data.pl)) {
      state.mode = data.m === "futsal" ? "futsal" : "soccer";
      state.players = data.pl.slice(0, MAX_PLAYERS).map((p) => ({ number: String(p[0] ?? ""), name: String(p[1] ?? ""), x: Number(p[2]) || 50, y: Number(p[3]) || 50 }));
      state.formation = fieldCount(data.f) === state.players.length - 1 ? data.f : "";
      state.court = courtOf(state.mode, state.formation, state.players.length);
      Object.assign(state, { team: data.t || state.team, opponent: data.o || state.opponent, subs: data.s || "" });
    } else if (data && "us" in data) {
      Object.assign(state, {
        team: data.t || state.team,
        opponent: data.o || state.opponent,
        scoreUs: data.us,
        scoreThem: data.th,
        halfUs: data.hu ?? "",
        halfThem: data.ht ?? "",
        secondUs: data.su ?? "",
        secondThem: data.st ?? "",
        extraUs: data.eu ?? "",
        extraThem: data.et ?? "",
        pkUs: data.pu ?? "",
        pkThem: data.pt ?? "",
        goals: (data.g || []).map((g) => ({ side: g[0], min: g[1], name: g[2] })),
        mvp: data.mvp || ""
      });
    }
    if (q.has("data")) history.replaceState(null, "", location.pathname);
  }

  function encode(value) {
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    let binary = "";
    bytes.forEach((b) => (binary += String.fromCharCode(b)));
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function decode(text) {
    if (!text) return null;
    try {
      const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
      return JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0))));
    } catch {
      return null;
    }
  }

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
    const ourList = court.list.includes(state.formation) || !state.formation ? court.list : [state.formation, ...court.list];
    $("formationChips").replaceChildren(
      ...(state.formation ? [] : [chip(`${state.players.length}人（自由）`, true, () => {}, "radio")]),
      ...ourList.map((f) =>
        chip(f, state.formation === f, () => {
          remember();
          // 人数が変わるときは、相手も同じ並びにする
          if (fieldCount(f) !== state.players.length - 1) state.oppFormation = f;
          state.formation = f;
          state.players = freshPlayers(state.mode, f, state.players);
          state.opp = opponents();
          selected.clear();
          render();
        }, "radio")
      )
    );
    // 相手のフォーメーション（相手を出しているときだけ）
    if (state.oppFormation !== "" && !fieldCount(state.oppFormation)) state.oppFormation = state.formation || autoFormation(state.players.length - 1);
    if (state.oppFormation === "" && !Array.isArray(state.opp)) state.oppFormation = state.formation || autoFormation(state.players.length - 1);
    // 相手のフォーメーションを選んだら、相手も表示する
    const oppList = [...court.list];
    if (state.oppFormation && !oppList.includes(state.oppFormation)) oppList.unshift(state.oppFormation);
    $("oppFormationChips").replaceChildren(
      ...(state.showOpp && !state.oppFormation ? [chip(`${oppTotal()}人（自由）`, true, () => {}, "radio")] : []),
      ...oppList.map((f) =>
        chip(f, state.showOpp && state.oppFormation === f, () => {
          remember();
          state.oppFormation = f;
          state.opp = opponents();
          state.showOpp = true;
          render();
        }, "radio")
      )
    );
    $("oppHint").textContent = state.showOpp ? "" : "（選ぶと表示）";
    // チームの色
    const swatches = (key) => {
      const pick = (hex) => {
        remember();
        state[key] = hex;
        if (key === "oppColor") state.showOpp = true;
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
    $("teamMeta").textContent = `${state.formation || `${ours}人`}${state.showOpp ? `・${ours} 対 ${theirs}` : ""}`;
    $("removeOpp").disabled = theirs <= MIN_PLAYERS;
    $("addOpp").disabled = theirs >= MAX_PLAYERS;
    $("infoMeta").textContent = [state.team, state.opponent && `vs ${state.opponent}`].filter(Boolean).join(" ") || "なし";
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
    // 得点・MVP の欄の見出しの右
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

  // 相手は選んだフォーメーション（最初は自チームと同じ）を、上下・左右反対に置く
  // 相手の人数（並べる前は、フォーメーションの人数）
  const oppTotal = () => (Array.isArray(state.opp) && state.opp.length ? state.opp.length : fieldCount(state.oppFormation || state.formation) ? fieldCount(state.oppFormation || state.formation) + 1 : state.players.length);

  function opponents() {
    const formation = state.oppFormation || autoFormation(oppTotal() - 1);
    return formationPositions(state.mode, formation).map((p, i) => ({ number: String(i + 1), name: "", x: 100 - p.x, y: 100 - p.y }));
  }

  // 範囲で選んだもの（"p3"＝自チームの4人目、"o0"＝相手のGK、"ball"）。選んだものはまとめて動く
  const selected = new Set();
  const keyOf = (target) => (target.kind === "ball" ? "ball" : `${target.kind === "player" ? "p" : "o"}${target.index}`);

  function renderTokens() {
    const list = state.players.map((p, i) => tokenEl(p, i === 0 ? "is-gk" : "", { kind: "player", index: i }));
    if (state.showOpp) {
      if (!Array.isArray(state.opp) || (state.oppFormation && state.opp.length !== fieldCount(state.oppFormation) + 1)) state.opp = opponents();
      state.opp.forEach((p, i) => list.push(tokenEl(p, "is-opp", { kind: "opp", index: i })));
    }
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
  }

  function tokenEl(p, extra, target) {
    const el = document.createElement("span");
    el.className = `token ${extra}`;
    el.dataset.key = keyOf(target);
    el.innerHTML = "<b></b><small></small>";
    const number = el.querySelector("b");
    number.textContent = p.number || "";
    // 色：自チーム（GK は別の色）・相手
    const fill = target.kind === "opp" ? state.oppColor : target.index === 0 ? gkColor() : state.ourColor;
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

  // ---- ペン（作戦盤の線。位置は % で持つ） ----
  function drawInk() {
    const rect = board.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    ink.width = Math.round(rect.width * dpr);
    ink.height = Math.round(rect.height * dpr);
    const ctx = ink.getContext("2d");
    ctx.scale(dpr, dpr);
    for (const stroke of state.strokes) drawStroke(ctx, stroke, rect.width, rect.height, 3);
  }

  function drawStroke(ctx, stroke, w, h, width) {
    const pts = stroke.points.map(([x, y]) => [(x / 100) * w, (y / 100) * h]);
    if (pts.length < 2) return;
    ctx.strokeStyle = stroke.color;
    ctx.fillStyle = stroke.color;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
  }

  ink.addEventListener("pointerdown", (event) => {
    if (!drawing) return;
    event.preventDefault();
    try {
      ink.setPointerCapture(event.pointerId);
    } catch {
      // つかめなくても描ける
    }
    const rect = board.getBoundingClientRect();
    const point = (e) => [Math.round(((e.clientX - rect.left) / rect.width) * 1000) / 10, Math.round(((e.clientY - rect.top) / rect.height) * 1000) / 10];
    remember();
    const stroke = { color: state.penColor, points: [point(event)] };
    state.strokes.push(stroke);
    const onMove = (e) => {
      stroke.points.push(point(e));
      drawInk();
    };
    const onUp = () => {
      ink.removeEventListener("pointermove", onMove);
      ink.removeEventListener("pointerup", onUp);
      if (stroke.points.length < 2) {
        state.strokes.pop();
        undoStack.pop();
      }
      swallowClickUntil = Date.now() + 400;
      render();
    };
    ink.addEventListener("pointermove", onMove);
    ink.addEventListener("pointerup", onUp);
  });

  // ---- 作戦の保存（場面ごとの配置と線。チームの色は含めない。この端末に残す） ----
  const TACTICS_KEY = "soccer:tactics";
  const TACTIC_KEYS = ["court", "mode", "formation", "oppFormation", "players", "opp", "ball", "showOpp", "showBall", "strokes"];
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

  function openPlayer(index) {
    editing = index;
    const p = state.players[index];
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
          $("sendResult").href = resultCardUrl();
        });
        name.addEventListener("input", () => {
          g.name = name.value.trim();
          save(STORE_KEY, state);
          $("sendResult").href = resultCardUrl();
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

  // ---- おくるんへのリンク ----
  function lineupCardUrl() {
    const data = {
      m: state.mode,
      f: state.formation,
      t: state.team,
      o: state.opponent,
      s: state.subs,
      c: state.ourColor,
      pl: state.players.map((p) => [p.number, p.name, p.x, p.y])
    };
    const q = new URLSearchParams({
      kind: "lineup",
      headerTitle: "スタメン発表",
      date: state.when || "",
      showDate: state.when ? "true" : "false",
      title: state.opponent ? `vs ${state.opponent}` : state.team || "スタメン",
      detail: [state.where && `📍 ${state.where}`, state.lineupNote].filter(Boolean).join("\n"),
      showDetail: state.where || state.lineupNote ? "true" : "false",
      bubbleSize: "mega",
      theme: "custom",
      customColor: cardColor(),
      data: encode(data),
      from: "soccer"
    });
    return `${OQRN_CARD}?${q}`;
  }

  function resultCardUrl() {
    const num = (v) => (v === "" || v === null || v === undefined ? "" : Number(v) || 0);
    const data = {
      t: state.team,
      o: state.opponent,
      us: num(state.scoreUs) || 0,
      th: num(state.scoreThem) || 0,
      hu: num(state.halfUs),
      ht: num(state.halfThem),
      su: num(state.secondUs),
      st: num(state.secondThem),
      eu: num(state.extraUs),
      et: num(state.extraThem),
      pu: num(state.pkUs),
      pt: num(state.pkThem),
      g: state.goals.map((g) => [g.side, g.min, g.name]),
      mvp: state.mvp
    };
    const q = new URLSearchParams({
      kind: "match",
      headerTitle: "試合結果",
      date: state.when || "",
      showDate: state.when ? "true" : "false",
      title: [state.where].filter(Boolean).join(" ") || "試合結果",
      detail: state.resultNote,
      showDetail: state.resultNote ? "true" : "false",
      bubbleSize: "mega",
      theme: "custom",
      customColor: cardColor(),
      data: encode(data),
      from: "soccer"
    });
    return `${OQRN_CARD}?${q}`;
  }

  // ---- 作戦盤の画像（線・相手・ボールも入る）。保存にも、カードの写真にも使う ----
  async function boardCanvas() {
    if (document.fonts?.ready) await document.fonts.ready;
    const W = 1080;
    const H = Math.round(W * (state.mode === "futsal" ? 1.5 : 4 / 3));
    const head = 120;
    const canvas = Object.assign(document.createElement("canvas"), { width: W, height: H + head });
    const ctx = canvas.getContext("2d");
    const font = (size, weight = 800) => `${weight} ${size}px "M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", sans-serif`;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H + head);
    ctx.fillStyle = "#23302a";
    ctx.font = font(44);
    ctx.textAlign = "center";
    ctx.fillText([state.team || "", state.opponent ? `vs ${state.opponent}` : ""].filter(Boolean).join(" ") || "作戦盤", W / 2, 60);
    ctx.font = font(28, 700);
    ctx.fillStyle = "#5c6b62";
    const vs = state.showOpp && oppTotal() !== state.players.length ? ` 対 ${oppTotal()}人` : "";
    const count = `${state.mode === "futsal" ? "フットサル" : "サッカー"} ${state.players.length}人${vs}${state.formation ? `・${state.formation}` : ""}`;
    ctx.fillText(`${count}${state.when ? `・${state.when}` : ""}`, W / 2, 100);
    ctx.save();
    ctx.translate(0, head);
    ctx.fillStyle = "#2e8b4a";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(255,255,255,0.67)";
    ctx.lineWidth = 5;
    const rect = (x, y, w, h) => ctx.strokeRect((x / 100) * W, (y / 100) * H, (w / 100) * W, (h / 100) * H);
    rect(5, 4, 90, 92);
    if (state.mode === "futsal") {
      // ゴール前のエリア（D形）：幅70%・奥行き15%。両端が丸い形の半分（おくるんのカードと同じ形）
      const d = 0.15 * H;
      const dArea = (top) => {
        ctx.save();
        ctx.beginPath();
        ctx.rect(0.15 * W - 4, top, 0.7 * W + 8, d);
        ctx.clip();
        ctx.beginPath();
        ctx.roundRect(0.15 * W, top === 0.04 * H ? top - d : top, 0.7 * W, d * 2, d);
        ctx.stroke();
        ctx.restore();
      };
      dArea(0.04 * H);
      dArea(0.96 * H - d);
    } else {
      rect(28, 4, 44, 13);
      rect(28, 83, 44, 13);
    }
    ctx.beginPath();
    ctx.moveTo(0.05 * W, H / 2);
    ctx.lineTo(0.95 * W, H / 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, W * (state.mode === "futsal" ? 0.09 : 0.11), 0, Math.PI * 2);
    ctx.stroke();
    for (const stroke of state.strokes) drawStroke(ctx, stroke, W, H, 8);
    const drawToken = (p, fill, text, numberColor = "#ffffff") => {
      const x = (p.x / 100) * W;
      const y = (p.y / 100) * H;
      ctx.beginPath();
      ctx.arc(x, y, 34, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.strokeStyle = numberColor === "#ffffff" ? "#ffffff" : "#23302a";
      ctx.stroke();
      ctx.fillStyle = numberColor;
      ctx.font = font(30);
      ctx.textAlign = "center";
      ctx.fillText(p.number || "", x, y + 11);
      if (text) {
        ctx.font = font(26);
        ctx.lineWidth = 6;
        ctx.strokeStyle = "rgba(0,0,0,0.45)";
        ctx.strokeText(text, x, y + 70);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(text, x, y + 70);
      }
    };
    if (state.showOpp) (state.opp || opponents()).forEach((p) => drawToken(p, state.oppColor, "", inkOn(state.oppColor)));
    state.players.forEach((p, i) => {
      const fill = i === 0 ? gkColor() : state.ourColor;
      drawToken(p, fill, p.name, inkOn(fill));
    });
    if (state.showBall) {
      ctx.font = font(56, 400);
      ctx.fillText("⚽", (state.ball.x / 100) * W, (state.ball.y / 100) * H + 20);
    }
    ctx.restore();
    return canvas;
  }

  async function saveBoardImage() {
    const canvas = await boardCanvas();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    const url = URL.createObjectURL(blob);
    const file = new File([blob], "作戦盤.png", { type: "image/png" });
    const sheet = document.createElement("div");
    sheet.className = "sheet";
    sheet.innerHTML = '<div class="sheet-card"><img alt="作戦盤の画像"><p class="hint">画像を長押しすると保存できます。</p><div class="actions"></div><button class="link" type="button">閉じる</button></div>';
    sheet.querySelector("img").src = url;
    const actions = sheet.querySelector(".actions");
    if (navigator.canShare?.({ files: [file] })) {
      const share = Object.assign(document.createElement("button"), { type: "button", className: "btn", textContent: "📤 共有・保存" });
      share.onclick = () => navigator.share({ files: [file] }).catch(() => {});
      actions.append(share);
    }
    actions.append(Object.assign(document.createElement("a"), { className: "btn ghost", href: url, download: file.name, textContent: "⬇️ ダウンロード" }));
    const close = () => {
      sheet.remove();
      URL.revokeObjectURL(url);
    };
    sheet.querySelector(".link").onclick = close;
    sheet.addEventListener("click", (e) => {
      if (e.target === sheet) close();
    });
    document.body.append(sheet);
  }

  // ---- 作戦盤の画像をカードで送る ----
  // 画像をおくるんの画像サーバー（無料。しばらく使わないと眠り、時間がたつと画像が消えることがある）に保存し、
  // その画像を写真にしたお知らせカードをおくるんで開く
  const IMAGE_API = "https://liff-image.onrender.com";

  async function sendBoardImage() {
    const button = $("sendBoardImage");
    if (button.disabled) return;
    button.disabled = true;
    const started = Date.now();
    const timer = setInterval(() => {
      const sec = Math.floor((Date.now() - started) / 1000);
      $("imageStatus").textContent = `画像を保存しています… ${sec}秒${sec >= 6 ? "（はじめは30秒ほどかかることがあります）" : ""}`;
    }, 1000);
    $("imageStatus").textContent = "画像を作っています…";
    try {
      const canvas = await boardCanvas();
      const response = await fetch(`${IMAGE_API}/api/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageData: canvas.toDataURL("image/jpeg", 0.88) })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !/^https:\/\//.test(data.imageUrl || "")) throw new Error(`upload ${response.status}`);
      $("imageStatus").textContent = "おくるんを開いています…";
      location.href = boardImageCardUrl(data.imageUrl);
    } catch (error) {
      console.error(error);
      $("imageStatus").textContent = "画像を保存できませんでした。時間をおいてもう一度お試しください。";
    } finally {
      clearInterval(timer);
      button.disabled = false;
    }
  }

  function boardImageCardUrl(imageUrl) {
    const q = new URLSearchParams({
      headerTitle: state.showOpp || state.strokes.length ? "作戦盤" : "スタメン発表",
      date: state.when || "",
      showDate: state.when ? "true" : "false",
      title: state.opponent ? `vs ${state.opponent}` : state.team || "スタメン",
      detail: [state.where && `📍 ${state.where}`, state.subs && `控え：${state.subs}`, state.lineupNote].filter(Boolean).join("\n"),
      showDetail: state.where || state.subs || state.lineupNote ? "true" : "false",
      imageUrl,
      bubbleSize: "giga",
      theme: "custom",
      customColor: cardColor(),
      from: "soccer"
    });
    return `${OQRN_CARD}?${q}`;
  }

  // 画像サーバーは眠っていると最初の保存が遅いので、開いた時点で起こしておく
  fetch(`${IMAGE_API}/health`, { mode: "no-cors", cache: "no-store" }).catch(() => {});

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
  $("toggleOpp").addEventListener("click", () => {
    remember();
    state.showOpp = !state.showOpp;
    // 前に並べた相手（人数・位置）はそのまま残す
    if (state.showOpp && !Array.isArray(state.opp)) state.opp = opponents();
    render();
  });
  $("toggleBall").addEventListener("click", () => {
    remember();
    state.showBall = !state.showBall;
    render();
  });
  $("togglePen").addEventListener("click", () => {
    drawing = !drawing;
    if (drawing) editMode = false;
    render();
  });
  $("toggleEdit").addEventListener("click", () => {
    editMode = !editMode;
    if (editMode) drawing = false;
    selected.clear();
    render();
  });
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
    state.showOpp = true;
    render();
  });
  $("removeOpp").addEventListener("click", () => {
    if (oppTotal() <= MIN_PLAYERS) return;
    remember();
    if (!Array.isArray(state.opp)) state.opp = opponents();
    state.opp.pop();
    state.oppFormation = "";
    state.showOpp = true;
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
  $("saveBoard").addEventListener("click", () => {
    shareSheet.hidden = true;
    saveBoardImage();
  });
  $("sendBoardImage").addEventListener("click", sendBoardImage);

  // 入力欄（チーム名などは2つのタブで共通。同じクラスの欄をそろえる）
  const shared = { team: ".team", opponent: ".opponent", when: ".when", where: ".where" };
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

  render();
  renderTactics();
})();
