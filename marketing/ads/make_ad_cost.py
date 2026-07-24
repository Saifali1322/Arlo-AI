#!/usr/bin/env python3
"""Arlo social ad #4 — the missed-call maths (1080x1350)."""
from PIL import Image, ImageDraw, ImageFont

FONT_DIR = "/root/.claude/skills/canvas-design/canvas-fonts"
OUT = "/home/user/Arlo-AI/marketing/ads"

NAVY, NAVY_SOFT = (11, 18, 32), (17, 26, 46)
WHITE, GOLD, SLATE, HAIRLINE = (247, 248, 250), (231, 178, 76), (138, 147, 166), (39, 50, 74)
W, H, M = 1080, 1350, 96


def font(name, size):
    return ImageFont.truetype(f"{FONT_DIR}/{name}", size)


def tw(d, s, f):
    return d.textbbox((0, 0), s, font=f)[2] if s else 0


def draw_tracked(d, xy, s, f, fill, tr):
    x, y = xy
    for c in s:
        d.text((x, y), c, font=f, fill=fill)
        x += d.textbbox((0, 0), c, font=f)[2] + tr


def fit_font(d, s, name, max_w, start):
    size = start
    while size > 20 and tw(d, s, font(name, size)) > max_w:
        size -= 4
    return font(name, size)


def chevron(d, cx, top_y, span, thick, colour):
    half = span / 2
    apex, left, right = (cx, top_y), (cx - half, top_y + half), (cx + half, top_y + half)
    d.line([left, apex], fill=colour, width=thick, joint="curve")
    d.line([apex, right], fill=colour, width=thick, joint="curve")
    r = thick / 2
    for px, py in (left, apex, right):
        d.ellipse([px - r, py - r, px + r, py + r], fill=colour)


def footer(d, tagline):
    sub = font("InstrumentSans-Regular.ttf", 26)
    d.text(((W - tw(d, tagline, sub)) / 2, H - 258), tagline, font=sub, fill=SLATE)
    d.line([(M, H - 212), (W - M, H - 212)], fill=HAIRLINE, width=2)
    fw = font("Gloock-Regular.ttf", 60)
    word = "arlo"
    chevron(d, W / 2, H - 78 - 60 - 45, 50, 8, WHITE)
    d.text((W / 2 - tw(d, word, fw) / 2, H - 78 - 60), word, font=fw, fill=WHITE)


img = Image.new("RGB", (W, H), NAVY)
d = ImageDraw.Draw(img)
for y in range(220):
    a = 1 - y / 220
    d.line([(0, y), (W, y)], fill=tuple(int(NAVY[i] + (NAVY_SOFT[i] - NAVY[i]) * a) for i in range(3)))

# eyebrow
mono = font("GeistMono-Regular.ttf", 24)
draw_tracked(d, (M, M), "THE MISSED-CALL MATHS", mono, GOLD, 6)
d.line([(M, M + 44), (M + 40, M + 44)], fill=GOLD, width=3)

# equation setup
setup = font("InstrumentSans-Regular.ttf", 52)
y = 300
d.text((M, y), "10 missed calls a week", font=setup, fill=WHITE); y += 78
d.text((M, y), "× £150 a job", font=setup, fill=SLATE); y += 108

# divider
d.line([(M, y), (M + 520, y)], fill=HAIRLINE, width=3); y += 60

# payoff — the big number
big = fit_font(d, "= £3,000/mo", "Gloock-Regular.ttf", W - 2 * M, 200)
d.text((M - 6, y), "= £3,000", font=big, fill=GOLD)
bh = d.textbbox((0, 0), "= £3,000", font=big)[3]
y += bh + 10
lost = font("Gloock-Regular.ttf", 88)
d.text((M, y), "gone.", font=lost, fill=GOLD)
y += 128

# supporting
body = font("InstrumentSans-Regular.ttf", 40)
for ln in ["You never see it happen — you only see", "the calls that get through.", "", "Arlo answers every one."]:
    if ln == "":
        y += 18
        continue
    col = WHITE if ln.startswith("Arlo") else SLATE
    f = font("InstrumentSans-Bold.ttf", 44) if ln.startswith("Arlo") else body
    d.text((M, y), ln, font=f, fill=col); y += 58

footer(d, "Never miss another call.")
img.save(f"{OUT}/arlo_ad_4_cost.png")
print("saved arlo_ad_4_cost.png")
