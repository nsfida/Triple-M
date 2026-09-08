/* Inventory Product Barcodes + Scanner + Thermal merchant receipts + offline sync.
   ADDITIVE ONLY — does not modify existing inventory stock/sale/invoice finalize paths. */
(function () {
  "use strict";

  const BARCODE_CACHE_KEY = "triplem-inventory-barcodes-v1";
  const BARCODE_SYNC_QUEUE_KEY = "triplem-inventory-barcode-sync-queue-v1";
  const SCAN_COOLDOWN_SAME_MS = 650;
  const SCAN_COOLDOWN_OTHER_MS = 180;
  const SCAN_TICK_MS = 45;
  const THERMAL_FOOTER = "Thank you for shopping with us";

  const barcodeUi = {
    rows: [],
    selected: new Set(),
    search: "",
    statusFilter: "all", // all | in_stock | out
    printQtyMode: "one", // one | stock | manual
    printQtyManual: 1,
    qtyByGroup: {}, // optional per-item override
    loaded: false,
    loading: false
  };

  const scannerUi = {
    open: false,
    stream: null,
    raf: 0,
    tickTimer: 0,
    detector: null,
    zxingReader: null,
    decodeCanvas: null,
    enhanceCanvas: null,
    decodeBusy: false,
    lastCode: "",
    lastAt: 0,
    lastMissAt: 0,
    confirmCode: "",
    confirmHits: 0,
    status: "Point camera at a product barcode",
    busy: false,
    online: typeof navigator !== "undefined" ? navigator.onLine !== false : true
  };

  function moneySafe(amount, currency, options = {}) {
    // Plain text only — never use money() HTML here (labels / PDF / thermal).
    if (typeof moneyText === "function") return moneyText(amount, currency, options);
    const n = Number(amount || 0);
    const code = String(currency || "").trim();
    return `${code ? code + " " : ""}${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`.trim();
  }

  function groupLabelPrice(group, fallback = 0) {
    return Number(
      group?.defaultUnitSoldPrice
      || group?.unitActualPrice
      || fallback
      || 0
    );
  }

  function ownerKey(prefix) {
    const uid = state?.session?.user?.id || state?.user?.id || "local";
    return `${prefix}:${uid}`;
  }

  function isOnline() {
    return typeof navigator === "undefined" ? true : navigator.onLine !== false;
  }

  function loadBarcodeLocalCache() {
    try {
      const raw = localStorage.getItem(ownerKey(BARCODE_CACHE_KEY));
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function saveBarcodeLocalCache(map) {
    try {
      localStorage.setItem(ownerKey(BARCODE_CACHE_KEY), JSON.stringify(map || {}));
    } catch (_) {}
  }

  function loadSyncQueue() {
    try {
      const raw = localStorage.getItem(ownerKey(BARCODE_SYNC_QUEUE_KEY));
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function saveSyncQueue(queue) {
    try {
      localStorage.setItem(ownerKey(BARCODE_SYNC_QUEUE_KEY), JSON.stringify(queue || []));
    } catch (_) {}
  }

  function enqueueBarcodeSync(payload) {
    const queue = loadSyncQueue();
    const gid = String(payload.groupId || "");
    const next = queue.filter(item => String(item.groupId) !== gid);
    next.push({ ...payload, queuedAt: Date.now() });
    saveSyncQueue(next);
  }

  function generateBarcodeForGroup(groupId) {
    // Short numeric CODE128 (12 digits) — thicker bars on small stickers, camera-friendly.
    const hex = String(groupId || "").replace(/-/g, "").toLowerCase();
    let n = 0;
    for (let i = 0; i < hex.length; i += 1) {
      n = ((n * 33) + hex.charCodeAt(i)) >>> 0;
    }
    const a = (n % 1000000).toString().padStart(6, "0");
    let m = 0;
    for (let i = hex.length - 1; i >= 0; i -= 1) {
      m = ((m * 37) + hex.charCodeAt(i)) >>> 0;
    }
    const b = (m % 1000000).toString().padStart(6, "0");
    return `${a}${b}`;
  }

  function normalizeBarcodeValue(code) {
    return String(code || "").trim().toUpperCase().replace(/\s+/g, "");
  }

  function companyLabelName() {
    try {
      if (typeof getPdfCompanyContact === "function") {
        const c = getPdfCompanyContact();
        if (c?.isCompany && c.name) return String(c.name).trim();
        if (c?.name) return String(c.name).trim();
      }
    } catch (_) {}
    return String(fullConfigData?.Company || "").trim();
  }

  function productDisplayName(group) {
    if (!group) return "Product";
    const company = String(companyLabelName() || "").trim().toLowerCase();
    const skip = (v) => {
      const s = String(v || "").trim();
      if (!s) return false;
      if (company && s.toLowerCase() === company) return false;
      return true;
    };
    // Prefer catalog fields (brand / line / storage) — never company or owner name.
    const catalog = [
      group.brand,
      group.subBrand,
      group.productLine,
      group.variantLabel,
      group.variantStorage,
      group.variantColor
    ].filter(skip);
    if (catalog.length) return catalog.slice(0, 2).join(" · ");
    if (typeof formatInventoryReceiptLineName === "function") {
      const named = String(formatInventoryReceiptLineName(group) || "").trim();
      if (named && named !== "Item" && (!company || named.toLowerCase() !== company)) return named;
    }
    const person = String(group.person_name || "").trim();
    if (person && (!company || person.toLowerCase() !== company)) return person;
    return String(group.itemCode || "Product");
  }

  function getInventoryProductGroups() {
    if (typeof getGoodsGroups !== "function") return [];
    return getGoodsGroups({ applyUiFilters: false }) || [];
  }

  async function fetchBarcodesFromServer() {
    if (!isOnline() || typeof supabaseRpc !== "function") return [];
    try {
      const res = typeof unwrapRpcJson === "function"
        ? unwrapRpcJson(await supabaseRpc("app_list_my_goods_barcodes", { p_limit: 5000 }))
        : await supabaseRpc("app_list_my_goods_barcodes", { p_limit: 5000 });
      const rows = res?.rows || res?.data?.rows || [];
      return Array.isArray(rows) ? rows : [];
    } catch (err) {
      console.warn("Barcode list RPC unavailable; using local cache.", err);
      return [];
    }
  }

  async function upsertBarcodeOnServer(payload) {
    if (typeof supabaseRpc !== "function") {
      enqueueBarcodeSync(payload);
      return null;
    }
    if (!isOnline()) {
      enqueueBarcodeSync(payload);
      return null;
    }
    try {
      const args = {
        p_group_id: payload.groupId,
        p_barcode: payload.barcode,
        p_item_name: payload.itemName || null,
        p_item_code: payload.itemCode || null,
        p_currency: payload.currency || null,
        p_unit_price: payload.unitPrice != null ? Number(payload.unitPrice) : null
      };
      const res = typeof unwrapRpcJson === "function"
        ? unwrapRpcJson(await supabaseRpc("app_upsert_goods_barcode", args))
        : await supabaseRpc("app_upsert_goods_barcode", args);
      return res?.row || res?.data?.row || null;
    } catch (err) {
      enqueueBarcodeSync(payload);
      console.warn("Barcode upsert queued for offline sync.", err);
      return null;
    }
  }

  async function flushBarcodeSyncQueue() {
    if (!isOnline() || typeof supabaseRpc !== "function") return 0;
    const queue = loadSyncQueue();
    if (!queue.length) return 0;
    const remaining = [];
    let synced = 0;
    for (const item of queue) {
      try {
        const args = {
          p_group_id: item.groupId,
          p_barcode: item.barcode,
          p_item_name: item.itemName || null,
          p_item_code: item.itemCode || null,
          p_currency: item.currency || null,
          p_unit_price: item.unitPrice != null ? Number(item.unitPrice) : null
        };
        const res = typeof unwrapRpcJson === "function"
          ? unwrapRpcJson(await supabaseRpc("app_upsert_goods_barcode", args))
          : await supabaseRpc("app_upsert_goods_barcode", args);
        if (res?.ok === false) remaining.push(item);
        else synced += 1;
      } catch (_) {
        remaining.push(item);
      }
    }
    saveSyncQueue(remaining);
    if (synced > 0) {
      scannerUi.status = `Synced ${synced} barcode${synced === 1 ? "" : "s"} from offline queue`;
      paintScannerChrome();
    }
    return synced;
  }

  function isLegacyHardBarcode(code) {
    const c = normalizeBarcodeValue(code);
    if (!c) return true;
    // Old TM+hex codes are long/dense and camera scanners struggle on small stickers.
    if (/^TM[0-9A-F]{8,}$/i.test(c)) return true;
    if (/[A-Z]/.test(c) && c.length > 12) return true;
    return false;
  }

  async function ensureInventoryBarcodes({ force = false } = {}) {
    if (barcodeUi.loading) return barcodeUi.rows;
    barcodeUi.loading = true;
    try {
      const groups = getInventoryProductGroups();
      const local = loadBarcodeLocalCache();
      const remote = await fetchBarcodesFromServer();
      const byGroup = { ...local };

      remote.forEach(row => {
        const gid = String(row.group_id || row.groupId || "");
        if (!gid) return;
        byGroup[gid] = {
          groupId: gid,
          barcode: normalizeBarcodeValue(row.barcode),
          itemName: row.item_name || row.itemName || "",
          itemCode: row.item_code || row.itemCode || "",
          currency: row.currency || "",
          unitPrice: row.unit_price != null ? Number(row.unit_price) : null
        };
      });

      const used = new Set(
        Object.values(byGroup)
          .map(r => normalizeBarcodeValue(r.barcode))
          .filter(c => c && !isLegacyHardBarcode(c))
      );
      for (const group of groups) {
        const gid = String(group.group_id || "");
        if (!gid) continue;
        let entry = byGroup[gid];
        const needsNew = !entry?.barcode || isLegacyHardBarcode(entry.barcode);
        if (needsNew) {
          let code = generateBarcodeForGroup(gid);
          while (used.has(code)) {
            code = String((Number(code) + 1) % 1000000000000).padStart(12, "0");
          }
          used.add(code);
          entry = {
            groupId: gid,
            barcode: code,
            itemName: productDisplayName(group),
            itemCode: group.itemCode || "",
            currency: group.currency || "AED",
            unitPrice: groupLabelPrice(group) || null
          };
          byGroup[gid] = entry;
          await upsertBarcodeOnServer(entry);
        } else if (force) {
          entry.barcode = normalizeBarcodeValue(entry.barcode);
          entry.itemName = productDisplayName(group);
          entry.itemCode = group.itemCode || entry.itemCode || "";
          entry.currency = group.currency || entry.currency || "AED";
          entry.unitPrice = groupLabelPrice(group, entry.unitPrice) || entry.unitPrice;
          byGroup[gid] = entry;
        }
      }

      saveBarcodeLocalCache(byGroup);
      await flushBarcodeSyncQueue();

      barcodeUi.rows = groups.map(group => {
        const gid = String(group.group_id || "");
        const entry = byGroup[gid] || {};
        const rem = Number(group.remainingQty || 0);
        return {
          groupId: gid,
          barcode: normalizeBarcodeValue(entry.barcode),
          itemName: productDisplayName(group),
          itemCode: group.itemCode || entry.itemCode || "",
          currency: group.currency || entry.currency || "AED",
          unitPrice: groupLabelPrice(group, entry.unitPrice),
          remainingQty: rem,
          status: rem > 0.00000001 ? "in_stock" : "out"
        };
      }).sort((a, b) => String(a.itemName).localeCompare(String(b.itemName)));

      barcodeUi.loaded = true;
      return barcodeUi.rows;
    } finally {
      barcodeUi.loading = false;
    }
  }

  function filteredBarcodeRows() {
    const q = String(barcodeUi.search || "").trim().toLowerCase();
    return barcodeUi.rows.filter(row => {
      if (barcodeUi.statusFilter === "in_stock" && row.status !== "in_stock") return false;
      if (barcodeUi.statusFilter === "out" && row.status !== "out") return false;
      if (!q) return true;
      const blob = `${row.itemName} ${row.itemCode} ${row.barcode}`.toLowerCase();
      return blob.includes(q);
    });
  }

  function resolveGroupByBarcode(code) {
    const needle = normalizeBarcodeValue(code);
    if (!needle) return null;
    const hit = barcodeUi.rows.find(r => normalizeBarcodeValue(r.barcode) === needle);
    if (hit) return getInventoryProductGroups().find(g => String(g.group_id) === hit.groupId) || null;
    return getInventoryProductGroups().find(g => normalizeBarcodeValue(g.itemCode) === needle) || null;
  }

  function ensureJsBarcode() {
    return !!window.JsBarcode;
  }

  function drawBarcodeCanvas(code, {
    moduleWidth = 2,
    barHeight = 64,
    margin = 10,
    displayValue = false
  } = {}) {
    const value = normalizeBarcodeValue(code) || "000000000000";
    const canvas = document.createElement("canvas");
    if (!ensureJsBarcode()) {
      const ctx = canvas.getContext("2d");
      canvas.width = 320;
      canvas.height = 72;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#000000";
      ctx.font = "bold 14px monospace";
      ctx.textAlign = "center";
      ctx.fillText(value, canvas.width / 2, 40);
      return canvas;
    }
    // Sharp modules + quiet zone. Never use margin:0 (unreadable on printers/cameras).
    window.JsBarcode(canvas, value, {
      format: "CODE128",
      width: moduleWidth,
      height: barHeight,
      displayValue,
      fontSize: 12,
      textMargin: 2,
      margin,
      background: "#ffffff",
      lineColor: "#000000"
    });
    return canvas;
  }

  function resolveLabelCopyCount(row) {
    const override = barcodeUi.qtyByGroup[row.groupId];
    if (override != null && String(override).trim() !== "") {
      const n = Math.floor(Number(override));
      return Number.isFinite(n) && n > 0 ? Math.min(n, 500) : 1;
    }
    if (barcodeUi.printQtyMode === "stock") {
      const stock = Math.ceil(Number(row.remainingQty || 0));
      return Math.max(1, Math.min(stock > 0 ? stock : 1, 500));
    }
    if (barcodeUi.printQtyMode === "manual") {
      const n = Math.floor(Number(barcodeUi.printQtyManual || 1));
      return Math.max(1, Math.min(Number.isFinite(n) ? n : 1, 500));
    }
    return 1;
  }

  function expandRowsForLabelPrint(rows) {
    const out = [];
    (rows || []).forEach(row => {
      if (!row) return;
      const copies = resolveLabelCopyCount(row);
      for (let i = 0; i < copies; i += 1) out.push(row);
    });
    return out;
  }

  async function downloadProductBarcodeLabelsPDF(rows) {
    if (!window.jspdf) {
      alert("PDF library loading. Please try again in a moment.");
      return;
    }
    const source = Array.isArray(rows) ? rows.filter(Boolean) : [];
    if (!source.length) {
      alert("No products to print.");
      return;
    }
    const list = expandRowsForLabelPrint(source);
    if (!list.length) {
      alert("No labels to print.");
      return;
    }
    if (list.length > 3000) {
      alert(`Too many labels (${list.length}). Reduce quantity (max 3000).`);
      return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    // Exactly 6 labels per row on A4 — compact sticker size
    const cols = 6;
    const marginX = 5;
    const marginY = 6;
    const gapX = 1.6;
    const gapY = 2.2;
    const labelW = (pageW - marginX * 2 - gapX * (cols - 1)) / cols;
    const labelH = 21;
    const rowsPerPage = Math.max(1, Math.floor((pageH - marginY * 2 + gapY) / (labelH + gapY)));
    const perPage = cols * rowsPerPage;

    for (let i = 0; i < list.length; i += 1) {
      if (i > 0 && i % perPage === 0) doc.addPage();
      const idx = i % perPage;
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const x = marginX + col * (labelW + gapX);
      const y = marginY + row * (labelH + gapY);
      const item = list[i];
      const code = normalizeBarcodeValue(item.barcode);
      let ty = y + 2.2;

      doc.setDrawColor(210, 210, 210);
      doc.setLineWidth(0.1);
      doc.rect(x, y, labelW, labelH);

      // Product name only (no company)
      doc.setFont("helvetica", "bold");
      doc.setFontSize(5.2);
      doc.setTextColor(15, 23, 42);
      const nameLines = doc.splitTextToSize(String(item.itemName || "Product"), labelW - 2.2);
      doc.text(nameLines.slice(0, 1), x + labelW / 2, ty, { align: "center" });
      ty += 2.8;

      try {
        const canvas = drawBarcodeCanvas(code, {
          moduleWidth: 2,
          barHeight: 48,
          margin: 10,
          displayValue: false
        });
        const img = canvas.toDataURL("image/png");
        const maxW = labelW - 2;
        const maxH = 9.2;
        const aspect = canvas.height / Math.max(canvas.width, 1);
        let imgW = maxW;
        let imgH = imgW * aspect;
        if (imgH > maxH) {
          imgH = maxH;
          imgW = imgH / aspect;
        }
        const imgX = x + (labelW - imgW) / 2;
        doc.addImage(img, "PNG", imgX, ty, imgW, imgH, undefined, "NONE");
        ty += imgH + 1.3;
      } catch (_) {
        ty += 7;
      }

      doc.setFont("helvetica", "normal");
      doc.setFontSize(5);
      doc.setTextColor(30, 41, 59);
      doc.text(code, x + labelW / 2, ty, { align: "center" });
      ty += 2.6;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(5.8);
      doc.setTextColor(15, 23, 42);
      doc.text(moneySafe(item.unitPrice, item.currency, { forPdf: true }), x + labelW / 2, ty, { align: "center" });
    }

    doc.save(`Product_Barcodes_${source.length}x_${list.length}labels.pdf`);
  }

  async function renderInventoryBarcodesSection() {
    const root = document.getElementById("inventoryBarcodesList");
    if (!root) return;
    root.innerHTML = `<div class="empty inventory-loading-hint">Loading product barcodes…</div>`;
    await ensureInventoryBarcodes({ force: true });
    paintBarcodeList();
  }

  function paintBarcodeList() {
    const root = document.getElementById("inventoryBarcodesList");
    if (!root) return;
    const rows = filteredBarcodeRows();
    const pending = loadSyncQueue().length;
    if (!barcodeUi.rows.length) {
      root.innerHTML = `<div class="empty">No inventory products found. Add stock items first, then open this section again.</div>`;
      return;
    }
    const allSelected = rows.length && rows.every(r => barcodeUi.selected.has(r.groupId));
    const previewCount = rows.reduce((sum, r) => sum + resolveLabelCopyCount(r), 0);
    const selectedPreview = rows
      .filter(r => barcodeUi.selected.has(r.groupId))
      .reduce((sum, r) => sum + resolveLabelCopyCount(r), 0);
    root.innerHTML = `
      <div class="inv-barcode-toolbar">
        <label class="inv-barcode-search">
          <span>Search</span>
          <input type="search" id="inventoryBarcodeSearch" class="input" placeholder="Name, code, barcode…" value="${escapeHtml(barcodeUi.search)}" />
        </label>
        <label class="inv-barcode-filter">
          <span>Status</span>
          <select id="inventoryBarcodeStatusFilter" class="select">
            <option value="all" ${barcodeUi.statusFilter === "all" ? "selected" : ""}>All</option>
            <option value="in_stock" ${barcodeUi.statusFilter === "in_stock" ? "selected" : ""}>In stock</option>
            <option value="out" ${barcodeUi.statusFilter === "out" ? "selected" : ""}>Out / sold</option>
          </select>
        </label>
        <label class="inv-barcode-filter">
          <span>Labels / item</span>
          <select id="inventoryBarcodeQtyMode" class="select">
            <option value="one" ${barcodeUi.printQtyMode === "one" ? "selected" : ""}>1 each</option>
            <option value="stock" ${barcodeUi.printQtyMode === "stock" ? "selected" : ""}>Match stock</option>
            <option value="manual" ${barcodeUi.printQtyMode === "manual" ? "selected" : ""}>Manual qty</option>
          </select>
        </label>
        <label class="inv-barcode-filter ${barcodeUi.printQtyMode === "manual" ? "" : "hide"}" id="invBarcodeQtyManualWrap">
          <span>Qty</span>
          <input type="number" id="inventoryBarcodeQtyManual" class="input" min="1" max="500" step="1" value="${escapeHtml(String(barcodeUi.printQtyManual || 1))}" />
        </label>
        <div class="inv-barcode-actions">
          <button type="button" class="tiny ghost" id="invBarcodeSelectAllBtn">${allSelected ? "Clear" : "Select all"}</button>
          <button type="button" class="tiny soft" id="invBarcodePrintSelectedBtn" title="Print selected"><i class="fa-solid fa-barcode"></i> Selected (${selectedPreview})</button>
          <button type="button" class="tiny primary" id="invBarcodePrintAllBtn" title="Print all filtered"><i class="fa-solid fa-print"></i> PDF (${previewCount})</button>
        </div>
      </div>
      <div class="inv-barcode-qty-hint">6 labels per row · set Labels/item, or type a count on a row to override.</div>
      ${pending ? `<div class="inv-barcode-sync-banner">Offline queue: ${pending} barcode update${pending === 1 ? "" : "s"} will sync when online.</div>` : ""}
      <div class="inv-barcode-list">
        ${rows.length ? rows.map(row => {
          const copies = resolveLabelCopyCount(row);
          const overrideVal = barcodeUi.qtyByGroup[row.groupId];
          return `
          <label class="inv-barcode-row">
            <input type="checkbox" data-barcode-select="${escapeHtml(row.groupId)}" ${barcodeUi.selected.has(row.groupId) ? "checked" : ""} />
            <div class="inv-barcode-main">
              <strong>${escapeHtml(row.itemName)}</strong>
              <span>${escapeHtml(row.itemCode || "—")} · ${escapeHtml(row.barcode)} · stock ${escapeHtml(String(Math.max(0, Math.ceil(Number(row.remainingQty || 0)))))}</span>
            </div>
            <div class="inv-barcode-meta">
              <em class="${row.status === "in_stock" ? "is-ok" : "is-out"}">${row.status === "in_stock" ? "In stock" : "Out / sold"}</em>
              <strong>${escapeHtml(moneySafe(row.unitPrice, row.currency))}</strong>
            </div>
            <input type="number" class="input inv-barcode-qty-input" data-barcode-qty="${escapeHtml(row.groupId)}" min="1" max="500" step="1" placeholder="${copies}" value="${overrideVal != null && String(overrideVal).trim() !== "" ? escapeHtml(String(overrideVal)) : ""}" title="Labels for this item (overrides mode)" aria-label="Label count" />
            <button type="button" class="tiny ghost" data-barcode-one="${escapeHtml(row.groupId)}" title="Print this product"><i class="fa-solid fa-print"></i></button>
          </label>`;
        }).join("") : `<div class="empty">No products match this filter.</div>`}
      </div>
    `;

    root.querySelector("#inventoryBarcodeSearch")?.addEventListener("input", e => {
      barcodeUi.search = e.target.value || "";
      paintBarcodeList();
    });
    root.querySelector("#inventoryBarcodeStatusFilter")?.addEventListener("change", e => {
      barcodeUi.statusFilter = e.target.value || "all";
      paintBarcodeList();
    });
    root.querySelector("#inventoryBarcodeQtyMode")?.addEventListener("change", e => {
      barcodeUi.printQtyMode = e.target.value || "one";
      paintBarcodeList();
    });
    root.querySelector("#inventoryBarcodeQtyManual")?.addEventListener("change", e => {
      const n = Math.floor(Number(e.target.value || 1));
      barcodeUi.printQtyManual = Math.max(1, Math.min(Number.isFinite(n) ? n : 1, 500));
      paintBarcodeList();
    });
    root.querySelector("#invBarcodeSelectAllBtn")?.addEventListener("click", () => {
      if (allSelected) barcodeUi.selected.clear();
      else rows.forEach(r => barcodeUi.selected.add(r.groupId));
      paintBarcodeList();
    });
    root.querySelector("#invBarcodePrintSelectedBtn")?.addEventListener("click", () => {
      const picked = rows.filter(r => barcodeUi.selected.has(r.groupId));
      if (!picked.length) return alert("Select at least one product.");
      downloadProductBarcodeLabelsPDF(picked);
    });
    root.querySelector("#invBarcodePrintAllBtn")?.addEventListener("click", () => {
      downloadProductBarcodeLabelsPDF(filteredBarcodeRows().length ? filteredBarcodeRows() : barcodeUi.rows);
    });
    root.querySelectorAll("[data-barcode-select]").forEach(input => {
      input.addEventListener("change", () => {
        const id = input.getAttribute("data-barcode-select");
        if (input.checked) barcodeUi.selected.add(id);
        else barcodeUi.selected.delete(id);
        paintBarcodeList();
      });
    });
    root.querySelectorAll("[data-barcode-qty]").forEach(input => {
      input.addEventListener("change", () => {
        const id = input.getAttribute("data-barcode-qty");
        const raw = String(input.value || "").trim();
        if (!raw) delete barcodeUi.qtyByGroup[id];
        else {
          const n = Math.floor(Number(raw));
          barcodeUi.qtyByGroup[id] = Math.max(1, Math.min(Number.isFinite(n) ? n : 1, 500));
        }
        paintBarcodeList();
      });
    });
    root.querySelectorAll("[data-barcode-one]").forEach(btn => {
      btn.addEventListener("click", e => {
        e.preventDefault();
        e.stopPropagation();
        const row = rows.find(r => r.groupId === btn.getAttribute("data-barcode-one"));
        if (row) downloadProductBarcodeLabelsPDF([row]);
      });
    });
  }

  /* ── Scanner → cart ───────────────────────────────────────────────────── */

  async function addScannedGroupToCart(group, qtyDelta = 1) {
    if (!group) return { ok: false, error: "Item not found" };
    if (Number(group.remainingQty || 0) <= 0.00000001) {
      return { ok: false, error: "Out of stock" };
    }
    const unitPrice = groupLabelPrice(group);
    if (!(unitPrice > 0)) {
      return { ok: false, error: "Set a sale price first" };
    }
    if (typeof ensureSaleDraftShape !== "function" || typeof persistSaleDraft !== "function") {
      return { ok: false, error: "Cart unavailable" };
    }
    const draft = ensureSaleDraftShape();
    if (!draft.draftNumber && typeof nextProformaNumber === "function") {
      draft.draftNumber = nextProformaNumber();
    }
    const delta = Number(qtyDelta || 1);
    const already = typeof getSaleDraftQtyForGroup === "function"
      ? getSaleDraftQtyForGroup(group.group_id)
      : (draft.lines || []).filter(l => l.groupId === group.group_id).reduce((s, l) => s + Number(l.qty || 0), 0);
    if (already + delta > Number(group.remainingQty || 0) + 0.00000001) {
      return { ok: false, error: "Not enough stock" };
    }

    let line = (draft.lines || []).find(l => String(l.groupId) === String(group.group_id));
    const category = typeof resolveInventoryItemCategory === "function"
      ? resolveInventoryItemCategory(group)
      : (group.itemCategory || "General");

    if (line) {
      line.qty = Number(line.qty || 0) + delta;
      if (typeof refreshSaleDraftLineTax === "function") refreshSaleDraftLineTax(line, group);
      else {
        const taxDefault = typeof inventoryTaxDefaultsForGroup === "function"
          ? inventoryTaxDefaultsForGroup(group)
          : { rate: 0, mode: "exclusive" };
        const tax = typeof calculateTaxBreakdown === "function"
          ? calculateTaxBreakdown(unitPrice * line.qty, taxDefault.rate, taxDefault.mode, taxDefault.rate > 0)
          : { net: unitPrice * line.qty, tax: 0, total: unitPrice * line.qty, applied: false, rate: 0, mode: "exclusive" };
        line.netAmount = tax.net;
        line.taxAmount = tax.tax;
        line.grossAmount = tax.total;
      }
    } else {
      const taxDefault = typeof inventoryTaxDefaultsForGroup === "function"
        ? inventoryTaxDefaultsForGroup(group)
        : { rate: 0, mode: "exclusive" };
      const tax = typeof calculateTaxBreakdown === "function"
        ? calculateTaxBreakdown(unitPrice * delta, taxDefault.rate, taxDefault.mode, taxDefault.rate > 0)
        : { net: unitPrice * delta, tax: 0, total: unitPrice * delta, applied: false, rate: 0, mode: "exclusive" };
      line = {
        lineId: (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : `scan-${Date.now()}`,
        groupId: group.group_id,
        itemName: group.person_name || "Item",
        itemCode: group.itemCode || "",
        brand: group.brand || "",
        subBrand: group.subBrand || "",
        productLine: group.productLine || "",
        variantLabel: group.variantLabel || "",
        variantStorage: group.variantStorage || "",
        variantColor: group.variantColor || "",
        itemType: group.itemType || "General",
        itemCategory: category,
        currency: group.currency || "AED",
        qty: delta,
        displayUnit: typeof preferredDraftQtyUnit === "function" ? preferredDraftQtyUnit(category, delta) : "pcs",
        sellBy: group.sellBy || "",
        unitPrice,
        taxApplied: tax.applied,
        taxRate: tax.rate,
        taxMode: tax.mode,
        netAmount: tax.net,
        taxAmount: tax.tax,
        grossAmount: tax.total,
        fromScanner: true
      };
      draft.lines.push(line);
    }
    if (!draft.soldDate && typeof todayISO === "function") draft.soldDate = todayISO();
    persistSaleDraft();
    try { if (typeof upsertSaleDraftInLibrary === "function") upsertSaleDraftInLibrary(draft); } catch (_) {}
    if (typeof updateSaleDraftDock === "function") updateSaleDraftDock();
    return { ok: true, line, qty: Number(line.qty || 0), name: productDisplayName(group) };
  }

  function scannerProgressRows() {
    const draft = state.saleDraft || { lines: [] };
    return (draft.lines || []).map((line, index) => ({
      index,
      lineId: line.lineId,
      groupId: line.groupId,
      name: [line.brand, line.productLine || line.variantLabel, line.itemName].filter(Boolean).join(" · ") || line.itemName || "Item",
      qty: Number(line.qty || 0),
      unitPrice: Number(line.unitPrice || 0),
      total: Number(line.grossAmount != null ? line.grossAmount : (line.unitPrice || 0) * (line.qty || 0)),
      currency: line.currency || "AED"
    }));
  }

  function paintScannerChrome() {
    const status = document.getElementById("invScannerStatus");
    const onlineEl = document.getElementById("invScannerOnlineBadge");
    if (status) status.textContent = scannerUi.status;
    if (onlineEl) {
      const online = isOnline();
      onlineEl.textContent = online ? "Online" : "Offline · cart saved locally";
      onlineEl.classList.toggle("is-offline", !online);
    }
  }

  function paintScannerProgress() {
    paintScannerChrome();
    const list = document.getElementById("invScannerProgressList");
    const totals = document.getElementById("invScannerProgressTotals");
    if (!list) return;
    const rows = scannerProgressRows();
    if (!rows.length) {
      list.innerHTML = `<div class="empty inv-scan-empty">No items scanned yet</div>`;
    } else {
      list.innerHTML = rows.map(row => `
        <div class="inv-scan-row" data-scan-line="${row.index}">
          <div class="inv-scan-main">
            <strong>${escapeHtml(row.name)}</strong>
            <span>Unit ${escapeHtml(moneySafe(row.unitPrice, row.currency))}</span>
          </div>
          <div class="inv-scan-qty">
            <button type="button" class="tiny ghost" data-scan-dec="${row.index}" title="Decrease">−</button>
            <em>${row.qty}</em>
            <button type="button" class="tiny ghost" data-scan-inc="${row.index}" title="Increase">+</button>
          </div>
          <strong class="inv-scan-total">${escapeHtml(moneySafe(row.total, row.currency))}</strong>
          <button type="button" class="tiny ghost inv-scan-rm" data-scan-rm="${row.index}" title="Remove item"><i class="fa-solid fa-trash"></i></button>
        </div>
      `).join("");
    }
    if (totals) {
      const units = rows.reduce((s, r) => s + r.qty, 0);
      const lines = rows.length;
      const sum = rows.reduce((acc, r) => {
        const cur = r.currency || "AED";
        acc[cur] = (acc[cur] || 0) + Number(r.total || 0);
        return acc;
      }, {});
      const text = Object.keys(sum).length
        ? Object.entries(sum).map(([c, v]) => moneySafe(v, c)).join(" · ")
        : moneySafe(0, "AED");
      totals.innerHTML = `
        <div class="inv-scan-stats">
          <span>${lines} item${lines === 1 ? "" : "s"}</span>
          <span>${units} unit${units === 1 ? "" : "s"}</span>
        </div>
        <strong>${escapeHtml(text)}</strong>
      `;
    }
    list.querySelectorAll("[data-scan-dec]").forEach(btn => {
      btn.addEventListener("click", () => adjustScanLine(Number(btn.getAttribute("data-scan-dec")), -1));
    });
    list.querySelectorAll("[data-scan-inc]").forEach(btn => {
      btn.addEventListener("click", () => adjustScanLine(Number(btn.getAttribute("data-scan-inc")), 1));
    });
    list.querySelectorAll("[data-scan-rm]").forEach(btn => {
      btn.addEventListener("click", () => removeScanLine(Number(btn.getAttribute("data-scan-rm"))));
    });
  }

  function adjustScanLine(index, delta) {
    const draft = ensureSaleDraftShape();
    const line = draft.lines?.[index];
    if (!line) return;
    const group = getInventoryProductGroups().find(g => String(g.group_id) === String(line.groupId));
    if (delta > 0 && group) {
      const already = Number(line.qty || 0);
      if (already + delta > Number(group.remainingQty || 0) + 0.00000001) {
        scannerUi.status = "Not enough stock";
        paintScannerProgress();
        return;
      }
    }
    const next = Number(line.qty || 0) + delta;
    if (next <= 0) draft.lines.splice(index, 1);
    else {
      line.qty = next;
      if (typeof refreshSaleDraftLineTax === "function") refreshSaleDraftLineTax(line, group);
    }
    persistSaleDraft();
    if (typeof updateSaleDraftDock === "function") updateSaleDraftDock();
    paintScannerProgress();
  }

  function removeScanLine(index) {
    if (typeof removeSaleDraftLine === "function") removeSaleDraftLine(index);
    else {
      const draft = ensureSaleDraftShape();
      draft.lines.splice(index, 1);
      persistSaleDraft();
    }
    if (typeof updateSaleDraftDock === "function") updateSaleDraftDock();
    paintScannerProgress();
  }

  function clearScannerCart() {
    const draft = ensureSaleDraftShape();
    draft.lines = [];
    persistSaleDraft();
    try { if (typeof upsertSaleDraftInLibrary === "function") upsertSaleDraftInLibrary(draft); } catch (_) {}
    if (typeof updateSaleDraftDock === "function") updateSaleDraftDock();
    scannerUi.status = "Cart cleared";
    paintScannerProgress();
  }

  function ensureScannerOverlay() {
    let el = document.getElementById("inventoryBarcodeScannerOverlay");
    if (el && !el.querySelector("#invScannerPrintThermalBtn")) {
      el.remove();
      el = null;
    }
    if (el) return el;
    el = document.createElement("div");
    el.id = "inventoryBarcodeScannerOverlay";
    el.className = "inv-scanner-overlay hide";
    el.setAttribute("aria-hidden", "true");
    el.innerHTML = `
      <div class="inv-scanner-shell" role="dialog" aria-modal="true" aria-labelledby="invScannerTitle">
        <header class="inv-scanner-head">
          <div>
            <h3 id="invScannerTitle">Scanner</h3>
            <p id="invScannerStatus">Show barcode to the camera</p>
            <span id="invScannerOnlineBadge" class="inv-scanner-online">Online</span>
          </div>
          <button type="button" class="icon-btn ghost" id="invScannerCloseBtn" aria-label="Close scanner"><i class="fa-solid fa-xmark"></i></button>
        </header>
        <div class="inv-scanner-body">
          <div class="inv-scanner-camera">
            <video id="invScannerVideo" playsinline muted autoplay></video>
            <div class="inv-scanner-frame" aria-hidden="true"></div>
            <div class="inv-scanner-manual">
              <label class="inv-scanner-lookup-label" for="invScannerManualInput">
                Barcode, item code, or product name
              </label>
              <div class="inv-scanner-lookup">
                <input id="invScannerManualInput" class="input" placeholder="Scan, type barcode, or search name…" autocomplete="off" />
                <button type="button" class="tiny soft" id="invScannerLookupBtn" title="Search / add">Add</button>
              </div>
              <div id="invScannerLookupResults" class="inv-scanner-lookup-results hide" role="listbox" aria-label="Matching products"></div>
            </div>
          </div>
          <aside class="inv-scanner-progress">
            <div class="inv-scanner-progress-head">
              <strong>Live cart</strong>
              <div class="inv-scanner-progress-actions">
                <label class="inv-scanner-thermal-size" title="Thermal paper width">
                  <select id="invScannerThermalWidth" aria-label="Thermal width">
                    <option value="80">80mm</option>
                    <option value="58">58mm</option>
                  </select>
                </label>
                <button type="button" class="tiny soft" id="invScannerPrintThermalBtn" title="Print thermal merchant receipt for this cart"><i class="fa-solid fa-receipt"></i></button>
                <button type="button" class="tiny soft" id="invScannerPrintLabelsBtn" title="Print barcode labels for cart items"><i class="fa-solid fa-barcode"></i></button>
                <button type="button" class="tiny ghost" id="invScannerClearCartBtn">Clear</button>
                <button type="button" class="tiny soft" id="invScannerOpenCartBtn">Open cart</button>
              </div>
            </div>
            <div id="invScannerProgressList" class="inv-scanner-progress-list"></div>
            <div id="invScannerProgressTotals" class="inv-scanner-progress-totals"></div>
          </aside>
        </div>
      </div>
    `;
    document.body.appendChild(el);
    el.querySelector("#invScannerCloseBtn")?.addEventListener("click", closeInventoryBarcodeScanner);
    el.querySelector("#invScannerOpenCartBtn")?.addEventListener("click", () => {
      // Cart modal z-index is below the scanner; close scanner first so cart is usable.
      closeInventoryBarcodeScanner();
      if (typeof openSaleDraftModal === "function") openSaleDraftModal();
    });
    el.querySelector("#invScannerClearCartBtn")?.addEventListener("click", () => {
      if (!scannerProgressRows().length) return;
      if (confirm("Clear all scanned items from the cart?")) clearScannerCart();
    });
    el.querySelector("#invScannerPrintLabelsBtn")?.addEventListener("click", () => printScannerCartLabels());
    el.querySelector("#invScannerPrintThermalBtn")?.addEventListener("click", () => printScannerCartThermal());
    el.querySelector("#invScannerThermalWidth")?.addEventListener("change", e => {
      savePreferredThermalWidth(e.target.value);
    });
    const widthSel = el.querySelector("#invScannerThermalWidth");
    if (widthSel) widthSel.value = String(getPreferredThermalWidth());
    const manual = el.querySelector("#invScannerManualInput");
    const results = el.querySelector("#invScannerLookupResults");
    let lookupTimer = 0;
    const scheduleLookup = () => {
      clearTimeout(lookupTimer);
      lookupTimer = setTimeout(() => paintScannerLookupResults(manual?.value || ""), 120);
    };
    manual?.addEventListener("input", scheduleLookup);
    manual?.addEventListener("focus", scheduleLookup);
    manual?.addEventListener("keydown", async e => {
      if (e.key === "Escape") {
        hideScannerLookupResults();
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        moveScannerLookupHighlight(e.key === "ArrowDown" ? 1 : -1);
        return;
      }
      if (e.key !== "Enter") return;
      e.preventDefault();
      await submitScannerLookup(manual.value, { preferHighlight: true });
    });
    el.querySelector("#invScannerLookupBtn")?.addEventListener("click", async () => {
      await submitScannerLookup(manual?.value || "", { preferHighlight: true });
    });
    results?.addEventListener("mousedown", e => {
      // Keep focus on input while choosing a result
      e.preventDefault();
    });
    results?.addEventListener("click", async e => {
      const btn = e.target.closest("[data-scan-pick]");
      if (!btn) return;
      const gid = btn.getAttribute("data-scan-pick");
      await addScannerGroupById(gid);
      if (manual) manual.value = "";
      hideScannerLookupResults();
      manual?.focus();
    });
    return el;
  }

  function productSearchBlob(group) {
    return [
      group.person_name,
      group.itemCode,
      group.itemDescription,
      group.itemType,
      group.brand,
      group.subBrand,
      group.productLine,
      group.variantLabel,
      group.variantStorage,
      group.variantColor
    ].map(v => String(v || "").toLowerCase()).join(" ");
  }

  function findGroupsByLookupQuery(rawQuery) {
    const q = String(rawQuery || "").trim().toLowerCase();
    if (!q) return [];
    const groups = getInventoryProductGroups().filter(g => Number(g.remainingQty || 0) > 0.00000001);
    const exactCode = groups.filter(g => String(g.itemCode || "").toLowerCase() === q);
    if (exactCode.length) return exactCode;

    // Prefer barcode exact match via barcode rows
    const barcodeHit = resolveGroupByBarcode(rawQuery);
    if (barcodeHit && Number(barcodeHit.remainingQty || 0) > 0.00000001) return [barcodeHit];

    const tokens = q.split(/\s+/).filter(Boolean);
    return groups.filter(g => {
      const blob = productSearchBlob(g);
      return tokens.every(t => blob.includes(t));
    }).sort((a, b) => {
      const an = productDisplayName(a).toLowerCase();
      const bn = productDisplayName(b).toLowerCase();
      const aStarts = an.startsWith(q) ? 0 : 1;
      const bStarts = bn.startsWith(q) ? 0 : 1;
      return aStarts - bStarts || an.localeCompare(bn);
    }).slice(0, 12);
  }

  function hideScannerLookupResults() {
    const box = document.getElementById("invScannerLookupResults");
    if (!box) return;
    box.classList.add("hide");
    box.innerHTML = "";
    box.dataset.highlight = "-1";
  }

  function paintScannerLookupResults(rawQuery) {
    const box = document.getElementById("invScannerLookupResults");
    if (!box) return;
    const q = String(rawQuery || "").trim();
    if (q.length < 1) {
      hideScannerLookupResults();
      return;
    }
    // Pure barcode-looking strings: keep results quiet unless name-like
    const looksLikeBarcode = /^[A-Za-z0-9\-_.]{6,}$/.test(q) && !/\s/.test(q);
    const matches = findGroupsByLookupQuery(q);
    if (!matches.length) {
      box.classList.remove("hide");
      box.innerHTML = `<div class="inv-scanner-lookup-empty">No in-stock match for “${escapeHtml(q)}”</div>`;
      box.dataset.highlight = "-1";
      return;
    }
    if (looksLikeBarcode && matches.length === 1 && resolveGroupByBarcode(q)) {
      // Exact barcode — don't clutter; Enter will add it
      hideScannerLookupResults();
      return;
    }
    box.classList.remove("hide");
    box.dataset.highlight = "0";
    box.innerHTML = matches.map((g, i) => {
      const price = groupLabelPrice(g);
      const stock = typeof inventoryQtyLabel === "function"
        ? inventoryQtyLabel(g.remainingQty, g.itemCategory, g)
        : String(g.remainingQty || 0);
      const code = g.itemCode ? ` · ${g.itemCode}` : "";
      return `
        <button type="button" class="inv-scanner-lookup-item${i === 0 ? " is-active" : ""}" role="option" data-scan-pick="${escapeHtml(String(g.group_id))}" data-scan-idx="${i}">
          <span class="inv-scanner-lookup-name">${escapeHtml(productDisplayName(g))}${escapeHtml(code)}</span>
          <span class="inv-scanner-lookup-meta">${escapeHtml(stock)} · ${escapeHtml(moneySafe(price, g.currency))}</span>
        </button>
      `;
    }).join("");
  }

  function moveScannerLookupHighlight(delta) {
    const box = document.getElementById("invScannerLookupResults");
    if (!box || box.classList.contains("hide")) return;
    const items = [...box.querySelectorAll("[data-scan-pick]")];
    if (!items.length) return;
    let idx = Number(box.dataset.highlight || 0);
    idx = (idx + delta + items.length) % items.length;
    box.dataset.highlight = String(idx);
    items.forEach((el, i) => el.classList.toggle("is-active", i === idx));
    items[idx]?.scrollIntoView({ block: "nearest" });
  }

  async function addScannerGroupById(groupId) {
    const group = getInventoryProductGroups().find(g => String(g.group_id) === String(groupId));
    if (!group) {
      scannerUi.status = "Item not found";
      paintScannerProgress();
      return;
    }
    const result = await addScannedGroupToCart(group, 1);
    if (!result.ok) scannerUi.status = result.error || "Could not add";
    else scannerUi.status = `Added ${result.name} · qty ${result.qty}${isOnline() ? "" : " (offline)"}`;
    paintScannerProgress();
  }

  async function submitScannerLookup(rawQuery, { preferHighlight = false } = {}) {
    const q = String(rawQuery || "").trim();
    if (!q) return;
    const manual = document.getElementById("invScannerManualInput");
    const box = document.getElementById("invScannerLookupResults");

    if (preferHighlight && box && !box.classList.contains("hide")) {
      const idx = Number(box.dataset.highlight || 0);
      const pick = box.querySelector(`[data-scan-idx="${idx}"]`) || box.querySelector("[data-scan-pick]");
      if (pick) {
        await addScannerGroupById(pick.getAttribute("data-scan-pick"));
        if (manual) manual.value = "";
        hideScannerLookupResults();
        manual?.focus();
        return;
      }
    }

    // Try barcode / exact code first (camera wedge path)
    if (!barcodeUi.loaded) await ensureInventoryBarcodes();
    let group = resolveGroupByBarcode(q);
    if (!group && isOnline() && typeof supabaseRpc === "function" && /^[A-Za-z0-9\-_.]+$/.test(q)) {
      try {
        const res = typeof unwrapRpcJson === "function"
          ? unwrapRpcJson(await supabaseRpc("app_find_goods_by_barcode", { p_barcode: q }))
          : await supabaseRpc("app_find_goods_by_barcode", { p_barcode: q });
        const gid = res?.row?.group_id || res?.data?.row?.group_id;
        if (gid) group = getInventoryProductGroups().find(g => String(g.group_id) === String(gid)) || null;
      } catch (_) {}
    }

    if (group) {
      const result = await addScannedGroupToCart(group, 1);
      if (!result.ok) scannerUi.status = result.error || "Could not add";
      else scannerUi.status = `Added ${result.name} · qty ${result.qty}${isOnline() ? "" : " (offline)"}`;
      paintScannerProgress();
      if (manual) manual.value = "";
      hideScannerLookupResults();
      manual?.focus();
      return;
    }

    const matches = findGroupsByLookupQuery(q);
    if (matches.length === 1) {
      await addScannerGroupById(matches[0].group_id);
      if (manual) manual.value = "";
      hideScannerLookupResults();
      manual?.focus();
      return;
    }
    if (matches.length > 1) {
      paintScannerLookupResults(q);
      scannerUi.status = `${matches.length} matches — pick one or refine the name`;
      paintScannerChrome();
      return;
    }

    scannerUi.status = `Not found: ${q}`;
    paintScannerLookupResults(q);
    paintScannerChrome();
  }

  async function handleScannedBarcode(rawCode, { fromCamera = false } = {}) {
    const code = normalizeBarcodeValue(rawCode);
    if (!code) return;
    const now = Date.now();
    if (code === scannerUi.lastCode && now - scannerUi.lastAt < SCAN_COOLDOWN_SAME_MS) return;
    if (code !== scannerUi.lastCode && now - scannerUi.lastAt < SCAN_COOLDOWN_OTHER_MS) return;
    if (scannerUi.busy) return;
    scannerUi.busy = true;
    scannerUi.lastCode = code;
    scannerUi.lastAt = now;
    try {
      if (!barcodeUi.loaded) await ensureInventoryBarcodes();
      let group = resolveGroupByBarcode(code);
      if (!group && isOnline() && typeof supabaseRpc === "function") {
        try {
          const res = typeof unwrapRpcJson === "function"
            ? unwrapRpcJson(await supabaseRpc("app_find_goods_by_barcode", { p_barcode: code }))
            : await supabaseRpc("app_find_goods_by_barcode", { p_barcode: code });
          const gid = res?.row?.group_id || res?.data?.row?.group_id;
          if (gid) group = getInventoryProductGroups().find(g => String(g.group_id) === String(gid)) || null;
        } catch (_) {}
      }
      if (!group) {
        scannerUi.status = `Not found: ${code}`;
        paintScannerProgress();
        flashScannerFrame(false);
        return;
      }
      const result = await addScannedGroupToCart(group, 1);
      if (!result.ok) {
        scannerUi.status = result.error || "Could not add";
        flashScannerFrame(false);
      } else {
        scannerUi.status = `Added ${result.name} · qty ${result.qty} — next…`;
        flashScannerFrame(true);
      }
      paintScannerProgress();
    } finally {
      scannerUi.busy = false;
    }
  }

  function flashScannerFrame(ok) {
    const frame = document.querySelector("#inventoryBarcodeScannerOverlay .inv-scanner-frame");
    if (!frame) return;
    frame.classList.remove("is-ok", "is-miss");
    frame.classList.add(ok ? "is-ok" : "is-miss");
    setTimeout(() => frame.classList.remove("is-ok", "is-miss"), 420);
  }

  function getZXingReader() {
    if (scannerUi.zxingReader) return scannerUi.zxingReader;
    const ZX = window.ZXing;
    if (!ZX?.MultiFormatReader) return null;
    try {
      const hints = new Map();
      const formats = [
        ZX.BarcodeFormat.CODE_128,
        ZX.BarcodeFormat.EAN_13,
        ZX.BarcodeFormat.EAN_8,
        ZX.BarcodeFormat.UPC_A,
        ZX.BarcodeFormat.UPC_E,
        ZX.BarcodeFormat.CODE_39,
        ZX.BarcodeFormat.ITF,
        ZX.BarcodeFormat.CODABAR,
        ZX.BarcodeFormat.QR_CODE
      ].filter(Boolean);
      if (ZX.DecodeHintType?.POSSIBLE_FORMATS) {
        hints.set(ZX.DecodeHintType.POSSIBLE_FORMATS, formats);
      }
      if (ZX.DecodeHintType?.TRY_HARDER) {
        hints.set(ZX.DecodeHintType.TRY_HARDER, true);
      }
      const reader = new ZX.MultiFormatReader();
      if (hints.size && reader.setHints) reader.setHints(hints);
      scannerUi.zxingReader = reader;
      return reader;
    } catch (_) {
      return null;
    }
  }

  function decodeWithZXing(canvas) {
    const ZX = window.ZXing;
    const reader = getZXingReader();
    if (!ZX || !reader) return "";
    const tryDecode = (source) => {
      reader.reset?.();
      const bitmap = new ZX.BinaryBitmap(new ZX.HybridBinarizer(source));
      const result = reader.decode(bitmap);
      return String(result?.getText?.() || result?.text || "").trim();
    };
    try {
      return tryDecode(new ZX.HTMLCanvasElementLuminanceSource(canvas));
    } catch (_) {
      try {
        if (ZX.InvertedLuminanceSource) {
          const base = new ZX.HTMLCanvasElementLuminanceSource(canvas);
          return tryDecode(new ZX.InvertedLuminanceSource(base));
        }
      } catch (__) {}
      try { reader.reset?.(); } catch (___) {}
      return "";
    }
  }

  function pickBestDetectorCode(codes, canvasW, canvasH) {
    if (!codes?.length) return "";
    if (codes.length === 1) return String(codes[0].rawValue || "").trim();
    // Prefer the barcode whose center is closest to the crop center (frame middle).
    const cx = canvasW / 2;
    const cy = canvasH / 2;
    let best = null;
    let bestScore = Infinity;
    codes.forEach(code => {
      const box = code.boundingBox || {};
      const bx = Number(box.x || 0) + Number(box.width || 0) / 2;
      const by = Number(box.y || 0) + Number(box.height || 0) / 2;
      const area = Math.max(1, Number(box.width || 1) * Number(box.height || 1));
      const dist = Math.hypot(bx - cx, by - cy);
      const score = dist - Math.sqrt(area) * 0.15;
      if (score < bestScore) {
        bestScore = score;
        best = code;
      }
    });
    return String(best?.rawValue || codes[0].rawValue || "").trim();
  }

  async function decodeBarcodeFromCanvas(canvas) {
    let text = "";
    try {
      if (scannerUi.detector) {
        const codes = await scannerUi.detector.detect(canvas);
        text = pickBestDetectorCode(codes, canvas.width, canvas.height);
      }
    } catch (_) {}
    if (text) return text;
    text = decodeWithZXing(canvas);
    if (text) return text;
    // Second pass: contrast-boosted copy (helps faint sticker prints)
    try {
      const boosted = boostCanvasContrast(canvas);
      if (boosted) {
        if (scannerUi.detector) {
          const codes = await scannerUi.detector.detect(boosted);
          text = pickBestDetectorCode(codes, boosted.width, boosted.height);
        }
        if (!text) text = decodeWithZXing(boosted);
      }
    } catch (_) {}
    return text || "";
  }

  function boostCanvasContrast(source) {
    if (!source) return null;
    if (!scannerUi.enhanceCanvas) scannerUi.enhanceCanvas = document.createElement("canvas");
    const canvas = scannerUi.enhanceCanvas;
    canvas.width = source.width;
    canvas.height = source.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(source, 0, 0);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = img.data;
    for (let i = 0; i < data.length; i += 4) {
      const g = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      const v = g < 140 ? 0 : 255;
      data[i] = data[i + 1] = data[i + 2] = v;
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  }

  function mapFrameToVideoPixels(video) {
    const vw = video.videoWidth || 0;
    const vh = video.videoHeight || 0;
    if (vw < 40 || vh < 40) return null;
    // Use almost the full camera view — scan as soon as a barcode appears in front.
    // Keep a tiny edge crop to avoid UI chrome / extreme lens distortion.
    return {
      sx: Math.floor(vw * 0.02),
      sy: Math.floor(vh * 0.08),
      sw: Math.floor(vw * 0.96),
      sh: Math.floor(vh * 0.72)
    };
  }

  function grabScanFrameCanvas(video) {
    const region = mapFrameToVideoPixels(video);
    if (!region) return null;
    if (!scannerUi.decodeCanvas) scannerUi.decodeCanvas = document.createElement("canvas");
    const canvas = scannerUi.decodeCanvas;
    // Cap decode size for speed while keeping enough detail for CODE128.
    const maxW = 960;
    const scale = Math.min(1.8, maxW / Math.max(region.sw, 1));
    canvas.width = Math.max(320, Math.floor(region.sw * scale));
    canvas.height = Math.max(160, Math.floor(region.sh * scale));
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(
      video,
      region.sx, region.sy, region.sw, region.sh,
      0, 0, canvas.width, canvas.height
    );
    return canvas;
  }

  function acceptDetectedCode(raw) {
    const code = normalizeBarcodeValue(raw);
    if (!code || code.length < 4) return null;
    // Instant accept — no double-confirm delay.
    scannerUi.confirmCode = code;
    scannerUi.confirmHits = 1;
    return code;
  }

  async function scanTick() {
    if (!scannerUi.open) return;
    if (scannerUi.decodeBusy || scannerUi.busy) return;
    const video = document.getElementById("invScannerVideo");
    if (!video || video.readyState < 2) return;
    scannerUi.decodeBusy = true;
    try {
      const canvas = grabScanFrameCanvas(video);
      if (!canvas) return;
      const text = await decodeBarcodeFromCanvas(canvas);
      if (text) {
        const accepted = acceptDetectedCode(text);
        if (accepted) handleScannedBarcode(accepted, { fromCamera: true });
      } else {
        const now = Date.now();
        if (now - (scannerUi.lastMissAt || 0) > 2200 && now - (scannerUi.lastAt || 0) > 1000) {
          scannerUi.lastMissAt = now;
          if (!String(scannerUi.status || "").startsWith("Added") && !String(scannerUi.status || "").startsWith("Not found")) {
            scannerUi.status = "Show barcode to the camera";
            paintScannerChrome();
          }
        }
      }
    } catch (_) {
    } finally {
      scannerUi.decodeBusy = false;
    }
  }

  function startScanLoop() {
    stopScanLoop();
    scannerUi.tickTimer = setInterval(() => {
      scanTick();
    }, SCAN_TICK_MS);
  }

  function stopScanLoop() {
    if (scannerUi.tickTimer) {
      clearInterval(scannerUi.tickTimer);
      scannerUi.tickTimer = 0;
    }
    cancelAnimationFrame(scannerUi.raf);
    scannerUi.raf = 0;
    scannerUi.decodeBusy = false;
    scannerUi.confirmCode = "";
    scannerUi.confirmHits = 0;
  }

  async function openInventoryBarcodeScanner() {
    await ensureInventoryBarcodes();
    const overlay = ensureScannerOverlay();
    scannerUi.open = true;
    scannerUi.status = "Show barcode to the camera — adds automatically";
    overlay.classList.remove("hide");
    overlay.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    paintScannerProgress();

    try {
      scannerUi.detector = null;
      if ("BarcodeDetector" in window) {
        try {
          const supported = (await window.BarcodeDetector.getSupportedFormats?.()) || [];
          const wanted = ["code_128", "ean_13", "ean_8", "upc_a", "upc_e", "code_39", "itf", "codabar", "qr_code"];
          const formats = wanted.filter(f => !supported.length || supported.includes(f));
          scannerUi.detector = new window.BarcodeDetector({ formats: formats.length ? formats : wanted });
        } catch (_) {
          try { scannerUi.detector = new window.BarcodeDetector(); } catch (__) {}
        }
      }
      if (scannerUi.stream) {
        scannerUi.stream.getTracks().forEach(t => t.stop());
        scannerUi.stream = null;
      }
      scannerUi.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          advanced: [{ focusMode: "continuous" }]
        },
        audio: false
      });
      const video = document.getElementById("invScannerVideo");
      if (video) {
        video.setAttribute("playsinline", "true");
        video.muted = true;
        video.srcObject = scannerUi.stream;
        await video.play().catch(() => {});
      }
      setTimeout(() => {
        if (scannerUi.open) startScanLoop();
      }, 120);
      scannerUi.status = "Ready — show any barcode to the camera";
      paintScannerChrome();
    } catch (err) {
      scannerUi.status = "Camera blocked — type barcode / name below";
      paintScannerProgress();
      console.warn(err);
    }
  }

  function closeInventoryBarcodeScanner() {
    scannerUi.open = false;
    stopScanLoop();
    scannerUi.detector = null;
    scannerUi.zxingReader = null;
    if (scannerUi.stream) {
      scannerUi.stream.getTracks().forEach(t => t.stop());
      scannerUi.stream = null;
    }
    const video = document.getElementById("invScannerVideo");
    if (video) video.srcObject = null;
    const overlay = document.getElementById("inventoryBarcodeScannerOverlay");
    if (overlay) {
      overlay.classList.add("hide");
      overlay.setAttribute("aria-hidden", "true");
    }
    document.body.style.overflow = "";
  }

  async function renderInventoryScannerSection() {
    const root = document.getElementById("inventoryScannerHost");
    if (root) {
      root.innerHTML = `
        <div class="inv-scanner-section-card">
          <div>
            <strong>Camera scanner</strong>
            <p>Scan continuously into the cart. Works offline — cart stays on this device until you finalize.</p>
          </div>
          <div class="inv-scanner-section-actions">
            <button type="button" class="btn primary tiny" id="invScannerSectionStartBtn"><i class="fa-solid fa-camera"></i> Start scanner</button>
            <button type="button" class="btn soft tiny" id="invScannerSectionCartBtn"><i class="fa-solid fa-cart-shopping"></i> Open cart</button>
          </div>
        </div>
      `;
      root.querySelector("#invScannerSectionStartBtn")?.addEventListener("click", () => openInventoryBarcodeScanner());
      root.querySelector("#invScannerSectionCartBtn")?.addEventListener("click", () => {
        if (typeof openSaleDraftModal === "function") openSaleDraftModal();
      });
    }
    await openInventoryBarcodeScanner();
  }

  /* ── Thermal merchant receipt ─────────────────────────────────────────── */

  const THERMAL_WIDTH_KEY = "triplem-thermal-receipt-width-mm";

  function getPreferredThermalWidth() {
    try {
      return Number(localStorage.getItem(THERMAL_WIDTH_KEY) || 80) === 58 ? 58 : 80;
    } catch (_) {
      return 80;
    }
  }

  function savePreferredThermalWidth(widthMm) {
    try {
      localStorage.setItem(THERMAL_WIDTH_KEY, String(Number(widthMm) === 58 ? 58 : 80));
    } catch (_) {}
  }

  function buildReceiptDataFromSaleDraft(draft) {
    const d = draft || state.saleDraft || { lines: [] };
    const lines = Array.isArray(d.lines) ? d.lines : [];
    const saleRows = lines.map((line, index) => {
      const category = typeof resolveInventoryItemCategory === "function"
        ? resolveInventoryItemCategory({ itemCategory: line.itemCategory, itemType: line.itemType })
        : (line.itemCategory || "General");
      const qtyDisplay = typeof inventoryQtyLabel === "function"
        ? inventoryQtyLabel(line.qty, category)
        : String(line.qty || 1);
      const name = [line.brand, line.productLine || line.variantLabel, line.itemName].filter(Boolean).join(" · ")
        || line.itemName
        || "Item";
      return {
        itemName: name,
        qty: Number(line.qty || 0),
        qtyDisplay,
        unitPrice: Number(line.unitPrice || 0),
        netAmount: Number(line.netAmount != null ? line.netAmount : (line.unitPrice || 0) * (line.qty || 0)),
        taxAmount: Number(line.taxAmount || 0),
        total: Number(line.grossAmount != null ? line.grossAmount : (line.unitPrice || 0) * (line.qty || 0)),
        currency: line.currency || "AED",
        invoiceNumber: d.draftNumber || "PROFORMA"
      };
    });
    const currency = saleRows[0]?.currency || "AED";
    const grand = saleRows.reduce((s, r) => s + Number(r.total || 0), 0);
    const paidRaw = d.paidAmount;
    const paidTotal = paidRaw === "" || paidRaw == null ? grand : Math.max(Number(paidRaw || 0), 0);
    return {
      invoiceNumber: d.draftNumber || "PROFORMA",
      receiptNumber: d.draftNumber || "PROFORMA",
      customerName: d.customerName || "Walk-in",
      date: d.soldDate || new Date().toLocaleString(),
      currency,
      saleRows,
      paidTotal,
      discountTotal: 0
    };
  }

  async function printScannerCartThermal() {
    const draft = typeof ensureSaleDraftShape === "function" ? ensureSaleDraftShape() : (state.saleDraft || { lines: [] });
    if (!draft.lines?.length) {
      alert("Cart is empty — scan or add items first.");
      return;
    }
    const widthMm = Number(document.getElementById("invScannerThermalWidth")?.value || getPreferredThermalWidth());
    savePreferredThermalWidth(widthMm);
    const receiptData = buildReceiptDataFromSaleDraft(draft);
    const logoDataUrl = await getThermalLogoDataUrl();
    const html = buildThermalReceiptHtml(receiptData, {
      widthMm,
      logoDataUrl,
      paymentMethod: paidLabelForDraft(draft, receiptData)
    });
    openThermalPrintWindow(html);
  }

  function paidLabelForDraft(draft, receiptData) {
    const grand = (receiptData.saleRows || []).reduce((s, r) => s + Number(r.total || 0), 0);
    const paid = Number(receiptData.paidTotal != null ? receiptData.paidTotal : grand);
    if (paid <= 0.0001) return "Unpaid / Credit";
    if (paid + 0.0001 >= grand) return "Paid";
    return "Partial / Credit";
  }

  async function printScannerCartLabels() {
    const draft = typeof ensureSaleDraftShape === "function" ? ensureSaleDraftShape() : (state.saleDraft || { lines: [] });
    if (!draft.lines?.length) {
      alert("Cart is empty — nothing to print.");
      return;
    }
    if (!barcodeUi.loaded) await ensureInventoryBarcodes();
    const byGroup = new Map(barcodeUi.rows.map(r => [String(r.groupId), r]));
    const rows = [];
    draft.lines.forEach(line => {
      const gid = String(line.groupId || "");
      const hit = byGroup.get(gid);
      if (hit) {
        rows.push({
          ...hit,
          unitPrice: Number(line.unitPrice || hit.unitPrice || 0),
          itemName: hit.itemName || line.itemName
        });
      } else {
        rows.push({
          groupId: gid,
          barcode: String(line.itemCode || gid.slice(0, 12) || "NOCODE").toUpperCase(),
          itemName: productDisplayName({
            brand: line.brand,
            productLine: line.productLine,
            variantLabel: line.variantLabel,
            person_name: line.itemName,
            itemCode: line.itemCode
          }),
          itemCode: line.itemCode || "",
          currency: line.currency || "AED",
          unitPrice: Number(line.unitPrice || 0)
        });
      }
    });
    // Unique products (one label per product in cart)
    const seen = new Set();
    const unique = rows.filter(r => {
      const key = String(r.groupId || r.barcode);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    downloadProductBarcodeLabelsPDF(unique);
  }

  function openThermalPrintWindow(html) {
    // Prefer a hidden iframe so we never depend on pop-ups.
    // (window.open(..., "noopener") returns null in many browsers while still
    // opening a blank tab — that caused the empty page + false "blocked" alert.)
    try {
      let frame = document.getElementById("inventoryThermalPrintFrame");
      if (!frame) {
        frame = document.createElement("iframe");
        frame.id = "inventoryThermalPrintFrame";
        frame.title = "Thermal receipt";
        frame.setAttribute("aria-hidden", "true");
        Object.assign(frame.style, {
          position: "fixed",
          right: "0",
          bottom: "0",
          width: "1px",
          height: "1px",
          border: "0",
          opacity: "0",
          pointerEvents: "none",
          zIndex: "-1"
        });
        document.body.appendChild(frame);
      }
      const doc = frame.contentDocument || frame.contentWindow?.document;
      const win = frame.contentWindow;
      if (doc && win) {
        doc.open();
        doc.write(html);
        doc.close();
        const triggerPrint = () => {
          try {
            win.focus();
            win.print();
          } catch (err) {
            console.warn("Thermal iframe print failed", err);
          }
        };
        // Wait briefly so logo/images can paint before the print dialog.
        const imgs = [...doc.images];
        if (!imgs.length) {
          setTimeout(triggerPrint, 120);
          return;
        }
        let pending = imgs.length;
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          setTimeout(triggerPrint, 80);
        };
        imgs.forEach(img => {
          if (img.complete) {
            pending -= 1;
            if (pending <= 0) finish();
          } else {
            img.addEventListener("load", () => {
              pending -= 1;
              if (pending <= 0) finish();
            }, { once: true });
            img.addEventListener("error", () => {
              pending -= 1;
              if (pending <= 0) finish();
            }, { once: true });
          }
        });
        if (pending <= 0) finish();
        setTimeout(finish, 1500);
        return;
      }
    } catch (err) {
      console.warn("Thermal iframe path failed, trying window.open", err);
    }

    // Fallback: real window, without noopener (need a live document handle).
    const w = window.open("", "_blank", "width=420,height=720");
    if (!w || !w.document) {
      alert("Could not open the print preview. Allow pop-ups for this site, then try again.");
      return;
    }
    try {
      w.document.open();
      w.document.write(html);
      w.document.close();
      setTimeout(() => {
        try { w.focus(); w.print(); } catch (_) {}
      }, 250);
    } catch (err) {
      console.warn(err);
      alert("Could not write the merchant receipt. Please try again.");
    }
  }

  function openInventoryBarcodeScannerFromCart() {
    try {
      if (typeof syncSaleDraftFormFromModal === "function") syncSaleDraftFormFromModal();
    } catch (_) {}
    try {
      if (typeof closeModal === "function") closeModal("inventorySaleDraftModal");
    } catch (_) {
      document.getElementById("inventorySaleDraftModal")?.classList.add("hide");
    }
    openInventoryBarcodeScanner();
  }

  function getContactForThermal() {
    if (typeof getPdfCompanyContact === "function") {
      try {
        const c = getPdfCompanyContact();
        if (c) {
          return {
            name: c.name || "Store",
            phone: c.phone || "",
            address: c.address || "",
            trn: c.trn || "",
            email: c.email || ""
          };
        }
      } catch (_) {}
    }
    return {
      name: String(fullConfigData?.Company || fullConfigData?.Name || "Store").trim() || "Store",
      phone: String(fullConfigData?.Mobile || fullConfigData?.Phone || fullConfigData?.company_phone || "").trim(),
      address: String(fullConfigData?.Address || fullConfigData?.company_address || "").trim(),
      trn: String(fullConfigData?.TRN || "").trim(),
      email: String(fullConfigData?.Email || fullConfigData?.company_email || "").trim()
    };
  }

  async function getThermalLogoDataUrl() {
    try {
      if (typeof getPdfLogo === "function") return await getPdfLogo();
    } catch (_) {}
    return null;
  }

  function buildThermalReceiptHtml(receiptData, { widthMm = 80, logoDataUrl = null, paymentMethod = "" } = {}) {
    const contact = getContactForThermal();
    const rows = receiptData?.saleRows || [];
    const currency = receiptData?.currency || rows[0]?.currency || "AED";
    const invoice = receiptData?.invoiceNumber || receiptData?.receiptNumber || "—";
    const customer = receiptData?.customerName || "Walk-in";
    const dateText = receiptData?.date || new Date().toLocaleString();
    const paper = Number(widthMm) === 58 ? 58 : 80;
    const bodyW = paper === 58 ? 52 : 72;
    const fontSize = paper === 58 ? 10 : 11;

    let subtotal = 0;
    let taxTotal = 0;
    let grand = 0;
    let discount = Number(receiptData?.discountTotal || 0);
    rows.forEach(r => {
      subtotal += Number(r.netAmount || 0);
      taxTotal += Number(r.taxAmount || 0);
      grand += Number(r.total || 0);
    });
    const paid = Number(receiptData?.paidTotal != null ? receiptData.paidTotal : grand);
    const payLabel = paymentMethod || (paid >= grand - 0.0001 ? "Paid" : "Partial / Credit");

    const lines = rows.map(r => `
      <div class="th-line">
        <div class="th-item">${escapeHtml(String(r.itemName || "Item").replace(/\s*\(#\d+\)\s*$/, ""))}</div>
        <div class="th-qty">${escapeHtml(String(r.qtyDisplay || r.qty || 1))} × ${escapeHtml(moneySafe(r.unitPrice, currency, { forPdf: true }))}</div>
        <div class="th-amt">${escapeHtml(moneySafe(r.total, currency, { forPdf: true }))}</div>
      </div>
    `).join("");

    const logoSrc = (() => {
      const s = String(logoDataUrl || "").trim();
      if (!s) return "";
      if (!(s.startsWith("data:image/") || /^https?:\/\//i.test(s) || s.startsWith("blob:"))) return "";
      if (s.includes('"') || s.includes("<") || s.includes(">")) return "";
      return s;
    })();

    return `<!doctype html>
<html><head><meta charset="utf-8" />
<title>Receipt ${escapeHtml(invoice)}</title>
<style>
  @page { size: ${paper}mm auto; margin: 1.5mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 3mm 2.5mm;
    width: ${bodyW}mm; font-family: "Courier New", Courier, monospace;
    font-size: ${fontSize}px; color: #000; background: #fff;
  }
  .th-shop { text-align: center; margin-bottom: 5px; }
  .th-logo { max-width: 28mm; max-height: 14mm; margin: 0 auto 3px; display:block; }
  .th-shop h1 { margin: 0; font-size: ${paper === 58 ? 12 : 14}px; font-weight: 700; }
  .th-shop p { margin: 1px 0; font-size: ${paper === 58 ? 9 : 10}px; }
  .th-meta { border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 4px 0; margin: 4px 0; font-size: ${paper === 58 ? 9 : 10}px; }
  .th-line { display: grid; grid-template-columns: 1fr auto; gap: 1px 4px; margin: 4px 0; }
  .th-item { grid-column: 1 / -1; font-weight: 700; }
  .th-qty { font-size: ${paper === 58 ? 9 : 10}px; }
  .th-amt { text-align: right; font-weight: 700; }
  .th-totals { border-top: 1px dashed #000; margin-top: 6px; padding-top: 4px; }
  .th-totals div { display: flex; justify-content: space-between; margin: 2px 0; }
  .th-totals .grand { font-size: ${paper === 58 ? 12 : 13}px; font-weight: 700; margin-top: 4px; }
  .th-foot { text-align: center; margin-top: 8px; font-size: ${paper === 58 ? 9 : 10}px; }
  @media print {
    html, body { width: ${bodyW}mm; margin: 0; padding: 2mm; }
  }
</style></head><body>
  <div class="th-shop">
    ${logoSrc ? `<img class="th-logo" src="${logoSrc}" alt="" />` : ""}
    <h1>${escapeHtml(contact.name || "Store")}</h1>
    ${contact.address ? `<p>${escapeHtml(contact.address)}</p>` : ""}
    ${contact.phone ? `<p>${escapeHtml(contact.phone)}</p>` : ""}
    ${contact.trn ? `<p>TRN: ${escapeHtml(contact.trn)}</p>` : ""}
  </div>
  <div class="th-meta">
    <div>Invoice: ${escapeHtml(invoice)}</div>
    <div>Date: ${escapeHtml(dateText)}</div>
    <div>Customer: ${escapeHtml(customer)}</div>
    <div>Payment: ${escapeHtml(payLabel)}</div>
  </div>
  ${lines || `<div class="th-line"><div class="th-item">No items</div></div>`}
  <div class="th-totals">
    <div><span>Subtotal</span><span>${escapeHtml(moneySafe(subtotal, currency, { forPdf: true }))}</span></div>
    ${discount > 0.0001 ? `<div><span>Discount</span><span>-${escapeHtml(moneySafe(discount, currency, { forPdf: true }))}</span></div>` : ""}
    <div><span>Tax</span><span>${escapeHtml(moneySafe(taxTotal, currency, { forPdf: true }))}</span></div>
    <div class="grand"><span>TOTAL</span><span>${escapeHtml(moneySafe(grand, currency, { forPdf: true }))}</span></div>
    <div><span>Paid</span><span>${escapeHtml(moneySafe(paid, currency, { forPdf: true }))}</span></div>
  </div>
  <div class="th-foot">${escapeHtml(THERMAL_FOOTER)}</div>
</body></html>`;
  }

  async function printInventoryMerchantReceipt(entryIdOrReceipt, options = {}) {
    let receiptData = null;
    const key = String(entryIdOrReceipt || "").trim();
    if (!key) {
      alert("Receipt not found.");
      return;
    }
    if (typeof getInventoryReceiptData === "function") {
      const saleEntry = (state.entries || []).find(e => String(e.id) === key);
      const meta = saleEntry && typeof goodsMetaFromNotes === "function"
        ? goodsMetaFromNotes(saleEntry.notes)
        : {};
      const receiptNo = meta.receiptNumber || meta.invoiceNumber || key;
      receiptData = getInventoryReceiptData(receiptNo, saleEntry || null);
      if (!receiptData?.saleRows?.length && saleEntry) {
        receiptData = getInventoryReceiptData(key, saleEntry);
      }
    }
    if (!receiptData?.saleRows?.length) {
      alert("Could not build merchant receipt for this invoice.");
      return;
    }
    const first = receiptData.saleRows[0];
    receiptData.invoiceNumber = receiptData.invoiceNumber || first.invoiceNumber || key;
    receiptData.receiptNumber = receiptData.receiptNumber || first.initialReceiptNumber || receiptData.invoiceNumber;
    receiptData.customerName = receiptData.customerName || first.entryMeta?.customerName || first.customerCompany || "Customer";
    receiptData.date = receiptData.date || first.entry?.action_date || new Date().toLocaleString();
    receiptData.currency = receiptData.currency || first.currency || "AED";
    if (receiptData.discountTotal == null) {
      const metaDiscount = Number(first.entryMeta?.discountTotal || first.entryMeta?.discount || 0);
      receiptData.discountTotal = metaDiscount > 0 ? metaDiscount : 0;
    }
    const metaPay = String(
      options.paymentMethod
      || first.entryMeta?.paymentMethod
      || first.entryMeta?.payment_mode
      || first.entryMeta?.paidVia
      || ""
    ).trim();

    const widthMm = Number(options.widthMm) === 58 ? 58 : getPreferredThermalWidth();
    savePreferredThermalWidth(widthMm);
    const logoDataUrl = options.includeLogo === false ? null : await getThermalLogoDataUrl();
    const html = buildThermalReceiptHtml(receiptData, {
      widthMm,
      logoDataUrl,
      paymentMethod: metaPay
    });
    openThermalPrintWindow(html);
  }

  function patchSalesSuccessOverlayForThermal() {
    const original = window.ensureSalesInvoiceSuccessOverlay;
    if (typeof original !== "function" || original.__thermalPatched) return;
    window.ensureSalesInvoiceSuccessOverlay = function patchedEnsureSalesInvoiceSuccessOverlay() {
      const overlay = original();
      if (!overlay.querySelector("#salesInvoiceSuccessThermalBtn")) {
        const actions = overlay.querySelector(".sales-invoice-success-actions");
        if (actions) {
          const wrap = document.createElement("div");
          wrap.className = "sales-invoice-thermal-wrap";
          wrap.innerHTML = `
            <label class="sales-invoice-thermal-size">
              <span>Thermal</span>
              <select id="salesInvoiceThermalWidth">
                <option value="80">80 mm</option>
                <option value="58">58 mm</option>
              </select>
            </label>
            <button type="button" class="btn soft" id="salesInvoiceSuccessThermalBtn">
              <i class="fa-solid fa-receipt" aria-hidden="true"></i> Print merchant receipt
            </button>
          `;
          actions.insertBefore(wrap, actions.querySelector("[data-sales-invoice-close]") || null);
          wrap.querySelector("#salesInvoiceSuccessThermalBtn")?.addEventListener("click", () => {
            const widthMm = Number(wrap.querySelector("#salesInvoiceThermalWidth")?.value || getPreferredThermalWidth());
            savePreferredThermalWidth(widthMm);
            printInventoryMerchantReceipt(overlay.dataset.entryId || "", { widthMm });
          });
          const widthSel = wrap.querySelector("#salesInvoiceThermalWidth");
          if (widthSel) widthSel.value = String(getPreferredThermalWidth());
        }
      }
      return overlay;
    };
    window.ensureSalesInvoiceSuccessOverlay.__thermalPatched = true;
  }

  function bindThermalReprintDelegation() {
    if (document.documentElement.dataset.thermalReprintBound === "1") return;
    document.documentElement.dataset.thermalReprintBound = "1";
    document.addEventListener("click", e => {
      const btn = e.target.closest(".inventoryThermalPrintBtn, [data-thermal-print]");
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      const entryId = btn.dataset.entryId || btn.dataset.id || btn.getAttribute("data-thermal-print") || "";
      const widthMm = Number(btn.dataset.thermalWidth || getPreferredThermalWidth());
      printInventoryMerchantReceipt(entryId, { widthMm });
    });
  }

  function bindOnlineSync() {
    window.addEventListener("online", async () => {
      scannerUi.online = true;
      await flushBarcodeSyncQueue();
      paintScannerChrome();
    });
    window.addEventListener("offline", () => {
      scannerUi.online = false;
      paintScannerChrome();
    });
  }

  /* ── Public API ───────────────────────────────────────────────────────── */

  window.ensureInventoryBarcodes = ensureInventoryBarcodes;
  window.renderInventoryBarcodesSection = renderInventoryBarcodesSection;
  window.renderInventoryScannerSection = renderInventoryScannerSection;
  window.openInventoryBarcodeScanner = openInventoryBarcodeScanner;
  window.openInventoryBarcodeScannerFromCart = openInventoryBarcodeScannerFromCart;
  window.closeInventoryBarcodeScanner = closeInventoryBarcodeScanner;
  window.downloadProductBarcodeLabelsPDF = downloadProductBarcodeLabelsPDF;
  window.printInventoryMerchantReceipt = printInventoryMerchantReceipt;
  window.printScannerCartThermal = printScannerCartThermal;
  window.handleInventoryScannedBarcode = handleScannedBarcode;
  window.flushInventoryBarcodeSyncQueue = flushBarcodeSyncQueue;

  document.addEventListener("DOMContentLoaded", () => {
    patchSalesSuccessOverlayForThermal();
    bindOnlineSync();
    bindThermalReprintDelegation();
  });
  if (document.readyState !== "loading") {
    patchSalesSuccessOverlayForThermal();
    bindOnlineSync();
    bindThermalReprintDelegation();
  }
})();
