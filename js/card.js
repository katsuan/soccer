// さくせん盤：送るカード（おくるんへのリンク）・送る前の見本・作戦盤の画像のカード・天気（そらくる）のリンク
// ファイルは index.html に書いた順（page → formation → marks → store → link → board → ink → tactics → sheets → card → image → events → app.js）に読み、同じ範囲の変数（state など）を使う
"use strict";

// ---- おくるんへのリンク ----
// スタメン（選手の位置）の中身。おくるんのカードにも、作戦盤を開くリンクにも使う。
// 👁️ 表示に合わせる：選手名を出さないなら名前を外し、相手を出しているなら相手（op: [[背番号, 名前, x, y], ...]・oc: 相手の色）も入れる
const roundPos = (v) => Math.round(v); // リンクの位置は整数に（短くするため）
// スタメン（選手の位置）の中身を返す。おくるんのカードにも、作戦盤を開くリンクにも使う
const lineupData = () => {
  // 👁️ 表示に合わせた選手の名前（名前を出さないときは ""）を返す
  const name = (p) => (state.showNames === false ? "" : p.name || "");
  return {
    m: state.mode,
    f: state.formation,
    t: state.team,
    o: state.opponent,
    c: state.ourColor,
    pl: state.players.map((p) => [p.number, name(p), roundPos(p.x), roundPos(p.y)]),
    ...(state.showOpp && Array.isArray(state.opp) ? { op: state.opp.map((p) => [p.number, name(p), roundPos(p.x), roundPos(p.y)]), oc: state.oppColor } : {})
  };
};

// 画像をタップしたときに開く、同じ作戦盤へのリンク。相手・ボール・線も入れる。位置は整数に丸める（短くするため）。
// 1000 文字に収まらないときは、選手の名前 → 線（新しいものから1本ずつ）→ ボール → 相手の順に外し、
// それでも長ければこのページを開くだけ
function boardLinkUrl() {
  // 印（イエロー・ゴールなど）があれば5つめに入れる（「y1g2」）
  const players = (withNames) => ({
    ...lineupData(),
    pl: state.players.map((p) => {
      const marks = state.showMarks === false ? "" : encodeMarks(playerMarksOf(p));
      const name = withNames && state.showNames !== false ? p.name : "";
      return marks ? [p.number, name, roundPos(p.x), roundPos(p.y), marks] : [p.number, name, roundPos(p.x), roundPos(p.y)];
    })
  });
  // 相手の背番号は、1・2・3… の順のままなら省く（[x, y] だけ）
  const opp = state.showOpp && Array.isArray(state.opp) ? { op: state.opp.map((p, i) => (p.number === String(i + 1) ? [roundPos(p.x), roundPos(p.y)] : [p.number, roundPos(p.x), roundPos(p.y)])), of: state.oppFormation, oc: state.oppColor } : {};
  const ball = state.showBall ? { b: [roundPos(state.ball.x), roundPos(state.ball.y)] } : {};
  // 線は点を間引いて短くする（1本につき最大 8 点。線の形は残る）
  // 線は、入る範囲でできるだけ多くの点を残す（1本 24 点 → 16 → 12 → 8 → 5 と減らして試す）。
  // 開いた側では点を曲線でつなぐので、点が少なくてもなめらかに見える
  const linesAt = (max) => state.strokes.map((k) => [k.color, simplifyPoints(k.points, max).flatMap(([x, y]) => [roundPos(x), roundPos(y)])]);
  // 線を入れた形（1本の点の数は max まで、新しいものから n 本）を返す
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

// スタメンのカードを開くおくるんの URL を返す
function lineupCardUrl() {
  return OQRN.cardUrl(lineupCardQuery());
}

// 試合結果のカードを開くおくるんの URL を返す
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
  // 欄に何か入っているかを返す（空・null・undefined でない）
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

// 送る前の見本：スタメンのカード（ミニのピッチ）の部品を作る
function lineupPreviewEl() {
  const q = lineupCardQuery();
  const pitch = el("div", `cp-pitch${state.mode === "futsal" ? " is-futsal" : ""}`);
  pitch.innerHTML = '<i class="is-half"></i><i class="is-circle"></i><i class="is-box-top"></i><i class="is-box-bottom"></i>';
  // カードに渡すのと同じ中身（相手・名前は 👁️ 表示どおり）で描く
  const data = lineupData();
  pitch.classList.toggle("is-vs", Boolean(data.op)); // 相手も描くときは縦に長く（おくるんのカードと同じ）
  // ミニのピッチに、チームのこまを並べる
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

// 送る前の見本：試合結果のカード（勝敗・スコア・得点者）の部品を作る
function resultPreviewEl() {
  const q = resultCardQuery();
  const us = Number(state.scoreUs) || 0;
  const them = Number(state.scoreThem) || 0;
  const pk = state.pkUs !== "" && state.pkThem !== "";
  const win = us > them || (us === them && pk && Number(state.pkUs) > Number(state.pkThem));
  const lose = us < them || (us === them && pk && Number(state.pkUs) < Number(state.pkThem));
  // 勝ち・負け・引き分けの札を作る
  const badge = (label, cls) => el("span", `cp-badge ${cls}`, label);
  // チーム1つぶん（名前と得点者）の部品を作る
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

// スタメンのカードの、おくるんへ渡すパラメータを返す
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

// 試合結果のカードの、おくるんへ渡すパラメータを返す
function resultCardQuery() {
  // 点の欄の中身（空はそのまま、数でなければ 0）を返す
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

// ---- 作戦盤の画像をカードで送る ----
// 画像をおくるんの画像サーバー（無料。しばらく使わないと眠り、時間がたつと画像が消えることがある）に保存し、
// その画像を写真にしたお知らせカードをおくるんで開く
const IMAGE_API = "https://liff-image.onrender.com";

// 🖼️ 作戦を画像で送る：作戦盤の画像を画像サーバーに保存し、その画像のカードをおくるんで開く
async function sendBoardImage() {
  const button = $("sendBoardImage");
  if (button.disabled) return;
  button.disabled = true;
  $("imageStatus").textContent = "画像を作っています…";
  // 経過秒数の表示を止める（画像を保存できたら・できなかったら）
  let stop = () => {};
  try {
    const canvas = await boardCanvas();
    // 経過秒数と、遅いときのわけ（Q キットの progress）
    stop = LineShareUI.progress("画像を保存しています", (text) => ($("imageStatus").textContent = text), { slowNote: "はじめは30秒ほどかかることがあります。" });
    const response = await fetch(`${IMAGE_API}/api/upload`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageData: canvas.toDataURL("image/jpeg", 0.88) })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !/^https:\/\//.test(data.imageUrl || "")) throw new Error(`upload ${response.status}`);
    stop();
    $("imageStatus").textContent = "おくるんを開いています…";
    location.href = boardImageCardUrl(data.imageUrl);
  } catch (error) {
    console.error(error);
    stop();
    $("imageStatus").textContent = "画像を保存できませんでした。少し待って、もう一度押してね。";
  } finally {
    stop();
    button.disabled = false;
  }
}

// 作戦盤の画像のカードを開くおくるんの URL を返す（画像をタップすると同じ作戦盤が開く）
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

// ---- そらくる（天気）で開く：試合の場所と日にち（と時間）で、その日の天気を見る ----
const SORAQRU_URL = "https://katsuan.github.io/soraqru/";

// 場所と日にちがあって、今日より前でないときだけ（16日より先は、そらくるが「近くなったら」と案内する）
function weatherUrl(now = new Date()) {
  const place = String(state.where || "").trim().slice(0, 40);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(state.whenDate || "") ? state.whenDate : "";
  if (!place || !date) return "";
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  if (date < today) return "";
  const q = new URLSearchParams({ q: place, name: place, date, from: "saqsen" });
  const t = /^(\d{2}):\d{2}$/.exec(state.whenTime || "");
  if (t) q.set("hour", String(Number(t[1])));
  return `${SORAQRU_URL}?${String(q).replace(/\+/g, "%20")}`;
}

// 会場情報の「🌤️ 試合の日の天気」（そらくる）を、場所と日にちがあるときだけ出す
function renderWeatherLink() {
  const url = weatherUrl();
  const link = $("weatherLink");
  link.hidden = !url;
  if (!url) return;
  link.href = url;
  $("weatherWhen").textContent = [whenText(), String(state.where || "").trim()].filter(Boolean).join("・");
}
