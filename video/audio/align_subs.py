# 使い方：python3 video/audio/align_subs.py <録音の遅れ秒> <元の字幕.srt> <出力.srt>（録音は /tmp/claude-0/nar/in.m4a を読む。動画担当の作業用）
# 字幕を声に合わせる：声のかたまり（無音で区切る）と字幕を、順番を保って対応づける（動的計画法）
import numpy as np,re,subprocess,json,sys
O=float(sys.argv[1]);SRC=sys.argv[2];OUT=sys.argv[3]
o=subprocess.run(['ffmpeg','-hide_banner','-i','/tmp/claude-0/nar/in.m4a','-af','silencedetect=n=-38dB:d=0.25','-f','null','-'],capture_output=True,text=True).stderr
st=[float(x) for x in re.findall(r'silence_start: ([0-9.]+)',o)];en=[float(x) for x in re.findall(r'silence_end: ([0-9.]+)',o)]
ch=[];prev=0
for a,b in zip(st,en):
    if a-prev>0.12: ch.append([prev-O,a-O])
    prev=b
ch=[c for c in ch if 2.5<c[0]<172.0 and c[1]-c[0]>0.15]
def ts(q):
    h,m,r=q.split(':');sec,ms=r.split(',');return int(h)*3600+int(m)*60+int(sec)+int(ms)/1000
subs=[]
for b in open(SRC,encoding='utf-8').read().strip().split('\n\n'):
    l=b.split('\n');a,z=l[1].split(' --> ');subs.append([ts(a),ts(z),l[2]])
M,N=len(ch),len(subs);INF=1e9
f=np.full((M+1,N+1),INF);f[0,0]=0;bk={}
for i in range(M):
    for j in range(N):
        if f[i,j]>=INF: continue
        for m in range(1,6):
            if i+m>M: break
            for k in range(1,4):
                if j+k>N or (m>1 and k>1): continue
                a=ch[i][0];b=ch[i+m-1][1]
                if k==1: starts=[a]
                else:
                    L=[len(subs[j+q][2]) for q in range(k)];tot=sum(L);acc=0;starts=[]
                    for q in range(k): starts.append(a+(b-a)*acc/tot);acc+=L[q]
                c=sum(abs(starts[q]-subs[j+q][0]) for q in range(k))+0.4*(k-1)+0.05*(m-1)
                if f[i,j]+c<f[i+m,j+k]: f[i+m,j+k]=f[i,j]+c;bk[(i+m,j+k)]=(i,j,m,k,starts)
i,j=M,N;new=[None]*N
while (i,j)!=(0,0):
    pi,pj,m,k,starts=bk[(i,j)]
    for q in range(k): new[pj+q]=starts[q]
    i,j=pi,pj
out=[]
for q in range(N):
    a=max(3.0 if q==0 else 0,new[q]-0.12)
    z=(new[q+1]-0.12) if q+1<N else max(subs[q][1],ch[-1][1]+0.6)
    out.append((a,z,subs[q][2]))
def fm(x):
    ms=int(round(x*1000));return '%02d:%02d:%02d,%03d'%(ms//3600000,ms//60000%60,ms//1000%60,ms%1000)
open(OUT,'w',encoding='utf-8').write('\n'.join(f'{k}\n{fm(a)} --> {fm(b)}\n{t}\n' for k,(a,b,t) in enumerate(out,1)))
for (a0,z0,t),(a,z,_) in zip(subs,out): print(f"{a0:6.2f}->{a:6.2f} ({a-a0:+.2f})  {z-a:4.1f}s  {t[:20]}")
