/* global Telegram */

const tg = (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : null;
if (tg) {
  tg.ready();
  tg.expand();
  // Prevent Telegram's vertical swipe gesture from collapsing/closing the mini app.
  // Available in Telegram WebApp API (Bot API 7.7+). Safe to call conditionally.
  if (typeof tg.disableVerticalSwipes === "function") {
    tg.disableVerticalSwipes();
  }
}

const $ = (sel) => document.querySelector(sel);
const canvas = $("#game");
const ctx = canvas.getContext("2d");

// Background music
const bgm = $("#bgm");
let bgmStarted = false;

async function tryStartBgm() {
  if (!bgm || bgmStarted) return;
  try {
    bgm.volume = 0.35;
    await bgm.play();
    bgmStarted = true;
  } catch (_) {
    // Autoplay with sound may be blocked until the first user gesture.
  }
}

function bindBgmUnlockOnce() {
  if (!bgm) return;
  const unlock = () => {
    tryStartBgm();
  };
  document.addEventListener("pointerdown", unlock, { once: true, passive: true });
  document.addEventListener("touchstart", unlock, { once: true, passive: true });
  document.addEventListener("keydown", unlock, { once: true });
}

document.addEventListener("visibilitychange", () => {
  if (!bgm) return;
  if (document.hidden) {
    bgm.pause();
    bgmStarted = false;
  } else {
    tryStartBgm();
  }
});

const scoreEl = $("#score");
const statusEl = $("#status");
const overlayEl = $("#overlay");
const overlayTitleEl = $("#overlayTitle");
const overlayBodyEl = $("#overlayBody");
const overlayButtonsEl = $("#overlayButtons");

// Assets (images)
const ASSET_BASE = "/assets/images";

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

function drawImageCover(ctx2, img, x, y, w, h) {
  // "background-size: cover" for canvas
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;

  const scale = Math.max(w / iw, h / ih);
  const sw = w / scale;
  const sh = h / scale;
  const sx = (iw - sw) / 2;
  const sy = (ih - sh) / 2;
  ctx2.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function drawImageCentered(ctx2, img, cx, cy, w, h) {
  ctx2.drawImage(img, cx - w / 2, cy - h / 2, w, h);
}

const assets = {
  loaded: false,
  error: null,
  bg: null,
  player: { l: null, m: null, r: null },
  cake: null,
  cakeGold: null,
  bomb: null,
};

async function loadAssets() {
  try {
    const [
      bg,
      playerL,
      playerM,
      playerR,
      cake,
      cakeGold,
      bomb,
    ] = await Promise.all([
      loadImage(`${ASSET_BASE}/bg.png`),
      loadImage(`${ASSET_BASE}/player_l.png`),
      loadImage(`${ASSET_BASE}/player_m.png`),
      loadImage(`${ASSET_BASE}/player_r.png`),
      loadImage(`${ASSET_BASE}/cake.png`),
      loadImage(`${ASSET_BASE}/cake_gold.png`),
      loadImage(`${ASSET_BASE}/bomb.png`),
    ]);

    assets.bg = bg;
    assets.player.l = playerL;
    assets.player.m = playerM;
    assets.player.r = playerR;
    assets.cake = cake;
    assets.cakeGold = cakeGold;
    assets.bomb = bomb;
    assets.loaded = true;
  } catch (e) {
    assets.error = e;
    // Keep the game playable with fallback shapes.
    console.warn(String(e));
  }
}

// Game tuning
const LANES = 3; // left, middle, right
const BASE_FALL_SPEED = 260; // px/sec
const BASE_SPAWN_MS = 900;
const GOLD_CHANCE = 0.08;
const BOMB_START_SCORE = 150;
const BOMB_CHANCE_AT_START = 0.10;
const BOMB_CHANCE_AT_500 = 0.22;

function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

function nowMs() { return performance.now(); }

function rand() { return Math.random(); }
function pickLane() { return Math.floor(rand() * LANES); }

function bombChance(score) {
  if (score < BOMB_START_SCORE) return 0;
  const t = clamp((score - BOMB_START_SCORE) / (500 - BOMB_START_SCORE), 0, 1);
  return BOMB_CHANCE_AT_START + (BOMB_CHANCE_AT_500 - BOMB_CHANCE_AT_START) * t;
}

function showOverlay({ title, body, buttons }) {
  overlayTitleEl.textContent = title;
  overlayBodyEl.innerHTML = body;
  overlayButtonsEl.innerHTML = "";
  for (const b of buttons) {
    const btn = document.createElement("button");
    btn.className = `btn ${b.kind || ""}`.trim();
    btn.textContent = b.text;
    btn.onclick = b.onClick;
    overlayButtonsEl.appendChild(btn);
  }
  overlayEl.classList.remove("hidden");
}

function hideOverlay() {
  overlayEl.classList.add("hidden");
}

function setRoute(route) {
  window.location.hash = route;
}

function getRoute() {
  const h = window.location.hash || "#/home";
  if (h.startsWith("#/leaders")) return "leaders";
  if (h.startsWith("#/game")) return "game";
  return "home";
}

let game = null;

function setClosingConfirmation(enabled) {
  if (!tg) return;
  if (enabled) {
    if (typeof tg.enableClosingConfirmation === "function") tg.enableClosingConfirmation();
  } else {
    if (typeof tg.disableClosingConfirmation === "function") tg.disableClosingConfirmation();
  }
}

// Extra guard: while playing, prevent vertical touch scrolling/overscroll anywhere in the app.
// This reduces chances of triggering WebView collapse/close gestures.
document.addEventListener("touchmove", (e) => {
  if (game && game.state === "playing") e.preventDefault();
}, { passive: false });

function renderFrame() {
  const W = canvas.width;
  const H = canvas.height;

  // background
  ctx.clearRect(0, 0, W, H);
  if (assets.bg) {
    drawImageCover(ctx, assets.bg, 0, 0, W, H);
    ctx.fillStyle = "rgba(2, 6, 23, 0.25)"; // slight darken for contrast
    ctx.fillRect(0, 0, W, H);
  } else {
    ctx.fillStyle = "rgba(2, 6, 23, 0.65)";
    ctx.fillRect(0, 0, W, H);
  }

  // lane guides
  const laneW = W / LANES;
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 2;
  for (let i = 1; i < LANES; i++) {
    ctx.beginPath();
    ctx.moveTo(i * laneW, 0);
    ctx.lineTo(i * laneW, H);
    ctx.stroke();
  }

  if (!game) return;

  // draw sizes (canvas pixels)
  const ITEM_W = 48;
  const ITEM_H = 48;
  const BOMB_W = 52;
  const BOMB_H = 52;
  const PLAYER_W = 120;
  const PLAYER_H = 120;

  // objects
  for (const o of game.objects) {
    const x = o.lane * laneW + laneW / 2;
    const y = o.y;
    if (o.type === "egg") {
      if (assets.cake) {
        drawImageCentered(ctx, assets.cake, x, y, ITEM_W, ITEM_H);
      } else {
        ctx.fillStyle = "rgba(248,250,252,0.95)";
        ctx.beginPath();
        ctx.ellipse(x, y, 14, 18, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (o.type === "gold") {
      if (assets.cakeGold) {
        drawImageCentered(ctx, assets.cakeGold, x, y, ITEM_W, ITEM_H);
      } else {
        ctx.fillStyle = "rgba(250, 204, 21, 0.95)";
        ctx.beginPath();
        ctx.ellipse(x, y, 14, 18, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.25)";
        ctx.stroke();
      }
    } else if (o.type === "bomb") {
      if (assets.bomb) {
        drawImageCentered(ctx, assets.bomb, x, y, BOMB_W, BOMB_H);
      } else {
        ctx.fillStyle = "rgba(239, 68, 68, 0.95)";
        ctx.beginPath();
        ctx.arc(x, y, 16, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.beginPath();
        ctx.arc(x + 5, y - 4, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // catcher (wolf basket)
  const basketLane = game.lane;
  const bx = basketLane * laneW + laneW / 2;
  const playerBottomMargin = 18;
  const py = H - playerBottomMargin - PLAYER_H / 2;

  const poseKey = basketLane === 0 ? "l" : (basketLane === 1 ? "m" : "r");
  const playerImg = assets.player[poseKey];

  if (playerImg) {
    drawImageCentered(ctx, playerImg, bx, py, PLAYER_W, PLAYER_H);
  } else {
    const by = H - 70;
    ctx.fillStyle = "rgba(34,197,94,0.95)";
    ctx.fillRect(bx - 38, by - 10, 76, 20);
    ctx.fillStyle = "rgba(226,232,240,0.75)";
    ctx.font = "12px system-ui";
    ctx.fillText(["L", "M", "R"][basketLane], bx - 4, by - 18);
  }
}

function startGame() {
  hideOverlay();
  game = {
    startedAt: nowMs(),
    lastTickAt: nowMs(),
    lastSpawnAt: nowMs(),
    objects: [],
    lane: 1,
    score: 0,
    speedMult: 1,
    eggsCaught: 0,
    state: "playing",
  };
  scoreEl.textContent = "0";
  statusEl.textContent = "Свайп влево/вправо";
  setRoute("#/game");

  // Make accidental close/swipe-down non-destructive: Telegram will show a confirmation dialog.
  setClosingConfirmation(true);
}

function endGame(reason) {
  if (!game || game.state !== "playing") return;
  game.state = "over";
  statusEl.textContent = "Ты проиграл(";

  const finalScore = game.score;
  const duration = Math.floor(nowMs() - game.startedAt);

  const inTelegram = tg && tg.initData && tg.initData.length > 0;

  const body = `
    <div><b>Очки:</b> ${finalScore}</div>
    <div class="small" style="margin-top:6px;">${reason}</div>
    <div class="small" style="margin-top:6px; opacity:.85;">
      ${inTelegram ? "Результат отправляется..." : "Запуск вне Telegram: отправка результатов отключена."}
    </div>
  `;

  showOverlay({
    title: "Ты проиграл(",
    body,
    buttons: [
      { text: "Играть снова", kind: "primary", onClick: () => startGame() },
      { text: "Таблица лидеров", onClick: () => openLeaders() },
    ],
  });

  if (inTelegram) {
    submitScore(finalScore, duration).catch((e) => {
      overlayBodyEl.innerHTML += `<div class="small" style="margin-top:8px; color: rgba(239,68,68,0.9);">Ошибка отправки: ${escapeHtml(String(e))}</div>`;
    });
  }

  // After game over, allow closing without extra confirmation.
  setClosingConfirmation(false);
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function spawnObject() {
  if (!game) return;
  const lane = pickLane();
  const score = game.score;

  const bChance = bombChance(score);
  const roll = rand();

  let type = "egg";
  if (roll < bChance) type = "bomb";
  else if (roll < bChance + GOLD_CHANCE) type = "gold";

  game.objects.push({
    id: Math.random().toString(16).slice(2),
    lane,
    y: -20,
    type,
  });
}

function tick() {
  requestAnimationFrame(tick);

  if (!game || game.state !== "playing") {
    renderFrame();
    return;
  }

  const t = nowMs();
  const dt = (t - game.lastTickAt) / 1000;
  game.lastTickAt = t;

  // spawn cadence slightly increases with speed multiplier
  const spawnMs = clamp(BASE_SPAWN_MS / Math.sqrt(game.speedMult), 420, 1200);
  if (t - game.lastSpawnAt >= spawnMs) {
    game.lastSpawnAt = t;
    spawnObject();
  }

  const fallSpeed = BASE_FALL_SPEED * game.speedMult;
  const H = canvas.height;
  // Catch line: tuned to match player sprite placement (hands/basket area).
  const catchY = H - 86;

  // move + collisions
  const remaining = [];
  for (const o of game.objects) {
    o.y += fallSpeed * dt;
    const isCatchLane = o.lane === game.lane;
    const isCatch = isCatchLane && o.y >= catchY && o.y <= catchY + 18;

    if (isCatch) {
      if (o.type === "bomb") {
        endGame("Ты поймал бомбу.");
        return;
      }

      // eggs
      const add = (o.type === "gold") ? 50 : 10;
      game.score += add;
      game.eggsCaught += 1;
      scoreEl.textContent = String(game.score);

      // speed rule: starts from 50 points, then x1.01 for each caught egg
      if (game.score >= 50) {
        game.speedMult *= 1.01;
      }
      continue;
    }

    // miss condition: any egg reaching bottom uncaught ends the game
    if ((o.type === "egg" || o.type === "gold") && o.y >= H + 20) {
      endGame("Ты пропустил кекс.");
      return;
    }

    // bombs can just disappear
    if (o.type === "bomb" && o.y >= H + 40) {
      continue;
    }

    remaining.push(o);
  }
  game.objects = remaining;

  statusEl.textContent = `Скорость x${game.speedMult.toFixed(2)} • Бомбы ${game.score >= BOMB_START_SCORE ? "включены" : "выкл"}`;
  renderFrame();
}

async function submitScore(score, duration_ms) {
  const res = await fetch("/api/score/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      initData: tg.initData,
      score,
      duration_ms,
      client_version: "webapp-0.1",
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`HTTP ${res.status}: ${t}`);
  }
  const data = await res.json();
  overlayBodyEl.innerHTML += `<div class="small" style="margin-top:8px;">Лучший: all=${data.best_all}, week=${data.best_week}, month=${data.best_month}</div>`;
  return data;
}

async function loadLeaders(period) {
  const res = await fetch(`/api/leaderboard?period=${encodeURIComponent(period)}&limit=50`);
  if (!res.ok) throw new Error(`leaderboard HTTP ${res.status}`);
  return await res.json();
}

function renderLeaders(items) {
  if (!items.length) return `<div class="small">Пока нет результатов.</div>`;
  const lines = items.map((it, idx) => {
    const name = it.username ? `@${it.username}` : (it.first_name || String(it.telegram_user_id));
    return `<div class="small"><b>#${idx + 1}</b> ${escapeHtml(name)} — <b>${it.score}</b></div>`;
  });
  return lines.join("");
}

function openLeaders() {
  setRoute("#/leaders");
  showLeadersOverlay();
}

async function showLeadersOverlay() {
  const tabs = [
    { key: "week", label: "Неделя" },
    { key: "month", label: "Месяц" },
    { key: "all", label: "Всё время" },
  ];

  const setTab = async (k) => {
    overlayBodyEl.innerHTML = `<div class="small">Загрузка...</div>`;
    try {
      const data = await loadLeaders(k);
      overlayBodyEl.innerHTML = `
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:10px;">
          ${tabs.map(t => `<span class="btn small ${t.key === k ? "primary" : ""}" data-tab="${t.key}">${t.label}</span>`).join("")}
        </div>
        ${renderLeaders(data.items || [])}
      `;
      overlayBodyEl.querySelectorAll("[data-tab]").forEach((el) => {
        el.onclick = () => setTab(el.getAttribute("data-tab"));
      });
    } catch (e) {
      overlayBodyEl.innerHTML = `<div class="small" style="color: rgba(239,68,68,0.9);">Ошибка: ${escapeHtml(String(e))}</div>`;
    }
  };

  showOverlay({
    title: "Таблица лидеров",
    body: `<div class="small">Загрузка...</div>`,
    buttons: [
      { text: "Играть", kind: "primary", onClick: () => startGame() },
      { text: "Закрыть", onClick: () => { hideOverlay(); setRoute("#/home"); } },
    ],
  });

  await setTab("week");
}

function showHome() {
  statusEl.textContent = "Готово";
  showOverlay({
    title: "Лови кексы!",
    body: `
      <div class="small">
        - 3 дорожки: left/middle/right<br/>
        - Свайпы влево/вправо — движение<br/>
        - Шоколадный кекс: <b>+10</b>, золотой: <b>+50</b> очков<br/>
        - Пропуск кекса - <b>конец игры</b><br/>
        - После <b>50</b> очков - скорость начинает расти на <b>x1.01</b> за каждый пойманный кекс<br/>
        - Бомбы появляются после <b>${BOMB_START_SCORE}</b> очков (поймал - конец игры)<br/>
        <br/>
        Удачи &lt;3
      </div>
    `,
    buttons: [
      { text: "Играть", kind: "primary", onClick: () => startGame() },
      { text: "Таблица лидеров", onClick: () => openLeaders() },
    ],
  });
}

// Input (swipes)
let touchStartX = null;
let touchStartY = null;

function onSwipe(dx, dy) {
  if (!game || game.state !== "playing") return;
  if (Math.abs(dx) < 24 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
  if (dx > 0) game.lane = clamp(game.lane + 1, 0, LANES - 1);
  else game.lane = clamp(game.lane - 1, 0, LANES - 1);
}

canvas.addEventListener("touchstart", (e) => {
  const t = e.changedTouches[0];
  touchStartX = t.clientX;
  touchStartY = t.clientY;
}, { passive: true });

// Block vertical touch scrolling/overscroll while playing, so an accidental swipe-down
// doesn't start collapsing the WebView.
canvas.addEventListener("touchmove", (e) => {
  if (!game || game.state !== "playing") return;
  e.preventDefault();
}, { passive: false });

canvas.addEventListener("touchend", (e) => {
  const t = e.changedTouches[0];
  const dx = t.clientX - touchStartX;
  const dy = t.clientY - touchStartY;
  onSwipe(dx, dy);
  touchStartX = null;
  touchStartY = null;
}, { passive: true });

// fallback for desktop
window.addEventListener("keydown", (e) => {
  if (!game || game.state !== "playing") return;
  if (e.key === "ArrowLeft") game.lane = clamp(game.lane - 1, 0, LANES - 1);
  if (e.key === "ArrowRight") game.lane = clamp(game.lane + 1, 0, LANES - 1);
});

function onRoute() {
  const r = getRoute();
  if (r === "leaders") {
    showLeadersOverlay();
    return;
  }
  if (r === "game") {
    if (!game || game.state !== "playing") startGame();
    return;
  }
  showHome();
}

window.addEventListener("hashchange", onRoute);

tick();
onRoute();

// start preloading images (non-blocking)
loadAssets();

// Start background music (best-effort).
tryStartBgm();
bindBgmUnlockOnce();


