# ゾーニング図の試作（決まり：LAYOUT_RULES_v1）。1マス=910mm
import json,sys,math
COL={'main':'#FBEFC4','tatami':'#DDE7B8','water':'#D5EBF4','other':'#ECEAE5','priv':'#F7E4DA'}
def R(n,x,y,w,h,z,poly=None,label=True):
    if n=='階段': n='ホール'
    return dict(n=n,x=x,y=y,w=w,h=h,z=z,poly=poly,label=label)
def jo(c): return round(c*0.8281/1.6562*2)/2  # 畳数（0.5刻み）
def floor1(p):
    W,D,N=8,8,2.5
    rs=[]; notes=[]
    # 北の帯：水回り（LDK側=西から）
    pantry='パントリー' in p.get('water_extra',[])
    water=['浴室','洗面','トイレ']+[w for w in p.get('water_extra',[]) if w!='パントリー']
    toilet_out=p.get('toilet_near_entrance',False) or len(water)>4
    if toilet_out: water.remove('トイレ')
    wx=0; widths={'浴室':2,'洗面':2,'トイレ':1,'ランドリー':2,'トイレ2':1,'パントリー':1}
    for w in water:
        ww=widths.get(w,1.5)
        if wx+ww>6: notes.append(f'{w}は北の帯に入りきらず省略'); continue
        rs.append(R(w,wx,0,ww,N,'water' if w!='パントリー' else 'other')); wx+=ww
    if wx<6: rs.append(R('収納',wx,0,6-wx,N,'other'))
    # 東の列：階段・ホール・玄関
    rs.append(R('階段',6,0,2,N,'other'))
    if p.get('entrance','SE')=='SE':
        if toilet_out: rs+= [R('ホール',6,N,2,1.5,'other'),R('トイレ',6,N+1.5,2,1,'water'),R('玄関',6,5,2,3,'other')]
        else: rs+= [R('ホール',6,N,2,2.5,'other'),R('玄関',6,5,2,3,'other')]
    else:
        if toilet_out: rs+= [R('ホール',6,N,2,1.5,'other'),R('玄関',6,4,2,2,'other'),R('トイレ',6,6,2,1,'water'),R('収納',6,7,2,1,'other')]
        else: rs+= [R('ホール',6,N,2,1.5,'other'),R('玄関',6,4,2,2,'other'),R('シューズ収納',6,6,2,2,'other')]
    # LDK（南西のかたまり x0..6, y2.5..8）
    t=p['ldk']; bx,by,bw,bh=0,N,6,D-N
    if t=='straight':
        rs+= [R('キッチン',0,by,6,1.5,'main'),R('ダイニング',0,by+1.5,6,1.5,'main'),R('リビング',0,by+3,6,bh-3,'main')]
    elif t=='L':
        rs+= [R('キッチン',0,by,2.5,2.5,'main'),R('ダイニング',2.5,by,2.5,2.5,'main'),
              R('リビング',0,by+2.5,6,bh-2.5,'main',poly=[(0,by+2.5),(5,by+2.5),(5,by),(6,by),(6,D),(0,D)])]
    elif t=='tanoji':
        rs+= [R('キッチン',0,by,3,2.5,'main'),R('ダイニング',3,by,3,2.5,'main'),R('リビング',0,by+2.5,3,bh-2.5,'main'),R('畳',3,by+2.5,3,bh-2.5,'tatami')]
    if pantry:
        k=next(r for r in rs if r['n']=='キッチン')
        if k['w']>=2.5: rs.append(R('パントリー',k['x'],k['y'],1,k['h'],'other')); k['x']+=1; k['w']-=1
        else: rs.append(R('パントリー',k['x'],k['y'],1.5,k['h'],'other')); k['x']+=1.5; k['w']-=1.5
    ldk=dict(x=bx,y=by,w=bw,h=bh)
    # 1階に主寝室：西へ張り出し、北の残りを収納で埋めて長方形に
    if p.get('master_on_1f'):
        for r in rs:
            r['x']+=3.5
            if r['poly']: r['poly']=[(a+3.5,b) for a,b in r['poly']]
        rs+= [R('主寝室',0,3.5,3.5,4.5,'priv'),R('WIC',0,1.5,3.5,2,'other'),R('収納',0,0,3.5,1.5,'other')]
        W+=3.5; ldk['x']+=3.5
    return dict(W=W,D=D,rooms=rs,notes=notes,ldk=ldk)

def floor1_straight(p):
    # 直線型：南側の全部をLDK（西からL・D・K）。玄関は東の真ん中、北に水回り
    W,D=8,8; rs=[]
    rs+= [R('浴室',0,0,2,2.5,'water'),R('洗面',2,0,2,2.5,'water'),R('トイレ',4,0,1,2.5,'water'),R('収納',5,0,1,2.5,'other'),R('階段',6,0,2,2.5,'other')]
    rs+= [R('ファミリー収納',0,2.5,4,1.5,'other'),R('ホール',4,2.5,2,1.5,'other'),R('玄関',6,2.5,2,1.5,'other')]
    rs+= [R('リビング',0,4,4,4,'main'),R('ダイニング',4,4,2,4,'main'),R('キッチン',6,4,2,4,'main')]
    return dict(W=W,D=D,rooms=rs,notes=[],ldk=dict(x=0,y=4,w=8,h=4),ent='E')
def floor1_master(p):
    # 1階に主寝室：LDKを縦長（北からK・D・L）、隣の南に主寝室、残りのL字に水回りを小さめにまとめる
    W,D=10,8; rs=[]
    rs+= [R('浴室',0,0,2,2,'water'),R('洗面',2,0,2,2,'water'),R('トイレ',4,0,1,2,'water'),R('収納',5,0,3,2,'other'),R('階段',8,0,2,3,'other')]
    rs+= [R('キッチン',0,2,4.5,1.5,'main'),R('ダイニング',0,3.5,4.5,1.5,'main'),R('リビング',0,5,4.5,3,'main')]
    rs+= [R('ホール',4.5,2,3.5,2,'other'),R('主寝室',4.5,4,3.5,4,'priv'),R('玄関',8,3,2,2,'other'),R('WIC',8,5,2,3,'other')]
    return dict(W=W,D=D,rooms=rs,notes=['水回りは、要望より少し小さめにまとめています'],ldk=dict(x=0,y=2,w=4.5,h=6),ent='E')
def floor2(p,f1):
    W,D,N=8,8,2.5
    rs=[R('階段',6,0,2,N,'other')]
    if p.get('master_on_1f'):
        # 2階は小さく：子ども部屋だけ
        W2=W
    m=p.get('master',8)
    if p.get('master_on_1f'): m=0
    kids=p.get('kids',[4.5,4.5]); extras=p.get('extras',[])
    x0=2 if p.get('master_on_1f') else 0
    sx=x0; depth=4; y0=D-depth
    def place(name,jo_,z):
        nonlocal sx
        w=max(1.5,math.ceil((jo_*2)/depth*2)/2)
        if sx+w>W+1e-9: return False
        rs.append(R(name,sx,y0,w,depth,z)); sx+=w; return True
    over=[]
    if m: place('主寝室',m,'priv')
    for i,k in enumerate(kids):
        if not place('子ども部屋' if len(kids)==1 else f'子ども部屋{"①②③"[i]}',k,'priv'): over.append(k)
    left=W-sx
    if left>=2 and extras: rs.append(R(extras.pop(0),sx,y0,left,depth,'priv'))
    elif left>=2: rs.append(R('納戸',sx,y0,left,depth,'other'))
    elif left>0:
        sb=[r for r in rs if r['z']=='priv' and r['y']==y0]
        kidsr=sb
        k=0
        while left>1e-9:
            add=0.5; t=kidsr[k%len(kidsr)]; t['w']+=add; left-=add; k+=1
        xx=x0
        for r in sb: r['x']=xx; xx+=r['w']
    
    # 中の帯 y2.5..4：主寝室の上にWIC、ほかはホール
    mid=y0-N
    if m:
        mw=next(r['w'] for r in rs if r['n']=='主寝室')
        rs.append(R('WIC',0,N,mw,mid,'other')); rs.append(R('ホール',mw,N,W-mw,mid,'other'))
    else: rs.append(R('ホール',x0,N,W-x0,mid,'other'))
    # 北の帯：1階の水回りの上に洗面・トイレ、残りに要望の部屋・収納
    rs+= [R('洗面',x0,0,2,N,'water'),R('トイレ',x0+2,0,1,N,'water')]
    nx=x0+3
    for e in extras+[('子ども部屋3',k) for k in over]:
        name=e if isinstance(e,str) else e[0]
        ww=2 if nx+2<=6 else 6-nx
        if ww<=0: break
        rs.append(R(name,nx,0,ww,N,'priv')); nx+=ww
    if nx<6: rs.append(R('収納',nx,0,6-nx,N,'other'))
    return dict(W=W,D=D,rooms=rs,notes=[],x0=x0)
S=40
def merge(rs):
    ch=True
    while ch:
        ch=False
        for a in rs:
            for b in rs:
                if a is b or a['n']!='ホール' or b['n']!='ホール' or a['poly'] or b['poly']: continue
                if abs(a['x']-b['x'])<1e-9 and abs(a['w']-b['w'])<1e-9 and abs(a['y']+a['h']-b['y'])<1e-9:
                    a['h']+=b['h']; rs.remove(b); ch=True; break
            if ch: break
    return rs
def svg(f,title,ox):
    f['rooms']=merge(f['rooms'])
    o=[]; W,D=f['W'],f['D']
    o.append(f'<g transform="translate({ox},0)"><text x="0" y="-14" class="ft">{title}</text>')
    for r in f['rooms']:
        if r['poly']:
            pts=' '.join(f'{a*S},{b*S}' for a,b in r['poly']); o.append(f'<polygon points="{pts}" fill="{COL[r["z"]]}" class="rm"/>')
        else: o.append(f'<rect x="{r["x"]*S}" y="{r["y"]*S}" width="{r["w"]*S}" height="{r["h"]*S}" fill="{COL[r["z"]]}" class="rm"/>')
    # LDKの外枠を太く（ひとつのメイン空間）
    for r in f['rooms']:
        if r['n']=='階段':
            x,y,w,h=r['x']*S,r['y']*S,r['w']*S,r['h']*S
            for i in range(1,8): o.append(f'<line x1="{x}" y1="{y+h*i/8}" x2="{x+w}" y2="{y+h*i/8}" class="st"/>')
            o.append(f'<line x1="{x+w/2}" y1="{y+h-6}" x2="{x+w/2}" y2="{y+10}" class="ar" marker-end="url(#m)"/>')
    for r in f['rooms']:
        if r['n']=='階段': continue
        if r['poly']: cx,cy=(r['x']+r['w']*0.5)*S,(r['y']+r['h']*0.55)*S; c=sum(1 for _ in [0]); cells=r['w']*r['h']+1*2.5
        else: cx,cy=(r['x']+r['w']/2)*S,(r['y']+r['h']/2)*S; cells=r['w']*r['h']
        small=r['w']<1.6 or r['h']<1.4
        fs=13 if small else 17
        nm=r['n']
        cap=max(1,int(r['w']*S/fs)-0)
        if len(nm)>cap and len(nm)>2:
            h=math.ceil(len(nm)/2); a,b=nm[:h],nm[h:]
            if '部屋' in nm and nm.startswith('子ども'): a,b='子ども',nm[3:]
            o.append(f'<text x="{cx}" y="{cy-fs*0.6}" class="nm" style="font-size:{fs}px">{a}</text><text x="{cx}" y="{cy+fs*0.6}" class="nm" style="font-size:{fs}px">{b}</text>'); cy+=fs*0.6
        else: o.append(f'<text x="{cx}" y="{cy}" class="nm" style="font-size:{fs}px">{nm}</text>')
        if r['z'] in('main','tatami','priv') and not small: o.append(f'<text x="{cx}" y="{cy+20}" class="jo">約{jo(cells):g}畳</text>')
    x0=f.get('x0',0)
    o.append(f'<rect x="{x0*S}" y="0" width="{(W-x0)*S}" height="{D*S}" class="out"/></g>')
    return ''.join(o)
def page(sc):
    p=sc['p']
    if p.get('master_on_1f'): f1=floor1_master(p)
    elif p['ldk']=='straight': f1=floor1_straight(p)
    else: f1=floor1(p)
    f2=floor2(p,f1)
    w1=f1['W']*S; tot=w1+60+f2['W']*S
    ldk=f1['ldk']
    body=svg(f1,'1階',0)+svg(f2,'2階',w1+60)
    # LDKの太枠
    body+=f'<rect x="{ldk["x"]*S}" y="{ldk["y"]*S}" width="{ldk["w"]*S}" height="{ldk["h"]*S}" class="ldk"/>'
    body+=f'<text x="{ldk["x"]*S+6}" y="{(ldk["y"]+ldk["h"])*S-8}" class="lt">LDK 約{jo(ldk["w"]*ldk["h"]):g}畳</text>'
    a1=f1['W']*f1['D']; a2=(f2['W']-f2.get('x0',0))*f2['D']; tsubo=round((a1+a2)*0.8281/3.3058,1)
    notes=f1['notes']+sc.get('notes',[])
    return f'''<div class="card"><div class="hd"><b>{sc["id"]}</b>　{sc["title"]}</div><div class="rq">要望：{sc["req"]}</div>
<svg width="{tot+70}" height="{8*S+70}" viewBox="-10 -34 {tot+70} {8*S+70}">
<defs><marker id="m" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8z" fill="#1E2B36"/></marker></defs>{body}
<g transform="translate({tot+30},{8*S-60})"><text x="0" y="0" class="nm" style="font-size:13px">南</text><line x1="0" y1="-40" x2="0" y2="-14" class="ar" marker-end="url(#m)"/></g>
<text x="0" y="{8*S+24}" class="road">道路（南）</text></svg>
<div class="sel">選んだもの：{sc["sel"]}　｜　延床 約{tsubo:g}坪（図は目安）</div>{"".join(f'<div class="nt">{n}</div>' for n in notes)}</div>'''
SC=json.load(open(sys.argv[1]))
FD=sys.argv[2]
html=f'''<html><head><meta charset="utf-8"><style>@import url('file://{FD}/biz-udpgothic/400.css');@import url('file://{FD}/biz-udpgothic/700.css');
body{{margin:0;padding:24px;background:#FFFAF0;font-family:"BIZ UDPGothic";color:#1E2B36;display:grid;grid-template-columns:repeat(2,max-content);gap:24px}}
.card{{background:#fff;border:1px solid #e6dccb;border-radius:12px;padding:16px 18px}}.hd{{font-size:18px;margin-bottom:4px}}.rq{{font-size:14px;color:#5b6670;margin-bottom:6px;max-width:760px}}
.sel{{font-size:13px;color:#5b6670}}.nt{{font-size:13px;color:#E8701F}}
.rm{{stroke:#1E2B36;stroke-width:1.2}}.out{{fill:none;stroke:#1E2B36;stroke-width:3}}.ldk{{fill:none;stroke:#1E2B36;stroke-width:2.4}}
.nm{{text-anchor:middle;dominant-baseline:middle;font-weight:700;fill:#1E2B36}}.jo{{text-anchor:middle;font-size:12px;fill:#6b7680}}
.st{{stroke:#1E2B36;stroke-width:.8}}.ar{{stroke:#1E2B36;stroke-width:1.4}}.ft{{font-size:16px;font-weight:700;fill:#1E2B36}}.road{{font-size:12px;fill:#6b7680}}.lt{{font-size:12px;fill:#1E2B36;font-weight:700}}
</style></head><body>{"".join(page(s) for s in SC)}</body></html>'''
open(sys.argv[3],'w').write(html)
