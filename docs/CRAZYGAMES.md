# Publishing 墨鲤 Ink Koi on CrazyGames

Everything needed to submit the game through the [CrazyGames Developer Portal](https://developer.crazygames.com/).
Requirements referenced here are from <https://docs.crazygames.com/requirements/intro/> (checked September 2026).

## 1. Build the upload

```
python3 tools/build_crazygames.py
```

This writes `dist/ink-koi-crazygames.zip` (about 36 KB, 11 files, `index.html` at the zip root) and the same
files unpacked in `dist/crazygames/`. Only Ink Koi goes in: no Perigee, docs or tools. The build differs from
the web version in two ways: the CrazyGames SDK `<script>` is added to `<head>`, and asset URLs are stamped
with the commit hash. It fails if `index.html` references a missing or absolute path.

To try the build with the SDK in its local test mode (console logging, placeholder ads):

```
python3 tools/serve.py 8001 dist/crazygames
```

then open <http://localhost:8001/>. Play, die, and press **Swim again**: a placeholder midgame ad appears,
then the next run starts.

## 2. What the SDK integration does (`js/platform.js`)

`Platform` wraps SDK v3 and is a silent no-op when the SDK is absent (GitHub Pages, local files) or reports
the `disabled` environment, so there is one codebase.

| Portal feature | Where |
|---|---|
| `SDK.init()` with a 3 s timeout so a blocked SDK never holds the game up | boot, `js/game.js` |
| `loadingStart` / `loadingStop` | around font loading and `new Game` |
| `gameplayStart` / `gameplayStop` | derived every frame from `state === 'play' && !paused && !adPending`, so pause, tab-hidden, death and ads are all covered by one rule |
| Midgame ad | only when restarting after a death (a natural break, never at first start or mid-run). Audio is silenced on `adStarted`; the run begins on `adFinished` / `adError`. The SDK enforces its own 3 minute cooldown. |
| `happytime` | when the player beats a previous best |
| `settings.muteAudio` + change listener | `Audio.setDucked`, independent of the player's own 音 / Sound toggle |
| Best score | `SDK.data` on the portal (synced to the player's account), `localStorage` elsewhere |

Not used, deliberately: rewarded ads and banners (nothing in the game to attach them to yet), user accounts,
sitelock (the game is open source and also lives on GitHub Pages).

## 3. Requirements checklist

| Requirement | Status |
|---|---|
| Initial download ≤ 50 MB (≤ 20 MB for the mobile homepage), ≤ 1500 files | ~110 KB unzipped, 11 files. Everything is procedural; there are no image or audio assets. |
| Relative paths only | Checked by the build script |
| Reaches gameplay in ≤ 1 click, no blocking splash | Title card, click anywhere to start |
| No custom fullscreen button | None |
| English localisation | Every string is paired Chinese + English |
| Mouse, keyboard and touch | Drag to paint; Shift / Space / right-drag or the 水 button for water; `P` pause, `M` mute, `Enter` / `R` restart |
| Works on Chrome, Edge, Safari; Chromebook-friendly | Canvas 2D and Web Audio only |
| No text selection / long-press menus on mobile | `user-select: none`, `-webkit-touch-callout: none`, `contextmenu` prevented |
| Pauses when the tab is hidden | `visibilitychange` |
| PEGI 12 | No violence beyond a koi dissolving into ink; no text input, chat or links |
| No external links, cross-promotion or third-party ads | None |
| Landscape | Set orientation to **landscape** in the portal; portrait phones see a rotate prompt |

**One known external dependency:** the two typefaces (Ma Shan Zheng, Noto Serif SC) load from Google Fonts.
CrazyGames allows external files but counts them toward time-to-gameplay, and Google Fonts is unreachable in
some regions. The game starts with fallback faces after 2.5 s if they do not arrive. Self-hosting glyph
subsets of both fonts (both are OFL-licensed) would remove the dependency; it needs the font files
downloaded and `fonttools` to subset them.

## 4. Covers and video

Open `/tools/covers.html` from a local server (`python3 tools/serve.py`) and use the download links. It
paints the three required covers with the game's own scenery, brush, koi and pickups, and adds only the
game title (CrazyGames allows no other text, borders or logos):

- `cover-landscape-1920x1080.png` (16:9)
- `cover-portrait-800x1200.png` (2:3)
- `cover-square-800x800.png` (1:1)

`?seed=1234` gives different mountains.

Still to make by hand: the **preview video**. 15–20 s, no sound, ≤ 50 MB, 1080p, in both landscape (16:9)
and portrait (2:3); no black bars, logo transitions, default mouse cursor or promotional text; ideally
opening on the cover image. The in-game brush cursor replaces the system cursor, so a plain screen recording
of a good run works.

## 5. Listing copy

**Title:** Ink Koi (墨鲤)

**Category / tags:** Casual · Arcade · Endless runner · Drawing · Relaxing · Mouse / touch

**Short description**

> Paint currents with an ink brush and guide a koi through an endless hand-painted scroll. Your ink is the
> river: every stroke you draw becomes water the koi rides.

**Description**

> Ink Koi is an ink-wash (水墨) drawing game. A vermilion koi swims through mountains, mist and four
> seasons, and it can only travel where you paint. Drag to lay down a stroke and the koi rides it like a
> current: downhill strokes are fast, climbs need momentum, and a fresh stroke painted across the koi pulls
> it onto a new course.
>
> Ink is finite and it dries. Slow strokes are thick and last; fast strokes are thin and cheap. Thick ink
> drifting on the paper drains the koi's spirit, so wash it away with the water brush or steer through
> blank paper. String ink pearls together for a surge of speed, take a lotus to purify the water and push
> back the black tide that is always rising behind you.
>
> Everything is drawn and synthesised live: no two scrolls are the same.

**Controls**

> - **Drag** (mouse or finger): paint a current
> - **Shift / Space / right-drag**, or the **水 Water** button: water brush, washes away thick ink
> - **P**: pause · **M**: mute · **Enter / R**: swim again
