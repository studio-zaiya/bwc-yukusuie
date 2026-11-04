/* ゆくすいえ　プレイ画面レイアウト試作の共通部品（v2）
 * 進捗バー、16世界のフェーズ進行、担当者の実況オーバーレイ（線画）、チャット、出来事の札 */
(function (root) {
  'use strict';
  const Y = root.YKS, I = root.ISO;
  const STEPS_BAR = ['見学・相談', '初回打ち合わせ', 'プラン・見積', '設計申込・詳細', 'ショールーム', '契約', 'コーディネート・電気', '申請・着工', '上棟', '施主検査', '引渡し', '1年後'];
  const STEPS_S = ['見学', '初回', 'プラン', '設計申込', 'ショールーム', '契約', '色決め・電気', '着工', '上棟', '施主検査', '引渡し', '1年後'];
  const STEPS = ['見学・相談', '初回打ち合わせ', 'プラン提案・見積', '設計申込・詳細打ち合わせ', 'ショールーム', '契約', 'コーディネート・電気', '申請・着工', '上棟', '施主検査', '引渡し', '1年後'];
  const H = Y.HOUSEHOLDS.t2;
  const OPTS = { household: H, seed: 7, chosen: [0, 1, 1, 0], thirdAt: { D3: { patch: { borrowAdd: 60, spec: { window: 'triple' } } } } };
  const WORLDS = Y.allWorlds(OPTS);
  const YOU = 7;
  const hash = n => { let x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); };
  // 会社ごとの進み方（C：打ち合わせが深く遅い／A：契約まで速い／B：規格で速い）
  const PACE = { A: [1.12, 0.95], B: [1.15, 1.1], C: [0.86, 1.0], D: [1.0, 0.92] };
  function stepOf(w, p) { // p：プレイヤーの進捗（0〜11）
    if (w.no === YOU) return p;
    const [pre, post] = PACE[w.company] || [1, 1];
    const jitter = (hash(w.no) - 0.5) * 0.7;
    let s = p < 5 ? p * pre + jitter : 5 * pre + (p - 5) * post + jitter;
    return Math.max(0, Math.min(11, s));
  }
  function stageOf(s) { return s < 7 ? 0 : s < 8 ? 1 : s < 9 ? 2 : s < 9.6 ? 3 : 4; }
  // 区画の上の小さな出来事の札（世界ごとの事実から。数字はエンジン）
  function noteOf(w, s) {
    const co = Y.COMPANIES[w.company];
    if (w.no === YOU) return '';
    if (s < 2) return `${co.staff}さんと初回の打ち合わせ`;
    if (s < 3) return co.style === 'total' ? '総額で見積が届いた' : '見積の表紙が届いた';
    if (s < 4) return w.company === 'C' ? '詳細見積を待っている' : '設計の申込をした';
    if (s < 5) return 'ショールームで迷う';
    if (s < 6) return w.company === 'A' ? '月末に契約した' : '契約の日取りを決めた';
    if (s < 7) return w.spec.kitchen ? '造作キッチンの色決め' : 'コンセントの数を数える';
    if (s < 8) return '地鎮祭';
    if (s < 9) return w.increase ? `担当が替わった` : '上棟した';
    if (s < 10) return '施主検査';
    if (s < 11) return w.increase ? `+${w.increase}万円で引渡し` : '引渡し';
    return w.events[0] || '1年が過ぎた';
  }
  function worldsAt(p) {
    return WORLDS.map(w => { const s = stepOf(w, p); return { w, s, stage: stageOf(s), ghost: s >= 2 && s < 7 ? +(0.35 + (s - 2) / 5 * 0.45).toFixed(2) : 0, note: noteOf(w, s) }; });
  }
  function view(list, opt = {}) {
    return list.map(({ w, stage }) => ({ no: w.no, stage, roof: w.spec.roof, fin: I.FINISH[(w.no * 5) % 8], lamp: false, third: !!w.third && w.no === YOU && stage >= 4, gravel: w.spec.exterior !== 'full' && stage >= 4, mark: '' }));
  }

  // 進捗バー
  function progressBar(p, o = {}) {
    const cur = Math.floor(p);
    const items = STEPS.map((s, i) => {
      const st = i < cur ? 'done' : i === cur ? 'now' : 'todo';
      return `<li class="pb-${st}"><i></i><span>${STEPS_BAR[i]}</span></li>`;
    }).join('');
    return `<ol class="pbar ${o.compact ? 'compact' : ''}">${items}</ol>`;
  }

  // 期限の時計の札
  function clocks(p) {
    const day = Math.round(p < 5 ? p * 13 : 65 + (p - 5) * 38);
    const land = 60 - day, loan = 90 - day;
    const out = [`<span class="clk"><b>${day}</b>日目</span>`];
    if (land > 0) out.push(`<span class="clk soft">土地の契約まで ${land}日</span>`);
    else if (loan > 0) out.push(`<span class="clk soft">ローン特約の期限まで ${loan}日</span>`);
    return out.join('');
  }

  // 線画の顔（担当者・夫婦）。kind: takahashi / sasaki / kobayashi / mori / kazu / yuu
  function face(kind, size = 120) {
    const ink = '#1E2B36';
    const hair = {
      takahashi: '<path d="M30 46 Q32 20 60 18 Q88 20 90 46 Q84 34 60 32 Q40 32 30 46Z" fill="#1E2B36"/>',
      sasaki: '<path d="M30 48 Q30 18 60 17 Q90 18 90 48 L86 40 Q60 26 36 38Z" fill="#1E2B36"/><circle cx="48" cy="58" r="8" fill="none" stroke="#1E2B36" stroke-width="2.4"/><circle cx="72" cy="58" r="8" fill="none" stroke="#1E2B36" stroke-width="2.4"/><line x1="56" y1="58" x2="64" y2="58" stroke="#1E2B36" stroke-width="2.4"/>',
      kobayashi: '<path d="M28 52 Q26 16 60 16 Q94 16 92 52 Q92 70 86 80 L84 50 Q60 30 36 50 L34 80 Q28 70 28 52Z" fill="#1E2B36"/>',
      mori: '<path d="M34 40 Q40 24 60 24 Q80 24 86 40" fill="none" stroke="#1E2B36" stroke-width="2.6"/><path d="M40 82 Q60 96 80 82" fill="none" stroke="#1E2B36" stroke-width="2"/>',
      kazu: '<path d="M30 46 Q30 18 60 18 Q90 18 90 46 Q80 30 64 30 Q44 30 30 46Z" fill="#1E2B36"/>',
      yuu: '<path d="M28 56 Q24 16 60 16 Q96 16 92 56 Q92 76 96 88 L84 86 L84 48 Q60 28 36 48 L36 86 L24 88 Q28 76 28 56Z" fill="#1E2B36"/>',
    }[kind] || '';
    const shirt = { kazu: '#E8701F', yuu: '#1C8DCC' }[kind] || '#FFFFFF';
    return `<svg viewBox="0 0 120 130" width="${size}" height="${size * 130 / 120}" class="face">
      <path d="M14 130 Q18 98 60 96 Q102 98 106 130Z" fill="${shirt}" stroke="${ink}" stroke-width="2.6" stroke-linejoin="round"/>
      ${kind === 'kazu' || kind === 'yuu' ? '' : '<path d="M52 98 L60 116 L68 98" fill="none" stroke="#1E2B36" stroke-width="2.2"/>'}
      <path d="M50 86 L50 98 Q60 104 70 98 L70 86" fill="#FFF6EC" stroke="${ink}" stroke-width="2.4"/>
      <ellipse cx="60" cy="56" rx="30" ry="34" fill="#FFF6EC" stroke="${ink}" stroke-width="2.6"/>
      <circle cx="48" cy="60" r="2.6" fill="${ink}"/><circle cx="72" cy="60" r="2.6" fill="${ink}"/>
      <path d="M52 76 Q60 81 68 76" fill="none" stroke="${ink}" stroke-width="2.2" stroke-linecap="round"/>
      ${hair}
    </svg>`;
  }
  const STAFF = { A: ['takahashi', '営業・高橋'], B: ['kobayashi', '営業・小林'], C: ['sasaki', '設計・佐々木'], D: ['mori', '社長・森'] };
  function coTag(id, s = 30) {
    const sh = Y.COMPANIES[id].shape;
    return `<span class="coTag ${sh}" style="width:${s}px;height:${s}px;font-size:${Math.round(s * .5)}px">${id}</span>`;
  }
  // 実況のオーバーレイ（下に小さく、背景透過）
  function caster(lines) { // lines: [{who:'C'|'kazu'|'yuu', text}]
    return `<div class="caster">${lines.map(l => {
      const isCo = 'ABCD'.includes(l.who);
      const f = isCo ? STAFF[l.who][0] : l.who;
      const name = isCo ? `${Y.COMPANIES[l.who].name}　${STAFF[l.who][1]}` : (l.who === 'kazu' ? 'かず' : 'ゆう');
      return `<div class="cst"><div class="cf">${face(f, 92)}</div><div class="cb"><div class="cn">${isCo ? coTag(l.who, 22) : `<i class="${l.who === 'kazu' ? 'sq' : 'ci'}"></i>`}${name}</div><div class="ct">${l.text}</div></div></div>`;
    }).join('')}</div>`;
  }

  const CSS = `
:root{--paper:#FFFAF0;--sky:#CFEBFA;--ground:#F3E7CF;--grass:#9BD27A;--ink:#1E2B36;--ink2:#6B6358;--kazu:#E8701F;--kazuT:#B3541A;--yuu:#1C8DCC;--yuuT:#14699A;--gold:#F2C230;--goldT:#8C6A00;
--f:"Hiragino Sans","Hiragino Kaku Gothic ProN","BIZ UDPGothic","Noto Sans CJK JP",sans-serif;--fr:"Zen Maru Gothic","Hiragino Maru Gothic ProN","Hiragino Sans",sans-serif}
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;background:#E9E2D3;overflow:hidden}
body{font-family:var(--f);color:var(--ink)}
#stage{position:absolute;left:50%;top:50%;width:1920px;height:1080px;transform:translate(-50%,-50%) scale(var(--k,1));background:var(--paper);overflow:hidden}
.pbar{display:flex;list-style:none;gap:0;font-size:14px;color:var(--ink2)}
.pbar li{flex:1;position:relative;padding-top:20px;text-align:center;white-space:nowrap}
.pbar li i{position:absolute;top:6px;left:0;right:0;height:4px;background:rgba(30,43,54,.14)}
.pbar li::before{content:"";position:absolute;top:2px;left:50%;width:12px;height:12px;margin-left:-6px;border-radius:50%;background:#fff;border:2px solid rgba(30,43,54,.3);z-index:1}
.pbar li.pb-done i{background:var(--ink)}.pbar li.pb-done::before{background:var(--ink);border-color:var(--ink)}
.pbar li.pb-now i{background:linear-gradient(90deg,var(--ink) 50%,rgba(30,43,54,.14) 50%)}
.pbar li.pb-now::before{width:18px;height:18px;margin-left:-9px;top:-1px;background:var(--gold);border:2.5px solid var(--ink)}
.pbar li.pb-now span{color:var(--ink);font-weight:700}
.pbar.compact{font-size:12px}
.clk{display:inline-block;background:var(--paper);border:1.5px solid var(--ink);border-radius:999px;padding:5px 16px;font-size:19px;margin-right:10px}
.clk b{font-size:22px;margin-right:2px}.clk.soft{border-color:rgba(30,43,54,.3);color:var(--ink2)}
.coTag{display:inline-grid;place-items:center;background:var(--ink);color:var(--paper);font-weight:900;vertical-align:middle;margin-right:8px;flex:none}
.coTag.square{border-radius:3px}.coTag.circle{border-radius:50%}.coTag.triangle{clip-path:polygon(50% 0,100% 100%,0 100%);padding-top:30%}.coTag.hex{clip-path:polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%)}
.sq{display:inline-block;width:14px;height:14px;background:var(--kazu);margin-right:8px;vertical-align:-1px}
.ci{display:inline-block;width:14px;height:14px;background:var(--yuu);border-radius:50%;margin-right:8px;vertical-align:-1px}
.caster{position:absolute;display:flex;gap:18px;pointer-events:none}
.cst{display:flex;align-items:flex-end;gap:8px}
.cf{filter:drop-shadow(0 3px 0 rgba(30,43,54,.08))}
.cb{background:rgba(255,250,240,.92);border:1.5px solid rgba(30,43,54,.22);border-radius:12px;padding:8px 14px;margin-bottom:10px;max-width:420px}
.cn{font-size:14px;color:var(--ink2);display:flex;align-items:center;margin-bottom:2px}
.ct{font-size:19px;line-height:1.45}
.chat{background:#fff;border:1.5px solid rgba(30,43,54,.2);border-radius:18px;box-shadow:0 10px 30px rgba(30,43,54,.10);display:flex;flex-direction:column}
.chat .log{flex:1;overflow:hidden;padding:18px 22px;display:flex;flex-direction:column;gap:12px;justify-content:flex-end}
.msg{max-width:84%;font-size:20px;line-height:1.55;padding:10px 16px;border-radius:14px;background:#F4F1EA}
.msg.me{align-self:flex-end;background:#EAF4FB}
.msg .who{display:flex;align-items:center;font-size:14px;color:var(--ink2);margin-bottom:2px}
.chat .opts{display:flex;gap:10px;padding:0 22px 12px;flex-wrap:wrap}
.opt{font:700 19px var(--f);padding:12px 18px;border-radius:12px;border:1.5px solid var(--ink);background:var(--paper);cursor:pointer}
.chat .in{display:flex;gap:10px;padding:12px 16px;border-top:1px solid rgba(30,43,54,.1)}
.chat .in input{flex:1;font:20px var(--f);padding:12px 14px;border:1.5px solid rgba(30,43,54,.35);border-radius:10px;background:var(--paper)}
.btn{font:700 20px var(--f);padding:12px 22px;border-radius:12px;border:2px solid var(--ink);background:var(--ink);color:var(--paper);cursor:pointer}
.btn.ghost{background:var(--paper);color:var(--ink)}
.ctrl{position:absolute;right:24px;top:18px;display:flex;gap:8px;z-index:20}
.ctrl button{font:700 15px var(--f);padding:6px 12px;border-radius:8px;border:1.5px solid var(--ink);background:var(--paper);cursor:pointer}
body.rec .ctrl{display:none}
`;

  function mount(renderFn) {
    const st = document.getElementById('stage');
    const fit = () => st.style.setProperty('--k', Math.min(innerWidth / 1920, innerHeight / 1080));
    addEventListener('resize', fit); fit();
    const q = new URLSearchParams(location.search);
    let p = parseFloat(q.get('p') || '3.4');
    if (q.has('rec')) document.body.classList.add('rec');
    const draw = () => renderFn(p);
    root.render = t => { p = t; draw(); };
    root.DUR = 11; root.READY = true;
    const c = document.createElement('div'); c.className = 'ctrl';
    c.innerHTML = '<button data-d="-1">← 前のフェーズ</button><button data-d="1">次のフェーズ →</button><button data-a>再生</button>';
    st.appendChild(c);
    c.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.d) { p = Math.max(0, Math.min(11, Math.floor(p) + +b.dataset.d + 0.4)); draw(); }
      if (b.hasAttribute('data-a')) { let t0 = performance.now(), p0 = p; const run = n => { p = Math.min(11, p0 + (n - t0) / 1000 * 0.8); draw(); if (p < 11 && !run.stop) requestAnimationFrame(run); }; requestAnimationFrame(run); }
    });
    draw();
  }


  // 1軒を大きく描く（敷地・カーポート・木つき）
  function bigHouse(w, stage, o = {}) {
    const P = I.P; let s = '';
    const lot = [P(-20, -16), P(96, -16), P(96, 92), P(-20, 92)];
    s += I.poly(lot, stage >= 4 && w.spec.exterior !== 'full' ? '#E7E0D2' : '#F3E7CF', '#9BD27A', 2.4);
    if (stage === 0) s += I.poly([P(-6, -4), P(60, -4), P(60, 50), P(-6, 50)], 'none', '#1E2B36', 1.4, 'stroke-dasharray="5 4"');
    if (stage === 0 && o.ghost) s += `<g opacity="${o.ghost}">` + I.house({ x: 0, y: 0, w: 52, d: 44, h: 46, roof: w.spec.roof, fin: I.FINISH[0], stage: 3 }) + '</g>';
    else s += I.house({ x: 0, y: 0, w: 52, d: 44, h: 46, roof: w.spec.roof, fin: I.FINISH[(w.no * 5) % 8], stage: stage === 0 ? 0 : stage, third: !!w.third && stage >= 4 });
    if (stage >= 4) {
      const cp = (x, y) => { let t = ''; [[0,0],[24,0],[0,22],[24,22]].forEach(([a,b]) => { const q = P(x+a, y+b, 0), r = P(x+a, y+b, 20); t += `<line x1="${q[0]}" y1="${q[1]}" x2="${r[0]}" y2="${r[1]}" stroke="#8A8F96" stroke-width="1.6"/>`; }); t += I.poly([[0,0],[24,0],[24,22],[0,22]].map(([a,b]) => P(x+a, y+b, 20)), 'rgba(220,230,236,.85)', '#8A8F96', 1.2); return t; };
      s += cp(64, 56);
      [[-12, 80, 1.1], [86, -8, .9], [-14, 20, .8]].forEach(([x, y, k]) => { const a = P(x, y, 0), b = P(x, y, 12 * k); s += `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="#7A5A3A" stroke-width="2.4"/><circle cx="${b[0]}" cy="${b[1] - 7 * k}" r="${11 * k}" fill="#7DBF62" stroke="#1E2B36" stroke-width="1.2"/>`; });
    }
    const minX = P(-20, 92)[0] - 10, maxX = P(96, -16)[0] + 10, minY = P(-20, -16)[1] - 90, maxY = P(96, 92)[1] + 10;
    return `<svg viewBox="${minX} ${minY} ${maxX - minX} ${maxY - minY}" xmlns="http://www.w3.org/2000/svg" style="${o.style || ''}">${s}</svg>`;
  }


  // 場面ごとの会話（試作の文例。本番はClaudeが生成し、数字はエンジンから差し込む）
  function scene(p) {
    const me = WORLDS[YOU - 1], q = me.quote;
    const S = [
      { log: [['C', 'ご来場ありがとうございます。まずは、こちらのアンケートからお願いします。'], ['me', 'はい。……家族構成と、今の住まいと、ご予算と。']], opts: ['書きはじめる'], cast: [['C', '書ける範囲で大丈夫ですよ。'], ['yuu', '予算の欄、空けとく？']] },
      { log: [['C', 'ご主人は、どんな家がいいですか。'], ['me', 'かっこいい外観。ミニマルに。'], ['C', '奥様は？']], opts: ['ゆうが答える', 'あとでまとめて送る'], cast: [['C', 'キッチンのこだわりは、ありますか。'], ['kazu', '造作がいいな。']] },
      { log: [['C', `総額でお出しします。${q.real.toLocaleString()}万円です。付帯工事と外構、諸費用まで入っています。`], ['me', 'ほかの会社より、ずいぶん高く見える……。']], opts: ['内訳を聞く', 'ほかの会社と比べる'], cast: [['C', '後から増えにくい見積です。'], ['yuu', '表紙の数字だけじゃ、比べられないね。']] },
      { log: [['C', '設計のお申込みをいただければ、詳細の打ち合わせに入ります。詳細見積まで、6週間ほどいただきます。'], ['me', '土地の契約が、あと少しなんです。'], ['C', 'それなら、主な仕様だけ入れた見積で、契約の判断をしていただく方法もあります。']], opts: ['詳細の見積まで待つ', '主な仕様の見積で進める'], cast: [['C', '精度を上げるほど、時間はかかります。'], ['kazu', '土地は、待ってくれないよな。']] },
      { log: [['C', 'キッチンの面材は、こちらが標準です。'], ['me', '隣の、木目のほうが好きかも。']], opts: ['標準のまま', '木目に変える'], cast: [['C', '差額は、次回の見積でお出しします。'], ['yuu', 'ショールームって、全部よく見える……。']] },
      { log: [['C', '請負契約の書類です。図面と見積の内容をご確認ください。'], ['me', '外構は、これで全部入っていますか。']], opts: ['署名する', 'もう一度確認する'], cast: [['C', '気になる点は、今のうちに。'], ['kazu', '別途、の欄も見ておこう。']] },
      { log: [['C', 'コンセントの位置と、テレビを掛ける壁の下地は、どうしますか。'], ['me', 'テレビは……壁掛けにしたい、かも。']], opts: ['下地を入れる', 'あとで決める'], cast: [['C', '壁を閉じる前でないと、入れられません。'], ['yuu', 'そんなの、聞いてなかった。']] },
      { log: [['C', '確認の申請がおりました。来週、地鎮祭です。'], ['me', '晴れるといいな。']], opts: ['日程を確認する'], cast: [['C', '基礎の工事に入ります。'], ['kazu', 'いよいよだね。']] },
      { log: [['C', '上棟しました。骨組みだけの今が、いちばん家の形がわかります。'], ['me', '思ったより、広い。']], opts: ['現場を見に行く', '写真を送ってもらう'], cast: [['C', '窓の位置、確かめてみてください。'], ['yuu', '子どもたち、走り回ってる。']] },
      { log: [['C', '施主検査です。気になるところに、付箋を貼ってください。'], ['me', 'ここのクロス、少し浮いてる？']], opts: ['付箋を貼る', '問題なし'], cast: [['C', '引渡しまでに直します。'], ['kazu', 'しっかり見ておこう。']] },
      { log: [['C', '鍵をお渡しします。おめでとうございます。'], ['me', 'ありがとうございました。']], opts: ['鍵を受け取る'], cast: [['C', '1年後の点検で、またうかがいます。'], ['yuu', 'ついに、だね。']] },
      { log: [['C', '1年点検にうかがいました。'], ['me', '冬、暖かかったです。']], opts: ['16の区画を見る'], cast: [['C', 'クロスの割れを2か所、直しておきます。'], ['kazu', 'あっという間の1年。']] },
    ];
    return S[Math.min(11, Math.floor(p))];
  }
  function chatHTML(sc, o = {}) {
    const msgs = sc.log.map(([w, t]) => w === 'me' ? `<div class="msg me"><div class="who"><i class="sq"></i>かず</div>${t}</div>` : `<div class="msg"><div class="who">${coTag(w, 18)}${Y.COMPANIES[w].name}・${STAFF[w][1]}</div>${t}</div>`).join('');
    return `<div class="chat" style="${o.style || ''}"><div class="log">${msgs}</div><div class="opts">${sc.opts.map(x => `<button class="opt">${x}</button>`).join('')}</div><div class="in"><input placeholder="担当者に、自由に伝える・聞く"><button class="btn">送る</button></div></div>`;
  }
  const castOf = sc => caster(sc.cast.map(([who, text]) => ({ who, text })));


  function thumb(x, o = {}) {
    const w = x.w, stage = x.stage, P = I.P; let s = '';
    s += I.poly([P(-10, -8), P(60, -8), P(60, 54), P(-10, 54)], stage >= 4 && w.spec.exterior !== 'full' ? '#E7E0D2' : '#F3E7CF', '#9BD27A', 1.6);
    if (stage === 0 && x.ghost) s += `<g opacity="${x.ghost}">` + I.house({ x: 0, y: 0, w: 40, d: 34, h: 36, roof: w.spec.roof, fin: I.FINISH[0], stage: 3 }) + '</g>';
    else s += I.house({ x: 0, y: 0, w: 40, d: 34, h: 36, roof: w.spec.roof, fin: I.FINISH[(w.no * 5) % 8], stage });
    const minX = P(-10, 54)[0] - 4, maxX = P(60, -8)[0] + 4, minY = P(-10, -8)[1] - 60, maxY = P(60, 54)[1] + 4;
    return `<svg viewBox="${minX} ${minY} ${maxX - minX} ${maxY - minY}" style="${o.style || ''}">${s}</svg>`;
  }


  // 分譲地（16区画）：計画中は白い模型を半透明で、区画の上に出来事の札
  function estate2(list, o = {}) {
    const P = I.P, Lz = 96, gap = 18; let s = '', tags = '';
    const road = (x0, y0, x1, y1) => I.poly([P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)], '#E2D8C4', 'none', 0);
    s += road(-gap, -gap, 4 * (Lz + gap), 0); s += road(2 * (Lz + gap) - gap, -gap, 2 * (Lz + gap), 4 * (Lz + gap));
    const order = list.map((x, i) => [x, i]).sort((a, b) => (Math.floor(a[1] / 4) + a[1] % 4) - (Math.floor(b[1] / 4) + b[1] % 4));
    order.forEach(([x, i]) => {
      const r = Math.floor(i / 4), c = i % 4, X = c * (Lz + gap), Yy = r * (Lz + gap), w = x.w, you = w.no === YOU, hi = o.hi && o.hi.includes(w.no);
      s += I.poly([P(X, Yy), P(X + Lz, Yy), P(X + Lz, Yy + Lz), P(X, Yy + Lz)], x.stage >= 4 && w.spec.exterior !== 'full' ? '#E7E0D2' : '#F3E7CF', you ? '#1E2B36' : hi ? '#C99A00' : '#9BD27A', you ? 3.4 : hi ? 3 : 2.2, hi && !you ? 'stroke-dasharray="7 4"' : '');
      if (x.stage === 0 && x.ghost) s += `<g opacity="${x.ghost}">` + I.house({ x: X + 10, y: Yy + 8, roof: w.spec.roof, fin: I.FINISH[0], stage: 3 }) + '</g>';
      else s += I.house({ x: X + 10, y: Yy + 8, roof: w.spec.roof, fin: I.FINISH[(w.no * 5) % 8], stage: x.stage, third: !!w.third && you && x.stage >= 4 });
      const t = P(X + Lz - 4, Yy + Lz - 4);
      tags += `<g transform="translate(${t[0]},${t[1] + 4})"><rect x="-17" y="-12" width="34" height="22" rx="5" fill="${you ? '#1E2B36' : '#FFFAF0'}" stroke="#1E2B36" stroke-width="1.2"/><text x="0" y="4" text-anchor="middle" font-size="13" font-weight="700" fill="${you ? '#FFFAF0' : '#1E2B36'}">${String(w.no).padStart(2, '0')}</text></g>`;
      if (o.notes && x.note && (o.notes === true || o.notes.includes(w.no))) { const m = P(X + Lz / 2, Yy + Lz / 2, 74); const tw = x.note.length * 11 + 18; tags += `<g transform="translate(${m[0]},${m[1]})"><rect x="${-tw / 2}" y="-13" width="${tw}" height="22" rx="11" fill="rgba(255,250,240,.94)" stroke="rgba(30,43,54,.3)"/><text x="0" y="3" text-anchor="middle" font-size="11" fill="#1E2B36">${x.note}</text></g>`; }
    });
    const minX = P(0, 4 * (Lz + gap))[0] - 40, maxX = P(4 * (Lz + gap), 0)[0] + 40, minY = -120, maxY = P(4 * (Lz + gap), 4 * (Lz + gap))[1] + 30;
    return `<svg viewBox="${minX} ${minY} ${maxX - minX} ${maxY - minY}" xmlns="http://www.w3.org/2000/svg" style="${o.style || ''}">${s}${tags}</svg>`;
  }

  root.L = { Y, I, STEPS, H, WORLDS, YOU, worldsAt, view, progressBar, clocks, face, caster, coTag, CSS, mount, stageOf, hash, STAFF, STEPS_S, STEPS_BAR, bigHouse, thumb, estate2, scene, chatHTML, castOf };
})(window);
