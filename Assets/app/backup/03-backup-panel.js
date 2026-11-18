/* Triplem VIP · Backup side panel (2026-11-18)
 *
 * Account menu → Backup. One side panel for everything that used to be five menu rows
 * (Download Full Report, Download JSON, Download CSV, Backup & Restore, JSON/CSV import):
 *   Download – full backup (.zip, the Backup & Restore window), full report (PDF), all data
 *              (JSON) and spreadsheet (CSV), each with what it contains and when to use it
 *   Restore  – restore from a .zip backup (preview first, nothing changes until you confirm) and
 *              import a JSON / CSV file (pick or drop the file)
 * The app's own functions do the work (exportAllSectionsPDF, downloadJsonBackup, downloadCsvBackup,
 * importBackupFile, TriplemBackup). The hidden menu buttons keep their permission state (guest,
 * locked trial, team export/import rights), and this panel follows it.
 */
(function initTriplemBackupPanel(global){
  "use strict";

  const DP = () => global.TriplemDetailPanels || null;
  const esc = v => (typeof escapeHtml === "function" ? escapeHtml(v) : String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])));
  const IMPORT_TYPES = /\.(json|csv|txt)$/i;

  // The permission state set by the app on the (hidden) menu controls.
  const allowed = id => { const b = document.getElementById(id); return !!b && !b.disabled && !b.classList.contains("hide") && !b.classList.contains("perm-disabled") && b.getAttribute("aria-disabled") !== "true"; };
  const canImport = () => { const l = document.querySelector('label[for="importJsonInput"]'); const i = document.getElementById("importJsonInput"); return !!i && !i.disabled && !(l && l.classList.contains("hide")) && !i.classList.contains("hide"); };
  const owner = () => { try { return !!global.TriplemBackup?.isOwner?.(); } catch (_) { return false; } };

  let def = null, st = null;
  const isOpen = () => !!def && DP()?.custom?.current?.() === def;
  const paint = () => { if (isOpen()) DP().custom.render({ keepScroll: true }); };

  const K = () => DP().kit;
  function card(act, icon, tone, title, sub, fmt, label, { ok = true, why = "", primary = false } = {}){
    const k = K();
    return `<div class="tm-bk-card${ok ? "" : " is-off"}"><span class="tm-bk-ico" style="--t:${tone}" aria-hidden="true"><i class="${icon}"></i></span>
      <div class="tm-bk-text"><b>${esc(title)} ${k.pill(fmt, "")}</b><small>${esc(sub)}</small>${!ok && why ? `<small class="tm-bk-why"><i class="fa-solid fa-lock" aria-hidden="true"></i> ${esc(why)}</small>` : ""}</div>
      ${k.btn(act, st.busy === act ? "Preparing…" : label, st.busy === act ? "fa-solid fa-circle-notch fa-spin" : "", { primary, disabled: !ok || !!st.busy })}</div>`;
  }

  function downloadTab(){
    const k = K();
    const last = (() => { try { return global.TriplemBackup?.lastBackupText?.() || ""; } catch (_) { return ""; } })();
    const never = /No backup/i.test(last);
    const exp = global.state?.trialLocked ? "Paused while your access is limited. Renew your plan to download." : "Your account cannot export (ask the company administrator).";
    return `<div class="tm-dp-txhero ${never ? "is-transfer" : "is-in"}"><small>${esc("Full backup")}</small><strong>${esc(never ? "Not backed up yet" : "Backed up")}</strong><span>${esc(last || "Keep a copy of your records on your own device.")}</span></div>`
      + (never ? k.note(esc("Make a full backup now and keep the file somewhere safe (cloud drive, USB). You can restore it any time."), "warn", "fa-solid fa-triangle-exclamation") : "")
      + k.section("Download", `<div class="tm-bk-list">
          ${global.TriplemBackup ? card("bk-zip", "fa-solid fa-box-archive", "#2563eb", "Full backup", "Every record of every section in one file, optionally password-protected. Restore it here any time.", ".zip", "Back up now", { ok: owner(), why: "Only the account owner can back up this workspace.", primary: true }) : ""}
          ${card("bk-pdf", "fa-solid fa-file-pdf", "#dc2626", "Full report", "A readable report of all sections with totals, for printing or sharing.", "PDF", "Download", { ok: allowed("downloadAllSectionsPdfBtn"), why: exp })}
          ${card("bk-json", "fa-solid fa-file-code", "#7c3aed", "All data", "Everything as structured data. Use it to import into Triplem VIP again.", "JSON", "Download", { ok: allowed("downloadAllDataJsonBtn"), why: exp })}
          ${card("bk-csv", "fa-solid fa-file-csv", "#16a34a", "Spreadsheet", "Your records as rows for Excel, Google Sheets or Numbers.", "CSV", "Download", { ok: allowed("downloadAllDataCsvBtn"), why: exp })}
        </div>`)
      + k.section("Good to know", `<ul class="tm-bk-tips">
          <li><i class="fa-solid fa-shield-halved" aria-hidden="true"></i>${esc("Files are created on your device; nothing is sent anywhere else.")}</li>
          <li><i class="fa-solid fa-key" aria-hidden="true"></i>${esc("A password-protected backup cannot be opened without its password. Keep it safe.")}</li>
          <li><i class="fa-solid fa-calendar-check" aria-hidden="true"></i>${esc("Back up after important changes, and at least once a month.")}</li>
        </ul>`);
  }

  function restoreTab(){
    const k = K();
    const imp = canImport();
    return k.section("Restore from a backup", `<div class="tm-bk-list">
          ${global.TriplemBackup ? card("bk-restore", "fa-solid fa-clock-rotate-left", "#2563eb", "Restore backup", "Choose a .zip backup, review what it contains, then add back only what is missing. Existing records are never changed.", ".zip", "Choose backup", { ok: owner(), why: "Only the account owner can restore this workspace.", primary: true }) : ""}
        </div>`)
      + k.section("Import a file", imp ? `<label class="tm-bk-drop${st.drag ? " is-drag" : ""}" data-bk-drop>
          <input type="file" data-bk="import" accept=".json,application/json,.csv,text/csv,text/plain">
          <i class="fa-solid ${st.importing ? "fa-circle-notch fa-spin" : "fa-file-arrow-up"}" aria-hidden="true"></i>
          <span><b>${esc(st.importing ? `Importing ${st.importing}…` : "Choose or drop a JSON / CSV file")}</b><small>${esc("Triplem VIP JSON exports and CSV files from the Download tab or a section's CSV menu.")}</small></span></label>`
        : k.note(esc("Your account cannot import files (ask the company administrator)."), "info", "fa-solid fa-lock"))
      + (st.error ? k.note(esc(st.error), "bad", "fa-solid fa-triangle-exclamation") : "")
      + k.section("Before you restore", `<ul class="tm-bk-tips">
          <li><i class="fa-solid fa-eye" aria-hidden="true"></i>${esc("You see a preview first; nothing is added until you confirm.")}</li>
          <li><i class="fa-solid fa-lock" aria-hidden="true"></i>${esc("Restoring never deletes or overwrites a record you already have.")}</li>
          <li><i class="fa-solid fa-wifi" aria-hidden="true"></i>${esc("Stay online until it finishes.")}</li>
        </ul>`);
  }

  async function run(act, fn){
    if (st.busy) return;
    st.busy = act; st.error = ""; paint();
    try { await fn(); }
    catch (e) { DP()?.toast?.(String(e?.message || e || "Something went wrong."), false); }
    finally { st.busy = ""; paint(); }
  }
  async function importFile(file){
    if (!file) return;
    if (!IMPORT_TYPES.test(file.name || "")) { st.error = "Choose a .json or .csv file."; paint(); return; }
    if (typeof importBackupFile !== "function") return;
    st.importing = file.name; st.error = ""; paint();
    try { await importBackupFile(file); DP()?.toast?.("Import finished."); }
    catch (e) { st.error = String(e?.message || "The file could not be imported."); }
    finally { st.importing = ""; paint(); }
  }

  function open(opts = {}){
    try { if (isGuestMode()) { alert("Backup is available after sign-in."); return; } } catch (_) {}
    const dp = DP(); if (!dp?.custom?.open || !dp.kit) return;
    try { global.TriplemMenus?.closeAll?.(); } catch (_) {}
    st = { busy: "", importing: "", error: "", drag: false };
    const k = dp.kit;
    def = {
      icon: "backup",
      tabs: [["download", "Download", "fa-solid fa-download"], ["restore", "Restore", "fa-solid fa-clock-rotate-left"]],
      tab: opts && opts.tab === "restore" ? "restore" : "download", state: st,
      head(){
        const last = (() => { try { return global.TriplemBackup?.lastBackupText?.() || ""; } catch (_) { return ""; } })();
        return { title: "Backup", sub: esc(last || "Download a copy of your records or restore one"),
          avatar: `<span class="tm-dp-txico" style="--t:#2563eb"><i class="fa-solid fa-box-archive"></i></span>`,
          pills: [owner() ? k.pill("Account owner", "ok", "fa-solid fa-user-check") : k.pill("Team member", "")] };
      },
      render(tab){ return tab === "restore" ? restoreTab() : downloadTab(); },
      onChange(e){ const f = e.target.closest?.('[data-bk="import"]'); if (f) { const file = f.files?.[0]; f.value = ""; importFile(file); } },
      actions: {
        "bk-zip": () => { DP().close(); setTimeout(() => global.TriplemBackup?.open?.(), 0); },
        "bk-restore": () => { DP().close(); setTimeout(() => global.TriplemBackup?.open?.(), 0); },
        "bk-pdf": () => run("bk-pdf", () => exportAllSectionsPDF()),
        "bk-json": () => run("bk-json", () => downloadJsonBackup()),
        "bk-csv": () => run("bk-csv", () => downloadCsvBackup())
      }
    };
    dp.custom.open(def);
  }

  // Drag & drop onto the import area.
  document.addEventListener("dragover", e => { const z = e.target.closest?.("[data-bk-drop]"); if (z && isOpen()) { e.preventDefault(); if (!st.drag) { st.drag = true; z.classList.add("is-drag"); } } });
  document.addEventListener("dragleave", e => { const z = e.target.closest?.("[data-bk-drop]"); if (z && isOpen() && !z.contains(e.relatedTarget)) { st.drag = false; z.classList.remove("is-drag"); } });
  document.addEventListener("drop", e => { const z = e.target.closest?.("[data-bk-drop]"); if (z && isOpen()) { e.preventDefault(); st.drag = false; importFile(e.dataTransfer?.files?.[0]); } });

  function bindMenu(){
    const b = document.getElementById("userBackupBtn");
    if (!b || b.dataset.bound) return;
    b.dataset.bound = "1";
    b.addEventListener("click", () => open());
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bindMenu, { once: true }); else bindMenu();

  global.TriplemBackupPanel = Object.freeze({ open, isOpen });
})(window);
