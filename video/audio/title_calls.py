# タイトルコールのパターン（冒頭＝少女、締め＝わたし・落ち着いた女性・こども）と、おじさん・女性の声の微調整の聞き比べを作る
# 使い方：python3 video/audio/title_calls.py <整えた声.wav（映像の時刻）> <出力フォルダ>
# 【人間の指示 11/7】冒頭はミク・ボカロ・アニメ系の明るい少女、締めは3声を0.03〜0.07秒ずらす。ビデオの前に何パターンか比べる
import os, sys, wave
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))
from voicelib import convert, OJISAN, WOMAN, CHILD

SRC, OUT = sys.argv[1], sys.argv[2]; os.makedirs(OUT, exist_ok=True)
w = wave.open(SRC); SR = w.getframerate(); x = np.frombuffer(w.readframes(w.getnframes()), '<i2').astype(np.float64) / 32768
cut = lambda a, b: x[int(a * SR):int(b * SR)].copy()
def save(name, y, pad=0.3):
    y = np.concatenate([np.zeros(int(pad * SR)), y, np.zeros(int(pad * SR))]); y = y / (np.abs(y).max() + 1e-9) * .89
    with wave.open(os.path.join(OUT, name + '.wav'), 'wb') as o:
        o.setnchannels(1); o.setsampwidth(2); o.setframerate(SR); o.writeframes((y * 32767).astype('<i2').tobytes())
    print('saved', name)

# ---- 冒頭：少女（元は 0.15〜1.65秒のわたしの声） ----
op = cut(0.15, 1.65)
save('op0_元の声', op)
G = dict(formant=1.32, smooth=5, hi_tame=0.4)
save('op1_少女_ナチュラル', convert(op, SR, pitch=3.1, expr=1.35, **G))
save('op2_少女_ボカロ風_半音にそろえる', convert(op, SR, pitch=3.1, expr=1.2, quantize=True, breath=0.7, **G))
save('op3_少女_ボカロ風_上がるメロディ', convert(op, SR, pitch=2.6, melody=[69, 72, 74, 76, 79], vibrato=(5.5, .35), tail_stretch=1.6, breath=0.7, **G))
save('op4_少女_元気にはずむ', convert(op, SR, pitch=3.3, expr=1.9, tail_stretch=1.3, **dict(G, formant=1.34)))

# ---- 締め：わたし＋落ち着いた女性＋こども（元は 172.45〜173.95秒のわたしの声） ----
cl = cut(172.45, 173.95)
me, wo, ch = cl, convert(cl, SR, **WOMAN), convert(cl, SR, **CHILD)
ch_slow = convert(cl, SR, tail_stretch=1.08, **CHILD)
def mixv(parts):
    n = max(int(dt * SR) + len(y) for y, dt, g in parts); z = np.zeros(n)
    for y, dt, g in parts: i = int(dt * SR); z[i:i + len(y)] += y / (np.abs(y).max() + 1e-9) * g
    return z
save('cl0_元の声', me)
save('cl1_わたし0_女性003_こども006', mixv([(me, 0, .8), (wo, .03, .72), (ch, .06, .75)]))
save('cl2_わたし0_こども003_女性005', mixv([(me, 0, .8), (ch, .03, .75), (wo, .05, .72)]))
save('cl3_こども0_女性004_わたし007', mixv([(ch, 0, .78), (wo, .04, .72), (me, .07, .8)]))
save('cl4_わたし0_女性005_こども007ゆっくりめ', mixv([(me, 0, .8), (wo, .05, .72), (ch_slow, .07, .75)]))
save('cl_こどもだけ', ch)

# ---- おじさん・落ち着いた女性の微調整（前の設定 → 新しい設定） ----
OLD_OJ = dict(pitch=0.84, formant=0.92, expr=1.45); OLD_WO = dict(pitch=1.72, formant=1.16, expr=1.05, breath=1.1)
a = cut(3.0, 12.2); save('cmp_おじさん_前', convert(a, SR, **OLD_OJ)); save('cmp_おじさん_新', convert(a, SR, **OJISAN))
b = cut(47.2, 57.4); save('cmp_女性_前', convert(b, SR, **OLD_WO)); save('cmp_女性_新', convert(b, SR, **WOMAN))
