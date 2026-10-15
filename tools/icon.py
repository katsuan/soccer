#!/usr/bin/env python3
"""さくせん盤（SAQSEN）のアイコンを作る。

S と Q を組んだ形。おくるん（OQRN）のアイコンと同じ角の丸い四角に、ピッチの緑のグラデーション。
  S … 左の S。終わり（左下）は選手の丸で、作戦の線にも見える（作戦盤の線と同じく矢印なし）
  Q … サッカーボールに、ボールの中から右下へ抜けるしっぽ（おくるんの Q と同じく、しっぽは右へはねる）

  icon.svg             … ファビコン・見出し
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
BALL_INK = (31, 61, 42)  # ボールの模様（濃い緑がかった黒）

# 形（100 × 100 の座標）
RADIUS = 23  # 角の丸み（おくるんと同じ）
BALL = (63, 50, 17)  # Q の輪＝サッカーボール（中心 x, y, 半径）
TAIL = ((71, 61), (75, 66), (82, 67))  # Q のしっぽ：ボールの中から右下へ抜けて、右へはねる（2次ベジェ）
TAIL_WIDTH = 6
# S（3次ベジェを2つ）：上の右端から左へ回り、まん中で右へ、下で左へ回って終わる。終わりは選手（作戦の線）
S_PATHS = (((39, 37), (36, 30), (20, 30), (20, 41)), ((20, 41), (20, 51), (39, 49), (39, 60)), ((39, 60), (39, 71), (23, 72), (19, 65)))
S_WIDTH = 7
PLAYER_R = 5.5


def hex_(rgb):
    return "#%02x%02x%02x" % rgb


def pentagon(cx, cy, r, rot=-90):
    return [(cx + r * math.cos(math.radians(rot + 72 * i)), cy + r * math.sin(math.radians(rot + 72 * i))) for i in range(5)]


def ball_parts():
    """ボールの模様：真ん中の五角形と、ふちの5つの五角形（輪で切る）、それをつなぐ線"""
    cx, cy, r = BALL
    center = pentagon(cx, cy, r * 0.36)
    outer = [pentagon(cx + r * 0.98 * math.cos(math.radians(-90 + 72 * i)), cy + r * 0.98 * math.sin(math.radians(-90 + 72 * i)), r * 0.32, -90 + 72 * i + 36) for i in range(5)]
    spokes = [(center[i], (cx + r * 0.7 * math.cos(math.radians(-90 + 72 * i)), cy + r * 0.7 * math.sin(math.radians(-90 + 72 * i)))) for i in range(5)]
    return center, outer, spokes


def svg():
    cx, cy, r = BALL
    center, outer, spokes = ball_parts()
    pts = lambda poly: " ".join(f"{x:.2f},{y:.2f}" for x, y in poly)  # noqa: E731
    s_d = "M{0} {1}".format(*S_PATHS[0][0]) + "".join("C{} {} {} {} {} {}".format(*a, *b, *c) for _, a, b, c in S_PATHS)
    x0, y0 = S_PATHS[-1][-1]
    (tx0, ty0), (tx1, ty1), (tx2, ty2) = TAIL
    ink = hex_(BALL_INK)
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">'
        f'<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{hex_(PITCH_LIGHT)}"/>'
        f'<stop offset="1" stop-color="{hex_(PITCH_DARK)}"/></linearGradient>'
        f'<clipPath id="b"><circle cx="{cx}" cy="{cy}" r="{r}"/></clipPath></defs>'
        f'<rect width="100" height="100" rx="{RADIUS}" fill="url(#g)"/>'
        f'<path d="{s_d}" stroke="#ffffff" stroke-width="{S_WIDTH}" stroke-linecap="round" fill="none"/>'
        f'<circle cx="{x0}" cy="{y0}" r="{PLAYER_R}" fill="#ffffff"/>'
        f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="#ffffff"/>'
        f'<g clip-path="url(#b)" fill="{ink}" stroke="{ink}" stroke-width="1.6" stroke-linejoin="round">'
        f'<polygon points="{pts(center)}"/>'
        + "".join(f'<polygon points="{pts(p)}"/>' for p in outer)
        + "".join(f'<path d="M{a[0]:.2f} {a[1]:.2f}L{b[0]:.2f} {b[1]:.2f}" fill="none"/>' for a, b in spokes)
        + "</g>"
        # しっぽはボールの上に重ねる（ふちを濃い色で囲んでボールと分ける）
        + f'<path d="M{tx0} {ty0}Q{tx1} {ty1} {tx2} {ty2}" stroke="{ink}" stroke-width="{TAIL_WIDTH + 3}" stroke-linecap="round" fill="none"/>'
        + f'<path d="M{tx0} {ty0}Q{tx1} {ty1} {tx2} {ty2}" stroke="#ffffff" stroke-width="{TAIL_WIDTH}" stroke-linecap="round" fill="none"/>'
        + "</svg>"
    )


def cubic(points, n=800):
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
    sp = lambda poly: [(s(x), s(y)) for x, y in poly]  # noqa: E731
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
    d = ImageDraw.Draw(img)

    def stroke(points, width, color=WHITE):
        half = s(width) / 2
        for x, y in points:
            ImageDraw.Draw(img).ellipse((s(x) - half, s(y) - half, s(x) + half, s(y) + half), fill=color)

    # S と、その終わりの選手
    for seg in S_PATHS:
        stroke(cubic(seg), S_WIDTH)
    x0, y0 = S_PATHS[-1][-1]
    d.ellipse((s(x0 - PLAYER_R), s(y0 - PLAYER_R), s(x0 + PLAYER_R), s(y0 + PLAYER_R)), fill=WHITE)
    # ボール（白い輪の中に模様。ふちの五角形は輪で切る）
    cx, cy, r = BALL
    d.ellipse((s(cx - r), s(cy - r), s(cx + r), s(cy + r)), fill=WHITE)
    pattern = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    pd = ImageDraw.Draw(pattern)
    center, outer, spokes = ball_parts()
    for poly in [center, *outer]:
        pd.polygon(sp(poly), fill=BALL_INK)
    for a, b in spokes:
        pd.line([(s(a[0]), s(a[1])), (s(b[0]), s(b[1]))], fill=BALL_INK, width=round(s(1.6)))
    clip = Image.new("L", (big, big), 0)
    ImageDraw.Draw(clip).ellipse((s(cx - r), s(cy - r), s(cx + r), s(cy + r)), fill=255)
    img.paste(pattern, (0, 0), Image.composite(pattern.getchannel("A"), Image.new("L", (big, big), 0), clip))
    # Q のしっぽ（ボールの上に重ね、ふちを濃い色で囲む）
    (tx0, ty0), (tx1, ty1), (tx2, ty2) = TAIL
    tail = [((1 - t) ** 2 * tx0 + 2 * (1 - t) * t * tx1 + t * t * tx2, (1 - t) ** 2 * ty0 + 2 * (1 - t) * t * ty1 + t * t * ty2) for t in (i / 400 for i in range(401))]
    stroke(tail, TAIL_WIDTH + 3, BALL_INK)
    stroke(tail, TAIL_WIDTH)
    return img.resize((size, size), Image.LANCZOS)


def main():
    (ROOT / "icon.svg").write_text(svg() + "\n", encoding="utf-8")
    png(180, rounded=False).convert("RGB").save(ROOT / "apple-touch-icon.png", optimize=True)
    png(512).save(ROOT / "icon-512.png", optimize=True)
    print("icon.svg / apple-touch-icon.png / icon-512.png を書き出しました")


if __name__ == "__main__":
    main()
