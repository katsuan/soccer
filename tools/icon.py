#!/usr/bin/env python3
"""さくせん盤（SAQSEN）のアイコンを作る。

おくるん（OQRN）のアイコンと同じ角の丸い四角に、ピッチの緑のグラデーション。
中は、白い S 字の作戦の線（パスの通り道）と、その両端の選手2人。後ろにうっすらピッチの線（ハーフウェーラインとセンターサークル）。
S 字は「さくせん（SAQSEN）」の S も兼ねる。作戦盤の線と同じく矢印は付けない。
センターサークルの右下にサッカーボールを置き、サークル（輪）＋ボール（しっぽ）で Q にも見せる（SAQSEN の Q）。

  icon.svg             … ファビコン
  apple-touch-icon.png … iPhone のホーム画面（180px）
  icon-512.png         … 大きいアイコン（512px）

Pillow が必要。使い方: python3 tools/icon.py
"""
import math
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent

PITCH_DARK = (46, 139, 74)  # style.css の --pitch
PITCH_LIGHT = (92, 194, 122)
WHITE = (255, 255, 255)

# 形（100 × 100 の座標）
RADIUS = 23  # 角の丸み（おくるんと同じ）
S_PATH = ((31, 72), (27, 44), (73, 56), (69, 28))  # S 字（3次ベジェ）：左下の選手から右上の選手へ
S_WIDTH = 7
PLAYER_R = 7.5
FAINT = 0.32  # ピッチの線の濃さ
CIRCLE = (50, 50, 13)  # センターサークル（中心 x, y, 半径）
CIRCLE_ALPHA = 0.55  # サークルはハーフウェーラインより濃く（ボールと合わせて Q に見せる）
BALL = (61, 61, 7)  # ボール：サークルの右下（45°）のふちに重ねる＝Q のしっぽ
BALL_INK = (31, 61, 42)  # ボールの模様


def hex_(rgb):
    return "#%02x%02x%02x" % rgb


def pentagon(cx, cy, r, rot=-90):
    return [(cx + r * math.cos(math.radians(rot + 72 * i)), cy + r * math.sin(math.radians(rot + 72 * i))) for i in range(5)]


def ball_patches():
    """ボールの模様：真ん中の五角形と、ふちの5つの五角形（ボールの輪で切って使う）"""
    cx, cy, r = BALL
    outer = [pentagon(cx + r * math.cos(math.radians(-90 + 72 * i)), cy + r * math.sin(math.radians(-90 + 72 * i)), r * 0.36, -90 + 72 * i + 36) for i in range(5)]
    return [pentagon(cx, cy, r * 0.4), *outer]


def svg():
    (x0, y0), (x1, y1), (x2, y2), (x3, y3) = S_PATH
    faint = f'stroke="#ffffff" stroke-opacity="{FAINT}" stroke-width="3" fill="none"'
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">'
        f'<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{hex_(PITCH_LIGHT)}"/>'
        f'<stop offset="1" stop-color="{hex_(PITCH_DARK)}"/></linearGradient></defs>'
        f'<rect width="100" height="100" rx="{RADIUS}" fill="url(#g)"/>'
        f'<path d="M14 50H86" {faint}/><circle cx="{CIRCLE[0]}" cy="{CIRCLE[1]}" r="{CIRCLE[2]}" stroke="#ffffff" stroke-opacity="{CIRCLE_ALPHA}" stroke-width="3.5" fill="none"/>'
        f'<path d="M{x0} {y0}C{x1} {y1} {x2} {y2} {x3} {y3}" stroke="#ffffff" stroke-width="{S_WIDTH}" stroke-linecap="round" fill="none"/>'
        f'<circle cx="{x0}" cy="{y0}" r="{PLAYER_R}" fill="#ffffff"/><circle cx="{x3}" cy="{y3}" r="{PLAYER_R}" fill="#ffffff"/>'
        f'<clipPath id="b"><circle cx="{BALL[0]}" cy="{BALL[1]}" r="{BALL[2]}"/></clipPath>'
        f'<circle cx="{BALL[0]}" cy="{BALL[1]}" r="{BALL[2]}" fill="#ffffff"/>'
        f'<g clip-path="url(#b)" fill="{hex_(BALL_INK)}">'
        + "".join('<polygon points="' + " ".join(f"{x:.2f},{y:.2f}" for x, y in poly) + '"/>' for poly in ball_patches())
        + "</g></svg>"
    )


def cubic(points, n=200):
    (x0, y0), (x1, y1), (x2, y2), (x3, y3) = points
    out = []
    for i in range(n + 1):
        t = i / n
        a, b, c, d = (1 - t) ** 3, 3 * (1 - t) ** 2 * t, 3 * (1 - t) * t * t, t ** 3
        out.append((a * x0 + b * x1 + c * x2 + d * x3, a * y0 + b * y1 + c * y2 + d * y3))
    return out


def png(size, rounded=True):
    """size px の PNG。4 倍で描いて縮め、ふちをなめらかにする。rounded=False は角まで塗る（iPhone が自分で丸める）"""
    scale = size * 4 / 100
    big = size * 4
    s = lambda v: v * scale  # noqa: E731
    # 背景のグラデーション（左上が明るく、右下が濃い）
    grad = Image.new("RGB", (big, big))
    px = grad.load()
    for y in range(big):
        for x in range(big):
            t = (x + y) / (2 * (big - 1))
            px[x, y] = tuple(round(PITCH_LIGHT[i] + (PITCH_DARK[i] - PITCH_LIGHT[i]) * t) for i in range(3))
    mask = Image.new("L", (big, big), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, big - 1, big - 1), radius=s(RADIUS) if rounded else 0, fill=255)
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    img.paste(grad, (0, 0), mask)
    # うっすらピッチの線
    lines = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(lines)
    faint = (255, 255, 255, round(255 * FAINT))
    d.line((s(14), s(50), s(86), s(50)), fill=faint, width=round(s(3)))
    cx, cy, r = CIRCLE
    d.ellipse((s(cx - r) - s(1.75), s(cy - r) - s(1.75), s(cx + r) + s(1.75), s(cy + r) + s(1.75)), outline=(255, 255, 255, round(255 * CIRCLE_ALPHA)), width=round(s(3.5)))
    img = Image.alpha_composite(img, lines)
    # S 字の線（丸い端）と選手2人
    d = ImageDraw.Draw(img)
    # 線は丸を細かく並べて描く（太い線でもふちがなめらか）
    half = s(S_WIDTH) / 2
    for x, y in cubic(S_PATH, n=800):
        d.ellipse((s(x) - half, s(y) - half, s(x) + half, s(y) + half), fill=WHITE)
    for x, y in (S_PATH[0], S_PATH[3]):
        d.ellipse((s(x - PLAYER_R), s(y - PLAYER_R), s(x + PLAYER_R), s(y + PLAYER_R)), fill=WHITE)
    # サークルの右下のボール（Q のしっぽ）
    bx, by, br = BALL
    d.ellipse((s(bx - br), s(by - br), s(bx + br), s(by + br)), fill=WHITE)
    big_ = img.size[0]
    pattern = Image.new("RGBA", (big_, big_), (0, 0, 0, 0))
    pd = ImageDraw.Draw(pattern)
    for poly in ball_patches():
        pd.polygon([(s(x), s(y)) for x, y in poly], fill=BALL_INK)
    clip = Image.new("L", (big_, big_), 0)
    ImageDraw.Draw(clip).ellipse((s(bx - br), s(by - br), s(bx + br), s(by + br)), fill=255)
    img.paste(pattern, (0, 0), Image.composite(pattern.getchannel("A"), Image.new("L", (big_, big_), 0), clip))
    return img.resize((size, size), Image.LANCZOS)


def main():
    (ROOT / "icon.svg").write_text(svg() + "\n", encoding="utf-8")
    png(180, rounded=False).convert("RGB").save(ROOT / "apple-touch-icon.png", optimize=True)
    png(512).save(ROOT / "icon-512.png", optimize=True)
    print("icon.svg / apple-touch-icon.png / icon-512.png を書き出しました")


if __name__ == "__main__":
    main()
