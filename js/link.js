// さくせん盤：受けとったリンク（?data=）を読む・リンクの文字（base64url の JSON）を作る
// ファイルは index.html に書いた順（page → formation → marks → store → link → board → ink → tactics → sheets → card → image → events → app.js）に読み、同じ範囲の変数（state など）を使う
"use strict";

const EDITOR_URL = "https://katsuan.github.io/soccer/"; // このページ（画像をタップしたときに開く）
const LINK_MAX = 1000; // LINE のリンクは 1000 文字まで

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
  if (q.has("data")) history.replaceState(null, "", location.pathname);
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
