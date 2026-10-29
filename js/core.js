// 前の名前のファイル（2026-11-25 ごろに消す。README）。前の index.html を覚えているブラウザ（LINE の中など）のために、新しいファイルを読むだけ。
// 今の index.html は js/page.js・formation.js・marks.js・store.js・link.js を読む
document.write(["page", "formation", "marks", "store", "link"].map((name) => `<script src="js/${name}.js?v=202610291740"></script>`).join(""));
