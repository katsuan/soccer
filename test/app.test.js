// 画面の部品をまねた入れ物で js/ と app.js を全部読み、ボタンの流れを確かめるテスト。node --test test/
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const FILES = ["js/page.js", "js/formation.js", "js/marks.js", "js/store.js", "js/link.js", "js/board.js", "js/ink.js", "js/tactics.js", "js/sheets.js", "js/card.js", "js/image.js", "js/events.js", "app.js"];

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

test("試合の日の天気（そらくる）：場所と日にちがあるときだけ。時間は時に、過ぎた日は出さない", () => {
  const { run } = boot();
  const now = "new Date(2026, 9, 25, 10, 0)";
  run('state.where = ""; state.whenDate = "2026-10-31"; state.whenTime = "";');
  assert.equal(run(`weatherUrl(${now})`), "");
  run('state.where = "パロマ瑞穂スタジアム"; state.whenDate = "";');
  assert.equal(run(`weatherUrl(${now})`), "");
  run('state.whenDate = "2026-10-31"; state.whenTime = "09:30";');
  const url = new URL(run(`weatherUrl(${now})`));
  assert.equal(url.origin + url.pathname, "https://katsuan.github.io/soraqru/");
  assert.deepEqual(Object.fromEntries(url.searchParams), { q: "パロマ瑞穂スタジアム", name: "パロマ瑞穂スタジアム", date: "2026-10-31", from: "saqsen", hour: "9" });
  assert.doesNotMatch(run(`weatherUrl(${now})`), /\+/);
  run('state.whenDate = "2026-10-24";');
  assert.equal(run(`weatherUrl(${now})`), "");
  run('state.whenDate = "2026-10-25"; state.whenTime = "";');
  assert.ok(run(`weatherUrl(${now})`).includes("date=2026-10-25"));
});

// ファイルの名前の決まり（q-oqrn/docs/structure.md）：入口は app.js、部品は js/ に役わりの名前。
// 前の名前（js/core.js・js/share.js）は、前の index.html を覚えているブラウザのために、新しいファイルを読むだけ
test("index.html は新しい名前のファイルを読み、前の名前のファイルは新しいファイルを読むだけ", () => {
  const html = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");
  const scripts = [...html.matchAll(/<script src="((?:js\/)?[a-z-]+\.js)\?v=(\d+)"/g)];
  assert.deepEqual(scripts.map((m) => m[1]), FILES);
  const version = scripts[0][2];
  for (const [old, next] of [["js/core.js", ["page", "formation", "marks", "store", "link"]], ["js/share.js", ["card", "image"]]]) {
    const stub = fs.readFileSync(path.join(__dirname, "..", old), "utf8");
    assert.match(stub, new RegExp(`\\[${next.map((n) => `"${n}"`).join(", ")}\\]`), old);
    assert.match(stub, new RegExp(`\\?v=${version}"`), `${old} の ?v= が index.html とちがう`);
  }
});

// ux.md の D1：1つを消すのは、確かめずに消して「元に戻す」で戻せる
test("得点者を消すと、スコアも減り、「元に戻す」で得点者とスコアがもどる", () => {
  const { run } = boot();
  run(`state.goals = [{ side: "u", min: "10", name: "山田" }, { side: "u", min: "20", name: "" }]; state.scoreUs = 2; state.scoreThem = 0;
       var lastToast = null; LineShareUI.toast = (text, opts) => (lastToast = { text, opts });`);
  run("removeGoal(0)");
  assert.equal(run("state.goals.length"), 1);
  assert.equal(run("state.scoreUs"), 1);
  assert.equal(run("lastToast.text"), "「山田」の得点を消しました");
  assert.equal(run("lastToast.opts.actionLabel"), "元に戻す");
  run("lastToast.opts.onAction()");
  assert.equal(run("state.goals.length"), 2);
  assert.equal(run("state.goals[0].name"), "山田");
  assert.equal(run("state.scoreUs"), 2);
});

// ux.md の C3：押せるところは 44px。小さな × は透明の押せるところを足す・リンクと開閉の見出しは 44px
test("得点者の ×・リンク・開閉の見出しは 44px 押せる", () => {
  const css = fs.readFileSync(path.join(__dirname, "..", "style.css"), "utf8");
  assert.match(css, /\.goal \.remove::after \{[^}]*inset:\s*-9px/);
  assert.match(css, /\.link \{[^}]*min-height:\s*44px/);
  assert.match(css, /\.fold summary \{[^}]*min-height:\s*44px/);
});
