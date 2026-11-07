# BGM と SE を、コードだけで合成する（外部の音源・素材は使わない）【人間の依頼 11/7：内容にあわせた、ナレーションの邪魔にならないモダンな BGM と SE】
# 使い方：python3 video/audio/make_bgm.py <出力.wav> [--duck]
#   場面の時刻は video/edl.json、ナレーションの代わりの位置は字幕（--duck のとき、字幕の間だけ BGM を少し下げる）
# 方針【Claude】：F の長調で Fmaj7 → Am7 → Dm9 → B♭maj7（1小節ずつ、96BPM）。声の帯域（300Hz〜3kHz）は薄く、パッドは低め、
#   アルペジオは高め。章ごとに重ねる楽器を変える。SE は小さく短く。ネオンっぽい電子音・派手なヒット音・壮大な締めは使わない
import json, os, sys, wave
import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = sys.argv[1]; DUCK = '--duck' in sys.argv
E = json.load(open(os.path.join(ROOT, 'video', 'edl.json'), encoding='utf-8'))
SR = 48000; END = float(E['end']); N = int(END * SR)
AT = {s['id']: s['at'] for s in E['segments']}
rng = np.random.default_rng(7)

def srt(p):
    out = []
    for b in open(p, encoding='utf-8').read().strip().split('\n\n'):
        l = b.split('\n'); a, z = l[1].split(' --> ')
        f = lambda s: (lambda h, m, r: int(h) * 3600 + int(m) * 60 + float(r.replace(',', '.')))(*s.split(':'))
        out.append((f(a), f(z)))
    return out
SUBS = srt(os.path.join(ROOT, 'video', E['subs']))

mid = lambda m: 440.0 * 2 ** ((m - 69) / 12)
def add(buf, x, t, g=1.0, pan=0.0):
    """buf（2ch）の t 秒に x（モノ）を足す。pan は -1 左〜1 右"""
    i = int(t * SR)
    if i >= buf.shape[1] or i + len(x) <= 0: return
    j0 = max(0, -i); x = x[j0:]; i = max(0, i); n = min(len(x), buf.shape[1] - i)
    l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    buf[0, i:i + n] += x[:n] * g * l * 1.414; buf[1, i:i + n] += x[:n] * g * r * 1.414

def tt(d): return np.arange(int(d * SR)) / SR
def env_ar(n, a, r):
    e = np.ones(n); na, nr = int(a * SR), int(r * SR)
    if na: e[:na] = np.linspace(0, 1, na) ** 2
    if nr: e[-nr:] *= np.linspace(1, 0, nr) ** 2
    return e

# ---- 楽器 ----
def pad(notes, d):
    t = tt(d + 1.0); x = np.zeros_like(t)
    for m in notes:
        f = mid(m)
        for det, g in ((-0.12, .5), (0.0, .7), (0.13, .5)):
            ff = f * 2 ** (det / 12 / 4)
            x += g * (np.sin(2 * np.pi * ff * t + rng.uniform(0, 6)) + .18 * np.sin(4 * np.pi * ff * t) + .06 * np.sin(6 * np.pi * ff * t))
    x *= env_ar(len(t), .7, 1.1) * (1 + .05 * np.sin(2 * np.pi * .3 * t))
    return x / (len(notes) * 1.7)

def pluck(m, d=1.4, bright=1.0):
    t = tt(d); f = mid(m)
    x = np.sin(2 * np.pi * f * t) * np.exp(-t * 5) + .28 * bright * np.sin(4 * np.pi * f * t) * np.exp(-t * 9) + .08 * bright * np.sin(6 * np.pi * f * t) * np.exp(-t * 14)
    x[:int(.004 * SR)] *= np.linspace(0, 1, int(.004 * SR))
    return x

def bass(m, d):
    t = tt(d); f = mid(m)
    x = np.sin(2 * np.pi * f * t) + .15 * np.sin(4 * np.pi * f * t)
    return x * env_ar(len(t), .02, .25) * np.exp(-t * .6)

def kick():
    t = tt(.35); f = 48 + 70 * np.exp(-t * 28)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 13)

def hat(d=.05, dec=70):
    t = tt(d); x = np.diff(rng.standard_normal(len(t) + 1)); return x * np.exp(-t * dec) * .5

def noise_band(d, lo, hi):
    n = int(d * SR); X = np.fft.rfft(rng.standard_normal(n)); fr = np.fft.rfftfreq(n, 1 / SR)
    X[(fr < lo) | (fr > hi)] = 0; x = np.fft.irfft(X, n); return x / (np.abs(x).max() + 1e-9)

# ---- SE ----
def se_whoosh(d=.55, lo=600, hi=5000):
    x = noise_band(d, lo, hi); t = tt(d)[:len(x)]; return x * np.sin(np.pi * t / d) ** 2 * .5
def se_ping(m, d=1.6):
    t = tt(d); f = mid(m); return (np.sin(2 * np.pi * f * t) + .3 * np.sin(2 * np.pi * 2.01 * f * t) * np.exp(-t * 3)) * np.exp(-t * 3.2) * .6
def se_tick(m=96):
    t = tt(.06); return np.sin(2 * np.pi * mid(m) * t) * np.exp(-t * 90) * .5
def se_thump():
    t = tt(.4); return np.sin(2 * np.pi * np.cumsum(70 + 40 * np.exp(-t * 20)) / SR) * np.exp(-t * 11) * .7
def se_chime(ms, gap=.05):
    x = np.zeros(int((1.8 + gap * len(ms)) * SR))
    for k, m in enumerate(ms): y = se_ping(m, 1.8); i = int(k * gap * SR); x[i:i + len(y)] += y * (1 - k * .08)
    return x
def se_rise(d=1.0, m0=72, m1=91):
    t = tt(d); f = mid(m0) * (mid(m1) / mid(m0)) ** (t / d)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * t / d) ** 2 * .3 + se_whoosh(d, 2000, 9000)[:len(t)] * .25

# ---- 曲の骨組み ----
BPM = 96; BEAT = 60 / BPM; BAR = BEAT * 4
CH = [  # (パッド, ベース, アルペジオ)
    ([53, 57, 60, 64], 41, [72, 76, 77, 81]),   # Fmaj7
    ([52, 57, 60, 67], 45, [72, 76, 79, 81]),   # Am7
    ([50, 57, 60, 64], 38, [72, 74, 76, 81]),   # Dm9
    ([53, 57, 58, 62], 46, [70, 74, 77, 81]),   # B♭maj7
]
# 区間ごとに重ねる量（0〜1）。章の境目で1秒かけて入れ替える
s = AT
SEC = [  # (始まり, パッド, アルペジオ, ベース, キック, ハット)
    (0.0,               .9, 0.0, 0.0, 0.0, 0.0),   # タイトル：パッドだけ
    (s['ch1a'],         .8, .55, 0.0, 0.0, 0.0),   # 前振り：問いかけ。まばらなアルペジオ
    (s['hero'] - .4,    .8, .9, .7, 0.0, .25),     # Hero：明るく前へ
    (s['gtitle'],       .65, .7, .75, .55, .45),   # プレイ画面：軽い刻み
    (s['s67'],          .8, .6, .3, 0.0, 0.0),     # 判断の連続：落ち着く
    (s['impl'],         .55, .5, .7, .6, .55),     # 実装：リズムをはっきり
    (s['ending'],       .85, .7, .35, 0.0, .15),   # さいごに：最初のアルペジオへ
    (s['closing'],      .9, .3, 0.0, 0.0, 0.0),    # ロゴ：解決
    (s['credits'],      .7, 0.0, 0.0, 0.0, 0.0),
]
def level(t, k):
    v = SEC[0][k]
    for a, *g in SEC:
        w = np.clip((t - a + .5) / 1.0, 0, 1); v = v * (1 - w) + g[k - 1] * w
    return v

T = np.arange(N) / SR
L = {k: level(T, k) for k in range(1, 6)}
music = np.zeros((2, N)); arp = np.zeros((2, N)); se = np.zeros((2, N))

nb = int(END / BAR) + 2
for b in range(nb):
    t0 = b * BAR; c = CH[b % 4]
    if t0 >= s['closing'] - .01: break
    add(music, pad(c[0], BAR), t0, .55 * float(np.interp(t0 + BAR / 2, T[::SR // 100], L[1][::SR // 100])))
    for q in range(4):                                  # ベース：1拍目と3拍目、裏に軽く
        tb = t0 + q * BEAT
        if q in (0, 2): add(music, bass(c[1], BEAT * 1.6), tb, .5 * float(np.interp(tb, T[::SR // 100], L[3][::SR // 100])))
    for q in range(8):                                  # アルペジオ：8分。前振りは間引く
        tb = t0 + q * BEAT / 2; lv = float(np.interp(tb, T[::SR // 100], L[2][::SR // 100]))
        if lv < .02: continue
        sparse = tb < s['hero'] - .4
        if sparse and q % 2: continue
        m = c[2][[0, 1, 2, 3, 2, 1, 3, 1][q]]
        add(arp, pluck(m, bright=.8), tb, .32 * lv, pan=[-.35, .35][q % 2])
    for q in range(4):                                  # キック：1・3拍、ハット：裏
        tb = t0 + q * BEAT
        lk = float(np.interp(tb, T[::SR // 100], L[4][::SR // 100])); lh = float(np.interp(tb, T[::SR // 100], L[5][::SR // 100]))
        if q in (0, 2) and lk > .02: add(music, kick(), tb, .4 * lk)
        if lh > .02: add(music, hat(), tb + BEAT / 2, .22 * lh, pan=.2); add(music, hat(.03, 120), tb, .08 * lh, pan=-.2)
# 締めのロゴ：Fmaj9 に解決して、長く伸ばす
add(music, pad([53, 57, 60, 64, 67], 5.0), s['closing'], .6)
add(arp, se_chime([77, 81, 84, 88], .09), s['closing'] + .2, .35)
# アルペジオに軽い山びこ（3/8拍で左右に）
d1 = int(BEAT * .75 * SR)
echo = np.zeros_like(arp); echo[1, d1:] += arp[0, :-d1] * .32; echo[0, 2 * d1:] += arp[1, :-2 * d1] * .2
music += arp + echo

# ---- SE の位置（場面表から）----
c1 = s['ch1a'] - 3.2   # 前振りの動画は ch1.html の 3.2秒から
for tch in [6.4, 9.4, 15.2, 20.8]: add(se, se_whoosh(.5, 900, 6000), c1 + tch - .6, .18)       # 場面のパン
for i in range(7): add(se, se_tick(91 + (i % 3) * 2), c1 + 9.4 + 2.1 + i * .12, .16 * (1 - i * .09), pan=-.3 + i * .1)  # へだたりの断片
add(se, se_rise(1.0), c1 + 20.8 + 2.0, .55)                                                    # 線が上へ → Hero
for lv in range(4): add(se, se_tick(84 + lv * 3), s['tree'] + .7 + lv * .75, .3, pan=-.3 + lv * .2)   # 木が分かれる
add(se, se_chime([84, 88, 91], .06), s['tree'] + 3.9, .25)                                     # 16の家
for a, b_, nm in E['overlay']['chapters'][1:]: add(se, se_whoosh(.4, 1500, 8000), a - .15, .16) # 章の切り替わり
segs = {x['id']: x for x in E['segments']}
def hl_t(i): x = segs[i]; return x['at'] + x['hl']['at']
add(se, se_tick(88), s['r04-fork1'] + 1.9, .35)                                                # 第一の分岐点で選ぶ
add(se, se_chime([86, 91], .07), hl_t('r05-fork3'), .3)                                        # 自由入力欄が光る
add(se, se_chime([81, 86, 89, 93], .05), hl_t('r06-fork4'), .3)                                # 15の世界線が光る
add(se, se_whoosh(.35, 1200, 7000), s['r07-electric'] + .35, .2)                               # チャットへ寄る
add(se, se_whoosh(.35, 800, 6000), s['r08-build'] + .4, .25); add(se, se_thump(), s['r08-build'] + .55, .4)  # 着工：さっと寄る
add(se, se_chime([77, 81, 84], .08), s['r08-handover'] + .3, .3)                               # 引き渡し
add(se, se_ping(84), s['r09-year'] + .1, .2)                                                   # 1年後
add(se, se_whoosh(.5, 700, 5000), s['r09-tree'] - .1, .2)                                      # 世界樹へ
add(se, se_whoosh(.45, 400, 3000), s['report'] + .1, .18)                                      # レポート（紙）
add(se, se_rise(1.4, 65, 77), s['v6ai'] + .7, .35)                                             # あいだがつながる
add(se, se_chime([77, 84], .12), E['overlay']['house'] + 3.0, .25)                             # 線が家になる

mix = music * .9 + se
# ナレーションの代わり：字幕の間だけ BGM を少し下げる（本番は録音した声でダッキング）
if DUCK:
    g = np.ones(N)
    for a, z in SUBS: g[int(a * SR):int(z * SR)] = .6
    k = int(.25 * SR); g = np.convolve(g, np.ones(k) / k, mode='same')
    mix = music * .9 * g[None, :] + se
# 最初と最後
mix[:, :int(.4 * SR)] *= np.linspace(0, 1, int(.4 * SR))
fo = int(1.5 * SR); mix[:, -fo:] *= np.linspace(1, 0, fo) ** 2
mix /= np.abs(mix).max() * 1.12
os.makedirs(os.path.dirname(os.path.abspath(OUT)), exist_ok=True)
with wave.open(OUT, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((np.clip(mix.T, -1, 1) * 32767).astype('<i2').tobytes())
print('saved', OUT, f'{END}s')
