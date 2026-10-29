// さくせん盤：受けとったリンク（?data=）を読む・リンクの文字（base64url の JSON）を作る
// ファイルは index.html に書いた順（page → formation → marks → store → link → board → ink → tactics → sheets → card → image → events → app.js）に読み、同じ範囲の変数（state など）を使う
"use strict";

const EDITOR_URL = "https://katsuan.github.io/soccer/"; // このページ（画像をタップしたときに開く）
const LINK_MAX = 1000; // LINE のリンクは 1000 文字まで
const QUMIAWASE_URL = "https://katsuan.github.io/qumiawase/"; // くみあわせ（トーナメント・総当たり）
const QUMIAWASE_INBOX = "qumiawase:inbox"; // 同じ端末で、くみあわせへ結果を戻すところ（くみあわせの js/store.js と同じキー）

// くみあわせの「さくせん盤で開く」（?match=）で受けとった試合。入れるのは app.js の takeMatch（いまの中身があれば確かめてから）
let pendingMatch = null;

// おくるんの「さくせん盤で直す」から戻ってきたとき
let openResultOnLoad = false;
applyQuery();
moveGoalMarksToGoals();

// 開いた URL の ?data=（作戦盤・試合結果）を state に入れる。入れたら URL から消す
function applyQuery() {
  const q = new URLSearchParams(location.search);
  const data = readLinkData(q.get("data"));
  // 試合結果のリンク（?tab=result）からは、👕 チーム・試合結果の欄を開いて見せる（1ページになったのでタブはない）
  openResultOnLoad = q.get("tab") === "result";
  if (data?.lineup) {
    const d = data.lineup;
    Object.assign(state, { mode: d.mode, players: d.players, formation: d.formation, court: courtOf(d.mode, d.formation, d.players.length) });
    Object.assign(state, { team: d.team || state.team, opponent: d.opponent || state.opponent });
    // 前のリンクの控え（s）は、ひとこと（作戦盤）の行として入れる
    state.lineupNote = addLine(state.lineupNote, subsLine(d.subs));
    if (d.ourColor) state.ourColor = d.ourColor;
    // 画像のリンクからは、相手・ボール・線も戻す（スタメンのカードからは選手だけ）
    if (d.opp) {
      Object.assign(state, { opp: d.opp, oppFormation: d.oppFormation, showOpp: true });
      if (d.oppColor) state.oppColor = d.oppColor;
    }
    if (d.ball) Object.assign(state, { ball: d.ball, showBall: true });
    if (d.strokes) state.strokes = d.strokes;
  } else if (data?.result) {
    const { mvp, ...result } = data.result;
    Object.assign(state, { ...result, team: result.team || state.team, opponent: result.opponent || state.opponent });
    // 前のリンクの MVP は、ひとこと（結果）の行として入れる
    state.resultNote = addLine(state.resultNote, mvpLine(mvp));
  }
  if (q.has("match")) pendingMatch = readMatchLink(q.get("match"));
  if (q.has("data") || q.has("match")) history.replaceState(null, "", location.pathname);
}

/**
 * くみあわせの「さくせん盤で開く」の中身（?match=）を読む。{ team, opponent, ourColor, oppColor, where, whenDate, whenTime, tid, mid } を返す。
 * チーム名が2つともない・形がちがうときは null
 */
function readMatchLink(text) {
  const d = decode(text);
  if (!d || typeof d !== "object" || Array.isArray(d)) return null;
  const team = textIn(d.t, LINK_LIMIT.team);
  const opponent = textIn(d.o, LINK_LIMIT.team);
  if (!team && !opponent) return null;
  const id = (v, max) => (typeof v === "string" && new RegExp(`^[A-Za-z0-9-]{1,${max}}$`).test(v) ? v : "");
  return {
    team,
    opponent,
    ourColor: hexIn(d.c),
    oppColor: hexIn(d.oc),
    where: textIn(d.w, 30),
    whenDate: typeof d.d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d.d) ? d.d : "",
    whenTime: typeof d.tm === "string" && /^\d{2}:\d{2}$/.test(d.tm) ? d.tm : "",
    tid: id(d.tid, 40),
    mid: id(d.mid, 16)
  };
}

// くみあわせへ結果を戻す中身（{ tid, mid, s: [自チーム, 相手], pk?: [自チーム, 相手] }）を返す。くみあわせの試合でなければ null
function qumiawaseResult() {
  const q = state.qumiawase;
  if (!q) return null;
  const n = (v) => Math.min(99, Math.max(0, Math.floor(Number(v)) || 0));
  const s = [n(state.scoreUs), n(state.scoreThem)];
  // PK は同点のときだけ（点を入れなおして同点でなくなったら、残っている PK は送らない）
  const pk = s[0] === s[1] && state.pkUs !== "" && state.pkThem !== "" ? { pk: [n(state.pkUs), n(state.pkThem)] } : {};
  return { tid: q.tid, mid: q.mid, s, ...pk };
}

// くみあわせへ結果を戻すリンク（くみあわせの URL ＋ ?result=中身）を返す
const qumiawaseResultUrl = () => `${QUMIAWASE_URL}?result=${encode(qumiawaseResult())}`;

// 同じ端末のくみあわせへ、結果を残しておく（くみあわせを開いたとき・もどったときに入る）。残せなくても止めない
function keepQumiawaseResult() {
  try {
    const list = JSON.parse(localStorage.getItem(QUMIAWASE_INBOX) || "[]");
    const next = (Array.isArray(list) ? list : []).filter((x) => !(x && x.tid === state.qumiawase.tid && x.mid === state.qumiawase.mid));
    next.push(qumiawaseResult());
    localStorage.setItem(QUMIAWASE_INBOX, JSON.stringify(next.slice(-20)));
  } catch {
    // 残せなくても、リンクで戻せる
  }
}

// 試合結果の欄の「くみあわせに結果を戻す」を、くみあわせの試合のときだけ出す
function renderQumiawase() {
  const box = $("qumiawaseBox");
  if (box) box.hidden = !state.qumiawase;
}

/**
 * くみあわせから受けとった試合を入れる：チーム名・色・会場・日時と、結果を戻す先。ちがう試合なら試合結果は空にする。
 * いまのチーム名・試合結果があれば確かめてから。入れたら「元に戻す」つきで知らせる
 */
async function takeMatch(m) {
  const same = state.team === m.team && state.opponent === m.opponent;
  const filled = state.team || state.opponent || Number(state.scoreUs) || Number(state.scoreThem) || state.goals.length;
  if (filled && !same) {
    const ok = await LineShareUI.ask({ title: "くみあわせの試合を入れますか？", text: `${m.team || "自チーム"} 対 ${m.opponent || "相手"}。いまのチーム名・色・試合結果は置きかわります（作戦盤の並び・選手はそのまま）。`, ok: "入れる" });
    if (!ok) return;
  }
  const KEYS = ["team", "opponent", "ourColor", "oppColor", "where", "whenDate", "whenTime", "scoreUs", "scoreThem", "halfUs", "halfThem", "secondUs", "secondThem", "extraUs", "extraThem", "pkUs", "pkThem", "resultNote", "goals", "qumiawase"];
  const before = JSON.parse(JSON.stringify(Object.fromEntries(KEYS.map((k) => [k, state[k]]))));
  if (!same) {
    ["halfUs", "halfThem", "secondUs", "secondThem", "extraUs", "extraThem", "pkUs", "pkThem", "resultNote"].forEach((k) => (state[k] = ""));
    Object.assign(state, { scoreUs: 0, scoreThem: 0, goals: [] });
  }
  Object.assign(state, { team: m.team, opponent: m.opponent });
  if (m.ourColor) state.ourColor = m.ourColor;
  if (m.oppColor) state.oppColor = m.oppColor;
  for (const k of ["where", "whenDate", "whenTime"]) if (m[k]) state[k] = m[k];
  state.qumiawase = m.tid && m.mid ? { tid: m.tid, mid: m.mid } : undefined;
  if (!state.qumiawase) delete state.qumiawase;
  render();
  syncResultInputs();
  $("teamFold").open = true;
  $("teamFold").scrollIntoView({ block: "start" });
  LineShareUI.toast("くみあわせの試合を入れました", {
    actionLabel: "元に戻す",
    onAction: () => {
      Object.assign(state, JSON.parse(JSON.stringify(before)));
      if (!before.qumiawase) delete state.qumiawase;
      render();
      syncResultInputs();
    }
  });
}

// ?data= の文字から、作戦盤（lineup）か試合結果（result）の中身を作る。読めない・形がちがうときは null
function readLinkData(text) {
  const data = decode(text);
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const L = LINK_LIMIT;
  if (Array.isArray(data.pl)) {
    const players = listIn(data.pl, MAX_PLAYERS)
      .filter(Array.isArray)
      .map((p) => {
        const marks = decodeMarks(textIn(p[4], 20));
        return { number: textIn(p[0], L.number), name: textIn(p[1], L.name), x: posIn(p[2]), y: posIn(p[3]), ...(marks ? { marks } : {}) };
      });
    if (!players.length) return null;
    const mode = data.m === "futsal" ? "futsal" : "soccer";
    const lineup = { mode, players, formation: formationIn(data.f, players.length), team: textIn(data.t, L.team), opponent: textIn(data.o, L.team), subs: textIn(data.s, L.note), ourColor: hexIn(data.c) };
    if (Array.isArray(data.op)) {
      // [x, y] だけのときは背番号が 1・2・3… の順。さくせん盤のカードからは [背番号, 名前, x, y]
      lineup.opp = listIn(data.op, MAX_PLAYERS)
        .filter(Array.isArray)
        .map((p, i) => {
          const [number, name, x, y] = p.length === 2 ? [String(i + 1), "", p[0], p[1]] : p.length === 3 ? [p[0], "", p[1], p[2]] : p;
          return { number: textIn(number, L.number), name: textIn(name, L.name), x: posIn(x), y: posIn(y) };
        });
      lineup.oppFormation = formationIn(data.of, lineup.opp.length);
      lineup.oppColor = hexIn(data.oc);
    }
    if (Array.isArray(data.b)) lineup.ball = { x: posIn(data.b[0]), y: posIn(data.b[1]) };
    if (Array.isArray(data.k)) {
      lineup.strokes = listIn(data.k, L.strokes)
        .filter((k) => Array.isArray(k) && Array.isArray(k[1]))
        .map(([color, flat]) => {
          const nums = listIn(flat, L.points * 2).map(posIn);
          const points = [];
          for (let i = 0; i + 1 < nums.length; i += 2) points.push([nums[i], nums[i + 1]]);
          return { color: hexIn(color) || "#ffffff", points };
        })
        .filter((k) => k.points.length > 1);
    }
    return { lineup };
  }
  if ("us" in data) {
    return {
      result: {
        team: textIn(data.t, L.team),
        opponent: textIn(data.o, L.team),
        scoreUs: scoreIn(data.us) || 0,
        scoreThem: scoreIn(data.th) || 0,
        halfUs: scoreIn(data.hu),
        halfThem: scoreIn(data.ht),
        secondUs: scoreIn(data.su),
        secondThem: scoreIn(data.st),
        extraUs: scoreIn(data.eu),
        extraThem: scoreIn(data.et),
        pkUs: scoreIn(data.pu),
        pkThem: scoreIn(data.pt),
        goals: listIn(data.g, L.goals)
          .filter(Array.isArray)
          .map((g) => ({ side: g[0] === "t" ? "t" : "u", min: textIn(g[1], L.min), name: textIn(g[2], L.name) })),
        mvp: textIn(data.mvp, L.name)
      }
    };
  }
  return null;
}

// 中身を JSON → UTF-8 → base64url の文字にする（リンクに入れる形）
function encode(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// base64url の文字から中身にもどす。読めないときは null
function decode(text) {
  if (!text) return null;
  try {
    const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0))));
  } catch {
    return null;
  }
}
