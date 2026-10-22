// リンク（?data=）と端末の中身を読むところのテスト。node --test test/
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const code = fs.readFileSync(path.join(__dirname, "../js/core.js"), "utf8");
const XSS = "<img src=x onerror=alert(1)>";
const b64 = (v) => Buffer.from(JSON.stringify(v), "utf8").toString("base64url");

// 端末の中身と URL を決めて core.js を読む
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
  return { state: get("state"), readLinkData: get("readLinkData"), encode: get("encode") };
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
