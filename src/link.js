// スマホ連携（P1）：PCにQRと短いコードを出し、スマホのページから文章・写真を送る。PCは数秒おきに読みに来る。
// 保存先は Durable Objects（KVは反映が遅れることがあるため使わない）。保存はセッションの間だけで、30分で自動削除。
// 画像の中身は記録に残さない。画像の読み取り（Claude）は、PC側で「取り込む」を押して入口を進めたときだけ。
const TTL_MS = 30 * 60 * 1000;
const MAX_ITEMS = 10, MAX_PHOTOS = 3, MAX_PHOTO_CHARS = 1_600_000, MAX_TEXT = 1000;

export class PhoneLink {
  constructor(state) { this.state = state; }
  async fetch(req) {
    const url = new URL(req.url);
    const st = this.state.storage;
    const meta = await st.get('meta');
    const now = Date.now();
    const expired = !meta || now > meta.expiresAt;
    const json = (d, status = 200) => new Response(JSON.stringify(d), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
    if (url.pathname === '/init') {
      const m = { createdAt: now, expiresAt: now + TTL_MS, count: 0, photos: 0 };
      await st.put('meta', m); await st.put('items', []);
      await st.setAlarm(m.expiresAt);
      return json({ ok: true, expiresAt: m.expiresAt });
    }
    if (expired) return json({ ok: false, expired: true, message: 'このコードは期限が切れました。PCで、もう一度コードを出してください。' }, 410);
    if (url.pathname === '/send') {
      const body = await req.json().catch(() => ({}));
      const items = (await st.get('items')) || [];
      if (meta.count >= MAX_ITEMS) return json({ ok: false, message: '送れる回数の上限に達しました。' }, 429);
      const item = { at: now };
      if (body.text) item.text = String(body.text).slice(0, MAX_TEXT);
      if (body.photo) {
        if (meta.photos >= MAX_PHOTOS) return json({ ok: false, message: `写真は${MAX_PHOTOS}枚までです。` }, 429);
        if (!/^data:image\/jpeg;base64,/.test(body.photo) || body.photo.length > MAX_PHOTO_CHARS) return json({ ok: false, message: '写真の形式か大きさが合いません。' }, 400);
        item.photo = body.photo; meta.photos++;
      }
      if (!item.text && !item.photo) return json({ ok: false, message: '送るものがありません。' }, 400);
      items.push(item); meta.count++;
      await st.put('items', items); await st.put('meta', meta);
      return json({ ok: true, count: meta.count, photos: meta.photos });
    }
    if (url.pathname === '/poll') {
      const items = (await st.get('items')) || [];
      return json({ ok: true, expiresAt: meta.expiresAt, items: items.map(i => ({ at: i.at, text: i.text, photo: url.searchParams.has('full') ? i.photo : (i.photo ? 'photo' : undefined) })) });
    }
    if (url.pathname === '/close') { await st.deleteAll(); return json({ ok: true }); }
    return json({ ok: false }, 404);
  }
  async alarm() { await this.state.storage.deleteAll(); }
}

// 受け付けの期間：環境変数 PHONE_LINK=1 で、PHONE_FROM〜PHONE_UNTIL のあいだだけ
export function linkOpen(env) {
  if (env.PHONE_LINK !== '1') return false;
  const now = Date.now();
  // 実機での確認のために、一時的に開ける（この時刻を過ぎると自動で閉じる）
  if (env.PHONE_TEST_UNTIL && now <= Date.parse(env.PHONE_TEST_UNTIL)) return true;
  const from = Date.parse(env.PHONE_FROM || '2026-11-08T20:00:00+09:00'), until = Date.parse(env.PHONE_UNTIL || '2026-11-10T23:59:59+09:00');
  return now >= from && now <= until;
}
// 推測されにくいコード（紛らわしい文字を除いた31文字から10文字、約50ビット）
export function newCode() { return Array.from(crypto.getRandomValues(new Uint8Array(10)), b => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join(''); }
