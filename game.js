const SIZE = 8;
const MAX_IMAGES = 8;
const FALLBACK = ["🍊", "🍓", "🥝", "🫐", "🍋", "🍇"];
const emojiAsset = emoji => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="#fffaf3"/><text x="50" y="66" text-anchor="middle" font-size="56">${emoji}</text></svg>`)}`;

const boardEl = document.querySelector("#board");
const scoreEl = document.querySelector("#score");
const imageListEl = document.querySelector("#imageList");
const uploadInput = document.querySelector("#imageUpload");
const uploadZone = document.querySelector("#uploadZone");
const statusText = document.querySelector("#statusText");
const comboBadge = document.querySelector("#comboBadge");

let customImages = [];
let board = [];
let selected = null;
let score = 0;
let busy = false;
let soundOn = true;

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const pool = () => {
  if (!customImages.length) return FALLBACK;
  // Identical uploads must represent the same tile type. Otherwise two files
  // with the same pixels can look equal to the player but fail to match.
  const assets = [...new Set(customImages)];
  for (let i = 0; assets.length < 4; i++) assets.push(emojiAsset(FALLBACK[i]));
  return assets;
};
const randomType = () => Math.floor(Math.random() * pool().length);

function beep(frequency = 500, duration = .06) {
  if (!soundOn) return;
  try {
    const context = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(.035, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + duration);
  } catch (_) {}
}

function celebrationSound(chain = 1) {
  if (!soundOn) return;
  try {
    const context = new (window.AudioContext || window.webkitAudioContext)();
    const master = context.createGain();
    master.gain.value = .55;
    master.connect(context.destination);
    const lift = Math.pow(2, Math.min(chain - 1, 3) / 12);
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((frequency, index) => {
      const start = context.currentTime + index * .075;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = index === notes.length - 1 ? "sine" : "triangle";
      oscillator.frequency.value = frequency * lift;
      gain.gain.setValueAtTime(.001, start);
      gain.gain.exponentialRampToValueAtTime(index === notes.length - 1 ? .065 : .045, start + .018);
      gain.gain.exponentialRampToValueAtTime(.001, start + (index === notes.length - 1 ? .32 : .17));
      oscillator.connect(gain).connect(master);
      oscillator.start(start);
      oscillator.stop(start + .34);
    });
  } catch (_) {}
}

function frustratedSound() {
  if (!soundOn) return;
  try {
    const context = new (window.AudioContext || window.webkitAudioContext)();
    const master = context.createGain();
    master.gain.setValueAtTime(.055, context.currentTime);
    master.gain.exponentialRampToValueAtTime(.001, context.currentTime + .42);
    master.connect(context.destination);
    [0, .17].forEach((delay, index) => {
      const oscillator = context.createOscillator();
      oscillator.type = "triangle";
      const start = context.currentTime + delay;
      oscillator.frequency.setValueAtTime(290 - index * 45, start);
      oscillator.frequency.exponentialRampToValueAtTime(125 - index * 18, start + .2);
      oscillator.connect(master);
      oscillator.start(start);
      oscillator.stop(start + .22);
    });
  } catch (_) {}
}

function makeBoard() {
  board = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      let type;
      do {
        type = randomType();
      } while ((col >= 2 && board[row][col - 1] === type && board[row][col - 2] === type) ||
               (row >= 2 && board[row - 1][col] === type && board[row - 2][col] === type));
      board[row][col] = type;
    }
  }
}

function renderBoard() {
  boardEl.innerHTML = "";
  boardEl.style.setProperty("--size", SIZE);
  const assets = pool();
  board.forEach((row, rowIndex) => row.forEach((type, colIndex) => {
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = `tile${customImages.length ? "" : " default-tile"}`;
    tile.dataset.row = rowIndex;
    tile.dataset.col = colIndex;
    tile.setAttribute("role", "gridcell");
    tile.setAttribute("aria-label", `第 ${rowIndex + 1} 行，第 ${colIndex + 1} 列`);
    if (selected && selected.row === rowIndex && selected.col === colIndex) tile.classList.add("selected");
    if (customImages.length) {
      const img = document.createElement("img");
      img.src = assets[type % assets.length];
      img.alt = "";
      tile.append(img);
    } else {
      tile.textContent = assets[type % assets.length];
    }
    tile.addEventListener("click", () => chooseTile(rowIndex, colIndex));
    boardEl.append(tile);
  }));
}

function findMatches() {
  const matches = new Set();
  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE - 2; col++) {
      const type = board[row][col];
      if (type !== null && type === board[row][col + 1] && type === board[row][col + 2]) {
        let end = col + 2;
        while (end + 1 < SIZE && board[row][end + 1] === type) end++;
        for (let x = col; x <= end; x++) matches.add(`${row},${x}`);
        col = end - 1;
      }
    }
  }
  for (let col = 0; col < SIZE; col++) {
    for (let row = 0; row < SIZE - 2; row++) {
      const type = board[row][col];
      if (type !== null && type === board[row + 1][col] && type === board[row + 2][col]) {
        let end = row + 2;
        while (end + 1 < SIZE && board[end + 1][col] === type) end++;
        for (let y = row; y <= end; y++) matches.add(`${y},${col}`);
        row = end - 1;
      }
    }
  }
  return matches;
}

function swap(a, b) {
  [board[a.row][a.col], board[b.row][b.col]] = [board[b.row][b.col], board[a.row][a.col]];
}

const adjacent = (a, b) => Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1;

async function chooseTile(row, col) {
  if (busy) return;
  const current = { row, col };
  if (!selected) {
    selected = current;
    beep(390);
    renderBoard();
    return;
  }
  if (selected.row === row && selected.col === col) {
    selected = null;
    renderBoard();
    return;
  }
  if (!adjacent(selected, current)) {
    selected = current;
    renderBoard();
    return;
  }

  busy = true;
  const previous = selected;
  selected = null;
  await animateSwap(previous, current);
  swap(previous, current);
  renderBoard();
  await wait(30);
  let matches = findMatches();

  if (!matches.size) {
    await animateSwap(previous, current);
    swap(previous, current);
    renderBoard();
    const tiles = boardEl.querySelectorAll(".tile");
    tiles[previous.row * SIZE + previous.col]?.classList.add("invalid");
    tiles[current.row * SIZE + current.col]?.classList.add("invalid");
    statusText.innerHTML = '<span class="pulse-dot"></span> 这次没有连成一线，再试试';
    frustratedSound();
    await wait(330);
    busy = false;
    return;
  }

  let chain = 0;
  while (matches.size) {
    chain++;
    await clearMatches(matches, chain);
    collapseBoard();
    renderBoard();
    await wait(260);
    matches = findMatches();
  }
  statusText.innerHTML = '<span class="pulse-dot"></span> 漂亮！继续交换相邻方块';
  comboBadge.textContent = chain > 1 ? `${chain} 连消！` : "消除成功";
  busy = false;
}

async function animateSwap(a, b) {
  const first = boardEl.querySelector(`[data-row="${a.row}"][data-col="${a.col}"]`);
  const second = boardEl.querySelector(`[data-row="${b.row}"][data-col="${b.col}"]`);
  if (!first || !second || !first.animate) return;
  const firstBox = first.getBoundingClientRect();
  const secondBox = second.getBoundingClientRect();
  const dx = secondBox.left - firstBox.left;
  const dy = secondBox.top - firstBox.top;
  first.style.zIndex = "4";
  second.style.zIndex = "3";
  const timing = { duration: 190, easing: "cubic-bezier(.2,.8,.25,1)", fill: "forwards" };
  const animations = [
    first.animate([{ transform: "translate(0, 0)" }, { transform: `translate(${dx}px, ${dy}px)` }], timing),
    second.animate([{ transform: "translate(0, 0)" }, { transform: `translate(${-dx}px, ${-dy}px)` }], timing)
  ];
  await Promise.all(animations.map(animation => animation.finished.catch(() => {})));
}

async function clearMatches(matches, chain) {
  matches.forEach(key => {
    const [row, col] = key.split(",").map(Number);
    const tile = boardEl.querySelector(`[data-row="${row}"][data-col="${col}"]`);
    if (!tile) return;
    addFirework(tile, row + col);
    tile.classList.add("matched");
  });
  const gained = matches.size * 10 * chain;
  score += gained;
  scoreEl.textContent = score.toLocaleString("zh-CN");
  comboBadge.textContent = chain > 1 ? `${chain} 连消 +${gained}` : `+${gained}`;
  celebrationSound(chain);
  await wait(410);
  matches.forEach(key => {
    const [row, col] = key.split(",").map(Number);
    board[row][col] = null;
  });
}

function addFirework(tile, seed) {
  const colors = ["#ff7448", "#ffc64b", "#65c99a", "#6ea8ff", "#e67bdd", "#ffffff"];
  for (let i = 0; i < 10; i++) {
    const angle = (Math.PI * 2 * i / 10) + (seed % 3) * .13;
    const distance = 34 + (i % 3) * 10;
    const spark = document.createElement("span");
    spark.className = "spark";
    spark.style.setProperty("--dx", `${Math.cos(angle) * distance}px`);
    spark.style.setProperty("--dy", `${Math.sin(angle) * distance}px`);
    spark.style.setProperty("--spark-color", colors[(i + seed) % colors.length]);
    spark.style.animationDelay = `${(i % 2) * 18}ms`;
    tile.append(spark);
  }
}

function collapseBoard() {
  for (let col = 0; col < SIZE; col++) {
    const values = [];
    for (let row = SIZE - 1; row >= 0; row--) {
      if (board[row][col] !== null) values.push(board[row][col]);
    }
    for (let row = SIZE - 1, i = 0; row >= 0; row--, i++) {
      board[row][col] = i < values.length ? values[i] : randomType();
    }
  }
}

function restart() {
  score = 0;
  selected = null;
  busy = false;
  scoreEl.textContent = "0";
  comboBadge.textContent = "准备好了";
  statusText.innerHTML = '<span class="pulse-dot"></span> 选择两个相邻方块进行交换';
  makeBoard();
  renderBoard();
}

function renderImageList() {
  imageListEl.innerHTML = "";
  customImages.forEach((src, index) => {
    const chip = document.createElement("div");
    chip.className = "image-chip";
    const img = document.createElement("img");
    img.src = src;
    img.alt = `已上传图片 ${index + 1}`;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "×";
    remove.title = "移除图片";
    remove.addEventListener("click", () => {
      customImages.splice(index, 1);
      renderImageList();
      restart();
    });
    chip.append(img, remove);
    imageListEl.append(chip);
  });
}

function handleFiles(fileList) {
  const remaining = MAX_IMAGES - customImages.length;
  const files = [...fileList].filter(file => file.type.startsWith("image/")).slice(0, remaining);
  if (!files.length) return;
  let loaded = 0;
  files.forEach(file => {
    const reader = new FileReader();
    reader.onload = event => {
      if (!customImages.includes(event.target.result)) {
        customImages.push(event.target.result);
      }
      loaded++;
      if (loaded === files.length) {
        renderImageList();
        restart();
      }
    };
    reader.readAsDataURL(file);
  });
  uploadInput.value = "";
}

uploadInput.addEventListener("change", event => handleFiles(event.target.files));
["dragenter", "dragover"].forEach(eventName => uploadZone.addEventListener(eventName, event => {
  event.preventDefault();
  uploadZone.classList.add("dragging");
}));
["dragleave", "drop"].forEach(eventName => uploadZone.addEventListener(eventName, event => {
  event.preventDefault();
  uploadZone.classList.remove("dragging");
}));
uploadZone.addEventListener("drop", event => handleFiles(event.dataTransfer.files));
document.querySelector("#restartButton").addEventListener("click", restart);
document.querySelector("#soundButton").addEventListener("click", event => {
  soundOn = !soundOn;
  if (!soundOn && "speechSynthesis" in window) window.speechSynthesis.cancel();
  event.currentTarget.classList.toggle("muted", !soundOn);
  event.currentTarget.setAttribute("aria-label", soundOn ? "关闭音效" : "开启音效");
  if (soundOn) beep(520);
});

restart();
