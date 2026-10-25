// さくせん盤（SAQSEN）：ページ全体で使う小さな道具（$・季節の絵文字・角の丸い四角・色・日時の文字）
//
// ファイル（index.html に書いた順に読み、同じ範囲の変数を使う。はじめに動かすのは最後の app.js）
//   js/page.js      ページ全体で使う小さな道具  ← このファイル
//   js/formation.js フォーメーション・コート・選手の並ぶ位置
//   js/marks.js     選手の印（カード・ゴールなど）と得点者・交代・結果に入れる名前
//   js/store.js     覚えておくこと（state。この端末に残す・形の確かめ・戻す）
//   js/link.js      受けとったリンク（?data=）を読む・リンクの文字を作る
//   js/board.js     画面：ピッチの描き直し・相手・選手のこま・ドラッグ・範囲選択
//   js/ink.js       ペン（作戦盤の線）
//   js/tactics.js   作戦の保存・場所の保存
//   js/sheets.js    選手の入力シート・結果の得点
//   js/card.js      送るカード（おくるん）・送る前の見本・画像のカード・天気のリンク
//   js/image.js     作戦盤の画像（保存・カードの写真）
//   js/events.js    操作（ボタン・入力）
//   app.js          入口：はじめに動かす
"use strict";

// id から画面の部品を返す
const $ = (id) => document.getElementById(id);
// 季節の絵文字（Q キットの season.js。tool-share.js があとから読む）を、うれしい瞬間の短い文にときどき足す。
// なくても・止まっても、文はそのまま
const seasonal = (text) => {
  try {
    return window.QSeason ? window.QSeason.decorate(text) : text;
  } catch {
    return text;
  }
};
// 角の丸い四角（roundRect）がない古いブラウザ（iOS 15 まで）でも、画像・盤を描けるように足す
function addRoundRect(Ctx) {
  if (!Ctx?.prototype || Ctx.prototype.roundRect) return;
  Ctx.prototype.roundRect = function (x, y, w, h, r = 0) {
    const rr = Math.max(0, Math.min(Number(Array.isArray(r) ? r[0] : r) || 0, w / 2, h / 2));
    this.moveTo(x + rr, y);
    this.arcTo(x + w, y, x + w, y + h, rr);
    this.arcTo(x + w, y + h, x, y + h, rr);
    this.arcTo(x, y + h, x, y, rr);
    this.arcTo(x, y, x + w, y, rr);
    this.closePath();
  };
}
if (typeof CanvasRenderingContext2D !== "undefined") addRoundRect(CanvasRenderingContext2D);

const PEN_COLORS = ["#ffffff", "#ffd23f", "#ff5a5f", "#38bdf8"];
const PEN_COLOR_NAMES = { "#ffffff": "白", "#ffd23f": "黄", "#ff5a5f": "赤", "#38bdf8": "水色" }; // 読み上げ用
// チームの色（自チーム・相手で選ぶ）。明るい色の丸は背番号を濃い色にする
// 横いっぱいの1行に収まるだけの8色。最後に「カスタム」（自由な色）。ろくがのアプリ版（TeamColors.presets）と同じ色・同じ並び
// （はじめの3色 緑・黄・白 は前からの色。白は相手の最初の色）。色の名前は画面に出さず、読み上げだけに使う
const TEAM_COLORS = [
  { label: "緑", hex: "#22a447" },
  { label: "黄", hex: "#ffd23f" },
  { label: "白", hex: "#ffffff" },
  { label: "赤", hex: "#e53935" },
  { label: "青", hex: "#1e63d6" },
  { label: "紺", hex: "#1b2a59" },
  { label: "オレンジ", hex: "#ff8a1f" },
  { label: "黒", hex: "#222222" }
];
// 色から色の名前（緑・黄…、決まった色でなければ「カスタム」）を返す。読み上げに使う
const teamColorName = (hex) => (TEAM_COLORS.find((c) => c.hex === String(hex).toLowerCase()) || { label: "カスタム" }).label;
// 明るい色か（白いユニフォームなど）を返す
const isLight = (hex) => {
  const n = parseInt(String(hex).slice(1), 16);
  return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114 > 170;
};
// 色の上にのせる字の色（明るい色なら濃い緑、暗い色なら白）を返す
const inkOn = (hex) => (isLight(hex) ? "#23302a" : "#ffffff");
// おくるんのカードの見出しの帯に使う色：さくせん盤の緑（チームの色ではなく、ツールの色にそろえる）
const cardColor = () => "#2e8b4a";

// 日にち・時間をカード・画像に出す形にする（例：10/18（土）9:00。どちらかだけでもよい）
function whenText() {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(state.whenDate || "");
  const t = /^(\d{2}):(\d{2})$/.exec(state.whenTime || "");
  const date = d ? `${Number(d[2])}/${Number(d[3])}（${"日月火水木金土"[new Date(Number(d[1]), Number(d[2]) - 1, Number(d[3])).getDay()]}）` : "";
  const time = t ? `${Number(t[1])}:${t[2]}` : "";
  return `${date}${time}`;
}
