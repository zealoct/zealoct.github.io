const SIZE = 9;
const STR_num = "NUM";
const STR_cands = "CANDS";

const BoardState = {
  mode: 'value',
  selected: { r: 0, c: 0 },
  cells: Array.from({ length: SIZE }, () =>
    Array.from({ length: SIZE }, () => ({
      fixed: null,
      value: null,
      candidates: new Set(),
      bgColor: ''
    }))
  )
};

let ContextMenuMode = 'value';
let CtrlHoldPrevMode = null;
let ShiftHoldPrevMode = null;
let HighlightPeersForMatches = false;
let HistoryStack = [];
const MAX_HISTORY = 10;
const Snapshots = Array.from({ length: 10 }, () => null);

function cloneCells(cells) {
  return cells.map(row => row.map(cell => ({
    fixed: cell.fixed,
    value: cell.value,
    candidates: new Set(cell.candidates),
    bgColor: cell.bgColor
  })));
}
function pushHistory() {
  const snapshot = {
    cells: cloneCells(BoardState.cells),
    selected: { ...BoardState.selected },
    mode: BoardState.mode
  };
  HistoryStack.push(snapshot);
  if (HistoryStack.length > MAX_HISTORY) HistoryStack.shift();
  updateUndoState();
}
function applySnapshot(snap) {
  BoardState.cells = cloneCells(snap.cells);
  BoardState.selected = { ...snap.selected };
  BoardState.mode = snap.mode;
  const toggleBtn = $('#mode-toggle');
  if (toggleBtn) toggleBtn.textContent = BoardState.mode === 'candidates' ? STR_cands : STR_num;
  // Re-render all cells and clear conflict marks
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      renderCell(r, c);
      cellEl(r, c).classList.remove('conflict');
    }
  }
  selectCell(BoardState.selected.r, BoardState.selected.c);
  updateNumberKeyStates();
  updateUndoState();
}
function undoLast() {
  const snap = HistoryStack.pop();
  if (!snap) return;
  applySnapshot(snap);
}
function updateUndoState() {
  const btn = $('#undo-btn');
  if (btn) btn.disabled = HistoryStack.length === 0;
}

function $(sel, root = document) {
  return root.querySelector(sel);
}
function $all(sel, root = document) {
  return Array.from(root.querySelectorAll(sel));
}

function setContextMenuMode(mode) {
  ContextMenuMode = mode;
  const menuToggle = $('#menu-mode-toggle');
  if (menuToggle) {
    menuToggle.textContent = mode === 'candidates' ? STR_cands : STR_num;
  }
  if (mode === 'candidates') {
    setMode('candidates');
  } else {
    setMode('value');
  }
}

function initBoard() {
  const board = $('#board');
  board.innerHTML = '';
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.setAttribute('role', 'gridcell');
      cell.dataset.row = r;
      cell.dataset.col = c;
      cell.addEventListener('click', () => selectCell(r, c));
      cell.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        selectCell(r, c);
        const coords = getEventViewportXY(e);
        showContextMenu(coords.x, coords.y);
      });
      board.appendChild(cell);
      BoardState.cells[r][c].candidates = new Set([1,2,3,4,5,6,7,8,9]);
      renderCell(r, c);
    }
  }
  selectCell(0, 0);
}

function selectCell(r, c) {
  BoardState.selected = { r, c };
  $all('.cell').forEach(el => el.classList.remove('selected', 'match', 'peer', 'conflict'));
  const el = cellEl(r, c);
  el.classList.add('selected');
  applyMatchHighlights();
  applyPeerHighlights();
  applyBgColors();
  updateStatsDisplays();
}

function cellEl(r, c) {
  return $(`.cell[data-row="${r}"][data-col="${c}"]`);
}

function setMode(mode) {
  BoardState.mode = mode;
  const toggleBtn = $('#mode-toggle');
  if (toggleBtn) {
    toggleBtn.textContent = mode === 'candidates' ? STR_cands : STR_num;
  }
}

function onKeypad(num) {
  const { r, c } = BoardState.selected;
  const cell = BoardState.cells[r][c];
  pushHistory();
  if (BoardState.mode === 'fixed') {
    cell.fixed = num;
    cell.value = null;
    cell.candidates.clear();
  } else if (BoardState.mode === 'value') {
    cell.value = num;
    cell.fixed = null;
    cell.candidates.clear();
    const el = cellEl(r, c);
    el.classList.remove('conflict');
    if (hasConflict(r, c, num)) {
      el.classList.add('conflict');
    } else {
      pruneCandidatesAround(r, c, num);
    }
  } else if (BoardState.mode === 'candidates') {
    if (cell.candidates.has(num)) {
      cell.candidates.delete(num);
    } else {
      cell.candidates.add(num);
    }
  }
  renderCell(r, c);
  applyMatchHighlights();
  applyPeerHighlights();
  updateNumberKeyStates();
  updateStatsDisplays();
}

function applyValueToSelected(num) {
  const { r, c } = BoardState.selected;
  const cell = BoardState.cells[r][c];
  pushHistory();
  cell.value = num;
  cell.fixed = null;
  cell.candidates.clear();
  const el = cellEl(r, c);
  el.classList.remove('conflict');
  if (hasConflict(r, c, num)) {
    el.classList.add('conflict');
  } else {
    pruneCandidatesAround(r, c, num);
  }
  renderCell(r, c);
  applyMatchHighlights();
  applyPeerHighlights();
  updateNumberKeyStates();
  updateStatsDisplays();
}

function toggleCandidateOnSelected(num) {
  const { r, c } = BoardState.selected;
  const cell = BoardState.cells[r][c];
  pushHistory();
  if (cell.candidates.has(num)) {
    cell.candidates.delete(num);
  } else {
    cell.candidates.add(num);
  }
  renderCell(r, c);
  applyMatchHighlights();
}

function clearSelected() {
  const { r, c } = BoardState.selected;
  const cell = BoardState.cells[r][c];
  pushHistory();
  cell.fixed = null;
  cell.value = null;
  cell.candidates.clear();
  cellEl(r, c).classList.remove('conflict');
  renderCell(r, c);
  applyMatchHighlights();
  updateNumberKeyStates();
  updateStatsDisplays();
}

function setSelectedBgColor(color) {
  const { r, c } = BoardState.selected;
  pushHistory();
  BoardState.cells[r][c].bgColor = color || '';
  applyBgColors();
  updateStatsDisplays();
}

function applyBgColors() {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const el = cellEl(r, c);
      el.style.background = BoardState.cells[r][c].bgColor || '';
    }
  }
}

function applyMatchHighlights() {
  const { r, c } = BoardState.selected;
  const selectedCell = BoardState.cells[r][c];
  const n = selectedCell.fixed ?? selectedCell.value;
  $all('.candidate').forEach(el => el.classList.remove('match-candidate'));
  if (!n) return;
  for (let i = 0; i < SIZE; i++) {
    for (let j = 0; j < SIZE; j++) {
      const cell = BoardState.cells[i][j];
      if ((cell.fixed ?? cell.value) === n) {
        cellEl(i, j).classList.add('match');
      }
      if (cell.candidates && cell.candidates.has(n)) {
        const candEl = cellEl(i, j).querySelector('.candidates');
        if (candEl) {
          const child = candEl.children[n - 1];
          if (child) child.classList.add('match-candidate');
        }
      }
    }
  }
}

function applyPeerHighlights() {
  $all('.cell').forEach(el => el.classList.remove('peer'));
  const { r, c } = BoardState.selected;
  function addPeers(i, j) {
    for (let jj = 0; jj < SIZE; jj++) {
      if (jj === j) continue;
      cellEl(i, jj).classList.add('peer');
    }
    for (let ii = 0; ii < SIZE; ii++) {
      if (ii === i) continue;
      cellEl(ii, j).classList.add('peer');
    }
    const br = Math.floor(i / 3) * 3;
    const bc = Math.floor(j / 3) * 3;
    for (let ii = br; ii < br + 3; ii++) {
      for (let jj = bc; jj < bc + 3; jj++) {
        if (ii === i && jj === j) continue;
        cellEl(ii, jj).classList.add('peer');
      }
    }
  }
  addPeers(r, c);
  const n = (BoardState.cells[r][c].fixed ?? BoardState.cells[r][c].value);
  if (HighlightPeersForMatches && n) {
    for (let i = 0; i < SIZE; i++) {
      for (let j = 0; j < SIZE; j++) {
        const val = BoardState.cells[i][j].fixed ?? BoardState.cells[i][j].value;
        if (val === n) addPeers(i, j);
      }
    }
  }
}

function hasConflict(r, c, n) {
  for (let j = 0; j < SIZE; j++) {
    if (j === c) continue;
    const other = BoardState.cells[r][j];
    if ((other.fixed ?? other.value) === n) return true;
  }
  for (let i = 0; i < SIZE; i++) {
    if (i === r) continue;
    const other = BoardState.cells[i][c];
    if ((other.fixed ?? other.value) === n) return true;
  }
  const br = Math.floor(r / 3) * 3;
  const bc = Math.floor(c / 3) * 3;
  for (let i = br; i < br + 3; i++) {
    for (let j = bc; j < bc + 3; j++) {
      if (i === r && j === c) continue;
      const other = BoardState.cells[i][j];
      if ((other.fixed ?? other.value) === n) return true;
    }
  }
  return false;
}

function pruneCandidatesAround(r, c, n) {
  for (let j = 0; j < SIZE; j++) {
    if (j === c) continue;
    const cell = BoardState.cells[r][j];
    if (cell.value || cell.fixed) continue;
    if (cell.candidates.delete(n)) renderCell(r, j);
  }
  for (let i = 0; i < SIZE; i++) {
    if (i === r) continue;
    const cell = BoardState.cells[i][c];
    if (cell.value || cell.fixed) continue;
    if (cell.candidates.delete(n)) renderCell(i, c);
  }
  const br = Math.floor(r / 3) * 3;
  const bc = Math.floor(c / 3) * 3;
  for (let i = br; i < br + 3; i++) {
    for (let j = bc; j < bc + 3; j++) {
      if (i === r && j === c) continue;
      const cell = BoardState.cells[i][j];
      if (cell.value || cell.fixed) continue;
      if (cell.candidates.delete(n)) renderCell(i, j);
    }
  }
  applyMatchHighlights();
}

function renderCell(r, c) {
  const el = cellEl(r, c);
  const cell = BoardState.cells[r][c];
  el.innerHTML = '';

  if (cell.fixed) {
    const span = document.createElement('span');
    span.className = 'fixed-text';
    span.textContent = String(cell.fixed);
    el.appendChild(span);
    return;
  }
  if (cell.value) {
    const span = document.createElement('span');
    span.className = 'value-text';
    span.textContent = String(cell.value);
    el.appendChild(span);
    return;
  }
  const cand = document.createElement('div');
  cand.className = 'candidates';
  for (let n = 1; n <= 9; n++) {
    const s = document.createElement('div');
    s.className = 'candidate';
    if (cell.candidates.has(n)) {
      s.textContent = String(n);
    } else {
      s.classList.add('empty');
      s.textContent = '';
    }
    cand.appendChild(s);
  }
  el.appendChild(cand);
}

function bindUI() {
  const toggleBtn = $('#mode-toggle');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const next = BoardState.mode === 'candidates' ? 'value' : 'candidates';
      setMode(next);
    });
  }
  setMode('value');

  $all('.key').forEach(btn => {
    btn.addEventListener('click', () => onKeypad(Number(btn.dataset.num)));
  });


  $all('.color-swatch').forEach(sw => {
    const color = sw.dataset.color;
    sw.addEventListener('click', () => {
      setSelectedBgColor(color);
    });
  });
  const peerToggle = $('#peer-match-toggle');
  if (peerToggle) {
    peerToggle.addEventListener('change', () => {
      HighlightPeersForMatches = peerToggle.checked;
      applyPeerHighlights();
    });
  }
  const undoBtn = $('#undo-btn');
  if (undoBtn) {
    undoBtn.addEventListener('click', () => undoLast());
  }
  const slotSel = $('#snapshot-slot');
  const saveBtn = $('#snapshot-save');
  const loadBtn = $('#snapshot-load');
  function currentSlot() {
    return slotSel ? parseInt(slotSel.value, 10) : 0;
  }
  function updateLoadBtn() {
    if (loadBtn) loadBtn.disabled = !Snapshots[currentSlot()];
  }
  if (slotSel) {
    slotSel.addEventListener('change', updateLoadBtn);
  }
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      const idx = currentSlot();
      Snapshots[idx] = {
        cells: cloneCells(BoardState.cells),
        selected: { ...BoardState.selected },
        mode: BoardState.mode
      };
      updateLoadBtn();
    });
  }
  if (loadBtn) {
    loadBtn.addEventListener('click', () => {
      const idx = currentSlot();
      const snap = Snapshots[idx];
      if (!snap) return;
      BoardState.cells = cloneCells(snap.cells);
      BoardState.selected = snap.selected ? { ...snap.selected } : BoardState.selected;
      const nextMode = snap.mode ?? BoardState.mode;
      setMode(nextMode);
      for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
          renderCell(r, c);
          cellEl(r, c).classList.remove('conflict');
        }
      }
      selectCell(BoardState.selected.r, BoardState.selected.c);
      applyBgColors();
      updateNumberKeyStates();
      updateStatsDisplays();
    });
  }
  updateLoadBtn();

  const menu = $('#context-menu');
  const menuModeToggle = $('#menu-mode-toggle');
  if (menuModeToggle) {
    menuModeToggle.addEventListener('click', (e) => {
      const next = ContextMenuMode === 'candidates' ? 'value' : 'candidates';
      setContextMenuMode(next);
      e.stopPropagation();
    });
  }
  $all('.menu-key').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const n = Number(btn.dataset.num);
      if (ContextMenuMode === 'candidates') {
        toggleCandidateOnSelected(n);
      } else {
        applyValueToSelected(n);
        hideContextMenu();
      }
      e.stopPropagation();
    });
  });

  $('#board').addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const targetCell = e.target.closest('.cell');
    if (targetCell) {
      const r = Number(targetCell.dataset.row);
      const c = Number(targetCell.dataset.col);
      selectCell(r, c);
      const coords = getEventViewportXY(e);
      showContextMenu(coords.x, coords.y);
    }
  });

  document.addEventListener('click', (e) => {
    const menuEl = $('#context-menu');
    if (!menuEl.classList.contains('hidden')) {
      if (!e.target.closest('#context-menu')) {
        hideContextMenu();
      }
    }
  });
  window.addEventListener('scroll', hideContextMenu, { passive: true });
  window.addEventListener('resize', hideContextMenu);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideContextMenu();
  });

  window.addEventListener('keydown', (e) => {
    const key = e.key;
    if (key === 'Tab') {
      const next = BoardState.mode === 'candidates' ? 'value' : 'candidates';
      setMode(next);
      const menu = $('#context-menu');
      if (menu && !menu.classList.contains('hidden')) setContextMenuMode(next);
      e.preventDefault();
      return;
    }
    if (key === 'Control') {
      if (CtrlHoldPrevMode === null) {
        CtrlHoldPrevMode = BoardState.mode;
        setMode('candidates');
        const menu = $('#context-menu');
        if (menu && !menu.classList.contains('hidden')) setContextMenuMode('candidates');
      }
      return;
    }
    if (key === 'Shift') {
      if (ShiftHoldPrevMode === null) {
        ShiftHoldPrevMode = BoardState.mode;
        setMode('value');
        const menu = $('#context-menu');
        if (menu && !menu.classList.contains('hidden')) setContextMenuMode('value');
      }
      return;
    }
    if (/^[1-9]$/.test(key)) {
      onKeypad(Number(key));
      e.preventDefault();
    } else if (key === 'Backspace' || key === 'Delete') {
      clearSelected();
      e.preventDefault();
    } else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) {
      const { r, c } = BoardState.selected;
      const dr = key === 'ArrowUp' ? -1 : key === 'ArrowDown' ? 1 : 0;
      const dc = key === 'ArrowLeft' ? -1 : key === 'ArrowRight' ? 1 : 0;
      const nr = Math.max(0, Math.min(8, r + dr));
      const nc = Math.max(0, Math.min(8, c + dc));
      selectCell(nr, nc);
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === 'Control') {
      if (CtrlHoldPrevMode !== null) {
        const prev = CtrlHoldPrevMode;
        CtrlHoldPrevMode = null;
        setMode(prev);
        const menu = $('#context-menu');
        if (menu && !menu.classList.contains('hidden')) setContextMenuMode(prev === 'candidates' ? 'candidates' : 'value');
      }
    }
    if (e.key === 'Shift') {
      if (ShiftHoldPrevMode !== null) {
        const prev = ShiftHoldPrevMode;
        ShiftHoldPrevMode = null;
        setMode(prev);
        const menu = $('#context-menu');
        if (menu && !menu.classList.contains('hidden')) setContextMenuMode(prev === 'candidates' ? 'candidates' : 'value');
      }
    }
  });
}

  document.addEventListener('DOMContentLoaded', () => {
    initBoard();
    bindUI();
    updateNumberKeyStates();
    updateStatsDisplays();
  });

function showContextMenu(x, y) {
  const menu = $('#context-menu');
  menu.classList.remove('hidden');
  setContextMenuMode(BoardState.mode === 'candidates' ? 'candidates' : 'value');
  const rect = menu.getBoundingClientRect();
  const pad = 8;
  let nx = x + 4;
  let ny = y + 4;
  if (nx + rect.width + pad > window.innerWidth) {
    nx = window.innerWidth - rect.width - pad;
  }
  if (ny + rect.height + pad > window.innerHeight) {
    ny = window.innerHeight - rect.height - pad;
  }
  menu.style.left = nx + 'px';
  menu.style.top = ny + 'px';
  updateNumberKeyStates();
}

function hideContextMenu() {
  const menu = $('#context-menu');
  menu.classList.add('hidden');
}

function getEventViewportXY(e) {
  const px = typeof e.pageX === 'number' ? e.pageX : e.clientX + window.scrollX;
  const py = typeof e.pageY === 'number' ? e.pageY : e.clientY + window.scrollY;
  return { x: px - window.scrollX, y: py - window.scrollY };
}

function updateStatsDisplays() {
  const colEl = $('#col-stats');
  const rowEl = $('#row-stats');
  if (!colEl || !rowEl) return;
  const { r, c } = BoardState.selected;
  const n = (BoardState.cells[r][c].fixed ?? BoardState.cells[r][c].value);
  if (!n) {
    Array.from(colEl.children).forEach(e => e.textContent = '');
    Array.from(rowEl.children).forEach(e => e.textContent = '');
    return;
  }
  const colCounts = Array.from({ length: SIZE }, () => 0);
  const rowCounts = Array.from({ length: SIZE }, () => 0);
  for (let i = 0; i < SIZE; i++) {
    for (let j = 0; j < SIZE; j++) {
      const cell = BoardState.cells[i][j];
      if (cell.value || cell.fixed) continue;
      if (cell.candidates.has(n)) {
        rowCounts[i]++;
        colCounts[j]++;
      }
    }
  }
  for (let j = 0; j < SIZE; j++) {
    colEl.children[j].textContent = String(colCounts[j] || '');
  }
  for (let i = 0; i < SIZE; i++) {
    rowEl.children[i].textContent = String(rowCounts[i] || '');
  }
}
function isDigitCompleteInAllBoxes(n) {
  for (let br = 0; br < 9; br += 3) {
    for (let bc = 0; bc < 9; bc += 3) {
      let present = false;
      for (let i = br; i < br + 3 && !present; i++) {
        for (let j = bc; j < bc + 3 && !present; j++) {
          const val = BoardState.cells[i][j].fixed ?? BoardState.cells[i][j].value;
          if (val === n) present = true;
        }
      }
      if (!present) return false;
    }
  }
  return true;
}

function updateNumberKeyStates() {
  for (let n = 1; n <= 9; n++) {
    const complete = isDigitCompleteInAllBoxes(n);
    $all(`.key[data-num="${n}"]`).forEach(btn => {
      btn.disabled = complete;
    });
    $all(`.menu-key[data-num="${n}"]`).forEach(btn => {
      btn.disabled = complete;
    });
  }
}
