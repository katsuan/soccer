#!/usr/bin/env python3
"""さくせん盤（SAQSEN）の OGP 画像（ogp.png、1200x630）を作る。リンクを共有したときの画像に使う。

ピッチの緑にうっすら線（外枠・ハーフウェーライン・センターサークル・両端のペナルティエリア）を引き、
左にアイコン（tools/icon.py と同じ形）、右に名前「さくせん盤」・英字「SAQSEN」・説明。
macOS のヒラギノ角ゴシック・Jua（~/Library/Fonts/Jua.ttf）・Pillow が必要。

使い方: python3 tools/ogp.py
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from icon import FONT_PATH, PITCH_DARK, PITCH_LIGHT, png

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "ogp.png"
W, H = 1200, 630
S = 2  # 2倍で描いてから縮める


def hira(weight, size):
    return ImageFont.truetype(f"/System/Library/Fonts/ヒラギノ角ゴシック W{weight}.ttc", size * S)


def main():
    big = (W * S, H * S)
    img = Image.new("RGB", big)
    px = img.load()
    for y in range(big[1]):
        for x in range(big[0]):
            t = (x / big[0] + y / big[1]) / 2
            px[x, y] = tuple(round(PITCH_LIGHT[i] + (PITCH_DARK[i] - PITCH_LIGHT[i]) * t) for i in range(3))
    img = img.convert("RGBA")

    # うっすらピッチの線
    lines = Image.new("RGBA", big, (0, 0, 0, 0))
    d = ImageDraw.Draw(lines)
    faint = (255, 255, 255, 60)
    lw = 4 * S
    m = 40 * S
    d.rounded_rectangle((m, m, big[0] - m, big[1] - m), radius=14 * S, outline=faint, width=lw)
    d.line((big[0] / 2, m, big[0] / 2, big[1] - m), fill=faint, width=lw)
    d.ellipse((big[0] / 2 - 90 * S, big[1] / 2 - 90 * S, big[0] / 2 + 90 * S, big[1] / 2 + 90 * S), outline=faint, width=lw)
    for side in (m, big[0] - m):
        dx = 120 * S if side == m else -120 * S
        y0, y1 = big[1] / 2 - 150 * S, big[1] / 2 + 150 * S
        d.line((side, y0, side + dx, y0, side + dx, y1, side, y1), fill=faint, width=lw, joint="curve")
    img = Image.alpha_composite(img, lines)

    # 左：アイコン（影を少し付ける）
    icon = png(300 * S)
    shadow = Image.new("RGBA", big, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle((128 * S, 177 * S, 428 * S, 477 * S), radius=69 * S, fill=(0, 40, 15, 70))
    img = Image.alpha_composite(img, shadow)
    img.alpha_composite(icon, (120 * S, 165 * S))

    # 右：名前・英字・説明
    d = ImageDraw.Draw(img)
    x = 480 * S
    d.text((x, 250 * S), "さくせん盤", font=hira(8, 104), fill=(255, 255, 255), anchor="ls")
    jua = ImageFont.truetype(str(FONT_PATH), 46 * S)
    cx = x
    for ch in "SAQSEN":  # 字の間を少しあける
        d.text((cx, 322 * S), ch, font=jua, fill=(255, 255, 255, 230), anchor="ls")
        cx += d.textlength(ch, font=jua) + 10 * S
    # キャッチコピー（おくるんの「つくって、おくるん」と同じ役目）と、その下に小さく説明
    d.text((x, 412 * S), "描いて、伝えて、勝ちにいこう", font=hira(8, 46), fill=(255, 255, 255), anchor="ls")
    d.text((x, 474 * S), "スタメン・作戦・試合結果を", font=hira(6, 30), fill=(255, 255, 255, 215), anchor="ls")
    d.text((x, 518 * S), "LINE にカードで送れる", font=hira(6, 30), fill=(255, 255, 255, 215), anchor="ls")

    img.resize((W, H), Image.LANCZOS).convert("RGB").save(OUT, optimize=True)
    print(f"{OUT.name} を書き出しました")


if __name__ == "__main__":
    main()
