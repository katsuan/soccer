// さくせん盤：おくるんへのリンク・作戦盤の画像（保存・カードの写真）
// ファイルは index.html に書いた順（core → board → ink → tactics → sheets → share → events → app.js）に読み、同じ範囲の変数（state など）を使う
"use strict";

// ---- おくるんへのリンク ----
// スタメン（選手の位置）の中身。おくるんのカードにも、作戦盤を開くリンクにも使う。
// 👁️ 表示に合わせる：選手名を出さないなら名前を外し、相手を出しているなら相手（op: [[背番号, 名前, x, y], ...]・oc: 相手の色）も入れる
const lineupData = () => {
  const name = (p) => (state.showNames === false ? "" : p.name || "");
  const r = (v) => Math.round(v);
  return {
    m: state.mode,
    f: state.formation,
    t: state.team,
    o: state.opponent,
    c: state.ourColor,
    pl: state.players.map((p) => [p.number, name(p), r(p.x), r(p.y)]),
    ...(state.showOpp && Array.isArray(state.opp) ? { op: state.opp.map((p) => [p.number, name(p), r(p.x), r(p.y)]), oc: state.oppColor } : {})
  };
};

// 画像をタップしたときに開く、同じ作戦盤へのリンク。相手・ボール・線も入れる。位置は整数に丸める（短くするため）。
// 1000 文字に収まらないときは、選手の名前 → 線（新しいものから1本ずつ）→ ボール → 相手の順に外し、
// それでも長ければこのページを開くだけ
function boardLinkUrl() {
  const r = (v) => Math.round(v);
  // 印（イエロー・ゴールなど）があれば5つめに入れる（「y1g2」）
  const players = (withNames) => ({
    ...lineupData(),
    pl: state.players.map((p) => {
      const marks = state.showMarks === false ? "" : encodeMarks(playerMarksOf(p));
      const name = withNames && state.showNames !== false ? p.name : "";
      return marks ? [p.number, name, r(p.x), r(p.y), marks] : [p.number, name, r(p.x), r(p.y)];
    })
  });
  // 相手の背番号は、1・2・3… の順のままなら省く（[x, y] だけ）
  const opp = state.showOpp && Array.isArray(state.opp) ? { op: state.opp.map((p, i) => (p.number === String(i + 1) ? [r(p.x), r(p.y)] : [p.number, r(p.x), r(p.y)])), of: state.oppFormation, oc: state.oppColor } : {};
  const ball = state.showBall ? { b: [r(state.ball.x), r(state.ball.y)] } : {};
  // 線は点を間引いて短くする（1本につき最大 8 点。線の形は残る）
  // 線は、入る範囲でできるだけ多くの点を残す（1本 24 点 → 16 → 12 → 8 → 5 と減らして試す）。
  // 開いた側では点を曲線でつなぐので、点が少なくてもなめらかに見える
  const linesAt = (max) => state.strokes.map((k) => [k.color, simplifyPoints(k.points, max).flatMap(([x, y]) => [r(x), r(y)])]);
  const withLines = (max, n = state.strokes.length) => (n ? { k: linesAt(max).slice(0, n) } : {});
  const BUDGETS = [24, 16, 12, 8, 5];
  const candidates = [
    ...BUDGETS.slice(0, 4).map((max) => ({ ...players(true), ...opp, ...ball, ...withLines(max) })),
    ...BUDGETS.map((max) => ({ ...players(false), ...opp, ...ball, ...withLines(max) })),
    ...state.strokes.map((_, n) => ({ ...players(false), ...opp, ...ball, ...withLines(5, state.strokes.length - n) })),
    { ...players(false), ...opp, ...ball },
    { ...players(false), ...opp },
    players(false)
  ];
  for (const data of candidates) {
    const url = `${EDITOR_URL}?tab=lineup&data=${encode(data)}`;
    if (url.length <= LINK_MAX) return url;
  }
  return EDITOR_URL;
}

function lineupCardUrl() {
  return OQRN.cardUrl(lineupCardQuery());
}

function resultCardUrl() {
  return OQRN.cardUrl(resultCardQuery());
}

// 何枚かまとめて送る（スタメン → 試合結果 の順。1枚の LINE メッセージに横に並ぶ）。
// 2枚目からは、おくるんの card パラメータに、そのカードのパラメータをまるごと入れて渡す
function cardsUrl({ lineup = true, result = false } = {}) {
  const queries = [lineup && lineupCardQuery(), result && resultCardQuery()].filter(Boolean);
  if (!queries.length) return "";
  const [first, ...rest] = queries;
  rest.forEach((q) => {
    q.delete("from");
    first.append("card", q.toString());
  });
  return OQRN.cardUrl(first);
}

// 試合結果を入れたか（スコア・得点者・内訳・ひとこと（結果）のどれか）
function hasResult() {
  const filled = (v) => v !== "" && v !== null && v !== undefined;
  return Boolean(
    Number(state.scoreUs) || Number(state.scoreThem) || state.goals.length || state.resultNote ||
    ["halfUs", "halfThem", "secondUs", "secondThem", "pkUs", "pkThem"].some((k) => filled(state[k]))
  );
}

// ---- 送る前のプレビュー：おくるんのカードと同じ並び（色の帯に見出し・日時 → タイトル → ひとことの枠 → ピッチ／スコア）を小さく描く ----
const el = (tag, className, text) => Object.assign(document.createElement(tag), className ? { className } : {}, text != null ? { textContent: text } : {});

// カードの外側（見出しの帯・タイトル・ひとこと）。中身（ピッチ・スコア）は parts で足す
function previewCard(q, parts) {
  const card = el("div", "cp");
  const head = el("div", "cp-head");
  head.style.background = q.get("customColor");
  head.append(el("b", "", q.get("headerTitle")));
  if (q.get("showDate") === "true" && q.get("date")) head.append(el("small", "", q.get("date")));
  const body = el("div", "cp-body");
  body.append(el("p", "cp-title", q.get("title")));
  if (q.get("showDetail") === "true" && q.get("detail")) body.append(el("p", "cp-detail", q.get("detail")));
  body.append(...parts);
  card.append(head, body);
  return card;
}

function lineupPreviewEl() {
  const q = lineupCardQuery();
  const pitch = el("div", `cp-pitch${state.mode === "futsal" ? " is-futsal" : ""}`);
  pitch.innerHTML = '<i class="is-half"></i><i class="is-circle"></i><i class="is-box-top"></i><i class="is-box-bottom"></i>';
  // カードに渡すのと同じ中身（相手・名前は 👁️ 表示どおり）で描く
  const data = lineupData();
  pitch.classList.toggle("is-vs", Boolean(data.op)); // 相手も描くときは縦に長く（おくるんのカードと同じ）
  const team = (list, color) =>
    list.forEach(([number, name, x, y], i) => {
      const t = el("span", "cp-token");
      t.style.left = `${x}%`;
      t.style.top = `${y}%`;
      const n = el("b", "", number || "");
      n.style.background = color;
      n.style.color = inkOn(color);
      n.style.borderColor = isLight(color) ? "#23302a" : "#ffffff";
      t.append(n);
      if (i === 0) t.append(el("i", "cp-gk", "🧤"));
      if (name) t.append(el("small", "", name));
      pitch.append(t);
    });
  if (data.op) team(data.op, data.oc);
  team(data.pl, data.c);
  // 「タップすると さくせん盤 が開きます」の一文は、縮めると読めないのでプレビューには入れない（シートの説明に書く）
  return previewCard(q, [pitch]);
}

function resultPreviewEl() {
  const q = resultCardQuery();
  const us = Number(state.scoreUs) || 0;
  const them = Number(state.scoreThem) || 0;
  const pk = state.pkUs !== "" && state.pkThem !== "";
  const win = us > them || (us === them && pk && Number(state.pkUs) > Number(state.pkThem));
  const lose = us < them || (us === them && pk && Number(state.pkUs) < Number(state.pkThem));
  const badge = (label, cls) => el("span", `cp-badge ${cls}`, label);
  const side = (name, mine) => {
    const box = el("div", "cp-team");
    box.append(el("b", "", name));
    if (win || lose) box.append(mine === win ? badge(pk && us === them ? "勝ち（PK）" : "勝ち", "is-win") : badge(pk && us === them ? "負け（PK）" : "負け", "is-lose"));
    return box;
  };
  const teams = el("div", "cp-teams");
  teams.append(side(state.team || "自チーム", true), el("span", "cp-vs", "vs"), side(state.opponent || "相手", false));
  const parts = [teams, el("p", "cp-score", `${us} - ${them}`)];
  if (!win && !lose) parts.push(badge("引き分け", "is-draw"));
  if (pk) parts.push(el("p", "cp-pk", `PK ${state.pkUs} - ${state.pkThem}`));
  const periods = [["前半", "halfUs", "halfThem"], ["後半", "secondUs", "secondThem"], ["延長", "extraUs", "extraThem"]]
    .filter(([, a, b]) => state[a] !== "" && state[b] !== "")
    .map(([label, a, b]) => `${label} ${state[a]} - ${state[b]}`)
    .join("・");
  if (periods) parts.push(el("p", "cp-periods", periods));
  // 得点：時間の順に、自チームは左「⚽ 12' たなか」、相手は右「25' 相手 ⚽」（おくるんと同じ）
  const goals = [...state.goals].sort((a, b) => (parseInt(a.min, 10) || 0) - (parseInt(b.min, 10) || 0));
  if (goals.length) {
    const list = el("ul", "cp-goals");
    goals.forEach((g) => {
      const min = g.min ? `${g.min}'` : "";
      list.append(el("li", g.side === "t" ? "is-them" : "", g.side === "t" ? [min, g.name || state.opponent || "相手", "⚽"].filter(Boolean).join(" ") : ["⚽", min, g.name].filter(Boolean).join(" ")));
    });
    parts.push(list);
  }
  const { assists, cards } = marksForResult();
  if (assists.length) parts.push(el("p", "cp-extra", `👟 アシスト ${assists.map(([n, c]) => (c > 1 ? `${n}×${c}` : n)).join("・")}`));
  if (cards.length) parts.push(el("p", "cp-extra", cards.map(([k, n, c]) => `${(k === "r" ? "🟥" : "🟨").repeat(c)} ${n}`).join("　")));
  const subs = subsForResult();
  if (subs.length) parts.push(el("p", "cp-extra cp-subs", subs.map(([m, o, i]) => `🔄 ${m ? `${m}' ` : ""}${o} → ${i}`).join("\n")));
  return previewCard(q, parts);
}

function lineupCardQuery() {
  const data = lineupData();
  return new URLSearchParams({
    kind: "lineup",
    // 見出しは、相手を出していなければ「スタメン発表」、出していれば「作戦盤」（相手も描くので）
    headerTitle: state.showOpp ? "作戦盤" : "スタメン発表",
    date: whenText(),
    showDate: whenText() ? "true" : "false",
    title: state.opponent ? `vs ${state.opponent}` : state.team || "スタメン",
    detail: [state.where && `📍 ${state.where}`, state.lineupNote].filter(Boolean).join("\n"),
    showDetail: state.where || state.lineupNote ? "true" : "false",
    bubbleSize: "mega",
    theme: "custom",
    customColor: cardColor(),
    data: encode(data),
    from: "soccer"
  });
}

function resultCardQuery() {
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
    g: state.goals.map((g) => [g.side, g.min, g.name])
  };
  // 作戦盤の印のアシスト・カードも入れる（あるときだけ）
  const { assists, cards } = marksForResult();
  if (assists.length) data.as = assists;
  if (cards.length) data.cd = cards;
  const subs = subsForResult();
  if (subs.length) data.sb = subs;
  return new URLSearchParams({
    kind: "match",
    headerTitle: "試合結果",
    date: whenText(),
    showDate: whenText() ? "true" : "false",
    title: [state.where].filter(Boolean).join(" ") || "試合結果",
    detail: state.resultNote,
    showDetail: state.resultNote ? "true" : "false",
    bubbleSize: "mega",
    theme: "custom",
    customColor: cardColor(),
    data: encode(data),
    from: "soccer"
  });
}

// ---- 作戦盤の画像（線・相手・ボールも入る）。保存にも、カードの写真にも使う ----
async function boardCanvas() {
  if (document.fonts?.ready) await document.fonts.ready;
  const W = 1080;
  const H = Math.round(W * 4 / 3); // 作戦盤と同じ縦横の比（サッカー・フットサルとも同じ大きさ）
  // 上の見出しは、チーム名・対戦相手・日時を入れたときだけ（入れていなければピッチだけの画像）
  const title = [state.team || "", state.opponent ? `vs ${state.opponent}` : ""].filter(Boolean).join(" ");
  const head = title ? 120 : whenText() ? 76 : 0;
  const canvas = Object.assign(document.createElement("canvas"), { width: W, height: H + head });
  const ctx = canvas.getContext("2d");
  const font = (size, weight = 800) => `${weight} ${size}px "M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", sans-serif`;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H + head);
  ctx.textAlign = "center";
  if (head) {
    if (title) {
      ctx.fillStyle = "#23302a";
      ctx.font = font(44);
      ctx.fillText(title, W / 2, 60);
    }
    ctx.font = font(28, 700);
    ctx.fillStyle = "#5c6b62";
    const vs = state.showOpp && oppTotal() !== state.players.length ? ` 対 ${oppTotal()}人` : "";
    const count = `${state.mode === "futsal" ? "フットサル" : "サッカー"} ${state.players.length}人${vs}${state.formation ? `・${state.formation}` : ""}`;
    ctx.fillText(`${count}${whenText() ? `・${whenText()}` : ""}`, W / 2, title ? 100 : 48);
  }
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
  const drawToken = (p, fill, text, numberColor = "#ffffff", keeper = false) => {
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
    if (keeper) {
      // 緑のピッチでも見えるよう、白い丸の上に 🧤
      ctx.beginPath();
      ctx.arc(x - 30, y + 28, 20, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.font = font(24, 400);
      ctx.fillText("🧤", x - 30, y + 36);
    }
    if (text) {
      // 名前：白線と重なっても読めるよう、盤と同じ半透明の濃い札に入れる
      ctx.font = font(26);
      const w = ctx.measureText(text).width + 20;
      ctx.fillStyle = "rgba(16, 36, 24, 0.72)";
      ctx.beginPath();
      ctx.roundRect(x - w / 2, y + 48, w, 36, 18);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.fillText(text, x, y + 74);
    }
  };
  // 相手も、得点者の欄で名前を入れていれば名前を出す（盤と同じ）
  if (state.showOpp) (state.opp || opponents()).forEach((p, i) => drawToken(p, state.oppColor, state.showNames === false ? "" : p.name, inkOn(state.oppColor), i === 0));
  state.players.forEach((p, i) => drawToken(p, state.ourColor, state.showNames === false ? "" : p.name, inkOn(state.ourColor), i === 0));
  // 交代して入った選手：丸の右上に小さく 🔄（盤と同じ）
  [...state.players.map((p) => [p, "u"]), ...(state.showOpp ? (state.opp || []).map((p) => [p, "t"]) : [])].forEach(([p, team]) => {
    if (!p.subs?.length) return;
    const x = (p.x / 100) * W + 30;
    const y = (p.y / 100) * H - 30;
    ctx.beginPath();
    ctx.arc(x, y, 18, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.font = font(20, 400);
    ctx.textAlign = "center";
    ctx.fillText("🔄", x, y + 7);
    // 交代前の選手の得点・OG：🔄 の右下に小さく（⚽・赤いボール）
    const parts = markParts(subGoalsOf(p, team));
    if (!parts.length) return;
    ctx.font = font(18, 400);
    const pieces = parts.flatMap((part) => [
      ...Array.from({ length: part.count }, () => ({ text: part.icon, red: part.red })),
      ...(part.label ? [{ text: part.label }] : [])
    ]);
    const widths = pieces.map((piece) => ctx.measureText(piece.text).width);
    const w = widths.reduce((a, b) => a + b, 0) + 10;
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.beginPath();
    ctx.roundRect(x + 10, y + 6, w, 26, 13);
    ctx.fill();
    ctx.textAlign = "left";
    let cx = x + 15;
    pieces.forEach((piece, k) => {
      if (piece.red) ctx.drawImage(redBall(piece.text, widths[k]), cx, y + 6, widths[k], 26);
      else {
        ctx.fillStyle = "#23302a";
        ctx.fillText(piece.text, cx, y + 26);
      }
      cx += widths[k];
    });
    ctx.textAlign = "center";
  });
  // 印（イエロー・ゴールなど）：丸の右下（GK の 🧤 は左下）に、白い角丸の札に入れて。オウンゴールのボールは赤く。
  // 相手は、試合結果の得点者から数えた ⚽・OG（盤と同じ）
  const marked = [
    ...state.players.map((p) => [p, playerMarksOf(p)]),
    ...(state.showOpp ? (state.opp || []).map((p) => [p, oppMarksOf(p)]) : [])
  ];
  if (state.showMarks !== false) marked.forEach(([p, marks]) => {
    const parts = markParts(marks);
    if (!parts.length) return;
    const x = (p.x / 100) * W;
    const y = (p.y / 100) * H;
    ctx.font = font(26, 400);
    const pieces = parts.flatMap((part) => [
      ...Array.from({ length: part.count }, () => ({ text: part.icon, red: part.red, icon: true })),
      ...(part.label ? [{ text: part.label }] : [])
    ]);
    const widths = pieces.map((piece) => ctx.measureText(piece.text).width);
    // 絵文字が続くところは、前の絵文字に 1/3 重ねる（2/3 ずつ見せて札を短く）
    const steps = pieces.map((piece, k) => (piece.icon && pieces[k + 1]?.icon ? widths[k] * (2 / 3) : widths[k]));
    const w = steps.reduce((a, b) => a + b, 0) + 16;
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.beginPath();
    // 札の左端を丸の中心から 10 右に（🧤 の丸は中心から 10 左まで）。はみ出す分は盤の上で選手をずらしてある
    const left = Math.min(W - 4 - w, x + 10);
    ctx.roundRect(left, y + 10, w, 36, 18);
    ctx.fill();
    ctx.textAlign = "left";
    let cx = left + 8;
    pieces.forEach((piece, k) => {
      if (piece.red) ctx.drawImage(redBall(piece.text, widths[k]), cx, y + 10);
      else {
        ctx.fillStyle = "#23302a";
        ctx.fillText(piece.text, cx, y + 37);
      }
      cx += steps[k];
    });
    ctx.textAlign = "center";
  });
  if (state.showBall) {
    ctx.font = font(56, 400);
    ctx.fillText("⚽", (state.ball.x / 100) * W, (state.ball.y / 100) * H + 20);
  }
  ctx.restore();
  return canvas;
}

// オウンゴールの赤いボール：⚽ を小さなキャンバスに描き、ボールの形の上だけに赤を重ねる（白い所は薄い赤、黒い所は濃い赤）
function redBall(icon, width) {
  const c = document.createElement("canvas");
  c.width = Math.ceil(width);
  c.height = 36;
  const g = c.getContext("2d");
  g.font = '400 26px "M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", sans-serif'; // boardCanvas の font(26, 400) と同じ
  g.textAlign = "left";
  g.fillText(icon, 0, 27);
  g.globalCompositeOperation = "source-atop";
  g.fillStyle = "rgba(229, 57, 53, 0.7)";
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

// 盤の上で使う赤いボールの絵（data URL。1回作って使い回す）
let redBallUrl = "";
function redBallDataUrl() {
  if (!redBallUrl) {
    const probe = document.createElement("canvas").getContext("2d");
    probe.font = '400 26px "M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", sans-serif';
    redBallUrl = redBall("⚽", probe.measureText("⚽").width).toDataURL();
  }
  return redBallUrl;
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
    const share = Object.assign(document.createElement("button"), { type: "button", className: "ls-button is-primary is-block", textContent: "📤 共有・保存" });
    share.onclick = () => navigator.share({ files: [file] }).catch(() => {});
    actions.append(share);
  }
  actions.append(Object.assign(document.createElement("a"), { className: "ls-button is-block", href: url, download: file.name, textContent: "⬇️ ダウンロード" }));
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
    date: whenText(),
    showDate: whenText() ? "true" : "false",
    title: state.opponent ? `vs ${state.opponent}` : state.team || "スタメン",
    detail: [state.where && `📍 ${state.where}`, state.lineupNote].filter(Boolean).join("\n"),
    showDetail: state.where || state.lineupNote ? "true" : "false",
    imageUrl,
    imageActionUrl: boardLinkUrl(),
    bubbleSize: "giga",
    theme: "custom",
    customColor: cardColor(),
    from: "soccer"
  });
  return OQRN.cardUrl(q);
}

// 画像サーバーは眠っていると最初の保存が遅いので、開いた時点で起こしておく
fetch(`${IMAGE_API}/health`, { mode: "no-cors", cache: "no-store" }).catch(() => {});
