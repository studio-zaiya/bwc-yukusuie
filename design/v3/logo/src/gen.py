import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
from kana import KANA
OUT='/home/claude/yukusuie/design/v3/logo'
INK='#1E2B36'; PAPER='#FFFAF0'; OR='#E8701F'; SKY='#1C8DCC'; GOLD='#C99A00'; GLOW='#FFF6E5'
BBOX={'ゆ':(21,84),'く':(32,64),'す':(14,86),'い':(21,80),'え':(26,84)}

def word_paths(x0,y0,size,gap,sw,color,vertical=False,glow=False):
    out=[]; x=x0; y=y0; k=size/100
    for ch in 'ゆくすいえ':
        l,r=BBOX[ch]
        if vertical:
            tx=x0-((l+r)/2)*k+50*k*0; tx=x0+(50-(l+r)/2)*k; ty=y
        else:
            tx=x-l*k; ty=y0
        for d in KANA[ch]:
            out.append(f'<path d="{d}" transform="translate({tx:.1f},{ty:.1f}) scale({k:.4f})" fill="none" stroke="{color}" stroke-width="{sw/k:.2f}" stroke-linecap="round" stroke-linejoin="round"{" filter=\"url(#glow)\"" if glow else ""}/>')
        if vertical: y+=size*0.92+gap
        else: x+=(r-l)*k+gap
    return ''.join(out),(x-gap if not vertical else y-gap)

GLOWDEF='<defs><filter id="glow" filterUnits="userSpaceOnUse" x="-200" y="-200" width="2400" height="2400"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>'

# ---------- マーク（120×120） ----------
def mark_A(col=INK, acc=OR, mono=False):
    s=[]; leaf=6
    pts=lambda lv,i: (60 if lv==0 else 8+ (i+0.5)*(104/(1<<lv)), 14+lv*22)
    s.append(f'<path d="M60,4 L60,14" stroke="{col}" stroke-width="5.2" stroke-linecap="round" fill="none"/>')
    for lv in range(4):
        for i in range(1<<lv):
            for b in range(2):
                c=i*2+b; x1,y1=pts(lv,i); x2,y2=pts(lv+1,c)
                on= (leaf>>(3-lv))==c
                w=5.2-lv*1.05
                stroke = acc if (on and not mono) else col
                s.append(f'<path d="M{x1:.1f},{y1} C{x1:.1f},{y1+12} {x2:.1f},{y2-12} {x2:.1f},{y2}" stroke="{stroke}" stroke-width="{w:.2f}" stroke-linecap="round" fill="none"/>')
    for i in range(16):
        x,y=pts(4,i); on=i==leaf
        s.append(f'<circle cx="{x:.1f}" cy="{y+5}" r="{2.6 if not on else 3.4}" fill="{acc if (on and not mono) else col}"/>')
    return ''.join(s)

def iso(x,y,cx=60,cy=26,u=13.6):
    return (cx+(x-y)*u*0.866, cy+(x+y)*u*0.5)
def mark_B(col=INK, acc=OR, mono=False, bg=PAPER):
    s=[]; g=0.16
    for r in range(4):
        for c in range(4):
            x0,y0=c*1.25,r*1.25
            q=[iso(x0+g,y0+g),iso(x0+1.25-g,y0+g),iso(x0+1.25-g,y0+1.25-g),iso(x0+g,y0+1.25-g)]
            on=(r,c)==(1,2)
            pts=' '.join(f'{a:.1f},{b:.1f}' for a,b in q)
            if on:
                fill = col if mono else acc
                s.append(f'<polygon points="{pts}" fill="{fill}" stroke="{fill}" stroke-width="2.4" stroke-linejoin="round"/>')
            else:
                s.append(f'<polygon points="{pts}" fill="none" stroke="{col}" stroke-width="2.6" stroke-linejoin="round"/>')
    return f'<g transform="translate(0,6)">{"".join(s)}</g>'

def mark_C(col=INK, glow=False):
    k=0.92; tx=60-52*k; ty=60-54*k
    paths=KANA['ゆ'][:2]+["M52,16 C55,38 55,58 51,70 C49,78 46,84 42,92","M51,70 C55,78 58,84 64,90"]
    f=' filter="url(#glow)"' if glow else ''
    return ''.join(f'<path d="{d}" transform="translate({tx:.1f},{ty:.1f}) scale({k})" fill="none" stroke="{col}" stroke-width="{9.5/k:.2f}" stroke-linecap="round" stroke-linejoin="round"{f}/>' for d in paths)

def mark_D(col=INK, acc=OR, mono=False):
    s=[f'<circle cx="60" cy="60" r="52" fill="none" stroke="{col}" stroke-width="5"/>']
    s.append(f'<path d="M14,70 L106,70" stroke="{col}" stroke-width="3" stroke-linecap="round"/>')
    sun = col if mono else acc
    s.append(f'<path d="M44,70 A16,16 0 0 1 76,70" fill="{sun}"/>')
    s.append(f'<path d="M60,111 C60,98 50,92 54,84 C57,78 60,76 60,70" fill="none" stroke="{col}" stroke-width="4.5" stroke-linecap="round"/>')
    s.append(f'<path d="M58,82 C66,80 74,76 82,70" fill="none" stroke="{col}" stroke-width="3.2" stroke-linecap="round"/>')
    return ''.join(s)

def mark_E(col=INK, mono=False, bg=PAPER):
    kz = col if mono else OR; yu = col if mono else SKY
    return (f'<rect x="10" y="10" width="100" height="100" rx="30" fill="none" stroke="{col}" stroke-width="5"/>'
            f'<rect x="30" y="44" width="28" height="28" rx="3" fill="{kz}"/>'
            f'<circle cx="77" cy="58" r="15" fill="{yu}"/>'
            f'<path d="M30,86 C46,94 74,94 90,86" fill="none" stroke="{col}" stroke-width="5" stroke-linecap="round"/>')

MARKS={'A':mark_A,'B':mark_B,'C':mark_C,'D':mark_D,'E':mark_E}
def mark(id, **kw):
    f=MARKS[id]
    if id=='C':
        return f(col=kw.get('col',INK), glow=kw.get('glow',False))
    if id=='E': return f(col=kw.get('col',INK), mono=kw.get('mono',False))
    return f(col=kw.get('col',INK), mono=kw.get('mono',False))

# ---------- ロゴタイプ ----------
SPEC={'A':dict(sw=9.5,gap=22),'B':dict(sw=13,gap=18),'C':dict(sw=7,gap=26),'D':dict(sw=9.5,gap=14),'E':None}
def logotype(id, col=INK, size=100, glow=False, vertical=False):
    if id=='E':
        if vertical:
            t=''.join(f'<text x="50" y="{90+i*104}" text-anchor="middle" font-size="96" font-weight="800" fill="{col}" font-family="Hiragino Maru Gothic ProN, Zen Maru Gothic, Noto Sans CJK JP, sans-serif">{c}</text>' for i,c in enumerate('ゆくすいえ'))
            return t,(100,540)
        return f'<text x="0" y="86" font-size="100" font-weight="800" letter-spacing="10" fill="{col}" font-family="Hiragino Maru Gothic ProN, Zen Maru Gothic, Noto Sans CJK JP, sans-serif">ゆくすいえ</text>',(560,110)
    sp=SPEC[id]
    if vertical:
        p,h=word_paths(0,0,size,sp['gap']*0.6,sp['sw'],col,vertical=True,glow=glow); return p,(size,h)
    p,w=word_paths(0,0,size,sp['gap'],sp['sw'],col,glow=glow); return p,(w,size)

def en(col, x, y, size=26, anchor='start'):
    return (f'<text x="{x}" y="{y}" font-size="{size}" font-weight="700" letter-spacing="{size*0.32:.1f}" fill="{col}" text-anchor="{anchor}" font-family="Hiragino Sans, Noto Sans CJK JP, sans-serif">YUKUSUIE<tspan font-weight="400" letter-spacing="{size*0.06:.1f}" dx="{size*0.5:.0f}">16 unbuilt futures</tspan></text>')

def svg(w,h,body,bg=None,glow=False):
    b=f'<rect width="100%" height="100%" fill="{bg}"/>' if bg else ''
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.0f} {h:.0f}" width="{w:.0f}" height="{h:.0f}">{GLOWDEF if glow else ""}{b}{body}</svg>'

def lockup_h(id, col=INK, glow=False, ecol=None):
    lt,(lw,lh)=logotype(id,col,glow=glow)
    m=mark(id,col=col,glow=glow) if id=='C' else mark(id,col=col,mono=(col!=INK))
    body=f'<g transform="translate(0,0) scale(1.25)">{m}</g><g transform="translate(184,14)">{lt}</g>'+en(ecol or col,186,146,24)
    return svg(184+max(lw,560)+20,160,body,glow=glow)
def lockup_v(id, col=INK, glow=False):
    lt,(lw,lh)=logotype(id,col,vertical=True,glow=glow)
    m=mark(id,col=col,glow=glow) if id=='C' else mark(id,col=col,mono=(col!=INK))
    W=300
    body=f'<g transform="translate({W/2-75},0) scale(1.25)">{m}</g><g transform="translate({W/2-lw/2*0.9},180) scale(0.9)">{lt}</g>'
    H=180+lh*0.9+20
    return svg(W,H,body,glow=glow)

def write(name, s): open(os.path.join(OUT,name),'w').write(s)
for id in 'ABCDE':
    glow = id=='C'
    write(f'mark-{id}.svg', svg(120,120,mark(id)))
    write(f'mark-{id}-mono.svg', svg(120,120,mark(id,mono=True) if id!='C' else mark(id)))
    lt,(w,h)=logotype(id); write(f'logotype-{id}.svg', svg(w+4,h+4,f'<g transform="translate(2,2)">{lt}</g>'))
    lt,(w,h)=logotype(id,vertical=True); write(f'logotype-{id}-vertical.svg', svg(w+4,h+4,f'<g transform="translate(2,2)">{lt}</g>'))
    write(f'lockup-{id}-horizontal.svg', lockup_h(id))
    write(f'lockup-{id}-vertical.svg', lockup_v(id))
    write(f'lockup-{id}-horizontal-dark.svg', lockup_h(id, col=GLOW if glow else PAPER, glow=glow))
print('ok')
