'use strict';
// ---------- ink density field: hazards that bleed, dilute and drift like real ink on wet paper ----------
class InkField {
  constructor(cell, cols, rows) {
    this.c = cell; this.cols = cols; this.rows = rows;
    this.d = new Float32Array(cols * rows);
    this.tmp = new Float32Array(cols * rows);
    this.ox = 0; // world x of column 0
    this.canvas = document.createElement('canvas');
    this.canvas.width = cols; this.canvas.height = rows;
    this.cctx = this.canvas.getContext('2d');
    this.img = this.cctx.createImageData(cols, rows);
    this.acc = 0;
    // pre-fill colour channels (ink: cool near-black)
    const px = this.img.data;
    for (let i = 0; i < cols * rows; i++) { px[i * 4] = 24; px[i * 4 + 1] = 26; px[i * 4 + 2] = 34; px[i * 4 + 3] = 0; }
  }

  resize(cols) {
    if (cols === this.cols) return;
    const nd = new Float32Array(cols * this.rows);
    const copy = Math.min(cols, this.cols);
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < copy; c++) nd[r * cols + c] = this.d[r * this.cols + c];
    this.cols = cols; this.d = nd; this.tmp = new Float32Array(cols * this.rows);
    this.canvas.width = cols; this.cctx = this.canvas.getContext('2d');
    this.img = this.cctx.createImageData(cols, this.rows);
    const px = this.img.data;
    for (let i = 0; i < cols * this.rows; i++) { px[i * 4] = 24; px[i * 4 + 1] = 26; px[i * 4 + 2] = 34; px[i * 4 + 3] = 0; }
  }

  // slide the window so that column 0 is at worldX (only moves right)
  shiftTo(worldX) {
    const targetCol = Math.floor(worldX / this.c);
    const curCol = Math.round(this.ox / this.c);
    const n = targetCol - curCol;
    if (n <= 0) return;
    const { cols, rows, d } = this;
    if (n >= cols) d.fill(0);
    else for (let r = 0; r < rows; r++) {
      const base = r * cols;
      d.copyWithin(base, base + n, base + cols);
      d.fill(0, base + cols - n, base + cols);
    }
    this.ox = targetCol * this.c;
  }

  right() { return this.ox + this.cols * this.c; }

  sample(wx, wy) {
    const col = Math.floor((wx - this.ox) / this.c), row = Math.floor(wy / this.c);
    if (row >= this.rows) return 1;
    if (col < 0 || col >= this.cols || row < 0) return 0;
    return this.d[row * this.cols + col];
  }

  deposit(wx, wy, r, amt) {
    const c = this.c, cols = this.cols, rows = this.rows, d = this.d;
    const c0 = Math.max(0, Math.floor((wx - r - this.ox) / c)), c1 = Math.min(cols - 1, Math.ceil((wx + r - this.ox) / c));
    const r0 = Math.max(0, Math.floor((wy - r) / c)), r1 = Math.min(rows - 1, Math.ceil((wy + r) / c));
    const inv = 1 / (r * r * 0.45);
    for (let row = r0; row <= r1; row++) {
      const py = (row + 0.5) * c - wy;
      for (let col = c0; col <= c1; col++) {
        const px = (col + 0.5) * c + this.ox - wx;
        const q = (px * px + py * py) * inv;
        if (q > 4) continue;
        const i = row * cols + col;
        d[i] = Math.min(1.4, d[i] + amt * Math.exp(-q));
      }
    }
  }

  // water brush: removes ink under the brush and pushes a share of it outward as thin mist
  // lotus purification: fade ink inside r, soft at the rim; nothing is displaced
  wash(wx, wy, r, strength) {
    const c = this.c, cols = this.cols, rows = this.rows, d = this.d;
    const c0 = Math.max(0, Math.floor((wx - r - this.ox) / c)), c1 = Math.min(cols - 1, Math.ceil((wx + r - this.ox) / c));
    const r0 = Math.max(0, Math.floor((wy - r) / c)), r1 = Math.min(rows - 1, Math.ceil((wy + r) / c));
    for (let row = r0; row <= r1; row++) {
      const py = (row + 0.5) * c - wy;
      for (let col = c0; col <= c1; col++) {
        const px = (col + 0.5) * c + this.ox - wx;
        const dd = Math.sqrt(px * px + py * py);
        if (dd < r) d[row * cols + col] *= 1 - strength * Math.min(1, (r - dd) / 40);
      }
    }
  }

  water(wx, wy, r, strength) {
    const c = this.c, cols = this.cols, rows = this.rows, d = this.d;
    const R = r * 1.9;
    const c0 = Math.max(0, Math.floor((wx - R - this.ox) / c)), c1 = Math.min(cols - 1, Math.ceil((wx + R - this.ox) / c));
    const r0 = Math.max(0, Math.floor((wy - R) / c)), r1 = Math.min(rows - 1, Math.ceil((wy + R) / c));
    let removed = 0, ringCells = 0;
    for (let row = r0; row <= r1; row++) {
      const py = (row + 0.5) * c - wy;
      for (let col = c0; col <= c1; col++) {
        const px = (col + 0.5) * c + this.ox - wx;
        const dd = Math.sqrt(px * px + py * py);
        const i = row * cols + col;
        if (dd < r) {
          const f = strength * (1 - dd / r);
          const take = d[i] * f;
          d[i] -= take; removed += take;
        } else if (dd < R) ringCells++;
      }
    }
    if (ringCells > 0 && removed > 0) {
      const share = (removed * 0.35) / ringCells;
      for (let row = r0; row <= r1; row++) {
        const py = (row + 0.5) * c - wy;
        for (let col = c0; col <= c1; col++) {
          const px = (col + 0.5) * c + this.ox - wx;
          const dd = Math.sqrt(px * px + py * py);
          if (dd >= r && dd < R) { const i = row * cols + col; d[i] = Math.min(1.4, d[i] + share); }
        }
      }
    }
    return removed;
  }

  // diffusion: ink slowly bleeds into surrounding paper (runs at a fixed 20Hz)
  step(dt) {
    this.acc += dt;
    while (this.acc > 0.05) { this.acc -= 0.05; this._diffuse(0.05); }
  }
  _diffuse(dt) {
    const { cols, rows, d, tmp } = this;
    const k = 0.9 * dt;
    for (let r = 0; r < rows; r++) {
      const up = r > 0 ? r - 1 : r, dn = r < rows - 1 ? r + 1 : r;
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const v = d[i];
        if (v < 0.002) { tmp[i] = 0; continue; }
        const l = c > 0 ? d[i - 1] : v, rt = c < cols - 1 ? d[i + 1] : v;
        const avg = (l + rt + d[up * cols + c] + d[dn * cols + c]) * 0.25;
        // thick ink holds together; thin mist spreads and fades
        const spread = v > 0.6 ? k * 0.35 : k;
        const decay = v < 0.25 ? 0.06 * dt : 0.004 * dt;
        tmp[i] = (v + (avg - v) * spread) * (1 - decay);
      }
    }
    // neighbours of cells that are zero still need to receive ink
    for (let r = 0; r < rows; r++) {
      const up = r > 0 ? r - 1 : r, dn = r < rows - 1 ? r + 1 : r;
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        if (d[i] >= 0.002) continue;
        const l = c > 0 ? d[i - 1] : 0, rt = c < cols - 1 ? d[i + 1] : 0;
        const s = (l + rt + d[up * cols + c] + d[dn * cols + c]) * 0.25;
        if (s > 0.002) tmp[i] = s * k;
      }
    }
    this.d = tmp; this.tmp = d;
  }

  render(ctx, camX, timeSec) {
    const { cols, rows, d } = this;
    const px = this.img.data;
    const col0 = Math.round(this.ox / this.c);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const v = d[i];
        let a = 0;
        if (v > 0.01) {
          // mist stays faint, dense ink goes near-black; a darker rim where the ink has dried
          const rim = smoothstep(0.06, 0.22, v) * (1 - smoothstep(0.22, 0.5, v)) * 0.16;
          const grain = 0.82 + 0.36 * hash2(col0 + c, r, 77);
          a = (smoothstep(0.02, 0.95, v) * 0.9 + rim) * grain;
        }
        px[i * 4 + 3] = (Math.min(1, a) * 255) | 0;
      }
    }
    this.cctx.putImageData(this.img, 0, 0);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.canvas, this.ox - camX, 0, cols * this.c, rows * this.c);
    ctx.restore();
  }
}
