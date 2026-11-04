"""物理ベースの下地 -> 水彩と線描の「絵」に描き直す。使い方: python3 paint.py A"""
import sys, numpy as np, cv2
name = sys.argv[1]
import json
st = json.load(open(f'state_{name}.json'))
LEAF = {'spring': [[0.80, 0.55, 0.62], [0.88, 0.70, 0.74], [0.30, 0.48, 0.16]], 'autumn': [[0.70, 0.30, 0.08], [0.80, 0.52, 0.12], [0.55, 0.20, 0.06]]}[st['season']]
img = np.load(f'beauty_{name}.npy').astype(np.float32)
aux = np.load(f'aux_{name}.npy').astype(np.float32)
H, W = img.shape[:2]
rng = np.random.default_rng(11)
depth = aux[..., 0]; nrm = aux[..., 1:4]; alb = aux[..., 4:7]

def aces(x):
    A, B, C, D, E = 2.51, 0.03, 2.43, 0.59, 0.14
    y = np.clip((x * (A * x + B)) / (x * (C * x + D) + E), 0, 1)
    return np.where(y <= 0.0031308, 12.92 * y, 1.055 * np.power(y, 1 / 2.4) - 0.055)

ev = 7.0
photo = aces(img * ev)
photo8 = (np.clip(photo, 0, 1) * 255).astype(np.uint8)
photo8 = cv2.fastNlMeansDenoisingColored(cv2.cvtColor(photo8, cv2.COLOR_RGB2BGR), None, 4, 4, 5, 15)
photo8 = cv2.cvtColor(photo8, cv2.COLOR_BGR2RGB)
cv2.imwrite(f'photo_{name}.png', cv2.cvtColor(photo8, cv2.COLOR_RGB2BGR))

def fbm(h, w, base=6, octs=5, seed=0):
    r = np.random.default_rng(seed); out = np.zeros((h, w), np.float32); amp = 1; tot = 0
    for o in range(octs):
        f = base * 2 ** o
        g = r.random((int(h / w * f) + 2, f + 2)).astype(np.float32)
        out += amp * cv2.resize(g, (w, h), interpolation=cv2.INTER_CUBIC); tot += amp; amp *= 0.5
    return out / tot

sky = (depth <= 0) | (depth > 200)
sky = cv2.dilate(sky.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0

# ---- 1. color simplification (flat washes) ----
p = photo8.astype(np.float32) / 255
lab = cv2.cvtColor(photo8, cv2.COLOR_RGB2LAB)
ms = cv2.pyrMeanShiftFiltering(cv2.cvtColor(photo8, cv2.COLOR_RGB2BGR), 9, 22, maxLevel=2)
ms = cv2.cvtColor(ms, cv2.COLOR_BGR2RGB).astype(np.float32) / 255
# lift and brighten like transparent watercolor (pigment over white paper)
wash = 1 - (1 - ms) * 0.74
wash = np.clip(wash * np.array([1.02, 1.0, 0.97]), 0, 1)

# ---- 2. wet edges: darken pigment at region borders ----
gray = cv2.cvtColor((ms * 255).astype(np.uint8), cv2.COLOR_RGB2GRAY).astype(np.float32) / 255
edge = np.abs(gray - cv2.GaussianBlur(gray, (0, 0), 2.2))
edge = np.clip(edge * 6, 0, 1)[..., None]
wash = wash * (1 - 0.22 * edge)

# ---- 3. bleeding: wobble the wash a little (wet-in-wet) ----
dx = (fbm(H, W, 8, 4, 1) - 0.5) * 6; dy = (fbm(H, W, 8, 4, 2) - 0.5) * 6
mx, my = np.meshgrid(np.arange(W, dtype=np.float32), np.arange(H, dtype=np.float32))
wash = cv2.remap(wash.astype(np.float32), mx + dx, my + dy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)

# ---- 3b. tonal variation inside flat washes (pigment pools, warm light from the sun side) ----
pool = fbm(H, W, 5, 4, 12)[..., None]
wash = 1 - (1 - wash) * (0.85 + 0.35 * pool)
warm = np.clip(1 - mx / W, 0, 1)[..., None] * 0.06
wash = np.clip(wash + warm * np.array([0.9, 0.5, -0.2]), 0, 1)
# ---- 4. granulation + paper ----
gran = (fbm(H, W, 90, 3, 3) - 0.5)
wash = np.clip(wash - gran[..., None] * 0.10 * (1 - wash), 0, 1)

# sky: soft graded wash with a few blooms, paper left white near the horizon
yy = np.linspace(0, 1, H, dtype=np.float32)[:, None]
skycol = np.stack([0.62 + 0.28 * yy, 0.78 + 0.16 * yy, 0.93 + 0.05 * yy], -1) * np.ones((1, W, 1), np.float32)
bloom = fbm(H, W, 3, 4, 5)
skycol = 1 - (1 - skycol) * np.clip(0.55 + 0.9 * (bloom[..., None] - 0.5), 0.15, 1)
wash = np.where(sky[..., None], skycol, wash)

# ---- 5. linework from depth / normal discontinuities (thin, sepia, hand-wobbled) ----
d = np.where(sky, 400, depth).astype(np.float32)
ld = np.log1p(d); ld8 = (np.clip((ld - ld.min()) / (np.ptp(ld) + 1e-6), 0, 1) * 255).astype(np.uint8)
n8 = (np.clip((nrm + 1) / 2, 0, 1) * 255).astype(np.uint8)
e1 = cv2.Canny(cv2.GaussianBlur(ld8, (3, 3), 0), 6, 18)
e2 = cv2.Canny(cv2.GaussianBlur(cv2.cvtColor(n8, cv2.COLOR_RGB2GRAY), (3, 3), 0), 20, 55)
lines = np.maximum(e1, e2).astype(np.float32) / 255
# foliage mask from albedo (leaf pigments known from the state)
leafcols = np.array(LEAF, np.float32)
dist = np.min(np.linalg.norm(alb[..., None, :] - leafcols[None, None], axis=-1), axis=-1)
foliage = (dist < 0.06) & (~sky)
foliage = cv2.morphologyEx(foliage.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8)) > 0
lines[cv2.dilate(foliage.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0] = 0
lines[d > 45] *= 0.0
lines *= np.clip(1.2 - d / 45, 0.35, 1)
jx = (fbm(H, W, 20, 3, 7) - 0.5) * 2.0; jy = (fbm(H, W, 20, 3, 8) - 0.5) * 2.0
ink = cv2.remap(lines, mx + jx, my + jy, cv2.INTER_LINEAR)
ink = np.clip(cv2.GaussianBlur(ink, (0, 0), 0.55) * 1.4, 0, 1) * 0.62
inkcol = np.array([0.30, 0.22, 0.17], np.float32)

# ---- 5b. foliage as soft dabs of colour sampled from the physical render ----
fol = wash.copy()
canvas = np.zeros((H, W, 3), np.float32); wsum = np.zeros((H, W), np.float32)
ys, xs = np.nonzero(foliage)
if len(xs):
    idx = rng.choice(len(xs), size=min(2600, len(xs)), replace=False)
    for i in idx:
        x, y = int(xs[i]), int(ys[i]); c = p[y, x]
        c = 1 - (1 - c) * 0.75
        r = int(3 + rng.random() * 6)
        lay = np.zeros((H, W), np.uint8)
        cv2.circle(canvas, (x, y), r, tuple(float(v) for v in c), -1, lineType=cv2.LINE_AA)
    blur = cv2.GaussianBlur(canvas, (0, 0), 1.2)
    m = cv2.GaussianBlur(foliage.astype(np.float32), (0, 0), 2.5)[..., None]
    dab = np.where(blur.sum(-1, keepdims=True) > 0, blur, wash)
    wash = wash * (1 - m) + dab * m

# ---- 6. paper ----
paper_n = fbm(H, W, 200, 2, 9)
paper = np.stack([0.985, 0.975, 0.95], -1) * (0.97 + 0.03 * paper_n[..., None])
# deckled vignette: let the wash fade out to paper at the edges
cx, cy = (mx / W - 0.5) * 2, (my / H - 0.5) * 2
rr = np.sqrt((cx * 0.9) ** 2 + (cy * 1.05) ** 2) + (fbm(H, W, 6, 4, 10) - 0.5) * 0.35
fade = np.clip((1.12 - rr) / 0.22, 0, 1)[..., None]
painted = paper * (1 - fade) + wash * paper * fade + (1 - fade) * 0
painted = painted * (1 - ink[..., None] * fade) + inkcol * ink[..., None] * fade
painted = np.clip(painted, 0, 1)

def save(fn, a): cv2.imwrite(fn, cv2.cvtColor((np.clip(a, 0, 1) * 255).astype(np.uint8), cv2.COLOR_RGB2BGR))
save(f'paint_{name}.png', painted)
# separate layers for animation
save(f'wash_{name}.png', np.clip(paper * (1 - fade) + wash * paper * fade, 0, 1))
a = (np.clip(ink * fade[..., 0], 0, 1) * 255).astype(np.uint8)
rgba = np.dstack([np.full((H, W), int(inkcol[2] * 255), np.uint8), np.full((H, W), int(inkcol[1] * 255), np.uint8), np.full((H, W), int(inkcol[0] * 255), np.uint8), a])
cv2.imwrite(f'ink_{name}.png', rgba)
print('painted', name)
