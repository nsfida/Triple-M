(function () {
  const C = window.KMR;
  window.sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY);
  window.esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  window.photoUrl = p => p ? `${C.SUPABASE_URL}/storage/v1/object/public/photos/${p}` : "";
  window.fmtDate = d => { const x = new Date(d); return isNaN(x) ? "" : String(x.getDate()).padStart(2, "0") + "/" + String(x.getMonth() + 1).padStart(2, "0") + "/" + x.getFullYear(); };
})();
