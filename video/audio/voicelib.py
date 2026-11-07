# 声の変換の部品（WORLD／pyworld）。Claude が書いた声変換で、音声合成のモデルや外部のボイスチェンジャーは使わない
# 声を「高さ（F0）・声道の響き（スペクトル包絡）・息の成分（非周期性）」に分け、それぞれを動かして作り直す
import numpy as np
import pyworld as pw

def _smooth(v, n):
    if n <= 1: return v
    k = np.ones(n) / n; return np.convolve(v, k, mode='same')

def convert(y, sr, pitch=1.0, formant=1.0, expr=1.0, breath=1.0, smooth=1, hi_tame=0.0,
            quantize=False, melody=None, vibrato=None, tail_stretch=1.0, fp=5.0):
    """pitch：高さの倍率／formant：響きの倍率（>1 小柄・若く、<1 大柄・太く）／expr：抑揚の大きさ／breath：息っぽさ
    smooth：F0 をならすコマ数（ガサつきを減らす）／hi_tame：高い帯域（6kHz〜）の包絡を下げる量（0〜1、ピリつきを抑える）
    quantize：F0 を半音の階段にそろえる（ボカロ風）／melody：[半音の高さ(MIDI)...] を時間で等分して当てる
    vibrato：(Hz, 半音) を後半にかける／tail_stretch：最後の3割をゆっくりに（歌うように伸ばす）"""
    if len(y) < sr * 0.15: return y
    f0, t = pw.harvest(y, sr, f0_floor=60, f0_ceil=500, frame_period=fp)
    sp = pw.cheaptrick(y, f0, t, sr); ap = pw.d4c(y, f0, t, sr)
    v = f0 > 0
    if v.any():
        lf = np.log(np.where(v, f0, 1.0)); mu = lf[v].mean()
        lf2 = np.where(v, mu + (lf - mu) * expr + np.log(pitch), 0)
        # 有声の区間の中だけでならす
        if smooth > 1:
            fill = np.interp(np.arange(len(lf2)), np.where(v)[0], lf2[v]); fill = _smooth(fill, smooth); lf2 = np.where(v, fill, 0)
        f0n = np.where(v, np.exp(lf2), 0)
        if quantize or melody is not None:
            midi = np.where(v, 69 + 12 * np.log2(np.maximum(f0n, 1) / 440), 0)
            if melody is not None:
                idx = np.where(v)[0]; seg = np.array_split(idx, len(melody))
                for s, m in zip(seg, melody): midi[s] = m
            else:
                midi = np.where(v, np.round(midi), 0)
            # 音のつなぎを30msでなめらかに
            fill = np.interp(np.arange(len(midi)), np.where(v)[0], midi[v]); fill = _smooth(fill, max(1, int(30 / fp)))
            f0n = np.where(v, 440 * 2 ** ((fill - 69) / 12), 0)
        if vibrato:
            hz, st = vibrato; n = len(f0n); w = np.clip((np.arange(n) - n * .55) / (n * .2), 0, 1)
            f0n = f0n * 2 ** (st * w * np.sin(2 * np.pi * hz * t) / 12)
    else:
        f0n = f0
    nb = sp.shape[1]; k = np.arange(nb); src = np.clip(k / formant, 0, nb - 1)
    sp2 = np.array([np.interp(src, k, fr) for fr in sp]); ap2 = np.array([np.interp(src, k, fr) for fr in ap])
    if hi_tame > 0:
        fr = k * sr / 2 / (nb - 1); g = 1 - hi_tame * np.clip((fr - 5500) / 4000, 0, 1); sp2 *= (g ** 2)[None, :]
    if breath != 1.0: ap2 = np.clip(ap2 ** (1 / breath), 0, 1)
    if tail_stretch != 1.0:
        n = len(f0n); cut = int(n * .7); m = int((n - cut) * tail_stretch)
        ii = np.concatenate([np.arange(cut), cut + np.arange(m) / tail_stretch])
        lin = lambda a: np.array([np.interp(ii, np.arange(n), a[:, j]) for j in range(a.shape[1])]).T
        vv = np.interp(ii, np.arange(n), (f0n > 0).astype(float)) > .5
        f0n = np.where(vv, np.interp(ii, np.arange(n), np.where(f0n > 0, f0n, np.nan_to_num(f0n))), 0)
        sp2, ap2 = lin(sp2), lin(ap2)
    z = pw.synthesize(np.ascontiguousarray(f0n), np.ascontiguousarray(sp2), np.ascontiguousarray(ap2), sr, frame_period=fp)
    if tail_stretch == 1.0:
        z = z[:len(y)]
        if len(z) < len(y): z = np.pad(z, (0, len(y) - len(z)))
    return z

# 声の設定（11/7 人間の指示で3種類に）
OJISAN = dict(pitch=0.88, formant=0.95, expr=1.3, smooth=5, hi_tame=0.25)       # 犯人感を減らす：ずらし幅を小さく、F0をならす
WOMAN = dict(pitch=1.66, formant=1.14, expr=1.05, smooth=5, hi_tame=0.55, breath=1.05)  # ピリつきを減らす：高い帯域を抑え、F0をならす
CHILD = dict(pitch=3.6, formant=1.45, expr=1.25, smooth=5, hi_tame=0.5)           # 男の子（2〜3歳）
