import { Particle, ParticleContainer, type Texture } from 'pixi.js';
import { mixColor } from '../color';
import { TUNING } from '../tuning';

type RoamState = 'move' | 'stop';

/**
 * Accent-colored square roaming the field — drawn as a block of matrix cells
 * (sizeCells² particles with the grid's gap between them), stepping one cell
 * at a time so it reads as part of the LED grid, not an overlay.
 *
 * Travels in integer grid coordinates at a constant velocity, ricocheting off
 * the screen edges, the spectrogram band's top edge (floor), and the actual
 * lit cells of the logo text (per-axis stepping lets it slide along glyphs).
 * Periodically it halts, brightens, and sprays a burst of matrix cells that
 * hop outward before fading. Pauses while a glitch is active.
 *
 * The container uses dynamic position/color/vertex — everything this layer
 * animates re-uploads every frame (~25 particles, trivial).
 */
export class BouncingSquare {
  readonly container: ParticleContainer;

  private readonly sizeCells = TUNING.roamer.sizeCells;
  private readonly speed = TUNING.roamer.speed;

  /** The block: sizeCells² particles, one per matrix cell. */
  private cells: Particle[] = [];
  /** Burst particles: one matrix cell each, snapped to the grid on write. */
  private burst: Particle[] = [];
  private burstX = new Float32Array(0);
  private burstY = new Float32Array(0);
  private burstVx = new Float32Array(0);
  private burstVy = new Float32Array(0);
  private burstLife = new Float32Array(0);
  private burstMaxLife = new Float32Array(0);

  /** Integer cell coords of the block's top-left corner. */
  private x = 0;
  private y = 0;
  /** Signed sub-cell remainders from velocity integration. */
  private ax = 0;
  private ay = 0;
  private vx = 0;
  private vy = 0;
  private cols = 0;
  private floorRow = 0;
  private stride = 18;
  private state: RoamState = 'move';
  private stateTimer = 0;
  /** 0..1 envelope (sin) across the halt — drives the brightness pulse. */
  private pulse = 0;
  private spawned = false;

  constructor(texture: Texture) {
    this.container = new ParticleContainer({
      texture,
      roundPixels: true,
      // position/color/vertex (scale) all animate: cell hops, brightness
      // pulse, and layout rescaling must re-upload every frame.
      dynamicProperties: { position: true, color: true, vertex: true },
    });

    for (let i = 0; i < this.sizeCells * this.sizeCells; i++) {
      const p = new Particle({ texture, scaleX: 1, scaleY: 1 });
      this.cells.push(p);
      this.container.addParticle(p);
    }

    const count = TUNING.roamer.burstCount;
    this.burstX = new Float32Array(count);
    this.burstY = new Float32Array(count);
    this.burstVx = new Float32Array(count);
    this.burstVy = new Float32Array(count);
    this.burstLife = new Float32Array(count);
    this.burstMaxLife = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const p = new Particle({ texture, alpha: 0, scaleX: 1, scaleY: 1 });
      this.burst.push(p);
      this.container.addParticle(p);
    }
  }

  layout(cols: number, _rows: number, stride: number, pixelSize: number, floorRow: number): void {
    this.cols = cols;
    this.stride = stride;
    this.floorRow = floorRow;

    const size = Math.min(this.sizeCells, Math.max(1, cols));
    for (const p of this.cells) {
      p.scaleX = pixelSize;
      p.scaleY = pixelSize;
    }
    for (const p of this.burst) {
      p.scaleX = pixelSize;
      p.scaleY = pixelSize;
    }

    if (!this.spawned) {
      this.spawn(cols, floorRow);
      this.spawned = true;
    } else {
      // Keep the block inside the new bounds after a resize.
      this.x = Math.min(Math.max(0, this.x), Math.max(0, cols - size));
      this.y = Math.min(Math.max(0, this.y), Math.max(0, floorRow - size));
    }
    this.writePositions();
    // Scale is a static attribute unless flagged dynamic — flush anyway as a
    // safety net after touching every particle's scale.
    this.container.update();
  }

  /**
   * @param isTextCell collision mask for the logo text (grid coords)
   * @param paused freeze while a glitch is running
   */
  update(
    dt: number,
    accent: number,
    isTextCell: (col: number, row: number) => boolean,
    paused: boolean,
  ): void {
    if (!paused) {
      if (this.state === 'move') this.updateMove(dt, isTextCell);
      else this.updateStop(dt);
    }
    this.updateBurst(dt);
    this.writeColors(accent);
    this.writePositions();
  }

  destroy(): void {
    this.container.destroy({ children: true });
    this.cells = [];
    this.burst = [];
  }

  private spawn(cols: number, floorRow: number): void {
    const size = this.sizeCells;
    // Prefer a spot outside the central band where the logo usually sits.
    for (let attempt = 0; attempt < 24; attempt++) {
      this.x = Math.floor(Math.random() * Math.max(1, cols - size + 1));
      this.y = Math.floor(Math.random() * Math.max(1, floorRow - size + 1));
      const inCenterBand =
        this.x + size > cols * 0.3 &&
        this.x < cols * 0.7 &&
        this.y + size > floorRow * 0.45 &&
        this.y < floorRow * 0.8;
      if (!inCenterBand) break;
    }
    const angle = Math.random() * Math.PI * 2;
    this.vx = Math.cos(angle) * this.speed;
    this.vy = Math.sin(angle) * this.speed;
    this.ax = 0;
    this.ay = 0;
    this.state = 'move';
    this.stateTimer = this.nextStopInterval();
  }

  private updateMove(dt: number, isTextCell: (col: number, row: number) => boolean): void {
    this.stepAxis(dt, 'x', isTextCell);
    this.stepAxis(dt, 'y', isTextCell);

    this.stateTimer -= dt;
    if (this.stateTimer <= 0) {
      this.state = 'stop';
      this.stateTimer = TUNING.roamer.stopDuration;
      this.spawnBurst();
    }
  }

  /**
   * Integrate one axis in sub-cell units, committing one whole-cell hop per
   * whole remainder. A blocked hop reflects that axis (the other keeps its
   * remainder, so the block slides along glyph edges).
   */
  private stepAxis(dt: number, axis: 'x' | 'y', isTextCell: (col: number, row: number) => boolean): void {
    const v = axis === 'x' ? this.vx : this.vy;
    let rem = (axis === 'x' ? this.ax : this.ay) + v * (dt / 1000);

    let guard = 0;
    while (Math.abs(rem) >= 1 && guard++ < 8) {
      const dir = rem > 0 ? 1 : -1;
      const nx = axis === 'x' ? this.x + dir : this.x;
      const ny = axis === 'y' ? this.y + dir : this.y;
      if (this.hits(nx, ny, isTextCell)) {
        if (axis === 'x') {
          this.vx = -this.vx;
          this.nudge('y');
        } else {
          this.vy = -this.vy;
          this.nudge('x');
        }
        rem = 0;
        break;
      }
      if (axis === 'x') this.x = nx;
      else this.y = ny;
      rem -= dir;
    }

    if (axis === 'x') this.ax = rem;
    else this.ay = rem;
  }

  private updateStop(dt: number): void {
    // Brightness envelope across the halt (rendered as a white-mix pulse —
    // no scale tricks, everything stays on-matrix).
    const progress = 1 - Math.max(0, this.stateTimer) / TUNING.roamer.stopDuration;
    this.pulse = Math.sin(progress * Math.PI);

    this.stateTimer -= dt;
    if (this.stateTimer <= 0) {
      this.state = 'move';
      this.pulse = 0;
      this.stateTimer = this.nextStopInterval();
    }
  }

  private updateBurst(dt: number): void {
    const dts = dt / 1000;
    const damping = Math.exp(-TUNING.roamer.burstDamping * dts);
    for (let i = 0; i < this.burst.length; i++) {
      if (this.burstLife[i] <= 0) continue;
      this.burstLife[i] -= dt;
      if (this.burstLife[i] <= 0) {
        this.burst[i].alpha = 0;
        continue;
      }
      this.burstVx[i] *= damping;
      this.burstVy[i] *= damping;
      this.burstX[i] += this.burstVx[i] * dts;
      this.burstY[i] += this.burstVy[i] * dts;
      const t = this.burstLife[i] / this.burstMaxLife[i];
      this.burst[i].alpha = Math.pow(t, 0.8);
    }
  }

  private spawnBurst(): void {
    const { burstCount, burstSpeed, burstLife } = TUNING.roamer;
    const cx = this.x + (this.sizeCells - 1) / 2;
    const cy = this.y + (this.sizeCells - 1) / 2;
    for (let i = 0; i < burstCount && i < this.burst.length; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = burstSpeed * (0.5 + Math.random() * 0.5);
      this.burstVx[i] = Math.cos(angle) * speed;
      this.burstVy[i] = Math.sin(angle) * speed;
      this.burstMaxLife[i] = burstLife * (0.7 + Math.random() * 0.3);
      this.burstLife[i] = this.burstMaxLife[i];
      // Spawn at the block's rim so cells don't hide under it.
      const r = this.sizeCells / 2 + 0.4;
      this.burstX[i] = cx + Math.cos(angle) * r;
      this.burstY[i] = cy + Math.sin(angle) * r;
      this.burst[i].alpha = 1;
    }
  }

  private hits(px: number, py: number, isTextCell: (col: number, row: number) => boolean): boolean {
    const size = this.sizeCells;
    if (px < 0 || py < 0 || px + size > this.cols || py + size > this.floorRow) return true;
    for (let r = py; r < py + size; r++) {
      for (let c = px; c < px + size; c++) {
        if (isTextCell(c, r)) return true;
      }
    }
    return false;
  }

  private nudge(axis: 'x' | 'y'): void {
    const jitter =
      (Math.random() - 0.5) * 2 * (TUNING.roamer.bounceNudgeDeg * (Math.PI / 180)) * this.speed;
    if (axis === 'x') this.vx += jitter;
    else this.vy += jitter;
    // Renormalize to the configured speed so nudges don't accumulate drift.
    const mag = Math.hypot(this.vx, this.vy) || 1;
    this.vx = (this.vx / mag) * this.speed;
    this.vy = (this.vy / mag) * this.speed;
  }

  private nextStopInterval(): number {
    return TUNING.roamer.stopIntervalMin + Math.random() * TUNING.roamer.stopIntervalJitter;
  }

  private writeColors(accent: number): void {
    const tint =
      this.state === 'stop' ? mixColor(accent, 0xffffff, 0.4 * this.pulse) : accent;
    for (const p of this.cells) p.tint = tint;
    for (let i = 0; i < this.burst.length; i++) {
      if (this.burstLife[i] > 0) this.burst[i].tint = tint;
    }
  }

  private writePositions(): void {
    let i = 0;
    for (let dy = 0; dy < this.sizeCells; dy++) {
      for (let dx = 0; dx < this.sizeCells; dx++) {
        const p = this.cells[i++];
        p.x = (this.x + dx) * this.stride;
        p.y = (this.y + dy) * this.stride;
      }
    }
    for (let i = 0; i < this.burst.length; i++) {
      this.burst[i].x = Math.round(this.burstX[i]) * this.stride;
      this.burst[i].y = Math.round(this.burstY[i]) * this.stride;
    }
  }
}
