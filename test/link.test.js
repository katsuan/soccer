// リンク（?data=）と端末の中身を読むところのテスト。node --test test/
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const XSS = "<img src=x onerror=alert(1)>"; // qcheck-ok: W8 テストの見本の文字（画面では動かさない）

const code = ["page", "formation", "marks", "store", "link"].map((f) => fs.readFileSync(path.join(__dirname, `../js/${f}.js`), "utf8")).join("\n");
const b64 = (v) => Buffer.from(JSON.stringify(v), "utf8").toString("base64url");

// 端末の中身と URL を決めて、state とリンクを読むところ（js/page.js〜link.js）を読む
function boot({ store = {}, search = "" } = {}) {
  const mem = { ...store };
  const ctx = vm.createContext({
    localStorage: { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => (mem[k] = String(v)) },
    location: { search, pathname: "/soccer/" },
    history: { replaceState: () => {} },
    window: { matchMedia: () => ({ matches: false }) },
    document: {},
    URLSearchParams, TextEncoder, TextDecoder, atob, btoa
  });
  vm.runInContext(code, ctx);
  const get = (name) => vm.runInContext(name, ctx);
  return { state: get("state"), readLinkData: get("readLinkData"), encode: get("encode"), get };
}

test("ふつうの作戦盤のリンクを読める", () => {
  const { readLinkData } = boot();
  const d = readLinkData(b64({ m: "soccer", f: "1-1", pl: [["1", "山田", 50, 90], ["2", "", 40, 60, "g1"], ["3", "鈴木", 60, 30]], t: "FC", c: "#AABBCC" }));
  assert.equal(d.lineup.players.length, 3);
  assert.equal(d.lineup.players[1].marks.g, 1);
  assert.equal(d.lineup.formation, "1-1");
  assert.equal(d.lineup.ourColor, "#aabbcc");
});

test("壊れた base64・JSON でない・形のちがう中身は null（落ちない）", () => {
  const { readLinkData } = boot();
  for (const bad of ["%%%", "!!!", "e30", b64([1, 2]), b64("x"), b64(null), b64({ pl: [] }), b64({ pl: [null, 5, "a"] }), b64({ foo: 1 })]) {
    assert.equal(readLinkData(bad), null, bad);
  }
});

test("名前・チーム名は文字のまま、長さに上限", () => {
  const { readLinkData } = boot();
  const d = readLinkData(b64({ pl: [[XSS, XSS, 1, 1], [{ a: 1 }, ["x"], 2, 2]], t: XSS, o: "あ".repeat(5000), s: "x".repeat(5000) }));
  const [a, b] = d.lineup.players;
  assert.equal(a.number, "<img");
  assert.equal(a.name, XSS.slice(0, 20));
  assert.equal(b.number, "");
  assert.equal(b.name, "");
  assert.equal(d.lineup.team, XSS.slice(0, 20));
  assert.equal([...d.lineup.opponent].length, 20);
  assert.equal(d.lineup.subs.length, 200);
});

test("人数・線の数・点の数に上限、位置は 0〜100", () => {
  const { readLinkData } = boot();
  const pl = Array.from({ length: 500 }, (_, i) => [String(i), "", -50, 1e9]);
  const k = Array.from({ length: 500 }, () => ["javascript:1", Array.from({ length: 10000 }, (_, i) => (i % 2 ? "NaN" : 300))]);
  const d = readLinkData(b64({ pl, op: [[1e9, -1e9], null, [XSS, 5, 5]], b: [Infinity, "x"], k }));
  assert.equal(d.lineup.players.length, 16);
  assert.deepEqual([d.lineup.players[0].x, d.lineup.players[0].y], [0, 100]);
  assert.equal(d.lineup.opp.length, 2);
  assert.deepEqual([d.lineup.opp[0].x, d.lineup.opp[0].y], [100, 0]);
  assert.equal(d.lineup.opp[1].number, "<img");
  assert.deepEqual(d.lineup.ball, { x: 50, y: 50 });
  assert.equal(d.lineup.strokes.length, 60);
  assert.equal(d.lineup.strokes[0].points.length, 400);
  assert.equal(d.lineup.strokes[0].color, "#ffffff");
  assert.deepEqual(d.lineup.strokes[0].points[0], [100, 50]);
});

test("試合結果のリンク：点は 0〜99、得点は文字のまま、数に上限", () => {
  const { readLinkData } = boot();
  const d = readLinkData(b64({ us: XSS, th: 1e9, hu: "", ht: -3, g: [["t", XSS, XSS], ["x", 5, { a: 1 }], null, ...Array(100).fill(["u", "1", "a"])], mvp: XSS, t: 7 }));
  const r = d.result;
  assert.equal(r.scoreUs, 0);
  assert.equal(r.scoreThem, 99);
  assert.equal(r.halfUs, "");
  assert.equal(r.halfThem, 0);
  assert.equal(r.team, "7");
  assert.equal(r.goals.length, 39);
  assert.deepEqual(r.goals[0], { side: "t", min: "<img s", name: XSS.slice(0, 20) });
  assert.deepEqual(r.goals[1], { side: "u", min: "5", name: "" });
});

test("自分で作ったリンク（encode）を読み戻せる", () => {
  const { readLinkData, encode } = boot();
  const d = readLinkData(encode({ pl: [["1", "ゆうと", 50, 90], ["7", "はると", 30, 40]], k: [["#ff0000", [10, 10, 20, 20, 30, 30]]] }));
  assert.equal(d.lineup.players[1].name, "はると");
  assert.deepEqual(d.lineup.strokes[0].points, [[10, 10], [20, 20], [30, 30]]);
});

test("URL の中身が開いたときの状態に入る（変な中身でも落ちない）", () => {
  const { state } = boot({ search: "?data=" + b64({ pl: [["1", XSS, 50, 90], ["2", "", 0, 0]], t: XSS }) });
  assert.equal(state.players[0].name, XSS.slice(0, 20));
  assert.equal(state.players[1].x, 0);
  assert.equal(state.team, XSS.slice(0, 20));
  const broken = boot({ search: "?data=%%%" });
  assert.equal(broken.state.players.length, 11);
});

test("端末に残った中身が壊れていても初めの値で開く", () => {
  for (const bad of ["{", "[1]", "5", JSON.stringify({ players: "x" })]) {
    const { state } = boot({ store: { "soccer:state": bad } });
    assert.equal(state.players.length, 11);
  }
});

test("端末に残った中身の1つずつが壊れていても止まらない", () => {
  const bad = {
    players: [null, 5, "x", { number: { a: 1 }, name: ["n"], x: "abc", y: Infinity, marks: "y1", subs: "x" }, { number: "7", name: "山田", x: 30, y: 40 }],
    opp: { a: 1 },
    goals: [null, "x", { side: "t", name: 5, min: {} }, { side: "u", name: "山田", min: "10" }],
    strokes: "x",
    ball: null,
    lineShapes: [1],
    oppLineShapes: "x",
    ourColor: "red;background:url(x)",
    oppColor: 5,
    team: { a: 1 },
    opponent: ["x"],
    showOpp: "yes",
    scoreUs: "abc",
    whenDate: 5,
    lineupNote: 5,
    resultNote: null,
    formation: 442,
    mode: "rugby"
  };
  const { state, get } = boot({ store: { "soccer:state": JSON.stringify(bad) } });
  assert.equal(state.players.length, 2);
  assert.ok(state.players.every((p) => typeof p.number === "string" && typeof p.name === "string" && Number.isFinite(p.x) && Number.isFinite(p.y)));
  assert.equal(state.players[0].x, 50);
  assert.equal(state.opp, undefined);
  assert.equal(state.goals.length, 2);
  assert.equal(state.goals[0].name, "5"); // 数は文字にして残す
  assert.deepEqual(state.strokes, []);
  assert.equal(state.ball.x, 50);
  assert.equal(state.ourColor, "#22a447");
  assert.equal(state.oppColor, "#ffffff");
  assert.equal(state.team, "");
  assert.equal(state.showOpp, false);
  assert.equal(state.mode, "soccer");
  assert.equal(state.formation, "4-4-2");
  assert.equal(state.lineupNote, "");
  // 画面・カードに使う関数が止まらない
  for (const fn of ["anyCardMarks()", "subsForResult()", "marksForResult()", "whenText()", "state.players.map(playerMarksOf)"]) assert.doesNotThrow(() => get(fn), fn);
});

test("ろくがだけが書いた中身（チーム名・色だけ）でも、ほかは初めの値", () => {
  const { state } = boot({ store: { "soccer:state": JSON.stringify({ team: "FC", opponent: "B", ourColor: "#ffd23f", oppColor: "#ffffff" }) } });
  assert.equal(state.team, "FC");
  assert.equal(state.ourColor, "#ffd23f");
  assert.equal(state.players.length, 11);
});

test("保存した作戦が壊れていても、読めるものだけ残す", () => {
  const { get } = boot();
  const good = { id: "t1", name: "CK", savedAt: 1, board: { players: [{ number: "1", name: "", x: 50, y: 90 }, { number: "2", name: "", x: 50, y: 50 }], strokes: "x", mode: "futsal", formation: "1" } };
  const list = get("tacticsIn")([null, 5, { name: "x" }, { name: { a: 1 }, board: {} }, good]);
  assert.equal(list.length, 2);
  assert.equal(list[0].name, "作戦");
  assert.equal(list[1].name, "CK");
  assert.deepEqual(list[1].board.strokes, []);
  assert.equal(list[1].board.mode, "futsal");
  assert.equal(list[1].board.players.length, 2);
  assert.equal("goals" in list[1].board, false); // 作戦に入れるのは盤のことだけ
  assert.deepEqual(get("tacticsIn")("x"), []);
});
