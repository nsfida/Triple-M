/*
 * Expense Vault spreadsheet interaction layer.
 *
 * Gives the HTML tables an Excel-like feel without changing how the data is
 * stored or rendered:
 *
 *   - Click a cell to select it; drag (or Shift+click / Shift+arrows) to select
 *     a rectangular range of cells.
 *   - Ctrl/Cmd+C copies the range as tab-separated text, which pastes straight
 *     into Excel, Google Sheets or Numbers. Ctrl/Cmd+X copies and clears.
 *     Ctrl/Cmd+V pastes a block starting at the top-left selected cell.
 *   - Double-click, Enter or F2 edits a cell; simply typing replaces its value.
 *     Enter/Tab confirm and move, Esc cancels the edit.
 *   - Clicking anywhere outside the selected cells (or pressing Esc) clears the
 *     selection. Scrolling with the table's scrollbars keeps it.
 *
 * Keyboard focus while cells are selected sits in one hidden <textarea> (the
 * "clipboard proxy"). That is the technique spreadsheet widgets use so that the
 * browser's own copy / paste commands work on a selection that is not real text.
 *
 * On touch-only devices (no fine pointer) the custom mouse selection is skipped
 * and cells behave like ordinary inputs.
 */

const FINE_POINTER = typeof window.matchMedia === 'function'
  ? window.matchMedia('(hover: hover) and (pointer: fine)')
  : { matches: true };

const CELL_SELECTOR = 'td[data-row-index][data-col-index]';
const EDIT_CONTROL_SELECTOR = 'input:not([readonly]):not([type="hidden"]), select, textarea';

const grids = new Map();
let activeGrid = null;
let clipboardProxy = null;

/* ------------------------------------------------------------------ */
/* Clipboard text helpers                                              */
/* ------------------------------------------------------------------ */

function escapeTsvField(value) {
  const text = String(value ?? '');
  return /[\t\r\n"]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function serializeTsv(matrix) {
  return matrix.map(row => row.map(escapeTsvField).join('\t')).join('\r\n');
}

/** Parses tab-separated clipboard text (Excel style, with quoted fields). */
export function parseTsv(text) {
  const source = String(text ?? '').replace(/\r\n?/g, '\n');
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (inQuotes) {
      if (character === '"') {
        if (source[index + 1] === '"') { field += '"'; index += 1; } else { inQuotes = false; }
      } else {
        field += character;
      }
    } else if (character === '"' && field === '') {
      inQuotes = true;
    } else if (character === '\t') {
      row.push(field); field = '';
    } else if (character === '\n') {
      row.push(field); rows.push(row); row = []; field = '';
    } else {
      field += character;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/* ------------------------------------------------------------------ */
/* Small DOM helpers                                                   */
/* ------------------------------------------------------------------ */

function cellFromNode(node) {
  return node instanceof Element ? node.closest(CELL_SELECTOR) : null;
}

function positionOf(cell) {
  return { row: Number(cell.dataset.rowIndex), col: Number(cell.dataset.colIndex) };
}

function samePosition(a, b) {
  return Boolean(a && b && a.row === b.row && a.col === b.col);
}

function findCell(grid, row, col) {
  const tbody = grid.table.tBodies[0];
  const tr = tbody?.rows[row];
  if (!tr || !tr.dataset.clientId) return null;
  return tr.cells[col] || null;
}

function rowCount(grid) {
  return Math.max(0, Number(grid.config.getRowCount()) || 0);
}

function columnCount(grid) {
  return grid.config.columns.length;
}

function selectionRange(grid) {
  if (!grid.anchor || !grid.head) return null;
  return {
    minRow: Math.min(grid.anchor.row, grid.head.row),
    maxRow: Math.max(grid.anchor.row, grid.head.row),
    minCol: Math.min(grid.anchor.col, grid.head.col),
    maxCol: Math.max(grid.anchor.col, grid.head.col)
  };
}

function cellText(cell) {
  const control = cell.querySelector('input, select, textarea');
  if (!control) return cell.textContent.trim();
  // Calculated totals may be shown with thousands separators; copy plain numbers
  // so Excel always treats them as numbers.
  if (control.classList.contains('total-cell')) return control.value.replace(/,/g, '');
  return control.value;
}

function selectionMatrix(grid) {
  const range = selectionRange(grid);
  if (!range) return [];
  const matrix = [];
  for (let row = range.minRow; row <= range.maxRow; row += 1) {
    const values = [];
    for (let col = range.minCol; col <= range.maxCol; col += 1) {
      const cell = findCell(grid, row, col);
      values.push(cell ? cellText(cell) : '');
    }
    matrix.push(values);
  }
  return matrix;
}

/* ------------------------------------------------------------------ */
/* Clipboard proxy                                                     */
/* ------------------------------------------------------------------ */

function getClipboardProxy() {
  if (clipboardProxy) return clipboardProxy;
  const proxy = document.createElement('textarea');
  proxy.className = 'sheet-clipboard-proxy';
  proxy.tabIndex = -1;
  proxy.setAttribute('aria-label', 'Spreadsheet selection. Arrow keys move, Ctrl+C copies, Ctrl+V pastes, Enter edits.');
  proxy.setAttribute('autocomplete', 'off');
  proxy.setAttribute('autocapitalize', 'off');
  proxy.setAttribute('spellcheck', 'false');
  document.body.appendChild(proxy);

  proxy.addEventListener('keydown', handleProxyKeyDown);
  proxy.addEventListener('copy', event => handleProxyCopy(event, false));
  proxy.addEventListener('cut', event => handleProxyCopy(event, true));
  proxy.addEventListener('paste', handleProxyPaste);
  // Typing is routed into the cell editor; never let text pile up in the proxy.
  proxy.addEventListener('input', () => {
    if (activeGrid) syncClipboardProxy(activeGrid, { focus: false });
  });

  clipboardProxy = proxy;
  return proxy;
}

function syncClipboardProxy(grid, { focus = true } = {}) {
  const proxy = getClipboardProxy();
  // The text is also kept in the proxy so the browser's native Copy command
  // works even if a browser does not fire a copy event for it.
  proxy.value = serializeTsv(selectionMatrix(grid));
  if (focus && document.activeElement !== proxy) proxy.focus({ preventScroll: true });
  if (document.activeElement === proxy) proxy.select();
}

function handleProxyCopy(event, isCut) {
  const grid = activeGrid;
  if (!grid?.anchor || !event.clipboardData) return;
  const matrix = selectionMatrix(grid);
  event.clipboardData.setData('text/plain', serializeTsv(matrix));
  event.preventDefault();
  const rows = matrix.length;
  const columns = matrix[0]?.length || 0;
  grid.config.onCopy?.({ rows, columns, cut: isCut });
  if (isCut) clearSelectedValues(grid);
}

function handleProxyPaste(event) {
  const grid = activeGrid;
  if (!grid?.anchor) return;
  event.preventDefault();
  const text = event.clipboardData?.getData('text/plain') ?? '';
  const matrix = parseTsv(text);
  if (!matrix.length) return;
  pasteMatrix(grid, matrix, selectionRange(grid));
}

/* ------------------------------------------------------------------ */
/* Selection                                                           */
/* ------------------------------------------------------------------ */

function paintSelection(grid) {
  grid.painted.forEach(cell => {
    cell.classList.remove('cell-range-selected', 'cell-range-single', 'cell-range-anchor');
  });
  grid.painted = [];
  // Also mark the column heading and the row of the active cell so it is always
  // obvious where typing will go.
  (grid.markedNodes || []).forEach(node => node.classList.remove('col-active', 'row-active'));
  grid.markedNodes = [];
  const range = selectionRange(grid);
  grid.config.onSelectionChange?.(range ? { ...range } : null);
  if (!range) return;
  const headerCells = grid.table.tHead?.rows[0]?.cells;
  for (let col = range.minCol; col <= range.maxCol; col += 1) {
    const th = headerCells?.[col];
    if (th) { th.classList.add('col-active'); grid.markedNodes.push(th); }
  }
  const activeRow = grid.table.tBodies[0]?.rows[grid.anchor.row];
  if (activeRow?.dataset.clientId) { activeRow.classList.add('row-active'); grid.markedNodes.push(activeRow); }

  const tbody = grid.table.tBodies[0];
  const single = range.minRow === range.maxRow && range.minCol === range.maxCol;
  for (let row = range.minRow; row <= range.maxRow; row += 1) {
    const tr = tbody?.rows[row];
    if (!tr || !tr.dataset.clientId) continue;
    for (let col = range.minCol; col <= range.maxCol; col += 1) {
      const cell = tr.cells[col];
      if (!cell) continue;
      cell.classList.add('cell-range-selected');
      if (single) cell.classList.add('cell-range-single');
      grid.painted.push(cell);
    }
  }
  findCell(grid, grid.anchor.row, grid.anchor.col)?.classList.add('cell-range-anchor');
}

function ensureCellVisible(grid, position) {
  const cell = findCell(grid, position.row, position.col);
  if (!cell || !grid.frame) return;
  const frame = grid.frame;
  const frameBox = frame.getBoundingClientRect();
  const cellBox = cell.getBoundingClientRect();
  const headerHeight = grid.table.tHead ? grid.table.tHead.getBoundingClientRect().height : 0;
  const top = frameBox.top + frame.clientTop + headerHeight;
  const bottom = frameBox.top + frame.clientTop + frame.clientHeight;
  const left = frameBox.left + frame.clientLeft;
  const right = left + frame.clientWidth;
  if (cellBox.top < top) frame.scrollTop -= top - cellBox.top;
  else if (cellBox.bottom > bottom) frame.scrollTop += cellBox.bottom - bottom;
  if (cellBox.left < left) frame.scrollLeft -= left - cellBox.left;
  else if (cellBox.right > right) frame.scrollLeft += cellBox.right - right;
}

function activateGrid(grid) {
  if (activeGrid && activeGrid !== grid) clearSelection(activeGrid);
  activeGrid = grid;
}

function setSelection(grid, anchor, head, { sync = true, scroll = true } = {}) {
  activateGrid(grid);
  grid.anchor = { ...anchor };
  grid.head = { ...head };
  if (sync) syncClipboardProxy(grid);
  // Painting and scrolling are done once per animation frame, so holding an arrow key
  // or dragging a selection never forces the browser to re-lay-out the table per event.
  grid.pendingScroll = grid.pendingScroll || scroll;
  if (grid.paintQueued) return;
  grid.paintQueued = true;
  requestAnimationFrame(() => {
    grid.paintQueued = false;
    const wantsScroll = grid.pendingScroll;
    grid.pendingScroll = false;
    if (!grid.anchor) return;
    paintSelection(grid);
    if (wantsScroll && grid.head) ensureCellVisible(grid, grid.head);
  });
}

function clearSelection(grid) {
  stopAutoScroll(grid);
  grid.dragging = false;
  if (grid.editing) {
    grid.editing.cell.classList.remove('cell-editing');
    grid.editing = null;
  }
  grid.anchor = null;
  grid.head = null;
  paintSelection(grid);
  if (activeGrid === grid) {
    activeGrid = null;
    if (clipboardProxy) {
      clipboardProxy.value = '';
      if (document.activeElement === clipboardProxy) clipboardProxy.blur();
    }
  }
}

// Stops a mouse drag-selection that is in progress (used when a row move starts).
export function cancelSpreadsheetDrag() {
  if (activeGrid?.dragging) endDrag(activeGrid);
}

export function clearAllSpreadsheetSelections() {
  grids.forEach(grid => {
    if (grid.anchor || grid.editing) clearSelection(grid);
  });
  activeGrid = null;
}

function moveSelection(grid, rowDelta, colDelta, { extend = false, jump = false } = {}) {
  const rows = rowCount(grid);
  const columns = columnCount(grid);
  if (!rows || !columns || !grid.anchor) return;
  const base = extend ? grid.head : grid.anchor;
  let row = base.row + rowDelta;
  let col = base.col + colDelta;
  if (jump) {
    if (rowDelta) row = rowDelta < 0 ? 0 : rows - 1;
    if (colDelta) col = colDelta < 0 ? 0 : columns - 1;
  }
  const target = {
    row: Math.min(rows - 1, Math.max(0, row)),
    col: Math.min(columns - 1, Math.max(0, col))
  };
  if (extend) setSelection(grid, grid.anchor, target);
  else setSelection(grid, target, target);
}

function selectEverything(grid) {
  const rows = rowCount(grid);
  const columns = columnCount(grid);
  if (!rows || !columns) return;
  setSelection(grid, { row: 0, col: 0 }, { row: rows - 1, col: columns - 1 }, { scroll: false });
}

/* ------------------------------------------------------------------ */
/* Editing                                                             */
/* ------------------------------------------------------------------ */

function beginEdit(grid, row, col, { replace = false, picker = false } = {}) {
  const cell = findCell(grid, row, col);
  if (!cell) return false;
  const control = cell.querySelector(EDIT_CONTROL_SELECTOR);
  if (!control) return false;
  if (control.disabled) {
    grid.config.onLockedEdit?.(row);
    return false;
  }

  if (grid.editing) finishEdit(grid);
  activateGrid(grid);
  if (!samePosition(grid.anchor, { row, col }) || !samePosition(grid.head, { row, col })) {
    grid.anchor = { row, col };
    grid.head = { row, col };
    paintSelection(grid);
  }
  grid.editing = { row, col, cell, control, original: control.value };
  cell.classList.add('cell-editing');
  control.focus();

  if (control.tagName === 'INPUT' && (control.type === 'text' || control.type === 'number')) {
    if (replace) {
      control.select();
    } else {
      try {
        const end = control.value.length;
        control.setSelectionRange(end, end);
      } catch (_) { /* number inputs do not expose a caret position */ }
    }
  }
  if (picker) {
    try { control.showPicker?.(); } catch (_) { /* Not supported or no user gesture. */ }
  }
  return true;
}

function finishEdit(grid) {
  const editing = grid.editing;
  if (!editing) return;
  grid.editing = null;
  editing.cell.classList.remove('cell-editing');
  if (document.activeElement === editing.control) editing.control.blur();
}

function commitEditAndMove(grid, rowDelta, colDelta) {
  const editing = grid.editing;
  if (!editing) return;
  const { row, col } = editing;
  finishEdit(grid);
  const rows = rowCount(grid);
  const columns = columnCount(grid);
  const target = {
    row: Math.min(rows - 1, Math.max(0, row + rowDelta)),
    col: Math.min(columns - 1, Math.max(0, col + colDelta))
  };
  setSelection(grid, target, target);
}

function cancelEdit(grid) {
  const editing = grid.editing;
  if (!editing) return;
  const { control, original, row, col } = editing;
  if (control.value !== original) {
    control.value = original;
    control.dispatchEvent(new Event('input', { bubbles: true }));
    control.dispatchEvent(new Event('change', { bubbles: true }));
  }
  finishEdit(grid);
  setSelection(grid, { row, col }, { row, col });
}

function clearSelectedValues(grid) {
  const range = selectionRange(grid);
  if (!range) return;
  for (let row = range.minRow; row <= range.maxRow; row += 1) {
    for (let col = range.minCol; col <= range.maxCol; col += 1) {
      const control = findCell(grid, row, col)?.querySelector(EDIT_CONTROL_SELECTOR);
      // Only free-entry cells are cleared. Dates and the Cash/Bank selector
      // always need a value, and calculated totals are read-only.
      if (control?.disabled) { grid.config.onLockedEdit?.(row); continue; }
      if (!control || control.tagName !== 'INPUT') continue;
      if (control.type !== 'text' && control.type !== 'number') continue;
      if (control.value === '') continue;
      control.value = '';
      control.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
  syncClipboardProxy(grid);
}

/* ------------------------------------------------------------------ */
/* Paste                                                               */
/* ------------------------------------------------------------------ */

function pasteMatrix(grid, matrix, range) {
  if (!range) return;
  const single = matrix.length === 1 && matrix[0].length === 1;
  const multipleSelected = range.maxRow > range.minRow || range.maxCol > range.minCol;
  const payload = {
    matrix,
    startRow: range.minRow,
    startCol: range.minCol,
    // Excel behaviour: a single copied value fills the whole selected range.
    fillRange: single && multipleSelected ? range : null
  };
  const result = grid.config.onPaste(payload);
  if (!result) return;
  // The table was re-rendered, which drops the old highlight; re-select the
  // block that was pasted so the person can see what changed.
  setSelection(
    grid,
    { row: payload.startRow, col: payload.startCol },
    { row: result.endRow, col: result.endCol },
    { scroll: false }
  );
}

/* ------------------------------------------------------------------ */
/* Mouse                                                               */
/* ------------------------------------------------------------------ */

function dragPointerCell(grid) {
  if (!grid.lastMouse || !grid.frame) return null;
  const frame = grid.frame;
  const box = frame.getBoundingClientRect();
  const headerHeight = grid.table.tHead ? grid.table.tHead.getBoundingClientRect().height : 0;
  const left = box.left + frame.clientLeft + 2;
  const right = box.left + frame.clientLeft + frame.clientWidth - 3;
  const top = box.top + frame.clientTop + headerHeight + 2;
  const bottom = box.top + frame.clientTop + frame.clientHeight - 3;
  if (right <= left || bottom <= top) return null;
  const x = Math.min(right, Math.max(left, grid.lastMouse.x));
  const y = Math.min(bottom, Math.max(top, grid.lastMouse.y));
  const cell = cellFromNode(document.elementFromPoint(x, y));
  return cell && grid.table.contains(cell) ? positionOf(cell) : null;
}

function updateDragHead(grid) {
  const position = dragPointerCell(grid);
  if (!position || samePosition(position, grid.head)) return;
  grid.head = position;
  paintSelection(grid);
}

function autoScrollStep(grid) {
  if (!grid.dragging || !grid.lastMouse || !grid.frame) return;
  const frame = grid.frame;
  const box = frame.getBoundingClientRect();
  const headerHeight = grid.table.tHead ? grid.table.tHead.getBoundingClientRect().height : 0;
  const margin = 30;
  const speed = distance => Math.min(40, Math.max(6, Math.round(distance / 2)));
  const { x, y } = grid.lastMouse;
  const topEdge = box.top + headerHeight + margin;
  const bottomEdge = box.bottom - margin;
  if (y < topEdge) frame.scrollTop -= speed(topEdge - y);
  else if (y > bottomEdge) frame.scrollTop += speed(y - bottomEdge);
  if (x < box.left + margin) frame.scrollLeft -= speed(box.left + margin - x);
  else if (x > box.right - margin) frame.scrollLeft += speed(x - (box.right - margin));
  updateDragHead(grid);
}

function startAutoScroll(grid) {
  stopAutoScroll(grid);
  grid.scrollTimer = window.setInterval(() => autoScrollStep(grid), 40);
}

function stopAutoScroll(grid) {
  if (grid.scrollTimer) {
    window.clearInterval(grid.scrollTimer);
    grid.scrollTimer = null;
  }
}

function endDrag(grid) {
  if (!grid.dragging) return;
  grid.dragging = false;
  stopAutoScroll(grid);
  if (activeGrid === grid && grid.anchor) syncClipboardProxy(grid);
}

function handleGridMouseDown(grid, event) {
  if (event.button !== 0 || !FINE_POINTER.matches) return;
  const cell = cellFromNode(event.target);
  if (!cell || !grid.table.contains(cell)) return;

  // Mouse presses inside the cell that is being edited belong to the input
  // (caret placement, text selection).
  if (grid.editing && grid.editing.cell === cell) return;

  // Keep the browser from starting a native text selection or moving focus
  // into the cell's input; the selection model below owns the interaction.
  event.preventDefault();
  if (grid.editing) finishEdit(grid);

  const position = positionOf(cell);
  if (event.shiftKey && grid.anchor && activeGrid === grid) {
    setSelection(grid, grid.anchor, position, { sync: false, scroll: false });
  } else {
    setSelection(grid, position, position, { sync: false, scroll: false });
  }
  grid.dragging = true;
  grid.lastMouse = { x: event.clientX, y: event.clientY };
  startAutoScroll(grid);
  getClipboardProxy().focus({ preventScroll: true });
}

function handleGridDoubleClick(grid, event) {
  if (!FINE_POINTER.matches) return;
  const cell = cellFromNode(event.target);
  if (!cell || !grid.table.contains(cell)) return;
  if (grid.editing && grid.editing.cell === cell) return;
  const { row, col } = positionOf(cell);
  beginEdit(grid, row, col, { picker: true });
}

document.addEventListener('mousedown', event => {
  const grid = activeGrid;
  if (!grid || event.target === clipboardProxy) return;
  const cell = cellFromNode(event.target);
  // Presses inside a spreadsheet cell are handled by that grid.
  if (cell && cell.closest('table') && [...grids.values()].some(item => item.table.contains(cell))) return;
  // Dragging a scrollbar must not drop the selection.
  const frame = grid.frame;
  if (event.target === frame && (event.offsetX >= frame.clientWidth || event.offsetY >= frame.clientHeight)) return;
  clearAllSpreadsheetSelections();
}, true);

document.addEventListener('mousemove', event => {
  const grid = activeGrid;
  if (!grid?.dragging) return;
  if ((event.buttons & 1) === 0) { endDrag(grid); return; }
  grid.lastMouse = { x: event.clientX, y: event.clientY };
  updateDragHead(grid);
});

document.addEventListener('mouseup', () => {
  if (activeGrid?.dragging) endDrag(activeGrid);
});

window.addEventListener('blur', () => {
  if (activeGrid?.dragging) endDrag(activeGrid);
});

/* ------------------------------------------------------------------ */
/* Keyboard (focus is in the clipboard proxy)                          */
/* ------------------------------------------------------------------ */

function handleProxyKeyDown(event) {
  const grid = activeGrid;
  if (!grid?.anchor || event.isComposing) return;
  const modifier = event.ctrlKey || event.metaKey;
  const key = event.key;

  if (modifier) {
    if (key.toLowerCase() === 'a') {
      event.preventDefault();
      selectEverything(grid);
    } else if (key.startsWith('Arrow')) {
      event.preventDefault();
      const rowDelta = key === 'ArrowUp' ? -1 : key === 'ArrowDown' ? 1 : 0;
      const colDelta = key === 'ArrowLeft' ? -1 : key === 'ArrowRight' ? 1 : 0;
      moveSelection(grid, rowDelta, colDelta, { extend: event.shiftKey, jump: true });
    }
    // Ctrl/Cmd+C, X and V are handled through the copy / cut / paste events.
    return;
  }

  switch (key) {
    case 'ArrowUp': event.preventDefault(); moveSelection(grid, -1, 0, { extend: event.shiftKey }); return;
    case 'ArrowDown': event.preventDefault(); moveSelection(grid, 1, 0, { extend: event.shiftKey }); return;
    case 'ArrowLeft': event.preventDefault(); moveSelection(grid, 0, -1, { extend: event.shiftKey }); return;
    case 'ArrowRight': event.preventDefault(); moveSelection(grid, 0, 1, { extend: event.shiftKey }); return;
    case 'Tab': event.preventDefault(); moveSelection(grid, 0, event.shiftKey ? -1 : 1); return;
    case 'Home': event.preventDefault(); moveSelection(grid, 0, -1, { extend: event.shiftKey, jump: true }); return;
    case 'End': event.preventDefault(); moveSelection(grid, 0, 1, { extend: event.shiftKey, jump: true }); return;
    case 'PageUp': event.preventDefault(); moveSelection(grid, -10, 0, { extend: event.shiftKey }); return;
    case 'PageDown': event.preventDefault(); moveSelection(grid, 10, 0, { extend: event.shiftKey }); return;
    case 'Escape': event.preventDefault(); clearSelection(grid); return;
    case 'Delete':
    case 'Backspace':
      event.preventDefault();
      clearSelectedValues(grid);
      return;
    case 'Enter':
    case 'F2':
      event.preventDefault();
      beginEdit(grid, grid.anchor.row, grid.anchor.col, { picker: true });
      return;
    default:
      break;
  }

  // Typing a character starts editing the active cell and replaces its value.
  if (key.length === 1 && !event.altKey) {
    const started = beginEdit(grid, grid.anchor.row, grid.anchor.col, { replace: true });
    // The keystroke continues into the newly focused control. If the cell can
    // not be edited (calculated total, view-only access) swallow it.
    if (!started) event.preventDefault();
  }
}

function handleEditorKeyDown(grid, event) {
  const editing = grid.editing;
  if (!editing || event.target !== editing.control || event.isComposing) return;
  const control = editing.control;
  const keepsArrows = control.tagName === 'SELECT' || control.type === 'date';

  switch (event.key) {
    case 'Enter':
      event.preventDefault();
      commitEditAndMove(grid, event.shiftKey ? -1 : 1, 0);
      break;
    case 'Tab':
      event.preventDefault();
      commitEditAndMove(grid, 0, event.shiftKey ? -1 : 1);
      break;
    case 'Escape':
      event.preventDefault();
      cancelEdit(grid);
      break;
    case 'ArrowUp':
    case 'ArrowDown':
      if (!keepsArrows) {
        event.preventDefault();
        commitEditAndMove(grid, event.key === 'ArrowUp' ? -1 : 1, 0);
      }
      break;
    default:
      break;
  }
}

/* ------------------------------------------------------------------ */
/* Public factory                                                      */
/* ------------------------------------------------------------------ */

/**
 * @param {HTMLTableElement} table
 * @param {{
 *   columns: Array<object>,
 *   getRowCount: () => number,
 *   onPaste: (payload: {matrix: string[][], startRow: number, startCol: number, fillRange: object|null}) => ({endRow:number,endCol:number}|null),
 *   onCopy?: (info: {rows:number, columns:number, cut:boolean}) => void
 * }} config
 */
export function createSpreadsheetGrid(table, config) {
  const grid = {
    table,
    config,
    frame: table.closest('.table-frame'),
    anchor: null,
    head: null,
    painted: [],
    editing: null,
    dragging: false,
    lastMouse: null,
    scrollTimer: null
  };
  grids.set(table, grid);
  getClipboardProxy();

  table.addEventListener('mousedown', event => handleGridMouseDown(grid, event));
  table.addEventListener('dblclick', event => handleGridDoubleClick(grid, event));
  table.addEventListener('keydown', event => handleEditorKeyDown(grid, event));

  // Keyboard users (or code) that move focus straight into a cell input.
  table.addEventListener('focusin', event => {
    const control = event.target;
    if (!(control instanceof HTMLElement) || !control.matches(EDIT_CONTROL_SELECTOR)) return;
    const cell = cellFromNode(control);
    if (!cell || !table.contains(cell)) return;
    if (grid.editing?.control === control) return;
    if (grid.editing) {
      grid.editing.cell.classList.remove('cell-editing');
      grid.editing = null;
    }
    const position = positionOf(cell);
    activateGrid(grid);
    grid.anchor = { ...position };
    grid.head = { ...position };
    grid.editing = { ...position, cell, control, original: control.value };
    cell.classList.add('cell-editing');
    paintSelection(grid);
  });

  table.addEventListener('focusout', event => {
    const editing = grid.editing;
    if (editing && event.target === editing.control) {
      grid.editing = null;
      editing.cell.classList.remove('cell-editing');
    }
  });

  // Choosing a Cash/Bank option finishes the edit straight away.
  table.addEventListener('change', event => {
    const editing = grid.editing;
    if (!editing || event.target !== editing.control || editing.control.tagName !== 'SELECT') return;
    const { row, col } = editing;
    finishEdit(grid);
    setSelection(grid, { row, col }, { row, col });
  });

  // A multi-cell block pasted while a single cell is being edited.
  table.addEventListener('paste', event => {
    const editing = grid.editing;
    if (!editing || event.target !== editing.control) return;
    const matrix = parseTsv(event.clipboardData?.getData('text/plain') ?? '');
    if (matrix.length <= 1 && (matrix[0]?.length ?? 0) <= 1) return; // plain single value: native paste
    event.preventDefault();
    const { row, col } = editing;
    finishEdit(grid);
    pasteMatrix(grid, matrix, { minRow: row, maxRow: row, minCol: col, maxCol: col });
  });

  return {
    clearSelection: () => clearSelection(grid),
    startEditing: (row, col, options) => beginEdit(grid, row, col, options)
  };
}
