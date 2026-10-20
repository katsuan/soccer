// さくせん盤（SAQSEN）。スタメン・作戦・試合結果。選手をピッチに並べ、おくるん（お知らせカード）に JSON で渡して LINE にカードで送る。
// 試合結果も同じように渡す。作戦盤として、相手・ボール・ペンの線も使える（線と相手はカードには入れず、画像で保存できる）。
//
// おくるんへの渡し方: https://liff.line.me/<LIFF ID>/card/?kind=lineup|match&data=<JSON を UTF-8 → base64url>&…
//   lineup: { m: "futsal"|"soccer"（ピッチの描き方）, f（決まった並びでなければ ""）, t, o, s, c, pl: [[背番号, 名前, x, y], ...] }   x・y は 0〜100（左上から。上が攻める向き。先頭は GK）
//   match:  { t, o, us, th, hu, ht, g: [["u"|"t", 分, 名前], ...], mvp }
// おくるんの「さくせん盤で直す」からは ?tab=lineup|result&data=… で戻ってくる（1ページなので、result のときは 👕 チーム・試合結果の欄を開く）。
// 作戦盤の画像カードの画像をタップすると ?tab=lineup&data=… で開く。lineup に op（相手 [[背番号, x, y]]。背番号が順番どおりなら [x, y]）・of・oc・b（ボール [x, y]）・k（線 [[色, [x, y, x, y, …]]]）も入る。
//
// ファイルの分け方（どれも普通の <script>。index.html に書いた順に読み、同じ範囲の変数を使う。はじめに動かすのはこのファイル）
//   js/core.js    定数・フォーメーションの位置・状態（この端末に残す）・戻す・リンクからの読み込み
//   js/board.js   画面：ピッチの描き直し・相手・選手のこま・ドラッグ・範囲選択
//   js/ink.js     ペン（作戦盤の線）
//   js/tactics.js 作戦の保存
//   js/sheets.js  選手の入力シート・結果の得点
//   js/share.js   おくるんへのリンク・作戦盤の画像
//   js/events.js  操作（ボタン・入力）
//   app.js        はじめに動かす（このファイル）
"use strict";

render();
renderTactics();
// 試合結果のリンク（?tab=result）から開いたときは、👕 チーム・試合結果の欄を開いてそこまで送る
if (openResultOnLoad) {
  $("teamFold").open = true;
  $("teamFold").scrollIntoView({ block: "start" });
}
