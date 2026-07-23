#!/usr/bin/env python3
"""Generate Arlo social ad creatives (1080x1350 portrait)."""
from PIL import Image, ImageDraw, ImageFont

FONT_DIR = "/root/.claude/skills/canvas-design/canvas-fonts"
OUT = "/home/user/Arlo-AI/marketing/ads"

# ---- Brand palette -----------------------------------------------------
NAVY      = (11, 18, 32)      # #0B1220 ground
NAVY_SOFT = (17, 26, 46)      # panel
WHITE     = (247, 248, 250)   # #F7F8FA
GOLD      = (231, 178, 76)    # #E7B24C accent
SLATE     = (138, 147, 166)   # muted secondary
HAIRLINE  = (39, 50, 74)      # faint rule on navy

W, H = 1080, 1350
M = 96  # margin


def font(name, size):
    return ImageFont.truetype(f"{FONT_DIR}/{name}", size)


def text_w(d, s, f, tracking=0):
    if not s:
        return 0
    if tracking == 0:
        return d.textbbox((0, 0), s, font=f)[2]
    return sum(d.textbbox((0, 0), c, font=f)[2] + tracking for c in s) - tracking


def draw_tracked(d, xy, s, f, fill, tracking):
    x, y = xy
    for c in s:
        d.text((x, y), c, font=f, fill=fill)
        x += d.textbbox((0, 0), c, font=f)[2] + tracking


def wrap(d, words, f, max_w):
    lines, cur = [], ""
    for word in words.split():
        test = word if not cur else cur + " " + word
        if text_w(d, test, f) <= max_w:
            cur = test
        else:
            if cur:
                lines.append(cur)
            cur = word
    if cur:
        lines.append(cur)
    return lines


def chevron(d, cx, top_y, span, thick, colour):
    """Upward chevron ^ centred at cx, apex at top_y."""
    half = span / 2
    apex = (cx, top_y)
    left = (cx - half, top_y + half)
    right = (cx + half, top_y + half)
    d.line([left, apex], fill=colour, width=thick, joint="curve")
    d.line([apex, right], fill=colour, width=thick, joint="curve")
    # round the caps
    r = thick / 2
    for px, py in (left, apex, right):
        d.ellipse([px - r, py - r, px + r, py + r], fill=colour)


def wordmark(d, cx, baseline_y, mark_span=64, word_size=76, colour=WHITE):
    """Chevron mark above the lowercase serif 'arlo' wordmark, centred on cx."""
    fw = font("Gloock-Regular.ttf", word_size)
    word = "arlo"
    ww = text_w(d, word, fw)
    # chevron sits above the word
    ch_thick = max(8, int(mark_span * 0.16))
    ch_top = baseline_y - word_size - int(mark_span * 0.9)
    chevron(d, cx, ch_top, mark_span, ch_thick, colour)
    d.text((cx - ww / 2, baseline_y - word_size), word, font=fw, fill=colour)


def base(draw_top_label=None):
    img = Image.new("RGB", (W, H), NAVY)
    d = ImageDraw.Draw(img)
    # subtle top + bottom gradient panels for depth
    for y in range(0, 220):
        a = 1 - y / 220
        c = tuple(int(NAVY[i] + (NAVY_SOFT[i] - NAVY[i]) * a) for i in range(3))
        d.line([(0, y), (W, y)], fill=c)
    return img, d


def eyebrow(d, y, label):
    mono = font("GeistMono-Regular.ttf", 24)
    draw_tracked(d, (M, y), label, mono, GOLD, 6)
    # tick mark
    d.line([(M, y + 44), (M + 40, y + 44)], fill=GOLD, width=3)


def footer(d, tagline):
    sub = font("InstrumentSans-Regular.ttf", 26)
    sw = text_w(d, tagline, sub)
    d.text(((W - sw) / 2, H - 258), tagline, font=sub, fill=SLATE)
    d.line([(M, H - 212), (W - M, H - 212)], fill=HAIRLINE, width=2)
    wordmark(d, W / 2, H - 78, mark_span=50, word_size=60)


# ---- Ad 1 : the 62% stat ----------------------------------------------
def ad_stat():
    img, d = base()
    eyebrow(d, M, "THE MISSED-CALL PROBLEM")

    num = font("Gloock-Regular.ttf", 460)
    d.text((M - 12, 250), "62", font=num, fill=GOLD)
    # percent sign smaller, trailing
    pct = font("Gloock-Regular.ttf", 190)
    n_w = text_w(d, "62", num)
    d.text((M - 12 + n_w + 10, 300), "%", font=pct, fill=GOLD)

    head = font("InstrumentSans-Bold.ttf", 64)
    lines = wrap(d, "of calls to UK small businesses go unanswered.", head, W - 2 * M)
    y = 760
    for ln in lines:
        d.text((M, y), ln, font=head, fill=WHITE)
        y += 78

    body = font("InstrumentSans-Regular.ttf", 40)
    y += 26
    for ln in wrap(d, "Arlo answers every one — in a natural British voice, day or night.", body, W - 2 * M):
        d.text((M, y), ln, font=body, fill=SLATE)
        y += 54

    footer(d, "Never miss another call.")
    img.save(f"{OUT}/arlo_ad_1_stat.png")


# ---- Ad 2 : the emotional hook ----------------------------------------
def ad_emotional():
    img, d = base()
    eyebrow(d, M, "FOR THE ONES ON THE TOOLS")

    serif = font("Gloock-Regular.ttf", 82)
    gold_serif = font("Gloock-Regular.ttf", 82)
    y = 300
    l1 = wrap(d, "You didn't lose the job because you're bad at it.", serif, W - 2 * M)
    for ln in l1:
        d.text((M, y), ln, font=serif, fill=WHITE)
        y += 100
    y += 30
    l2 = wrap(d, "You lost it because you were on a job.", gold_serif, W - 2 * M)
    for ln in l2:
        d.text((M, y), ln, font=gold_serif, fill=GOLD)
        y += 100

    body = font("InstrumentSans-Regular.ttf", 40)
    y += 40
    for ln in wrap(d, "Arlo picks up every call while you work — qualifies it, books it, and texts you the details.", body, W - 2 * M):
        d.text((M, y), ln, font=body, fill=SLATE)
        y += 54

    footer(d, "AI phone agents for UK small business.")
    img.save(f"{OUT}/arlo_ad_2_hook.png")


# ---- Ad 3 : the product / offer ---------------------------------------
def ad_offer():
    img, d = base()
    eyebrow(d, M, "MEET ANGEL")

    serif = font("Gloock-Regular.ttf", 78)
    y = 280
    for ln in wrap(d, "An AI receptionist that actually sounds human.", serif, W - 2 * M):
        d.text((M, y), ln, font=serif, fill=WHITE)
        y += 96

    body = font("InstrumentSans-Regular.ttf", 42)
    y += 30
    for ln in wrap(d, "She answers 24/7, books the job straight into your calendar, and sends you a summary of every call.", body, W - 2 * M):
        d.text((M, y), ln, font=body, fill=SLATE)
        y += 58

    # spec chips
    y += 50
    chips = ["Live in 48 hours", "From £97/mo", "Keep your number"]
    cf = font("InstrumentSans-Bold.ttf", 34)
    pad, gap, ch_h = 30, 22, 72
    x = M
    for c in chips:
        cw = text_w(d, c, cf)
        chip_w = cw + pad * 2
        if x + chip_w > W - M:      # won't fit — wrap to next row first
            x = M
            y += ch_h + 24
        d.rounded_rectangle([x, y, x + chip_w, y + ch_h], radius=ch_h // 2,
                            outline=GOLD, width=2)
        d.text((x + pad, y + 18), c, font=cf, fill=GOLD)
        x += chip_w + gap

    footer(d, "No setup fee. Cancel anytime.")
    img.save(f"{OUT}/arlo_ad_3_offer.png")


ad_stat()
ad_emotional()
ad_offer()
print("done")
