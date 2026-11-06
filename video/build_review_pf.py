# 見直し用のパワーポイント（HANDOFF_VIDEO_PF4 の10）
# 使い方：python3 video/build_review_pf.py <動画.mp4> <出力.pptx> [版の名前]
# 撮る場面：字幕1つごとに1枚（字幕が出て0.5秒後）＋同じ字幕の中で絵が大きく変わったら前後の2枚＋章の切り替わり・タイトル・締めのロゴ・黒画面
# 1枚の形：左の約3分の2にスクショ、その下に時刻・章・字幕、右の約3分の1に書き込み欄（レイアウトのプレースホルダー「memo」、空のまま）
import json, os, re, subprocess, sys, tempfile, copy, datetime
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
MP4, OUT = sys.argv[1], sys.argv[2]
VER = sys.argv[3] if len(sys.argv) > 3 else os.path.basename(MP4)
EDL = json.load(open(os.path.join(ROOT, 'video', 'edl.json'), encoding='utf-8'))
INK, INK2 = RGBColor(0x1E, 0x2B, 0x36), RGBColor(0x6B, 0x63, 0x58)
FONT = 'Hiragino Sans'

def srt(path):
    out = []
    for b in open(path, encoding='utf-8').read().strip().split('\n\n'):
        l = b.split('\n'); a, z = l[1].split(' --> ')
        f = lambda s: (lambda h, m, r: int(h) * 3600 + int(m) * 60 + float(r.replace(',', '.')))(*s.split(':'))
        out.append((f(a), f(z), '\n'.join(l[2:])))
    return out
subs = srt(os.path.join(ROOT, 'video', EDL['subs']))
dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', MP4], capture_output=True, text=True).stdout)
ov = EDL.get('overlay', {})
chap = ov.get('chapters', []); names = ov.get('names', [])
def chapter(t):
    for a, z, i in chap:
        if a <= t < z: return names[i]
    return ''
def sub_at(t):
    for a, z, x in subs:
        if a <= t < z: return x
    return ''
def seg_at(t):
    cur = None
    for s in EDL['segments']:
        if s['at'] <= t: cur = s
    return cur

# 撮る時刻
shots = [(a + 0.5, '字幕') for a, z, x in subs]
for a, z, i in chap: shots.append((a + 0.6, '章の切り替わり'))
for s in EDL['segments']:
    if s.get('full'): shots.append((s['at'] + 1.2, '全面の場面'))
# 絵が大きく変わったところ（字幕の切り替わりから0.5秒以内は除く）
r = subprocess.run(['ffmpeg', '-i', MP4, '-vf', "scale=480:-1,select='gt(scene,0.12)',showinfo", '-f', 'null', '-'], capture_output=True, text=True)
cuts = [float(m) for m in re.findall(r'pts_time:([0-9.]+)', r.stderr)]
starts = [a for a, z, x in subs]
for c in cuts:
    if any(abs(c - a) < 0.5 for a in starts): continue
    shots.append((max(0, c - 0.35), '変わる前')); shots.append((min(dur - 0.05, c + 0.45), '変わった後'))
shots = sorted(set((round(t, 2), k) for t, k in shots if 0 <= t < dur))
# 近すぎるもの（0.3秒以内）はまとめる
merged = []
for t, k in shots:
    if merged and t - merged[-1][0] < 0.3: continue
    merged.append((t, k))
shots = merged

tmp = tempfile.mkdtemp()
def grab(t, i):
    f = os.path.join(tmp, f's{i:03d}.jpg')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-ss', f'{t:.3f}', '-i', MP4, '-frames:v', '1', '-vf', 'scale=1600:-1', '-q:v', '4', f], check=True)
    return f

prs = Presentation(); prs.slide_width, prs.slide_height = Inches(13.333), Inches(7.5)
# レイアウトを1つ作り直す：本文のプレースホルダー（memo）を右の3分の1に。タイトルは消す
lay = prs.slide_layouts[1]
for ph in list(lay.placeholders):
    if ph.placeholder_format.idx != 1: ph._element.getparent().remove(ph._element)  # 本文（idx 1）だけ残す
memo = [ph for ph in lay.placeholders][0]
memo.left, memo.top, memo.width, memo.height = Inches(9.15), Inches(0.55), Inches(3.95), Inches(6.7)
memo.name = 'memo'
tf = memo.text_frame; tf.text = 'ここに書き込む'
for p in tf.paragraphs:
    p.level = 0
    for rr in p.runs: rr.font.size = Pt(16); rr.font.color.rgb = INK2; rr.font.name = FONT
ln = memo.line; ln.color.rgb = RGBColor(0xC9, 0xC2, 0xB3); ln.width = Pt(0.75)
# 箇条書きの点を消す
for lvl in memo._element.xpath('.//a:lvl1pPr'):
    lvl.insert(0, lvl.makeelement('{http://schemas.openxmlformats.org/drawingml/2006/main}buNone', {}))

def tb(slide, x, y, w, h, text, size, color=INK, bold=False, align=None):
    t = slide.shapes.add_textbox(x, y, w, h).text_frame; t.word_wrap = True
    for i, line in enumerate(text.split('\n')):
        p = t.paragraphs[0] if i == 0 else t.add_paragraph()
        r = p.add_run(); r.text = line; r.font.size = Pt(size); r.font.color.rgb = color; r.font.bold = bold; r.font.name = FONT
        if align: p.alignment = align
    return t
fmt = lambda t: f'{int(t // 60)}:{t - int(t // 60) * 60:04.1f}'
total = len(shots) + 1
# 表紙
s = prs.slides.add_slide(lay)
tb(s, Inches(0.6), Inches(2.4), Inches(8.3), Inches(1), 'ゆくすいえ　見直し用', 34, bold=True)
tb(s, Inches(0.6), Inches(3.4), Inches(8.3), Inches(2.2), f'版：{VER}\n全体：{fmt(dur)}（{dur:.1f}秒）\n作成：{datetime.datetime.now().strftime("%Y-%m-%d %H:%M")}\n{len(shots)}枚（字幕ごと・絵の変わり目・章・全面の場面）', 18, INK2)
tb(s, Inches(11.6), Inches(0.12), Inches(1.6), Inches(0.35), f'1／{total}', 11, INK2)
for i, (t, kind) in enumerate(shots, 2):
    s = prs.slides.add_slide(lay)
    img = grab(t, i)
    s.shapes.add_picture(img, Inches(0.3), Inches(0.55), Inches(8.6))  # 16:9 → 高さ 4.84
    seg = seg_at(t); label = seg['label'] if seg else ''
    tb(s, Inches(0.3), Inches(5.5), Inches(8.6), Inches(0.4), f'{fmt(t)}　{chapter(t) or "（章なし）"}　｜　{kind}　｜　{label}', 12, INK2)
    tb(s, Inches(0.3), Inches(5.95), Inches(8.6), Inches(1.3), sub_at(t) or '（字幕なし）', 15, INK)
    tb(s, Inches(11.6), Inches(0.12), Inches(1.6), Inches(0.35), f'{i}／{total}', 11, INK2)
prs.save(OUT); print('saved', OUT, total, 'slides')
