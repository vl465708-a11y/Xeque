var currentMoves = [];
var currentIdx = -1;
var exploring = false;

function icon(c) {
  if (c === "blunder") return "??";
  if (c === "mistake") return "?";
  if (c === "inaccuracy") return "?!";
  return "";
}

var gamesOffset = 0;
var gamesLimit = 20;
var gamesLoading = false;
var gamesHasMore = true;

async function loadGames(reset = true) {
  if (gamesLoading) return;
  gamesLoading = true;

  if (reset) {
    gamesOffset = 0;
    gamesHasMore = true;
    document.getElementById("games").innerHTML = "";
  }

  const resp = await fetch(
    `/api/games?offset=${gamesOffset}&limit=${gamesLimit}`,
  );
  const data = await resp.json();

  const el = document.getElementById("games");
  el.insertAdjacentHTML(
    "beforeend",
    data.games
      .map(
        (g) => `
        <div class="game-item" data-id="${g.id}" onclick="loadGame(${g.id}, '${g.player_white}', '${g.player_black}')">
            <b>${g.player_white} vs ${g.player_black}</b><br>
            ${g.result} · ${g.date}
            <br>
            <button 
                id="analyze-btn-${g.id}"
                onclick="event.stopPropagation(); analyzeGame(${g.id})"
                style="margin-top:6px; padding:3px 10px; font-size:11px; border-radius:4px; border:1px solid #4ade80; background:transparent; color:#4ade80; cursor:pointer;">
                ⚙ analisar
            </button>
            <button 
                onclick="event.stopPropagation(); deleteGame(${g.id})"
                style="margin-top:6px; margin-left:4px; padding:3px 10px; font-size:11px; border-radius:4px; border:1px solid #da2b2b; background:transparent; color:#da2b2b; cursor:pointer;">
                🗑 deletar
            </button>
            <span id="analyze-status-${g.id}" style="font-size:10px; color:#888; display:block; margin-top:2px;"></span>
        </div>
    `,
      )
      .join(""),
  );

  gamesOffset += data.games.length;
  gamesHasMore = data.has_more;
  gamesLoading = false;

  if (gamesHasMore && el.scrollHeight <= el.clientHeight) {
    loadGames(false);
  }
}

async function analyzeGame(id) {
  const btn = document.getElementById(`analyze-btn-${id}`);
  const status = document.getElementById(`analyze-status-${id}`);

  btn.disabled = true;
  btn.style.opacity = "0.4";
  status.innerHTML =
    '<span style="display:inline-flex;align-items:center;gap:6px;"><svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="6" fill="none" stroke="#444" stroke-width="2"/><circle id="progress-ring-' +
    id +
    '" cx="7" cy="7" r="6" fill="none" stroke="#4ade80" stroke-width="2" stroke-dasharray="37.7" stroke-dashoffset="37.7" stroke-linecap="round" transform="rotate(-90 7 7)" style="transition:stroke-dashoffset 0.4s"/></svg><span id="progress-text-' +
    id +
    '">0%</span></span>';

  const resp = await fetch(`/api/analyze/${id}`, { method: "POST" });
  const data = await resp.json();
  const jobId = data.job_id;

  const poll = setInterval(async () => {
    const r = await fetch(`/api/jobs/${jobId}`);
    const j = await r.json();

    if (j.total > 0) {
      const pct = Math.round((j.progress / j.total) * 100);
      const offset = 37.7 * (1 - pct / 100);
      const ring = document.getElementById(`progress-ring-${id}`);
      const text = document.getElementById(`progress-text-${id}`);
      if (ring) ring.style.strokeDashoffset = offset;
      if (text) text.textContent = pct + "%";
    }

    if (j.status === "completed") {
      clearInterval(poll);
      status.textContent = "✓ pronto";
      status.style.color = "#4ade80";
      btn.disabled = false;
      btn.style.opacity = "1";
    } else if (j.status.startsWith("error")) {
      clearInterval(poll);
      status.textContent = "✗ erro";
      status.style.color = "#da2b2b";
      btn.disabled = false;
      btn.style.opacity = "1";
    }
  }, 2000);
}

var pendingDeleteId = null;

function deleteGame(id) {
  pendingDeleteId = id;
  document.getElementById("delete-modal").style.display = "flex";
}

function closeDeleteModal() {
  pendingDeleteId = null;
  document.getElementById("delete-modal").style.display = "none";
}

async function confirmDelete() {
  const id = pendingDeleteId;
  if (id === null) return;
  closeDeleteModal();

  const resp = await fetch(`/api/games/${id}`, { method: "DELETE" });
  const data = await resp.json();

  if (data.error) {
    alert("Erro ao deletar: " + data.error);
    return;
  }

  const item = document.querySelector(`.game-item[data-id="${id}"]`);
  if (item) item.remove();

  if (currentMoves.length && currentMoves[0]?.game_id === id) {
    currentMoves = [];
    currentIdx = -1;
    document.getElementById("moves").innerHTML = "";
    document.getElementById("game-summary").style.display = "none";
    document.getElementById("eval-panel").style.display = "none";
    document.getElementById("eval-bar-container").style.display = "none";
    board.position("start");
    drawChartBase([]);
    drawCursor([], -1);
  }
}

loadGames();

async function loadGame(id, playerWhite, playerBlack) {
  playerWhiteName = playerWhite;
  playerBlackName = playerBlack;
  if (boardFlipped) {
    boardFlipped = false;
    board.flip();
  }
  updatePlayerLabels();

  document.getElementById("board-focus").focus();
  document.getElementById("eval-bar-container").style.display = "flex";
  document.getElementById("eval-panel").style.display = "flex";
  document
    .querySelectorAll(".game-item")
    .forEach((el) => el.classList.remove("selected"));
  document
    .querySelector(`.game-item[data-id="${id}"]`)
    ?.classList.add("selected");

  const resp = await fetch(`/api/games/${id}/moves`);
  const data = await resp.json();
  const movesEl = document.getElementById("moves");

  if (!data.moves || data.moves.length === 0) {
    movesEl.innerHTML =
      '<p style="color:#666;font-size:12px;">Partida não analisada ainda.</p>';
    return;
  }

  precomputeMoveSquares(data.moves);

  let html = "";
  for (let i = 0; i < data.moves.length; i += 2) {
    const w = data.moves[i];
    const b = data.moves[i + 1];
    const moveNum = Math.floor(i / 2) + 1;
    const wIcon = w.is_brilliant ? "!!" : icon(w.classification);
    const bIcon = b && b.is_brilliant ? "!!" : b ? icon(b.classification) : "";
    const wClass = w.is_brilliant ? "brilliant" : w.classification;
    const bClass =
      b && b.is_brilliant ? "brilliant" : b ? b.classification : "";
    html += `<div class="move-row">
        <span style="color:#aaa">${moveNum}.</span>
        <span class="move-san ${wClass}" id="m${i}" onclick="gotoMove(${i})">${w.san} ${wIcon} <small style="color:#888">(${formatScore(w.eval_after, w.mate_in)})</small></span>
        ${b ? `<span class="move-san ${bClass}" id="m${i + 1}" onclick="gotoMove(${i + 1})">${b.san} ${bIcon}<small style="color:#888">(${formatScore(b.eval_after, b.mate_in)})</small></span>` : ""}
        </div>`;
  }

  movesEl.innerHTML = html;
  board.position("start");

  document.getElementById("board-focus").focus();

  currentMoves = data.moves;
  currentIdx = -1;
  drawChartBase(currentMoves);
  drawCursor(currentMoves, -1);
  updateSummary(currentMoves);
}

function cpToWinPct(cp) {
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

function formatScore(cp, mateIn) {
  if (mateIn !== null && mateIn !== undefined) {
    const m = Math.abs(mateIn);
    return mateIn > 0 ? `M${m}` : `-M${m}`;
  }
  const val = cp / 100;
  return val >= 0 ? `+${val.toFixed(2)}` : `${val.toFixed(2)}`;
}

function precomputeMoveSquares(moves) {
  const tmp = new Chess();
  for (const m of moves) {
    tmp.load(m.fen_before);
    const mv = tmp.move(m.san);
    if (mv) {
      m.from = mv.from;
      m.to = mv.to;
    }
  }
}

function gotoMove(idx) {
  exploring = false;
  document.getElementById("explore-banner").style.display = "none";
  currentIdx = idx;
  document
    .querySelectorAll(".move-san")
    .forEach((el) => el.classList.remove("active"));
  const el = document.getElementById("m" + idx);
  if (el) {
    el.classList.add("active");
    el.scrollIntoView({ block: "nearest" });
  }

  const move = currentMoves[idx];
  const cp = move.eval_after || 0;
  const mateIn = move.mate_in ?? null;
  const isMate = mateIn !== null;
  const pct = isMate ? (cp > 0 ? 95 : 5) : cpToWinPct(cp);

  const next = currentMoves[idx + 1];
  const fen = next ? next.fen_before : move.fen_before;

  document.getElementById("eval-score").textContent = formatScore(cp, mateIn);
  document.getElementById("eval-bar").style.height = pct + "%";
  document.getElementById("move-label").innerHTML =
    `<span class="${move.classification}">${move.san} ${icon(move.classification)}</span>`;
  document.getElementById("best-move").innerHTML =
    move.best_move_san && move.best_move_san !== move.san
      ? `melhor era: <b style="color:#4ade80">${move.best_move_san}</b>`
      : "";

  if (move.best_move && move.best_move !== move.san) {
    drawArrow(move.best_move);
  } else {
    drawArrow(null);
  }

  game.load(fen);
  board.position(fen);
  highlightMove(move.from, move.to);
  drawCursor(currentMoves, idx);
}

function navMove(dir) {
  const max = currentMoves.length - 1;
  if (dir === "start") currentIdx = -1;
  else if (dir === "prev") currentIdx = Math.max(-1, currentIdx - 1);
  else if (dir === "next") currentIdx = Math.min(max, currentIdx + 1);
  else if (dir === "end") currentIdx = max;

  if (currentIdx === -1) {
    exploring = false;
    document.getElementById("explore-banner").style.display = "none";
    board.position("start");
    document
      .querySelectorAll(".highlight-from, .highlight-to")
      .forEach((el) => {
        el.classList.remove("highlight-from", "highlight-to");
      });
    drawCursor(currentMoves, -1);
    return;
  }

  gotoMove(currentIdx);
}

function exitExploration() {
  if (!exploring) return;
  exploring = false;
  document.getElementById("explore-banner").style.display = "none";

  if (currentIdx === -1) {
    game.reset();
    board.position("start");
    document.getElementById("eval-score").textContent = "—";
    document.getElementById("eval-bar").style.height = "50%";
    document.getElementById("move-label").textContent = "—";
    document.getElementById("best-move").textContent = "";
    drawArrow(null);
  } else {
    gotoMove(currentIdx);
  }
}

var boardFlipped = false;
var playerWhiteName = "—";
var playerBlackName = "—";

function updatePlayerLabels() {
  const top = document.getElementById("player-top");
  const bottom = document.getElementById("player-bottom");
  if (boardFlipped) {
    top.textContent = "⬜ " + playerWhiteName;
    bottom.textContent = "⬛ " + playerBlackName;
  } else {
    top.textContent = "⬛ " + playerBlackName;
    bottom.textContent = "⬜ " + playerWhiteName;
  }
}

function flipBoard() {
  boardFlipped = !boardFlipped;
  board.flip();
  updatePlayerLabels();
}

var game = new Chess();

var board = Chessboard("board", {
  position: "start",
  pieceTheme: "https://lichess1.org/assets/piece/cburnett/{piece}.svg",
  draggable: true,
  onDragStart: function (source, piece) {
    if (game.game_over()) return false;
    if (
      (game.turn() === "w" && piece.search(/^b/) !== -1) ||
      (game.turn() === "b" && piece.search(/^w/) !== -1)
    ) {
      return false;
    }
  },
  onDrop: function (source, target) {
    var move = game.move({
      from: source,
      to: target,
      promotion: "q",
    });

    if (move === null) return "snapback";
    exploring = true;
    document.getElementById("explore-banner").style.display = "flex";
    evaluateExploration();
  },
  onSnapEnd: function () {
    board.position(game.fen());
  },
});

function drawChartBase(moves) {
  const canvas = document.getElementById("eval-chart-base");
  const ctx = canvas.getContext("2d");
  const W = canvas.width,
    H = canvas.height;
  const mid = H / 2;

  ctx.clearRect(0, 0, W, H);

  ctx.fillStyle = "#0d1f0d";
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = "#2a4a2a";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, mid);
  ctx.lineTo(W, mid);
  ctx.stroke();

  if (!moves || moves.length === 0) return;

  const n = moves.length;
  const xStep = W / n;

  ctx.beginPath();
  ctx.moveTo(0, mid);
  for (let i = 0; i < n; i++) {
    const cp = moves[i].eval_after || 0;
    const mateIn = moves[i].mate_in ?? null;
    const isMate = mateIn !== null;
    const pct = isMate ? (cp > 0 ? 95 : 5) : cpToWinPct(cp);
    const y = H - (pct / 100) * H;
    ctx.lineTo(i * xStep + xStep / 2, y);
  }
  ctx.lineTo(W, mid);
  ctx.closePath();

  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "rgba(220,220,220,0.9)");
  grad.addColorStop(0.5, "rgba(120,120,120,0.3)");
  grad.addColorStop(1, "rgba(30,30,30,0.9)");
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.beginPath();
  ctx.strokeStyle = "#4ade80";
  ctx.lineWidth = 1.5;
  for (let i = 0; i < n; i++) {
    const cp = moves[i].eval_after || 0;
    const mateIn = moves[i].mate_in ?? null;
    const isMate = mateIn !== null;
    const pct = isMate ? (cp > 0 ? 95 : 5) : cpToWinPct(cp);
    const y = H - (pct / 100) * H;
    const x = i * xStep + xStep / 2;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.stroke();

  for (let i = 0; i < n; i++) {
    const c = moves[i].classification;
    if (c !== "blunder" && c !== "mistake") continue;
    const cp = moves[i].eval_after || 0;
    const mateIn = moves[i].mate_in ?? null;
    const isMate = mateIn !== null;
    const pct = isMate ? (cp > 0 ? 95 : 5) : cpToWinPct(cp);
    const y = H - (pct / 100) * H;
    const x = i * xStep + xStep / 2;
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fillStyle = c === "blunder" ? "#da2b2b" : "#fb923c";
    ctx.fill();
  }

  for (let i = 0; i < n; i++) {
    if (!moves[i].is_brilliant) continue;
    const cp = moves[i].eval_after || 0;
    const mateIn = moves[i].mate_in ?? null;
    const isMate = mateIn !== null;
    const pct = isMate ? (cp > 0 ? 95 : 5) : cpToWinPct(cp);
    const y = H - (pct / 100) * H;
    const x = i * xStep + xStep / 2;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = "#1baaa6";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.strokeStyle = "#0d1f0d";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

function drawCursor(moves, activeIdx) {
  const canvas = document.getElementById("eval-chart-cursor");
  const ctx = canvas.getContext("2d");
  const W = canvas.width,
    H = canvas.height;

  ctx.clearRect(0, 0, W, H);

  if (!moves || moves.length === 0) return;
  if (activeIdx < 0 || activeIdx >= moves.length) return;

  const n = moves.length;
  const xStep = W / n;

  const cp = moves[activeIdx].eval_after || 0;
  const mateIn = moves[activeIdx].mate_in ?? null;
  const isMate = mateIn !== null;
  const pct = isMate ? (cp > 0 ? 95 : 5) : cpToWinPct(cp);
  const y = H - (pct / 100) * H;
  const x = activeIdx * xStep + xStep / 2;

  ctx.beginPath();
  ctx.strokeStyle = "rgba(255,255,255,0.3)";
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.moveTo(x, 0);
  ctx.lineTo(x, H);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.beginPath();
  ctx.arc(x, y, 4, 0, Math.PI * 2);
  ctx.fillStyle = "#fff";
  ctx.fill();
}

document
  .getElementById("eval-chart-base")
  .addEventListener("click", function (e) {
    if (!currentMoves.length) return;
    const rect = this.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const idx = Math.round((x / rect.width) * currentMoves.length - 0.5);
    const clamped = Math.max(0, Math.min(currentMoves.length - 1, idx));
    gotoMove(clamped);
  });

document
  .getElementById("eval-chart-base")
  .addEventListener("mousemove", function (e) {
    if (!currentMoves.length) return;
    const rect = this.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const idx = Math.round((x / rect.width) * currentMoves.length - 0.5);
    const clamped = Math.max(0, Math.min(currentMoves.length - 1, idx));
    const move = currentMoves[clamped];
    const tooltip = document.getElementById("chart-tooltip");
    const moveNum = Math.floor(clamped / 2) + 1;
    const color = move.color === "white" ? "⬜" : "⬛";
    tooltip.textContent = `${moveNum}. ${color} ${move.san}  ${formatScore(move.eval_after, move.mate_in)}`;
    tooltip.style.display = "block";
    tooltip.style.left = e.clientX + 12 + "px";
    tooltip.style.top = e.clientY - 28 + "px";
  });

document
  .getElementById("eval-chart-base")
  .addEventListener("mouseleave", function () {
    document.getElementById("chart-tooltip").style.display = "none";
  });

function highlightMove(from, to) {
  document.querySelectorAll('[class*="square-"]').forEach((el) => {
    el.classList.remove("highlight-from", "highlight-to");
  });
  if (!from || !to) return;
  const fromEl = document.querySelector(`.square-${from}`);
  const toEl = document.querySelector(`.square-${to}`);
  if (fromEl) fromEl.classList.add("highlight-from");
  if (toEl) toEl.classList.add("highlight-to");
}

function updateSummary(moves) {
  const summary = document.getElementById("game-summary");
  if (!moves || moves.length === 0) {
    summary.style.display = "none";
    return;
  }

  const stats = {
    white: {
      blunders: 0,
      mistakes: 0,
      inaccuracies: 0,
      winPctLoss: [],
      count: 0,
    },
    black: {
      blunders: 0,
      mistakes: 0,
      inaccuracies: 0,
      winPctLoss: [],
      count: 0,
    },
  };

  moves.forEach((m) => {
    const s = stats[m.color];
    if (!s) return;
    if (m.classification === "blunder") s.blunders++;
    else if (m.classification === "mistake") s.mistakes++;
    else if (m.classification === "inaccuracy") s.inaccuracies++;

    // precisão = quanta chance de vitória foi perdida no lance
    const before = cpToWinPct(m.eval_before || 0);
    const after = cpToWinPct(m.eval_after || 0);
    const loss = m.color === "white" ? before - after : after - before;
    if (loss > 0) s.winPctLoss.push(loss);
    s.count++;
  });

  // fórmula do Lichess: Accuracy% = 103.1668 * exp(-0.04354 * avgWinPctLoss) - 3.1669
  const accuracy = (s) => {
    if (s.count === 0) return "—";
    const avg = s.winPctLoss.length
      ? s.winPctLoss.reduce((a, b) => a + b, 0) / s.count
      : 0;
    const acc = 103.1668 * Math.exp(-0.04354 * avg) - 3.1669;
    return Math.max(0, Math.min(100, acc)).toFixed(1) + "%";
  };

  document.getElementById("sw-blunders").textContent = stats.white.blunders;
  document.getElementById("sw-mistakes").textContent = stats.white.mistakes;
  document.getElementById("sw-inaccuracies").textContent =
    stats.white.inaccuracies;
  document.getElementById("sw-acpl").textContent = accuracy(stats.white);
  document.getElementById("sb-blunders").textContent = stats.black.blunders;
  document.getElementById("sb-mistakes").textContent = stats.black.mistakes;
  document.getElementById("sb-inaccuracies").textContent =
    stats.black.inaccuracies;
  document.getElementById("sb-acpl").textContent = accuracy(stats.black);
  document.getElementById("summary-white-name").textContent =
    "⬜ " + playerWhiteName;
  document.getElementById("summary-black-name").textContent =
    "⬛ " + playerBlackName;

  summary.style.display = "block";
}

function drawArrow(uci) {
  const svg = document.getElementById("arrows-auto");
  svg.innerHTML = "";
  if (!uci || uci.length < 4) return;
  renderArrow(svg, uci, "#4ade80", "arrow-auto");
}

function renderArrow(container, uci, color, markerId) {
  const size = 660 / 8;
  const col = (c) => (c.charCodeAt(0) - 97) * size + size / 2;
  const row = (r) => (8 - parseInt(r)) * size + size / 2;

  const x1 = col(uci[0]),
    y1 = row(uci[1]);
  const x2 = col(uci[2]),
    y2 = row(uci[3]);

  // encurta a linha pra não sobrepor a ponta
  const dx = x2 - x1,
    dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  const ux = dx / len,
    uy = dy / len;
  const ex = x2 - ux * 18,
    ey = y2 - uy * 18;

  container.innerHTML += `
        <defs>
            <marker id="${markerId}" markerWidth="4" markerHeight="4" refX="2" refY="2" orient="auto">
                <path d="M0,0 L4,2 L0,4 Z" fill="${color}" opacity="0.9"/>
            </marker>
        </defs>
        <line x1="${x1}" y1="${y1}" x2="${ex}" y2="${ey}"
              stroke="${color}" stroke-width="10" opacity="0.75"
              stroke-linecap="round"
              marker-end="url(#${markerId})"/>
    `;
}

// sistema de setas manuais
const manualArrows = [];
const manualHighlights = [];
let rightDragStart = null;

const boardWrapper = document.getElementById("board-wrapper");
boardWrapper.addEventListener("contextmenu", (e) => e.preventDefault());

boardWrapper.addEventListener("mousedown", (e) => {
  document.getElementById("board-focus").focus();
  if (e.button === 0) {
    manualArrows.length = 0;
    manualHighlights.length = 0;
    renderManual();
    return;
  }
  if (e.button !== 2) return;
  const sq = squareFromEvent(e);
  if (sq) rightDragStart = sq;
});

boardWrapper.addEventListener("mouseup", (e) => {
  if (e.button !== 2) return;
  const sq = squareFromEvent(e);
  if (!sq || !rightDragStart) return;

  if (sq === rightDragStart) {
    const existing = manualHighlights.indexOf(sq);
    if (existing >= 0) manualHighlights.splice(existing, 1);
    else manualHighlights.push(sq);
  } else {
    const uci = rightDragStart + sq;
    const existing = manualArrows.indexOf(uci);
    if (existing >= 0) manualArrows.splice(existing, 1);
    else manualArrows.push(uci);
  }
  rightDragStart = null;
  renderManual();
});

function squareFromEvent(e) {
  const boardEl = document.getElementById("board");
  const rect = boardEl.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const size = rect.width / 8;
  let col = Math.floor(x / size);
  let row = Math.floor(y / size);
  if (boardFlipped) {
    col = 7 - col;
    row = 7 - row;
  }
  if (col < 0 || col > 7 || row < 0 || row > 7) return null;
  return "abcdefgh"[col] + (8 - row);
}

function renderManual() {
  const svg = document.getElementById("arrows-manual");
  svg.innerHTML = "";

  // destaques
  const size = 660 / 8;
  const col = (c) => (c.charCodeAt(0) - 97) * size;
  const row = (r) => (8 - parseInt(r)) * size;

  manualHighlights.forEach((sq) => {
    const x = boardFlipped ? (7 - (sq.charCodeAt(0) - 97)) * size : col(sq[0]);
    const y = boardFlipped ? (parseInt(sq[1]) - 1) * size : row(sq[1]);
    svg.innerHTML += `<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="rgba(255,170,0,0.4)" pointer-events="none"/>`;
  });

  // setas
  manualArrows.forEach((uci, i) => {
    renderArrow(svg, uci, "#f5a623", `arrow-manual-${i}`);
  });
}

function togglePgnModal() {
  const modal = document.getElementById("pgn-modal");
  const isOpen = modal.style.display === "flex";
  modal.style.display = isOpen ? "none" : "flex";
  if (!isOpen) {
    document.getElementById("pgn-input").value = "";
    document.getElementById("pgn-status").textContent = "";
  }
}

async function importPGN() {
  const pgn = document.getElementById("pgn-input").value.trim();
  const status = document.getElementById("pgn-status");
  if (!pgn) {
    status.textContent = "Cole um PGN antes de importar.";
    return;
  }

  status.textContent = "Importando...";
  status.style.color = "#888";

  const resp = await fetch("/api/import/pgn", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pgn }),
  });
  const data = await resp.json();

  if (data.error) {
    status.textContent = "✗ Erro: " + data.error;
    status.style.color = "#da2b2b";
  } else {
    status.textContent = `✓ ${data.imported} partida(s) importada(s)`;
    status.style.color = "#4ade80";
    await loadGames();
    setTimeout(togglePgnModal, 1200);
  }
}

// fecha modal clicando fora
document.getElementById("pgn-modal").addEventListener("click", function (e) {
  if (e.target === this) togglePgnModal();
});

document.getElementById("delete-modal").addEventListener("click", function (e) {
  if (e.target === this) closeDeleteModal();
});

function handler(e) {
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
    e.preventDefault();
    if (e.key === "ArrowLeft") navMove("prev");
    else if (e.key === "ArrowRight") navMove("next");
    else if (e.key === "ArrowUp") navMove("start");
    else if (e.key === "ArrowDown") navMove("end");
  }
}

document.addEventListener("keydown", handler);

async function evaluateExploration() {
  const fen = game.fen();
  document.getElementById("eval-score").textContent = "...";
  document.getElementById("move-label").textContent = "avaliando...";

  try {
    const resp = await fetch("/api/evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fen }),
    });
    const data = await resp.json();
    if (data.error) return;

    const isMate = data.mate_in !== null && data.mate_in !== undefined;
    const pct = isMate
      ? data.mate_in > 0
        ? 95
        : 5
      : cpToWinPct(data.eval || 0);

    document.getElementById("eval-score").textContent = formatScore(
      data.eval,
      data.mate_in,
    );
    document.getElementById("eval-bar").style.height = pct + "%";
    document.getElementById("move-label").textContent = "explorando variante";
    document.getElementById("best-move").innerHTML = data.best_move_san
      ? `melhor era: <b style="color:#4ade80">${data.best_move_san}</b>`
      : "";

    drawArrow(data.best_move || null);
  } catch (e) {
    console.error("Erro ao avaliar posição:", e);
  }
}

document.querySelector(".games-list").addEventListener("scroll", function () {
  const el = this;
  const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 100;
  if (nearBottom && gamesHasMore && !gamesLoading) {
    loadGames(false);
  }
});
