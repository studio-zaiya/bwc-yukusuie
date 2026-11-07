// 間取りの絵 v1（LAYOUT_RULES_v1）の検査：決まり（LDK は南・玄関は東・水回りは北）、2社の絵の違い、データを書き換えないこと
import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutOf, checkLayout, drawZoning, wantsOf } from '../src/web/zoning.js';

const room = (name, size, floor) => ({ name, size, floor, near: [] });
const BASE = [room('LDK', 16, 1), room('浴室', 3, 1), room('洗面・脱衣', 3, 1), room('トイレ', 3, 1), room('玄関収納', 3, 1), room('主寝室', 6, 2), room('子ども部屋', 4.5, 2), room('子ども部屋', 4.5, 2), room('トイレ', 3, 2)];
const PLANS = {
  標準: { title: '標準', rooms: BASE },
  畳: { title: '畳', rooms: [...BASE, room('和室', 4.5, 1)] },
  書斎と収納: { title: '書斎', rooms: [...BASE, room('書斎', 3, 2), room('ファミリークローゼット', 4.5, 2), room('パントリー', 3, 1)] },
  水回りが多い: { title: '水回り', rooms: [...BASE, room('洗面', 3, 1), room('ランドリールーム', 3, 1), room('トイレ', 3, 1)] },
  一階に主寝室: { title: '主寝室', rooms: BASE.map(r => r.name === '主寝室' ? { ...r, floor: 1 } : r) },
  子ども三人: { title: '子3', rooms: [...BASE, room('子ども部屋', 6, 2), room('書斎', 3, 2)] },
  変わった要望: { title: '変', rooms: [...BASE, room('中庭', 8, 1), room('プール', 10, 1)] },
};

test('間取りの絵：どの会社・どの案でも、決まり（LDK は南・玄関は東・水回りは北・2階に主寝室）を守る', () => {
  for (const [k, plan] of Object.entries(PLANS)) for (const co of 'ABCD') {
    assert.deepEqual(checkLayout(layoutOf(plan, { co })), [], `${k} / ${co}`);
    const svg = drawZoning(plan, { co }), svg2 = drawZoning(plan, { co, stack: true });
    assert.match(svg, /^<svg[\s\S]*<\/svg>$/); assert.match(svg2, /^<svg[\s\S]*<\/svg>$/);
    assert.ok(!/NaN|undefined/.test(svg + svg2), `${k} / ${co}：NaN か undefined が入った`);
    const L = layoutOf(plan, { co });
    assert.ok(L.f1.rooms.some(r => r.n === '階段') && L.f2.rooms.some(r => r.n === '階段'), '1階と2階の両方に階段（ホール階段）がある');
    assert.ok(!L.f2.rooms.some(r => r.n === 'ホール' && r.y === 0 && r.x === 6), '2階の東の端を行き止まりのホールにしない');
  }
});

test('間取りの絵：同じ案でも、2社を並べると見た目が違う（型か左右が変わる）', () => {
  const sig = (plan, co) => JSON.stringify(layoutOf(plan, { co }).f1.rooms.filter(r => r.z === 'main' || r.z === 'tatami').map(r => [r.n, r.x, r.y, r.w]));
  for (const plan of Object.values(PLANS)) {
    const L0 = layoutOf(plan, { co: 'A' }); if (L0.p.master1f || L0.fallback) continue; // 1階に主寝室の型と、組めないときの基本形は1つだけ
    for (const [a, b] of [['A', 'B'], ['A', 'C'], ['A', 'D'], ['B', 'C'], ['B', 'D'], ['C', 'D']]) assert.notEqual(sig(plan, a), sig(plan, b), `${plan.title}：${a} と ${b}`);
  }
});

test('間取りの絵：型の選び方（畳 → 田の字、1階に主寝室 → 縦長の LDK、組めない要望 → 基本形と注記）', () => {
  assert.equal(layoutOf(PLANS.畳, { co: 'B' }).p.type, 'tanoji');
  assert.equal(layoutOf(PLANS.標準, { co: 'B' }).p.type, 'straight');
  assert.equal(layoutOf(PLANS.標準, { co: 'A' }).p.type, 'L');
  assert.ok(layoutOf(PLANS.一階に主寝室, { co: 'C' }).p.master1f);
  const odd = layoutOf(PLANS.変わった要望, { co: 'C' });
  assert.ok(odd.fallback);
  assert.match(drawZoning(PLANS.変わった要望, { co: 'C' }), /ご要望のすべては、この図には入れきれていません/);
});

test('間取りの絵：もう一方の案にある部屋は「図に入らなかった要望」に出る。案のデータは書き換えない', () => {
  const wants = wantsOf([PLANS.書斎と収納, PLANS.標準]);
  assert.deepEqual(wants.sort(), ['パントリー', '書斎'].sort());
  const before = JSON.stringify(PLANS.標準);
  const L = layoutOf(PLANS.標準, { co: 'D', wants });
  assert.ok(L.missing.includes('書斎') && L.missing.includes('パントリー'));
  assert.equal(layoutOf(PLANS.書斎と収納, { co: 'C', wants }).missing.length, 0);
  assert.equal(JSON.stringify(PLANS.標準), before, '案のデータを書き換えた');
});

test('間取りの絵：リビング階段・吹き抜けの部屋がある案は、ホール階段で描いて注記する', () => {
  const plan = { rooms: [...BASE, room('吹き抜け', 4.5, 2)] };
  const L = layoutOf(plan, { co: 'C' });
  assert.ok(!L.fallback);
  assert.ok(L.missing.some(t => /リビング階段・吹き抜け/.test(t)));
});

