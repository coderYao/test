# 墨鲤 · Ink Koi

A 2D 水墨 (ink-wash) web game. **Where the brush falls, water flows; the koi follows the ink.**

You hold a brush. A vermilion koi swims through an endless hand-painted scroll of mountains, mist and seasons. Every stroke you paint becomes a current the koi rides. Ink is finite, it dries and fades, thick ink drifting on the paper will drown the fish, and a tide of black ink is always rising behind you.

**Play:** open `index.html` in a browser, or serve the folder (`python3 -m http.server`) and visit it. No build step, no dependencies. Works with mouse, trackpad, pen and touch.

## How to play

| Action | Mouse / keyboard | Touch |
|---|---|---|
| Paint a current | Drag | Drag |
| Water brush (dilute ink, erase strokes) | Hold `Shift` or `Space`, or right-drag | Tap 水 to toggle |
| Mute | `M` or 音 button | 音 button |
| Pause | `P` | — |
| Restart | `Enter` / `R` on the end screen | 再游一次 |

## The mechanics, and why ink

Most ink-style games use ink as a *look*. Here the physical behaviour of ink is the design:

- **The brush has pressure through speed.** Drag slowly and the stroke is wet, wide and heavy (浓墨): it costs a lot of ink but lasts long. Drag fast and you get 飞白, a thin dry-brush stroke with gaps: cheap, quick, but it fades sooner. Every stroke is one decision between economy and durability.
- **Strokes are currents.** The koi attaches to any stroke it touches and slides along it. Gravity pulls it along the tangent, so downhill strokes are fast, uphill strokes need momentum, loops work. Off a stroke, the koi sinks. You are always painting a few seconds into the future.
- **Ink dries.** Strokes fade in six to ten seconds. The inkstone refills slowly; 墨珠 (ink pearls) refill it faster. Run dry mid-stroke and the brush literally trails off into 飞白.
- **Ink bleeds.** Hazards are blots of thick ink on a live diffusion field: they soften and spread like ink on wet rice paper. Thick ink drowns the koi (神, its spirit, drains). The **water brush** dilutes a blot into harmless mist, pushing the ink outward exactly like clean water on a wash, and it can also wipe your own strokes.
- **留白 is safety.** Blank paper is where the koi can breathe. The game is about deciding where to leave the paper empty.
- **The ink tide.** A wall of black ink follows from the left and speeds up with distance. Stalling is fatal.

Also: fishing hooks dangle from beyond the top of the scroll and knock the koi off its current, lotus flowers restore spirit, and every 6000 units the scroll turns a season (spring plum blossom, summer rain and green bamboo, autumn leaves, snow on the ridges) with a new vertical inscription and seal in the corner.

## Making of

Everything is procedural, drawn on one canvas at runtime, with no image or audio assets:

- **Paper** is generated fibre noise; mountains are layered ridged-noise silhouettes painted three times with offset washes, a broken pressure-varied ridge line and mist gradients, in three parallax layers, with seeded pines, bamboo groves, plum trees, huts, pagodas, birds and a moon.
- **Strokes** are rendered as a single jittered outline polygon (no beaded overlaps), with a bleed halo, a darker dried rim, a landing dab (起笔), ink granules, and 飞白 cut out with `destination-out`. Finished strokes are rasterised once.
- **Ink hazards** live on a sliding density grid with a diffusion step that lets thick ink hold together while thin mist spreads and fades; rendering adds paper grain and a dried rim.
- **The koi** is a wiggling spine with a width profile, drawn as a vermilion wash with a lighter patch, ink spots, fins and barbels; it darkens into ink as it drowns and dissolves into the density field when it dies.
- **Audio** is synthesised in the Web Audio API: Karplus-Strong plucks tuned to a D pentatonic scale for a guqin feel, filtered noise for brush scratching and splashes, a slow brown-noise wind.

See `docs/DESIGN.md` for the brainstorm of ten concepts and why this one won.

## Files

```
index.html      markup, overlays, script order
style.css       overlay and button styling
js/util.js      math, seeded RNG, value and ridged noise
js/audio.js     procedural sound
js/inkfield.js  ink density field (hazards, diffusion, water brush)
js/brush.js     strokes: sampling, arc-length rails, ink-wash rendering
js/koi.js       koi physics on currents, painterly rendering
js/scenery.js   paper, mountains, decorations, seasons
js/world.js     procedural chunks, pickups, hooks, the tide
js/game.js      loop, input, HUD, particles, states
```

---

## Also in this repository: Perigee (3D gravity golf)

[`perigee/`](perigee/) holds **Perigee**, a 3D gravity golf game built on Three.js.
Putt a ball across star systems, slingshot round gas giants, tee off from a moving
moon and sink it into a wormhole. Serve the repository root and open
`/perigee/`, or see [`perigee/README.md`](perigee/README.md).
