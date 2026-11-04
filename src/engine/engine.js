/* ゆくすいえ　計算エンジン（v0.3、ESモジュール。画面と Worker の両方から同じものを読む）
 * 大原則：言葉はClaude、数字はコード。金額・日数・面積・判定は、すべてここで出す。
 * 単位：金額は万円、面積は㎡（坪は 3.30579㎡）、日数は日。
 * 数字はすべて仮置き（docs/06_engine.md に準拠）。app/engine.js（試作 v0.1）からの移植と拡張。
 */
export const VERSION = 'engine-0.5';
export const TSUBO = 3.30579;
export const round = (v, d = 0) => { const k = 10 ** d; return Math.round(v * k) / k; };
const clone = o => JSON.parse(JSON.stringify(o));

// ---- 乱数（種を固定すると、同じ結果になる）----
export function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function hashStr(str) { let h = 2166136261; for (const c of String(str)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

// ---- 世帯（型2を仮採用）----
export const HOUSEHOLDS = {
  t1: { id: 't1', story: '共働き、子ども2人。予算を抑えながら、毎日の暮らしを良くしたい。', income: 680, takeHome: 520, bonus: 80, saveHouse: 200, saveKeep: 150, invest: 50, living: 24, area: [31, 33] },
  t2: { id: 't2', story: '共働き、子ども2人。性能も間取りも、そこそこ欲張りたい。', income: 800, takeHome: 610, bonus: 110, saveHouse: 350, saveKeep: 200, invest: 200, living: 27, area: [33, 35] },
  t3: { id: 't3', story: '共働き、子ども2人。将来の働き方の変化にも備えたい。', income: 980, takeHome: 740, bonus: 140, saveHouse: 500, saveKeep: 250, invest: 400, living: 31, area: [34, 36] },
};
export const monthlyTakeHome = h => round((h.takeHome - h.bonus) / 12, 1);

// ---- ローン ----
export const RATE = { screen: 0.035, variable: 0.012, fixed: 0.038 };
export function payment(principal, annualRate, years = 35) {
  const r = annualRate / 12, n = years * 12;
  return principal * r / (1 - Math.pow(1 + r, -n));
}
export function loanLimit(h, ratio = 0.35) { // 審査の上限（返済負担率）
  const perMan = payment(1, RATE.screen) * 12;
  return Math.floor(h.income * ratio / perMan / 10) * 10;
}
export function loanCheck(h, principal) {
  const yearly = payment(principal, RATE.screen) * 12;
  const ratio = yearly / h.income;
  const limit = loanLimit(h);
  return { principal: Math.round(principal), ratio: round(ratio * 100, 1), ok: Math.round(principal) <= limit, limit, monthly: round(payment(principal, RATE.variable), 2) };
}

// ---- 敷地 ----
export const SITE = { tsubo: 55, price: 1350, coverage: 0.60, far: 1.50, waterFee: 47 };
SITE.area = round(SITE.tsubo * TSUBO, 1);
export const landCost = () => SITE.price + SITE.waterFee;
export function coverageCheck(spec) {
  const house = spec.floor1Tsubo * TSUBO;
  const carport = spec.carport ? 31.1 : 0; // 2台・緩和後の簡略値
  const shed = spec.shed ? 3.3 : 0;
  const total = house + carport + shed;
  const limit = SITE.area * SITE.coverage;
  const floorTotal = spec.tsubo * TSUBO, farLimit = SITE.area * SITE.far;
  return { house: round(house, 1), extra: round(carport + shed, 1), total: round(total, 1), limit: round(limit, 1), ok: total <= limit && floorTotal <= farLimit, floor: round(floorTotal, 1), farLimit: round(farLimit, 1) };
}

// ---- 住宅会社（型）。色は付けない。形だけで区別 ----
export const COMPANIES = {
  A: { id: 'A', name: 'Aハウス', shape: 'square', kind: '大手ハウスメーカー', staff: '高橋', staffRole: '営業', tsubo: 92, futai: 230, kitchen: 90, triple: 52, insul: 6, equip: 1, style: 'body', groundTiming: '契約後', speed: 1.0, gable: 60, roof: 'hip', altRoof: 'cube' },
  B: { id: 'B', name: 'Bハウス', shape: 'triangle', kind: 'ローコスト・規格', staff: '小林', staffRole: '営業', tsubo: 65, futai: 220, kitchen: 110, triple: 70, insul: 5, equip: 0, style: 'options', groundTiming: '契約後', speed: 0.8, gable: 45, roof: 'hip', altRoof: 'gable' },
  C: { id: 'C', name: 'Cデザイン', shape: 'circle', kind: '作り込み型の工務店', staff: '佐々木', staffRole: '設計', tsubo: 84, futai: 250, kitchen: 70, triple: 58, insul: 6, equip: 0, style: 'total', groundTiming: '契約前', speed: 1.3, gable: 55, roof: 'cube', altRoof: 'gable' },
  D: { id: 'D', name: 'D工務店', shape: 'hex', kind: '身軽型の工務店', staff: '森', staffRole: '社長', tsubo: 75, futai: 200, kitchen: 60, triple: 64, insul: 5, equip: 0, style: 'lump', groundTiming: '曖昧', speed: 0.9, gable: 50, roof: 'mane', altRoof: 'cube' },
};
// 断熱等級ごとの外皮平均熱貫流率（UA値、W/㎡K、6地域の基準値の目安）
export const UA = { 4: 0.87, 5: 0.6, 6: 0.46, 7: 0.26 };
export const ROOF_JA = { flat: '箱型', cube: '軒ゼロのキューブ', hip: '寄棟', gable: '切妻', mane: '招き屋根' };
export const pitched = r => ['gable', 'hip', 'mane'].includes(r);
export const COMMON = { exterior: 180, exteriorMin: 40, lighting: 60, aircon: 50, ground: 120, ground_range: [80, 150], misc: 250 };

// ---- 仕上げ（コーディネート）と電気の単価（仮置き。design/v3/parts/P4a・P4b と同じ値）----
export const FINISH = {
  wall: [
    { id: 'std', label: '窯業系サイディング（標準）', v: 0, colors: [['白', '#F2EFE8'], ['グレージュ', '#CFC5B5'], ['チャコール', '#55595E']] },
    { id: 'galva', label: 'ガルバリウム鋼板', v: 48, colors: [['シルバー', '#B9BEC3'], ['ブラック', '#2E3236'], ['ネイビー', '#34445A']] },
    { id: 'nuri', label: '塗り壁', v: 62, colors: [['白', '#F6F3EC'], ['生成り', '#EADFC9'], ['グレー', '#A9A8A3']] },
  ],
  floor: [{ id: 'std', label: 'シート貼りフローリング（標準）', v: 0, sw: '#D9B98E' }, { id: 'oak', label: 'オークの挽き板', v: 42, sw: '#C49A66' }, { id: 'pine', label: '無垢のパイン', v: 28, sw: '#E2C28E' }],
  inner: [{ id: 'vinyl', label: 'ビニールクロス（標準）', v: 0, sw: '#F7F6F2' }, { id: 'eco', label: '自然素材クロス', v: 18, sw: '#F1ECE1' }, { id: 'nuri', label: '塗り壁', v: 45, sw: '#ECE6DA' }],
};
// 電気：会社ごとの標準仕様と、要望の候補（data/content/electrical.json と同じ id）。金額はエンジンが持つ（仮置き）
export const ELECTRIC = {
  standardBy: {
    A: ['照明：LDKはダウンライト、各部屋はシーリングライト', 'コンセント：LDK 6か所、各部屋 2か所', 'スイッチ：各部屋の入口の横', 'エアコン：専用回路 4か所（本体は別途）', 'テレビ：LDK・主寝室に端子', 'インターネット：光回線の引き込み、LDKに配管', 'プレート：標準品（白）'],
    B: ['照明：各部屋に照明の取り付け口のみ（器具は別途）', 'コンセント：LDK 4か所、各部屋 2か所', 'スイッチ：各部屋の入口の横', 'エアコン：専用回路 3か所', 'テレビ：LDKに端子 1か所', 'インターネット：光回線の引き込みと電源 1か所', 'プレート：標準品'],
    C: ['照明：ダウンライト（子ども部屋のみリモコン付きシーリングライト）', 'コンセント：LDK 4か所、その他の部屋 2か所ずつ', 'スイッチ：生活の動線に合わせた位置', 'エアコン：専用回路と配管の穴の位置を図面で指定', 'テレビ：地上波 1か所・床置き', 'インターネット：光回線の引き込みと電源 1か所', 'プレート：標準品'],
    D: ['照明：現場で相談', 'コンセント：各部屋 2か所くらい', 'スイッチ：入口の横', 'エアコン：取り付けは家電量販店で', 'テレビ：LDKに端子', 'インターネット：引き込みのみ', 'プレート：標準品'],
  },
  options: [
    { id: 'tag_tv_wall', label: 'テレビを壁掛けに（下地と配線）', v: 4.8 },
    { id: 'tag_lan', label: '有線LANを増やしたい', v: 2.5 },
    { id: 'tag_outdoor', label: '外にコンセントがほしい', v: 1.6 },
    { id: 'tag_ev', label: '電気自動車の充電', v: 9.5 },
    { id: 'tag_hide_aircon', label: 'エアコンを隠したい（ルーバー）', v: 6.5 },
    { id: 'tag_indirect', label: '間接照明', v: 12 },
    { id: 'tag_dimmer', label: '調光', v: 3.5 },
    { id: 'tag_more_outlets', label: 'コンセント／スイッチを増やしたい', v: 4 },
    { id: 'tag_owner_lights', label: '照明を施主支給', v: 0 },
    { id: 'tag_solar', label: '太陽光・蓄電池', v: 120 },
    { id: 'tag_owner_aircon', label: 'エアコンを施主支給', v: 0 },
    { id: 'tag_remote', label: 'リモートワークに対応してほしい', v: 6 },
    { id: 'tag_toggle', label: 'トグルスイッチ', v: 2.5 },
  ],
};
ELECTRIC.standard = ELECTRIC.standardBy.C;
// 電気の一覧を部屋ごとに（受け入れ基準4）。標準仕様の文（素材集）を部屋に振り分け、どの家にもある水回り・外まわりの基本を足す【Claude】
export const ELECTRIC_ROOMS = ['LDK', 'キッチン', '洗面', '寝室', '外まわり'];
const ELEC_KIND = [['照明', 'light'], ['コンセント', 'outlet'], ['スイッチ', 'switch'], ['エアコン', 'aircon'], ['テレビ', 'tv'], ['インターネット', 'net'], ['プレート', 'switch']];
export const ELECTRIC_OPT_ROOM = { tag_tv_wall: ['LDK', 'tv'], tag_lan: ['寝室', 'net'], tag_outdoor: ['外まわり', 'outlet'], tag_ev: ['外まわり', 'car'], tag_hide_aircon: ['LDK', 'aircon'], tag_indirect: ['LDK', 'light'], tag_dimmer: ['LDK', 'light'], tag_more_outlets: ['LDK', 'outlet'], tag_owner_lights: ['LDK', 'light'], tag_solar: ['外まわり', 'sun'], tag_owner_aircon: ['LDK', 'aircon'], tag_remote: ['寝室', 'net'], tag_toggle: ['LDK', 'switch'] };
export function electricRooms(co) {
  const R = Object.fromEntries(ELECTRIC_ROOMS.map(r => [r, []]));
  for (const t of ELECTRIC.standardBy[co] || ELECTRIC.standard) {
    const [head, body = ''] = t.split('：');
    if (/プレート/.test(head)) continue;
    const icon = (ELEC_KIND.find(([k]) => head.includes(k)) || [, 'outlet'])[1];
    const segs = body.split('、');
    const bed = segs.filter(x => /各部屋|その他の部屋|子ども部屋|主寝室/.test(x)), ldk = segs.filter(x => !bed.includes(x));
    if (ldk.length) R.LDK.push({ icon, text: `${head}：${ldk.join('、')}` });
    else if (/照明/.test(head)) R.LDK.push({ icon, text: `${head}：${body.replace(/（.*）/, '')}` });
    for (const x of bed) R['寝室'].push({ icon, text: `${head}：${x.replace(/^LDK・/, '')}` });
  }
  R['キッチン'].push({ icon: 'outlet', text: '専用コンセント：冷蔵庫・電子レンジ・食洗機' }, { icon: 'outlet', text: 'IH・換気扇の電源' });
  R['洗面'].push({ icon: 'outlet', text: '洗濯機の専用コンセント' }, { icon: 'light', text: '洗面台の照明とコンセント' });
  R['外まわり'].push({ icon: 'light', text: '玄関の照明' }, { icon: 'switch', text: 'インターホン' });
  return R;
}
export function finishCost(f = {}) {
  const pick = (k, id) => (FINISH[k].find(x => x.id === id) || FINISH[k][0]);
  return pick('wall', f.wall).v + pick('floor', f.floor).v + pick('inner', f.inner).v;
}
// 電気の要望の言葉 → 項目（コード）
export const ELECTRIC_WORDS = { tag_tv_wall: /テレビ|壁掛け/, tag_lan: /LAN|有線/, tag_outdoor: /外.*コンセント|防水|屋外/, tag_ev: /充電|EV|電気自動車/, tag_hide_aircon: /エアコン.*(隠|ルーバー|見えな)|ルーバー/, tag_indirect: /間接照明/, tag_dimmer: /調光/, tag_more_outlets: /(コンセント|スイッチ).*(増|多)/, tag_owner_lights: /照明.*施主支給|照明を(自分|持ち込)/, tag_solar: /太陽光|蓄電池/, tag_owner_aircon: /エアコン.*(施主支給|自分で|持ち込)/, tag_remote: /リモート|在宅|テレワーク|仕事部屋/, tag_toggle: /トグル/ };
export const electricOf = text => Object.entries(ELECTRIC_WORDS).filter(([, re]) => re.test(String(text))).map(([id]) => id);
// 伝えていたのに入っていなかったとき、会社と担当者の力量で扱いが分かれる（議事録の有無が効く）
export function missedPolicy(coId, skill = 0.5) {
  if (coId === 'C') return { kind: 'free', rate: 0, label: '伝えていただいていたのに、反映できていませんでした。こちらで直します（無償）' };
  if (coId === 'A') return { kind: 'half', rate: 0.5, label: '記録を確認しました。差額は半分、こちらで持ちます' };
  if (coId === 'D' && skill < 0.5) return { kind: 'add', rate: 1, label: '記録が残っていないので、追加になってしまいます' };
  return { kind: 'add', rate: 1, label: '打ち合わせの記録に残っていなかったので、追加になります' };
}
export function electricCost(ids = []) { return round(ids.reduce((s, id) => s + (ELECTRIC.options.find(o => o.id === id)?.v || 0), 0), 1); }

// ---- 台帳 層①：仕様・数量 ----
export function baseSpec(h) {
  const tsubo = h ? h.area[1] - 1 : 34;
  return { tsubo, floor1Tsubo: Math.ceil(tsubo / 2), form: 'box', roof: 'flat', eave: 'south', bigWindow: true, window: 'standard', kitchen: false, exterior: 'min', carport: true, shed: true, aircon: 4 };
}
// 仕様の変更として受け付ける項目（Claude の「変更の提案」はこの範囲だけ）
export const SPEC_SCHEMA = {
  window: ['standard', 'triple'], kitchen: [true, false], exterior: ['full', 'min', 'none'], roof: ['flat', 'gable', 'hip', 'mane', 'cube'],
  bigWindow: [true, false], eave: ['south', 'none'], carport: [true, false], shed: [true, false],
};

// ---- 間取りの骨組み（設計担当との調整）：部屋の一覧と形から、面積・建蔽率・形の係数を出す ----
// 部屋の広さは決まった段階（畳）から選ぶ。面積はここで計算する（Claudeは数字を作らない）
export const ROOM_SIZES = [3, 4.5, 6, 8, 10, 12, 16, 20];
export const JO = 1.62; // 1畳の面積（㎡、簡略値）
export const PLAN_FORMS = ['総二階', '部分二階', '平屋に近い'];
export function planMetrics(plan) {
  const rooms = (plan?.rooms || []).filter(r => ROOM_SIZES.includes(+r.size) && (r.floor === 1 || r.floor === 2));
  const sum = f => rooms.filter(r => r.floor === f).reduce((a, r) => a + r.size * JO, 0);
  const two = rooms.some(r => r.floor === 2);
  const stairs = two ? TSUBO : 0;                      // 階段：各階に約1坪
  const f1 = sum(1) * 1.2 + stairs + 4.5 * JO * 0.5;   // 廊下・玄関などの割り増し
  const f2 = two ? sum(2) * 1.15 + stairs : 0;
  const total = f1 + f2;
  const tsubo = Math.round(total / TSUBO);
  const floor1Tsubo = Math.round(f1 / TSUBO * 10) / 10;
  // 形の係数：基礎と屋根は建築面積（1階）、外壁は外周で効く。1階が大きいほど割高（総二階＝1.00）
  const ratio1 = total ? f1 / total : 0.5;
  const shapeFactor = round(1 + 0.18 * Math.max(0, ratio1 - 0.5), 3);
  return { f1: round(f1, 1), f2: round(f2, 1), total: round(total, 1), tsubo, floor1Tsubo, shapeFactor, rooms: rooms.length };
}
export function applyPlan(w, plan) {
  const m = planMetrics(plan);
  w.plan = plan;
  w.spec.tsubo = m.tsubo; w.spec.floor1Tsubo = m.floor1Tsubo; w.spec.shapeFactor = m.shapeFactor;
  if (plan.shape?.roof && SPEC_SCHEMA.roof.includes(plan.shape.roof)) { w.spec.roof = plan.shape.roof; w.roofReq = true; }
  return m;
}
// 仮計算（設計担当の道具）：この骨組みにしたら、面積・建蔽率・総額・月々・希望との違いはどうなるか
export function measurePlan(w, plan, wishes = []) {
  const t = forkWorld(w); const m = applyPlan(t, plan);
  const cov = coverageCheck(t.spec), mo = money(t), lc = loanCheck(householdOf(t), mo.loan);
  return { ...m, coverageOk: cov.ok, coverage: cov.total, coverageLimit: cov.limit, total: round(mo.total, 1), loan: round(mo.loan, 1), loanOk: lc.ok, monthly: round(payment(mo.loan, RATE.variable), 1), wishes: checkWishes(t, wishes).map(c => ({ label: c.label, ok: c.ok, diff: c.diff })) };
}

// ---- 台帳 層②：原価・価格（会社別）----
export function priceLines(spec, co, knowGround) {
  const L = [];
  L.push({ key: 'body', label: '本体工事', v: round(co.tsubo * spec.tsubo * (spec.shapeFactor || 1), 1) });
  if (pitched(spec.roof)) L.push({ key: 'gable', label: `屋根（${ROOF_JA[spec.roof]}）`, v: co.gable });
  L.push({ key: 'futai', label: '付帯工事（給排水・仮設など）', v: co.futai });
  if (spec.kitchen) L.push({ key: 'kitchen', label: '造作キッチン', v: co.kitchen });
  if (spec.window === 'triple') L.push({ key: 'triple', label: '南の大開口をトリプルガラスに', v: co.triple });
  L.push({ key: 'ground', label: '地盤改良', v: COMMON.ground, range: knowGround ? null : COMMON.ground_range });
  L.push({ key: 'exterior', label: '外構', v: spec.exterior === 'full' ? COMMON.exterior : spec.exterior === 'min' ? COMMON.exteriorMin : 0 });
  L.push({ key: 'lighting', label: '照明・カーテン', v: COMMON.lighting });
  L.push({ key: 'aircon', label: 'エアコン', v: COMMON.aircon });
  L.push({ key: 'misc', label: '諸費用（登記・ローン・保険）', v: COMMON.misc });
  return L;
}

// ---- 台帳 層③：見積の見せ方（会社別）。見積に載っていない金額も、エンジンの中には最初から存在する ----
export function presentation(lines, co) {
  const shown = { body: ['body', 'gable', 'kitchen', 'triple'], options: ['body', 'gable', 'kitchen', 'triple', 'futai'], total: lines.map(l => l.key), lump: ['body', 'gable', 'futai', 'kitchen', 'triple'] }[co.style];
  const out = lines.map(l => ({ ...l, shown: shown.includes(l.key), note: shown.includes(l.key) ? '' : '別途' }));
  if (co.style === 'total' && co.groundTiming === '契約前') out.forEach(l => { if (l.key === 'ground') l.range = null; });
  const cover = out.filter(l => l.shown).reduce((s, l) => s + l.v, 0);
  const real = out.reduce((s, l) => s + l.v, 0);
  const label = { body: '本体価格', options: '本体＋オプション', total: '総額（付帯・外構・諸費用込み）', lump: '一式' }[co.style];
  return { company: co.id, lines: out, cover: Math.round(cover), real: Math.round(real), label };
}
export function quote(spec, coId, knowGround = false) {
  const co = COMPANIES[coId];
  return presentation(priceLines(spec, co, knowGround), co);
}

// ---- 暖かさの体験（4段階）----
export function warmth(spec, coId) {
  const co = COMPANIES[coId];
  const s = 3 + (co.equip || 0) + (co.insul - 5) * 2.5 + (spec.window === 'triple' ? 2 : 0) - (spec.bigWindow ? 3 : 0) + (spec.eave === 'south' ? 1 : 0) + (pitched(spec.roof) ? 0.5 : 0);
  const lv = s >= 5.5 ? 3 : s >= 4 ? 2 : s >= 2 ? 1 : 0;
  return { score: round(s, 1), level: lv, label: ['寒い', 'やや寒い', 'おおむね快適', '快適'][lv] };
}

// ---- 家計のゆとり（4段階）----
export function slack(h, principal) {
  const yearlyHousing = payment(principal, RATE.variable) * 12 + 15 /*固定資産税*/ + 4 /*保険*/ + 12 /*修繕の積立*/;
  const rest = h.takeHome - h.living * 12 - yearlyHousing - 60 /*教育・その他*/;
  const lv = rest >= 100 ? 3 : rest >= 50 ? 2 : rest >= 10 ? 1 : 0;
  return { rest: round(rest), level: lv, label: ['きつい', '少し背伸び', 'ほどよい', 'たっぷり'][lv] };
}

// ---- 工程と期限 ----
export const DEADLINE = { land: 60, loan: 90 };
export const STEPS = ['見学・相談', '初回打ち合わせ', 'プラン提案・見積', '設計申込・詳細打ち合わせ', 'ショールーム', '契約', 'コーディネート・電気', '申請・着工', '上棟', '施主検査', '引渡し', '1年後'];
// 各工程が終わる日（会社の速さで伸び縮みする）
export function scheduleOf(world) {
  const co = COMPANIES[world.company] || COMPANIES.C;
  const pre = [3, 10, 24, 40, 48, 58], post = [80, 100, 145, 175, 205, 210];
  const k = co.speed;
  const late = (world.delay || 0) + (world.bits && world.bits.length === 4 ? eventDelay(world) : 0);
  const days = [...pre.map(d => Math.round(d * (d > 10 ? k : 1))), ...post.map(d => Math.round(d * (0.9 + 0.1 * k)) + late)];
  days.push(days[10] + 365);
  return days;
}
export function schedule(world, addDays = 0) {
  const d = scheduleOf(world), contractDay = d[5] + (world.delay || 0) + addDays;
  return { contractDay, loanLeft: DEADLINE.loan - contractDay - (world.loanReview || 0), handover: d[10] + addDays, ok: contractDay <= DEADLINE.loan };
}

// ---- 世界（1つの家づくりの状態）----
export function newWorld(opts = {}) {
  const h = opts.household || HOUSEHOLDS.t2;
  return {
    bits: [], labels: [], company: opts.company || 'C', spec: baseSpec(h), household: h.id, seed: opts.seed ?? 7,
    finish: { wall: 'std', color: 0, floor: 'std', inner: 'vinyl' }, electric: [], contracted: false, contract: null,
    adds: [], delay: 0, loanReview: 0, third: null, memory: [],
  };
}
export const householdOf = w => HOUSEHOLDS[w.household] || HOUSEHOLDS.t2;
export const forkWorld = w => clone(w); // 決断の時点で、世界をそのまま複製する

// お金の札：総額（土地＋建物）と借入、自己資金。契約後は「土地＋契約金額＋増工」
export function money(w) {
  const h = householdOf(w), land = landCost();
  const q = quote(w.spec, w.company, true);
  const inContract = w.contractOpts || [];
  const add = round(w.adds.reduce((s, a) => s + a.v, 0) + (w.contracted ? finishCost(w.finish) + electricCost(w.electric.filter(id => !inContract.includes(id))) : 0), 1);
  const building = w.contracted ? w.contract + electricCost(inContract) : q.real;
  const total = round(land + building + add, 1);
  const self = h.saveHouse;
  const loan = round(Math.max(0, total - self), 1);
  return { land, building, contract: w.contracted ? building : null, add, total, self, loan, quote: q };
}

// ---- 4つの分かれ道（名前と順番は固定）。bit=0 が左の札、bit=1 が右の札 ----
export const FORKS = ['第一の分岐点', '第二の分岐点', '第三の分岐点', '第四の分岐点'];
export function decisions(pair = ['C', 'A']) {
  const [x, y] = pair;
  return [
    { id: 'D1', no: 0, q: 'だれと建てる？', step: 2, a: { label: `${COMPANIES[x].name}と建てる`, patch: { company: x } }, b: { label: `${COMPANIES[y].name}と建てる`, patch: { company: y } } },
    { id: 'D2', no: 1, q: 'なにを優先する？', step: 3, a: { label: w => w.plan ? `${w.plan.title || '確定した骨組み'}で進める` : `提案の外形（${ROOF_JA[w.spec.roof]}）のまま、広さを優先する`, patch: { plan: 'main' } }, b: { label: w => w.plan?.alt ? `${w.plan.alt.title || 'もう一つの案'}にする` : `${ROOF_JA[COMPANIES[w.company].altRoof]}に変えて、総二階に寄せる（ひとまわり小さく）`, patch: { spec: { roof: '@alt', tsubo: -1 }, plan: 'alt' } } },
    { id: 'D3', no: 2, q: 'いくらまでかける？', step: 5, a: { label: '外構は最小限で進める', patch: { spec: { exterior: 'min' } } }, b: { label: '借入を増やして、外構まで仕上げる', patch: { spec: { exterior: 'full' } } } },
    { id: 'D4', no: 3, q: 'どう仕上げる？', step: 6, a: { label: '標準の仕上げのまま', patch: { finish: { wall: 'std', floor: 'std', inner: 'vinyl' } } }, b: { label: 'アップグレードを受ける（外壁と床）', patch: { finish: { wall: 'galva', floor: 'oak' } } } },
  ];
}
export const DECISIONS = decisions();

// 審査の上限を超えるなら、延床の目安の下限まで1坪ずつ小さくした「この予算に合わせた案」にする
export function fitBudget(w) {
  const h = householdOf(w);
  let n = 0;
  while (!loanCheck(h, money(w).loan).ok && w.spec.tsubo > h.area[0]) { w.spec.tsubo -= 1; w.spec.floor1Tsubo = Math.ceil(w.spec.tsubo / 2); n++; }
  if (n) w.fitted = (w.fitted || 0) + n;
  return n;
}
function applyPatch(w, p) {
  if (p.company) { w.company = p.company; if (!w.roofReq) w.spec.roof = COMPANIES[p.company].roof; fitBudget(w); }
  // 骨組みが確定している世界：第二の分岐点は、確定した案かもう一つの案のどちらか（面積と形はエンジンが出す）
  if (p.plan && w.plan) {
    const base = w.plan, pick = p.plan === 'alt' && base.alt ? { ...base.alt, alt: base } : base;
    applyPlan(w, pick); w.plan = pick;
    return;
  }
  if (p.spec) for (const [k, v] of Object.entries(p.spec)) {
    if (k === 'tsubo') { w.spec.tsubo = baseSpec(householdOf(w)).tsubo - (w.fitted || 0) + v; w.spec.floor1Tsubo = Math.ceil(w.spec.tsubo / 2); }
    else if (k === 'tsuboAbs') { w.spec.tsubo = v; w.spec.floor1Tsubo = Math.ceil(v / 2); }
    else if (k === 'roof' && v === '@alt') w.spec.roof = COMPANIES[w.company].altRoof;
    else w.spec[k] = v;
  }
  if (p.finish) w.finish = { ...w.finish, ...p.finish };
  if (p.electric) w.electric = [...new Set([...w.electric, ...p.electric])];
}
// 1つの世界に決断を当てる（opt：'a' | 'b' | 自由回答の proposal）
export function choose(w, d, opt, extra = {}) {
  const side = typeof opt === 'string' ? opt : opt.side;
  const base = d[side];
  const baseLabel = typeof base.label === 'function' ? base.label(w) : base.label;
  applyPatch(w, base.patch);
  if (typeof opt === 'object') { applyPatch(w, { spec: opt.spec || {}, finish: opt.finish, electric: opt.electric }); if (!opt.plain) w.third = d.id; }
  w.bits.push(side === 'a' ? 0 : 1);
  w.labels.push(typeof opt === 'object' ? (opt.label || baseLabel) : baseLabel);
  if (extra.reason || extra.priority) w.memory.push({ decisionId: d.id, action: w.labels.at(-1), reason: extra.reason || '', priority: extra.priority || '' });
  if (d.id === 'D3') contract(w);
  return w;
}
export function contract(w) { if (!w.contracted) { w.contracted = true; w.contract = quote(w.spec, w.company, true).real; } return w; }

// 分かれ道で、すべての世界を2つに分ける。プレイヤーは選んだ道へ、もう一方は「選ばれなかった世界線」へ
// 第一の分岐のあと1、第二のあと3、第三のあと7、第四のあと15（2のn乗−1）
export function branchAll(player, others, d, playerOpt, extra = {}) {
  const side = typeof playerOpt === 'string' ? playerOpt : playerOpt.side;
  const sibling = choose(forkWorld(player), d, side === 'a' ? 'b' : 'a');
  const next = [];
  for (const o of others) { next.push(choose(forkWorld(o), d, 'a'), choose(o, d, 'b')); }
  next.push(sibling);
  choose(player, d, playerOpt, extra);
  return { player, others: next };
}
export const worldNo = bits => bits.reduce((n, b, i) => n + (b << (bits.length - 1 - i)), 0) + 1;

// ---- 自由な答えの取引：読み替え → 仮計算 → 条件 → 承認 → 確定 ----
// proposal は Claude が入力文から作る「変更の提案」。数字は入れない（借入は「増やす／増やさない」だけ）
export function normalizeProposal(p = {}) {
  const out = { side: p.side === 'a' ? 'a' : 'b', spec: {}, borrow: p.borrow === 'keep' ? 'keep' : 'cover', electric: [], finish: undefined };
  const errors = [];
  for (const [k, v] of Object.entries(p.spec || {})) {
    if (k === 'tsubo') continue;
    if (!(k in SPEC_SCHEMA)) { errors.push(`仕様の項目「${k}」は扱えません`); continue; }
    if (!SPEC_SCHEMA[k].includes(v)) { errors.push(`「${k}」に「${v}」は選べません`); continue; }
    out.spec[k] = v;
  }
  if (p.spec && p.spec.tsubo != null) { const t = Math.round(+p.spec.tsubo); if (t >= 24 && t <= 40) out.spec.tsuboAbs = t; else errors.push('広さは24〜40坪の範囲で扱います'); }
  for (const id of p.electric || []) { if (ELECTRIC.options.some(o => o.id === id)) out.electric.push(id); else errors.push(`電気の項目「${id}」はありません`); }
  if (p.finish) { out.finish = {}; for (const k of ['wall', 'floor', 'inner']) if (p.finish[k] && FINISH[k].some(x => x.id === p.finish[k])) out.finish[k] = p.finish[k]; }
  if (p.label) out.label = String(p.label).slice(0, 40);
  if (p.plain) out.plain = true;
  return { proposal: out, errors };
}

// tool use でClaudeが呼ぶ道具（すべて「仮に」計算するだけで、世界は変えない）
export const TOOLS = {
  quote(w, d, proposal) {
    const t = forkWorld(w); const before = money(t);
    choose(t, d, proposal); const after = money(t);
    return { before: before.total, after: after.total, diff: round(after.total - before.total, 1), lines: after.quote.lines.filter(l => !before.quote.lines.some(b => b.key === l.key && b.v === l.v)).map(l => ({ label: l.label, v: l.v })) };
  },
  loanCheck(w, d, proposal) {
    const t = forkWorld(w); choose(t, d, proposal); const m = money(t);
    const lc = loanCheck(householdOf(t), m.loan);
    const before = money(w).loan;
    return { ...lc, before, diff: round(m.loan - before, 1), monthlyDiff: Math.round((payment(m.loan, RATE.variable) - payment(before, RATE.variable)) * 10000) };
  },
  schedule(w, d, proposal) {
    const days = proposal.borrow === 'cover' && TOOLS.loanCheck(w, d, proposal).diff > 0 ? 7 : 0; // 本審査のやり直し
    return { ...schedule(w, days), addDays: days };
  },
  coverageCheck(w, d, proposal) { const t = forkWorld(w); choose(t, d, proposal); return coverageCheck(t.spec); },
};

export function simulate(w, d, rawProposal) {
  const { proposal, errors } = normalizeProposal(rawProposal);
  const q = TOOLS.quote(w, d, proposal), lc = TOOLS.loanCheck(w, d, proposal), sc = TOOLS.schedule(w, d, proposal), cv = TOOLS.coverageCheck(w, d, proposal);
  // 借入を増やさない場合、増額は手元に残す分から出すことになる
  const h = householdOf(w);
  const fromSavings = proposal.borrow === 'keep' ? Math.max(0, lc.diff) : 0;
  let verdict = 'できる';
  if (!lc.ok || !sc.ok || !cv.ok) verdict = 'いまは難しい';
  else if (fromSavings > h.saveKeep * 0.5 || errors.length) verdict = '確認が足りない';
  else if (sc.addDays > 0 || lc.diff > 0) verdict = '条件付き';
  const conditions = [];
  const R = v => Math.round(v).toLocaleString();
  if (q.diff) conditions.push(`総額 ${q.diff > 0 ? '+' : ''}${R(q.diff)}万円（${R(q.before)} → ${R(q.after)}万円）`);
  if (proposal.borrow === 'cover' && lc.diff > 0) conditions.push(`借入 +${R(lc.diff)}万円（月々 約+${lc.monthlyDiff.toLocaleString()}円、返済負担率 ${lc.ratio}%）`);
  if (fromSavings) conditions.push(`手元に残す分から ${R(fromSavings)}万円を出す`);
  if (sc.addDays) conditions.push(`本審査のやり直し +${sc.addDays}日（契約は${sc.contractDay}日目、ローン特約の期限は${DEADLINE.loan}日目）`);
  if (!cv.ok) conditions.push(`建蔽率の上限を超える（${cv.total}㎡ ／ 上限 ${cv.limit}㎡）`);
  if (!lc.ok) conditions.push(`審査の上限を超える（返済負担率 ${lc.ratio}% ／ 35%まで）`);
  const t = forkWorld(w); choose(t, d, proposal);
  return { proposal, errors, verdict, conditions, quote: q, loan: lc, schedule: sc, coverage: cv, warmthBefore: warmth(w.spec, w.company), warmthAfter: warmth(t.spec, t.company) };
}

// ---- 1年後：世界ごとの帰結（外的な乱数は全世界で共通の種から）----
// 出来事：前の工程でまかれた種（seed）がある世界でだけ、担当者の力量の乱数しだいで芽が出る。種のない偶然は起こさない
export function incidents(w) {
  if (w.bits.length < 4) return [];
  const no = worldNo(w.bits), skill = rng((w.seed ?? 7) * 31 + no)();
  const changedAfter = !!w.third || w.bits[3] === 1; // 契約のあとで仕様の変更が重なった
  const out = [];
  if (w.company === 'A' && changedAfter && skill < 0.45) out.push({ text: '契約後に担当が替わり、頼んだ設備と違うものが入った', amount: 380, cause: '契約のあとで変更が重なり、引き継ぎの記録が追いつかなかった', lesson: '契約のあとの変更は、記録を残して引き継いでもらう' });
  if (w.company === 'B' && w.bits[3] === 1 && skill < 0.4) out.push({ text: '契約後にオプションを足していったら、思ったより増えた', amount: 120, cause: '標準仕様が最低限で、仕上げのアップグレードを重ねた', lesson: '標準仕様で足りるかを、契約の前に確かめる' });
  if (w.company === 'C' && w.bits[1] === 1 && skill < 0.4) out.push({ text: '詳細の打ち合わせが長引き、入居がひと月遅れた', delay: 30, cause: '設計の途中で外形を変え、図面を描き直した', lesson: '外形を変えるなら、早いうちに決める' });
  if (w.company === 'D' && skill < 0.35 && !w.electric.includes('tag_tv_wall')) out.push({ text: '壁掛けテレビの下地が入っていなかった', cause: '打ち合わせの記録を残していなかった', lesson: '打ち合わせの記録は、自分たちでも残す' });
  return out;
}
export const eventDelay = w => incidents(w).reduce((s, e) => s + (e.delay || 0), 0);
export function outcome(w, opts = {}) {
  const h = householdOf(w), no = worldNo(w.bits);
  const skill = rng((w.seed ?? 7) * 31 + no)();
  const inc = incidents(w);
  const increase = inc.reduce((s, e) => s + (e.amount || 0), 0);
  const events = inc.map(e => e.text + (e.amount ? `（+${e.amount}万円）` : ''));
  if (w.spec.exterior !== 'full') events.push('玄関前は砂利のまま。冬の朝、霜取りに5分');
  const wm = warmth(w.spec, w.company);
  if (wm.level <= 1) events.push('2月の朝、足元が冷たい');
  if (wm.level >= 3 && w.spec.window === 'triple') events.push('南の窓辺が、冬でもいちばんの居場所');
  const m = money({ ...w, adds: [...w.adds, ...(increase ? [{ label: '契約後の増額', v: increase }] : [])] });
  const sl = slack(h, m.loan);
  const days = scheduleOf(w)[10];
  return { no, bits: w.bits, labels: w.labels, company: w.company, spec: w.spec, finish: w.finish, money: m, total: m.total, principal: m.loan, increase, choiceTotal: round(m.total - increase, 1), causes: inc, warmth: wm, slack: sl, days, events, third: w.third, skill: round(skill, 2) };
}

// 世界線の呼び名と教訓：4つの選択（会社・外形・外構・仕上げ）から、決まりで組み立てる（16の名前は必ず別になる）
const CO_PRE = { A: '大手の', B: '規格の', C: '設計者の', D: '地元の' };
const ROOF_NOUN = { hip: '寄棟', gable: '切妻', mane: '招き屋根', cube: 'キューブ', flat: '箱の家' };
export function worldName(o) {
  const full = o.spec.exterior === 'full', up = finishCost(o.finish) > 0;
  const adj = full && up ? '庭も仕上げも整えた' : full ? '庭から先に整えた' : up ? '庭より仕上げを選んだ' : '身軽に建てた';
  return `${adj}、${CO_PRE[o.company] || ''}${ROOF_NOUN[o.spec.roof] || '家'}。`;
}
// 世界線のカードのひとこと（8字前後）：詳しい経路は、押したときの世界樹で
export function worldShort(o) {
  const full = o.spec.exterior === 'full', up = finishCost(o.finish) > 0;
  return full && up ? '庭も仕上げも' : full ? '庭から整えた' : up ? '仕上げを選んだ' : '身軽に建てた';
}
export function worldLesson(o, me) {
  if (!me || o.no === me.no) return 'あなたが選んだ世界';
  if ((o.causes || []).length && o.causes[0].lesson) return o.causes[0].lesson;
  const i = o.bits.findIndex((b, k) => b !== me.bits[k]);
  const d = Math.round(o.total - me.total), dd = `${d > 0 ? '+' : ''}${d.toLocaleString()}万円`;
  if (i === 0) return `会社が違うと、総額${dd}、冬の朝は「${o.warmth.label}」`;
  if (i === 1) return `外形と間取りを変えると、総額${dd}`;
  if (i === 2) return o.spec.exterior === 'full' ? '外構まで先に仕上げると、入居の日から庭が整う' : '外構を後回しにすると、借入は軽いが玄関は砂利のまま';
  return finishCost(o.finish) > 0 ? '仕上げを上げると、毎日触れる場所に手ざわりが残る' : '標準の仕上げでも、暮らしは十分に回る';
}

// P0-1：希望の条件（施主の言葉から写した数字）と、いまの案を比べる。計算はエンジン
export function checkWishes(w, wishes = []) {
  const m = money(w), monthly = payment(m.loan, RATE.variable);
  return wishes.filter(x => x.kind !== 'priority' && x.value != null).map(x => {
    if (x.kind === 'totalMax') return { ...x, ok: m.total <= x.value, diff: round(m.total - x.value, 1), label: `総額 ${x.value.toLocaleString()}万円以内` };
    if (x.kind === 'monthlyMax') return { ...x, ok: monthly <= x.value, diff: round(monthly - x.value, 1), label: `月々 ${x.value}万円以内` };
    if (x.kind === 'areaMax') return { ...x, ok: w.spec.tsubo <= x.value, diff: w.spec.tsubo - x.value, label: `${x.value}坪まで` };
    if (x.kind === 'areaMin') return { ...x, ok: w.spec.tsubo >= x.value, diff: x.value - w.spec.tsubo, label: `${x.value}坪は欲しい` };
    return null;
  }).filter(Boolean);
}

// 16の世界を種から一度に作る（検算・自動モード用）。chosen のビットがプレイヤーの道
export function allWorlds(opts = {}) {
  const h = opts.household || HOUSEHOLDS.t2;
  const ds = decisions(opts.pair);
  const out = [];
  for (let n = 0; n < 16; n++) {
    const bits = [n >> 3 & 1, n >> 2 & 1, n >> 1 & 1, n & 1];
    const w = newWorld({ household: h, seed: opts.seed, company: (opts.pair || ['C'])[0] });
    bits.forEach((b, i) => {
      const d = ds[i], onPlayer = opts.chosen && opts.chosen.slice(0, i + 1).every((c, k) => c === bits[k]);
      const third = opts.thirdAt && opts.thirdAt[d.id];
      choose(w, d, onPlayer && third ? { ...third, side: b ? 'b' : 'a' } : (b ? 'b' : 'a'));
    });
    out.push(outcome(w));
  }
  return out;
}

// ---- 出来事の記録（イベントソーシング）----
export function createLog(seed = []) {
  const events = [...seed];
  return {
    events,
    push(type, payload = {}) { const e = { id: 'E' + String(events.length + 1).padStart(3, '0'), t: Date.now(), type, ...payload }; events.push(e); return e; },
  };
}

export const YKS = { worldName, worldLesson, ROOM_SIZES, JO, PLAN_FORMS, planMetrics, applyPlan, measurePlan, incidents, eventDelay, checkWishes, ROOF_JA, pitched, UA, ELECTRIC_WORDS, electricOf, missedPolicy, fitBudget, VERSION, TSUBO, HOUSEHOLDS, monthlyTakeHome, RATE, payment, loanLimit, loanCheck, SITE, landCost, coverageCheck, COMPANIES, COMMON, FINISH, ELECTRIC, finishCost, electricCost, baseSpec, SPEC_SCHEMA, quote, warmth, slack, DEADLINE, STEPS, scheduleOf, schedule, newWorld, forkWorld, money, FORKS, decisions, DECISIONS, choose, contract, branchAll, worldNo, normalizeProposal, TOOLS, simulate, outcome, allWorlds, createLog, rng, round, hashStr };
export default YKS;
