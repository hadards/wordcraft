/* WordCraft engine — vanilla JS, no build, no backend. */
"use strict";

// ---------- state ----------
const SAVE_KEY = "wordcraft-save";
const defaultState = () => ({
  coins: 0,
  xp: 0,
  level: 1,
  muted: false,
  words: {},                 // word -> {c: correct, w: wrong}
  zones: {},                 // zoneId -> {stars: [], boss: false}
  gear: { owned: [], hat: null, eyes: null, hand: null },
  brainrots: [],           // collected brainrot ids/names
  voiceName: null,         // preferred TTS voice
  seenHints: {},             // mechanic -> true once answered
});
let S = defaultState();
try { S = Object.assign(defaultState(), JSON.parse(localStorage.getItem(SAVE_KEY)) || {}); } catch (e) {}
const save = () => localStorage.setItem(SAVE_KEY, JSON.stringify(S));

const $ = (id) => document.getElementById(id);
const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const chunk = (a, n) => { const out = []; for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n)); return out; };
const wordStat = (w) => S.words[w] || { c: 0, w: 0 };
const zoneState = (id) => S.zones[id] || (S.zones[id] = { stars: [], boss: false });

const XP_PER_LEVEL = 50;

// ---------- audio: TTS + synthesized SFX ----------
let voice = null;
const enVoices = () => speechSynthesis.getVoices().filter((v) => v.lang.startsWith("en"));
function pickVoice() {
  const vs = enVoices();
  voice = (S.voiceName && vs.find((v) => v.name === S.voiceName))
    || vs.find((v) => /natural/i.test(v.name))
    || vs.find((v) => /google us/i.test(v.name))
    || vs.find((v) => v.lang === "en-US") || vs[0] || null;
}
if ("speechSynthesis" in window) {
  pickVoice();
  speechSynthesis.onvoiceschanged = pickVoice;
}
function speak(text, { rate = 0.85, onend } = {}) {
  if (S.muted || !("speechSynthesis" in window)) { if (onend) setTimeout(onend, 600); return; }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  if (voice) u.voice = voice;
  u.lang = "en-US";
  u.rate = rate;
  const mascots = document.querySelectorAll(".mascot");
  mascots.forEach((m) => m.classList.add("talking"));
  u.onend = u.onerror = () => {
    mascots.forEach((m) => m.classList.remove("talking"));
    if (onend) onend();
  };
  speechSynthesis.speak(u);
}

let AC = null;
const audioCtx = () => (AC = AC || new (window.AudioContext || window.webkitAudioContext)());
function tone(freq, start, dur, type = "square", vol = 0.12) {
  if (S.muted) return;
  const ctx = audioCtx();
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(vol, ctx.currentTime + start);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
  o.connect(g).connect(ctx.destination);
  o.start(ctx.currentTime + start); o.stop(ctx.currentTime + start + dur);
}
function noise(start, dur, vol = 0.2) {
  if (S.muted) return;
  const ctx = audioCtx();
  const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource(); src.buffer = buf;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, ctx.currentTime + start);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
  src.connect(g).connect(ctx.destination);
  src.start(ctx.currentTime + start);
}
const sfx = {
  pop: () => tone(600, 0, 0.08, "sine", 0.15),
  dig: () => { noise(0, 0.07, 0.18); tone(180, 0, 0.06, "square", 0.06); },
  correct: () => { tone(523, 0, 0.12); tone(659, 0.1, 0.12); tone(784, 0.2, 0.2); },
  wrong: () => { tone(300, 0, 0.15, "sawtooth", 0.08); tone(240, 0.13, 0.25, "sawtooth", 0.08); },
  coin: () => { tone(988, 0, 0.07, "square", 0.1); tone(1319, 0.07, 0.18, "square", 0.1); },
  crack: () => noise(0, 0.18, 0.25),
  crowd: () => { noise(0, 1.1, 0.15); tone(880, 0, 0.4, "sine", 0.05); },
  fanfare: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.14, 0.22)); },
  hit: () => { noise(0, 0.12, 0.3); tone(150, 0, 0.2, "sawtooth", 0.15); },
  boing: () => {
    if (S.muted) return;
    const ctx = audioCtx();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "square";
    o.frequency.setValueAtTime(160, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(650, ctx.currentTime + 0.22);
    g.gain.setValueAtTime(0.1, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28);
    o.connect(g).connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + 0.3);
  },
};

// ---------- screens & HUD ----------
const screens = ["screen-title", "screen-map", "screen-game", "screen-shop"];
function show(id) {
  screens.forEach((s) => $(s).classList.toggle("hidden", s !== id));
  $("hud").classList.toggle("hidden", id === "screen-title");
  if (id !== "screen-game") document.body.className = "";
}
function avatarHTML() {
  const gear = (slot) => {
    const g = GEAR.find((x) => x.id === S.gear[slot]);
    return g ? `<span class="avatar-gear ${slot}">${g.emoji}</span>` : "";
  };
  return `<span class="av"><span class="avatar-base">😃</span>${gear("hat")}${gear("eyes")}${gear("hand")}</span>`;
}
function renderHUD() {
  $("hud-coin-count").textContent = S.coins;
  $("hud-level").textContent = S.level;
  $("hud-xp-fill").style.width = `${((S.xp % XP_PER_LEVEL) / XP_PER_LEVEL) * 100}%`;
  $("hud-avatar").innerHTML = avatarHTML();
  $("hud-sound").textContent = S.muted ? "🔇" : "🔊";
}

// ---------- rewards & effects ----------
function flyCoin(fromEl, n = 1) {
  const from = fromEl.getBoundingClientRect();
  const to = $("hud-coins").getBoundingClientRect();
  for (let i = 0; i < n; i++) {
    const c = document.createElement("div");
    c.className = "fly-coin";
    c.textContent = "🪙";
    c.style.left = `${from.left + from.width / 2}px`;
    c.style.top = `${from.top + from.height / 2}px`;
    document.body.appendChild(c);
    requestAnimationFrame(() => {
      c.style.transform = `translate(${to.left - from.left + i * 6}px, ${to.top - from.top}px) scale(.5)`;
      c.style.opacity = "0";
    });
    setTimeout(() => c.remove(), 750);
  }
  setTimeout(() => {
    sfx.coin();
    $("hud-coins").classList.remove("bump");
    void $("hud-coins").offsetWidth;
    $("hud-coins").classList.add("bump");
  }, 650);
}
function starBurst(el) {
  const r = el.getBoundingClientRect();
  for (let i = 0; i < 6; i++) {
    const s = document.createElement("div");
    s.className = "star-burst";
    s.textContent = "⭐";
    s.style.left = `${r.left + r.width / 2}px`;
    s.style.top = `${r.top + r.height / 2}px`;
    const ang = (i / 6) * Math.PI * 2;
    s.style.setProperty("--cx", `${Math.cos(ang) * 90}px`);
    s.style.setProperty("--cy", `${Math.sin(ang) * 90 - 40}px`);
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 750);
  }
}
function confetti() {
  const colors = ["#ffc93c", "#ff4fa3", "#6bc531", "#3fa9ff", "#fff"];
  for (let i = 0; i < 28; i++) {
    const c = document.createElement("div");
    c.className = "confetti-bit";
    c.style.background = colors[i % colors.length];
    c.style.left = `${Math.random() * 100}vw`;
    c.style.top = "-20px";
    c.style.setProperty("--cx", `${(Math.random() - 0.5) * 200}px`);
    c.style.setProperty("--cy", `${60 + Math.random() * 40}vh`);
    c.style.animationDelay = `${Math.random() * 0.4}s`;
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 2000);
  }
}
function celebrate(html, ms, onDone) {
  const el = $("celebrate");
  el.innerHTML = html;
  el.classList.remove("hidden");
  confetti();
  setTimeout(() => { el.classList.add("hidden"); if (onDone) onDone(); }, ms);
}
// draw n unowned brainrots for a pack, common-weighted so legendaries stay rare pulls
function drawPack(n) {
  const pool = BRAINROTS.filter((b) => !S.brainrots.includes(b.name));
  const weight = { common: 10, rare: 5, epic: 2, legendary: 1 };
  const picks = [];
  for (let i = 0; i < n && pool.length; i++) {
    const bag = [];
    pool.forEach((b) => { for (let w = 0; w < (weight[b.rarity] || 1); w++) bag.push(b); });
    const chosen = bag[Math.floor(Math.random() * bag.length)];
    picks.push(chosen);
    pool.splice(pool.indexOf(chosen), 1);
  }
  return picks;
}

// pack-opening moment: several cards fan out and reveal one at a time
function revealPack(cards, onDone) {
  if (!cards.length) return onDone && onDone();
  cards.forEach((c) => S.brainrots.push(c.name));
  save();
  const el = $("celebrate");
  el.innerHTML = `<div class="pack-fan">${cards.map((br) => `
    <div class="pack-fan-card rarity-${br.rarity}">
      <div class="pack-card">
        <div class="tcard-art">${brainrotArt(br, "tcard-img")}</div>
        <div class="tcard-rarity-tag">${RARITY_INFO[br.rarity].label}</div>
        <div class="tcard-name">${br.name}</div>
      </div>
    </div>`).join("")}</div>
    <div class="celebrate-text">${cards.length > 1 ? "NEW CARDS!" : "NEW CARD!"}</div>`;
  el.classList.remove("hidden");
  sfx.fanfare();
  confetti();
  speak(cards.length > 1 ? "New cards!" : `You got ${cards[0].name}!`);
  setTimeout(() => { el.classList.add("hidden"); if (onDone) onDone(); }, 1600 + cards.length * 700);
}

// pack-opening moment: card flies in, spins, settles — rarity-colored burst
function revealNewCard(br, rarity, onDone) {
  const el = $("celebrate");
  el.innerHTML = `
    <div class="pack-reveal rarity-${rarity}">
      <div class="pack-burst"></div>
      <div class="pack-card">
        <div class="tcard-art">${brainrotArt(br, "tcard-img")}</div>
        <div class="tcard-rarity-tag">${RARITY_INFO[rarity].label}</div>
        <div class="tcard-name">${br.name}</div>
      </div>
    </div>
    <div class="celebrate-text">${br.name.toUpperCase()}!</div>`;
  el.classList.remove("hidden");
  sfx.fanfare();
  confetti();
  speak(`You got ${br.name}!`);
  setTimeout(() => { el.classList.add("hidden"); if (onDone) onDone(); }, 2600);
}
function reward(el, { coins = 2, xp = 5 } = {}) {
  if (session && session.streak >= 3) coins *= 2;
  S.coins += coins;
  S.xp += xp;
  const newLevel = Math.floor(S.xp / XP_PER_LEVEL) + 1;
  flyCoin(el, Math.min(coins, 4));
  starBurst(el);
  sfx.correct();
  document.querySelectorAll(".mascot").forEach((m) => {
    m.classList.remove("happy"); void m.offsetWidth; m.classList.add("happy");
  });
  if (newLevel > S.level) {
    S.level = newLevel;
    S.coins += 25;
    setTimeout(() => {
      sfx.fanfare();
      celebrate(`<div class="celebrate-big">🎉</div><div class="celebrate-text">LEVEL ${S.level}!</div><div class="celebrate-text">+ 25 🪙</div>`, 2200);
      speak(`Level ${S.level}! Amazing!`);
    }, 800);
  }
  save();
  renderHUD();
}

// ---------- mining effects ----------
function swingPickaxe(x, y) {
  let p = $("pickaxe");
  if (!p) {
    p = document.createElement("div");
    p.id = "pickaxe";
    p.textContent = "⛏️";
    document.body.appendChild(p);
  }
  p.style.left = `${x + 6}px`;
  p.style.top = `${y - 44}px`;
  p.style.opacity = "1";
  p.classList.remove("swing");
  void p.offsetWidth;
  p.classList.add("swing");
  clearTimeout(p._hide);
  p._hide = setTimeout(() => { p.style.opacity = "0"; }, 400);
}
function debris(x, y) {
  const colors = ["#8b5a2b", "#6b421c", "#a9825a", "#4e2f12"];
  for (let i = 0; i < 8; i++) {
    const d = document.createElement("div");
    d.className = "debris-bit";
    d.style.background = colors[i % colors.length];
    d.style.left = `${x}px`;
    d.style.top = `${y}px`;
    d.style.setProperty("--cx", `${(Math.random() - 0.5) * 160}px`);
    d.style.setProperty("--cy", `${40 + Math.random() * 80}px`);
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 800);
  }
}
function flyItem(fromEl, toEl, emoji) {
  const from = fromEl.getBoundingClientRect();
  const to = toEl.getBoundingClientRect();
  const f = document.createElement("div");
  f.className = "fly-item";
  f.textContent = emoji;
  f.style.left = `${from.left + from.width / 2}px`;
  f.style.top = `${from.top + from.height / 2}px`;
  document.body.appendChild(f);
  requestAnimationFrame(() => {
    f.style.transform = `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(.4)`;
    f.style.opacity = "0";
  });
  setTimeout(() => f.remove(), 650);
}

// ---------- hint hand (English-only immersion: show, don't tell) ----------
let hintTimer = null;
function scheduleHint(mechanic, targetEl) {
  clearHint();
  if (S.seenHints[mechanic]) return;
  hintTimer = setTimeout(() => {
    const r = targetEl.getBoundingClientRect();
    const hand = $("hint-hand");
    hand.style.left = `${r.left + r.width / 2}px`;
    hand.style.top = `${r.top + r.height / 2}px`;
    hand.classList.remove("hidden");
  }, 3500);
}
function clearHint() {
  clearTimeout(hintTimer);
  $("hint-hand").classList.add("hidden");
}
function hintDone(mechanic) {
  clearHint();
  S.seenHints[mechanic] = true;
  save();
}

// ---------- world map ----------
const LEVEL_SIZE = 4;
const NODE_POS = [[26, 26], [71, 42], [27, 62], [68, 84]]; // 3 levels + boss, zigzag
// pixel kid sprite (yellow helmet, red sneakers) drawn as box-shadow art
const KID_ART = [
  "..YYYYYY..",
  ".YYYYYYYY.",
  ".YYYYYYYY.",
  ".yFFFFFFy.",
  ".yFEFFEFy.",
  ".yFFFFFFy.",
  "..FFMMFF..",
  "..BBBBBB..",
  ".BBBBBBBB.",
  ".bBBBBBBb.",
  "..PPPPPP..",
  "..PP..PP..",
  "..PP..PP..",
  ".SS....SS.",
];
const KID_COLORS = { Y: "#ffd23e", y: "#c98f12", F: "#ffc9a3", E: "#22304f", M: "#c0653a", B: "#3a7bf0", b: "#2c5cc0", P: "#2b3f72", S: "#e8402a" };
const KID_SHADOWS = KID_ART.flatMap((row, y) =>
  [...row].map((ch, x) => (KID_COLORS[ch] ? `${x * 4}px ${y * 4}px 0 0 ${KID_COLORS[ch]}` : null)).filter(Boolean)
).join(",");
const kidHTML = () => `<div class="pixel-kid"><i style="box-shadow:${KID_SHADOWS}"></i></div>`;
const MASCOT_HTML = `<div class="mascot-body as-kid">${kidHTML()}</div>`;
const DECOR = {
  meadow: [
    { e: "☀️", x: 6, y: 8, c: "d-sway", s: 3 },
    { e: "☁️", x: 0, y: 15, c: "d-drift", s: 2.6 },
    { e: "🦋", x: 55, y: 30, c: "d-float", s: 1.6 },
    { e: "🐝", x: 42, y: 50, c: "d-float", s: 1.3 },
    { e: "🌸", x: 8, y: 80, c: "d-sway", s: 1.8 },
    { e: "🌻", x: 88, y: 54, c: "d-sway", s: 2 },
  ],
  biome: [
    { e: "🦇", x: 0, y: 12, c: "d-drift", s: 1.7 },
    { e: "💎", x: 8, y: 32, c: "d-sparkle", s: 1.7 },
    { e: "🪙", x: 86, y: 22, c: "d-sparkle", s: 1.5 },
    { e: "✨", x: 48, y: 14, c: "d-sparkle", s: 1.4 },
    { e: "⛏️", x: 6, y: 58, c: "d-sway", s: 1.8 },
    { e: "🪨", x: 88, y: 68, c: "d-sway", s: 2 },
  ],
  stadium: [
    { b: "beam left" },
    { b: "beam right" },
    { e: "⚽", x: 88, y: 14, c: "d-float", s: 1.8 },
    { e: "🚩", x: 6, y: 38, c: "d-sway", s: 1.8 },
    { e: "🏆", x: 87, y: 74, c: "d-sparkle", s: 1.9 },
  ],
  ocean: [
    { e: "🐠", x: 8, y: 20, c: "d-swim", s: 1.8 },
    { e: "🐟", x: 30, y: 48, c: "d-swim", s: 1.5 },
    { e: "🪼", x: 82, y: 30, c: "d-float", s: 1.8 },
    { e: "🫧", x: 70, y: 72, c: "d-bubble", s: 1.5 },
    { e: "🫧", x: 20, y: 84, c: "d-bubble", s: 1.1 },
    { e: "🌿", x: 90, y: 88, c: "d-sway", s: 2.2 },
    { e: "🦀", x: 8, y: 90, c: "d-sway", s: 1.7 },
  ],
  arcade: [
    { e: "👾", x: 10, y: 22, c: "d-float", s: 2 },
    { e: "🕹️", x: 86, y: 38, c: "d-sway", s: 1.9 },
    { e: "🌟", x: 50, y: 13, c: "d-sparkle", s: 1.6 },
    { e: "🎲", x: 8, y: 66, c: "d-float", s: 1.7 },
    { e: "✨", x: 90, y: 78, c: "d-sparkle", s: 1.4 },
  ],
  brainrot: [
    { e: "🧠", x: 8, y: 14, c: "d-float", s: 2.2 },
    { e: "🦈👟", x: 0, y: 34, c: "d-drift", s: 1.6 },
    { e: "🍌", x: 88, y: 24, c: "d-sway", s: 1.8 },
    { e: "🛞", x: 8, y: 60, c: "d-float", s: 1.7 },
    { e: "🪐", x: 88, y: 52, c: "d-float", s: 1.9 },
    { e: "✨", x: 48, y: 12, c: "d-sparkle", s: 1.5 },
    { e: "🐊✈️", x: 30, y: 44, c: "d-drift", s: 1.5 },
  ],
};

function zoneUnlocked(i) { return i === 0 || zoneState(ZONES[i - 1].id).boss; }

// ---------- overworld walking: real continuous movement, Keen-style ----------
// The kid walks freely along the zigzag path with arrow keys / A-D / the
// on-screen D-pad — his position tracks progress along the whole route
// (not just x), so he visibly walks uphill/downhill between nodes rather
// than teleporting. Reaching a node's spot auto-enters it. No jump/gravity —
// this is the overworld walk, not a platformer physics sim.
const walker = { t: 0, dir: 1, moving: 0, route: [], nodeBtns: [], raf: null, entering: false, inner: null };

function buildRoute(nodeEls) {
  // route = every node's [x,y] in path order; t is a float index into this array
  return nodeEls.map((n) => [parseFloat(n.parentElement.style.left), parseFloat(n.parentElement.style.top)]);
}

function setupWalker(scrollWrap) {
  clearInterval(walker.raf);
  walker.entering = false;
  const zones = [...scrollWrap.querySelectorAll(".zone:not(.locked)")];
  const zoneEl = zones[zones.length - 1] || null;
  if (!zoneEl) return;
  walker.inner = zoneEl.querySelector(".zone-inner");
  walker.nodeBtns = [...zoneEl.querySelectorAll(".map-node:not(.locked-node)")];
  walker.route = buildRoute(walker.nodeBtns);
  const doneCount = walker.nodeBtns.filter((n) => n.classList.contains("done")).length;
  walker.t = Math.min(doneCount, walker.route.length - 1);
  renderKidAtT();
  scrollWrap.scrollTop = zoneEl.offsetTop - 80;
  tick();
}

function posAtT(t) {
  const r = walker.route;
  if (!r.length) return [50, 50];
  const i = Math.max(0, Math.min(r.length - 1, Math.floor(t)));
  const frac = t - i;
  const a = r[i], b = r[Math.min(i + 1, r.length - 1)];
  return [a[0] + (b[0] - a[0]) * frac, a[1] + (b[1] - a[1]) * frac];
}

function renderKidAtT() {
  const kid = $("map-kid");
  if (!kid || !walker.inner) return;
  const [x, y] = posAtT(walker.t);
  kid.style.left = `${x}%`;
  kid.style.top = `${y - 9}%`;
  kid.classList.toggle("facing-left", walker.dir < 0);
}

const TICK_MS = 30;
const WALK_SPEED = 0.03; // route-steps per tick
function tick() {
  walker.raf = setInterval(tickStep, TICK_MS);
}
function tickStep() {
  if (walker.entering || !walker.moving || !walker.route.length) return;
  walker.dir = walker.moving;
  walker.t = Math.max(0, Math.min(walker.route.length - 1, walker.t + walker.moving * WALK_SPEED));
  renderKidAtT();
  const nearestI = Math.round(walker.t);
  if (Math.abs(walker.t - nearestI) < 0.03) {
    const btn = walker.nodeBtns[nearestI];
    if (btn && !btn.classList.contains("locked-node") && btn !== walker._lastEntered) {
      walker.entering = true;
      walker.moving = 0;
      walker._lastEntered = btn;
      sfx.boing();
      setTimeout(() => btn.click(), 220);
    }
  }
}

function setMove(dir) { walker.moving = dir; }
window.addEventListener("keydown", (e) => {
  if ($("screen-map").classList.contains("hidden")) return;
  if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") setMove(-1);
  if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") setMove(1);
});
window.addEventListener("keyup", (e) => {
  if (["ArrowLeft", "ArrowRight", "a", "A", "d", "D"].includes(e.key)) setMove(0);
});
// on-screen D-pad: press-and-hold, pointer capture so a drifting cursor/finger
// doesn't cancel the hold (mouseleave would fire during drag/scroll otherwise)
[[$("dpad-left"), -1], [$("dpad-right"), 1]].forEach(([btn, dir]) => {
  btn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    btn.setPointerCapture(e.pointerId);
    setMove(dir);
  });
  btn.addEventListener("pointerup", () => setMove(0));
  btn.addEventListener("pointercancel", () => setMove(0));
});

function pathThrough(pts) {
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [, y0] = pts[i - 1], [x1, y1] = pts[i];
    const my = (y0 + y1) / 2;
    d += ` C ${pts[i - 1][0]} ${my}, ${x1} ${my}, ${x1} ${y1}`;
  }
  return d;
}

function renderMap() {
  show("screen-map");
  renderHUD();
  const wrap = $("map-scroll");
  wrap.innerHTML = "";
  const world = document.createElement("div");
  world.id = "map-world";
  ZONES.forEach((zone, zi) => {
    const zs = zoneState(zone.id);
    const levels = chunk(zone.words, LEVEL_SIZE);
    const unlocked = zoneUnlocked(zi);
    const z = document.createElement("div");
    z.className = `zone zone-${zone.id}${unlocked ? "" : " locked"}`;
    const inner = document.createElement("div");
    inner.className = "zone-inner";
    inner.innerHTML = `<div class="zone-banner">${zone.icon} ${zone.name}</div>`;
    (DECOR[zone.id] || []).forEach((d) => {
      const el = document.createElement("div");
      if (d.b) { el.className = d.b; }
      else {
        el.className = `decor ${d.c}`;
        el.textContent = d.e;
        el.style.left = `${d.x}%`;
        el.style.top = `${d.y}%`;
        el.style.fontSize = `${d.s}rem`;
        el.style.animationDelay = `${(d.x + d.y) % 4}s`;
      }
      inner.appendChild(el);
    });
    const pts = NODE_POS.slice(0, levels.length + 1);
    inner.insertAdjacentHTML("beforeend",
      `<svg class="map-path" viewBox="0 0 100 100" preserveAspectRatio="none"><path d="${pathThrough(pts)}"/></svg>`);
    const addNode = (x, y, cls, html, onclick) => {
      const w = document.createElement("div");
      w.className = "node-wrap";
      w.style.left = `${x}%`;
      w.style.top = `${y}%`;
      const b = document.createElement("button");
      b.className = `map-node ${cls}`;
      b.innerHTML = html;
      b.onclick = () => onclick(b);
      w.appendChild(b);
      inner.appendChild(w);
      return b;
    };
    let nextFound = false;
    levels.forEach((words, li) => {
      const stars = zs.stars[li] || 0;
      const levelUnlocked = unlocked && (li === 0 || (zs.stars[li - 1] || 0) > 0);
      const isNext = levelUnlocked && stars === 0 && !nextFound;
      if (isNext) nextFound = true;
      addNode(pts[li][0], pts[li][1],
        `${stars ? "done" : ""}${isNext ? " next" : ""}${levelUnlocked ? "" : " locked-node"}`,
        `${levelUnlocked ? words[0].emoji : "🔒"}<span class="stars">${"⭐".repeat(stars)}</span>`,
        () => { sfx.pop(); startLevel(zone, li, words); });
    });
    const allDone = levels.every((_, li) => (zs.stars[li] || 0) > 0);
    const bossNext = unlocked && allDone && !zs.boss;
    const [bx, by] = pts[levels.length];
    addNode(bx, by,
      `boss-node ${zs.boss ? "done" : ""}${bossNext ? " next" : ""}${unlocked && allDone ? "" : " locked-node"}`,
      zs.boss ? "🏆" : unlocked && allDone ? brainrotArt(zone.boss, "node-boss-img") : "🔒",
      () => { sfx.pop(); startBoss(zone); });
    z.insertAdjacentHTML("beforeend", `<div class="terrain"></div>`);
    z.appendChild(inner);
    world.appendChild(z);
  });
  wrap.appendChild(world);
  // exactly one kid, placed in the zone holding the player's current position
  const homeZone = [...world.querySelectorAll(".zone:not(.locked)")].pop();
  if (homeZone) homeZone.querySelector(".zone-inner").insertAdjacentHTML("beforeend", `<div id="map-kid" class="mascot">${MASCOT_HTML}</div>`);
  setupWalker(wrap);
}

// ---------- session engine ----------
let session = null;

function startLevel(zone, levelIndex, words) {
  const sig = SIG[zone.id];
  const rounds = [];
  words.forEach((w) => {
    if (wordStat(w.word).c < 3) rounds.push({ type: "intro", word: w });
    rounds.push({ type: sig, word: w, mode: "listen" });
  });
  shuffle(words).forEach((w) => rounds.push({ type: sig, word: w, mode: "read" }));
  shuffle(words).slice(0, 2).forEach((w) => rounds.push({ type: "build", word: w }));
  rounds.push({ type: "echo", word: shuffle(words)[0] });
  session = { zone, levelIndex, rounds, i: 0, mistakes: 0, streak: 0, boss: false, requeued: {} };
  beginSession();
}

function startBoss(zone) {
  const sig = SIG[zone.id];
  const words = shuffle(zone.words.slice().sort((a, b) => (wordStat(a.word).c - wordStat(a.word).w) - (wordStat(b.word).c - wordStat(b.word).w)).slice(0, 8));
  const rounds = words.map((w, i) => (
    i % 3 === 2 ? { type: "build", word: w } : { type: sig, word: w, mode: i % 3 === 0 ? "listen" : "read" }
  ));
  session = { zone, rounds, i: 0, mistakes: 0, streak: 0, boss: true, bossHp: rounds.length, bossMax: rounds.length, requeued: {} };
  beginSession();
}

function beginSession() {
  clearInterval(walker.raf);
  walker.moving = 0;
  show("screen-game");
  document.body.className = `theme-${session.zone.id}`;
  renderHUD();
  nextRound();
}

function nextRound() {
  clearHint();
  const s = session;
  $("round-progress-fill").style.width = `${(s.i / s.rounds.length) * 100}%`;
  if (s.i >= s.rounds.length) return endSession();
  const round = s.rounds[s.i];
  const stage = $("stage");
  stage.innerHTML = "";
  stage.classList.toggle("on-fire", s.streak >= 3);
  if (s.boss) {
    const hearts = Array.from({ length: s.bossMax }, (_, i) => `<span class="${i < s.bossHp ? "" : "lost"}">❤️</span>`).join("");
    stage.innerHTML = `<div class="boss-emoji" id="boss-emoji">${brainrotArt(s.zone.boss)}</div><div class="boss-hp">${hearts}</div>`;
  }
  const area = document.createElement("div");
  area.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:22px;width:100%;";
  stage.appendChild(area);
  RENDER[round.type](round.word, area, round.mode || "listen");
}

// called by every mechanic on answer
function answered(round, ok, el) {
  const s = session;
  const st = S.words[round.word.word] || (S.words[round.word.word] = { c: 0, w: 0 });
  if (ok) {
    st.c++;
    s.streak++;
    hintDone(round.type);
    reward(el);
    if (s.boss) {
      s.bossHp--;
      const boss = $("boss-emoji");
      if (boss) { boss.classList.add("hit"); sfx.hit(); }
    }
    s.i++;
    const myI = s.i;
    setTimeout(() => { if (session === s && s.i === myI) nextRound(); }, 1100);
  } else {
    st.w++;
    s.streak = 0;
    s.mistakes++;
    sfx.wrong();
    // requeue this word+type once at the end (invisible spaced repetition)
    const key = round.type + (round.mode || "") + round.word.word;
    if (!s.requeued[key]) {
      s.requeued[key] = true;
      s.rounds.push({ type: round.type, word: round.word, mode: round.mode });
    }
  }
  save();
}

function endSession() {
  const s = session;
  const zs = zoneState(s.zone.id);
  if (s.boss) {
    if (s.bossHp > 0) {
      // skipped through the fight — boss survives, no steal
      celebrate(`<div class="celebrate-big">${brainrotArt(s.zone.boss, "celebrate-img")}</div><div class="celebrate-text">TRY AGAIN!</div>`, 2000, renderMap);
      speak("Almost! Try again!");
      session = null;
      return;
    }
    zs.boss = true;
    S.coins += 50;
    const alreadyOwned = S.brainrots.includes(s.zone.boss.name);
    if (!alreadyOwned) S.brainrots.push(s.zone.boss.name);
    save();
    if (alreadyOwned) {
      // replay: no new pack, just the coin payout
      sfx.fanfare();
      celebrate(`<div class="celebrate-big">${brainrotArt(s.zone.boss, "celebrate-img")}</div><div class="celebrate-text">YOU STOLE</div><div class="celebrate-text">${s.zone.boss.name.toUpperCase()}!</div><div class="celebrate-text">+ 50 🪙</div>`, 3600, renderMap);
      speak(`You got ${s.zone.boss.name}! Amazing!`);
    } else {
      // first-time boss win: the boss card itself, plus a 2-card bonus pack
      revealNewCard(s.zone.boss, s.zone.boss.rarity || "legendary", () => {
        const bonus = drawPack(2);
        revealPack(bonus, renderMap);
      });
    }
  } else {
    const stars = s.mistakes === 0 ? 3 : s.mistakes <= 2 ? 2 : 1;
    const firstClear = !zs.stars[s.levelIndex];
    zs.stars[s.levelIndex] = Math.max(zs.stars[s.levelIndex] || 0, stars);
    S.coins += stars * 5;
    save();
    sfx.fanfare();
    const starHTML = Array.from({ length: 3 }, (_, i) => `<span>${i < stars ? "⭐" : "☆"}</span>`).join("");
    celebrate(`<div class="celebrate-big">🎉</div><div class="celebrate-stars">${starHTML}</div><div class="celebrate-text">+ ${stars * 5} 🪙</div>`, 2800, () => {
      // first time clearing this level: open a card pack too, not just replays
      if (firstClear) revealPack(drawPack(3), renderMap);
      else renderMap();
    });
    speak(stars === 3 ? "Perfect! Three stars!" : "Great job!");
  }
  session = null;
}

// ---------- mechanics ----------
function speakBtn(word) {
  const b = document.createElement("button");
  b.className = "block-btn speak-btn";
  b.textContent = "🔊";
  b.onclick = () => { sfx.pop(); speak(word); };
  return b;
}
function distractors(word, zone, n) {
  return shuffle(zone.words.filter((w) => w.word !== word.word)).slice(0, n);
}
// listen mode: hear the word, find the picture. read mode: see the picture, find the written word.
function optionLabel(opt, mode) {
  return mode === "read" ? `<span class="word-tag">${opt.word.toUpperCase()}</span>` : `<span class="opt-emoji">${opt.emoji}</span>`;
}
function promptFor(word, mode, area) {
  if (mode === "read") area.insertAdjacentHTML("beforeend", `<div class="read-prompt">${word.emoji}</div>`);
  else area.appendChild(speakBtn(word.word));
  setTimeout(() => speak(word.word), 600);
}
// each zone plays its own signature game
const SIG = { meadow: "catch", biome: "mine", stadium: "kick", ocean: "fish", arcade: "zap", brainrot: "pogo" };

// bosses/brainrots render either an illustrated image or, if none is set, an emoji fallback
function brainrotArt(obj, cls = "") {
  if (obj.img) return `<img class="brainrot-img ${cls}" src="${obj.img}" alt="${obj.name}">`;
  return `<span class="${cls}">${obj.emoji || "❓"}</span>`;
}

const RENDER = {
  // hear it, see it — auto-advances (guarded so a skip mid-intro can't double-advance)
  intro(word, area) {
    const myI = session.i;
    area.innerHTML = `<div class="intro-card"><div class="big-emoji">${word.emoji}</div><div class="word-label">${word.word.toUpperCase()}</div></div>`;
    setTimeout(() => speak(word.word, {
      onend: () => setTimeout(() => speak(word.word, {
        onend: () => setTimeout(() => {
          if (session && session.i === myI) { session.i++; nextRound(); }
        }, 500),
      }), 400),
    }), 350);
  },

  // smash through a wall of blocks with the pickaxe,
  // find the hidden answer and grab it — it flies into the chest
  mine(word, area, mode) {
    const round = { type: "mine", word, mode };
    const options = [word, ...distractors(word, session.zone, 2)];
    const cellOrder = shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    const itemCells = cellOrder.slice(0, 3);
    const coinCell = cellOrder[3]; // one buried bonus coin makes digging itself pay off
    const wall = document.createElement("div");
    wall.className = "mine-wall";
    const chest = document.createElement("div");
    chest.className = "mine-chest";
    chest.textContent = "🧰";
    let done = false;
    let targetBehind = null;
    for (let i = 0; i < 9; i++) {
      const cell = document.createElement("div");
      cell.className = "mine-cell";
      const itemIdx = itemCells.indexOf(i);
      const opt = itemIdx >= 0 ? options[itemIdx] : null;
      const behind = document.createElement("div");
      behind.className = "behind";
      const face = document.createElement("div");
      face.className = "block-face";
      let hits = 0;
      face.onclick = (e) => {
        swingPickaxe(e.clientX, e.clientY);
        hits++;
        sfx.dig();
        if (hits === 1) face.classList.add("hit1");
        else {
          face.classList.remove("hit1");
          face.classList.add("hit2");
          setTimeout(() => {
            face.classList.add("smashed");
            sfx.crack();
            debris(e.clientX, e.clientY);
            if (opt) behind.innerHTML = `<span class="reveal-item">${optionLabel(opt, mode)}</span>`;
            else if (i === coinCell) {
              behind.innerHTML = `<span class="reveal-item">🪙</span>`;
              S.coins++;
              save();
              flyCoin(behind, 1);
              setTimeout(() => { behind.innerHTML = ""; renderHUD(); }, 500);
            }
          }, 100);
        }
      };
      behind.onclick = () => {
        if (done || !opt || !behind.querySelector(".reveal-item")) return;
        if (opt.word === word.word) {
          done = true;
          flyItem(behind, chest, opt.emoji);
          chest.classList.add("got");
          answered(round, true, behind);
        } else {
          behind.classList.remove("nope"); void behind.offsetWidth; behind.classList.add("nope");
          answered(round, false, behind);
          if (targetBehind && targetBehind.querySelector(".reveal-item")) targetBehind.classList.add("hint-glow");
          speak(word.word);
        }
      };
      if (opt && opt.word === word.word) targetBehind = behind;
      cell.appendChild(behind);
      cell.appendChild(face);
      wall.appendChild(cell);
    }
    promptFor(word, mode, area);
    area.appendChild(wall);
    area.appendChild(chest);
    scheduleHint("mine", [...wall.children][itemCells[0]]);
  },

  // shoot the ball at the right goal
  kick(word, area, mode) {
    const round = { type: "kick", word, mode };
    const options = shuffle([word, ...distractors(word, session.zone, 2)]);
    promptFor(word, mode, area);
    const goals = document.createElement("div");
    goals.className = "kick-goals";
    const ball = document.createElement("div");
    ball.id = "kick-ball";
    ball.textContent = "⚽";
    let done = false;
    options.forEach((opt) => {
      const g = document.createElement("div");
      g.className = "kick-goal";
      g.setAttribute("role", "button");
      g.setAttribute("tabindex", "0");
      g.innerHTML = `<div class="net"></div><div class="goal-word">${mode === "read" ? opt.word.toUpperCase() : opt.emoji}</div>`;
      const shoot = () => {
        if (done) return;
        const gr = g.getBoundingClientRect(), br = ball.getBoundingClientRect();
        ball.style.transform = `translate(${gr.left + gr.width / 2 - br.left - br.width / 2}px, ${gr.top - br.top}px) rotate(720deg) scale(.7)`;
        setTimeout(() => {
          if (opt.word === word.word) {
            done = true;
            g.classList.add("score");
            sfx.crowd();
            speak(`${word.word}! Goal!`);
            answered(round, true, g);
          } else {
            g.classList.add("nope");
            answered(round, false, g);
            setTimeout(() => { ball.style.transform = ""; g.classList.remove("nope"); }, 600);
            speak(word.word);
          }
        }, 480);
      };
      g.onclick = shoot;
      g.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") shoot(); };
      goals.appendChild(g);
    });
    area.appendChild(goals);
    area.appendChild(ball);
    const target = [...goals.children][options.findIndex((o) => o.word === word.word)];
    scheduleHint("kick", target);
  },

  // meadow: items fall from the sky — catch the right one in the basket
  catch(word, area, mode) {
    const round = { type: "catch", word, mode };
    const options = shuffle([word, ...distractors(word, session.zone, 2)]);
    const sky = document.createElement("div");
    sky.className = "catch-sky";
    const basket = document.createElement("div");
    basket.className = "mine-chest";
    basket.textContent = "🧺";
    let done = false;
    options.forEach((opt, i) => {
      const it = document.createElement("button");
      it.className = "fall-item";
      it.innerHTML = optionLabel(opt, mode);
      it.style.left = `${[12, 42, 72][i]}%`;
      it.style.animationDuration = `${4.5 + i * 1.4}s`;
      it.style.animationDelay = `${i * 1.5}s`;
      it.onclick = () => {
        if (done) return;
        if (opt.word === word.word) {
          done = true;
          it.style.animationPlayState = "paused";
          flyItem(it, basket, opt.emoji);
          it.style.visibility = "hidden";
          basket.classList.add("got");
          answered(round, true, basket);
        } else {
          const inner = it.firstElementChild;
          inner.classList.remove("nope"); void inner.offsetWidth; inner.classList.add("nope");
          answered(round, false, it);
          speak(word.word);
        }
      };
      sky.appendChild(it);
    });
    promptFor(word, mode, area);
    area.appendChild(sky);
    area.appendChild(basket);
  },

  // ocean: items swim across the sea — catch the right one in the bucket
  fish(word, area, mode) {
    const round = { type: "fish", word, mode };
    const options = shuffle([word, ...distractors(word, session.zone, 2)]);
    const sea = document.createElement("div");
    sea.className = "fish-sea";
    const bucket = document.createElement("div");
    bucket.className = "mine-chest";
    bucket.textContent = "🪣";
    for (let i = 0; i < 4; i++) {
      const b = document.createElement("div");
      b.className = "decor d-bubble";
      b.textContent = "🫧";
      b.style.left = `${10 + i * 24}%`;
      b.style.top = "92%";
      b.style.fontSize = "1.1rem";
      b.style.animationDelay = `${i * 1.7}s`;
      sea.appendChild(b);
    }
    let done = false;
    options.forEach((opt, i) => {
      const it = document.createElement("button");
      it.className = "swim-item";
      it.innerHTML = mode === "read"
        ? `<span class="word-tag">${opt.word.toUpperCase()}</span>`
        : `<span class="opt-emoji fish-flip">${opt.emoji}</span>`;
      it.style.top = `${12 + i * 28}%`;
      it.style.animationDuration = `${8 + i * 2.5}s`;
      it.style.animationDelay = `${-i * 3.5}s`;
      it.onclick = () => {
        if (done) return;
        if (opt.word === word.word) {
          done = true;
          it.style.animationPlayState = "paused";
          flyItem(it, bucket, opt.emoji);
          it.style.visibility = "hidden";
          bucket.classList.add("got");
          answered(round, true, bucket);
        } else {
          const inner = it.firstElementChild;
          inner.classList.remove("nope"); void inner.offsetWidth; inner.classList.add("nope");
          answered(round, false, it);
          speak(word.word);
        }
      };
      sea.appendChild(it);
    });
    promptFor(word, mode, area);
    area.appendChild(sea);
    area.appendChild(bucket);
  },

  // brainrot land: pogo-jump onto the platform holding the right answer (Keen style)
  pogo(word, area, mode) {
    const round = { type: "pogo", word, mode };
    const options = shuffle([word, ...distractors(word, session.zone, 2)]);
    const arena = document.createElement("div");
    arena.className = "pogo-arena";
    const kid = document.createElement("div");
    kid.className = "pogo-kid";
    kid.innerHTML = kidHTML();
    const spots = [[6, 14], [56, 36], [20, 60]];
    let done = false, busy = false, curX = 0, curY = 0;
    options.forEach((opt, i) => {
      const plat = document.createElement("button");
      plat.className = "platform";
      plat.innerHTML = optionLabel(opt, mode);
      plat.style.left = `${spots[i][0]}%`;
      plat.style.top = `${spots[i][1]}%`;
      plat.onclick = () => {
        if (done || busy) return;
        busy = true;
        // rects include the current transform, so deltas are relative to where the kid stands now
        const pr = plat.getBoundingClientRect(), kr = kid.getBoundingClientRect();
        const dx = curX + (pr.left + pr.width / 2 - (kr.left + kr.width / 2));
        const dy = curY + (pr.top - kr.bottom);
        sfx.boing();
        kid.animate([
          { transform: `translate(${curX}px, ${curY}px)` },
          { transform: `translate(${(curX + dx) / 2}px, ${Math.min(curY, dy) - 55}px)`, offset: 0.5 },
          { transform: `translate(${dx}px, ${dy}px)` },
        ], { duration: 550, easing: "ease-out", fill: "forwards" });
        setTimeout(() => {
          if (opt.word === word.word) {
            done = true;
            answered(round, true, plat);
          } else {
            const inner = plat.firstElementChild;
            inner.classList.remove("nope"); void inner.offsetWidth; inner.classList.add("nope");
            answered(round, false, plat);
            speak(word.word);
            // hop back down
            kid.animate([
              { transform: `translate(${dx}px, ${dy}px)` },
              { transform: `translate(${dx / 2}px, ${dy - 40}px)`, offset: 0.5 },
              { transform: "translate(0px, 0px)" },
            ], { duration: 500, easing: "ease-in", fill: "forwards" });
            curX = 0; curY = 0;
            setTimeout(() => { busy = false; }, 520);
            return;
          }
          curX = dx; curY = dy;
        }, 560);
      };
      arena.appendChild(plat);
    });
    arena.appendChild(kid);
    promptFor(word, mode, area);
    area.appendChild(arena);
  },

  // arcade: whack-a-word — answers pop out of neon holes, zap the right one while it's up
  zap(word, area, mode) {
    const round = { type: "zap", word, mode };
    const options = shuffle([word, ...distractors(word, session.zone, 2)]);
    const grid = document.createElement("div");
    grid.className = "zap-grid";
    const holes = [];
    for (let i = 0; i < 6; i++) {
      const h = document.createElement("div");
      h.className = "zap-hole";
      grid.appendChild(h);
      holes.push(h);
    }
    let done = false;
    const spots = shuffle(holes).slice(0, 3);
    options.forEach((opt, i) => {
      const it = document.createElement("button");
      it.className = "zap-item";
      it.innerHTML = optionLabel(opt, mode);
      it.style.animationDuration = "3.9s";
      it.style.animationDelay = `${i * 1.3}s`;
      it.onclick = () => {
        if (done || +getComputedStyle(it).opacity < 0.5) return;
        if (opt.word === word.word) {
          done = true;
          it.classList.add("zapped");
          const r = it.getBoundingClientRect();
          debris(r.left + r.width / 2, r.top + r.height / 2);
          answered(round, true, it);
        } else {
          const inner = it.firstElementChild;
          inner.classList.remove("nope"); void inner.offsetWidth; inner.classList.add("nope");
          answered(round, false, it);
          speak(word.word);
        }
      };
      spots[i].appendChild(it);
    });
    promptFor(word, mode, area);
    area.appendChild(grid);
  },

  // hear the word, tap letter blocks in order to spell it
  build(word, area) {
    const round = { type: "build", word };
    const letters = word.word.toUpperCase().split("");
    const slots = document.createElement("div");
    slots.className = "build-slots";
    letters.forEach(() => {
      const sl = document.createElement("div");
      sl.className = "build-slot";
      slots.appendChild(sl);
    });
    const pool = document.createElement("div");
    pool.className = "letter-pool";
    let idx = 0;
    shuffle(letters.map((ch, i) => ({ ch, i }))).forEach((t) => {
      const b = document.createElement("button");
      b.className = "letter-tile";
      b.textContent = t.ch;
      b.onclick = () => {
        if (b.classList.contains("used")) return;
        if (t.ch === letters[idx]) {
          b.classList.add("used");
          const sl = slots.children[idx];
          sl.textContent = t.ch;
          sl.classList.add("filled");
          sfx.pop();
          speak(t.ch, { rate: 0.9 });
          idx++;
          if (idx === letters.length) {
            hintDone("build");
            setTimeout(() => {
              speak(word.word + "!", { rate: 0.8 });
              addBuiltWord(word);
              answered(round, true, slots);
            }, 500);
          }
        } else {
          b.classList.remove("nope"); void b.offsetWidth; b.classList.add("nope");
          sfx.wrong();
          // gentle: wrong letters don't count as a round mistake, just wobble
        }
      };
      pool.appendChild(b);
    });
    area.appendChild(speakBtn(word.word));
    area.appendChild(document.createElement("div")).innerHTML = `<div style="font-size:3.4rem;line-height:1.1">${word.emoji}</div>`;
    area.appendChild(slots);
    area.appendChild(pool);
    area.appendChild(builtRow());
    setTimeout(() => speak(word.word), 600);
    const firstTile = [...pool.children].find((b) => b.textContent === letters[0]);
    scheduleHint("build", firstTile);
  },

  // hear it, say it back
  echo(word, area) {
    const round = { type: "echo", word };
    area.innerHTML = `<div style="font-size:4.5rem;line-height:1.1">${word.emoji}</div><div class="echo-word">${word.word.toUpperCase()}</div>`;
    const mic = document.createElement("button");
    mic.className = "block-btn mic-btn";
    mic.textContent = "🎤";
    let tries = 0;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const succeed = () => {
      hintDone("echo");
      mic.classList.remove("listening");
      speak("Yes! " + word.word + "!");
      answered(round, true, mic);
    };
    mic.onclick = () => {
      sfx.pop();
      mic.classList.add("listening");
      if (!SR) { // no mic support: he says it out loud, mascot cheers
        setTimeout(succeed, 2500);
        return;
      }
      const r = new SR();
      r.lang = "en-US";
      r.onresult = (e) => {
        const heard = e.results[0][0].transcript.toLowerCase();
        if (heard.includes(word.word) || ++tries >= 2) succeed();
        else { mic.classList.remove("listening"); sfx.wrong(); speak(word.word); }
      };
      r.onerror = r.onnomatch = () => { if (++tries >= 2) succeed(); else { mic.classList.remove("listening"); speak(word.word); } };
      try { r.start(); } catch (e) { setTimeout(succeed, 2500); }
    };
    area.appendChild(mic);
    setTimeout(() => speak(word.word), 500);
    scheduleHint("echo", mic);
  },
};

// words built this session stack up into a little wall
let builtWords = [];
function builtRow() {
  const div = document.createElement("div");
  div.className = "built-row";
  div.id = "built-row";
  div.innerHTML = builtWords.map((w) => `<span class="built-word">${w.emoji} ${w.word.toUpperCase()}</span>`).join("");
  return div;
}
function addBuiltWord(word) {
  builtWords.push(word);
  const row = $("built-row");
  if (row) row.innerHTML = builtWords.map((w) => `<span class="built-word">${w.emoji} ${w.word.toUpperCase()}</span>`).join("");
}

// ---------- shop & brainrot card collection ----------
function bossBrainrots() {
  return ZONES.map((z) => ({
    id: z.id + "-boss", name: z.boss.name, img: z.boss.img,
    rarity: z.boss.rarity || "legendary", stats: z.boss.stats, boss: true,
  }));
}
const STAT_ICONS = { speed: "⚡", silly: "😜", power: "💪" };

function renderShop() {
  show("screen-shop");
  renderHUD();
  $("shop-avatar").innerHTML = avatarHTML();
  const grid = $("shop-items");
  grid.innerHTML = "";

  // brainrot card collection: bosses are stolen by beating them, the rest are bought
  const all = [...bossBrainrots(), ...BRAINROTS];
  const ownedCount = all.filter((br) => S.brainrots.includes(br.name)).length;
  grid.insertAdjacentHTML("beforeend",
    `<div class="shop-title">🧠 BRAINROTS <span class="collect-count">${ownedCount} / ${all.length}</span></div>`);
  grid.insertAdjacentHTML("beforeend", '<div class="card-grid" id="card-grid"></div>');
  const cardGrid = $("card-grid");

  all.forEach((br) => {
    const owned = S.brainrots.includes(br.name);
    const canBuy = !br.boss && S.coins >= br.price;
    const rarity = br.rarity || "common";
    const wrap = document.createElement("div");
    wrap.className = `tcard-wrap rarity-${rarity}`;
    const statsHTML = br.stats
      ? Object.entries(br.stats).map(([k, v]) => `<span class="stat"><i>${STAT_ICONS[k] || "★"}</i>${v}</span>`).join("")
      : "";
    wrap.innerHTML = `
      <div class="tcard ${owned ? "flippable" : ""}">
        <div class="tcard-face tcard-front">
          ${owned
            ? `<div class="tcard-art">${brainrotArt(br, "tcard-img")}</div>
               <div class="tcard-rarity-tag">${RARITY_INFO[rarity].label}</div>
               <div class="tcard-name">${br.name}</div>`
            : `<div class="tcard-art">${brainrotArt(br, "tcard-img locked")}</div>
               <div class="tcard-lock">❓</div>
               <div class="tcard-name">${br.boss ? "Beat the boss!" : "???"}</div>
               ${!br.boss ? `<div class="tcard-price">${br.price} 🪙</div>` : `<div class="tcard-price">👑</div>`}`}
        </div>
        <div class="tcard-face tcard-back">
          <div class="tcard-back-name">${br.name}</div>
          <div class="tcard-stats">${statsHTML}</div>
          <div class="tcard-back-rarity">${RARITY_INFO[rarity].label}</div>
        </div>
      </div>`;
    const cardEl = wrap.querySelector(".tcard");
    if (owned) {
      cardEl.onclick = () => {
        sfx.pop();
        cardEl.classList.toggle("flipped");
        speak(br.name, { rate: 0.95 });
      };
    } else {
      cardEl.classList.toggle("cant", !br.boss && !canBuy);
      cardEl.onclick = () => {
        if (!br.boss && canBuy) {
          S.coins -= br.price;
          S.brainrots.push(br.name);
          save();
          revealNewCard(br, rarity, () => renderShop());
        } else {
          sfx.wrong();
        }
      };
    }
    cardGrid.appendChild(wrap);
  });

  grid.insertAdjacentHTML("beforeend", `<div class="shop-title">🎽 GEAR</div>`);
  GEAR.forEach((g) => {
    const owned = S.gear.owned.includes(g.id);
    const equipped = S.gear[g.slot] === g.id;
    const canBuy = S.coins >= g.price;
    const b = document.createElement("button");
    b.className = `block-btn shop-item${owned ? " owned" : ""}${equipped ? " equipped" : ""}${!owned && !canBuy ? " cant" : ""}`;
    b.innerHTML = `${g.emoji}<span class="price">${owned ? (equipped ? "✔" : "···") : `${g.price} 🪙`}</span>`;
    b.onclick = () => {
      if (!owned) {
        if (!canBuy) { sfx.wrong(); return; }
        S.coins -= g.price;
        S.gear.owned.push(g.id);
        S.gear[g.slot] = g.id;
        sfx.fanfare();
        confetti();
      } else {
        S.gear[g.slot] = equipped ? null : g.id; // tap to equip/unequip
        sfx.pop();
      }
      save();
      renderShop();
    };
    grid.appendChild(b);
  });
}

// ---------- dev cheats: #all unlocks everything, #reset wipes progress ----------
// typing a hash into an open page doesn't reload it — force the reload so cheats always run
window.addEventListener("hashchange", () => location.reload());
if (location.hash === "#reset") { S = defaultState(); save(); }
if (location.hash === "#all") {
  ZONES.forEach((z) => {
    S.zones[z.id] = { stars: chunk(z.words, LEVEL_SIZE).map(() => 3), boss: true };
    if (!S.brainrots.includes(z.boss.name)) S.brainrots.push(z.boss.name);
  });
  S.coins += 300;
  save();
}

// ---------- boot ----------
$("title-mascot").innerHTML = MASCOT_HTML;
$("game-mascot").innerHTML = MASCOT_HTML;
// tease a few brainrot cards, in full color, peeking up from the bottom of the title screen
$("title-preview").innerHTML = shuffle(BRAINROTS).slice(0, 5)
  .map((br) => `<div class="peek-card">${brainrotArt(br, "peek-img")}</div>`).join("");
$("btn-play").onclick = () => {
  audioCtx(); // unlock audio on the user gesture
  sfx.fanfare();
  speak("Let's play WordCraft!");
  renderMap();
};
$("hud-home").onclick = () => { sfx.pop(); if ("speechSynthesis" in window) speechSynthesis.cancel(); session = null; renderMap(); };
$("btn-skip").onclick = () => {
  if (!session) return;
  sfx.pop();
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  session.i++;
  nextRound();
};
$("hud-shop").onclick = () => { sfx.pop(); session = null; renderShop(); };
$("hud-sound").onclick = () => { S.muted = !S.muted; save(); renderHUD(); if (!S.muted) sfx.pop(); };
if (location.hash === "#all") renderMap(); // show the unlocked world immediately
// cycle through English voices; each tap speaks a sample so you can pick by ear
$("hud-voice").onclick = () => {
  const vs = enVoices();
  if (!vs.length) return;
  const i = vs.findIndex((v) => v.name === (voice && voice.name));
  voice = vs[(i + 1) % vs.length];
  S.voiceName = voice.name;
  save();
  sfx.pop();
  speak("Hello! Let's play WordCraft!");
};
renderHUD();
