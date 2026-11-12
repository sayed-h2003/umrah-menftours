// يبني supabase/functions/gas/bundle.mjs: كل ملفات .gs (بترتيب ثابت) + edge_overrides بآخرها كنص واحد
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
const root = new URL('..', import.meta.url).pathname;
const files = readdirSync(root).filter((f) => f.endsWith('.gs')).sort((a, b) => (a === 'Code.gs' ? -1 : b === 'Code.gs' ? 1 : a.localeCompare(b)));
let src = files.map((f) => `// ===== ${f} =====\n` + readFileSync(root + f, 'utf8')).join('\n;\n');
src += '\n;\n' + readFileSync(root + 'supabase/functions/gas/edge_overrides.gs.js', 'utf8');
writeFileSync(root + 'supabase/functions/gas/bundle.mjs', '// مولَّد آلياً بـ tools/build_gas_bundle.mjs — لا تعدّله يدوياً\nexport const SRC = ' + JSON.stringify(src) + ';\nexport const FILES = ' + JSON.stringify(files) + ';\n');
console.log('bundle:', files.length, 'files,', (src.length / 1e6).toFixed(2), 'MB');
