import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Runs every schema*.sql file in this folder, in PHASE order, so each
// phase can ship its own migration file (schema.sql, schema_phase2.sql, ...).
//
// IMPORTANT: filenames must be sorted numerically by phase number, not
// lexically. A plain string .sort() puts "schema_phase10.sql" before
// "schema_phase2.sql" (because '1' < '2' as characters), which silently
// runs phases 10-22 immediately after the base schema and phases 2-9 last.
// That previously caused ALTER TABLE / CREATE INDEX statements to run
// against tables that hadn't been created yet, throwing and aborting the
// entire migration partway through on any fresh database. Fixed here by
// extracting the numeric phase and sorting on that instead.
function phaseNumber(filename) {
  if (filename === 'schema.sql') return 0;
  // Matches both 'schema_phaseN.sql' and 'schema_phaseN_description.sql' —
  // the previous regex required the number to be immediately followed by
  // '.sql', so any descriptively-named phase file (schema_phase41_b2b_
  // wholesale.sql, schema_phase42_dropshipper_network.sql, etc.) silently
  // fell through to the "no match" fallback below and got sorted after
  // every phase that matched, in whatever order fs.readdirSync happened to
  // return — not necessarily ascending phase order.
  const m = filename.match(/schema_phase(\d+)(?:_.*)?\.sql$/);
  return m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER;
}

async function migrate() {
  const files = fs.readdirSync(__dirname)
    .filter((f) => f.startsWith('schema') && f.endsWith('.sql'))
    .sort((a, b) => phaseNumber(a) - phaseNumber(b) || a.localeCompare(b));

  console.log('Running JEDIDA Marketplace schema migration...');
  console.log('  Order:', files.join(', '));
  const failures = [];
  for (const file of files) {
    console.log(`  → applying ${file}`);
    try {
      const sql = fs.readFileSync(path.join(__dirname, file), 'utf-8');
      await pool.query(sql);
    } catch (err) {
      // IMPORTANT: a single broken/out-of-order migration must not silently
      // block every migration after it. Previously this whole loop lived
      // inside one try/catch around the entire function, so one bad file
      // (or two files racing to create the same table — see the blocked_ips
      // fix in phase 68) aborted the process immediately and every later
      // phase's tables/columns simply never got created, with no clear
      // signal which file was actually responsible. Now each file is
      // isolated: log it clearly, keep going, and fail loudly at the end.
      console.error(`  ✘ ${file} failed:`, err.message);
      failures.push({ file, message: err.message });
    }
  }
  if (failures.length > 0) {
    console.error(`✘ Migration finished with ${failures.length} failing file(s):`);
    failures.forEach((f) => console.error(`   - ${f.file}: ${f.message}`));
    process.exitCode = 1;
  } else {
    console.log('✔ Migration complete.');
  }
  await pool.end();
}

migrate();
