// Builds PDF copies of the registration form by writing data on top of the original form artwork (assets/form-template.jpg).
(function () {
  const PDF_SCRIPT_URL = document.currentScript && document.currentScript.src
    ? document.currentScript.src
    : new URL("js/pdf.js", document.baseURI).href;
  const FORM_TEMPLATE_URL = new URL("../assets/form-template.jpg", PDF_SCRIPT_URL).href;
  const PW = 545.27, PH = 776, K = PW / 920;           // layout coordinates below are in a 920-wide design space
  const T = { regno:[150,172], regdate:[697,172], name:[192,239], father:[192,264], cnic:[192,289], mobile:[192,314], email:[192,339], dob:[192,390], address:[192,415], district:[192,439], sport:[274,503], assoc:[274,528], years:[274,583], edu:[274,609], event:[338,701], eventdate:[338,726], org:[338,777], declname:[670,1067], decldate:[612,1088], offreg:[130,1214], other:[238,905] };
  const W = { regno:362, regdate:905, name:725, father:725, cnic:725, mobile:725, email:725, dob:725, address:893, district:893, sport:893, assoc:893, years:893, edu:893, event:893, eventdate:893, org:893, declname:893, decldate:772, offreg:533, other:540 };
  const C = { male:[195,358], female:[297,358], lv_District:[280,552], lv_Regional:[398,552], lv_Provincial:[534,552], lv_National:[675,552], yes:[341,674], no:[445,674], ev_District:[343,752], ev_Regional:[444,752], ev_Provincial:[556,752], ev_National:[676,752], ev_International:[797,752], d1:[29,842], d2:[29,863], d3:[29,883], d4:[29,905], approved:[173,1189], pending:[286,1189], rejected:[391,1189] };
  const B = { photo:[754,232,899,388], cf:[577,842,731,917], cb:[751,842,899,917], sign:[258,1048,525,1080] };

  const toDataURL = blob => new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
  const imgSize = u => new Promise(r => { const i = new Image(); i.onload = () => r([i.width, i.height]); i.onerror = () => r([1, 1]); i.src = u; });
  async function getFile(bucket, path) {
    if (!path) return null;
    try { const { data, error } = await window.sb.storage.from(bucket).download(path); return error || !data ? null : await toDataURL(data); }
    catch (e) { return null; }
  }
  async function fit(doc, url, x, y, w, h, pad, bg) {
    if (!url) return;
    if (bg) { doc.setFillColor(255, 255, 255); doc.rect(x, y, w, h, "F"); }
    const [iw, ih] = await imgSize(url), bw = w - 2 * pad, bh = h - 2 * pad, s = Math.min(bw / iw, bh / ih);
    const dw = iw * s, dh = ih * s;
    doc.addImage(url, url.startsWith("data:image/png") ? "PNG" : "JPEG", x + pad + (bw - dw) / 2, y + pad + (bh - dh) / 2, dw, dh, undefined, "FAST");
  }
  const box = k => { const [a, b, c, d] = B[k]; return [a * K, b * K, (c - a) * K, (d - b) * K]; };
  function put(doc, key, txt) {
    if (!txt) return;
    let fs = 9.5; doc.setFontSize(fs);
    const maxw = (W[key] - T[key][0]) * K;
    while (fs > 5 && doc.getTextWidth(String(txt)) > maxw) { fs -= 0.5; doc.setFontSize(fs); }
    doc.text(String(txt), T[key][0] * K, T[key][1] * K);
  }
  function tick(doc, key) {
    const [x, y] = C[key], cx = x * K, cy = y * K;
    doc.setDrawColor(8, 28, 70); doc.setLineWidth(1.4);
    doc.line(cx - 3.6, cy + 0.2, cx - 1, cy + 3.2); doc.line(cx - 1, cy + 3.2, cx + 4.2, cy - 3.8);
  }

  async function build(rows, progress) {
    const { jsPDF } = window.jspdf;
    const templateResponse = await fetch(FORM_TEMPLATE_URL, { cache: "force-cache" });
    if (!templateResponse.ok) throw new Error(`Could not load the registration form template (HTTP ${templateResponse.status}).`);
    const tpl = await templateResponse.blob().then(toDataURL);
    const doc = new jsPDF({ unit: "pt", format: [PW, PH], compress: true });
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (progress) progress(i + 1, rows.length);
      if (i > 0) doc.addPage([PW, PH]);
      doc.addImage(tpl, "JPEG", 0, 0, PW, PH, "tpl", "FAST");
      doc.setFont("helvetica", "normal"); doc.setTextColor(8, 28, 70);
      const [photo, cf, cb, cert, other, sign] = await Promise.all([
        getFile("photos", r.photo_path), getFile("documents", r.cnic_front_path), getFile("documents", r.cnic_back_path),
        getFile("documents", r.certificate_path), getFile("documents", r.other_doc_path), getFile("documents", r.signature_path)
      ]);
      const date = fmtDate(r.created_at);
      put(doc, "regno", r.reg_no); put(doc, "regdate", date);
      put(doc, "name", r.name); put(doc, "father", r.father_name); put(doc, "cnic", r.cnic); put(doc, "mobile", r.mobile);
      put(doc, "email", r.email); put(doc, "dob", fmtDate(r.dob)); put(doc, "address", r.address); put(doc, "district", r.district_tehsil);
      tick(doc, r.gender === "Female" ? "female" : "male");
      put(doc, "sport", r.sport); put(doc, "assoc", r.association); put(doc, "years", r.years_experience); put(doc, "edu", r.education);
      if (r.player_level) tick(doc, "lv_" + r.player_level);
      tick(doc, r.official_participation ? "yes" : "no");
      if (r.official_participation) {
        put(doc, "event", r.event_name); put(doc, "eventdate", r.event_date); put(doc, "org", r.event_org);
        if (r.event_level) tick(doc, "ev_" + r.event_level);
      }
      if (photo) tick(doc, "d1"); if (cf || cb) tick(doc, "d2"); if (cert) tick(doc, "d3"); if (other) { tick(doc, "d4"); put(doc, "other", "Attached on the following page"); }
      put(doc, "declname", r.signature_name || r.name); put(doc, "decldate", date);
      put(doc, "offreg", r.reg_no);
      tick(doc, r.status === "confirmed" ? "approved" : "pending");
      await fit(doc, photo, ...box("photo"), 2, true);
      await fit(doc, cf, ...box("cf"), 3, true); await fit(doc, cb, ...box("cb"), 3, true);
      await fit(doc, sign, ...box("sign"), 1);
      for (const [img, label] of [[cert, "Sports / Achievement Certificate"], [other, "Other Relevant Document"]]) {
        if (!img) continue;
        doc.addPage([PW, PH]); doc.setFontSize(11); doc.setTextColor(8, 28, 70);
        doc.text(`${r.reg_no} - ${r.name} - ${label}`, 36, 40);
        await fit(doc, img, 36, 56, PW - 72, PH - 100, 0);
      }
    }
    return doc;
  }
  window.KMRPDF = { build };
})();
