import re
base=open('hero/hero.html').read()

CSS='''
#title{position:absolute;left:0;right:0;top:92px;text-align:center;opacity:0;color:var(--ink)}
#title .t{font-family:"Hiragino Maru Gothic ProN","Zen Maru Gothic","Hiragino Sans",sans-serif;font-size:124px;font-weight:900;letter-spacing:.08em;text-shadow:0 0 30px rgba(255,250,240,.9),0 0 6px rgba(255,250,240,.9)}
#title .e{font-size:32px;letter-spacing:.14em;margin-top:12px;font-weight:700;text-shadow:0 0 14px rgba(255,250,240,.95)}
#title .e span{font-weight:400}
#title .c{display:inline-block;font-family:"Hiragino Maru Gothic ProN","Zen Maru Gothic","Hiragino Sans",sans-serif;font-size:44px;font-weight:900;margin-top:26px;padding:8px 30px;border-radius:999px;background:rgba(255,250,240,.82)}
#note{position:absolute;left:0;right:0;bottom:44px;text-align:center;font-size:24px;font-weight:500;line-height:1.6;color:var(--ink);opacity:0}
#note span{display:inline-block;background:rgba(255,250,240,.9);padding:10px 26px;border-radius:10px}
#card{position:absolute;left:50%;top:50%;width:760px;padding:44px 52px 40px;background:#fffdf7;border-radius:6px;color:var(--ink);opacity:0;
  box-shadow:0 30px 60px rgba(30,43,54,.25),0 2px 0 rgba(30,43,54,.06);transform-origin:center;font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN",sans-serif}
#card h4{margin:0 0 6px;font-family:"Hiragino Maru Gothic ProN","Zen Maru Gothic",sans-serif;font-size:44px;font-weight:900}
#card .who{font-size:20px;color:#6B6358;margin-bottom:22px}
#card .row{font-size:26px;line-height:1.7;opacity:0}
#card .lab{font-size:19px;color:#6B6358;margin-top:14px}
#card .sq::before{content:"■";color:#E8701F;margin-right:10px}#card .ci::before{content:"●";color:#1C8DCC;margin-right:10px}#card .di::before{content:"◆";color:#F2C230;margin-right:10px;-webkit-text-stroke:1px #8C6A00}
'''
TITLE='''  <div id="title"><div class="t">ゆくすいえ</div><div class="e">YUKUSUIE: <span>16 unbuilt futures</span></div><div class="c">16回目の、マイホームへ。</div></div>
  <div id="note"><span>本作の制度・手続き・金額・期間などの設定は、体験のために簡略化しています。<br>実際の家づくりでは、地域・金融機関・住宅会社によって異なります。登場する住宅会社・人物・団体はすべて架空です。</span></div>
'''
CARD='''  <div id="card"><h4>わが家のバランス</h4><div class="who">かず と ゆう ・ 入居から1年</div>
    <div class="lab">とったもの</div>
    <div class="row sq">造作のキッチン</div><div class="row di">南の大きな窓と、冬の朝の暖かさ</div>
    <div class="lab">いまは、あとで</div>
    <div class="row">庭と駐車場の仕上げ</div>
    <div class="lab">本物の打ち合わせで聞くこと</div>
    <div class="row">見積の「別途」の項目を、全部教えてください。</div></div>
'''
LIFE=r'''
// ---- 暮らしの小道具（H8の方向：人と暮らしが主役の、にぎやかな昼）----
const LIFE=[];const KIDS=[];
const clothC=['#ffffff','#9ed9f2','#ffd6a0','#f7b6c2','#c8e6a0'];
function laundry(g,x,z,seed){const lg=new THREE.Group();lg.position.set(x,0,z);g.add(lg);const pm=std('#bfc6cc');
  mk(box,pm,-1.1,.8,0,.08,1.6,.08,lg);mk(box,pm,1.1,.8,0,.08,1.6,.08,lg);mk(box,pm,0,1.58,0,2.2,.03,.03,lg);
  const cl=[0,1,2].map(k=>{const m=new THREE.Mesh(new THREE.PlaneGeometry(.5,.62),std(clothC[(seed+k)%5],{side:THREE.DoubleSide}));m.position.set(-.65+k*.65,1.26,0);m.castShadow=true;lg.add(m);return m;});
  LIFE.push({kind:'cloth',cl,seed});return lg;}
function farm(g,x,z){const fg=new THREE.Group();fg.position.set(x,0,z);g.add(fg);mk(box,std('#9b6b43'),0,.08,0,2.4,.16,1.3,fg);
  for(let k=0;k<6;k++){mk(ballG,std('#4aa368',{flatShading:true}),-.9+k*.36,.33,(k%2-.5)*.55,.19,.21,.19,fg);if(k%2)mk(ballG,std('#f2a65a'),-.9+k*.36,.42,(k%2-.5)*.55+.12,.08,.08,.08,fg);}return fg;}
function rabbit(g,cx,cz,seed){const r=new THREE.Group();g.add(r);const rm=std('#ffffff');mk(box,rm,0,.18,0,.42,.3,.3,r);mk(box,rm,.22,.38,0,.22,.22,.22,r);mk(box,rm,.25,.62,.05,.05,.26,.07,r);mk(box,rm,.25,.62,-.05,.05,.26,.07,r);
  LIFE.push({kind:'rabbit',r,cx,cz,seed});return r;}
function bike(g,x,z,col,rot=0){const bg=new THREE.Group();bg.position.set(x,0,z);bg.rotation.y=rot;g.add(bg);const tm=std('#2a3340');
  for(const xx of [-.45,.45]){const wh=new THREE.Mesh(new THREE.TorusGeometry(.3,.05,6,16),tm);wh.position.set(xx,.32,0);bg.add(wh);}
  mk(box,std(col),0,.55,0,.9,.06,.06,bg);mk(box,std(col),.3,.75,0,.06,.4,.06,bg);return bg;}
function personMesh(col,s){const g=new THREE.Group();const b=new THREE.Mesh(bodyG,std(col));b.position.y=.45;b.castShadow=true;const h=new THREE.Mesh(headG,std('#f5d3b3'));h.position.y=1.0;g.add(b,h);g.scale.setScalar(s);scene.add(g);return g;}
function park(g){const fc=['#f7b6c2','#ffffff','#F2C230','#c9a0e8','#ffc49a'];
  for(let k=0;k<70;k++){const x=(hash(k*1.7)-.5)*8.6,z=(hash(k*2.3)-.5)*8.6;mk(ballG,std(fc[k%5],{flatShading:true}),x,.18,z,.16,.16,.16,g);}
  mk(box,std('#a0703f'),-1,.42,3,2.2,.12,.6,g);for(const xx of [-1.9,-.1])mk(box,std('#6b4a2a'),xx,.2,3,.12,.4,.5,g);}
worlds.forEach((w,i)=>{const g=w.g;
  if(w.fate==='stop'){park(g);return;}
  if(i===6){laundry(g,-2.6,2.4,1);farm(g,1.0,3.9);rabbit(g,.6,2.7,6);bike(g,-4.1,4.1,'#E8701F',.3);bike(g,-3.4,4.4,'#1C8DCC',.1);return;}
  if(i%3===0)laundry(g,2.6,1.9,i);
  if(i%4===1)farm(g,-3.4,-.4);
  if(i%5===2||i===11)rabbit(g,2.4,2.8,i);
  if(i%2)bike(g,-4.3,4.3,['#E8701F','#1C8DCC','#F2C230','#6fb7a6'][i%4],.2);
});
// 子どもたち（道を走る）
const KCOL=['#F2C230','#6fb7a6','#ff9f43','#9ed9f2','#c9a0e8','#ffffff'];
for(let k=0;k<12;k++){const g=personMesh(KCOL[k%6],.62);KIDS.push({g,row:k%3,ph:hash(k*4.1),sp:2.2+hash(k*2.2)*1.6,dir:k%2?1:-1});}
function lifeUpdate(t){
  LIFE.forEach(o=>{if(o.kind==='cloth')o.cl.forEach((m,k)=>{m.rotation.y=Math.sin(t*3+k+o.seed)*.28;m.rotation.x=Math.sin(t*2.3+k)*.12;});
    else if(o.kind==='rabbit'){const a=t*1.6+o.seed;o.r.position.set(o.cx+Math.cos(a)*1.2,Math.abs(Math.sin(t*7+o.seed))*.35,o.cz+Math.sin(a)*.8);o.r.rotation.y=-a-Math.PI/2;}});
  KIDS.forEach((k,j)=>{const z=[-12,0,12][k.row]+(j%2?.4:-.4);const span=4*S;const x=((k.ph*span+t*k.sp*k.dir)%span+span)%span-span/2;
    k.g.position.set(x,Math.abs(Math.sin(t*10+j))*.22,z);k.g.rotation.y=k.dir>0?Math.PI/2:-Math.PI/2;});
}
'''

def build(name, dur, cam, extra_dom, extra_js, render_tail, lineMode):
    s=base
    s=s.replace('<title>ゆくすいえ — Hero（E3から・文字なし）</title>',f'<title>ゆくすいえ — 締め {name}</title>')
    s=s.replace('</style>',CSS+'</style>',1)
    s=s.replace('  <div id="veil"></div>',extra_dom+TITLE+'  <div id="veil"></div>')
    s=s.replace('const DUR=9; window.DUR=DUR;',f'const DUR={dur}; window.DUR=DUR;')
    s=s.replace("const TI=t=>1.0+t*1.2;","const TI=t=>12.5;  // 締めはずっと明るい昼\nconst PT=t=>9.5+t*.5; // 花びらはゆっくり")
    s=s.replace(",fate:'scaffold'}","}")
    # life after people creation
    s=s.replace("// ---- カメラ ----",LIFE+extra_js+"\n// ---- カメラ ----")
    s=re.sub(r"const CK=\[.*?\];\n",cam,s,flags=re.S)
    # petals use PT
    s=s.replace("for(let n=0;n<NP;n++){const p=PD[n];const dt=t-p.rel;","const tp=PT(tt);for(let n=0;n<NP;n++){const p=PD[n];const dt=p.fromTree?-1:tp-p.rel;")
    # lines: fixed op, grow per lineMode
    old=s[s.index('  // 世界樹：はじめに根から伸び'):s.index('  // 花びら\n')]
    s=s.replace(old,lineMode)
    # windows: day
    s=s.replace("people.forEach((p,k)=>{const on=ss(p.on,p.on+.4,t);","people.forEach((p,k)=>{const on=1;")
    s=s.replace("w.leaver.visible=t<11.2+i*.2;","w.leaver.visible=true;w.leaver.position.z=s0;")
    upd=[l for l in render_tail.split('\n') if ('Update(' in l)]
    dom=[l for l in render_tail.split('\n') if l and ('Update(' not in l)]
    s=s.replace("  camAt(tt);composer.render();","  lifeUpdate(tt);\n"+"\n".join(upd)+"\n  camAt(tt);if(window.CAMHOOK)window.CAMHOOK(tt);composer.render();")
    s=s.replace("  VE.style.opacity=1-ss(0,.5,tt);\n","  VE.style.opacity=1-ss(0,.5,tt);\n"+"\n".join(dom)+"\n")
    s=s.replace('<input id="scrub" type="range" min="0" max="9"',f'<input id="scrub" type="range" min="0" max="{dur}"')
    s=s.replace("const VE=el('veil');","const VE=el('veil'),TIT=el('title'),NOTE=el('note'),CARDEL=el('card');")
    return s

LINE_GROW=lambda a,b:f'''  branches.forEach((b,i)=>{{
    const grow=ss({a}+(i%4)*.1,{b}+(i%4)*.1,tt);b.mat.opacity=.7;b.hm.opacity=.10;b.hm2.opacity=.045;
    const vis=grow>.01;b.mesh.visible=b.halo.visible=b.halo2.visible=vis;
    const cnt=Math.max(0,Math.floor(grow*NS)-1)*b.geo.userData.rad*6;b.geo.setDrawRange(0,cnt);b.halo.geometry.setDrawRange(0,cnt);b.halo2.geometry.setDrawRange(0,cnt);
  }});

'''
TITLE_TAIL=lambda a,n0,n1:f'''  TIT.style.opacity=ss({a},{a}+.8,tt);TIT.style.transform=`translateY(${{(1-ss({a},{a}+1,tt))*18}}px)`;
  NOTE.style.opacity=ss({n0},{n0}+.5,tt);
'''

# ---------- E-A：にぎやかな昼の16区画 → ゆっくり引き → 題名 ----------
camA='''const CK=[
 [0.0,new THREE.Vector3(9,14,33),new THREE.Vector3(1,1.6,12)],
 [3.0,new THREE.Vector3(5,17,43),new THREE.Vector3(0,2.6,4)],
 [6.5,new THREE.Vector3(-2,22,62),new THREE.Vector3(0,5,-2)],
 [9.5,new THREE.Vector3(-3,40,100),new THREE.Vector3(0,7,-4)],
 [13.0,new THREE.Vector3(-3,46,112),new THREE.Vector3(0,7.5,-4)],
];
'''
A=build('E-A',13,camA,'','',TITLE_TAIL(9.4,10.8,0),LINE_GROW(4.0,8.0))
open('ending/E-A.html','w').write(A)

# ---------- E-B：自分の家の庭のアップ → 紙のレポートが手前に → 題名 ----------
camB='''const P6=lotC(6);
const CK=[
 [0.0,new THREE.Vector3(P6.x+4,9.5,P6.z+7),new THREE.Vector3(P6.x+.4,1.0,P6.z+2.4)],
 [3.5,new THREE.Vector3(P6.x-1.5,9.5,P6.z+7),new THREE.Vector3(P6.x+.2,1.2,P6.z+2.0)],
 [6.5,new THREE.Vector3(P6.x-2,15,P6.z+15),new THREE.Vector3(P6.x,2,P6.z)],
 [10.0,new THREE.Vector3(-3,38,98),new THREE.Vector3(0,7,-4)],
 [14.0,new THREE.Vector3(-3,45,110),new THREE.Vector3(0,7.5,-4)],
];
'''
jsB='''
// 家族と、1年点検に来た作り手
const FAM=[['#E8701F',1],['#1C8DCC',1],['#F2C230',.62],['#9ed9f2',.55]].map(([c,s],k)=>({g:personMesh(c,s),k}));
const MAKER=personMesh('#6b7f8f',1);const helmet=new THREE.Mesh(new THREE.SphereGeometry(.26,10,6,0,Math.PI*2,0,Math.PI/2),std('#ffffff'));helmet.position.y=1.08;MAKER.add(helmet);
function famUpdate(t){const c=lotC(6);
  FAM.forEach(({g,k})=>{if(k<2){g.position.set(c.x-.8+k*1.1,0,c.z+2.0+k*.2);g.rotation.y=Math.PI*.15;}else{const a=t*2.2+k*2;g.position.set(c.x+1.0+Math.cos(a)*1.0,Math.abs(Math.sin(t*9+k))*.25,c.z+3.0+Math.sin(a)*.6);g.rotation.y=-a;}});
  MAKER.position.set(c.x-1.7,0,c.z+1.6);MAKER.rotation.y=Math.PI*.35;MAKER.visible=t<7;}
'''
tailB='''  famUpdate(tt);
  // 紙のレポートが手前に来て、読める時間だけ止まり、右下へ退く
  {const a=ss(5.6,6.6,tt),out=ss(9.4,10.4,tt);CARDEL.style.opacity=a;
   const sc=lerp(.6,1,ss(5.6,6.8,tt))*lerp(1,.42,out);const x=lerp(0,610,out),y=lerp(80,250,out)-(1-a)*60;const r=lerp(-2.5,-4,out);
   CARDEL.style.transform=`translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) rotate(${r}deg) scale(${sc})`;
   CARDEL.querySelectorAll('.row').forEach((e,k)=>{e.style.opacity=ss(6.6+k*.45,7.0+k*.45,tt);});}
'''
B=build('E-B',14,camB,CARD,jsB,tailB+TITLE_TAIL(10.6,12.2,0),LINE_GROW(7.2,10.4))
open('ending/E-B.html','w').write(B)

# ---------- E-C：自転車の後ろに伸びる光の線 → わが家で手を振る → 引き ----------
camC='''const CK=[
 [0.0,new THREE.Vector3(-30,20,36),new THREE.Vector3(-19,0,11)],
 [3.0,new THREE.Vector3(-16,20,34),new THREE.Vector3(-7,0,10)],
 [5.5,new THREE.Vector3(-2,18,26),new THREE.Vector3(1,0,4)],
 [8.0,new THREE.Vector3(5,11,10),new THREE.Vector3(5,1.0,-2.6)],
 [10.0,new THREE.Vector3(-3,38,98),new THREE.Vector3(0,7,-4)],
 [13.0,new THREE.Vector3(-3,45,110),new THREE.Vector3(0,7.5,-4)],
];
'''
jsC='''
const ROUTE=(()=>{const z=0.0,pts=[];const P6=lotC(6);
  const raw=[[-28,0,12],[-14,0,12],[-1.5,0,12],[0,0,7],[0,0,1.5],[2.5,0,0],[4.6,0,-.8],[5.0,0,-2.0]];
  return new THREE.CatmullRomCurve3(raw.map(p=>new THREE.Vector3(...p)),false,'centripetal');})();
// 自転車の子と、うしろに伸びる温白色の光の線（世界樹と同じ見た目）
const RIDER=new THREE.Group();scene.add(RIDER);RIDER.add(bike(RIDER,0,0,'#F2C230',0));const kid=personMesh('#9ed9f2',.62);scene.remove(kid);kid.position.set(0,.45,0);RIDER.add(kid);
const RN=160,RP=ROUTE.getPoints(RN-1).map(p=>p.clone().setY(.24));
const rg=tubeBuf(RN,8),rmat=new THREE.MeshBasicMaterial({vertexColors:true,toneMapped:false,transparent:true,opacity:.7,depthWrite:false});
const rmesh=new THREE.Mesh(rg,rmat);scene.add(rmesh);tubeWrite(rg,RP,.2,RP.map(()=>LINE));
const rhg=tubeBuf(RN,8),rhm=new THREE.MeshBasicMaterial({vertexColors:true,toneMapped:false,transparent:true,opacity:.12,depthWrite:false,blending:THREE.AdditiveBlending});
const rh=new THREE.Mesh(rhg,rhm);scene.add(rh);tubeWrite(rhg,RP,.7,RP.map(()=>LINE));
const FAM=[['#E8701F',1],['#1C8DCC',1],['#F2C230',.62]].map(([c,s],k)=>({g:personMesh(c,s),k}));
function rideUpdate(t){const u=ss(0,1,cl(t/8.2))*.25+cl(t/8.2)*.75;const p=ROUTE.getPoint(Math.min(u,1)),q=ROUTE.getPoint(Math.min(u+.01,1));
  RIDER.position.copy(p);RIDER.rotation.y=Math.atan2(-(q.z-p.z),q.x-p.x);
  const cnt=Math.max(0,Math.floor(u*RN)-1)*8*6;rg.setDrawRange(0,cnt);rhg.setDrawRange(0,cnt);
  const c=lotC(6);FAM.forEach(({g,k})=>{g.position.set(c.x-1.2+k*1.0,Math.max(0,Math.sin(t*6+k))*(t>7.6?.18:0),c.z+3.4);g.rotation.y=Math.PI*1.1;});}
'''
tailC='''  rideUpdate(tt);
'''
jsC+='''
window.CAMHOOK=t=>{const k=1-ss(6.4,8.4,t);if(k<=0)return;
  const u=ss(0,1,cl(t/8.2))*.25+cl(t/8.2)*.75;const p=ROUTE.getPoint(Math.min(u,1));
  const back=ROUTE.getPoint(Math.max(0,Math.min(u,1)-.2)),ahead=ROUTE.getPoint(Math.min(1,Math.min(u,1)+.05));
  const cp=new THREE.Vector3(back.x-3,21,back.z+9);const tg=new THREE.Vector3(ahead.x,.4,ahead.z);
  const cur=new THREE.Vector3();camera.getWorldDirection(cur);const look0=camera.position.clone().add(cur.multiplyScalar(20));
  camera.position.lerp(cp,k);camera.lookAt(look0.lerp(tg,k));};
'''
Cc=build('E-C',13,camC,'',jsC,tailC+TITLE_TAIL(10.0,11.4,0),LINE_GROW(8.2,11.0))
open('ending/E-C.html','w').write(Cc)
print('built')
