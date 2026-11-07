# ナレーションの声色を、章ごとに変える（WORLD：声の高さ・声道の響き・息の成分に分けて作り直す）
# 【人間の依頼 11/7】はじめはお茶目なおじさん、次は落ち着いた明るい女性・若い女性、実装は別の男性、
#   最後のタイトルコールは男性・女性・子どもが少しずれて重なる。元の声を変換して作る（AIの音声合成はこの環境で使えないので使わない）
# 使い方：python3 video/audio/voice_change.py <整えた声.wav（映像の時刻にそろえたもの）> <出力.wav>
import json, os, sys, wave
import numpy as np
import pyworld as pw

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC, OUT = sys.argv[1], sys.argv[2]
E = json.load(open(os.path.join(ROOT, 'video', 'edl.json'), encoding='utf-8'))
AT = {s['id']: s['at'] for s in E['segments']}

def readwav(p):
    with wave.open(p) as w:
        sr = w.getframerate(); x = np.frombuffer(w.readframes(w.getnframes()), '<i2').astype(np.float64) / 32768
        if w.getnchannels() > 1: x = x.reshape(-1, w.getnchannels()).mean(1)
    return x, sr
x, SR = readwav(SRC)

def convert(y, pitch=1.0, formant=1.0, expr=1.0, breath=1.0):
    """pitch：声の高さの倍率、formant：声道の響きの倍率（>1で小柄・若く、<1で大柄・太く）、expr：抑揚の大きさ、breath：息っぽさ"""
    if len(y) < SR * 0.2: return y
    f0, t = pw.harvest(y, SR, f0_floor=60, f0_ceil=500, frame_period=5.0)
    sp = pw.cheaptrick(y, f0, t, SR); ap = pw.d4c(y, f0, t, SR)
    v = f0 > 0
    if v.any():
        mu = np.exp(np.log(f0[v]).mean())
        f0n = np.where(v, mu * (f0 / np.where(v, mu, 1)) ** expr * pitch, 0)
    else: f0n = f0
    nb = sp.shape[1]; k = np.arange(nb); src = np.clip(k / formant, 0, nb - 1)
    sp2 = np.array([np.interp(src, k, fr) for fr in sp]); ap2 = np.array([np.interp(src, k, fr) for fr in ap])
    if breath != 1.0: ap2 = np.clip(ap2 ** (1 / breath), 0, 1)
    z = pw.synthesize(f0n, sp2, ap2, SR, frame_period=5.0)[:len(y)]
    if len(z) < len(y): z = np.pad(z, (0, len(y) - len(z)))
    return z

# 声の切れ目（無音）で区切って、区切りごとに変換する（長い音を一度に解析しない・つなぎ目を無音に置く）
def chunks(a, b, gap=0.25):
    seg = x[int(a * SR):int(b * SR)]; fr = int(.02 * SR); e = np.array([np.sqrt((seg[i:i + fr] ** 2).mean() + 1e-12) for i in range(0, len(seg) - fr, fr)])
    quiet = 20 * np.log10(e) < -45; out = []; s0 = None; run = 0
    for i, q in enumerate(quiet):
        if not q:
            if s0 is None: s0 = i
            run = 0
        else:
            run += 1
            if s0 is not None and run * .02 >= gap: out.append((a + s0 * .02 - .05, a + (i - run + 1) * .02 + .08)); s0 = None
    if s0 is not None: out.append((a + s0 * .02 - .05, b))
    return out

def ts(q):
    h, m, r = q.split(':'); sec, ms = r.split(','); return int(h) * 3600 + int(m) * 60 + int(sec) + int(ms) / 1000
SUBS = []
for blk in open(os.path.join(ROOT, 'video', E['subs']), encoding='utf-8').read().strip().split('\n\n'):
    l = blk.split('\n'); p0, p1 = l[1].split(' --> '); SUBS.append((ts(p0), ts(p1)))
# 声は、字幕の番号で章に分ける（章の切れ目で、ひと続きの声を割らない）。字幕は声に合わせてある
S = lambda n: SUBS[n - 1][0]
VOICES = [  # (始まり, 名前, 変換)
    (0.0,   'お茶目なおじさん',     dict(pitch=0.84, formant=0.92, expr=1.45, breath=1.0)),
    (S(13), '落ち着いた明るい女性', dict(pitch=1.72, formant=1.16, expr=1.05, breath=1.1)),
    (S(27), '若い女性',             dict(pitch=1.95, formant=1.22, expr=1.2, breath=1.15)),
    (S(35), '別の男性（若め）',     dict(pitch=1.14, formant=1.06, expr=1.1)),
    (S(43), '作者の声（そのまま）', None),
]
CALL = SUBS[-1][1] + 0.2   # 最後の字幕のあと（締めのロゴの間）の声＝タイトルコール
y = np.zeros_like(x)
for c0, c1 in chunks(0.0, len(x) / SR):
    i0, i1 = max(0, int(c0 * SR)), min(len(x), int(c1 * SR)); mid = (c0 + c1) / 2; seg = x[i0:i1]
    if mid >= CALL:   # タイトルコール：男性・女性・子どもが、少しずつずれて重なる
        for prm, dt, g in ((dict(pitch=0.92, formant=0.97, expr=1.1), 0.0, .75), (dict(pitch=1.75, formant=1.17, expr=1.1), .07, .65), (dict(pitch=2.3, formant=1.36, expr=1.25), .15, .6)):
            z = convert(seg, **prm); j = i0 + int(dt * SR); n = min(len(z), len(y) - j); y[j:j + n] += z[:n] * g
        print('タイトルコール 3声', round(c0, 2), round(c1, 2)); continue
    prm = [v for v in VOICES if v[0] <= mid + 0.3][-1][2]
    z = seg if prm is None else convert(seg, **prm)
    fd = min(int(.02 * SR), (i1 - i0) // 4); w = np.ones(i1 - i0); w[:fd] = np.linspace(0, 1, fd); w[-fd:] = np.linspace(1, 0, fd)
    y[i0:i1] += z * w
y /= max(1e-9, np.abs(y).max()) / 0.9
with wave.open(OUT, 'wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((np.clip(y, -1, 1) * 32767).astype('<i2').tobytes())
print('saved', OUT)
