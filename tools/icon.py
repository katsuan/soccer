#!/usr/bin/env python3
"""さくせん盤（SAQSEN）のアイコンを作る。

おくるん（OQRN）のアイコンと同じ角の丸い四角に、ピッチの緑のグラデーション。
中は、白い S 字の作戦の線（パスの通り道）と、その両端の選手2人。後ろにうっすらピッチの線（ハーフウェーラインとセンターサークル）。
S 字は「さくせん（SAQSEN）」の S も兼ねる。作戦盤の線と同じく矢印は付けない。
センターサークルの右下にサッカーボールを置き、サークル（輪）＋ボール（しっぽ）で Q にも見せる（SAQSEN の Q）。

  icon.svg             … ファビコン
  apple-touch-icon.png … iPhone のホーム画面（180px）
  icon-512.png         … 大きいアイコン（512px）
  logo.svg             … 横長のロゴ「SAQSEN」。ピッチ（盤）の上に文字を並べ、Q はセンターサークル＋右下のボール、
                         S はアイコンと同じ線の S（作戦の線＋両端の選手）。A・E・N の字形は Jua（SIL Open Font License 1.1、~/Library/Fonts/Jua.ttf。おくるんのロゴと同じ）。fontTools が必要

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
# S 字（3次ベジェを3つ）：文字の S と同じ向き。右上の選手から左へ回り、まん中を右へ下り、下で左へ回って左下の選手で終わる
S_PATHS = (
    ((64, 31), (59, 22), (36, 21), (35, 36)),
    ((35, 36), (34, 49), (65, 47), (65, 62)),
    ((65, 62), (65, 78), (40, 79), (35, 69)),
)
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


def ball_patches(ball=BALL):
    """ボールの模様：真ん中の五角形と、ふちの5つの五角形（ボールの輪で切って使う）"""
    cx, cy, r = ball
    outer = [pentagon(cx + r * math.cos(math.radians(-90 + 72 * i)), cy + r * math.sin(math.radians(-90 + 72 * i)), r * 0.36, -90 + 72 * i + 36) for i in range(5)]
    return [pentagon(cx, cy, r * 0.4), *outer]


def svg():
    x0, y0 = S_PATHS[0][0]
    x3, y3 = S_PATHS[-1][-1]
    s_d = f"M{x0} {y0}" + "".join(f"C{a[0]} {a[1]} {b[0]} {b[1]} {c[0]} {c[1]}" for _, a, b, c in S_PATHS)
    faint = f'stroke="#ffffff" stroke-opacity="{FAINT}" stroke-width="3" fill="none"'
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">'
        f'<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{hex_(PITCH_LIGHT)}"/>'
        f'<stop offset="1" stop-color="{hex_(PITCH_DARK)}"/></linearGradient></defs>'
        f'<rect width="100" height="100" rx="{RADIUS}" fill="url(#g)"/>'
        f'<path d="M14 50H86" {faint}/><circle cx="{CIRCLE[0]}" cy="{CIRCLE[1]}" r="{CIRCLE[2]}" stroke="#ffffff" stroke-opacity="{CIRCLE_ALPHA}" stroke-width="3.5" fill="none"/>'
        f'<path d="{s_d}" stroke="#ffffff" stroke-width="{S_WIDTH}" stroke-linecap="round" fill="none"/>'
        f'<circle cx="{x0}" cy="{y0}" r="{PLAYER_R}" fill="#ffffff"/><circle cx="{x3}" cy="{y3}" r="{PLAYER_R}" fill="#ffffff"/>'
        f'<clipPath id="b"><circle cx="{BALL[0]}" cy="{BALL[1]}" r="{BALL[2]}"/></clipPath>'
        f'<circle cx="{BALL[0]}" cy="{BALL[1]}" r="{BALL[2] + 1.6}" fill="{hex_(PITCH_DARK)}"/>'
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
    for x, y in (pt for seg in S_PATHS for pt in cubic(seg, n=800)):
        d.ellipse((s(x) - half, s(y) - half, s(x) + half, s(y) + half), fill=WHITE)
    for x, y in (S_PATHS[0][0], S_PATHS[-1][-1]):
        d.ellipse((s(x - PLAYER_R), s(y - PLAYER_R), s(x + PLAYER_R), s(y + PLAYER_R)), fill=WHITE)
    # サークルの右下のボール（Q のしっぽ）
    bx, by, br = BALL
    # S の線と重なっても見分けられるよう、まわりを濃い緑で囲む
    d.ellipse((s(bx - br - 1.6), s(by - br - 1.6), s(bx + br + 1.6), s(by + br + 1.6)), fill=PITCH_DARK)
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


# ---- 横長のロゴ「SAQSEN」（盤の上の文字。Q＝センターサークル＋ボール） ----

FONT_PATH = Path.home() / "Library" / "Fonts" / "Jua.ttf"


def _num(v):
    return f"{v:.1f}".rstrip("0").rstrip(".")


def logo_svg():
    from fontTools.pens.boundsPen import BoundsPen
    from fontTools.pens.svgPathPen import SVGPathPen
    from fontTools.pens.transformPen import TransformPen
    from fontTools.ttLib import TTFont

    font = TTFont(str(FONT_PATH))
    glyphs = font.getGlyphSet()
    cmap = font.getBestCmap()

    def bounds(char):
        pen = BoundsPen(glyphs)
        glyphs[cmap[ord(char)]].draw(pen)
        return pen.bounds

    top, bottom = bounds("E")[3], bounds("E")[1]  # 上下が平らな E で文字の高さを決める
    h = top - bottom
    gap = h * 0.09
    w = h * 0.2  # Q（センターサークル）の線の太さ（文字の線とそろえる）
    r = h / 2 - w / 2
    # S はアイコンと同じ線の S（作戦の線＋両端の選手）。アイコンの S の外形（選手の丸を含む）を、文字の高さにそろえる
    pts = [pt for seg in S_PATHS for pt in cubic(seg)]
    sx0, sy0 = min(x for x, _ in pts) - S_WIDTH / 2, min(y for _, y in pts) - S_WIDTH / 2
    sx1, sy1 = max(x for x, _ in pts) + S_WIDTH / 2, max(y for _, y in pts) + S_WIDTH / 2
    k = h / (sy1 - sy0)
    s_w = h * 0.17  # 線の太さ（字の線に近づける）
    s_dot = h * 0.14  # 選手の丸
    line_s = []  # 線の S の SVG
    paths, x, q = [], 0.0, None
    for char in "SAQSEN":
        if char == "Q":
            q = (x + r + w / 2, h / 2)
            x += 2 * r + w + gap
            continue
        if char == "S":
            to = lambda pt: (x + (pt[0] - sx0) * k, (pt[1] - sy0) * k)  # noqa: E731
            ax, ay = to(S_PATHS[0][0])
            dx, dy = to(S_PATHS[-1][-1])
            d_ = f"M{_num(ax)} {_num(ay)}" + "".join("C" + " ".join(f"{_num(v)}" for pt in seg[1:] for v in to(pt)) for seg in S_PATHS)
            line_s.append(
                f'<path d="{d_}" stroke="#ffffff" stroke-width="{_num(s_w)}" stroke-linecap="round" fill="none"/>'
                f'<circle cx="{_num(ax)}" cy="{_num(ay)}" r="{_num(s_dot)}" fill="#ffffff"/><circle cx="{_num(dx)}" cy="{_num(dy)}" r="{_num(s_dot)}" fill="#ffffff"/>'
            )
            x += (sx1 - sx0) * k + gap
            continue
        b = bounds(char)
        origin = x - b[0]
        pen = SVGPathPen(glyphs)
        glyphs[cmap[ord(char)]].draw(TransformPen(pen, (1, 0, 0, -1, origin, top)))
        paths.append(pen.getCommands())
        x = origin + b[2] + gap
    right = x - gap
    qx, qy = q
    # ボール：サークルの右下（45°）のふち
    br = h * 0.24
    bx, by = qx + (r + w * 0.15) * 0.7071, qy + (r + w * 0.15) * 0.7071
    # 盤（ピッチ）：Q がちょうど真ん中（ハーフウェーライン上）に来るよう左右の幅をそろえる
    half = max(qx, right - qx) + h * 0.95
    pad_y = h * 0.62
    x0, y0, width, height = qx - half, -pad_y, half * 2, h + pad_y * 2
    lw = h * 0.045
    line = f'stroke="#ffffff" stroke-opacity="0.35" stroke-width="{_num(lw)}" fill="none"'
    inset = h * 0.16
    box_h, box_d = height * 0.56, h * 0.5
    ink = hex_(BALL_INK)
    patches = "".join('<polygon points="' + " ".join(f"{_num(px_)},{_num(py_)}" for px_, py_ in poly) + '"/>' for poly in ball_patches((bx, by, br)))
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{_num(x0)} {_num(y0)} {_num(width)} {_num(height)}" role="img" aria-label="SAQSEN（さくせん盤）">'
        f'<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{hex_(PITCH_LIGHT)}"/>'
        f'<stop offset="1" stop-color="{hex_(PITCH_DARK)}"/></linearGradient>'
        f'<clipPath id="b"><circle cx="{_num(bx)}" cy="{_num(by)}" r="{_num(br)}"/></clipPath></defs>'
        f'<rect x="{_num(x0)}" y="{_num(y0)}" width="{_num(width)}" height="{_num(height)}" rx="{_num(h * 0.3)}" fill="url(#g)"/>'
        # ピッチの線（うっすら）：外枠・ハーフウェーライン・両端のペナルティエリア
        f'<rect x="{_num(x0 + inset)}" y="{_num(y0 + inset)}" width="{_num(width - inset * 2)}" height="{_num(height - inset * 2)}" rx="{_num(h * 0.08)}" {line}/>'
        f'<path d="M{_num(qx)} {_num(y0 + inset)}V{_num(y0 + height - inset)}" {line}/>'
        f'<path d="M{_num(x0 + inset)} {_num(qy - box_h / 2)}h{_num(box_d)}v{_num(box_h)}h{_num(-box_d)}" {line}/>'
        f'<path d="M{_num(x0 + width - inset)} {_num(qy - box_h / 2)}h{_num(-box_d)}v{_num(box_h)}h{_num(box_d)}" {line}/>'
        # 文字（A・E・N は Jua、S はアイコンと同じ線の S）と、Q＝センターサークル＋ボール
        f'<g fill="#ffffff">' + "".join(f'<path d="{d}"/>' for d in paths) + "</g>" + "".join(line_s) +
        f'<circle cx="{_num(qx)}" cy="{_num(qy)}" r="{_num(r)}" fill="none" stroke="#ffffff" stroke-width="{_num(w)}"/>'
        f'<circle cx="{_num(bx)}" cy="{_num(by)}" r="{_num(br + w * 0.35)}" fill="{hex_(PITCH_DARK)}"/>'
        f'<circle cx="{_num(bx)}" cy="{_num(by)}" r="{_num(br)}" fill="#ffffff"/>'
        f'<g clip-path="url(#b)" fill="{ink}">{patches}</g>'
        "</svg>\n"
    )


def main():
    (ROOT / "icon.svg").write_text(svg() + "\n", encoding="utf-8")
    (ROOT / "logo.svg").write_text(logo_svg(), encoding="utf-8")
    png(180, rounded=False).convert("RGB").save(ROOT / "apple-touch-icon.png", optimize=True)
    png(512).save(ROOT / "icon-512.png", optimize=True)
    print("icon.svg / logo.svg / apple-touch-icon.png / icon-512.png を書き出しました")


if __name__ == "__main__":
    main()
