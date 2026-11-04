"""世界の状態 -> 物理ベースの下地（色・深度・法線）を描く。
使い方: python3 build.py A|B spp"""
import sys, math, json, random
import mitsuba as mi
mi.set_variant('llvm_ad_rgb')
from mitsuba import ScalarTransform4f as T
import numpy as np

STATES = {
    'A': dict(form='box', roof='flat', finish='plaster', accent='wood', eave='south', carport=1,
              tree='spring', season='spring', sun=[-0.62, 0.36, 0.70]),
    'B': dict(form='box', roof='shed', finish='galva', accent='wood', eave='none', carport=2,
              tree='autumn', season='autumn', sun=[-0.70, 0.24, 0.66]),
}
name = sys.argv[1]; SPP = int(sys.argv[2]) if len(sys.argv) > 2 else 64
st = STATES[name]
W, H = 960, 540

S = {'type': 'scene'}
n = [0]
def key(p): n[0] += 1; return f'{p}{n[0]}'
def tex(fn, sc=1.0): return {'type': 'bitmap', 'filename': fn, 'to_uv': mi.ScalarTransform4f().scale([sc, sc, 1])}
def rough(c, a=0.5): return {'type': 'roughplastic', 'distribution': 'ggx', 'alpha': a, 'diffuse_reflectance': {'type': 'rgb', 'value': c}}
def rought(fn, sc, a=0.5): return {'type': 'roughplastic', 'distribution': 'ggx', 'alpha': a, 'diffuse_reflectance': tex(fn, sc)}
def metal(c, a=0.3): return {'type': 'roughconductor', 'material': 'none', 'alpha': a, 'specular_reflectance': {'type': 'rgb', 'value': c}}
def diff(c): return {'type': 'diffuse', 'reflectance': {'type': 'rgb', 'value': c}}

season_leaf = {'spring': [[0.80, 0.55, 0.62], [0.88, 0.70, 0.74], [0.30, 0.48, 0.16]],
               'autumn': [[0.70, 0.30, 0.08], [0.80, 0.52, 0.12], [0.55, 0.20, 0.06]]}[st['season']]
lawn_tint = {'spring': None, 'autumn': [0.30, 0.30, 0.14]}[st['season']]
M = {
    'plaster': rought('t_plaster.png', 1.0, 0.6),
    'galva': {'type': 'roughconductor', 'material': 'none', 'alpha': 0.28, 'specular_reflectance': {'type': 'rgb', 'value': [0.55, 0.57, 0.58]}},
    'galvawall': {'type': 'roughplastic', 'distribution': 'ggx', 'alpha': 0.5, 'int_ior': 1.25, 'diffuse_reflectance': {'type': 'rgb', 'value': [0.20, 0.23, 0.26]}},
    'wood': rought('t_wood.png', 1.0, 0.45),
    'dark': rough([0.05, 0.05, 0.055], 0.3),
    'frame': metal([0.12, 0.12, 0.12], 0.3),
    'concrete': rought('t_concrete.png', 2.0, 0.8),
    'gravel': {'type': 'diffuse', 'reflectance': tex('t_gravel.png', 3.0)},
    'lawn': ({'type': 'diffuse', 'reflectance': tex('t_lawn.png', 30.0)} if lawn_tint is None else diff(lawn_tint)),
    'asphalt': rought('t_asphalt.png', 6.0, 0.7),
    'soil': diff([0.20, 0.14, 0.09]),
    'interior': diff([0.75, 0.68, 0.58]),
    'floor': rough([0.45, 0.30, 0.18], 0.3),
    'trunk': diff([0.22, 0.16, 0.12]),
    'leaf0': diff(season_leaf[0]), 'leaf1': diff(season_leaf[1]), 'leaf2': diff(season_leaf[2]),
}
for k, v in M.items(): S['m_' + k] = dict(v, id=k)
S['m_glass'] = {'type': 'thindielectric', 'id': 'glass'}
wallmat = 'plaster' if st['finish'] == 'plaster' else 'galvawall'

def box(cx, cy, cz, sx, sy, sz, mat, emit=None, rot=None):
    tw = T().translate([cx, cy, cz])
    if rot: tw = tw.rotate(rot[0], rot[1])
    d = {'type': 'cube', 'to_world': tw.scale([sx / 2, sy / 2, sz / 2]), 'bsdf': {'type': 'ref', 'id': mat}}
    if emit: d['emitter'] = {'type': 'area', 'radiance': {'type': 'rgb', 'value': emit}}
    S[key('b')] = d

S['ground'] = {'type': 'rectangle', 'to_world': T().rotate([1, 0, 0], -90).scale([100, 100, 1]), 'bsdf': {'type': 'ref', 'id': 'lawn'}}
box(0, 0.03, 7.6, 30, 0.06, 1.6, 'concrete')
box(0, 0.01, 11.0, 60, 0.02, 5.0, 'asphalt')
cw = 3.2 if st['carport'] == 1 else 5.6
box(-4.0 - cw / 2, 0.04, 3.6, cw, 0.08, 6.4, 'concrete')
box(1.6, 0.03, 4.3, 9.0, 0.04, 2.2, 'gravel')
box(4.6, 0.05, 3.0, 1.8, 0.1, 1.2, 'soil')
for i in range(4): box(-2.4, 0.05, 6.4 - i * 0.75, 0.6, 0.06, 0.45, 'concrete')

X0, X1, D, H1, H2, t = -3.64, 3.64, 7.28, 2.9, 5.9, 0.18
# shell
box(0, H2 / 2, -D + t / 2, X1 - X0, H2, t, wallmat)
box(X0 + t / 2, H2 / 2, -D / 2, t, H2, D, wallmat)
box(X1 - t / 2, H2 / 2, -D / 2, t, H2, D, wallmat)
box(0, 0.42, -D / 2, X1 - X0 + 0.02, 0.44, D + 0.02, 'concrete')
box(0, H1, -D / 2 + 0.2, X1 - X0, 0.25, D - 0.4, 'plaster')
if st['roof'] == 'flat':
    box(0, H2 + 0.12, -D / 2, X1 - X0 + 0.02, 0.24, D + 0.02, wallmat)
    for (cx, cz, sx, sz) in [(0, -0.05, X1 - X0 + 0.04, 0.12), (0, -D + 0.05, X1 - X0 + 0.04, 0.12),
                             (X0 + 0.05, -D / 2, 0.12, D), (X1 - 0.05, -D / 2, 0.12, D)]:
        box(cx, H2 + 0.40, cz, sx, 0.32, sz, wallmat)
    box(0, H2 + 0.58, -D / 2, X1 - X0 + 0.08, 0.04, D + 0.08, 'frame')   # coping (flashing) - thin, continuous
else:
    # shed roof sloping down toward north (-z): south high
    ang = math.degrees(math.atan2(1.0, D))
    box(0, H2 + 0.5, -D / 2, X1 - X0 + 0.6, 0.08, D + 0.9, 'galva', rot=([1, 0, 0], -ang))
    # gable infill on sides (triangular look approximated by stepped wall)
    for side in (X0 + t / 2, X1 - t / 2):
        for k in range(8):
            zz = -D + (k + 0.5) * D / 8; hh = (k + 0.5) / 8 * 1.0
            box(side, H2 + hh / 2, zz, t, hh, D / 8 + 0.01, wallmat)
    box(0, H2 + 0.5, -0.09, X1 - X0, 1.0, t, wallmat)

# interior glow
box(0, 0.68, -D / 2, X1 - X0 - 0.4, 0.04, D - 0.4, 'floor')
box(0, H1 - 0.15, -1.6, 2.6, 0.02, 0.8, 'interior', emit=[7, 5, 3])
box(-1.6, H2 - 0.2, -1.6, 1.2, 0.02, 0.6, 'interior', emit=[5, 3.6, 2.1])
box(0, 1.5, -D + 0.4, X1 - X0 - 0.5, 1.6, 0.1, 'interior')
box(1.4, 1.05, -3.0, 1.8, 0.7, 0.9, 'wood')
# south facade panels around openings
def panel(x0, x1, y0, y1, mat=None):
    box((x0 + x1) / 2, (y0 + y1) / 2, -t / 2, x1 - x0, y1 - y0, t, mat or wallmat)
y2a = H1 + 0.12
for (a, b, c, d_) in [(X0, -2.4, 0.64, y2a), (2.0, 2.6, 0.64, y2a), (3.4, X1, 0.64, y2a), (-2.4, 2.0, 2.75, y2a),
                      (2.6, 3.4, 2.75, y2a), (-2.4, 2.0, 0.64, 0.78), (X0, -3.0, y2a, H2), (-0.2, 1.6, y2a, H2),
                      (2.6, X1, y2a, H2), (-3.0, -0.2, y2a, 3.9), (-3.0, -0.2, 5.0, H2), (1.6, 2.6, y2a, 4.2), (1.6, 2.6, 5.0, H2)]:
    panel(a, b, c, d_)
if st['finish'] == 'galva':   # vertical standing-seam lines
    holes = [(-2.4, 2.0, 0.78, 2.75), (-3.0, -0.2, 3.9, 5.0), (1.6, 2.6, 4.2, 5.0), (2.0, X1, 0.64, 2.95)]
    for i in range(int((X1 - X0) / 0.35)):
        x = X0 + 0.2 + i * 0.35
        segs = [(0.64, H2)]
        for (a, b, c, d_) in holes:
            if a - 0.03 < x < b + 0.03:
                segs = [s2 for (y0, y1) in segs for s2 in ((y0, min(y1, c)), (max(y0, d_), y1)) if s2[1] - s2[0] > 0.05]
        for (y0, y1) in segs:
            box(x, (y0 + y1) / 2, 0.012, 0.02, y1 - y0, 0.02, 'galva')
if st['accent'] == 'wood':
    for i in range(int((X1 - 2.0) / 0.07)):
        x = 2.02 + i * 0.07
        if 2.58 < x < 3.42: continue
        box(x, 1.75, 0.03, 0.045, 2.1, 0.03, 'wood')
def window(x0, x1, y0, y1, mull=1):
    S[key('g')] = {'type': 'rectangle', 'to_world': T().translate([(x0 + x1) / 2, (y0 + y1) / 2, -0.06]).scale([(x1 - x0) / 2, (y1 - y0) / 2, 1]),
                   'bsdf': {'type': 'ref', 'id': 'glass'}}
    f = 0.05
    for (cx, cy, sx, sy) in [((x0 + x1) / 2, y0 + f / 2, x1 - x0, f), ((x0 + x1) / 2, y1 - f / 2, x1 - x0, f),
                             (x0 + f / 2, (y0 + y1) / 2, f, y1 - y0), (x1 - f / 2, (y0 + y1) / 2, f, y1 - y0)]:
        box(cx, cy, -0.05, sx, sy, 0.08, 'frame')
    for k in range(1, mull + 1):
        box(x0 + (x1 - x0) * k / (mull + 1), (y0 + y1) / 2, -0.05, 0.04, y1 - y0, 0.08, 'frame')
window(-2.4, 2.0, 0.78, 2.75, 2); window(-3.0, -0.2, 3.9, 5.0, 1); window(1.6, 2.6, 4.2, 5.0, 0)
box(3.0, 1.7, -0.08, 0.8, 2.1, 0.06, 'wood')
box(3.33, 1.7, -0.02, 0.03, 0.5, 0.04, 'frame')
if st['eave'] == 'south':
    box(-0.2, H1 + 0.05, 0.55, 5.4, 0.08, 1.1, 'galva')
box(3.0, 2.92, 0.4, 1.3, 0.06, 0.8, wallmat)
box(3.55, 2.2, 0.04, 0.08, 0.16, 0.05, 'interior', emit=[8, 5.6, 3])
box(X1 - 0.06, H2 / 2, 0.06, 0.06, H2, 0.06, 'galva')
# carport
x0c, x1c = -4.0 - cw + 0.2, -4.2
for px in (x0c, x1c):
    for pz in (1.2, 5.8): box(px, 1.25, pz, 0.08, 2.5, 0.08, 'frame')
box((x0c + x1c) / 2, 2.52, 3.5, cw, 0.06, 5.0, 'galva')
# trees
random.seed(7)
def tree(x, z, h, r, nl=1300):
    box(x, h * 0.35, z, 0.09, h * 0.7, 0.09, 'trunk')
    for i in range(nl):
        u = random.random() * 6.283; v = math.acos(2 * random.random() - 1); k = random.random() ** 0.33
        S[key('l')] = {'type': 'sphere', 'center': [x + math.sin(v) * math.cos(u) * r * k, h * 0.72 + math.cos(v) * r * 0.85 * k,
                                                    z + math.sin(v) * math.sin(u) * r * k], 'radius': 0.03 + random.random() * 0.05,
                       'bsdf': {'type': 'ref', 'id': random.choice(['leaf0', 'leaf1', 'leaf2'])}}
tree(7.9, 0.6, 5.0, 1.4); tree(-1.2, 6.3, 3.0, 0.8, 800)
box(14, 2.8, -7, 8, 5.6, 7, 'plaster')
S['sky'] = {'type': 'sunsky', 'to_world': T().rotate([1, 0, 0], -90), 'sun_direction': st['sun'], 'turbidity': 3.2}
S['sensor'] = {'type': 'perspective', 'fov': 50, 'fov_axis': 'x',
               'to_world': T().look_at(origin=[11.5, 1.35, 10.8], target=[-0.8, 2.9, -2.2], up=[0, 1, 0]),
               'film': {'type': 'hdrfilm', 'width': W, 'height': H, 'rfilter': {'type': 'gaussian'}},
               'sampler': {'type': 'independent', 'sample_count': SPP}}

# beauty pass
S['integrator'] = {'type': 'path', 'max_depth': 7}
scene = mi.load_dict(S)
img = np.array(mi.render(scene, spp=SPP))
np.save(f'beauty_{name}.npy', img)
# aux pass: depth + normals + albedo (cheap)
S['integrator'] = {'type': 'aov', 'aovs': 'dd:depth,nn:sh_normal,aa:albedo'}
scene = mi.load_dict(S)
aux = np.array(mi.render(scene, spp=8))
np.save(f'aux_{name}.npy', aux)
json.dump(st, open(f'state_{name}.json', 'w'), ensure_ascii=False)
print('done', name, img.shape, aux.shape)
