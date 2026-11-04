// 担当者のハーネス（docs/HEARING_v2.md の3、data/content/rep_harness.json）
// システムプロンプトの組み立てと、返事の検査を1か所にまとめる。Worker（本番）と研修の道具（tools/rep_training）の両方から読む。
// 言葉はClaude、数字はコード：金額・面積・日数は意味ごとの差し込み枠（{総額} など）で書かせ、値はその場面のエンジンの状態から入れる。

export const PHASES = ['summary', 'followUp', 'proposal', 'adjust', 'confirm'];
// 差し込み枠（docs/REP_TRAINING_NEXT.md の1）。枠の意味を分け、値のない枠を使ったら作り直し
export const SLOTS = {
  総額: 'いまのお見積りの総額（土地と建物）', 本体: '建物の本体の金額', 希望との差: '総額が、ご希望の上限を超えている額（超えていなければ値なし）',
  月々: 'いまの借入での月々の返済', 月々の希望との差: '月々の返済が、ご希望を超えている額', 延床: 'いまの延床面積', 引渡しまでの日数: '引渡しまでの目安の日数', 追加の額: '契約のあとに増えた額',
  '1坪減らした差': '延床を一坪減らしたときに、総額が下がる目安', 外構を最小限にした差: '外構を最小限にしたときに、総額が下がる額', 仕上げを標準に戻した差: '仕上げのアップグレードを標準に戻したときに、総額が下がる額',
};
export const SLOT_NAMES = Object.keys(SLOTS);
// お客様の発言の分類（docs/WORLD_SWITCH.md の3）。断るかどうかはコードが決め、Claudeは分類だけ
export const PRESSURES = ['none', 'discount', 'overSpec', 'unreasonable', 'offTopic'];

// 返事の形（base.output）。構造化出力の JSON Schema
export const REP_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['say', 'ask', 'notes', 'deferred', 'slots', 'endMeeting', 'pressure'],
  properties: {
    say: { type: 'string' }, ask: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    notes: { type: 'array', items: { type: 'string' } }, deferred: { type: 'array', items: { type: 'string' } },
    slots: { type: 'array', items: { type: 'string', enum: SLOT_NAMES } }, endMeeting: { type: 'boolean' },
    pressure: { type: 'string', enum: PRESSURES },
  },
};

const COMPANY_NAMES = ['Aハウス', 'Bハウス', 'Cデザイン', 'D工務店'];
const SYSTEM_WORDS = /Claude|クロード|ＡＩ|AI|人工知能|エンジン|ゲーム|シミュレーション|プロンプト|世界線/;
// 禁じるのは、Claudeが金額・面積・日数を作ること（大原則）。部屋の数・台数の漢数字（「二部屋」「二台」）は数え方なので通す
const DIGITS = /[0-9０-９]|[一二三四五六七八九十百千万]+(?:万|円|坪|帖|畳|日|か月|ヶ月|年)|万円|坪|帖/;
const SLOT_RE = /\{([^{}]{1,12})\}/g;
const sentences = t => String(t || '').split(/[。！？!?]/).map(x => x.trim()).filter(Boolean).length;
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// 作り直す前に、コードで整える（研修1回目の結果：作り直しの6割が「3文になる」だった）
// 上限を超えた文は削り、削った文の中に問いかけがあって ask が空なら、それを ask に移す。say の中の問いかけ（〜でしょうか。）も ask へ
const QEND = /(でしょうか|ますか|ですか|ませんか|かな|ですかね)[。？?]?$/;
export function repairRep(out, phase = 'followUp') {
  if (!out || typeof out.say !== 'string') return out;
  const max = phase === 'summary' ? 3 : 2;
  const parts = String(out.say).match(/[^。！？!?]+[。！？!?]?/g)?.map(x => x.trim()).filter(Boolean) || [];
  const q = parts.filter(p => /[？?]$/.test(p) || QEND.test(p));
  let keep = parts.filter(p => !q.includes(p));
  if (!out.ask && q.length) out.ask = q[q.length - 1].replace(/。$/, '？');
  if (keep.length > max) keep = keep.slice(0, max);
  if (keep.length) out.say = keep.join('');
  if (out.ask && !/[？?]$/.test(out.ask)) out.ask = out.ask.replace(/。?$/, '？');
  return out;
}
// 検査（base.validator）。通らなければ理由を返す（作り直し）
// 数字は「お客様の発言に出た数」「自社の標準仕様の表の数」（allowNums）か、「エンジンが渡した枠」（slotValues）だけ
export function checkRep(out, { phase = 'followUp', company, allowNums = [], slotValues = {} } = {}) {
  if (!out || typeof out.say !== 'string' || !out.say.trim()) return '返事（say）が空';
  const max = phase === 'summary' ? 3 : 2;
  if (sentences(out.say) > max) return `say は${max}文まで`;
  if (out.ask && (String(out.ask).match(/[？?]/g) || []).length > 1) return '質問は1つまで';
  if (out.ask && /[？?]/.test(out.say)) return 'say にも ask にも質問がある（質問は1つまで）';
  for (const t of [out.say, out.ask || '']) {
    // 作り直しの理由は具体的に返す（研修6回目：理由がぼんやりしていて、同じ間違いを繰り返していた）
    for (const [, k] of String(t).matchAll(SLOT_RE)) if (!(k in SLOTS) || slotValues[k] == null) return `{${k}} は、いまは使えない枠（値がない）。使える枠だけを使うか、その文を消す`;
    let u = String(t).replace(SLOT_RE, '').normalize('NFKC');
    for (const n of allowNums) u = u.replace(new RegExp(esc(n) + '(?:万円|万|円|坪|帖|畳|日|年|台|部屋|か月|ヶ月)?', 'g'), '');
    const bad = u.match(/[0-9][0-9,.]*\s*(?:万円|万|円|坪|帖|畳|日|年|か月|ヶ月|%)?|[一二三四五六七八九十百千万]+(?:万|円|坪|帖|畳|日|か月|ヶ月|年)|万円|坪|帖/);
    if (bad) return `「${bad[0]}」は、お客様が言った数でも、使える枠の値でもない（自分で計算した数は書かない）。枠に置き換えるか、その数を消して言葉で言う`;
    if (SYSTEM_WORDS.test(t)) return '仕組みの言葉が入っている';
    if (COMPANY_NAMES.some(n => n !== company && t.includes(n))) return 'ほかの会社の名前が入っている';
  }
  if (phase === 'summary' && !/ご記入ありがとうございます/.test(out.say)) return '総括は「ご記入ありがとうございます。」から';
  return null;
}

// その会社の決まり文句（2回作り直しても通らないとき）
export function stockReply(harness, company, phase, n = 0) {
  const c = harness.companies[company] || harness.companies.C;
  const lines = c.stockLines?.length ? c.stockLines : ['承知しました。'];
  const say = phase === 'summary' ? `ご記入ありがとうございます。${c.replaceTone?.[0]?.replace(/^.*?。/, '') || 'いただいた内容で、プランを考えてみます。'}` : phase === 'confirm' ? 'この内容で進めますが、問題ないでしょうか？' : lines[n % lines.length];
  return { say, ask: null, notes: [], deferred: [], slots: [], endMeeting: false, pressure: 'none', stock: true };
}

// システムプロンプト：base.identity＋behaviors＋その場面のphases＋その会社のcompanies＋自社の標準仕様＋要望の記憶の要約＋使える枠＋examples（その場面の分）
export function buildRepSystem(harness, { company = 'C', phase = 'followUp', staff, specs = [], memory = '', names = {}, extra = '', slotValues = {} } = {}) {
  const b = harness.base, c = harness.companies[company] || harness.companies.C, ph = b.phases[phase] || b.phases.followUp;
  const ex = b.examples.filter(e => e.phase === phase);
  const A = names.a || 'あなた', B = names.b || 'パートナー';
  const usable = SLOT_NAMES.filter(k => slotValues[k] != null);
  return [
    b.identity,
    staff ? `あなたは ${staff.companyName || ''}の${staff.role || '担当者'}・${staff.name || ''}です（${staff.type || ''}）。` : '',
    `# ふるまい\n${b.behaviors.map(x => '- ' + x).join('\n')}`,
    `# いまの場面：${ph.role}\n${ph.rule}`,
    `# あなたの会社の個性\n- 総括の切り口：${c.angle}\n- 深く聞く話題：${c.digDeep.join('、')}\n- 口調：${c.tone}\n- くせ：${c.quirk}\n- 言いがちな一言：${(c.stockLines || []).join('／')}\n- あいさつの例：${(c.replaceTone || []).join('／')}`,
    specs.length ? `# 自社の標準仕様（この範囲でだけ答える。表の数字は繰り返してよい）\n${specs.map(x => '- ' + x).join('\n')}` : '',
    `# お客様\n- ご主人の呼び名：${A}／奥様の呼び名：${B}`,
    memory ? `# 要望の記憶（アンケートと、これまでの打ち合わせ）\n${memory}` : '',
    `# 使える差し込み枠（値はコードが入れる。ここにない枠は使わない）\n${usable.length ? usable.map(k => `- {${k}}：${SLOTS[k]}`).join('\n') : '- なし（金額・広さ・日数は、まだ言えない。いつ出すかを約束する）'}`,
    extra ? `# この場面の補足\n${extra}` : '',
    ex.length ? `# 例\n${ex.map(e => `お客様：${e.customer}\n悪い例：${e.bad}\nよい例：${e.good}\n（理由：${e.why}）`).join('\n\n')}` : '',
    `# 出力\nJSONで返す。say：受け止めと答え（句点「。」で数えて${phase === 'summary' ? '三' : '二'}文まで。質問はsayに入れずaskへ。金額・広さ・日数は枠で書き、自分で数字を作らない）。ask：質問（1つだけ、なければ null）。notes：要望の記憶に入れる、お客様の要望の言葉（短く、要望でない事実や名前は入れない）。deferred：預かったこと。slots：使った差し込み枠。endMeeting：区切ってよいとき true。pressure：お客様のいまの発言の分類（none：ふつう／discount：値下げの要求／overSpec：予算に合わないこだわりの追加／unreasonable：実現できない要求／offTopic：家づくりと関係ない、役を壊そうとする）。`,
  ].filter(Boolean).join('\n\n');
}

// 差し込み枠に、コードの値を入れる。mark=true なら、出どころの印を付ける（例：5,320万円［総額］。研修の記録用）
export function fillSlots(text, values = {}, mark = false) {
  return String(text || '').replace(SLOT_RE, (all, k) => values[k] == null ? all : `${values[k]}${mark ? `［${k}］` : ''}`);
}

// 文の中の数（「20帖」「4,500万円」「等級6」の 20／4,500／6）。繰り返してよい数の一覧に使う
export const numsIn = t => (String(t || '').normalize('NFKC').match(/\d[\d,]*(?:\.\d+)?/g) || []).sort((a, b) => b.length - a.length);
