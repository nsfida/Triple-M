#!/usr/bin/env node
/* Triplem VIP - System Backup tool (offline, no network).
 *
 *   node scripts/system_backup_tool.js verify  <backup.zip>
 *   node scripts/system_backup_tool.js schema  <backup.zip> <output folder>
 *   node scripts/system_backup_tool.js extract <backup.zip> <output folder>
 *
 * The backup password is read from the TRIPLEM_BACKUP_PASSWORD environment
 * variable, or asked for on the terminal. Nothing is sent anywhere.
 *
 * "schema" writes the 20 SQL files and SCHEMA_INSTALLATION_README.md needed to
 * install the database structure on a NEW Supabase project. "extract" writes
 * every decrypted file (customer data included): keep that folder private.
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");
if (!globalThis.crypto) globalThis.crypto = require("node:crypto").webcrypto;
const E = require("../Assets/app/backup/04-system-backup-engine.js");
const fflate = require("../Assets/app/lib/fflate-0.8.2.min.js");

function fileSource(file) {
  const fd = fs.openSync(file, "r");
  const size = fs.fstatSync(fd).size;
  return {
    size,
    read(start, end) {
      const len = Math.max(0, Math.min(end, size) - start);
      const buf = Buffer.alloc(len);
      let got = 0;
      while (got < len) {
        const n = fs.readSync(fd, buf, got, len - got, start + got);
        if (!n) break;
        got += n;
      }
      return new Uint8Array(buf.buffer, buf.byteOffset, got);
    },
    close() { fs.closeSync(fd); }
  };
}

function askPassword() {
  if (process.env.TRIPLEM_BACKUP_PASSWORD) return Promise.resolve(process.env.TRIPLEM_BACKUP_PASSWORD);
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl.stdoutMuted = true;
    rl._writeToOutput = s => { if (!rl.stdoutMuted || /Backup password/.test(s)) rl.output.write(s); };
    rl.question("Backup password: ", pw => { rl.close(); process.stdout.write("\n"); resolve(pw); });
  });
}

function safeJoin(base, rel) {
  const out = path.resolve(base, rel);
  if (!out.startsWith(path.resolve(base) + path.sep)) throw new Error(`Unsafe path in archive: ${rel}`);
  return out;
}

async function main() {
  const [cmd, zipFile, outDir] = process.argv.slice(2);
  if (!["verify", "schema", "extract"].includes(cmd) || !zipFile || (cmd !== "verify" && !outDir)) {
    console.log("Usage:\n  node scripts/system_backup_tool.js verify  <backup.zip>\n  node scripts/system_backup_tool.js schema  <backup.zip> <output folder>\n  node scripts/system_backup_tool.js extract <backup.zip> <output folder>");
    process.exit(2);
  }
  const src = fileSource(zipFile);
  try {
    const password = await askPassword();
    const arch = await E.openArchive(fflate, src, password);
    const m = arch.manifest;
    console.log(`Backup ${m.backupId}, created ${m.createdAt}`);
    console.log(`Accounts ${m.totals.owners} (${m.totals.individuals} individual, ${m.totals.businesses} business), team members ${m.totals.teamMembers}, records ${m.totals.records}, attachments ${m.totals.attachments}`);
    if (cmd === "verify") {
      const r = await E.verifyArchive(arch, { onProgress: p => process.stdout.write(`\rChecked ${p.done}/${p.total} files`) });
      process.stdout.write("\n");
      if (!r.ok) { console.error("VERIFICATION FAILED"); for (const p of r.problems) console.error(` - ${p.path}: ${p.problem}`); process.exit(1); }
      console.log(`All ${r.files} files decrypted and matched their SHA-256 checksums (${r.bytes} bytes).`);
      return;
    }
    fs.mkdirSync(outDir, { recursive: true });
    const wanted = m.files.filter(f => cmd === "extract" || f.kind === "schema" || f.kind === "schema-readme");
    let n = 0;
    for (const f of wanted) {
      const data = await arch.file(f.path);
      const target = cmd === "schema" ? safeJoin(outDir, path.basename(f.path)) : safeJoin(outDir, f.path);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, data);
      n += 1;
    }
    if (cmd === "extract") {
      fs.writeFileSync(safeJoin(outDir, "backup-manifest.json"), JSON.stringify(m, null, 1));
    }
    console.log(`Wrote ${n} file(s) to ${outDir}${cmd === "schema" ? " (20 SQL files + installation README)" : ""}.`);
  } catch (e) {
    console.error(e.message || e);
    process.exit(1);
  } finally {
    src.close();
  }
}
main();
