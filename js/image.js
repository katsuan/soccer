// さくせん盤：作戦盤の画像（線・相手・ボールも入る）。保存にも、カードの写真にも使う
// ファイルは index.html に書いた順（page → formation → marks → store → link → board → ink → tactics → sheets → card → image → events → app.js）に読み、同じ範囲の変数（state など）を使う
"use strict";

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

// 作っているあいだにもう一度押されても、画面は1つだけ
let savingImage = false;
async function saveBoardImage() {
  if (savingImage) return;
  savingImage = true;
  try {
    const canvas = await boardCanvas();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) return LineShareUI.toast("画像を作れませんでした。少し待って、もう一度押してね");
    showImageSheet(blob);
  } finally {
    savingImage = false;
  }
}
function showImageSheet(blob) {
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
