import { DESIGN_HEIGHT, DESIGN_WIDTH, type GlyphParticle, type PhysicsConfig } from "./types";
import { clamp, seededRandom } from "./math";

// The card text and the falling particle must be the same glyph, so both
// draw with this font. Changing it changes the physics too, because mass and
// drag area are measured from the rasterised ink.
export const GLYPH_FONT_SIZE = 10;
export const GLYPH_FONT = `${GLYPH_FONT_SIZE}px 'SFMono-Regular', Consolas, monospace`;

// ---------------------------------------------------------------------------
// Glyph metrics: ink area becomes mass, ink extent becomes drag area.
// ---------------------------------------------------------------------------

export interface GlyphMetrics {
  mass: number;
  dragArea: number;
  chord: number;
}

interface RawInk {
  area: number;
  width: number;
}

const FALLBACK_INK: RawInk = {
  area: GLYPH_FONT_SIZE * GLYPH_FONT_SIZE * 0.2,
  width: GLYPH_FONT_SIZE * 0.6,
};

const rawInkCache = new Map<string, RawInk>();
const metricsCache = new Map<string, GlyphMetrics>();
let averageInkArea = FALLBACK_INK.area;
let measureContext: CanvasRenderingContext2D | null | undefined;

const getMeasureContext = () => {
  if (measureContext !== undefined) return measureContext;
  if (typeof document === "undefined") {
    measureContext = null;
    return measureContext;
  }
  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 16;
  const context = canvas.getContext("2d");
  if (context) context.font = GLYPH_FONT;
  measureContext = context;
  return measureContext;
};

const measureRawInk = (char: string): RawInk => {
  const context = getMeasureContext();
  if (!context) return FALLBACK_INK;

  const metrics = context.measureText(char);
  const { actualBoundingBoxLeft, actualBoundingBoxRight } = metrics;
  const { actualBoundingBoxAscent, actualBoundingBoxDescent } = metrics;
  const hasHorizontalInk =
    Number.isFinite(actualBoundingBoxLeft) && Number.isFinite(actualBoundingBoxRight);
  const hasVerticalInk =
    Number.isFinite(actualBoundingBoxAscent) && Number.isFinite(actualBoundingBoxDescent);

  const inkWidth = hasHorizontalInk
    ? Math.abs(actualBoundingBoxLeft) + Math.abs(actualBoundingBoxRight)
    : metrics.width;
  const inkHeight = hasVerticalInk
    ? Math.abs(actualBoundingBoxAscent) + Math.abs(actualBoundingBoxDescent)
    : GLYPH_FONT_SIZE * 0.62;

  return {
    area: Math.max(0.6, inkWidth * inkHeight),
    width: Math.max(1.2, inkWidth),
  };
};

/**
 * Measure every distinct character once and normalise against their mean, so
 * `.` reads as light and `W` reads as heavy regardless of the font in use.
 * Cheap enough to redo on every reset: the code card holds ~60 unique chars.
 */
export const primeGlyphMetrics = (chars: Iterable<string>) => {
  const distinct = new Set(chars);
  let total = 0;
  let count = 0;
  distinct.forEach((char) => {
    let raw = rawInkCache.get(char);
    if (!raw) {
      raw = measureRawInk(char);
      rawInkCache.set(char, raw);
    }
    total += raw.area;
    count += 1;
  });
  averageInkArea = count > 0 ? total / count : FALLBACK_INK.area;
  metricsCache.clear();
};

export const getGlyphMetrics = (char: string, variance: number): GlyphMetrics => {
  const spread = clamp(variance, 0, 1.5);
  const key = `${char}|${spread.toFixed(2)}`;
  const cached = metricsCache.get(key);
  if (cached) return cached;

  let raw = rawInkCache.get(char);
  if (!raw) {
    raw = measureRawInk(char);
    rawInkCache.set(char, raw);
  }

  // `variance` at 0 makes every glyph identical; at 1 the measured ink ratio
  // applies in full. Terminal velocity scales as sqrt(mass / dragArea), so a
  // thin glyph settles noticeably slower than a dense one.
  const inkRatio = clamp(raw.area / Math.max(0.6, averageInkArea), 0.25, 2.2);
  const shaped = Math.max(0.15, 1 + (inkRatio - 1) * spread);
  const metrics: GlyphMetrics = {
    mass: 0.35 + 0.65 * shaped,
    dragArea: 0.55 + 0.45 * Math.sqrt(shaped),
    chord: Math.max(2.4, raw.width),
  };
  metricsCache.set(key, metrics);
  return metrics;
};

// ---------------------------------------------------------------------------
// Air: a divergence-free velocity field, so neighbouring glyphs share an eddy
// instead of each jittering on its own sine.
// ---------------------------------------------------------------------------

const AIR_COLUMNS = 24;
const AIR_ROWS = 32;
const AIR_REFRESH = 1 / 20;
const AIR_CELL_WIDTH = DESIGN_WIDTH / (AIR_COLUMNS - 1);
const AIR_CELL_HEIGHT = DESIGN_HEIGHT / (AIR_ROWS - 1);

const BASE_LARGE_FREQUENCY = 1 / 90;
const BASE_SMALL_FREQUENCY = 1 / 34;
const LARGE_SPEED = 22;
const SMALL_SPEED = 9;

/**
 * Curl of a scalar potential: u = dPsi/dy, v = -dPsi/dx. Taking the analytic
 * derivative keeps the field exactly divergence free, which is what makes the
 * plume rotate as a body rather than scatter. Sampled onto a coarse grid at
 * 20Hz and bilinearly interpolated, so cost does not scale with glyph count.
 */
export class AirField {
  private readonly velocities = new Float32Array(AIR_COLUMNS * AIR_ROWS * 2);
  private readonly phases: [number, number, number, number];
  private sampledAt = Number.NEGATIVE_INFINITY;
  private strength = 1;
  private scale = 1;

  constructor(seed: number) {
    this.phases = [
      seededRandom(seed + 301) * Math.PI * 2,
      seededRandom(seed + 302) * Math.PI * 2,
      seededRandom(seed + 303) * Math.PI * 2,
      seededRandom(seed + 304) * Math.PI * 2,
    ];
  }

  update(time: number, strength: number, scale: number) {
    const safeScale = clamp(scale, 0.4, 2.5);
    const safeStrength = Math.max(0, strength);
    const settingsChanged = safeStrength !== this.strength || safeScale !== this.scale;
    if (!settingsChanged && time - this.sampledAt < AIR_REFRESH) return;

    this.strength = safeStrength;
    this.scale = safeScale;
    this.sampledAt = time;

    // Larger `scale` means larger eddies, so the spatial frequency drops.
    const largeX = BASE_LARGE_FREQUENCY / safeScale;
    const largeY = largeX * 1.3;
    const smallY = BASE_SMALL_FREQUENCY / safeScale;
    const smallX = smallY * 0.7;

    // Amplitudes are chosen so the curl comes out in px/s directly.
    const largeAmplitude = (34 * safeStrength) / largeY;
    const smallAmplitude = (13 * safeStrength) / smallY;

    const [p0, p1, p2, p3] = this.phases;
    const largePhaseX = time * LARGE_SPEED * largeX + p0;
    const largePhaseY = -time * LARGE_SPEED * largeY * 0.7 + p1;
    const smallPhaseX = -time * SMALL_SPEED * smallX + p2;
    const smallPhaseY = time * SMALL_SPEED * smallY * 1.1 + p3;

    for (let row = 0; row < AIR_ROWS; row += 1) {
      const y = row * AIR_CELL_HEIGHT;
      const largeCosY = Math.cos(y * largeY + largePhaseY);
      const largeSinY = Math.sin(y * largeY + largePhaseY);
      const smallCosY = Math.cos(y * smallY + smallPhaseY);
      const smallSinY = Math.sin(y * smallY + smallPhaseY);

      for (let column = 0; column < AIR_COLUMNS; column += 1) {
        const x = column * AIR_CELL_WIDTH;
        const largeSinX = Math.sin(x * largeX + largePhaseX);
        const largeCosX = Math.cos(x * largeX + largePhaseX);
        const smallSinX = Math.sin(x * smallX + smallPhaseX);
        const smallCosX = Math.cos(x * smallX + smallPhaseX);

        const u =
          -largeAmplitude * largeY * largeSinX * largeSinY -
          smallAmplitude * smallY * smallSinX * smallSinY;
        const v =
          -largeAmplitude * largeX * largeCosX * largeCosY -
          smallAmplitude * smallX * smallCosX * smallCosY;

        const index = (row * AIR_COLUMNS + column) * 2;
        this.velocities[index] = u;
        this.velocities[index + 1] = v;
      }
    }
  }

  sampleInto(x: number, y: number, output: { x: number; y: number }) {
    const gridX = clamp(x / AIR_CELL_WIDTH, 0, AIR_COLUMNS - 1.0001);
    const gridY = clamp(y / AIR_CELL_HEIGHT, 0, AIR_ROWS - 1.0001);
    const column = Math.floor(gridX);
    const row = Math.floor(gridY);
    const fx = gridX - column;
    const fy = gridY - row;

    const topLeft = (row * AIR_COLUMNS + column) * 2;
    const topRight = topLeft + 2;
    const bottomLeft = topLeft + AIR_COLUMNS * 2;
    const bottomRight = bottomLeft + 2;

    const topX =
      this.velocities[topLeft] + (this.velocities[topRight] - this.velocities[topLeft]) * fx;
    const bottomX =
      this.velocities[bottomLeft] +
      (this.velocities[bottomRight] - this.velocities[bottomLeft]) * fx;
    const topY =
      this.velocities[topLeft + 1] +
      (this.velocities[topRight + 1] - this.velocities[topLeft + 1]) * fx;
    const bottomY =
      this.velocities[bottomLeft + 1] +
      (this.velocities[bottomRight + 1] - this.velocities[bottomLeft + 1]) * fx;
    output.x = topX + (bottomX - topX) * fy;
    output.y = topY + (bottomY - topY) * fy;
  }
}

// ---------------------------------------------------------------------------
// Flat-plate aerodynamics. Anisotropic drag plus a vn*vt torque term is what
// produces the catch / stall / slip / tumble cycle of real falling paper, so
// no hand-authored flutter sines are needed.
// ---------------------------------------------------------------------------

export const BASE_GRAVITY = 820;

// Averaged over a tumbling orientation the vertical drag is (kn + kt) * 4/(3*PI),
// so these two shares sum to 1 / (4/(3*PI)) and keep `terminalVelocity` honest.
const NORMAL_SHARE = 2.22;
const TANGENT_SHARE = 0.14;
const TILT_DRAG = 0.35;

const SPIN_TORQUE = 5e-4;
const SPIN_DAMP = 0.03;
const TILT_TORQUE = 1.5e-4;
const TILT_DAMP = 0.055;
// A plate is aerodynamically stable presenting a face to the viewer and
// unstable edge-on, so tilt rocks around face-on and only occasionally carries
// all the way through a flip. Without this it barrel-rolls continuously and
// the glyph reads as an illegible speck for most of the fall.
const TILT_RESTORE = 9e-4;

const MAX_ANGULAR_VELOCITY = 25;
const MAX_SPEED = 900;
const REBOUND_LIMIT = 0.14;
const WIND_ACCEL = 120;
const SHEAR_ACCEL = 26;
const SHEAR_START_Y = 320;

export const integrateGlyph = (
  glyph: GlyphParticle,
  config: PhysicsConfig,
  airX: number,
  airY: number,
  centerPull: number,
  dt: number,
) => {
  const gravity = BASE_GRAVITY * config.gravity;
  const terminal = clamp(config.terminalVelocity, 60, 400);
  // Isotropic-equivalent coefficient that reaches `terminal` under 1g.
  const dragScale = gravity / (terminal * terminal);
  const areaOverMass = glyph.dragArea / glyph.mass;

  // Forces act on the wind-relative velocity, so a glyph is carried by an
  // eddy rather than merely nudged by it.
  const relativeX = glyph.vx - airX;
  const relativeY = glyph.vy - airY;

  const cosRotation = Math.cos(glyph.rotation);
  const sinRotation = Math.sin(glyph.rotation);
  const normalX = -sinRotation;
  const normalY = cosRotation;
  const tangentX = cosRotation;
  const tangentY = sinRotation;

  const normalSpeed = relativeX * normalX + relativeY * normalY;
  const tangentSpeed = relativeX * tangentX + relativeY * tangentY;

  // A plate turned side-on to the flow catches more air. Kept as a weak
  // coupling so the calibrated terminal velocity only drifts by about +-18%.
  const tiltBoost = 1 + TILT_DRAG * (Math.abs(Math.sin(glyph.tilt)) - 0.5);
  const normalDrag = dragScale * NORMAL_SHARE * areaOverMass * tiltBoost;
  const tangentDrag = dragScale * TANGENT_SHARE * areaOverMass;

  const normalForce = -normalDrag * normalSpeed * Math.abs(normalSpeed);
  const tangentForce = -tangentDrag * tangentSpeed * Math.abs(tangentSpeed);

  // The plume widens as it falls, so the lateral wind gains a little depth shear.
  const shear = Math.max(0, glyph.y - SHEAR_START_Y) / DESIGN_HEIGHT;
  const lateralSign = glyph.x >= DESIGN_WIDTH / 2 ? 1 : -1;

  const accelerationX =
    normalForce * normalX +
    tangentForce * tangentX +
    config.wind * WIND_ACCEL +
    lateralSign * shear * SHEAR_ACCEL +
    centerPull;
  const accelerationY = normalForce * normalY + tangentForce * tangentY + gravity;

  glyph.vx += accelerationX * dt;
  glyph.vy += accelerationY * dt;

  // Displacement stays one-way: a catch beat may briefly lift the glyph, but
  // it can never climb back to where it broke away from the card.
  glyph.vy = Math.max(glyph.vy, -REBOUND_LIMIT * terminal);

  const speed = Math.hypot(glyph.vx, glyph.vy);
  if (speed > MAX_SPEED) {
    glyph.vx = (glyph.vx / speed) * MAX_SPEED;
    glyph.vy = (glyph.vy / speed) * MAX_SPEED;
  }

  glyph.x += glyph.vx * dt;
  glyph.y += glyph.vy * dt;
  if (glyph.y < glyph.releaseY) {
    glyph.y = glyph.releaseY;
    if (glyph.vy < 0) glyph.vy = 0;
  }

  const inertia = Math.max(0.4, (glyph.mass * glyph.chord * glyph.chord) / 12);
  const leverage = glyph.dragArea * glyph.chord;
  const relativeSpeed = Math.hypot(relativeX, relativeY);

  // In-plane spin: no torque when the plate meets the flow edge-on, maximum
  // torque when it is both catching air and sideslipping.
  const spinTorque =
    -SPIN_TORQUE * config.glyphTumble * leverage * normalSpeed * tangentSpeed -
    SPIN_DAMP *
      leverage *
      glyph.chord *
      glyph.rotationSpeed *
      (Math.abs(glyph.rotationSpeed) + 2);
  glyph.rotationSpeed = clamp(
    glyph.rotationSpeed + (spinTorque / inertia) * dt,
    -MAX_ANGULAR_VELOCITY,
    MAX_ANGULAR_VELOCITY,
  );
  glyph.rotation += glyph.rotationSpeed * dt;

  // Out-of-plane tilt: the same flow flips the plate towards and away from the
  // viewer, which a single screen-plane angle can never express.
  const tiltTorque =
    -TILT_TORQUE * config.glyphTilt * leverage * tangentSpeed * relativeSpeed -
    TILT_RESTORE * leverage * Math.sin(2 * glyph.tilt) * relativeSpeed * relativeSpeed -
    TILT_DAMP * leverage * glyph.chord * glyph.tiltSpeed * (Math.abs(glyph.tiltSpeed) + 2);
  glyph.tiltSpeed = clamp(
    glyph.tiltSpeed + (tiltTorque / inertia) * dt,
    -MAX_ANGULAR_VELOCITY,
    MAX_ANGULAR_VELOCITY,
  );
  glyph.tilt += glyph.tiltSpeed * dt;
};
