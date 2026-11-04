// 公開用の public/ を組み立てる。src/web（画面）、src/engine（計算エンジン）、描画の部品、見本（design/ app/）を写す
import { cpSync, rmSync, mkdirSync, existsSync } from 'node:fs';
const out = 'public';
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const copy = (from, to) => { if (existsSync(from)) cpSync(from, `${out}/${to}`, { recursive: true }); };
copy('src/web', '.');
copy('src/engine', 'engine');
copy('data', 'data');
// QRコードを描く npm のライブラリ（依存として使う）
copy('node_modules/qrcode-generator/qrcode.js', 'lib/qrcode.js');
// 見本と試作（app/・design/・prototypes/）は版の記録なので公開しない（台本の画面を本物の処理と見せないため）
console.log('built public/');
