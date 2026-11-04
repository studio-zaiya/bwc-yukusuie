// 担当者のハーネス（docs/HEARING_v2.md の3、data/content/rep_harness.json）
// システムプロンプトの組み立てと、返事の検査を1か所にまとめる。Worker（本番）と研修の道具（tools/rep_training）の両方から読む。
// 言葉はClaude、数字はコード：金額・面積・日数は差し込み枠（{price} {area} {days}）で書かせ、値はコードが入れる。

export const PHASES = ['summary', 'followUp', 'proposal', 'adjust', 'confirm'];

// 返事の形（base.output）。構造化出力の JSON Schema
export const REP_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['say', 'ask', 'notes', 'deferred', 'slots', 'endMeeting'],
  properties: {
    say: { type: 'string' }, ask: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    notes: { type: 'array', items: { type: 'string' } }, deferred: { type: 'array', items: { type: 'string' } },
    slots: { type: 'array', items: { type: 'string', enum: ['price', 'area', 'days'] } }, endMeeting: { type: 'boolean' },
  },
};

const COMPANY_NAMES = ['Aハウス', 'Bハウス', 'Cデザイン', 'D工務店'];
const SYSTEM_WORDS = /Claude|クロード|ＡＩ|AI|人工知能|エンジン|ゲーム|シミュレーション|プロンプト|世界線/;
// 数字：算用数字・漢数字＋単位・単位の語。差し込み枠の中は除く
const DIGITS = /[0-9０-９]|[一二三四五六七八九十百千万]+(?:万|円|坪|帖|畳|日|か月|ヶ月|年|件|台|部屋)|万円|坪|帖/;
const sentences = t => String(t || '').split(/[。！？!?]/).map(x => x.trim()).filter(Boolean).length;
const stripSlots = t => String(t || '').replace(/\{(price|area|days)\}/g, '');

// 検査（base.validator）。通らなければ理由を返す（作り直し）。
export function checkRep(out, { phase = 'followUp', company } = {}) {
  if (!out || typeof out.say !== 'string' || !out.say.trim()) return '返事（say）が空';
  const max = phase === 'summary' ? 3 : 2;
  if (sentences(out.say) > max) return `say は${max}文まで`;
  if (out.ask && (String(out.ask).match(/[？?]/g) || []).length > 1) return '質問は1つまで';
  if (out.ask && /[？?]/.test(out.say)) return 'say にも ask にも質問がある（質問は1つまで）';
  for (const t of [out.say, out.ask || '']) {
    if (DIGITS.test(stripSlots(t))) return '数字は差し込み枠（{price} {area} {days}）で';
    if (SYSTEM_WORDS.test(t)) return '仕組みの言葉が入っている';
    if (COMPANY_NAMES.some(n => n !== company && t.includes(n))) return 'ほかの会社の名前が入っている';
  }
  if (phase === 'summary' && !/ご記入ありがとうございます/.test(out.say)) return '総括は「ご記入ありがとうございます。」から';
  return null;
}

// その会社の決まり文句（2回作り直しても通らないとき）
export function stockReply(harness, company, phase) {
  const c = harness.companies[company] || harness.companies.C;
  const say = phase === 'summary' ? `ご記入ありがとうございます。${c.replaceTone?.[0]?.replace(/^.*?。/, '') || 'いただいた内容で、プランを考えてみます。'}` : phase === 'confirm' ? 'この内容で進めますが、問題ないでしょうか？' : (c.stockLines?.[0] || '承知しました。');
  return { say, ask: null, notes: [], deferred: [], slots: [], endMeeting: false, stock: true };
}

// システムプロンプト：base.identity＋behaviors＋その場面のphases＋その会社のcompanies＋自社の標準仕様＋要望の記憶の要約＋examples（その場面の分）
export function buildRepSystem(harness, { company = 'C', phase = 'followUp', staff, specs = [], memory = '', names = {}, extra = '' } = {}) {
  const b = harness.base, c = harness.companies[company] || harness.companies.C, ph = b.phases[phase] || b.phases.followUp;
  const ex = b.examples.filter(e => e.phase === phase);
  const A = names.a || 'あなた', B = names.b || 'パートナー';
  return [
    b.identity,
    staff ? `あなたは ${staff.companyName || ''}の${staff.role || '担当者'}・${staff.name || ''}です（${staff.type || ''}）。` : '',
    `# ふるまい\n${b.behaviors.map(x => '- ' + x).join('\n')}`,
    `# いまの場面：${ph.role}\n${ph.rule}`,
    `# あなたの会社の個性\n- 総括の切り口：${c.angle}\n- 深く聞く話題：${c.digDeep.join('、')}\n- 口調：${c.tone}\n- くせ：${c.quirk}\n- 言いがちな一言：${(c.stockLines || []).join('／')}\n- あいさつの例：${(c.replaceTone || []).join('／')}`,
    specs.length ? `# 自社の標準仕様（この範囲でだけ答える）\n${specs.map(x => '- ' + x).join('\n')}` : '',
    `# お客様\n- ご主人の呼び名：${A}／奥様の呼び名：${B}`,
    memory ? `# 要望の記憶（アンケートと、これまでの打ち合わせ）\n${memory}` : '',
    extra ? `# この場面の補足\n${extra}` : '',
    ex.length ? `# 例\n${ex.map(e => `お客様：${e.customer}\n悪い例：${e.bad}\nよい例：${e.good}\n（理由：${e.why}）`).join('\n\n')}` : '',
    `# 出力\nJSONで返す。say：受け止めと答え（${phase === 'summary' ? '3' : '2'}文まで、質問を入れない）。ask：質問（1つだけ、なければ null）。notes：要望の記憶に入れる、お客様の要望の言葉（短く、要望でない事実や名前は入れない）。deferred：預かったこと。slots：使った差し込み枠。endMeeting：区切ってよいとき true。`,
  ].filter(Boolean).join('\n\n');
}

// 差し込み枠に、コードの値を入れる（値がないときは、数字を使わない言い方に）
export function fillSlots(text, values = {}) {
  return String(text || '').replace(/\{(price|area|days)\}/g, (_, k) => values[k] ?? { price: 'お見積りの金額', area: '広さ', days: '日程' }[k]);
}
