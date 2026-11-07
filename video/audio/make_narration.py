# 仕上げのナレーションを作る【人間の指示 11/7】
#   冒頭のタイトルコール：わたしの声（別に録ったもの）／ゆくすいえとは：おじさん／プレイ画面・結果とレポート：落ち着いた女性／
#   実装について・さいごに：わたし／締めのタイトルコール：わたしの声＋それを変換した女性の声を、わずかにずらして重ねる
#   声の変換はすべて Claude の声変換（voicelib.py、WORLD）。音声合成や外部のボイスチェンジャーは使わない
# 使い方：python3 video/audio/make_narration.py <整えた本文の声.wav（映像の時刻）> <冒頭のタイトルコール.wav> <出力.wav>
import json, os, sys, wave
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))
from voicelib import convert, OJISAN, WOMAN

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC, CALL, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
E = json.load(open(os.path.join(ROOT, 'video', 'edl.json'), encoding='utf-8'))
AT = {s['id']: s['at'] for s in E['segments']}
def rd(p):
    w = wave.open(p); return np.frombuffer(w.readframes(w.getnframes()), '<i2').astype(np.float64) / 32768, w.getframerate()
x, SR = rd(SRC); call, sr2 = rd(CALL); assert sr2 == SR
def ts(q):
    h, m, r = q.split(':'); sec, ms = r.split(','); return int(h) * 3600 + int(m) * 60 + int(sec) + int(ms) / 1000
SUBS = []
for blk in open(os.path.join(ROOT, 'video', E['subs']), encoding='utf-8').read().strip().split('\n\n'):
    l = blk.split('\n'); a, b = l[1].split(' --> '); SUBS.append((ts(a), ts(b)))
S = lambda n: SUBS[n - 1][0]

def chunks(a, b, gap=0.25):
    seg = x[int(a * SR):int(b * SR)]; fr = int(.02 * SR)
    e = np.array([np.sqrt((seg[i:i + fr] ** 2).mean() + 1e-12) for i in range(0, len(seg) - fr, fr)])
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

def rms_voiced(z):
    fr = int(.02 * SR); e = np.array([np.sqrt((z[i:i + fr] ** 2).mean()) for i in range(0, len(z) - fr, fr)])
    e = e[20 * np.log10(e + 1e-9) > -40]; return np.sqrt((e ** 2).mean()) if len(e) else 1e-3

VOICES = [(S(1), 'おじさん', OJISAN), (S(13), '落ち着いた女性', WOMAN), (S(35), 'わたし', None)]
BODY0, BODY1 = S(1) - 0.3, AT['closing'] + 0.45   # 本文の声の範囲（元の録音の冒頭・締めの声は使わない）
parts = {n: np.zeros_like(x) for _, n, _ in VOICES}
for c0, c1 in chunks(BODY0, BODY1):
    i0, i1 = max(0, int(c0 * SR)), min(len(x), int(c1 * SR)); mid = (c0 + c1) / 2
    name, prm = [(n, p) for a, n, p in VOICES if a <= mid + 0.3][-1]
    z = x[i0:i1] if prm is None else convert(x[i0:i1], SR, **prm)
    fd = min(int(.015 * SR), (i1 - i0) // 4); w = np.ones(i1 - i0); w[:fd] = np.linspace(0, 1, fd); w[-fd:] = np.linspace(1, 0, fd)
    parts[name][i0:i1] += z * w
# 声ごとの大きさをそろえる（声色を変えると大きさの感じが変わるので、話している所の大きさで合わせる）
ref = rms_voiced(parts['わたし'])
y = np.zeros_like(x)
for n, z in parts.items():
    g = ref / rms_voiced(z); y += z * g; print(n, f'{20 * np.log10(g):+.1f}dB')
# 冒頭のタイトルコール：ロゴの文字が出るところに
c = call / rms_voiced(call) * ref
t0 = 0.30; i = int(t0 * SR); y[i:i + len(c)] += c[:len(y) - i]
# 締めのタイトルコール：わたし＋女性（わずかに遅らせる）
wo = convert(call, SR, **WOMAN); wo = wo / rms_voiced(wo) * ref
t1 = AT['closing'] + 0.9; i = int(t1 * SR); d = int(0.04 * SR)
y[i:i + len(c)] += c * 0.80; y[i + d:i + d + len(wo)] += wo * 0.72
print('冒頭', t0, '締め', round(t1, 2))
with wave.open(OUT, 'wb') as o:
    y = y / (np.abs(y).max() + 1e-9) * 0.89
    o.setnchannels(1); o.setsampwidth(2); o.setframerate(SR); o.writeframes((y * 32767).astype('<i2').tobytes())
print('saved', OUT)
