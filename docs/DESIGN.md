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
- Flow: riding adds 0.07/s, a pearl 0.06, a ring 0.3, a leap 0.22, a close call 0.2, a caught fall 0.05; each level needs (0.6 + 0.4 × level) of that. Sinking (vy > 150) for 1 s drops a level, a hook resets to ×1, thick ink drains the meter. Max ×5.
- A leap is at least 0.4 s airborne between two different strokes, rising at some point. A close call is passing within 44 px of a hook without being hit.
- Score: distance / 10 × flow, pearl 10 × flow, ring 30 × flow, leap (15 + 20 × airtime) × flow, close call 25 × flow, gate 300 × flow, lotus 50.
- Dragon gates at 2600 px and every 4500 px after (260, 710, 1,160, 1,610 丈 ...), radius 84, with clouds, hooks and lotus kept 240 px away and four pearls leading in. Ensō rings: 60% of chunks from chunk 2, radius 44 to 56; they count if the koi crosses the centre line within 85% of the radius.

## Retention design

The core loop was strong but every run ended the same way: a number, then nothing to aim at. Now each run feeds something that outlasts it:

- **A goal inside the run**: the 最远 pole at your farthest distance, the next dragon gate, the flow ensō filling.
- **A reason for one more run**: the game-over card names the gap to your best score when it is within 40%, and shows the next koi with a progress bar.
- **A reason to come back tomorrow**: three daily goals (gentle, medium, stretch, the same for everyone that day) and a streak counter. The last koi, 墨龙, is earned only through daily goals.
- **First unlocks come fast**: Kohaku at 1,000 丈 in total is usually the second or third run; later ones ask for skill (an ×8 combo, three gates, 3,000 in one run).
- **Evolution inside a run** answers "why keep going?" with something to see, not just a bigger number: the next form (shown as ? until first reached) is always one gate away, and the HUD counts down the 丈 to it. Gates fall at 260 丈 and then every 450 丈 (260, 710, 1,160, 1,610), so the first form comes quickly and each later one is a real journey. Once a dragon, each gate grows it (22 body segments plus 5 per gate, heavier each time, up to 8 growths), so there is still something to earn. The perks are small, and they arrive as the tide speeds up, so the late game stays tense but feels earned. The day cycle (900 丈) puts the second gate (710 丈) in the starlit night, so the spirit koi's glow arrives with the lanterns and the stars.

