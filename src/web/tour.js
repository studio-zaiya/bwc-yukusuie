/* 操作の案内（スポットライト型）。案内する部分だけを明るく残し、ほかは半透明の灰色で覆う。
 * 起きることの予告やヒントは出さない（操作の仕方とやることだけ）。一度見た案内は出さない。?rec=1 と再生では出さない */
const TOURS = {
  sources: { when: s => s.scene === 'sources', steps: [['.srcs', '気になる入口を開くと、会社についての話が集まります。良い話も、気になる話もあります。'], ['.visitpick', '集めた話から、実際に訪ねる2社を選びます。']] },
  play: {
    when: s => ['hearing', 'hearing2'].includes(s.scene), steps: [
      ['.hero', 'あなたの家です。家づくりが進むと、形が決まり、工事で立ち上がっていきます。'],
      ['.pbar', '家づくりの手順です。いまの段階が金色の丸です。'],
      ['.moneyc', '金額の札です。総額（土地＋建物）と借入、下に自己資金。'],
      ['.chat .log', '担当者との会話です。担当者は、質問をしたり助言をしたりします。'],
      ['.chat .in', 'ここに自由に書いて送ります。話す人（かず／ゆう）も選べます。'],
      ['.navs', '迷ったら「SNSを見る」「自分のAIに聞く」。自分のAIは1ターンに1回です。'],
    ],
  },
  compare: { when: s => s.scene === 'compare', steps: [['.tabs', '訪ねた2社の提案です。タブで切り替えます。'], ['.qpanel', '見積の見せ方は、会社ごとに違います。'], ['.chat .in', 'それぞれの担当者に質問できます。']] },
  gallery: { when: s => s.others.length > 0 && ['fork', 'contract'].includes(s.scene), steps: [['.gal', '選ばなかった道も、別の世界線として同時に進みます。']] },
  fork: { when: s => s.scene === 'fork', steps: [['.cards', '分岐点です。札を押して選びます。下の欄に、自分の言葉で答えてもかまいません。']] },
  coord: { when: s => s.scene === 'coord', steps: [['.coord', '外壁・床・内壁を選ぶと、家に色が載ります。選んだ結果が、この分岐点の答えになります。']] },
  build: { when: s => s.scene === 'build', steps: [['.timeline', '工事の帳面です。「着工する ▶」で、工程が進みます。']] },
};
let active = null; // { key, i }
const seen = k => { try { return localStorage.getItem('yuku-tour-' + k) === '1'; } catch { return false; } };
const mark = k => { try { localStorage.setItem('yuku-tour-' + k, '1'); } catch { } };
const memo = new Set(); // localStorage が使えない環境でも、同じプレイ中は二度出さない

export function tourHTML() {
  if (!active) return '';
  const st = TOURS[active.key].steps[active.i];
  const last = active.i === TOURS[active.key].steps.length - 1;
  return `<div class="tour"><div class="tour-hole" id="tourHole"></div><div class="tour-bubble" id="tourBubble"><p>${st[1]}</p><div class="tour-acts"><span class="tour-n">${active.i + 1} / ${TOURS[active.key].steps.length}</span><button data-act="tourSkip">とばす</button><button class="on" data-act="tourNext">${last ? 'はじめる' : 'つぎへ'}</button></div></div></div>`;
}
export function tourAfterRender(s) {
  if (!active) {
    const key = Object.keys(TOURS).find(k => !seen(k) && !memo.has(k) && TOURS[k].when(s) && document.querySelector(TOURS[k].steps[0][0]));
    if (key) { active = { key, i: 0 }; requestAnimationFrame(() => import('./main.js').then(m => m.render())); return; }
  }
  if (active) place();
}
function place() {
  const st = TOURS[active.key].steps[active.i];
  const el = document.querySelector('#view ' + st[0]) || document.querySelector(st[0]);
  const hole = document.getElementById('tourHole'), bub = document.getElementById('tourBubble'), stage = document.getElementById('stage');
  if (!hole || !bub) return;
  if (!el) { hole.style.display = 'none'; bub.style.left = '760px'; bub.style.top = '460px'; return; }
  const k = stage.getBoundingClientRect().width / 1920, sr = stage.getBoundingClientRect(), r = el.getBoundingClientRect();
  const x = (r.left - sr.left) / k, y = (r.top - sr.top) / k, w = r.width / k, h = r.height / k;
  Object.assign(hole.style, { left: x - 8 + 'px', top: y - 8 + 'px', width: w + 16 + 'px', height: h + 16 + 'px', display: 'block' });
  const below = y + h + 200 < 1080;
  bub.style.left = Math.min(1920 - 520, Math.max(20, x)) + 'px';
  bub.style.top = (below ? y + h + 24 : Math.max(20, y - 190)) + 'px';
}
export function tourNext() { const t = TOURS[active.key]; if (active.i < t.steps.length - 1) active.i++; else { mark(active.key); memo.add(active.key); active = null; } }
export function tourSkip() { if (active) { mark(active.key); memo.add(active.key); } active = null; }
export function tourHelp(s) { const key = Object.keys(TOURS).find(k => TOURS[k].when(s) && document.querySelector(TOURS[k].steps[0][0])) || 'play'; active = { key, i: 0 }; }
