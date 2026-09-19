# Perigee — design notes

## Brief

Build a 3D web game that is fun, innovative in its mechanics, and as polished as
possible. No engine beyond Three.js, no build step, runs from a static folder.

## Brainstorm (10 ideas)

| # | Idea | Core mechanic | Why it could be great | Why not |
|---|------|---------------|-----------------------|---------|
| 1 | **Gravity golf** | Putt a ball across a star system; planets bend the shot, the ball lands and rests on planets, moons carry it | One-input control (drag & release), infinite depth from real orbital mechanics, natural par/stroke scoring, hole-in-one moments | Existing "slingshot" games in the genre, so it needs its own twists |
| 2 | Echo runner | Endless runner in the dark; sonar pulses reveal geometry for a moment | Striking look, tense | Runner controls are ordinary; readability vs. fairness is hard |
| 3 | Tilt tower | Stack physics blocks on a platform that tilts with the centre of mass | Tactile, easy to learn | Needs a rigid-body engine; mostly a 2D idea rendered in 3D |
| 4 | Shadow bridge | Rotate a light so object shadows become solid platforms | Genuinely novel | Shadow-as-collider is expensive and fiddly; hard to make robust in a day |
| 5 | Bloom garden | Fly pollen to grow plants that reshape the level | Beautiful, calm | Weak goal structure, low "one more go" pull |
| 6 | Wave rider | Surf a procedural deforming ocean, ride crests for speed | Great feel if the water is good | Water shading + gameplay coupling is a big scope |
| 7 | Rewind heist | Time loop where past clones replay your inputs | Deep puzzle space | Needs many hand-built levels to shine; 3D adds little |
| 8 | Hex cascade | Rotate hex tiles to route marbles to goals | Satisfying chain reactions | Familiar (pipe-dream family), 3D is cosmetic |
| 9 | Orbital drift | Fly a ship with no thrusters, only gravity-assist timing | Elegant | Very close to #1 without the golf structure; punishing |
| 10 | Voxel sculptor race | Carve a path through a block while a marble follows | Creative | Unclear skill curve; heavy voxel meshing work |

## Research

- The browser 3D game market keeps growing, and the visual gap between WebGL
  games and native has largely closed; the reliable winners load fast and are
  playable in seconds with simple controls.
- Gravity-slingshot games (Gravity Golf, Slingshot, Gravity Slingshot, ORBITAL,
  Angry Birds Space) prove the core loop is satisfying. Their common elements are
  black holes, boosters, repulsors and "no trajectory prediction" difficulty.
  None that I found combine golf-style rest-on-surface play with moving bodies.
- Game-feel writing agrees on the same short list: directional screen shake with
  fast decay, particles that erupt along the impact vector, pitch-randomised
  sound, and immediate feedback for every input.

## Decision: gravity golf, with twists

Idea 1 won on fun-per-effort and on how well it suits the web (one input, instant
load, no tutorial). To make it feel new rather than a clone:

- **The ball lands.** Instead of exploding on contact, the ball bounces, rolls and
  comes to rest on planet surfaces. Every planet is a fairway, so a missed shot
  is a new lie, not a restart.
- **Everything moves.** Moons orbit, binary planets waltz, and the hole itself can
  orbit a star. A ball resting on a moon rides with it, and tee-off velocity
  includes the moon's velocity, so timing becomes a skill.
- **Readable gravity.** A rubber-sheet grid deforms under every body, so the
  player can see the wells and hills (repulsors) before shooting. The aim preview
  shows only the first 2.6 s of flight, so long slingshots still take judgement.
- **A real course.** 9 hand-designed holes that introduce one mechanic each
  (slingshot, moons, black hole, repulsors, boosts, sun + orbiting hole, binary,
  finale), scored against par with birdies and bogeys, plus a daily seeded
  course and unlimited random sectors.

## Architecture

- `src/physics.js` — renderer-free fixed-step simulation (gravity, contact,
  rolling, rest, boosts, goal, out-of-bounds). Deterministic in `(level, t)`, so
  the same code drives play, the aim preview, and the offline validator.
- `src/levels.js` — the course, plus a seeded generator for daily/random holes.
- `src/scene.js` — Three.js: procedural planet textures, gravity-grid shader,
  atmospheres, accretion disc, wormhole, trail ribbon, particles, bloom.
- `src/audio.js` — procedural WebAudio (no samples).
- `src/main.js` — game loop, input (mouse, touch, pinch), HUD and scoring.
- `tools/validate.mjs` — grid-searches angle × power on every hole to prove a
  hole-in-one line exists and that second shots from typical lies can hole out.
