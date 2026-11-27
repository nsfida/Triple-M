/*
 * Expense Vault virtual row rendering.
 *
 * Only the rows that are on screen (plus a small buffer above and below) exist in
 * the DOM. Two spacer rows keep the scrollbar the same size as if every row were
 * rendered. Scrolling adds and removes a few rows at the edges instead of
 * rebuilding the table, so a sheet with tens of thousands of rows stays as fast as
 * one with fifty.
 *
 * The model (the array returned by getRows) is always the source of truth; a row
 * element is just a view of rows[index].
 */

export function createVirtualSheet({
  table,
  getRows,
  buildRow,
  columnCount,
  emptyHtml = '',
  estimatedRowHeight = 35,
  overscan = 12,
  onRendered
}) {
  const tbody = table.tBodies[0];
  const frame = table.closest('.table-frame');
  let rowHeight = estimatedRowHeight;
  let start = 0;
  let end = 0;
  let rendered = [];
  let topSpacer = null;
  let bottomSpacer = null;
  let emptyRow = null;
  let frameRequest = 0;
  let wantBottom = false;
  let lastScrollTop = 0;
  let wasVisible = false;

  function makeSpacer(name) {
    const tr = document.createElement('tr');
    tr.className = `vs-spacer ${name}`;
    tr.setAttribute('aria-hidden', 'true');
    const td = document.createElement('td');
    td.colSpan = columnCount;
    tr.appendChild(td);
    return tr;
  }

  function isVisible() {
    return Boolean(frame && frame.clientHeight > 0);
  }

  function headerHeight() {
    return table.tHead ? table.tHead.offsetHeight : 0;
  }

  function computeWindow(total) {
    if (!total) return [0, 0];
    if (!isVisible()) {
      // Hidden tab: keep the bottom of the sheet ready (where new work happens).
      return [Math.max(0, total - 40), total];
    }
    const visibleCount = Math.ceil(frame.clientHeight / rowHeight) + 1;
    let first = Math.floor(Math.max(0, frame.scrollTop - headerHeight()) / rowHeight);
    if (first > total - 1) first = Math.max(0, total - visibleCount);
    const s = Math.max(0, first - overscan);
    const e = Math.min(total, first + visibleCount + overscan);
    return [s, Math.max(s, e)];
  }

  function setSpacerHeight(spacer, height) {
    const cell = spacer.firstChild;
    if (height <= 0) {
      spacer.style.display = 'none';
      cell.style.height = '0px';
    } else {
      spacer.style.display = '';
      cell.style.height = `${height}px`;
    }
  }

  function updateSpacers(total) {
    if (!topSpacer) return;
    setSpacerHeight(topSpacer, start * rowHeight);
    setSpacerHeight(bottomSpacer, Math.max(0, total - end) * rowHeight);
  }

  // All data rows share one height (fixed in CSS); measure it once it is on screen.
  function measure() {
    if (!rendered.length || !isVisible()) return false;
    const height = rendered[0].getBoundingClientRect().height;
    if (height > 0 && Math.abs(height - rowHeight) > 0.05) {
      rowHeight = height;
      return true;
    }
    return false;
  }

  // A row that is being typed in must commit (blur) before it leaves the DOM, so
  // its input / change events still find it.
  function releaseFocus(tr) {
    const active = document.activeElement;
    if (active && active !== document.body && tr.contains(active)) active.blur();
  }

  function rebuild() {
    const rows = getRows();
    const total = rows.length;
    rendered.forEach(releaseFocus);
    // Work out the window while the old rows are still in place: emptying the
    // table first would let the browser clamp the scroll position to the top.
    const [s, e] = computeWindow(total);
    rendered = [];
    topSpacer = null;
    bottomSpacer = null;
    emptyRow = null;
    start = 0;
    end = 0;
    if (!total) {
      if (emptyHtml) {
        emptyRow = document.createElement('tr');
        emptyRow.innerHTML = `<td class="empty-state" colspan="${columnCount}">${emptyHtml}</td>`;
        tbody.replaceChildren(emptyRow);
      } else {
        tbody.replaceChildren();
      }
      onRendered?.();
      return;
    }
    start = s;
    end = e;
    topSpacer = makeSpacer('vs-top');
    bottomSpacer = makeSpacer('vs-bottom');
    const fragment = document.createDocumentFragment();
    fragment.appendChild(topSpacer);
    for (let index = start; index < end; index += 1) {
      const tr = buildRow(rows[index], index);
      rendered.push(tr);
      fragment.appendChild(tr);
    }
    fragment.appendChild(bottomSpacer);
    updateSpacers(total);
    // One swap: the scroll height never collapses in between.
    tbody.replaceChildren(fragment);
    if (measure()) {
      updateSpacers(total);
      syncNow(true);
      return;
    }
    onRendered?.();
  }

  function syncNow(force = false) {
    frameRequest = 0;
    const rows = getRows();
    const total = rows.length;
    if (!total || !topSpacer || !topSpacer.isConnected || emptyRow) {
      if (total || !emptyRow) rebuild();
      return;
    }
    // Rows that stay rendered must still be the same model rows; otherwise the
    // list was reordered or edited in the middle and a rebuild is needed.
    const keepEnd = Math.min(end, total);
    for (let index = start; index < keepEnd; index += 1) {
      if (rendered[index - start].dataset.clientId !== rows[index].clientId) { rebuild(); return; }
    }
    // Hysteresis: while the rows already rendered still cover the screen with a few
    // rows to spare, change nothing. Rows are then added / removed in small batches
    // instead of one row every frame while an arrow key is held.
    if (!force && isVisible() && end <= total) {
      const visibleCount = Math.ceil(frame.clientHeight / rowHeight) + 1;
      const first = Math.floor(Math.max(0, frame.scrollTop - headerHeight()) / rowHeight);
      const margin = 4;
      const coversTop = start <= Math.max(0, first - margin);
      const coversBottom = end >= Math.min(total, first + visibleCount + margin);
      if (coversTop && coversBottom) { updateSpacers(total); return; }
    }
    const [s, e] = computeWindow(total);
    if (s >= end || e <= start) {
      rebuild();
      return;
    }
    let added = force;
    while (start < s) { const tr = rendered.shift(); releaseFocus(tr); tr.remove(); start += 1; }
    while (end > e) { const tr = rendered.pop(); releaseFocus(tr); tr.remove(); end -= 1; }
    if (s < start) {
      const fragment = document.createDocumentFragment();
      const fresh = [];
      for (let index = s; index < start; index += 1) {
        const tr = buildRow(rows[index], index);
        fresh.push(tr);
        fragment.appendChild(tr);
      }
      topSpacer.after(fragment);
      rendered = fresh.concat(rendered);
      start = s;
      added = true;
    }
    if (end < e) {
      const fragment = document.createDocumentFragment();
      for (let index = end; index < e; index += 1) {
        const tr = buildRow(rows[index], index);
        rendered.push(tr);
        fragment.appendChild(tr);
      }
      bottomSpacer.before(fragment);
      end = e;
      added = true;
    }
    updateSpacers(total);
    if (added) onRendered?.();
  }

  function scheduleSync() {
    if (frameRequest) return;
    frameRequest = requestAnimationFrame(() => syncNow());
  }

  function scrollToBottom() {
    if (!isVisible()) { wantBottom = true; return; }
    wantBottom = false;
    frame.scrollTop = frame.scrollHeight;
    syncNow();
    frame.scrollTop = frame.scrollHeight;
    lastScrollTop = frame.scrollTop;
  }

  // Scrolls (vertically) just enough for the row to be fully visible below the
  // sticky header, and renders it straight away.
  function scrollToRow(index) {
    if (!isVisible()) return;
    const header = headerHeight();
    const rowTop = header + index * rowHeight;
    const rowBottom = rowTop + rowHeight;
    if (rowTop < frame.scrollTop + header) frame.scrollTop = rowTop - header;
    else if (rowBottom > frame.scrollTop + frame.clientHeight) frame.scrollTop = rowBottom - frame.clientHeight;
    if (index < start || index >= end) syncNow();
  }

  frame?.addEventListener('scroll', () => {
    if (isVisible()) lastScrollTop = frame.scrollTop;
    scheduleSync();
  }, { passive: true });

  if (frame && typeof ResizeObserver === 'function') {
    new ResizeObserver(() => {
      const visible = isVisible();
      if (visible && !wasVisible) {
        // The tab was just shown: go back to where the person was (or to the
        // bottom after a fresh load), then render what is now on screen.
        if (wantBottom) {
          scrollToBottom();
        } else {
          if (Math.abs(frame.scrollTop - lastScrollTop) > 1) frame.scrollTop = lastScrollTop;
          syncNow();
        }
      } else if (visible) {
        scheduleSync();
      }
      wasVisible = visible;
    }).observe(frame);
  }

  return {
    refresh: rebuild,
    sync: () => syncNow(),
    scheduleSync,
    scrollToBottom,
    scrollToRow,
    rowElement(index) {
      return index >= start && index < end ? rendered[index - start] || null : null;
    },
    renderedRange() {
      return { start, end };
    },
    // Re-renders one row in place (used when a row's locked / editable state changes).
    updateRow(index) {
      if (index < start || index >= end) return;
      const old = rendered[index - start];
      const active = document.activeElement;
      if (old && active && active !== document.body && old.contains(active)) return;
      const tr = buildRow(getRows()[index], index);
      old.replaceWith(tr);
      rendered[index - start] = tr;
      onRendered?.();
    }
  };
}
