# WordCraft — English learning game design

A browser game for a 7-year-old with zero English. Minecraft/Roblox/football themed.
English-only immersion: the game never relies on reading instructions — the mascot
demonstrates everything.

## Decisions (validated in brainstorming)

- **Platform:** static web app, zero-build vanilla HTML/CSS/JS. No backend, no accounts.
- **Devices:** touch and mouse both first-class. Big targets (min 64px).
- **Audio:** full — every word spoken via `speechSynthesis` (en-US, rate ~0.85).
  Sound effects synthesized with Web Audio API. No audio files.
- **Artwork:** emoji + pure CSS (mascot, map, blocks, boss). No image assets.
- **UI language:** English-only immersion. Mascot demos each new game type by
  playing a round itself with a pointing hand.
- **Progress:** one localStorage JSON blob — coins, XP, per-word stats
  (drives invisible spaced repetition), unlocked zones, avatar gear.

## Structure

Home screen = scrolling world map (Candy Crush style): winding path of level
nodes through four zones, locked zones visible but fogged.

1. Starter Meadow — colors, numbers 1–10, animals, family
2. Blocky Biome (Minecraft-flavored) — diamond, pickaxe, sword, house, tree…
3. Stadium Zone (football) — ball, goal, team, kick, win…
4. Arcade Zone (Roblox-flavored) — play, jump, build, friend, avatar…

Each level node = one ~2–3 minute session of ~6 rounds. New words introduced
first (hear 2× + picture), then played.

## Mini-games

Each zone has its own signature game (SIG map): meadow=Sky Catch, biome=Mine,
stadium=Penalty Kick, ocean=Go Fish, arcade=Whack-a-Word. Every signature game
has two modes: listen (hear word → pick picture) and read (see picture → pick
written word). Sky Catch = items fall from the sky into a basket; Go Fish =
items swim across the sea; Whack-a-Word = items pop out of neon holes.

1. **Mine the Word** (listening) — word spoken; a 3×3 wall of dirt blocks, each
   takes 2 pickaxe hits (swing animation, crack stages, debris). The 3 items are
   hidden behind blocks — dig to discover them, grab the right one, it flies into
   a chest. One empty cell hides a bonus coin. Only grabbing wrong counts as a miss.
2. **Penalty Kick** (reading) — picture shown; three goals labeled with written
   words; flick the ball at the right one. Net ripple + crowd roar.
3. **Build the Word** (writing) — tap/drag letter blocks into slots to spell the
   word he hears. Each letter speaks its phonic sound. Built words stack into a
   growing structure.
4. **Echo Cave** (speaking) — mascot says word, he repeats into mic.
   `webkitSpeechRecognition` where available, generous matching; no mic support
   → mascot just cheers after he speaks.
5. **Boss Round** — end of each zone, all mechanics mixed; correct answers land
   cartoon hits. Beat it → trophy + coin bonus.

No lives, no game over. Missed words silently re-queued later in the session
(spaced repetition, invisible).

## Juice / retention

- Every tap: squash/pop animation + synthesized sound.
- Correct: star burst, coin flies to counter, XP bar fill.
- 3-streak: "ON FIRE" screen glow.
- Level-up: full-screen celebration.
- Shop: spend coins on avatar gear (emoji hats, capes, boots, swords).

## Files

```
wordcraft/
  index.html   – shell + screens
  style.css    – all visuals/animations
  game.js      – engine, screens, mechanics
  words.js     – content; one line per word: { word, emoji, zone }
```

## Skipped (add only when actually needed)

Backend/sync, accounts, analytics, real TTS API, image assets, build tooling,
Hebrew UI, alphabet/phonics track (phonics sneaks in via Build the Word).
