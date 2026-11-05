// 分岐点ごとの「守ろうとしたもの」：根拠（自由回答・アンケート・選んだ札ともう一方との差）のあるものだけ。作り話の理由は書かない
// 印刷レポート（report.html）と、ゲーム内のレポート画面で同じものを使う
import * as Y from './engine/engine.js';
const man = n => Math.round(Number(n)).toLocaleString('ja-JP');
const sgn = n => (n > 0 ? '+' : n < 0 ? '−' : '±') + man(Math.abs(n));
export function protectedReasons(player, others, memory) {
  const me = Y.outcome(player), all = [player, ...(others || [])].map(w => Y.outcome(w));
  const sib = i => all.find(o => o.bits.length === me.bits.length && o.bits.every((b, k) => k === i ? b !== me.bits[k] : b === me.bits[k]));
  const warmTop = memory?.limits?.warmPriority === 'top'; let warmUsed = false;
  // 2択の外の答え（◆）が後の分岐点にあるとき、それより前の分岐点の「もう一方」との暖かさの差は◆から来ているので、理由に使わない（守りの監査11/5）
  const thirdAt = ['D1', 'D2', 'D3', 'D4'].indexOf(me.third);
  return me.labels.map((_, i) => {
    const memo = (player.memory || []).find(m => m.decisionId === `D${i + 1}`);
    if (memo?.reason) return { t: memo.reason, by: '自由回答' };
    const o2 = sib(i); if (!o2) return { t: '—', by: '選んだ札' };
    if (i > 0 && warmTop && !warmUsed && !(thirdAt > i) && me.warmth.level > o2.warmth.level) { warmUsed = true; return { t: '冬の暖かさ（いちばん大事と答えた）', by: 'アンケート' }; }
    if (Math.round(me.total) < Math.round(o2.total) - 5) return { t: `総額を抑えること（もう一方より ${man(Math.round(o2.total) - Math.round(me.total))}万円低い）`, by: '選んだ札' };
    if (i === 0) return { t: `${Y.COMPANIES[me.company].kind}の${Y.COMPANIES[me.company].name}と建てること`, by: '選んだ札' };
    const dif = !(thirdAt > i) && me.warmth.level > o2.warmth.level ? `冬の暖かさ（もう一方は「${o2.warmth.label}」）` : me.spec.tsubo > o2.spec.tsubo ? `広さ（もう一方より ${me.spec.tsubo - o2.spec.tsubo}坪広い）` : me.spec.exterior === 'full' && o2.spec.exterior !== 'full' ? '入居の日から整った外まわり' : Y.finishCost(me.finish) > Y.finishCost(o2.finish) ? `${[me.finish.wall !== 'std' && '外壁', me.finish.floor !== 'std' && '床', me.finish.inner !== 'vinyl' && '内壁'].filter(Boolean).join('と') || '仕上げ'}の見た目` : me.days < o2.days ? `早い引渡し（もう一方より ${o2.days - me.days}日早い）` : '';
    return dif ? { t: `${dif}　もう一方より ${man(Math.round(me.total) - Math.round(o2.total))}万円高い`, by: '選んだ札' } : { t: `もう一方との差は小さい（${sgn(Math.round(me.total) - Math.round(o2.total))}万円）`, by: '選んだ札' };
  });
}
