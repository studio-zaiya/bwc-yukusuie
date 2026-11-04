/* ゆくすいえ　計算エンジン（試作 v0.1）
 * 大原則：言葉はClaude、数字はコード。金額・日数・面積・体験の段階は、すべてここで出す。
 * 単位：金額は万円、面積は㎡（坪は 3.30579㎡）、日数は日。
 * 数字はすべて仮置き（06_エンジンとゲームの設計_v0.2 に準拠）。
 */
(function (root) {
  'use strict';
  const TSUBO = 3.30579;
  const round = (v, d = 0) => { const k = 10 ** d; return Math.round(v * k) / k; };

  // ---- 乱数（種を固定すると、同じ結果になる）----
  function rng(seed) {
    let s = seed >>> 0;
    return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // ---- 世帯（型2を推奨）----
  const HOUSEHOLDS = {
    t1: { id: 't1', story: '共働き、子ども2人。予算を抑えながら、毎日の暮らしを良くしたい。', income: 680, takeHome: 520, bonus: 80, saveHouse: 200, saveKeep: 150, invest: 50, living: 24, area: [31, 33] },
    t2: { id: 't2', story: '共働き、子ども2人。性能も間取りも、そこそこ欲張りたい。', income: 800, takeHome: 610, bonus: 110, saveHouse: 350, saveKeep: 200, invest: 200, living: 27, area: [33, 35] },
    t3: { id: 't3', story: '共働き、子ども2人。将来の働き方の変化にも備えたい。', income: 980, takeHome: 740, bonus: 140, saveHouse: 500, saveKeep: 250, invest: 400, living: 31, area: [34, 36] },
  };
  const monthlyTakeHome = h => round((h.takeHome - h.bonus) / 12, 1);

  // ---- ローン ----
  const RATE = { screen: 0.035, variable: 0.012, fixed: 0.038 };
  function payment(principal, annualRate, years = 35) {
    const r = annualRate / 12, n = years * 12;
    return principal * r / (1 - Math.pow(1 + r, -n));
  }
  function loanLimit(h, ratio = 0.35) { // 審査の上限（返済負担率）
    const perMan = payment(1, RATE.screen) * 12; // 1万円あたりの年間返済
    return Math.floor(h.income * ratio / perMan / 10) * 10;
  }
  function loanCheck(h, principal) {
    const yearly = payment(principal, RATE.screen) * 12;
    const ratio = yearly / h.income;
    return { ratio: round(ratio * 100, 1), ok: ratio <= 0.35, monthly: round(payment(principal, RATE.variable), 2) };
  }

  // ---- 敷地 ----
  const SITE = { tsubo: 55, price: 1350, coverage: 0.60, far: 1.50, waterFee: 47 };
  SITE.area = round(SITE.tsubo * TSUBO, 1);
  function coverageCheck(spec) {
    const house = spec.floor1Tsubo * TSUBO;
    const carport = spec.carport ? 31.1 : 0; // 2台・緩和後の簡略値
    const shed = spec.shed ? 3.3 : 0;
    const total = house + carport + shed;
    const limit = SITE.area * SITE.coverage;
    return { house: round(house, 1), extra: round(carport + shed, 1), total: round(total, 1), limit: round(limit, 1), ok: total <= limit };
  }

  // ---- 住宅会社（型）。色は付けない。形だけで区別 ----
  const COMPANIES = {
    A: { id: 'A', name: 'Aハウス', shape: 'square', kind: '大手ハウスメーカー', staff: '高橋', staffRole: '営業', tsubo: 92, futai: 230, kitchen: 90, triple: 52, insul: 6, equip: 1, style: 'body', groundTiming: '契約後', speed: 1.0 },
    B: { id: 'B', name: 'Bハウス', shape: 'triangle', kind: 'ローコスト・規格', staff: '小林', staffRole: '営業', tsubo: 65, futai: 220, kitchen: 110, triple: 70, insul: 5, style: 'options', groundTiming: '契約後', speed: 0.8 },
    C: { id: 'C', name: 'Cデザイン', shape: 'circle', kind: '作り込み型の工務店', staff: '佐々木', staffRole: '設計', tsubo: 84, futai: 250, kitchen: 70, triple: 58, insul: 6, style: 'total', groundTiming: '契約前', speed: 1.3 },
    D: { id: 'D', name: 'D工務店', shape: 'hex', kind: '身軽型の工務店', staff: '森', staffRole: '社長', tsubo: 75, futai: 200, kitchen: 60, triple: 64, insul: 5, style: 'lump', groundTiming: '曖昧', speed: 0.9 },
  };
  const COMMON = { exterior: 180, lighting: 60, aircon: 50, ground: 120, ground_range: [80, 150], misc: 250 };

  // ---- 台帳 層①：仕様・数量 ----
  function baseSpec(h) {
    return { tsubo: 34, floor1Tsubo: 17, form: 'box', roof: 'flat', eave: 'south', bigWindow: true, window: 'standard', kitchen: false, exterior: 'full', carport: true, shed: true, aircon: 4 };
  }

  // ---- 台帳 層②：原価・価格（会社別）----
  function priceLines(spec, co, knowGround) {
    const L = [];
    L.push({ key: 'body', label: '本体工事', v: co.tsubo * spec.tsubo });
    L.push({ key: 'futai', label: '付帯工事（給排水・仮設など）', v: co.futai });
    if (spec.kitchen) L.push({ key: 'kitchen', label: '造作キッチン', v: co.kitchen });
    if (spec.window === 'triple') L.push({ key: 'triple', label: '南の大開口をトリプルガラスに', v: co.triple });
    L.push({ key: 'ground', label: '地盤改良', v: COMMON.ground, range: knowGround ? null : COMMON.ground_range });
    L.push({ key: 'exterior', label: '外構', v: spec.exterior === 'full' ? COMMON.exterior : spec.exterior === 'min' ? 40 : 0 });
    L.push({ key: 'lighting', label: '照明・カーテン', v: COMMON.lighting });
    L.push({ key: 'aircon', label: 'エアコン', v: COMMON.aircon });
    L.push({ key: 'misc', label: '諸費用（登記・ローン・保険）', v: COMMON.misc });
    return L;
  }

  // ---- 台帳 層③：見積の見せ方（会社別）----
  // 見積に載っていない金額も、エンジンの中には最初から存在する
  function presentation(lines, co) {
    const shown = { body: ['body', 'kitchen', 'triple'], options: ['body', 'kitchen', 'triple', 'futai'], total: lines.map(l => l.key), lump: ['body', 'futai', 'kitchen', 'triple'] }[co.style];
    const out = lines.map(l => ({ ...l, shown: shown.includes(l.key), note: shown.includes(l.key) ? '' : '別途' }));
    if (co.style === 'total' && co.groundTiming === '契約前') out.forEach(l => { if (l.key === 'ground') l.range = null; });
    const cover = out.filter(l => l.shown).reduce((s, l) => s + l.v, 0);
    const real = out.reduce((s, l) => s + l.v, 0);
    const label = { body: '本体価格', options: '本体＋オプション', total: '総額（付帯・外構・諸費用込み）', lump: '一式' }[co.style];
    return { lines: out, cover: Math.round(cover), real: Math.round(real), label };
  }

  function quote(spec, coId, knowGround = false) {
    const co = COMPANIES[coId];
    return presentation(priceLines(spec, co, knowGround), co);
  }

  // ---- 暖かさの体験（4段階）----
  function warmth(spec, coId) {
    const co = COMPANIES[coId];
    let s = 3 + (co.equip || 0) + (co.insul - 5) * 2.5 + (spec.window === 'triple' ? 2 : 0) - (spec.bigWindow ? 3 : 0) + (spec.eave === 'south' ? 1 : 0);
    const lv = s >= 5.5 ? 3 : s >= 4 ? 2 : s >= 2 ? 1 : 0;
    return { score: round(s, 1), level: lv, label: ['寒い', 'やや寒い', 'おおむね快適', '快適'][lv] };
  }

  // ---- 家計のゆとり（4段階）----
  function slack(h, principal) {
    const yearlyHousing = payment(principal, RATE.variable) * 12 + 15 /*固定資産税*/ + 4 /*保険*/ + 12 /*修繕の積立*/;
    const rest = h.takeHome - h.living * 12 - yearlyHousing - 60 /*教育・その他*/;
    const lv = rest >= 100 ? 3 : rest >= 50 ? 2 : rest >= 10 ? 1 : 0;
    return { rest: round(rest), level: lv, label: ['きつい', '少し背伸び', 'ほどよい', 'たっぷり'][lv] };
  }

  // ---- 自由な答えの取引：解釈 → 仮計算 → 条件 → 承認 → 確定 ----
  // proposal は Claude が入力文から作る「変更の提案」（数字は入れない。借入の増額だけは本人の言葉から写す）
  function simulate(state, proposal) {
    const spec = { ...state.spec, ...(proposal.spec || {}) };
    const before = quote(state.spec, state.company, true), after = quote(spec, state.company, true);
    const diff = after.real - before.real;
    const borrowAdd = proposal.borrowAdd ?? 0;
    const principal = state.principal + borrowAdd;
    const lc = loanCheck(state.household, principal);
    const short = diff - borrowAdd; // 足りない分（正なら不足）
    const days = borrowAdd > 0 ? 7 : 0; // 本審査のやり直し
    const deadlineLeft = state.loanDeadlineLeft - days;
    let verdict = 'できる';
    if (!lc.ok || deadlineLeft < 0) verdict = 'いまは難しい';
    else if (short > 0) verdict = '確認が足りない';
    else if (days > 0) verdict = '条件付き';
    const conditions = [];
    if (borrowAdd) conditions.push(`借入 +${borrowAdd}万円（月々 約+${Math.round((payment(principal, RATE.variable) - payment(state.principal, RATE.variable)) * 10000).toLocaleString()}円）`);
    if (days) conditions.push(`本審査のやり直し +${days}日（ローン特約の期限まで、残り${deadlineLeft}日）`);
    if (short < 0) conditions.push(`差額 ${-short}万円は予備費へ`);
    if (short > 0) conditions.push(`あと${short}万円が足りない`);
    return { spec, diff, principal, loan: lc, days, verdict, conditions, warmthBefore: warmth(state.spec, state.company), warmthAfter: warmth(spec, state.company) };
  }

  // ---- 出来事の記録（イベントソーシング）----
  function createLog() {
    const events = [];
    return {
      events,
      push(type, payload) { const e = { id: 'E' + String(events.length + 1).padStart(3, '0'), t: Date.now(), type, ...payload }; events.push(e); return e; },
    };
  }

  // ---- 16の世界：決断のたびに「選んだ道」と「選ばなかった道」を1組つくる。2^4＝16 ----
  // bit=0 が左の札、bit=1 が右の札。自由回答は「選んだ道」の中身になるだけで、木は増えない
  const DECISIONS = [
    { id: 'D1', q: 'だれと建てる？', a: { label: 'Cデザインと建てる', patch: { company: 'C' } }, b: { label: 'Aハウスと建てる', patch: { company: 'A' } } },
    { id: 'D2', q: 'なにを優先する？', a: { label: '外構を予定どおりに', patch: { spec: { kitchen: false, exterior: 'full' } } }, b: { label: '造作キッチンを入れる', patch: { spec: { kitchen: true, exterior: 'min' } } } },
    { id: 'D3', q: 'いくらまでかける？', a: { label: '予算内で進める', patch: {} }, b: { label: '借入を増やして外構を戻す', patch: { borrowAdd: 140, spec: { exterior: 'full' } } } },
    { id: 'D4', q: 'どう仕上げる？', a: { label: '箱型の屋根', patch: { spec: { form: 'box', roof: 'flat' } } }, b: { label: '勾配のある屋根', patch: { spec: { form: 'gable', roof: 'gable' } } } },
  ];
  const worldNo = bits => bits.reduce((n, b, i) => n + (b << (3 - i)), 0) + 1; // 1〜16

  function runWorld(bits, opts) {
    const h = opts.household, rnd = rng(opts.seed * 31 + worldNo(bits));
    let spec = baseSpec(h), company = 'C', borrowAdd = 0, third = null;
    bits.forEach((b, i) => {
      const d = DECISIONS[i];
      let p = b ? d.b.patch : d.a.patch;
      if (opts.thirdAt && opts.thirdAt[d.id] && opts.chosen.slice(0, i + 1).every((c, k) => c === bits[k])) { p = opts.thirdAt[d.id].patch; third = d.id; }
      if (p.company) company = p.company;
      if (p.spec) spec = { ...spec, ...p.spec };
      if (p.borrowAdd) borrowAdd += p.borrowAdd;
    });
    const q = quote(spec, company, true);
    // 世界ごとの乱数：担当者の力量、引き継ぎ漏れ、工期
    const skill = rnd();
    let increase = 0; const events = [];
    if (company === 'A' && skill < 0.45) { increase = 380; events.push('契約後に担当が替わり、頼んだ設備と違うものが入った（+380万円）'); }
    if (spec.exterior !== 'full') events.push('玄関前は砂利のまま。冬の朝、霜取りに5分');
    const w = warmth(spec, company);
    if (w.level <= 1) events.push('2月の朝、足元が冷たい');
    const total = q.real + increase + SITE.price + SITE.waterFee;
    const principal = Math.max(0, total - h.saveHouse);
    const sl = slack(h, principal);
    const days = Math.round((company === 'C' ? 300 : 250) * (0.95 + rnd() * 0.1));
    return { no: worldNo(bits), bits, company, spec, quote: q, increase, total, principal, warmth: w, slack: sl, days, events, third, skill: round(skill, 2) };
  }

  function allWorlds(opts) {
    const out = [];
    for (let n = 0; n < 16; n++) out.push(runWorld([n >> 3 & 1, n >> 2 & 1, n >> 1 & 1, n & 1], opts));
    return out;
  }

  root.YKS = { TSUBO, HOUSEHOLDS, monthlyTakeHome, RATE, payment, loanLimit, loanCheck, SITE, coverageCheck, COMPANIES, COMMON, baseSpec, quote, warmth, slack, simulate, createLog, DECISIONS, worldNo, runWorld, allWorlds, rng, round };
})(typeof window !== 'undefined' ? window : globalThis);
