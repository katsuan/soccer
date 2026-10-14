// スタメン・作戦盤。選手をピッチに並べ、おくるん（お知らせカード）に JSON で渡して LINE にカードで送る。
// 試合結果も同じように渡す。作戦盤として、相手・ボール・ペンの線も使える（線と相手はカードには入れず、画像で保存できる）。
//
// おくるんへの渡し方: https://liff.line.me/<LIFF ID>/card/?kind=lineup|match&data=<JSON を UTF-8 → base64url>&…
//   lineup: { m: "futsal"|"soccer", f, t, o, s, pl: [[背番号, 名前, x, y], ...] }   x・y は 0〜100（左上から。上が攻める向き。先頭は GK）
//   match:  { t, o, us, th, hu, ht, g: [["u"|"t", 分, 名前], ...], mvp }
// おくるんの「配置・結果を直す」からは ?tab=lineup|result&data=… で戻ってくる。
(function () {
  "use strict";
  const OQRN_CARD = "https://liff.line.me/2009927876-DioOJd0z/card/";
  const STORE_KEY = "soccer:state";
  const ROSTER_KEY = "soccer:roster";
  const $ = (id) => document.getElementById(id);

  // フォーメーションは後ろの列から。GK は別に先頭に置く
  const FORMATIONS = {
    futsal: { label: "フットサル 5人", list: { "1-2-1": [1, 2, 1], "2-2": [2, 2], "3-1": [3, 1], "2-1-1": [2, 1, 1] } },
    soccer: { label: "サッカー 11人", list: { "4-4-2": [4, 4, 2], "4-3-3": [4, 3, 3], "4-2-3-1": [4, 2, 3, 1], "3-5-2": [3, 5, 2], "3-4-3": [3, 4, 3] } }
  };
  const PEN_COLORS = ["#ffffff", "#ffd23f", "#ff5a5f", "#38bdf8"];

  // フォーメーションから位置を作る（GK が一番下、列は後ろから前へ）
  function formationPositions(mode, formation) {
    const lines = FORMATIONS[mode].list[formation] || Object.values(FORMATIONS[mode].list)[0];
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
      goals: [],
      mvp: "",
      resultNote: ""
    },
    load(STORE_KEY, {})
  );
  let drawing = false; // ペンで描くモード（作戦盤の線）
  let roster = load(ROSTER_KEY, "");

  // おくるんの「配置・結果を直す」から戻ってきたとき
  applyQuery();

  function applyQuery() {
    const q = new URLSearchParams(location.search);
    const data = decode(q.get("data"));
    if (q.get("tab") === "result") state.tab = "result";
    if (q.get("tab") === "lineup") state.tab = "lineup";
    if (data && Array.isArray(data.pl)) {
      state.mode = data.m === "futsal" ? "futsal" : "soccer";
      state.formation = FORMATIONS[state.mode].list[data.f] ? data.f : Object.keys(FORMATIONS[state.mode].list)[0];
      state.players = data.pl.map((p) => ({ number: String(p[0] ?? ""), name: String(p[1] ?? ""), x: Number(p[2]) || 50, y: Number(p[3]) || 50 }));
      Object.assign(state, { team: data.t || state.team, opponent: data.o || state.opponent, subs: data.s || "" });
    } else if (data && "us" in data) {
      Object.assign(state, {
        team: data.t || state.team,
        opponent: data.o || state.opponent,
        scoreUs: data.us,
        scoreThem: data.th,
        halfUs: data.hu ?? "",
        halfThem: data.ht ?? "",
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
    // 人数・フォーメーション
    $("modeChips").replaceChildren(
      ...Object.entries(FORMATIONS).map(([key, def]) =>
        chip(def.label, state.mode === key, () => {
          if (state.mode === key) return;
          state.mode = key;
          state.formation = Object.keys(def.list)[0];
          state.players = freshPlayers(key, state.formation, state.players);
          state.strokes = [];
          render();
        }, "radio")
      )
    );
    $("formationChips").replaceChildren(
      ...Object.keys(FORMATIONS[state.mode].list).map((f) =>
        chip(f, state.formation === f, () => {
          state.formation = f;
          state.players = freshPlayers(state.mode, f, state.players);
          render();
        }, "radio")
      )
    );
    board.classList.toggle("is-futsal", state.mode === "futsal");
    renderTokens();
    drawInk();
    // 作戦盤の道具
    $("toggleOpp").setAttribute("aria-pressed", String(state.showOpp));
    $("toggleBall").setAttribute("aria-pressed", String(state.showBall));
    $("togglePen").setAttribute("aria-pressed", String(drawing));
    $("penTools").hidden = !drawing;
    board.classList.toggle("is-drawing", drawing);
    $("boardHint").textContent = drawing ? "指でなぞって線を描けます（終わりに矢印が付きます）。" : "選手をドラッグで移動、タップで名前・背番号。";
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

  // 相手は同じフォーメーションを上下・左右反対に置く
  function opponents() {
    return formationPositions(state.mode, state.formation).map((p, i) => ({ number: String(i + 1), name: "", x: 100 - p.x, y: 100 - p.y }));
  }

  function renderTokens() {
    const list = state.players.map((p, i) => tokenEl(p, i === 0 ? "is-gk" : "", { kind: "player", index: i }));
    if (state.showOpp) {
      state.opp ||= opponents();
      state.opp.forEach((p, i) => list.push(tokenEl(p, "is-opp", { kind: "opp", index: i })));
    }
    if (state.showBall) {
      const ball = document.createElement("span");
      ball.className = "token is-ball";
      ball.textContent = "⚽";
      place(ball, state.ball);
      bindDrag(ball, { kind: "ball" });
      list.push(ball);
    }
    tokens.replaceChildren(...list);
  }

  function tokenEl(p, extra, target) {
    const el = document.createElement("span");
    el.className = `token ${extra}`;
    el.innerHTML = "<b></b><small></small>";
    el.querySelector("b").textContent = p.number || "";
    el.querySelector("small").textContent = p.name || "";
    place(el, p);
    bindDrag(el, target);
    return el;
  }

  const place = (el, p) => {
    el.style.left = `${p.x}%`;
    el.style.top = `${p.y}%`;
  };

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
      let moved = false;
      const onMove = (e) => {
        if (!moved && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 6) return;
        moved = true;
        el.classList.add("is-dragging");
        const item = itemOf(target);
        item.x = Math.round(Math.min(98, Math.max(2, ((e.clientX - rect.left) / rect.width) * 100)));
        item.y = Math.round(Math.min(98, Math.max(2, ((e.clientY - rect.top) / rect.height) * 100)));
        place(el, item);
      };
      const onUp = () => {
        el.removeEventListener("pointermove", onMove);
        el.removeEventListener("pointerup", onUp);
        el.removeEventListener("pointercancel", onUp);
        el.classList.remove("is-dragging");
        if (moved) swallowClickUntil = Date.now() + 400;
        if (moved) render();
        else if (target.kind === "player") openPlayer(target.index);
      };
      el.addEventListener("pointermove", onMove);
      el.addEventListener("pointerup", onUp);
      el.addEventListener("pointercancel", onUp);
    });
  }

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
    // 終わりに矢印
    const [x2, y2] = pts[pts.length - 1];
    const [x1, y1] = pts[Math.max(0, pts.length - 6)];
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const size = width * 4;
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - size * Math.cos(angle - 0.45), y2 - size * Math.sin(angle - 0.45));
    ctx.lineTo(x2 - size * Math.cos(angle + 0.45), y2 - size * Math.sin(angle + 0.45));
    ctx.closePath();
    ctx.fill();
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
    const stroke = { color: state.penColor, points: [point(event)] };
    state.strokes.push(stroke);
    const onMove = (e) => {
      stroke.points.push(point(e));
      drawInk();
    };
    const onUp = () => {
      ink.removeEventListener("pointermove", onMove);
      ink.removeEventListener("pointerup", onUp);
      if (stroke.points.length < 2) state.strokes.pop();
      swallowClickUntil = Date.now() + 400;
      render();
    };
    ink.addEventListener("pointermove", onMove);
    ink.addEventListener("pointerup", onUp);
  });

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
        const side = Object.assign(document.createElement("span"), { className: "side", textContent: g.side === "t" ? "相手" : "自分たち" });
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
      data: encode(data),
      from: "soccer"
    });
    return `${OQRN_CARD}?${q}`;
  }

  // ---- 作戦盤を画像で保存（線・相手・ボールも入る） ----
  async function saveBoardImage() {
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
    ctx.fillText(`${FORMATIONS[state.mode].label}・${state.formation}${state.when ? `・${state.when}` : ""}`, W / 2, 100);
    ctx.save();
    ctx.translate(0, head);
    ctx.fillStyle = "#2e8b4a";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(255,255,255,0.67)";
    ctx.lineWidth = 5;
    const rect = (x, y, w, h) => ctx.strokeRect((x / 100) * W, (y / 100) * H, (w / 100) * W, (h / 100) * H);
    rect(5, 4, 90, 92);
    rect(28, 4, 44, 13);
    rect(28, 83, 44, 13);
    ctx.beginPath();
    ctx.moveTo(0.05 * W, H / 2);
    ctx.lineTo(0.95 * W, H / 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, W * 0.11, 0, Math.PI * 2);
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
    if (state.showOpp) (state.opp || opponents()).forEach((p) => drawToken(p, "#ffffff", "", "#23302a"));
    state.players.forEach((p, i) => drawToken(p, i === 0 ? "#f5a524" : "#6c47ff", p.name));
    if (state.showBall) {
      ctx.font = font(56, 400);
      ctx.fillText("⚽", (state.ball.x / 100) * W, (state.ball.y / 100) * H + 20);
    }
    ctx.restore();
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

  // ---- 操作 ----
  for (const tab of document.querySelectorAll(".tab")) {
    tab.addEventListener("click", () => {
      state.tab = tab.dataset.tab;
      render();
    });
  }
  $("toggleOpp").addEventListener("click", () => {
    state.showOpp = !state.showOpp;
    if (state.showOpp) state.opp = opponents();
    render();
  });
  $("toggleBall").addEventListener("click", () => {
    state.showBall = !state.showBall;
    render();
  });
  $("togglePen").addEventListener("click", () => {
    drawing = !drawing;
    render();
  });
  $("inkUndo").addEventListener("click", () => {
    state.strokes.pop();
    render();
  });
  $("inkClear").addEventListener("click", () => {
    state.strokes = [];
    render();
  });
  $("resetPositions").addEventListener("click", () => {
    state.players = freshPlayers(state.mode, state.formation, state.players);
    state.opp = opponents();
    state.ball = { x: 50, y: 50 };
    render();
  });
  $("saveBoard").addEventListener("click", saveBoardImage);

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
  const single = { subs: "subs", lineupNote: "lineupNote", mvp: "mvp", resultNote: "resultNote", scoreUs: "scoreUs", scoreThem: "scoreThem", halfUs: "halfUs", halfThem: "halfThem" };
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
})();
