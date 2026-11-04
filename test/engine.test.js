// エンジンの検算：16世界の数字、建蔽率、ローン、自由回答の取引（simulate）、世界の分かれ方
import test from 'node:test';
import assert from 'node:assert/strict';
import * as Y from '../src/engine/engine.js';

const H = Y.HOUSEHOLDS.t2;

test('ローン：返済額と審査の上限（審査金利3.5%、35年、返済負担率35%）', () => {
  // 1億円（10,000万円）を3.5%・35年で借りると、月々 約41.3万円
  assert.equal(Math.round(Y.payment(10000, 0.035) * 10), 413);
  // 型2（年収800万）の上限は約5,650万の目安 → 10万円単位で切り捨て
  const lim = Y.loanLimit(H);
  assert.ok(lim >= 5600 && lim <= 5700, `上限 ${lim}`);
  assert.equal(Y.loanCheck(H, lim).ok, true);
  assert.equal(Y.loanCheck(H, lim + 100).ok, false);
});

test('敷地：建蔽率60%（約55坪＝181.8㎡ → 上限109.1㎡）', () => {
  assert.equal(Y.SITE.area, 181.8);
  const ok = Y.coverageCheck({ tsubo: 34, floor1Tsubo: 17, carport: true, shed: true });
  assert.equal(ok.limit, 109.1);
  assert.equal(ok.ok, true);
  // 1階25坪＋カーポート2台＋物置は超える（06の6章の例：合計 約117㎡）
  const ng = Y.coverageCheck({ tsubo: 34, floor1Tsubo: 25, carport: true, shed: true });
  assert.equal(ng.ok, false);
  assert.ok(Math.abs(ng.total - 117) < 1, `合計 ${ng.total}`);
});

test('見積の見せ方：会社が違っても、エンジンの中の総額は全部の項目を含む', () => {
  const spec = Y.baseSpec(H);
  for (const id of 'ABCD') {
    const q = Y.quote(spec, id, true);
    assert.equal(q.real, Math.round(q.lines.reduce((s, l) => s + l.v, 0)));
    assert.ok(q.cover <= q.real);
  }
  // C は総額で見せる（表紙＝総額）。A は本体中心なので表紙が小さく見える
  assert.equal(Y.quote(spec, 'C', true).cover, Y.quote(spec, 'C', true).real);
  assert.ok(Y.quote(spec, 'A', true).cover < Y.quote(spec, 'C', true).cover);
});

test('16の世界：2の4乗＝16、番号は1〜16で重ならない', () => {
  const ws = Y.allWorlds({ chosen: [0, 1, 1, 0] });
  assert.equal(ws.length, 16);
  assert.deepEqual(ws.map(w => w.no).sort((a, b) => a - b), Array.from({ length: 16 }, (_, i) => i + 1));
  for (const w of ws) {
    assert.equal(w.money.total, Y.round(w.money.land + w.money.building + w.money.add, 1));
    if (w.increase) assert.ok(w.money.add >= w.increase);
    assert.equal(w.principal, Y.round(w.total - H.saveHouse, 1));
  }
});

test('16の世界：同じ種なら同じ結果（決定論）', () => {
  const a = Y.allWorlds({ seed: 7 }), b = Y.allWorlds({ seed: 7 });
  assert.deepEqual(a.map(w => [w.total, w.events]), b.map(w => [w.total, w.events]));
});

test('選ばれなかった世界線は 1 → 3 → 7 → 15 と増える。分かれた時点の状態を引き継ぐ', () => {
  let p = Y.newWorld({ household: H }), o = [];
  const counts = [];
  Y.DECISIONS.forEach((d, i) => { ({ player: p, others: o } = Y.branchAll(p, o, d, i % 2 ? 'b' : 'a')); counts.push(o.length); });
  assert.deepEqual(counts, [1, 3, 7, 15]);
  const nos = [p, ...o].map(w => Y.worldNo(w.bits));
  assert.equal(new Set(nos).size, 16);
  // 第一の分岐で A を選んだ兄弟は、第一の分岐の前の状態（会社以外）をそのまま持つ
  const sib = o.find(w => w.bits[0] === 1);
  assert.equal(sib.company, 'A');
  assert.equal(sib.household, p.household);
});

test('自由回答の取引：借入を少し増やして、南の大きな窓だけトリプルガラスに', () => {
  let p = Y.newWorld({ household: H }), o = [];
  ({ player: p, others: o } = Y.branchAll(p, o, Y.DECISIONS[0], 'a'));
  ({ player: p, others: o } = Y.branchAll(p, o, Y.DECISIONS[1], 'b'));
  const r = Y.simulate(p, Y.DECISIONS[2], { side: 'b', spec: { window: 'triple' }, borrow: 'cover' });
  const tri = Y.COMPANIES.C.triple, ext = Y.COMMON.exterior - Y.COMMON.exteriorMin; // 右の札は外構まで仕上げる
  assert.equal(r.quote.diff, tri + ext);
  assert.equal(r.loan.diff, tri + ext);
  assert.equal(r.schedule.addDays, 7);
  assert.equal(r.verdict, '条件付き');
  assert.ok(r.warmthAfter.level > r.warmthBefore.level);
  // 仮計算は世界を変えない
  assert.equal(p.spec.window, 'standard');
  // 確定すると、選んだ道の中身になる（木は増えない）
  ({ player: p, others: o } = Y.branchAll(p, o, Y.DECISIONS[2], r.proposal));
  assert.equal(p.spec.window, 'triple');
  assert.equal(p.third, 'D3');
  assert.equal(o.length, 7);
});

test('自由回答の取引：扱えない項目は捨て、判定は「確認が足りない」', () => {
  const p = Y.newWorld({ household: H });
  const r = Y.simulate(p, Y.DECISIONS[2], { side: 'a', spec: { pool: true, window: 'quad' } });
  assert.equal(r.errors.length, 2);
  assert.equal(r.verdict, '確認が足りない');
});

test('自由回答の取引：審査の上限を超えると「いまは難しい」', () => {
  const p = Y.newWorld({ household: Y.HOUSEHOLDS.t1, company: 'A' });
  p.spec.tsubo = 40; p.spec.floor1Tsubo = 20;
  const r = Y.simulate(p, Y.DECISIONS[2], { side: 'b', spec: { window: 'triple', kitchen: true }, borrow: 'cover' });
  assert.equal(r.loan.ok, false);
  assert.equal(r.verdict, 'いまは難しい');
});

test('お金の札：契約後は「土地＋契約金額＋増工」', () => {
  let p = Y.newWorld({ household: H }), o = [];
  Y.DECISIONS.slice(0, 3).forEach(d => ({ player: p, others: o } = Y.branchAll(p, o, d, 'a')));
  const before = Y.money(p);
  assert.equal(before.contract, before.building);
  ({ player: p, others: o } = Y.branchAll(p, o, Y.DECISIONS[3], 'b'));
  p.electric.push('tag_tv_wall');
  const m = Y.money(p);
  assert.equal(m.add, Y.round(48 + 42 + 4.8, 1));
  assert.equal(m.total, Y.round(m.land + m.contract + m.add, 1));
  assert.equal(m.loan, Y.round(m.total - m.self, 1));
});

test('外形：要望がなければ、会社ごとの提案されやすい形（A・Bは寄棟、Cはキューブ、Dは招き屋根）', () => {
  for (const [co, roof] of [['A', 'hip'], ['B', 'hip'], ['C', 'cube'], ['D', 'mane']]) {
    const w = Y.newWorld({ household: H });
    Y.choose(w, Y.decisions([co, co === 'A' ? 'C' : 'A'])[0], 'a');
    assert.equal(w.spec.roof, roof);
  }
  // 第二の分岐点で「外形を変える」と、その会社のもう一つの形になる
  const w = Y.newWorld({ household: H });
  Y.choose(w, Y.DECISIONS[0], 'a'); Y.choose(w, Y.DECISIONS[1], 'b');
  assert.equal(w.spec.roof, Y.COMPANIES.C.altRoof);
  assert.match(w.labels[1], /切妻/);
});
