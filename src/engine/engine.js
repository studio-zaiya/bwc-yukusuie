/* ゆくすいえ　計算エンジン（v0.3、ESモジュール。画面と Worker の両方から同じものを読む）
 * 大原則：言葉はClaude、数字はコード。金額・日数・面積・判定は、すべてここで出す。
 * 単位：金額は万円、面積は㎡（坪は 3.30579㎡）、日数は日。
 * 数字はすべて仮置き（docs/06_engine.md に準拠）。app/engine.js（試作 v0.1）からの移植と拡張。
 */
export const VERSION = 'engine-0.4';
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
  A: { id: 'A', name: 'Aハウス', shape: 'square', kind: '大手ハウスメーカー', staff: '高橋', staffRole: '営業', tsubo: 92, futai: 230, kitchen: 90, triple: 52, insul: 6, equip: 1, style: 'body', groundTiming: '契約後', speed: 1.0, gable: 60 },
  B: { id: 'B', name: 'Bハウス', shape: 'triangle', kind: 'ローコスト・規格', staff: '小林', staffRole: '営業', tsubo: 65, futai: 220, kitchen: 110, triple: 70, insul: 5, equip: 0, style: 'options', groundTiming: '契約後', speed: 0.8, gable: 45 },
  C: { id: 'C', name: 'Cデザイン', shape: 'circle', kind: '作り込み型の工務店', staff: '佐々木', staffRole: '設計', tsubo: 84, futai: 250, kitchen: 70, triple: 58, insul: 6, equip: 0, style: 'total', groundTiming: '契約前', speed: 1.3, gable: 55 },
  D: { id: 'D', name: 'D工務店', shape: 'hex', kind: '身軽型の工務店', staff: '森', staffRole: '社長', tsubo: 75, futai: 200, kitchen: 60, triple: 64, insul: 5, equip: 0, style: 'lump', groundTiming: '曖昧', speed: 0.9, gable: 50 },
};
// 断熱等級ごとの外皮平均熱貫流率（UA値、W/㎡K、6地域の基準値の目安）
export const UA = { 4: 0.87, 5: 0.6, 6: 0.46, 7: 0.26 };
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
export const ELECTRIC = {
  standard: ['コンセント 各室2か所（LDKは6か所）', 'スイッチは入口の横', '照明はシーリング（LDKはダウンライト6灯）', 'エアコン用の専用回路 4か所', 'テレビ端子 LDK・主寝室', 'LAN配管 LDKのみ'],
  options: [
    { id: 'tv_wall', label: '壁掛けテレビの下地と配線', v: 4.8, issue: 'TV_WALL_BACKING' },
    { id: 'lan_bed', label: '寝室のLAN', v: 2.5, issue: 'LAN_BEDROOM' },
    { id: 'outlet_out', label: '外部コンセント（防水）', v: 1.6, issue: 'OUTLET_OUTSIDE' },
    { id: 'ev', label: '電気自動車の充電用コンセント', v: 9.5, issue: 'EV_OUTLET' },
    { id: 'aircon_louver', label: 'エアコンを隠すルーバー（リビング）', v: 6.5, issue: 'AIRCON_HIDE' },
  ],
};
export function finishCost(f = {}) {
  const pick = (k, id) => (FINISH[k].find(x => x.id === id) || FINISH[k][0]);
  return pick('wall', f.wall).v + pick('floor', f.floor).v + pick('inner', f.inner).v;
}
// 電気の要望の言葉 → 項目（コード）
export const ELECTRIC_WORDS = { tv_wall: /テレビ|壁掛け/, lan_bed: /LAN|有線|ネット/, outlet_out: /外.*コンセント|防水|屋外/, ev: /充電|EV|電気自動車/, aircon_louver: /エアコン.*(隠|ルーバー|見えな)|ルーバー/ };
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
  return { tsubo, floor1Tsubo: Math.ceil(tsubo / 2), form: 'box', roof: 'flat', eave: 'south', bigWindow: true, window: 'standard', kitchen: false, exterior: 'full', carport: true, shed: true, aircon: 4 };
}
// 仕様の変更として受け付ける項目（Claude の「変更の提案」はこの範囲だけ）
export const SPEC_SCHEMA = {
  window: ['standard', 'triple'], kitchen: [true, false], exterior: ['full', 'min', 'none'], roof: ['flat', 'gable'],
  bigWindow: [true, false], eave: ['south', 'none'], carport: [true, false], shed: [true, false],
};

// ---- 台帳 層②：原価・価格（会社別）----
export function priceLines(spec, co, knowGround) {
  const L = [];
  L.push({ key: 'body', label: '本体工事', v: co.tsubo * spec.tsubo });
  if (spec.roof === 'gable') L.push({ key: 'gable', label: '勾配屋根', v: co.gable });
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
  const s = 3 + (co.equip || 0) + (co.insul - 5) * 2.5 + (spec.window === 'triple' ? 2 : 0) - (spec.bigWindow ? 3 : 0) + (spec.eave === 'south' ? 1 : 0) + (spec.roof === 'gable' ? 0.5 : 0);
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
  const days = [...pre.map(d => Math.round(d * (d > 10 ? k : 1))), ...post.map(d => Math.round(d * (0.9 + 0.1 * k)) + (world.delay || 0))];
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
  const add = round(w.adds.reduce((s, a) => s + a.v, 0) + (w.contracted ? finishCost(w.finish) + electricCost(w.electric) : 0), 1);
  const building = w.contracted ? w.contract : q.real;
  const total = round(land + building + add, 1);
  const self = h.saveHouse;
  const loan = round(Math.max(0, total - self), 1);
  return { land, building, contract: w.contracted ? w.contract : null, add, total, self, loan, quote: q };
}

// ---- 4つの分かれ道（名前と順番は固定）。bit=0 が左の札、bit=1 が右の札 ----
export const FORKS = ['第一の分岐点', '第二の分岐点', '第三の分岐点', '第四の分岐点'];
export function decisions(pair = ['C', 'A']) {
  const [x, y] = pair;
  return [
    { id: 'D1', no: 0, q: 'だれと建てる？', step: 2, a: { label: `${COMPANIES[x].name}と建てる`, patch: { company: x } }, b: { label: `${COMPANIES[y].name}と建てる`, patch: { company: y } } },
    { id: 'D2', no: 1, q: 'なにを優先する？', step: 3, a: { label: '箱型の屋根で、広さを優先する', patch: { spec: { roof: 'flat', form: 'box', kitchen: false } } }, b: { label: '勾配屋根と造作キッチン（少し小さく）', patch: { spec: { roof: 'gable', form: 'gable', kitchen: true, tsubo: -1 } } } },
    { id: 'D3', no: 2, q: 'いくらまでかける？', step: 5, a: { label: '予算内に収める（外構は最小限）', patch: { spec: { exterior: 'min' } } }, b: { label: '借入を増やして、外構まで仕上げる', patch: { spec: { exterior: 'full' } } } },
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
  if (p.company) { w.company = p.company; fitBudget(w); }
  if (p.spec) for (const [k, v] of Object.entries(p.spec)) {
    if (k === 'tsubo') { w.spec.tsubo = baseSpec(householdOf(w)).tsubo - (w.fitted || 0) + v; w.spec.floor1Tsubo = Math.ceil(w.spec.tsubo / 2); }
    else w.spec[k] = v;
  }
  if (p.finish) w.finish = { ...w.finish, ...p.finish };
  if (p.electric) w.electric = [...new Set([...w.electric, ...p.electric])];
}
// 1つの世界に決断を当てる（opt：'a' | 'b' | 自由回答の proposal）
export function choose(w, d, opt, extra = {}) {
  const side = typeof opt === 'string' ? opt : opt.side;
  const base = d[side];
  applyPatch(w, base.patch);
  if (typeof opt === 'object') { applyPatch(w, { spec: opt.spec || {}, finish: opt.finish, electric: opt.electric }); if (!opt.plain) w.third = d.id; }
  w.bits.push(side === 'a' ? 0 : 1);
  w.labels.push(typeof opt === 'object' ? (opt.label || base.label) : base.label);
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
    if (!(k in SPEC_SCHEMA)) { errors.push(`仕様の項目「${k}」は扱えません`); continue; }
    if (!SPEC_SCHEMA[k].includes(v)) { errors.push(`「${k}」に「${v}」は選べません`); continue; }
    out.spec[k] = v;
  }
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
  if (sc.addDays) conditions.push(`本審査のやり直し +${sc.addDays}日（ローン特約の期限まで、残り${sc.loanLeft}日）`);
  if (!cv.ok) conditions.push(`建蔽率の上限を超える（${cv.total}㎡ ／ 上限 ${cv.limit}㎡）`);
  if (!lc.ok) conditions.push(`審査の上限を超える（返済負担率 ${lc.ratio}% ／ 35%まで）`);
  const t = forkWorld(w); choose(t, d, proposal);
  return { proposal, errors, verdict, conditions, quote: q, loan: lc, schedule: sc, coverage: cv, warmthBefore: warmth(w.spec, w.company), warmthAfter: warmth(t.spec, t.company) };
}

// ---- 1年後：世界ごとの帰結（外的な乱数は全世界で共通の種から）----
export function outcome(w, opts = {}) {
  const h = householdOf(w), no = worldNo(w.bits);
  const rnd = rng((w.seed ?? 7) * 31 + no);
  const skill = rnd();
  const events = [];
  let increase = 0;
  if (w.company === 'A' && skill < 0.45) { increase = 380; events.push('契約後に担当が替わり、頼んだ設備と違うものが入った（+380万円）'); }
  if (w.company === 'D' && skill < 0.35 && !w.electric.includes('tv_wall')) events.push('壁掛けテレビの下地が入っていなかった');
  if (w.spec.exterior !== 'full') events.push('玄関前は砂利のまま。冬の朝、霜取りに5分');
  const wm = warmth(w.spec, w.company);
  if (wm.level <= 1) events.push('2月の朝、足元が冷たい');
  if (wm.level >= 3 && w.spec.window === 'triple') events.push('南の窓辺が、冬でもいちばんの居場所');
  const m = money({ ...w, adds: [...w.adds, ...(increase ? [{ label: '契約後の増額', v: increase }] : [])] });
  const sl = slack(h, m.loan);
  const days = scheduleOf(w)[10];
  return { no, bits: w.bits, labels: w.labels, company: w.company, spec: w.spec, finish: w.finish, money: m, total: m.total, principal: m.loan, increase, warmth: wm, slack: sl, days, events, third: w.third, skill: round(skill, 2) };
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

export const YKS = { UA, ELECTRIC_WORDS, electricOf, missedPolicy, fitBudget, VERSION, TSUBO, HOUSEHOLDS, monthlyTakeHome, RATE, payment, loanLimit, loanCheck, SITE, landCost, coverageCheck, COMPANIES, COMMON, FINISH, ELECTRIC, finishCost, electricCost, baseSpec, SPEC_SCHEMA, quote, warmth, slack, DEADLINE, STEPS, scheduleOf, schedule, newWorld, forkWorld, money, FORKS, decisions, DECISIONS, choose, contract, branchAll, worldNo, normalizeProposal, TOOLS, simulate, outcome, allWorlds, createLog, rng, round, hashStr };
export default YKS;
