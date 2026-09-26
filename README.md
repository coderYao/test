# 墨鲤 · Ink Koi

A 2D 水墨 (ink-wash) web game. **Where the brush falls, water flows; the koi follows the ink.**

You hold a brush. A vermilion koi swims through an endless hand-painted scroll of mountains, mist and seasons. Every stroke you paint becomes a current the koi rides. Ink is finite, it dries and fades, thick ink drifting on the paper will drown the fish, and a tide of black ink is always rising behind you.

**Play:** open `index.html` in a browser, or serve the folder (`python3 tools/serve.py`, a no-cache dev server, or any static server) and visit it. No build step, no dependencies. Works with mouse, trackpad, pen and touch.

The game is bilingual throughout: every piece of text, from the title card to HUD labels, pickup floaters, season poems and the game-over screen, pairs the Chinese with English at a readable size, on phones as well as desktop.

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
- **Strokes are currents.** The koi attaches to any stroke it touches and rides it onward (toward the right, whichever way you drew it). Gravity pulls it along the tangent, so downhill strokes are fast, uphill strokes need momentum, loops work. It never slides backwards: if it runs out of momentum on a climb it slips off and sinks. Off a stroke, the koi sinks. You are always painting a few seconds into the future.
- **Fresh ink takes over.** Paint a new stroke across a riding koi and it switches to the newer current. This is how you change its course mid-ride: pull it off a doomed climb, dive under a hook, or chain strokes without waiting for it to fall off the end.
- **Ink dries.** Strokes fade in six to ten seconds. The inkstone refills slowly; 墨珠 (ink pearls) refill it faster. Run dry mid-stroke and the brush literally trails off into 飞白.
- **Ink bleeds.** Hazards are blots of thick ink on a live diffusion field: they soften and spread like ink on wet rice paper. Thick ink drowns the koi (神, its spirit, drains). The **water brush** dilutes a blot into harmless mist, pushing the ink outward exactly like clean water on a wash, and it can also wipe your own strokes.
- **留白 is safety.** Blank paper is where the koi can breathe. The game is about deciding where to leave the paper empty.
- **Pickups do something.** Each 墨珠 (ink pearl) refills the inkstone and gives the koi a surge of speed along its current, bigger with every pearl in an unbroken run (连珠), so threading a whole arc of pearls is a slingshot. A 莲 (lotus) restores spirit and water, sends a ring of clear water outward that washes away every ink blot within 260 px, and makes the ink tide ebb 300 px, rest for two seconds, then creep back.
- **The ink tide.** A wall of black ink follows from the left and speeds up with distance. Stalling is fatal.
- **流势 Flow.** Riding, leaping between strokes (鲤跃), threading 圆相 ensō rings and slipping past hooks by a whisker (险) all build a flow multiplier, up to ×5, shown as an ensō that fills beside the gauges. Every point you score is multiplied by it. Sinking for more than a second drops it a level; a hook resets it.
- **龙门 Dragon Gates.** Every 300 丈 a great vermilion ensō hangs over the scroll (an arrow at the right edge points to the next one). Swim through it and the inkstone, water and spirit refill, the flow rises a level, the tide falls back, and the koi evolves.
- **鲤跃龙门: the koi becomes a dragon.** As in the legend, each gate carries the koi one form further, and each form looks grander and brings a perk:

  | Gates | Form | Looks | Perk |
  |---|---|---|---|
  | 0 | 鲤 Carp | your chosen variety | none |
  | 1 | 锦鲤 Brocade Koi | gold rim, gold-glinting scales | ink refills faster |
  | 2 | 灵鲤 Spirit Koi | long silk tail with streamers, a halo, trailing sparks | pearls drift toward you |
  | 3 | 蛟 Jiao | antlers, a flame-like crest, long whiskers | thick ink hurts less |
  | 4 | 龙 Dragon | long serpentine body, four clawed legs, golden antlers, cloud wisps | glides off a current; flow never falls below ×2 |

  The five forms sit in a row under the gauges with the distance to the next gate. Forms you have never reached show as ?, on the HUD and on the title scroll.
- **The world changes as you go.** One day passes over every 900 丈: dawn with a red sun, day, golden hour, dusk, then a starlit night with a moon, fireflies and lamps lit in the huts and pagodas, and dawn again. Each form the koi takes adds a layer of wonder to the sky: golden motes, then sky lanterns rising, then auspicious 祥云 clouds, then red-crowned cranes and shafts of light.

## Between runs

- **Seven koi to collect.** 朱鲤 Vermilion to start; 红白 Kohaku, 丹顶 Tancho, 浅黄 Asagi, 昭和 Showa, 黄金 Ogon and 墨龙 Ink Dragon unlock through lifetime distance, pearls, combos, gates, score and daily goals. Pick one on the title scroll; the game-over card shows how close the next one is.
- **今日 Daily goals.** Three goals a day, the same for everyone on that date and ranging from gentle to a stretch, plus a streak of consecutive days played. Meeting one mid-run stamps a red seal on the scroll.
- **Your record is on the scroll.** A red 最远 pole marks your farthest swim, and the game-over card tells you how close you came to your best score.

Progress is one JSON blob (`moli.progress`) in the portal's synced storage, or `localStorage` elsewhere.

Also: fishing hooks dangle from beyond the top of the scroll and knock the koi off its current, and every 6000 units the scroll turns a season (spring plum blossom, summer rain and green bamboo, autumn leaves, snow on the ridges) with a new vertical inscription and seal in the corner.

## Making of

Everything is procedural, drawn at runtime, with no image or audio assets. It paints on two stacked canvases: the soft landscape (paper, sky, mountains, the ink-hazard field) behind at up to 1× resolution, since washes lose nothing to it, and the crisp layer (strokes, koi, pickups, tide, HUD) in front at full retina resolution. That cuts the pixels filled per frame by more than half on retina screens. While the brush is down, the stroke's outline is repainted as it changes, but its bristle and 飞白 texture is built up a piece at a time in a mask as points settle, so a long stroke costs no more per frame than a short one. If play sustains less than about 48 fps, the game tries one resolution step down and keeps it only if frames get clearly faster; a 30 Hz power mode doesn't, so that step is undone. A kept step is remembered for the device (`moli.quality` in localStorage), and each visit starts one step higher so a device that was only briefly slow recovers. `game.composite(ctx, w, h)` flattens both layers for the cover and video tools.

- **Paper** is generated fibre noise; mountains are layered ridged-noise silhouettes painted three times with offset washes, a broken pressure-varied ridge line and mist gradients, in three parallax layers, with seeded pines, bamboo groves, plum trees, huts, pagodas, birds and a moon.
- **Strokes** read every coalesced pointer sample (so fast flicks stay round), pass through a light stabiliser, and are rebuilt as a centripetal Catmull-Rom spline, which is also the rail the koi rides, so its motion is as smooth as the ink. A pen's pressure sets the width. Each stroke is one jittered outline polygon that swells and pinches along its length, with bristle tracks, a darker dried rim, a landing dab (起笔), a tapered lift (收笔), ink granules, and 飞白 raked open in long streaks with `destination-out`. A wet sheen dries off in the first second while a blurred bleed halo soaks in, and glints run downstream along the current the koi is riding. Finished strokes are rasterised once.
- **Ink hazards** live on a sliding density grid with a diffusion step that lets thick ink hold together while thin mist spreads and fades; rendering adds paper grain and a dried rim.
- **The koi** is painted top-down, as in koi paintings: a blunt snout and broad shoulders tapering to a slim tail root, along a spine that follows the path the head actually swam, so the body bends with a curving current and the swimming wave rides on top. Over it go its variety's pattern (each patch laid twice, a faint bleed then the pigment), a fine scale net, dorsal shading, a darkened rim and a lit flank; translucent fins with rays (rowing pectorals, pelvics, a rippling dorsal ridge, and a two-lobed tail that follows through); eyes with a glint, gill covers and barbels; and a broken ink outline. It eases onto a current instead of snapping, darkens into ink as it drowns and dissolves into the density field when it dies.
- **Audio** is synthesised in the Web Audio API: Karplus-Strong plucks tuned to a D pentatonic scale for a guqin feel, a generative melody over a soft drone that grows busier as the flow builds, a temple gong for dragon gates, filtered noise for brush scratching, splashes and leaps, a slow brown-noise wind.
- **Seasons and hours** grade the paper and landscape (never the ink) in one multiply pass: the season's tint times a sky gradient for the hour, strongest overhead. The sun and moon travel an arc across the day; stars, fireflies, lit windows, lanterns, clouds and cranes are procedural and placed by hash, so they need no state.

See `docs/DESIGN.md` for the brainstorm of ten concepts and why this one won.

## Files

```
index.html      markup, overlays, script order
style.css       overlay and button styling
js/util.js      math, seeded RNG, value and ridged noise
js/platform.js  portal adapter: CrazyGames SDK when present, no-ops otherwise
js/audio.js     procedural sound
js/inkfield.js  ink density field (hazards, diffusion, water brush)
js/brush.js     strokes: sampling, arc-length rails, ink-wash rendering
js/koi.js       koi physics on currents, painterly rendering, the seven varieties, the five forms
js/progress.js  lifetime totals, koi unlocks, daily goals and streak
js/scenery.js   paper, mountains, decorations, seasons, time of day, the sky's wonders
js/world.js     procedural chunks, pickups, ensō rings, dragon gates, hooks, the tide, the best-distance marker
js/game.js      loop, input, flow and scoring, HUD, particles, states, title and game-over cards
tools/serve.py             no-cache dev server
tools/build_crazygames.py  packages dist/ink-koi-crazygames.zip for the CrazyGames portal
tools/covers.html          paints the portal cover images with the game's own code
tools/record.html          renders the portal preview videos offline with a scripted brush
tools/collect_frames.py    receives those frames and encodes the MP4s with ffmpeg
```

Publishing on CrazyGames: see [`docs/CRAZYGAMES.md`](docs/CRAZYGAMES.md).

---

## Also in this repository: Perigee (3D gravity golf)

[`perigee/`](perigee/) holds **Perigee**, a 3D gravity golf game built on Three.js.
Putt a ball across star systems, slingshot round gas giants, tee off from a moving
moon and sink it into a wormhole. Serve the repository root and open
`/perigee/`, or see [`perigee/README.md`](perigee/README.md).
