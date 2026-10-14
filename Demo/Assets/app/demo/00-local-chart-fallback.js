(function (global) {
  "use strict";
  if (global.Chart) return;

  const instances = new WeakMap();
  const DEFAULT_COLORS = ["#2563eb", "#16a34a", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#64748b"];
  const finite = v => Number.isFinite(Number(v));
  const n = v => finite(v) ? Number(v) : 0;
  const css = (name, fallback) => {
    try { return String(getComputedStyle(document.documentElement).getPropertyValue(name) || "").trim() || fallback; }
    catch (_) { return fallback; }
  };
  const textColor = () => css("--text", "#17212b");
  const mutedColor = () => css("--muted", "#667085");
  const lineColor = () => css("--line", "rgba(148,163,184,.25)");

  function colorAt(value, index, fallback) {
    if (Array.isArray(value)) return value[index % Math.max(1, value.length)] || fallback;
    if (typeof value === "string") return value;
    return fallback;
  }

  function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.max(0, Math.min(r || 0, Math.abs(w) / 2, Math.abs(h) / 2));
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function numericValues(dataSets) {
    const out = [];
    for (const ds of dataSets || []) {
      for (const raw of ds.data || []) {
        if (Array.isArray(raw)) raw.forEach(v => finite(v) && out.push(Number(v)));
        else if (raw && typeof raw === "object") {
          if (finite(raw.y)) out.push(Number(raw.y));
          else Object.values(raw).forEach(v => finite(v) && out.push(Number(v)));
        } else if (finite(raw)) out.push(Number(raw));
      }
    }
    return out;
  }

  class DemoChart {
    constructor(target, config) {
      this.canvas = target && target.canvas ? target.canvas : target;
      if (!this.canvas || !this.canvas.getContext) throw new Error("Chart canvas unavailable");
      this.ctx = this.canvas.getContext("2d");
      this.config = config || {};
      this.data = this.config.data || { labels: [], datasets: [] };
      this.options = this.config.options || {};
      this.scales = {};
      this._destroyed = false;
      this._meta = [];
      instances.set(this.canvas, this);
      if (global.ResizeObserver) {
        this._ro = new ResizeObserver(() => this._queueDraw());
        try { this._ro.observe(this.canvas.parentElement || this.canvas); } catch (_) {}
      }
      this._queueDraw();
      global.setTimeout(() => this._queueDraw(), 80);
      global.setTimeout(() => this._queueDraw(), 450);
    }
    static getChart(canvas) { return instances.get(canvas && canvas.canvas ? canvas.canvas : canvas) || null; }
    _queueDraw() {
      if (this._destroyed || this._raf) return;
      this._raf = requestAnimationFrame(() => { this._raf = 0; this.draw(); });
    }
    _size() {
      const parent = this.canvas.parentElement;
      const rect = this.canvas.getBoundingClientRect();
      let width = Math.round(rect.width || parent?.clientWidth || Number(this.canvas.getAttribute("width")) || 420);
      let height = Math.round(rect.height || parent?.clientHeight || Number(this.canvas.getAttribute("height")) || 220);
      if (width < 40) width = Math.max(280, parent?.clientWidth || 420);
      if (height < 40) height = 220;
      const dpr = Math.min(2, Math.max(1, global.devicePixelRatio || 1));
      const pxW = Math.max(1, Math.round(width * dpr));
      const pxH = Math.max(1, Math.round(height * dpr));
      if (this.canvas.width !== pxW || this.canvas.height !== pxH) {
        this.canvas.width = pxW; this.canvas.height = pxH;
        this.canvas.style.width = width + "px"; this.canvas.style.height = height + "px";
      }
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { width, height };
    }
    clear() {
      const { width, height } = this._size();
      this.ctx.clearRect(0, 0, width, height);
      return { width, height };
    }
    destroy() {
      this._destroyed = true;
      if (this._raf) cancelAnimationFrame(this._raf);
      try { this._ro?.disconnect(); } catch (_) {}
      instances.delete(this.canvas);
      const r = this.canvas.getBoundingClientRect();
      this.ctx.clearRect(0, 0, r.width || this.canvas.width, r.height || this.canvas.height);
    }
    update() { this._queueDraw(); }
    resize() { this._queueDraw(); }
    toBase64Image() { try { return this.canvas.toDataURL("image/png"); } catch (_) { return ""; } }
    getDatasetMeta(i) { return { data: this._meta[i] || [] }; }

    draw() {
      if (this._destroyed) return;
      const { width, height } = this.clear();
      const type = String(this.config.type || "line").toLowerCase();
      if (type === "doughnut" || type === "pie") this._drawDoughnut(width, height, type === "pie");
      else if (type === "bar") this._drawCartesian(width, height, "bar");
      else if (type === "scatter") this._drawCartesian(width, height, "scatter");
      else this._drawCartesian(width, height, "line");
    }

    _drawGrid(ctx, plot, min, max, labels) {
      ctx.save();
      ctx.strokeStyle = lineColor();
      ctx.fillStyle = mutedColor();
      ctx.lineWidth = 1;
      ctx.font = '10px system-ui,-apple-system,"Segoe UI",sans-serif';
      ctx.textBaseline = "middle";
      for (let i = 0; i <= 4; i++) {
        const y = plot.top + (plot.height * i / 4);
        ctx.beginPath(); ctx.moveTo(plot.left, y); ctx.lineTo(plot.left + plot.width, y); ctx.stroke();
        const value = max - ((max - min) * i / 4);
        const label = Math.abs(value) >= 1000 ? (value / 1000).toFixed(Math.abs(value) >= 10000 ? 0 : 1) + "k" : value.toFixed(Math.abs(value) < 10 ? 1 : 0);
        ctx.textAlign = "right"; ctx.fillText(label, plot.left - 7, y);
      }
      const maxTicks = Math.min(labels.length, plot.width < 460 ? 5 : 8);
      if (labels.length) {
        for (let t = 0; t < maxTicks; t++) {
          const idx = maxTicks === 1 ? 0 : Math.round(t * (labels.length - 1) / (maxTicks - 1));
          const x = plot.left + (labels.length <= 1 ? plot.width / 2 : plot.width * idx / (labels.length - 1));
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          const label = String(labels[idx] == null ? "" : labels[idx]);
          ctx.fillText(label.length > 12 ? label.slice(0, 11) + "…" : label, x, plot.top + plot.height + 8);
        }
      }
      ctx.restore();
    }

    _drawCartesian(width, height, kind) {
      const labels = Array.from(this.data.labels || []);
      const datasets = Array.from(this.data.datasets || []);
      const values = numericValues(datasets);
      if (!values.length && kind !== "scatter") return this._drawEmpty(width, height);
      let min = Math.min(0, ...values), max = Math.max(0, ...values);
      const beginAtZero = this.options?.scales?.y?.beginAtZero !== false;
      if (!beginAtZero) { min = Math.min(...values); max = Math.max(...values); }
      if (min === max) { const pad = Math.max(1, Math.abs(max) * .15); min -= pad; max += pad; }
      const spanPad = (max - min) * .08 || 1;
      if (!beginAtZero) { min -= spanPad; max += spanPad; }
      const plot = { left: 50, top: 14, width: Math.max(30, width - 64), height: Math.max(34, height - 48) };
      const yFor = value => plot.top + plot.height - ((Number(value) - min) / (max - min)) * plot.height;
      this.scales.y = { getPixelForValue: yFor };
      this._drawGrid(this.ctx, plot, min, max, labels);
      this._meta = [];
      if (kind === "bar") this._drawBars(plot, labels, datasets, yFor);
      else if (kind === "scatter") this._drawScatter(plot, datasets, yFor);
      else this._drawLines(plot, labels, datasets, yFor);
      for (const plugin of Array.from(this.config.plugins || [])) {
        try { plugin?.afterDatasetsDraw?.(this); } catch (_) {}
      }
      this._drawLegend(width, datasets);
    }

    _drawBars(plot, labels, datasets, yFor) {
      const count = Math.max(labels.length, ...datasets.map(ds => (ds.data || []).length), 1);
      const groups = Math.max(1, datasets.length);
      const band = plot.width / count;
      const groupWidth = Math.min(band * .7, 54);
      const barWidth = Math.max(3, groupWidth / groups - 2);
      datasets.forEach((ds, di) => {
        const meta = [];
        const data = ds.data || [];
        data.forEach((raw, i) => {
          const xCenter = plot.left + band * (i + .5) + (di - (groups - 1) / 2) * (barWidth + 2);
          let a = 0, b = 0;
          if (Array.isArray(raw)) { a = n(raw[0]); b = n(raw[1]); }
          else if (raw && typeof raw === "object" && finite(raw.y)) { b = n(raw.y); }
          else b = n(raw);
          const y1 = yFor(a), y2 = yFor(b);
          const top = Math.min(y1, y2), h = Math.max(1.5, Math.abs(y2 - y1));
          const fallback = colorAt(ds.borderColor, i, DEFAULT_COLORS[di % DEFAULT_COLORS.length]);
          this.ctx.fillStyle = colorAt(ds.backgroundColor, i, fallback);
          roundRect(this.ctx, xCenter - barWidth / 2, top, barWidth, h, Math.min(4, Number(ds.borderRadius) || 2));
          this.ctx.fill();
          meta.push({ x: xCenter, y: y2 });
        });
        this._meta[di] = meta;
      });
    }

    _drawLines(plot, labels, datasets, yFor) {
      const count = Math.max(labels.length, ...datasets.map(ds => (ds.data || []).length), 1);
      datasets.forEach((ds, di) => {
        const data = ds.data || [];
        const color = colorAt(ds.borderColor, 0, DEFAULT_COLORS[di % DEFAULT_COLORS.length]);
        const pts = data.map((raw, i) => {
          const value = raw && typeof raw === "object" && finite(raw.y) ? n(raw.y) : n(raw);
          const x = plot.left + (count <= 1 ? plot.width / 2 : plot.width * i / (count - 1));
          return { x, y: yFor(value), value };
        });
        if (ds.fill && pts.length > 1) {
          this.ctx.save();
          this.ctx.beginPath(); this.ctx.moveTo(pts[0].x, yFor(0));
          pts.forEach(p => this.ctx.lineTo(p.x, p.y));
          this.ctx.lineTo(pts[pts.length - 1].x, yFor(0)); this.ctx.closePath();
          this.ctx.globalAlpha = .1; this.ctx.fillStyle = color; this.ctx.fill(); this.ctx.restore();
        }
        this.ctx.save(); this.ctx.strokeStyle = color; this.ctx.lineWidth = Math.max(1.5, Number(ds.borderWidth) || 2); this.ctx.lineJoin = "round"; this.ctx.lineCap = "round";
        if (Array.isArray(ds.borderDash) && ds.borderDash.length) this.ctx.setLineDash(ds.borderDash);
        this.ctx.beginPath(); pts.forEach((p, i) => i ? this.ctx.lineTo(p.x, p.y) : this.ctx.moveTo(p.x, p.y)); this.ctx.stroke();
        const radius = Number(ds.pointRadius) || 0;
        if (radius > 0) pts.forEach(p => { this.ctx.beginPath(); this.ctx.fillStyle = color; this.ctx.arc(p.x, p.y, radius, 0, Math.PI * 2); this.ctx.fill(); });
        this.ctx.restore();
        this._meta[di] = pts;
      });
    }

    _drawScatter(plot, datasets, yFor) {
      const allX = [];
      datasets.forEach(ds => (ds.data || []).forEach(p => p && finite(p.x) && allX.push(Number(p.x))));
      let minX = allX.length ? Math.min(...allX) : 0, maxX = allX.length ? Math.max(...allX) : 1;
      if (minX === maxX) maxX = minX + 1;
      datasets.forEach((ds, di) => {
        const color = colorAt(ds.borderColor || ds.backgroundColor, 0, DEFAULT_COLORS[di % DEFAULT_COLORS.length]);
        const pts = [];
        (ds.data || []).forEach(p => {
          if (!p || !finite(p.x) || !finite(p.y)) return;
          const x = plot.left + ((Number(p.x) - minX) / (maxX - minX)) * plot.width;
          const y = yFor(Number(p.y));
          this.ctx.beginPath(); this.ctx.fillStyle = color; this.ctx.arc(x, y, 3.5, 0, Math.PI * 2); this.ctx.fill();
          pts.push({ x, y });
        });
        this._meta[di] = pts;
      });
    }

    _drawDoughnut(width, height, pie) {
      const labels = Array.from(this.data.labels || []);
      const ds = (this.data.datasets || [])[0] || {};
      const vals = (ds.data || []).map(v => Math.max(0, n(v)));
      const total = vals.reduce((a, b) => a + b, 0);
      if (!(total > 0)) return this._drawEmpty(width, height);
      const cx = width / 2, cy = Math.max(60, height / 2 - 4), outer = Math.max(28, Math.min(width, height) * .31);
      const cutRaw = this.options?.cutout;
      let inner = pie ? 0 : outer * .58;
      if (!pie && typeof cutRaw === "string" && cutRaw.endsWith("%")) inner = outer * Math.max(0, Math.min(1, parseFloat(cutRaw) / 100));
      let angle = -Math.PI / 2;
      vals.forEach((v, i) => {
        const next = angle + (v / total) * Math.PI * 2;
        this.ctx.beginPath(); this.ctx.arc(cx, cy, outer, angle, next); if (inner > 0) this.ctx.arc(cx, cy, inner, next, angle, true); else this.ctx.lineTo(cx, cy); this.ctx.closePath();
        this.ctx.fillStyle = colorAt(ds.backgroundColor, i, DEFAULT_COLORS[i % DEFAULT_COLORS.length]); this.ctx.fill();
        angle = next;
      });
      this._drawLegend(width, [{ label: "", data: vals, _labels: labels, backgroundColor: ds.backgroundColor }], labels);
    }

    _drawLegend(width, datasets, doughnutLabels) {
      if (this.options?.plugins?.legend?.display === false) return;
      const entries = [];
      if (doughnutLabels) {
        doughnutLabels.slice(0, 5).forEach((label, i) => entries.push({ label, color: colorAt(datasets[0]?.backgroundColor, i, DEFAULT_COLORS[i % DEFAULT_COLORS.length]) }));
      } else {
        datasets.slice(0, 4).forEach((ds, i) => {
          if (!ds.label) return;
          entries.push({ label: ds.label, color: colorAt(ds.borderColor || ds.backgroundColor, 0, DEFAULT_COLORS[i % DEFAULT_COLORS.length]) });
        });
      }
      if (!entries.length) return;
      const ctx = this.ctx; ctx.save(); ctx.font = '600 10px system-ui,-apple-system,"Segoe UI",sans-serif'; ctx.textBaseline = "middle";
      let x = 10, y = 10;
      entries.forEach(entry => {
        const tw = ctx.measureText(entry.label).width;
        if (x + tw + 24 > width) { x = 10; y += 16; }
        ctx.fillStyle = entry.color; ctx.fillRect(x, y - 4, 8, 8); x += 12;
        ctx.fillStyle = textColor(); ctx.fillText(entry.label, x, y); x += tw + 16;
      });
      ctx.restore();
    }

    _drawEmpty(width, height) {
      this.ctx.save(); this.ctx.fillStyle = mutedColor(); this.ctx.font = '600 12px system-ui,-apple-system,"Segoe UI",sans-serif'; this.ctx.textAlign = "center"; this.ctx.textBaseline = "middle";
      this.ctx.fillText("Sample chart data", width / 2, height / 2); this.ctx.restore();
    }
  }

  DemoChart.defaults = {};
  DemoChart.register = function () {};
  DemoChart.unregister = function () {};
  global.Chart = DemoChart;
  global.TriplemDemoLocalChartFallback = true;
})(window);
