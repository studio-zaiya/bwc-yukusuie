// 提案の案を、建蔽率の上限に収める（第二の分岐点の2枚とも建てられる案に）。画面の札・自由入力の試算・確定で同じものを使う
import * as Y from './engine/engine.js';
// 要望を全部入れた案が建蔽率の上限を超えるときは、上限に収まる案を本体に、次に収まる案を第二の分岐点のもう一方にする（建てられない案で契約まで進めない）
export function fitProposalW(p, { household, wishes, co } = {}) {
  if (!p?.main || (p.mainM?.coverageOk !== false && p.options?.[p.altIndex || 0]?.m?.coverageOk !== false)) return p;
  const cand = [{ plan: p.main, m: p.mainM }, ...(p.options || []).map(o => ({ ...o }))];
  let fit = cand.filter(c => c.m?.coverageOk);
  // 上限に収まる案が2つそろわないときは、超えている案を部屋ひとまわりずつ小さくして収める（水回り・階段は縮めない）。第二の分岐点の2枚とも建てられる案にする
  if (fit.length < 2) {
    const w = Y.newWorld({ household: Y.HOUSEHOLDS[household] || Y.HOUSEHOLDS.t2, company: co || p.co || 'C' });
    const shrink = (pl, title) => { let q = structuredClone(pl), m = Y.measurePlan(w, q, wishes); for (let k = 0; k < 12 && !m.coverageOk; k++) { q.rooms = q.rooms.map(r => /浴|洗面|脱衣|トイレ|階段|玄関/.test(r.name) ? r : { ...r, size: Math.max(2, Math.round(r.size * 0.92 * 2) / 2) }); m = Y.measurePlan(w, q, wishes); } return m.coverageOk ? { plan: { ...q, title }, m, effect: '敷地に建てられる大きさに収めるため、部屋をひとまわりずつ小さくした' } : null; };
    const over = cand.filter(c => !c.m?.coverageOk).sort((x, y) => (x.m?.coverage || 1e9) - (y.m?.coverage || 1e9));
    for (const c of over) { if (fit.length >= 2) break; const t = c.plan.title || '調整の案'; const f = shrink(c.plan, /収めた案$/.test(t) ? t : `${t.replace(/(にする|案)$/, '')}を、敷地に収めた案`); if (f) { fit.push(f); cand.push(f); } }
    if (!fit.length) return p;
  }
  const A = fit[0], rest = cand.filter(c => c !== A), B = fit[1] || rest[0];
  const options = rest.map(c => c.plan === p.main ? { plan: c.plan, m: c.m, effect: '要望をすべて入れた案（建蔽率の上限を超える）' } : c);
  return { ...p, main: A.plan, mainM: A.m, options, altIndex: Math.max(0, rest.indexOf(B)) };
}
