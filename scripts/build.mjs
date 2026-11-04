// 公開用の public/ を組み立てる。src/web（画面）、src/engine（計算エンジン）、描画の部品、見本（design/ app/）を写す
import { cpSync, rmSync, mkdirSync, existsSync } from 'node:fs';
const out = 'public';
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const copy = (from, to) => { if (existsSync(from)) cpSync(from, `${out}/${to}`, { recursive: true }); };
copy('src/web', '.');
copy('src/engine', 'engine');
copy('data', 'data');
// 見本と試作（版の変遷の記録。相対パスのまま開けるように、そのままの位置に置く）
copy('design', 'design');
copy('app', 'app');
console.log('built public/');
