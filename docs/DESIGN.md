# Design notes

## Brief

Build a web-based 2D game in 水墨 (Chinese ink-wash) style that is fun, with innovative mechanics.

## Research

- **Ōkami** is the reference point for ink-as-mechanic: its Celestial Brush lets the player draw shapes that change the world. It is the exception; almost every other ink-styled game uses ink as a skin.
- **Realm of Ink (墨境)** is a recent action roguelite that explicitly borrows the visual grammar of ink painting (restrained brushwork, negative space, tonal control, wash gradients, ink particles), but its systems are standard roguelite combat.
- **Chinese Ink Painting Puzzle & Creator** is a jigsaw and composition toy.
- **Brush Jjaemu** and **Kirby: Canvas Curse** show that "draw a line, something rides it" is immediately readable and fun on both mouse and touch.
- Ink-wash technique vocabulary worth turning into rules: 浓墨/淡墨 (thick and thin ink), 飞白 (dry-brush "flying white" gaps that appear when the brush moves fast), 留白 (deliberate empty space), 泼墨 (splashed ink), and the way ink bleeds on wet 宣纸.

Takeaway: the innovation space is not the look, it is making the *behaviour of ink* the thing the player reasons about.

## Ten concepts

1. **留白 Negative Space** — the player can only exist on blank paper; washes drift in and you carve empty paths.
2. **墨渍 Ink Bleed** — strokes bleed outward on wet paper; use spreading to bridge gaps before the ink dries.
3. **泼墨 Splash** — fling ink blobs that solidify into mountains for a boat (Haboku physics toy).
4. **一笔 One Stroke** — draw an entire level path in one continuous, limited-ink stroke.
5. **墨鲤 Ink Koi** — a koi rides your strokes as currents; brush speed sets wet/dry width; ink is finite; a water brush dilutes hazards.
6. **山水卷轴 Scroll** — Ōkami-style gesture spells on an unrolling landscape scroll.
7. **墨影 Ink Shadow** — stealth inside dark washes; light dries you out.
8. **书法 Calligraphy Combat** — draw 山/水/火 characters to cast their element.
9. **墨滴 Tilt** — tilt the paper so ink drips form paths.
10. **竹林剑客 Bamboo Duel** — rhythm duel where each slash leaves an ink stroke.

## Decision

**#5 Ink Koi**, absorbing the bleed mechanic of #2 (hazards live on a diffusion field and the water brush pushes ink outward) and the negative-space idea of #1 (blank paper is the only safe place).

Why it won:

- Every physical property of ink becomes a decision: wet vs dry (cost vs durability), drying (strokes fade), bleeding (hazards spread), dilution (the water brush), scarcity (the inkstone).
- "Draw, the fish follows" is understood in one second, and works on mouse, pen and touch.
- An endless procedural scroll is cheap to generate, so effort goes into feel and visuals instead of level authoring.
- The koi (a classic 写意 subject) gives the monochrome scene its one dab of vermilion, which is how real ink paintings use colour.
- Ideas 8 and 10 need gesture recognition or rhythm tuning that would eat the budget; 3 and 9 are toys more than games; 6 is derivative of Ōkami.

## Tuning notes

- Koi on a current: acceleration = thrust along +x plus gravity along the tangent, friction 0.55/s, top speed 780. Off a current: gravity 430, terminal 470, small forward paddle.
- Stroke width 14 (slow) to 4 (fast); dry-brush factor rises from 650 to 1500 px/s of pointer speed. Ink cost = length × width × 0.00008; inkstone refills 0.08/s; a pearl gives 0.3.
- Stroke life 6.5 s plus 0.28 s per unit of average width.
- Ink hazard threshold 0.38 density; drain (density − 0.28) × 1.5 per second; spirit regenerates 0.22/s in clear water.
- Tide: 95 px/s rising to 245 px/s over 42 000 px; it is never allowed to fall more than ~30 px behind the left edge, so it is always visible pressure.
- Seasons every 6000 px; hooks start at chunk 6; clouds start at chunk 2.
