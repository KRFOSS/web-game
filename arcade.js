const dialog = document.querySelector('#gameDialog');
const dialogTitle = document.querySelector('#dialogTitle');
const dialogDescription = document.querySelector('#dialogDescription');
const gameSurface = document.querySelector('#gameSurface');
const gameStatus = document.querySelector('#gameStatus');
const gameActions = document.querySelector('#gameActions');
const closeButton = document.querySelector('#closeGame');

let cleanupActiveGame = null;

const meta = {
  laser: {
    title: '빛을 접는 방',
    description: '거울 두 장만 놓아 광선을 목표 지점까지 보내세요. 거울의 위치와 방향을 동시에 설계해야 합니다.'
  },
  gravity: {
    title: '중력 우체국',
    description: '상자를 직접 움직일 수 없습니다. 중력 방향을 바꾸면 벽에 닿을 때까지 미끄러집니다.'
  },
  twins: {
    title: '거울 쌍둥이',
    description: '하나의 입력으로 두 말을 동시에 움직입니다. 두 번째 말은 좌우가 반대로 움직입니다.'
  },
  constellation: {
    title: '한 붓 성좌',
    description: '모든 별 사이의 선을 정확히 한 번씩 지나가세요. 같은 선은 다시 사용할 수 없습니다.'
  },
  symmetry: {
    title: '대칭 복원실',
    description: '단 네 번의 수정으로 깨진 무늬를 가로와 세로 모두 완전한 대칭으로 복원하세요.'
  },
  shadow: {
    title: '그림자 조립소',
    description: '서로 다른 세 조각을 회전하고 배치해 표시된 그림자를 빈틈없이 채우세요.'
  },
  machine: {
    title: '규칙 제작기',
    description: '입력과 출력의 사례만 보고 두 단계 연산 규칙을 역으로 발명하세요.'
  }
};

function setStatus(text) {
  gameStatus.textContent = text;
}

function clearActions() {
  gameActions.replaceChildren();
}

function addAction(label, handler) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('click', handler);
  gameActions.appendChild(button);
  return button;
}

function closeGame() {
  if (cleanupActiveGame) cleanupActiveGame();
  cleanupActiveGame = null;
  dialog.close();
  gameSurface.replaceChildren();
  clearActions();
}

function openGame(id) {
  const info = meta[id];
  if (!info) return;

  if (cleanupActiveGame) cleanupActiveGame();
  cleanupActiveGame = null;
  dialogTitle.textContent = info.title;
  dialogDescription.textContent = info.description;
  gameSurface.replaceChildren();
  clearActions();
  setStatus('게임을 준비하고 있습니다.');

  const cleanup = games[id]();
  if (typeof cleanup === 'function') cleanupActiveGame = cleanup;
  dialog.showModal();
}

for (const card of document.querySelectorAll('[data-game]')) {
  card.addEventListener('click', () => openGame(card.dataset.game));
}

closeButton.addEventListener('click', closeGame);
dialog.addEventListener('cancel', (event) => {
  event.preventDefault();
  closeGame();
});
dialog.addEventListener('click', (event) => {
  if (event.target === dialog) closeGame();
});

/* -------------------------------------------------------------------------- */
/* 1. 빛을 접는 방                                                            */
/* -------------------------------------------------------------------------- */
function laserGame() {
  const rows = 7;
  const cols = 8;
  const source = { r: 3, c: 0 };
  const goal = { r: 1, c: 6 };
  const rocks = new Set(['3,5', '0,6', '5,2', '5,6', '6,4']);
  const mirrors = new Map();
  let solved = false;

  const layout = document.createElement('div');
  layout.className = 'laser-layout';
  const grid = document.createElement('div');
  grid.className = 'laser-grid';
  const note = document.createElement('aside');
  note.className = 'game-side-note';
  note.innerHTML = '<strong>규칙</strong>빈 칸을 누르면 / 거울, 다시 누르면 \\ 거울, 한 번 더 누르면 제거됩니다. 동시에 놓을 수 있는 거울은 두 장뿐입니다.';
  layout.append(grid, note);
  gameSurface.appendChild(layout);

  function key(r, c) {
    return `${r},${c}`;
  }

  function traceBeam() {
    let r = source.r;
    let c = source.c;
    let dr = 0;
    let dc = 1;
    const beam = new Set();
    let hitGoal = false;

    for (let step = 0; step < 90; step += 1) {
      r += dr;
      c += dc;
      if (r < 0 || r >= rows || c < 0 || c >= cols) break;

      const k = key(r, c);
      beam.add(k);
      if (rocks.has(k)) break;
      if (r === goal.r && c === goal.c) {
        hitGoal = true;
        break;
      }

      const mirror = mirrors.get(k);
      if (mirror === '/') {
        const nextDr = -dc;
        const nextDc = -dr;
        dr = nextDr;
        dc = nextDc;
      } else if (mirror === '\\') {
        const nextDr = dc;
        const nextDc = dr;
        dr = nextDr;
        dc = nextDc;
      }
    }

    return { beam, hitGoal };
  }

  function cycleMirror(r, c) {
    if (solved) return;
    const k = key(r, c);
    if (rocks.has(k) || (r === source.r && c === source.c) || (r === goal.r && c === goal.c)) return;

    const current = mirrors.get(k);
    if (!current) {
      if (mirrors.size >= 2) {
        setStatus('거울은 두 장만 사용할 수 있습니다. 기존 거울 하나를 제거하거나 돌려 보세요.');
        return;
      }
      mirrors.set(k, '/');
    } else if (current === '/') {
      mirrors.set(k, '\\');
    } else {
      mirrors.delete(k);
    }
    render();
  }

  function render() {
    const { beam, hitGoal } = traceBeam();
    grid.replaceChildren();

    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const k = key(r, c);
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'laser-cell';
        cell.setAttribute('aria-label', `${r + 1}행 ${c + 1}열`);

        if (rocks.has(k)) cell.classList.add('rock');
        if (r === source.r && c === source.c) cell.classList.add('source');
        if (r === goal.r && c === goal.c) cell.classList.add('goal');
        if (beam.has(k)) cell.classList.add('beam');
        if (beam.has(k) && r === goal.r && c === goal.c) cell.classList.add('beam-hit');

        const mirror = mirrors.get(k);
        if (mirror) {
          cell.classList.add('mirror', mirror === '/' ? 'slash' : 'backslash');
        }

        cell.addEventListener('click', () => cycleMirror(r, c));
        grid.appendChild(cell);
      }
    }

    if (hitGoal && !solved) {
      solved = true;
      setStatus('성공했습니다. 두 번의 반사만으로 광선이 목표에 도달했습니다.');
    } else if (!solved) {
      setStatus(`거울 ${mirrors.size} / 2. 광선의 진행 방향을 꺾어 G까지 보내세요.`);
    }
  }

  addAction('처음부터', () => {
    mirrors.clear();
    solved = false;
    render();
  });

  render();
  return null;
}

/* -------------------------------------------------------------------------- */
/* 2. 중력 우체국                                                             */
/* -------------------------------------------------------------------------- */
function gravityGame() {
  const size = 8;
  const start = { r: 6, c: 1 };
  const goal = { r: 1, c: 6 };
  const walls = new Set(['3,1', '4,5', '0,4', '1,7', '6,5', '2,2', '6,6']);
  let orb = { ...start };
  let moves = 0;
  let solved = false;

  const wrap = document.createElement('div');
  wrap.className = 'board-wrap';
  const board = document.createElement('div');
  board.className = 'pixel-board';
  board.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
  const controls = document.createElement('div');
  controls.className = 'gravity-controls';

  const directions = {
    up: [-1, 0, '위'],
    down: [1, 0, '아래'],
    left: [0, -1, '왼쪽'],
    right: [0, 1, '오른쪽']
  };

  for (const [name, [, , label]] of Object.entries(directions)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.dir = name;
    button.textContent = label;
    button.addEventListener('click', () => tilt(name));
    controls.appendChild(button);
  }

  wrap.append(board, controls);
  gameSurface.appendChild(wrap);

  function wallAt(r, c) {
    return walls.has(`${r},${c}`);
  }

  function tilt(name) {
    if (solved) return;
    const [dr, dc] = directions[name];
    let nr = orb.r;
    let nc = orb.c;

    while (true) {
      const tr = nr + dr;
      const tc = nc + dc;
      if (tr < 0 || tr >= size || tc < 0 || tc >= size || wallAt(tr, tc)) break;
      nr = tr;
      nc = tc;
    }

    if (nr === orb.r && nc === orb.c) {
      setStatus('그 방향으로는 움직일 수 없습니다. 다른 중력 방향을 선택하세요.');
      return;
    }

    orb = { r: nr, c: nc };
    moves += 1;
    if (orb.r === goal.r && orb.c === goal.c) solved = true;
    render();
  }

  function render() {
    board.replaceChildren();
    for (let r = 0; r < size; r += 1) {
      for (let c = 0; c < size; c += 1) {
        const cell = document.createElement('div');
        cell.className = 'pixel-cell';
        if (wallAt(r, c)) cell.classList.add('wall');
        if (r === goal.r && c === goal.c) cell.classList.add('goal');
        if (r === orb.r && c === orb.c) cell.classList.add('orb');
        board.appendChild(cell);
      }
    }

    if (solved) {
      setStatus(`배달 완료. ${moves}번의 중력 전환으로 목적지에 도착했습니다.`);
    } else {
      setStatus(`중력 전환 ${moves}회. 상자는 벽을 만날 때까지 멈추지 않습니다.`);
    }
  }

  function reset() {
    orb = { ...start };
    moves = 0;
    solved = false;
    render();
  }

  const keyHandler = (event) => {
    const mapping = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
    if (mapping[event.key]) {
      event.preventDefault();
      tilt(mapping[event.key]);
    }
  };
  window.addEventListener('keydown', keyHandler);
  addAction('처음부터', reset);
  render();

  return () => window.removeEventListener('keydown', keyHandler);
}

/* -------------------------------------------------------------------------- */
/* 3. 거울 쌍둥이                                                            */
/* -------------------------------------------------------------------------- */
function twinsGame() {
  const size = 7;
  const startA = { r: 5, c: 1 };
  const startB = { r: 5, c: 5 };
  const goalA = { r: 1, c: 5 };
  const goalB = { r: 1, c: 1 };
  const walls = new Set(['2,3', '3,3', '4,3', '0,0', '0,6', '6,0', '6,6']);
  let a = { ...startA };
  let b = { ...startB };
  let moves = 0;
  let solved = false;

  const wrap = document.createElement('div');
  wrap.className = 'board-wrap';
  const board = document.createElement('div');
  board.className = 'pixel-board';
  board.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
  const controls = document.createElement('div');
  controls.className = 'gravity-controls';
  wrap.append(board, controls);
  gameSurface.appendChild(wrap);

  const directions = {
    up: [-1, 0, '위'],
    down: [1, 0, '아래'],
    left: [0, -1, '왼쪽'],
    right: [0, 1, '오른쪽']
  };

  for (const [name, [, , label]] of Object.entries(directions)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.dir = name;
    button.textContent = label;
    button.addEventListener('click', () => move(name));
    controls.appendChild(button);
  }

  function blocked(r, c) {
    return r < 0 || r >= size || c < 0 || c >= size || walls.has(`${r},${c}`);
  }

  function attempt(piece, dr, dc) {
    const nr = piece.r + dr;
    const nc = piece.c + dc;
    return blocked(nr, nc) ? piece : { r: nr, c: nc };
  }

  function move(name) {
    if (solved) return;
    const [dr, dc] = directions[name];
    a = attempt(a, dr, dc);
    b = attempt(b, dr, -dc);
    moves += 1;
    solved = a.r === goalA.r && a.c === goalA.c && b.r === goalB.r && b.c === goalB.c;
    render();
  }

  function render() {
    board.replaceChildren();
    for (let r = 0; r < size; r += 1) {
      for (let c = 0; c < size; c += 1) {
        const cell = document.createElement('div');
        cell.className = 'pixel-cell';
        if (walls.has(`${r},${c}`)) cell.classList.add('wall');
        if (r === goalA.r && c === goalA.c) cell.classList.add('goal-a');
        if (r === goalB.r && c === goalB.c) cell.classList.add('goal-b');
        if (r === a.r && c === a.c) cell.classList.add('twin-a');
        if (r === b.r && c === b.c) cell.classList.add('twin-b');
        board.appendChild(cell);
      }
    }
    setStatus(solved
      ? `두 말이 동시에 도착했습니다. 사용한 입력은 ${moves}회입니다.`
      : `입력 ${moves}회. 붉은 말은 입력 그대로, 푸른 말은 좌우만 반대로 움직입니다.`);
  }

  function reset() {
    a = { ...startA };
    b = { ...startB };
    moves = 0;
    solved = false;
    render();
  }

  const keyHandler = (event) => {
    const mapping = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
    if (mapping[event.key]) {
      event.preventDefault();
      move(mapping[event.key]);
    }
  };
  window.addEventListener('keydown', keyHandler);
  addAction('처음부터', reset);
  render();
  return () => window.removeEventListener('keydown', keyHandler);
}

/* -------------------------------------------------------------------------- */
/* 4. 한 붓 성좌                                                              */
/* -------------------------------------------------------------------------- */
function constellationGame() {
  const points = [
    { x: 20, y: 80 },
    { x: 80, y: 80 },
    { x: 80, y: 40 },
    { x: 20, y: 40 },
    { x: 50, y: 11 }
  ];
  const edges = [[0,1], [1,2], [2,3], [3,0], [3,4], [4,2], [0,2]];
  let path = [];
  const used = new Set();
  let solved = false;

  const board = document.createElement('div');
  board.className = 'constellation-board';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('constellation-lines');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('preserveAspectRatio', 'none');
  board.appendChild(svg);
  gameSurface.appendChild(board);

  function edgeKey(a, b) {
    return a < b ? `${a}-${b}` : `${b}-${a}`;
  }

  function edgeExists(a, b) {
    return edges.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  }

  function choose(index) {
    if (solved) return;
    if (path.length === 0) {
      path.push(index);
      render();
      return;
    }

    const current = path[path.length - 1];
    const k = edgeKey(current, index);
    if (!edgeExists(current, index)) {
      setStatus('그 두 별 사이에는 선이 없습니다. 현재 별에서 이어진 선을 선택하세요.');
      return;
    }
    if (used.has(k)) {
      setStatus('이미 지나간 선입니다. 다른 길을 찾아야 합니다.');
      return;
    }

    used.add(k);
    path.push(index);
    if (used.size === edges.length) solved = true;
    render();
  }

  function render() {
    svg.replaceChildren();
    for (const [a, b] of edges) {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', points[a].x);
      line.setAttribute('y1', points[a].y);
      line.setAttribute('x2', points[b].x);
      line.setAttribute('y2', points[b].y);
      if (used.has(edgeKey(a, b))) line.classList.add('used');
      svg.appendChild(line);
    }

    for (const old of board.querySelectorAll('.star-node')) old.remove();
    const current = path[path.length - 1];
    points.forEach((point, index) => {
      const node = document.createElement('button');
      node.type = 'button';
      node.className = 'star-node';
      if (index === current) node.classList.add('current');
      node.style.left = `${point.x}%`;
      node.style.top = `${point.y}%`;
      node.setAttribute('aria-label', `${index + 1}번 별`);
      node.addEventListener('click', () => choose(index));
      board.appendChild(node);
    });

    if (solved) {
      setStatus('모든 선을 한 번씩만 지나 성좌를 완성했습니다.');
    } else if (path.length === 0) {
      setStatus('시작할 별도 퍼즐의 일부입니다. 아무 별이나 골라 시작하세요.');
    } else {
      setStatus(`사용한 선 ${used.size} / ${edges.length}. 같은 선은 다시 지나갈 수 없습니다.`);
    }
  }

  function reset() {
    path = [];
    used.clear();
    solved = false;
    render();
  }

  addAction('한 단계 되돌리기', () => {
    if (path.length <= 1 || solved) return;
    const b = path.pop();
    const a = path[path.length - 1];
    used.delete(edgeKey(a, b));
    render();
  });
  addAction('처음부터', reset);
  render();
  return null;
}

/* -------------------------------------------------------------------------- */
/* 5. 대칭 복원실                                                             */
/* -------------------------------------------------------------------------- */
function symmetryGame() {
  const size = 7;
  const target = new Set([
    '1,1','1,3','1,5',
    '2,2','2,4',
    '3,1','3,3','3,5',
    '4,2','4,4',
    '5,1','5,3','5,5'
  ]);
  const cells = new Set(target);
  ['1,1','4,2','3,5','5,3'].forEach((k) => {
    if (cells.has(k)) cells.delete(k); else cells.add(k);
  });
  let edits = 0;
  let solved = false;

  const board = document.createElement('div');
  board.className = 'symmetry-board';
  gameSurface.appendChild(board);

  function isOn(r, c) {
    return cells.has(`${r},${c}`);
  }

  function isSymmetric() {
    for (let r = 0; r < size; r += 1) {
      for (let c = 0; c < size; c += 1) {
        const value = isOn(r, c);
        if (value !== isOn(r, size - 1 - c)) return false;
        if (value !== isOn(size - 1 - r, c)) return false;
      }
    }
    return true;
  }

  function toggle(r, c) {
    if (solved || edits >= 4) return;
    const k = `${r},${c}`;
    if (cells.has(k)) cells.delete(k); else cells.add(k);
    edits += 1;
    solved = isSymmetric();
    render();
  }

  function render() {
    board.replaceChildren();
    for (let r = 0; r < size; r += 1) {
      for (let c = 0; c < size; c += 1) {
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'symmetry-cell';
        if (isOn(r, c)) cell.classList.add('on');
        if (c === 3) cell.classList.add('center-x');
        if (r === 3) cell.classList.add('center-y');
        cell.addEventListener('click', () => toggle(r, c));
        board.appendChild(cell);
      }
    }

    if (solved) {
      setStatus(`대칭 복원 완료. ${edits}번의 수정으로 가로와 세로 대칭을 모두 만족했습니다.`);
    } else if (edits >= 4) {
      setStatus('네 번을 모두 사용했지만 아직 대칭이 아닙니다. 다시 시도해 보세요.');
    } else {
      setStatus(`남은 수정 ${4 - edits}회. 가로축과 세로축을 동시에 생각해야 합니다.`);
    }
  }

  addAction('처음부터', () => {
    cells.clear();
    for (const k of target) cells.add(k);
    ['1,1','4,2','3,5','5,3'].forEach((k) => {
      if (cells.has(k)) cells.delete(k); else cells.add(k);
    });
    edits = 0;
    solved = false;
    render();
  });

  render();
  return null;
}

/* -------------------------------------------------------------------------- */
/* 6. 그림자 조립소                                                           */
/* -------------------------------------------------------------------------- */
function shadowGame() {
  const pieces = [
    { name: 'ㄴ 조각', cells: [[0,0],[0,1],[1,1]] },
    { name: '세 칸 막대', cells: [[0,0],[1,0],[2,0]] },
    { name: '네 칸 정사각형', cells: [[0,0],[1,0],[0,1],[1,1]] }
  ];
  const target = new Set([
    '0,0','1,0','1,1',
    '0,3','1,3','2,3',
    '3,2','3,3','4,2','4,3'
  ]);
  const placements = new Map();
  const rotations = [0, 0, 0];
  let selected = 0;
  let solved = false;

  const layout = document.createElement('div');
  layout.className = 'shadow-layout';
  const board = document.createElement('div');
  board.className = 'shadow-board';
  const toolbar = document.createElement('div');
  toolbar.className = 'piece-toolbar';
  layout.append(board, toolbar);
  gameSurface.appendChild(layout);

  function rotatedCells(piece, rotation) {
    let result = piece.cells.map(([x, y]) => [x, y]);
    for (let i = 0; i < rotation; i += 1) {
      result = result.map(([x, y]) => [-y, x]);
      const minX = Math.min(...result.map(([x]) => x));
      const minY = Math.min(...result.map(([, y]) => y));
      result = result.map(([x, y]) => [x - minX, y - minY]);
    }
    return result;
  }

  function absoluteCells(index, placement = placements.get(index)) {
    if (!placement) return [];
    return rotatedCells(pieces[index], placement.rotation).map(([x, y]) => [placement.r + y, placement.c + x]);
  }

  function occupiedExcept(index) {
    const set = new Set();
    for (let i = 0; i < pieces.length; i += 1) {
      if (i === index) continue;
      for (const [r, c] of absoluteCells(i)) set.add(`${r},${c}`);
    }
    return set;
  }

  function tryPlace(r, c) {
    if (solved) return;
    const candidate = { r, c, rotation: rotations[selected] };
    const occupied = occupiedExcept(selected);
    const cells = absoluteCells(selected, candidate);

    if (cells.some(([rr, cc]) => rr < 0 || rr >= 5 || cc < 0 || cc >= 5)) {
      setStatus('조각이 판 밖으로 나갑니다. 다른 기준 칸을 선택하세요.');
      return;
    }
    if (cells.some(([rr, cc]) => occupied.has(`${rr},${cc}`))) {
      setStatus('다른 조각과 겹칩니다. 빈 공간에 놓아야 합니다.');
      return;
    }

    placements.set(selected, candidate);
    checkWin();
    render();
  }

  function checkWin() {
    const filled = new Set();
    for (let i = 0; i < pieces.length; i += 1) {
      for (const [r, c] of absoluteCells(i)) filled.add(`${r},${c}`);
    }
    solved = filled.size === target.size && [...target].every((k) => filled.has(k));
  }

  function render() {
    board.replaceChildren();
    const filled = new Map();
    for (let i = 0; i < pieces.length; i += 1) {
      for (const [r, c] of absoluteCells(i)) filled.set(`${r},${c}`, i);
    }

    for (let r = 0; r < 5; r += 1) {
      for (let c = 0; c < 5; c += 1) {
        const k = `${r},${c}`;
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'shadow-cell';
        if (target.has(k)) cell.classList.add('target');
        if (filled.has(k)) cell.classList.add('filled');
        if (filled.has(k) && !target.has(k)) cell.classList.add('bad');
        cell.addEventListener('click', () => tryPlace(r, c));
        board.appendChild(cell);
      }
    }

    toolbar.replaceChildren();
    pieces.forEach((piece, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'piece-button';
      if (index === selected) button.classList.add('selected');
      button.innerHTML = `${piece.name}<small>회전 ${rotations[index] * 90}도${placements.has(index) ? ' · 배치됨' : ''}</small>`;
      button.addEventListener('click', () => {
        selected = index;
        render();
      });
      toolbar.appendChild(button);
    });

    if (solved) {
      setStatus('그림자가 정확히 채워졌습니다. 세 조각이 서로 겹치지 않고 목표 영역만 덮고 있습니다.');
    } else {
      setStatus('조각을 고른 뒤 판의 기준 칸을 누르세요. 회전과 기준점 선택이 핵심입니다.');
    }
  }

  addAction('선택 조각 회전', () => {
    if (solved) return;
    rotations[selected] = (rotations[selected] + 1) % 4;
    placements.delete(selected);
    render();
  });
  addAction('선택 조각 치우기', () => {
    if (solved) return;
    placements.delete(selected);
    render();
  });
  addAction('모두 비우기', () => {
    placements.clear();
    rotations.fill(0);
    selected = 0;
    solved = false;
    render();
  });

  render();
  return null;
}

/* -------------------------------------------------------------------------- */
/* 7. 규칙 제작기                                                             */
/* -------------------------------------------------------------------------- */
function machineGame() {
  const operations = [
    { id: 'add1', label: '+ 1', fn: (x) => x + 1 },
    { id: 'add2', label: '+ 2', fn: (x) => x + 2 },
    { id: 'sub1', label: '- 1', fn: (x) => x - 1 },
    { id: 'mul2', label: '× 2', fn: (x) => x * 2 },
    { id: 'mul3', label: '× 3', fn: (x) => x * 3 },
    { id: 'square', label: '제곱', fn: (x) => x * x }
  ];
  const challenges = [
    { first: 'mul3', second: 'add1', inputs: [2, 3, 5, 8] },
    { first: 'add2', second: 'mul2', inputs: [2, 3, 5, 8] },
    { first: 'square', second: 'sub1', inputs: [2, 3, 5, 8] }
  ];
  let level = 0;
  let completed = false;

  const machine = document.createElement('div');
  machine.className = 'machine';
  gameSurface.appendChild(machine);

  function opById(id) {
    return operations.find((op) => op.id === id);
  }

  function outputFor(challenge, input) {
    return opById(challenge.second).fn(opById(challenge.first).fn(input));
  }

  function render() {
    machine.replaceChildren();
    const challenge = challenges[level];

    const examples = document.createElement('div');
    examples.className = 'examples';
    for (const input of challenge.inputs) {
      const card = document.createElement('div');
      card.className = 'example-card';
      card.innerHTML = `<strong>${input} → ${outputFor(challenge, input)}</strong><span>관찰 사례</span>`;
      examples.appendChild(card);
    }

    const controls = document.createElement('div');
    controls.className = 'machine-controls';
    const first = document.createElement('select');
    const second = document.createElement('select');
    for (const op of operations) {
      const a = document.createElement('option');
      a.value = op.id;
      a.textContent = op.label;
      first.appendChild(a);
      const b = a.cloneNode(true);
      second.appendChild(b);
    }
    first.value = 'add1';
    second.value = 'add1';

    const arrow = document.createElement('span');
    arrow.className = 'machine-arrow';
    arrow.textContent = '다음';
    const test = document.createElement('button');
    test.type = 'button';
    test.textContent = '규칙 시험하기';
    test.addEventListener('click', () => {
      const guessedFirst = opById(first.value);
      const guessedSecond = opById(second.value);
      const matches = challenge.inputs.every((input) => {
        const actual = guessedSecond.fn(guessedFirst.fn(input));
        return actual === outputFor(challenge, input);
      });

      if (!matches) {
        setStatus('사례 중 적어도 하나가 맞지 않습니다. 연산의 종류뿐 아니라 순서도 다시 생각해 보세요.');
        return;
      }

      if (level < challenges.length - 1) {
        level += 1;
        setStatus(`규칙을 찾았습니다. 다음 규칙 ${level + 1} / ${challenges.length}로 넘어갑니다.`);
        render();
      } else {
        completed = true;
        setStatus('세 개의 숨은 규칙을 모두 복원했습니다.');
        test.disabled = true;
      }
    });

    controls.append(first, arrow, second, test);
    machine.append(examples, controls);

    if (!completed) {
      setStatus(`숨은 규칙 ${level + 1} / ${challenges.length}. 두 연산을 순서대로 조합해 모든 사례를 설명하세요.`);
    }
  }

  addAction('첫 규칙부터 다시', () => {
    level = 0;
    completed = false;
    render();
  });
  render();
  return null;
}

const games = {
  laser: laserGame,
  gravity: gravityGame,
  twins: twinsGame,
  constellation: constellationGame,
  symmetry: symmetryGame,
  shadow: shadowGame,
  machine: machineGame
};
