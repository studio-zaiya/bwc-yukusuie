// 費用の計量器（Durable Object）。KVの「読んで足して書く」は同時に走ると重なり、読み取りも少し遅れるため、
// 研修で並行に呼んだとき数え漏れが出た（11/5）。1つのオブジェクトの中で順に足すので、取りこぼさない。
export class Meter {
  constructor(state) { this.state = state; }
  async fetch(req) {
    const url = new URL(req.url), st = this.state.storage;
    if (url.pathname === '/add') {
      const { keys = [], micro = 0, seed = {} } = await req.json();
      const out = {};
      for (const k of keys) { const cur = (await st.get(k)) ?? (seed[k] || 0); out[k] = cur + micro; await st.put(k, out[k]); }
      return Response.json(out);
    }
    if (url.pathname === '/get') { const k = url.searchParams.get('k'); return Response.json({ v: (await st.get(k)) ?? null }); }
    return new Response('not found', { status: 404 });
  }
}
