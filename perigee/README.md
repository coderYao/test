# Perigee — gravity golf in 3D

Putt a ball across star systems. Planets bend every shot, moons carry the ball
with them, black holes swallow it, and the hole is a wormhole that might itself be
in orbit. Nine designed holes, a daily seeded course, and endless random sectors.

Built with Three.js only (vendored, no build step).

## Play

Any static file server works. From this folder:

```
python3 -m http.server 8000
```

then open <http://localhost:8000/>. From the repository root, open
<http://localhost:8000/perigee/> instead. Opening `index.html` directly from
disk does not work because ES modules need HTTP.

Deep links: `?hole=5` jumps to hole 5 of the course; `?hole=1&mode=daily` starts
today's sector.

## Controls

| Input | Action |
|-------|--------|
| Drag and release (mouse or one finger) | Putt. Pull back like a slingshot; direction and distance set aim and power |
| Right-drag, or two fingers | Orbit the camera |
| Wheel, or pinch | Zoom |
| Tab | Toggle overview of the whole hole |
| R | Restart the hole |
| Space | Recall a ball stuck in orbit |
| M | Toggle sound |
| Esc | Cancel an aim |

## Rules

- A hole ends when the ball enters the wormhole. Strokes are scored against par.
- The ball bounces and rolls on planets and comes to rest there. The next shot
  is from that lie, and if the planet is a moon, the ball moves with it.
- Touching a black hole or a sun costs a penalty stroke and returns the ball.
- Leaving the boundary or drifting too long returns the ball with no penalty.
- Repulsors push. Boost rings fire the ball along their arrow.

## Development

```
node tools/validate.mjs   # checks every hole has a hole-in-one line and good second shots
```

See `DESIGN.md` in this folder for the brainstorm, research, and the reasons behind the design.
