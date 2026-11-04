/* ゆくすいえ　ロゴ（マークB：区画の菱形、文字：E式の丸ゴシック）
 * markSVG(p)：p=0..1 で、16の区画が1つずつ現れ、最後に07が橙で塗られる
 */
(function (root) {
  const TILES = [
    [60.0, 28.2], [74.7, 36.7], [89.4, 45.2], [104.2, 53.7],
    [45.3, 36.7], [60.0, 45.2], [74.7, 53.7], [89.4, 62.2],
    [30.6, 45.2], [45.3, 53.7], [60.0, 62.2], [74.7, 70.7],
    [15.8, 53.7], [30.6, 62.2], [45.3, 70.7], [60.0, 79.2],
  ];
  const YOU = 6; // 07
  const cl = v => Math.max(0, Math.min(1, v));
  const ease = v => 1 - Math.pow(1 - cl(v), 3);
  function tile([x, y], s, fill, stroke, sw, a) {
    // 菱形：上(x,y) 右(x+11,y+6.3) 下(x,y+12.6) 左(x-11,y+6.3)
    const cx = x, cy = y + 6.3;
    const P = [[x, y], [x + 11, y + 6.3], [x, y + 12.6], [x - 11, y + 6.3]].map(([px, py]) => [cx + (px - cx) * s, cy + (py - cy) * s]);
    return `<polygon points="${P.map(p => p.map(v => v.toFixed(2)).join(',')).join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round" opacity="${a.toFixed(3)}"/>`;
  }
  function markSVG(p = 1, { size = 120, ink = '#1E2B36', accent = '#E8701F' } = {}) {
    let s = '';
    TILES.forEach((t, i) => {
      const k = ease((p * 1.25 - i * 0.045) / 0.25);
      if (k <= 0) return;
      const filled = i === YOU && p > 0.88;
      const f = filled ? ease((p - 0.88) / 0.12) : 0;
      s += tile(t, 0.6 + 0.4 * k, filled ? accent : 'none', filled && f > 0.5 ? accent : ink, 2.6, k);
      if (filled) s += tile(t, 1, accent, accent, 2.4, f);
    });
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="${size}" height="${size}" aria-hidden="true"><g transform="translate(0,6)">${s}</g></svg>`;
  }
  const FONT = '"Hiragino Maru Gothic ProN","Zen Maru Gothic",sans-serif';
  root.YLOGO = { markSVG, FONT, TILES };
})(typeof window !== 'undefined' ? window : globalThis);
