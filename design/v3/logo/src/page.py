import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from gen import *
INFO={
 'A':('分岐の扇','1本の線が4回分かれて16の点になる。07だけ橙。「16の行く末」をそのまま図にした、作品の核に最も近い案。','小さいサイズでは扇か種のような形になり、16本は数えられない（それでよいかの判断）。'),
 'B':('区画の菱形','真上から見た4×4の区画を、アイソメの菱形で描き、07だけ塗る。家を描かずに分譲地を示すので、不動産系の家マークと重なりにくい。','グリッド系のアプリアイコンとは方向が近い。線が細いと16pxで潰れやすい。'),
 'C':('ゆの字、ひと筆で分かれる','手で起こした「ゆ」の縦画が、最後に2本に分かれる。暗い背景ではHeroの温白色の光る線として発光させる。','分岐が小さく、言われないと気づきにくい。ロゴタイプの細さは動画の圧縮でにじむおそれ。'),
 'D':('朝の地平と道','円の中に朝日と地平線、手前から道がのび、途中で分かれる。E3の夜明けと「行く末」を結ぶ、情景型の案。','情景が細かく、ファビコンでは円と半円しか残らない。道と日の丸の組み合わせは記念品的に見える危険。'),
 'E':('ふたりの記号','角丸の窓の中に、かずの■とゆうの●、下に地面の弧。デザインコードの夫婦の記号をそのまま顔にする。ロゴタイプは丸ゴシックの文字組み。','かわいいが、作品の「16の世界」は伝わらない。顔に見えるので、既存のアプリのマスコットと方向が近い。ロゴタイプは書体に依存するので、本番はアウトライン化が必要。'),
}
def inline(s): return s.replace('<svg ','<svg class="i" ',1)
def icon(id, bg, col, size, r=0.24, glow=False):
    m = mark(id,col=col,glow=glow) if id=='C' else mark(id,col=col,mono=(col!=INK))
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="{size}" height="{size}">{GLOWDEF if glow else ""}<rect width="120" height="120" rx="{120*r}" fill="{bg}"/><g transform="translate(14,14) scale(0.766)">{m}</g></svg>'
sheets=[]
for id in 'ABCDE':
    name,aim,weak=INFO[id]; glow=id=='C'
    big=svg(120,120,mark(id)).replace('width="120" height="120"','width="330" height="330"')
    sizes=''.join(svg(120,120,mark(id)).replace('width="120" height="120"',f'width="{s}" height="{s}"') for s in (96,48,24,16))
    icons=icon(id,PAPER,INK,120)+icon(id,INK,GLOW if glow else PAPER,120,glow=glow)+icon(id,PAPER,INK,48)+icon(id,INK,GLOW if glow else PAPER,32,glow=glow)+icon(id,PAPER,INK,16,r=0.18)
    lh=lockup_h(id); ld=lockup_h(id,col=GLOW if glow else PAPER,glow=glow); lv=lockup_v(id)
    # 題名カード
    lt,(lw,lhh)=logotype(id,INK)
    card=(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="640" height="360">'
          f'<defs><linearGradient id="sk{id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#CFEBFA"/><stop offset=".62" stop-color="#F4FAFD"/><stop offset=".621" stop-color="#F3E7CF"/><stop offset="1" stop-color="#EADFC6"/></linearGradient></defs>'
          f'<rect width="1920" height="1080" fill="url(#sk{id})"/>'
          + ''.join(f'<rect x="{330+c*330+r*60}" y="{720+r*70}" width="260" height="46" rx="6" fill="#E4EFD2" stroke="#9BD27A" stroke-width="4"/>' for r in range(4) for c in range(4) if 330+c*330+r*60<1700)
          + f'<g transform="translate({960-(184+lw)/2*1.6},150) scale(1.6)"><g transform="scale(1.25)">{mark(id) if id!="C" else mark("C")}</g><g transform="translate(184,14)">{lt}</g></g>'
          + f'<text x="960" y="560" text-anchor="middle" font-size="64" font-weight="700" fill="{INK}" font-family="Hiragino Maru Gothic ProN, Zen Maru Gothic, Noto Sans CJK JP, sans-serif">16回目の、マイホームへ。</text>'
          + en(INK,960,470,30,'middle') + '</svg>')
    sheets.append(f'''
<section class="sheet" id="logo-{id}">
  <header><span class="id">{id}</span><h2>{name}</h2></header>
  <div class="c1"><div class="big">{big}</div><div class="row sizes">{sizes}</div><div class="row icons">{icons}</div></div>
  <div class="c2"><div class="lk">{lh}</div><div class="dark">{ld}</div><div class="card">{card}</div></div>
  <div class="c3"><div class="lv">{lv}</div></div>
  <div class="note"><p><b>ねらい</b>　{aim}</p><p><b>弱点</b>　{weak}</p></div>
</section>''')
html=f'''<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>ゆくすいえ シンボルマーク案</title>
<style>
:root{{--paper:{PAPER};--ink:{INK};--ink2:#6B6358;--line:#E6DCC8}}
*{{box-sizing:border-box;margin:0;padding:0}}
body{{background:#E9E2D3;font-family:"Hiragino Sans","Noto Sans CJK JP",sans-serif;color:var(--ink)}}
.sheet{{position:relative;width:1920px;height:1080px;background:var(--paper);margin:0 auto 40px;overflow:hidden}}
header{{position:absolute;left:64px;top:44px;display:flex;gap:18px;align-items:center}}
header h2{{font-size:40px;font-family:"Hiragino Maru Gothic ProN","Zen Maru Gothic",sans-serif}}
.id{{font-size:30px;font-weight:800;border:3px solid var(--ink);border-radius:8px;padding:0 14px}}
.c1{{position:absolute;left:64px;top:130px;width:560px}}
.big{{background:#fff;border:1px solid var(--line);border-radius:14px;height:420px;display:grid;place-items:center}}
.row{{display:flex;align-items:flex-end;gap:22px;margin-top:22px}}
.icons{{gap:16px}}
.c2{{position:absolute;left:690px;top:130px;width:860px}}
.lk{{background:#fff;border:1px solid var(--line);border-radius:14px;padding:34px;height:230px;display:flex;align-items:center}}
.lk svg,.dark svg{{max-width:100%;height:auto}}
.dark{{background:var(--ink);border-radius:14px;padding:34px;height:230px;margin-top:20px;display:flex;align-items:center}}
.card{{margin-top:20px;display:flex;gap:20px;align-items:flex-start}}
.card svg{{border-radius:10px;box-shadow:0 2px 0 rgba(0,0,0,.06)}}
.c3{{position:absolute;left:1600px;top:130px;width:260px;height:860px;background:#fff;border:1px solid var(--line);border-radius:14px;display:grid;place-items:center;padding:20px}}
.c3 svg{{max-height:800px;width:auto;max-width:100%}}
.note{{position:absolute;left:64px;top:860px;width:560px;font-size:18px;line-height:1.7}}
.note p+p{{margin-top:8px;color:var(--ink2)}}
</style></head><body>
{''.join(sheets)}
</body></html>'''
open(os.path.join(OUT,'index.html'),'w').write(html)
print('page ok')
