// 画面の部品をまねた入れ物で js/ と app.js を全部読み、ボタンの流れを確かめるテスト。node --test test/
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const FILES = ["js/core.js", "js/board.js", "js/ink.js", "js/tactics.js", "js/sheets.js", "js/share.js", "js/events.js", "app.js"];

// どんな使い方をしても止まらない、まねの部品（書いた値は覚える）
function fakeEl() {
  const own = {};
  const proxy = new Proxy(function () {}, {
    get(_, key) {
      if (key in own) return own[key];
      if (key === Symbol.iterator) return function* () {};
      if (key === Symbol.toPrimitive) return () => 0;
      if (typeof key === "symbol" || key === "then") return undefined;
      return proxy;
    },
    set(_, key, value) {
      own[key] = value;
      return true;
    },
    apply: () => proxy
  });
  return proxy;
}

function boot({ store = {}, canvas } = {}) {
  const els = new Map();
  const document = fakeEl();
  document.getElementById = (id) => (els.has(id) ? els.get(id) : (els.set(id, fakeEl()), els.get(id)));
  const appended = [];
  document.body = fakeEl();
  document.body.append = (...nodes) => appended.push(...nodes);
  const created = [];
  document.createElement = (tag) => {
    const e = tag === "canvas" && canvas ? canvas() : fakeEl();
    created.push(e);
    return e;
  };
  const toasts = [];
  const LineShareUI = { ask: () => Promise.resolve(false), toast: (t) => toasts.push(t), progress: () => () => {}, firstTip() {} };
  const mem = { ...store };
  const ctx = vm.createContext({
    document,
    window: { matchMedia: () => ({ matches: false, addEventListener() {} }), addEventListener() {}, LineShareUI },
    LineShareUI,
    OQRN: { cardUrl: () => "https://example.com/" },
    localStorage: { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => (mem[k] = String(v)), removeItem: (k) => delete mem[k] },
    location: { search: "", pathname: "/soccer/", href: "" },
    history: { replaceState() {} },
    navigator: {},
    fetch: () => Promise.reject(new Error("offline")),
    URLSearchParams, TextEncoder, TextDecoder, atob, btoa,
    URL: { createObjectURL: () => "blob:x", revokeObjectURL() {} },
    File: class {},
    Image: class {},
    requestAnimationFrame: () => 0,
    cancelAnimationFrame() {},
    setTimeout: () => 0,
    clearTimeout() {},
    setInterval: () => 0,
    clearInterval() {},
    getComputedStyle: () => fakeEl(),
    MutationObserver: class { observe() {} },
    ResizeObserver: class { observe() {} },
    Blob,
    performance,
    console: { ...console, error() {} }
  });
  for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(__dirname, "..", f), "utf8"), ctx, { filename: f });
  return { run: (code) => vm.runInContext(code, ctx), appended, toasts };
}

test("js/ を全部読んでも止まらない", () => {
  const { run } = boot();
  assert.equal(run("state.players.length"), 11);
});

test("端末の中身が壊れていても、画面を描くところまで止まらない", () => {
  const bad = JSON.stringify({ players: [null, { x: "a" }, { number: 3 }], opp: 5, goals: [1, { side: "t" }], strokes: [{ points: "x" }], showOpp: true });
  const { run } = boot({ store: { "soccer:state": bad, "soccer:tactics": JSON.stringify([null, { board: 5 }]) } });
  assert.equal(run("state.players.length"), 2);
  assert.doesNotThrow(() => run("render(); renderTactics();"));
});

test("📸 画像で保存を続けて押しても、画面は1つだけ", async () => {
  const { run, appended } = boot();
  run("boardCanvas = async () => ({ toBlob: (cb) => cb(new Blob(['x'])) });");
  await Promise.all([run("saveBoardImage()"), run("saveBoardImage()")]);
  assert.equal(appended.length, 1);
});

test("画像を作れない端末（toBlob が null）でも止まらず、知らせる", async () => {
  const { run, appended, toasts } = boot();
  run("boardCanvas = async () => ({ toBlob: (cb) => cb(null) });");
  await assert.doesNotReject(() => run("saveBoardImage()"));
  assert.equal(appended.length, 0);
  assert.equal(toasts.length, 1);
});

test("角を丸められない古いブラウザでも、画像を描くところで止まらない", () => {
  const { run } = boot();
  const ctx2d = run("(() => { const C = function () {}; C.prototype.beginPath = function () {}; C.prototype.moveTo = function () {}; C.prototype.arcTo = function () {}; C.prototype.closePath = function () {}; addRoundRect(C); return new C(); })()");
  assert.equal(typeof ctx2d.roundRect, "function");
  assert.doesNotThrow(() => ctx2d.roundRect(0, 0, 10, 10, 3));
});

test("作戦を保存したら「保存しました」。季節の絵文字がつくことがある（QSeason がなくても動く）", async () => {
  const { run, toasts } = boot();
  run(`$("tacticName").value = "CK";`);
  await run("saveTactic()");
  assert.equal(toasts.at(-1), "「CK」を保存しました");
  run(`window.QSeason = { decorate: (t) => t + " 🎃" }; $("tacticName").value = "FK";`);
  await run("saveTactic()");
  assert.equal(toasts.at(-1), "「FK」を保存しました 🎃");
});

test("チームの色のパレット：8色とカスタム。開いた・たたんだでも止まらない", () => {
  const { run } = boot();
  assert.equal(run("paletteItems(TEAM_COLOR_SIDES[1]).length"), 9);
  assert.doesNotThrow(() => run("colorOpen = 'oppColor'; renderTeamColors(); colorOpen = null; renderTeamColors();"));
});

test("ペンの色は、どれも読み上げの名前がある", () => {
  const { run } = boot();
  assert.ok(run("PEN_COLORS.every((c) => PEN_COLOR_NAMES[c])"));
});

// 送るボタンの緑とおくるんのマークは Q キット（ui.css の line・is-oqrn）にまかせる。自前で上書きしない
test("送るボタンの見た目を、自前の CSS で上書きしない", () => {
  const css = fs.readFileSync(path.join(__dirname, "../style.css"), "utf8");
  assert.ok(!/\.ls-button\.line\b/.test(css));
  const html = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");
  assert.ok(!/💬/.test(html));
});
