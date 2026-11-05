# レビュー用のパワーポイント：通しの動画の場面ごとのスクリーンショット（1ページ1枚）＋末尾に課題・タスク・質疑
# 使い方：python3 video/build_review_deck.py [out/prefinal] [video/REVIEW_NOTES.md] [出力.pptx]
# 材料：node video/assemble.cjs が書き出す out/prefinal/scenes.json と stills/
import json, sys, os, re
from pptx import Presentation
from pptx.util import Emu, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN

PRE = sys.argv[1] if len(sys.argv) > 1 else 'out/prefinal'
NOTES = sys.argv[2] if len(sys.argv) > 2 else 'video/REVIEW_NOTES.md'
OUT = sys.argv[3] if len(sys.argv) > 3 else os.path.join(PRE, 'yukusuie_prefinal_review.pptx')
INK, INK2, PAPER, OR = RGBColor(0x1E, 0x2B, 0x36), RGBColor(0x6B, 0x63, 0x58), RGBColor(0xFF, 0xFA, 0xF0), RGBColor(0xE8, 0x70, 0x1F)
FONT = 'Hiragino Sans'
KIND = {'part': '書き出し済みのかけら', 'rec': '実機の録画', 'plate': '仮の板（実機の録画待ち）'}

scenes = json.load(open(os.path.join(PRE, 'scenes.json'), encoding='utf-8'))
prs = Presentation(); prs.slide_width, prs.slide_height = Emu(12192000), Emu(6858000)
W, H = prs.slide_width, prs.slide_height
blank = prs.slide_layouts[6]

def bg(s):
    f = s.background.fill; f.solid(); f.fore_color.rgb = PAPER

def text(s, x, y, w, h, runs, size=14, color=INK, bold=False, align=PP_ALIGN.LEFT):
    tb = s.shapes.add_textbox(x, y, w, h); tf = tb.text_frame; tf.word_wrap = True
    paras = runs if isinstance(runs, list) else [runs]
    for i, r in enumerate(paras):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph(); p.alignment = align
        items = r if isinstance(r, tuple) else ((r, {}),) if isinstance(r, str) else r
        if isinstance(r, str): items = ((r, {}),)
        for t, o in items:
            run = p.add_run(); run.text = t; f = run.font; f.name = FONT
            f.size = Pt(o.get('size', size)); f.bold = o.get('bold', bold); f.color.rgb = o.get('color', color)
    return tb

def fmt(t):
    m = int(t // 60); return f'{m}:{t - m * 60:04.1f}'

# 表紙
s = prs.slides.add_slide(blank); bg(s)
text(s, Emu(700000), Emu(2200000), Emu(10800000), Emu(900000), 'ゆくすいえ　通しの動画 プレファイナル', size=36, bold=True)
text(s, Emu(700000), Emu(3150000), Emu(10800000), Emu(1600000), [
    '場面ごとのスクリーンショット（1ページ1枚）と、動画を作ってみて分かった課題・タスク・質疑',
    f'全体 3:00（{len(scenes)}場面）。1920×1080・24fps。字幕は焼き込み、音は無音のトラックだけ',
    '「仮の板」は実機の録画が届いたら差し替える場所'], size=16, color=INK2)

# 場面ごと
img_w = Emu(9000000); img_h = Emu(int(9000000 * 9 / 16)); ix = Emu((12192000 - 9000000) // 2); iy = Emu(780000)
for i, sc in enumerate(scenes, 1):
    s = prs.slides.add_slide(blank); bg(s)
    head = [(f'{i:02d}  ', {'color': OR, 'bold': True, 'size': 20}), (f'{fmt(sc["at"])}–{fmt(sc["to"])}　', {'bold': True, 'size': 20}), (sc['label'], {'size': 20, 'bold': True})]
    text(s, Emu(400000), Emu(180000), Emu(11400000), Emu(560000), [tuple(head)])
    s.shapes.add_picture(os.path.join(PRE, sc['still']), ix, iy, img_w, img_h)
    src = KIND.get(sc['kind'], sc['kind']) + ('' if sc['kind'] == 'plate' else f'：{sc.get("src")}' + (f'（{sc["in"]}秒から）' if sc.get('in') else ''))
    lines = [((f'材料　', {'bold': True, 'size': 12}), (src, {'size': 12, 'color': INK2}), (f'　｜　スクショの時刻 {fmt(sc["shot"])}', {'size': 12, 'color': INK2}))]
    if sc.get('subs'): lines.append(((f'字幕　', {'bold': True, 'size': 12}), ('／'.join(sc['subs']), {'size': 12})))
    elif sc.get('note'): lines.append(((f'撮る中身　', {'bold': True, 'size': 12}), (sc['note'], {'size': 12, 'color': INK2})))
    text(s, ix, Emu(iy + img_h + 90000), img_w, Emu(700000), lines)

# 末尾：課題・タスク・質疑（REVIEW_NOTES.md の見出しごと、12項目ずつでページを分ける）
sections, cur = [], None
for line in open(NOTES, encoding='utf-8'):
    line = line.rstrip()
    if line.startswith('## '): cur = [line[3:], []]; sections.append(cur)
    elif re.match(r'^\s*- ', line) and cur: cur[1].append(((len(line) - len(line.lstrip())) // 2, line.strip()[2:]))
for title, items in sections:
    pages = [items[k:k + 11] for k in range(0, len(items), 11)] or [[]]
    for n, page in enumerate(pages):
        s = prs.slides.add_slide(blank); bg(s)
        text(s, Emu(500000), Emu(260000), Emu(11200000), Emu(600000), title + (f'（{n + 1}/{len(pages)}）' if len(pages) > 1 else ''), size=24, bold=True)
        tb = s.shapes.add_textbox(Emu(500000), Emu(950000), Emu(11200000), Emu(5600000)); tf = tb.text_frame; tf.word_wrap = True
        for j, (lv, it) in enumerate(page):
            p = tf.paragraphs[0] if j == 0 else tf.add_paragraph(); p.level = min(lv, 2); p.space_after = Pt(6)
            r = p.add_run(); r.text = ('・' if lv == 0 else '　– ') + re.sub(r'\*\*(.+?)\*\*', r'\1', it)
            r.font.name = FONT; r.font.size = Pt(15 if lv == 0 else 13); r.font.color.rgb = INK if lv == 0 else INK2
            r.font.bold = it.startswith('**')
prs.save(OUT); print('saved', OUT, len(prs.slides), 'slides')
