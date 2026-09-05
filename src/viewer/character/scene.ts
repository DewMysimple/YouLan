import {
  DEFAULT_PHYSICS,
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  SCENE_DURATION,
  type Butterfly,
  type ButterflyFlightMode,
  type CollapseMode,
  type Flower,
  type GlyphParticle,
  type PhysicsConfig,
  type SceneSnapshot,
  type ScenePointer,
  type Stage,
} from "./types";
import { clamp, easeInOut, easeOutCubic, seededRandom } from "./math";
import {
  AirField,
  GLYPH_FONT,
  getGlyphMetrics,
  integrateGlyph,
  primeGlyphMetrics,
} from "./glyphPhysics";

export { clamp, easeInOut, easeOutCubic, seededRandom };

const CODE_LINES = [
  "const snapshot = this.undoHistory.pop();",
  "if (!snapshot) return false;",
  "this.redoHistoryStack.push(this.captureSnapshot());",
  "this.applySnapshotToBuffer(snapshot);",
  "this.emit('history:undo', snapshot);",
  "renderVisibleRows(firstRow, rowCount);",
  "return this.textLinesByRow.slice(firstRow, firstRow + rowCount);",
  "// only the scrolled rows are tokenized; the rest stay plain text.",
  "// ReactiveDocumentStore keeps a small bus for each edit.",
  "const update = this.buffer.renderVisibleRows();",
  "if (update.changed) this.requestPaint();",
  "return update;",
];

const CODE_POSITIONS = CODE_LINES.flatMap((line, lineIndex) =>
  [...line].map((char, sourceColumn) => ({ char, sourceLine: lineIndex, sourceColumn })),
);

const PARTICLE_POSITIONS = CODE_POSITIONS.filter(({ char }) => char.trim().length > 0);

const CODE_PALETTE = [
  "#6f91c4",
  "#bf6f5f",
  "#8e9d6a",
  "#aa8a6c",
  "#7b7771",
  "#c58a62",
];

// Card text and its falling particle must resolve to the same colour, or the
// glyph visibly changes hue at the moment it breaks away.
const getGlyphColor = (sourceLine: number, sourceColumn: number) =>
  CODE_PALETTE[(sourceLine * 7 + sourceColumn) % CODE_PALETTE.length];

const FLOWER_PALETTE = ["#bf8d8b", "#9aa89b", "#a8a0b8", "#c8a77f"];
const COLLAPSE_CENTER_X = DESIGN_WIDTH / 2;
const COLLAPSE_CENTER_Y = 304;
const FLOWER_ZONE_MIN_Y = 650;
const FLOWER_ZONE_MAX_Y = 776;
const BUTTERFLY_ZONE_TOP = 322;
const BUTTERFLY_ZONE_BOTTOM = 682;
const CODE_START_X = 104;
const CODE_START_Y = 104;
const CODE_CHAR_STEP = 6.35;
const CODE_LINE_STEP = 17;
const CARD_X = 54;
const CARD_Y = 62;
const CARD_WIDTH = 612;
const CARD_HEIGHT = 250;
const CARD_CACHE_HEIGHT = 340;
const MAX_CODE_COLUMN = Math.max(...CODE_LINES.map((line) => line.length - 1));
const COLLAPSE_FOCUS_COLUMN = Math.round(MAX_CODE_COLUMN / 2);
const COLLAPSE_FOCUS_LINE = 5;
const COLUMN_COLLAPSE_CORE_RADIUS = 2;
const COLUMN_COLLAPSE_OUTER_COLUMN_WIDTH = 1;
const COLUMN_COLLAPSE_CORE_STAGGER = 0.08;
const COLUMN_COLLAPSE_COLUMN_JITTER = 0.026;
const COLLAPSE_START_TIME = 0.95;
const SOURCE_GLYPH_FADE_DURATION = 0.18;

// Depth is a render-time projection about this point, so the physics stays
// planar and deterministic while near glyphs still sweep past faster.
const VANISH_X = DESIGN_WIDTH / 2;
const VANISH_Y = 200;
const DEPTH_SPREAD = 0.18;

// A fully foreshortened plate is a line, and broadside is its most common
// attitude, so glyphs would vanish for most of the fall. Clamp for legibility.
const MIN_FORESHORTEN = 0.55;

const BLUR_REFERENCE_SPEED = 260;
const BLUR_STEP = 0.012;
const BLUR_GHOSTS = 2;

const PHYSICS_DT = 1 / 180;
const AGENT_DT = 1 / 60;
const MAX_PHYSICS_STEPS = 48;
const BUTTERFLY_SAFE_MARGIN_X = 34;
const BUTTERFLY_SAFE_TOP = BUTTERFLY_ZONE_TOP - 74;
const BUTTERFLY_SAFE_BOTTOM = DESIGN_HEIGHT - 96;
const BUTTERFLY_SEPARATION_RADIUS = 26;
const SEPARATION_GRID_COLUMNS = Math.ceil(DESIGN_WIDTH / BUTTERFLY_SEPARATION_RADIUS);
const SEPARATION_GRID_ROWS = Math.ceil(DESIGN_HEIGHT / BUTTERFLY_SEPARATION_RADIUS);

type ParticleSource = (typeof PARTICLE_POSITIONS)[number];
type ParticleSourcePlan = {
  source: ParticleSource;
  collapsible: boolean;
};

type CardCache = {
  base: HTMLCanvasElement;
  source: HTMLCanvasElement;
  sourceContext: CanvasRenderingContext2D;
  scale: number;
};

type Point = { x: number; y: number };

export interface ScenePerformanceStats {
  liveGlyphs: number;
  retiredGlyphs: number;
  cardCacheBuilds: number;
  sourceGlyphDraws: number;
  separationCandidatePairs: number;
  separationResolvedPairs: number;
}

const getColumnCollapseGroup = (sourceColumn: number) => {
  const distance = Math.abs(sourceColumn - COLLAPSE_FOCUS_COLUMN);
  if (distance <= COLUMN_COLLAPSE_CORE_RADIUS) return 0;
  return (
    1 +
    Math.floor(
      (distance - COLUMN_COLLAPSE_CORE_RADIUS - 1) / COLUMN_COLLAPSE_OUTER_COLUMN_WIDTH,
    )
  );
};

export const STAGE_LABELS: Record<Stage, string> = {
  intro: "场景准备",
  falling: "字符掉落",
  morphing: "蝴蝶生成",
  bloom: "花朵生长",
};

const roundedRect = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) => {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
};

const drawCardBase = (context: CanvasRenderingContext2D) => {
  const cardBottom = CARD_Y + CARD_HEIGHT;

  context.shadowColor = "rgba(69, 61, 52, 0.13)";
  context.shadowBlur = 16;
  context.shadowOffsetY = 8;
  context.fillStyle = "rgba(255, 254, 249, 0.98)";
  roundedRect(context, CARD_X, CARD_Y, CARD_WIDTH, CARD_HEIGHT, 10);
  context.fill();
  context.shadowColor = "transparent";
  context.shadowBlur = 0;
  context.shadowOffsetY = 0;
  context.fillStyle = "rgba(255, 254, 249, 0.98)";
  context.beginPath();
  context.moveTo(344, cardBottom - 1);
  context.lineTo(360, cardBottom + 13);
  context.lineTo(376, cardBottom - 1);
  context.closePath();
  context.fill();

  context.fillStyle = "rgba(105, 96, 85, 0.18)";
  context.beginPath();
  context.arc(CARD_X + 18, CARD_Y + 18, 3, 0, Math.PI * 2);
  context.arc(CARD_X + 29, CARD_Y + 18, 3, 0, Math.PI * 2);
  context.arc(CARD_X + 40, CARD_Y + 18, 3, 0, Math.PI * 2);
  context.fill();

  context.font = GLYPH_FONT;
  context.textBaseline = "middle";
  CODE_LINES.forEach((_line, lineIndex) => {
    const y = CODE_START_Y + lineIndex * CODE_LINE_STEP;
    context.fillStyle = "rgba(128, 120, 109, 0.56)";
    context.textAlign = "right";
    context.fillText(String(lineIndex + 31), CARD_X + 34, y);
  });
};

const drawTitle = (context: CanvasRenderingContext2D, time: number) => {
  const titleProgress = easeOutCubic(clamp((time - 0.65) / 0.85, 0, 1));
  context.save();
  context.globalAlpha = 0.17 * titleProgress;
  context.fillStyle = "#6c6961";
  context.font = "600 44px 'STSong', 'Noto Serif SC', 'Songti SC', serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("也能妙笔生花", DESIGN_WIDTH / 2, 435);
  context.restore();
};

const getFlowerWindOffset = (flower: Flower, motionTime: number, windStrength: number) => {
  const naturalAmplitude = 2.5 + Math.abs(flower.sway) * 0.12;
  return (
    Math.sin(motionTime * 0.68 + flower.windPhase) * naturalAmplitude * (0.35 + windStrength)
  );
};

const getQuadraticPoint = (
  startX: number,
  startY: number,
  controlX: number,
  controlY: number,
  endX: number,
  endY: number,
  progress: number,
) => {
  const inverse = 1 - progress;
  return {
    x: inverse * inverse * startX + 2 * inverse * progress * controlX + progress * progress * endX,
    y: inverse * inverse * startY + 2 * inverse * progress * controlY + progress * progress * endY,
  };
};

const getFlowerPose = (
  flower: Flower,
  motionTime: number,
  windStrength: number,
  stemProgress = 1,
  includePointerOffset = true,
) => {
  const progress = clamp(stemProgress, 0, 1);
  const windOffset = getFlowerWindOffset(flower, motionTime, windStrength);
  const stemSway = flower.sway + windOffset;
  const bodyWind = windOffset * 0.35;
  const interactiveShift = includePointerOffset ? flower.pointerOffset : 0;
  const bodyShift = bodyWind + interactiveShift;
  const rootX = flower.x;
  const rootY = flower.groundY;
  const tipX = rootX + (stemSway * 0.45 + bodyShift) * progress;
  const tipY = rootY - flower.height * progress;

  return {
    rootX,
    rootY,
    controlX: rootX + (stemSway + bodyShift * 0.62) * progress,
    controlY: rootY - flower.height * 0.45 * progress,
    tipX,
    tipY,
  };
};

const getFlowerHeadPosition = (
  flower: Flower,
  motionTime: number,
  windStrength: number,
) => {
  const { tipX, tipY } = getFlowerPose(flower, motionTime, windStrength);
  return {
    x: tipX,
    y: tipY,
  };
};

const drawFlower = (
  context: CanvasRenderingContext2D,
  flower: Flower,
  motionTime: number,
  windStrength: number,
) => {
  if (!flower.activated || flower.stemProgress <= 0) return;

  const stemProgress = easeOutCubic(flower.stemProgress);
  const leafProgress = easeOutCubic(flower.leafProgress);
  const petalProgress = easeOutCubic(flower.petalProgress);
  const pose = getFlowerPose(flower, motionTime, windStrength, stemProgress);

  context.save();
  context.globalAlpha = 0.74 * stemProgress;
  context.strokeStyle = "rgba(111, 123, 107, 0.74)";
  context.lineWidth = 1.1;
  context.beginPath();
  context.moveTo(pose.rootX, pose.rootY);
  context.quadraticCurveTo(pose.controlX, pose.controlY, pose.tipX, pose.tipY);
  context.stroke();

  if (leafProgress > 0) {
    const upperLeaf = getQuadraticPoint(
      pose.rootX,
      pose.rootY,
      pose.controlX,
      pose.controlY,
      pose.tipX,
      pose.tipY,
      0.46,
    );
    const lowerLeaf = getQuadraticPoint(
      pose.rootX,
      pose.rootY,
      pose.controlX,
      pose.controlY,
      pose.tipX,
      pose.tipY,
      0.68,
    );
    context.fillStyle = "rgba(144, 157, 142, 0.58)";
    context.beginPath();
    context.ellipse(
      upperLeaf.x - 8,
      upperLeaf.y - 4 * leafProgress,
      12 * leafProgress,
      4.8 * leafProgress,
      -0.36,
      0,
      Math.PI * 2,
    );
    context.fill();
    context.beginPath();
    context.ellipse(
      lowerLeaf.x + 8,
      lowerLeaf.y - 4 * leafProgress,
      11 * leafProgress,
      4.4 * leafProgress,
      0.36,
      0,
      Math.PI * 2,
    );
    context.fill();
  }

  if (petalProgress <= 0) {
    context.restore();
    return;
  }

  const petalCount = 5;
  const petalLength = 12 * petalProgress;
  for (let index = 0; index < petalCount; index += 1) {
    const angle = (Math.PI * 2 * index) / petalCount - Math.PI / 2;
    context.globalAlpha = 0.74 * petalProgress;
    context.fillStyle = flower.color;
    context.strokeStyle = "rgba(104, 99, 92, 0.35)";
    context.lineWidth = 0.65;
    context.beginPath();
    const petalCenterDistance = petalLength * 0.7;
    context.ellipse(
      pose.tipX + Math.sin(angle) * petalCenterDistance,
      pose.tipY - Math.cos(angle) * petalCenterDistance,
      4.5 * petalProgress,
      petalLength,
      angle,
      0,
      Math.PI * 2,
    );
    context.fill();
    context.stroke();
  }
  context.fillStyle = "rgba(164, 133, 96, 0.78)";
  context.beginPath();
  context.arc(pose.tipX, pose.tipY, 2.1 * petalProgress, 0, Math.PI * 2);
  context.fill();
  context.restore();
};

/**
 * Depth is applied as a render-time projection about the vanishing point, so
 * the simulation stays planar and deterministic while near glyphs still sweep
 * across faster than far ones. Anything that needs to know where a glyph
 * *looks* like it is — the morph test, butterfly spawning — must use this.
 */
const projectGlyph = (glyph: GlyphParticle) => {
  const scale = 1 + glyph.depth;
  return {
    x: VANISH_X + (glyph.x - VANISH_X) * scale,
    y: VANISH_Y + (glyph.y - VANISH_Y) * scale,
    scale,
  };
};

const drawGlyphAt = (
  context: CanvasRenderingContext2D,
  char: string,
  x: number,
  y: number,
  rotation: number,
  tilt: number,
  scale: number,
  alpha: number,
) => {
  // cos(tilt) is the true foreshortening of a plate turning away from the
  // viewer. Held above a floor because a plate broadside to the airflow — its
  // most common attitude — would otherwise collapse to an invisible line.
  const facing = Math.cos(tilt);
  const direction = facing >= 0 ? 1 : -1;
  const foreshorten =
    direction * (MIN_FORESHORTEN + (1 - MIN_FORESHORTEN) * Math.abs(facing));
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);

  context.save();
  context.transform(
    cos * scale,
    sin * scale,
    -sin * scale * foreshorten,
    cos * scale * foreshorten,
    x,
    y,
  );
  context.globalAlpha = alpha;
  context.fillText(char, 0, 0);
  context.restore();
};

export const drawButterfly = (
  context: CanvasRenderingContext2D,
  butterfly: Butterfly,
) => {
  context.save();
  context.translate(butterfly.x, butterfly.y);
  context.rotate(butterfly.rotation);
  context.scale(butterfly.scale, butterfly.scale);
  context.globalAlpha = butterfly.alpha;
  context.strokeStyle = butterfly.color;
  context.fillStyle = "rgba(252, 249, 238, 0.2)";
  context.lineWidth = 1.05;

  const wingBeat = Math.sin(butterfly.wingPhase) * 0.12;
  const leftWing = 1 + wingBeat;
  const rightWing = 1 - wingBeat;

  context.beginPath();
  context.moveTo(-1, 0);
  context.bezierCurveTo(-12 * leftWing, -14, -22 * leftWing, -6, -15 * leftWing, 2);
  context.bezierCurveTo(-10 * leftWing, 8, -4, 7, -1, 2);
  context.closePath();
  context.fill();
  context.stroke();

  context.beginPath();
  context.moveTo(1, 0);
  context.bezierCurveTo(12 * rightWing, -14, 22 * rightWing, -6, 15 * rightWing, 2);
  context.bezierCurveTo(10 * rightWing, 8, 4, 7, 1, 2);
  context.closePath();
  context.fill();
  context.stroke();

  context.beginPath();
  context.moveTo(0, -5);
  context.lineTo(0, 7);
  context.stroke();
  context.beginPath();
  context.moveTo(0, -4);
  context.quadraticCurveTo(-4, -10, -6, -9);
  context.moveTo(0, -4);
  context.quadraticCurveTo(4, -10, 6, -9);
  context.stroke();
  context.restore();
};

export class SceneEngine {
  private config: PhysicsConfig;
  private time = 0;
  private motionTime = 0;
  private seed: number;
  private glyphs: GlyphParticle[] = [];
  private butterflies: Butterfly[] = [];
  private flowers: Flower[] = [];
  private viewport = { width: DESIGN_WIDTH, height: DESIGN_HEIGHT };
  private backgroundCanvas: HTMLCanvasElement | null = null;
  private renderScale = 1;
  private cardCache: CardCache | null = null;
  private pointer: ScenePointer | null = null;
  private accumulator = 0;
  private agentAccumulator = 0;
  private air: AirField;
  private readonly airSample: Point = { x: 0, y: 0 };
  private releaseQueue: GlyphParticle[] = [];
  private releaseCursor = 0;
  private liveGlyphs: GlyphParticle[] = [];
  private erosionPhaseA = 0;
  private erosionPhaseB = 0;
  private cardCacheBuilds = 0;
  private sourceGlyphDraws = 0;
  private separationCandidatePairs = 0;
  private separationResolvedPairs = 0;
  private readonly flowerHeadX = new Float64Array(36);
  private readonly flowerHeadY = new Float64Array(36);
  private readonly targetOccupancy = new Int16Array(36);
  private separationForceX = new Float64Array(0);
  private separationForceY = new Float64Array(0);
  private separationGridNext = new Int32Array(0);
  private separationCandidates = new Int32Array(0);
  private readonly separationGridHead = new Int32Array(
    SEPARATION_GRID_COLUMNS * SEPARATION_GRID_ROWS,
  );

  constructor(config: PhysicsConfig = DEFAULT_PHYSICS, seed = 47) {
    this.config = { ...config };
    this.seed = seed;
    this.air = new AirField(seed);
    this.reset(seed);
  }

  setViewport(width: number, height: number) {
    if (width === this.viewport.width && height === this.viewport.height) return;
    this.viewport = { width, height };
    this.backgroundCanvas = null;
  }

  setRenderScale(scale: number) {
    const nextScale = clamp(scale, 0.5, 6);
    if (Math.abs(nextScale - this.renderScale) < 0.01) return;
    this.renderScale = nextScale;
    this.cardCache = null;
  }

  setPointer(pointer: ScenePointer | null) {
    this.pointer = pointer;
  }

  setConfig(nextConfig: PhysicsConfig) {
    const particleCountChanged = nextConfig.particleCount !== this.config.particleCount;
    const collapseChanged =
      nextConfig.collapseMode !== this.config.collapseMode ||
      nextConfig.collapseDuration !== this.config.collapseDuration;
    // These three are baked into the glyphs at build time — release order,
    // per-character mass and the depth layer — so they need a rebuild. Every
    // other new parameter is a live coefficient read each step.
    const rebuildChanged =
      nextConfig.erosionIrregularity !== this.config.erosionIrregularity ||
      nextConfig.glyphMassVariance !== this.config.glyphMassVariance ||
      nextConfig.glyphDepth !== this.config.glyphDepth;
    this.config = { ...nextConfig };
    if (particleCountChanged || collapseChanged || rebuildChanged) {
      const currentTime = this.time;
      this.reset(this.seed);
      this.seek(currentTime);
    }
  }

  reset(seed = this.seed) {
    this.seed = seed;
    this.time = 0;
    this.motionTime = 0;
    this.accumulator = 0;
    this.agentAccumulator = 0;
    this.glyphs = [];
    this.releaseQueue = [];
    this.releaseCursor = 0;
    this.liveGlyphs = [];
    this.butterflies = [];
    this.flowers = [];
    this.backgroundCanvas = null;
    this.cardCache = null;
    this.air = new AirField(seed);
    this.erosionPhaseA = seededRandom(seed + 411) * Math.PI * 2;
    this.erosionPhaseB = seededRandom(seed + 412) * Math.PI * 2;
    this.buildFlowers();
    this.updateFlowerHeadCache();
    this.buildGlyphs();
    this.releaseQueue = this.glyphs
      .filter((glyph) => Number.isFinite(glyph.releaseAt))
      .sort((left, right) => left.releaseAt - right.releaseAt || left.id - right.id);
  }

  seek(targetTime: number) {
    const target = clamp(targetTime, 0, SCENE_DURATION);
    if (target === 0) {
      this.reset(this.seed);
      return;
    }

    // Scrubbing replays both physical layers with the same fixed steps used by
    // live playback, so butterfly state changes do not depend on refresh rate.
    this.reset(this.seed);
    let remaining = target;
    while (remaining > 0) {
      const step = Math.min(PHYSICS_DT, remaining);
      this.time = clamp(this.time + step, 0, SCENE_DURATION);
      this.motionTime += step;
      this.stepGlyphs(step);
      this.advanceAgents(step);
      remaining -= step;
    }
  }

  advance(realDelta: number) {
    const scaled = clamp(realDelta, 0, 0.25) * this.config.speed;
    if (scaled <= 0) return;
    this.accumulator += scaled;

    // Aerodynamic torque is a stiff term, so glyphs integrate at a fixed
    // 180Hz. That also makes the result independent of the display refresh
    // rate, which per-frame damping never was.
    let steps = 0;
    while (this.accumulator >= PHYSICS_DT && steps < MAX_PHYSICS_STEPS) {
      this.time = clamp(this.time + PHYSICS_DT, 0, SCENE_DURATION);
      this.motionTime += PHYSICS_DT;
      this.stepGlyphs(PHYSICS_DT);
      this.advanceAgents(PHYSICS_DT);
      this.accumulator -= PHYSICS_DT;
      steps += 1;
    }
    if (steps >= MAX_PHYSICS_STEPS) this.accumulator = 0;

    // `time` intentionally stops at eight seconds, while `motionTime` and the
    // fixed 60Hz ecological layer continue indefinitely.
  }

  private advanceAgents(delta: number) {
    this.agentAccumulator += delta;
    while (this.agentAccumulator + 1e-10 >= AGENT_DT) {
      this.stepAgents(AGENT_DT);
      this.agentAccumulator -= AGENT_DT;
      if (this.agentAccumulator < 0) this.agentAccumulator = 0;
    }
  }

  /** Read-only access for the calibration harness. Not used by the app. */
  debugGlyphs(): readonly GlyphParticle[] {
    return this.glyphs;
  }

  /** Read-only access for the calibration harness. Not used by the app. */
  debugFlowers(): readonly Flower[] {
    return this.flowers;
  }

  /** Read-only access for post-timeline motion checks in the harness. */
  debugButterflies(): readonly Butterfly[] {
    return this.butterflies;
  }

  /** Development-only counters for performance regression checks. */
  debugPerformance(): ScenePerformanceStats {
    return {
      liveGlyphs: this.liveGlyphs.length,
      retiredGlyphs: this.glyphs.filter((glyph) => glyph.retired).length,
      cardCacheBuilds: this.cardCacheBuilds,
      sourceGlyphDraws: this.sourceGlyphDraws,
      separationCandidatePairs: this.separationCandidatePairs,
      separationResolvedPairs: this.separationResolvedPairs,
    };
  }

  /** Compare the deterministic spatial grid against the former brute force. */
  debugSeparationComparison(strength = this.config.butterflySeparation) {
    this.computeButterflySeparation(strength);
    const bruteX = new Float64Array(this.butterflies.length);
    const bruteY = new Float64Array(this.butterflies.length);
    let brutePairs = 0;
    for (let first = 0; first < this.butterflies.length; first += 1) {
      const left = this.butterflies[first];
      if (left.alpha <= 0.04) continue;
      for (let second = first + 1; second < this.butterflies.length; second += 1) {
        const right = this.butterflies[second];
        if (right.alpha <= 0.04) continue;
        brutePairs += 1;
        this.accumulateButterflySeparation(
          first,
          second,
          strength,
          bruteX,
          bruteY,
        );
      }
    }
    let maxForceError = 0;
    for (let index = 0; index < this.butterflies.length; index += 1) {
      maxForceError = Math.max(
        maxForceError,
        Math.abs(this.separationForceX[index] - bruteX[index]),
        Math.abs(this.separationForceY[index] - bruteY[index]),
      );
    }
    return {
      maxForceError,
      candidatePairs: this.separationCandidatePairs,
      brutePairs,
    };
  }

  getSnapshot(): SceneSnapshot {
    return {
      time: this.time,
      stage: this.getStage(),
      activeGlyphs: this.liveGlyphs.filter((glyph) => glyph.alpha > 0.04).length,
      butterflies: this.butterflies.filter((butterfly) => butterfly.alpha > 0.04).length,
      flowers: this.flowers.filter((flower) => flower.activated && flower.petalProgress > 0.1).length,
      complete: this.time >= SCENE_DURATION,
    };
  }

  render(context: CanvasRenderingContext2D) {
    const width = this.viewport.width;
    const height = this.viewport.height;
    context.clearRect(0, 0, width, height);

    if (!this.backgroundCanvas) this.buildBackground();
    if (this.backgroundCanvas) context.drawImage(this.backgroundCanvas, 0, 0, width, height);
    this.drawCodeCard(context);
    drawTitle(context, this.time);
    this.flowers.forEach((flower) =>
      drawFlower(context, flower, this.motionTime, this.config.flowerWindStrength),
    );
    this.renderGlyphs(context);
    this.butterflies.forEach((butterfly) => drawButterfly(context, butterfly));
  }

  private stepGlyphs(delta: number) {
    const isColumnCollapse = this.config.collapseMode === "column-collapse";
    const isCenterCollapse = this.config.collapseMode === "center-collapse";
    let released = false;
    while (
      this.releaseCursor < this.releaseQueue.length &&
      this.time >= this.releaseQueue[this.releaseCursor].releaseAt
    ) {
      const glyph = this.releaseQueue[this.releaseCursor];
      this.releaseCursor += 1;
      glyph.active = true;
      glyph.retired = false;
      // Spawn at the cell centre: the card draws left-aligned, the particle
      // draws centred, so without this the glyph jumps half an advance.
      glyph.x = CODE_START_X + glyph.sourceColumn * CODE_CHAR_STEP + CODE_CHAR_STEP / 2;
      glyph.y = CODE_START_Y + glyph.sourceLine * CODE_LINE_STEP;
      glyph.releaseY = glyph.y;
      glyph.vx = isColumnCollapse
        ? (seededRandom(this.seed + glyph.sourceColumn * 2.61 + 41) - 0.5) * 2.1
        : (seededRandom(glyph.seed + 23) - 0.5) * 17;
      glyph.vy = isColumnCollapse
        ? 0.7 + seededRandom(this.seed + glyph.sourceColumn * 3.17 + 91) * 1.5
        : 0.5 + seededRandom(glyph.seed + 24) * 2.1;
      this.liveGlyphs.push(glyph);
      this.clearCachedSourceGlyph(glyph);
      released = true;
    }
    if (released) this.liveGlyphs.sort((left, right) => left.id - right.id);
    if (this.liveGlyphs.length === 0) return;

    this.air.update(
      this.motionTime,
      this.config.airTurbulence,
      this.config.airTurbulenceScale,
    );

    let writeIndex = 0;
    this.liveGlyphs.forEach((glyph) => {
      const glyphAge = Math.max(0, this.time - glyph.releaseAt);
      const centerPull = isCenterCollapse
        ? (COLLAPSE_CENTER_X - glyph.x) * this.config.centerAttraction * 1.6
        : 0;

      this.air.sampleInto(glyph.x, glyph.y, this.airSample);
      integrateGlyph(
        glyph,
        this.config,
        this.airSample.x,
        this.airSample.y,
        centerPull,
        delta,
      );

      const enoughDropTime = glyphAge >= 1.25;
      // Depth shifts where a glyph appears to be, so the flower zone test uses
      // the projected position the viewer actually sees.
      const projectedY = VANISH_Y + (glyph.y - VANISH_Y) * (1 + glyph.depth);
      const reachedFlowerZone = projectedY >= glyph.morphThresholdY;
      const safeFallback = this.time >= glyph.morphAt && projectedY >= FLOWER_ZONE_MIN_Y - 70;
      if (
        glyph.stage !== "morphing" &&
        enoughDropTime &&
        (reachedFlowerZone || safeFallback)
      ) {
        glyph.stage = "morphing";
        glyph.morphAt = this.time;
        glyph.morphProgress = 0;
        this.spawnButterfly(glyph);
      }

      if (glyph.stage === "morphing") {
        glyph.morphProgress = clamp(
          (this.time - glyph.morphAt) / this.config.morphDuration,
          0,
          1,
        );
        glyph.alpha = 1 - easeInOut(glyph.morphProgress);
        if (
          this.time >= SCENE_DURATION ||
          glyph.morphProgress >= 1 - 1e-9 ||
          this.time + 1e-9 >= glyph.morphAt + this.config.morphDuration
        ) {
          glyph.alpha = 0;
          glyph.retired = true;
          return;
        }
      } else {
        glyph.stage = "falling";
        // Fade in over the same window the card character fades out, so the
        // handover reads as one glyph coming loose instead of a hard swap.
        glyph.alpha = 0.96 * clamp(glyphAge / SOURCE_GLYPH_FADE_DURATION, 0, 1);
      }
      this.liveGlyphs[writeIndex] = glyph;
      writeIndex += 1;
    });
    this.liveGlyphs.length = writeIndex;
  }

  private stepAgents(delta: number) {
    this.updateFlowerPointer(delta);
    this.updateFlowerHeadCache();

    const pointer = this.config.pointerInteractionEnabled ? this.pointer : null;
    const pointerRadius = Math.max(1, this.config.butterflyPointerRadius);
    const pointerFalloff = Math.max(0.1, this.config.pointerFalloff);
    const attraction = clamp(this.config.butterflyFlowerAttraction, 0.15, 1.8);
    const orbitSpeed = clamp(this.config.butterflyOrbitSpeed, 0.2, 2.4);
    const flightSpeedScale = clamp(this.config.butterflyFlightSpeed, 0.35, 1.8);
    const tilt = (this.config.butterflyOrbitTilt * Math.PI) / 180;
    const tiltCos = Math.cos(tilt);
    const tiltSin = Math.sin(tilt);
    const separationStrength = clamp(this.config.butterflySeparation, 0, 1.5);
    this.computeButterflySeparation(separationStrength);
    this.targetOccupancy.fill(0);
    this.butterflies.forEach((butterfly) => {
      this.targetOccupancy[butterfly.targetFlowerId] += 1;
    });

    this.butterflies.forEach((butterfly, index) => {
      const age = Math.max(0, this.motionTime - butterfly.birthTime);
      this.updateButterflyFlightTarget(butterfly);
      butterfly.scale = butterfly.baseScale * this.config.butterflyScale;
      butterfly.flightPhase += delta * (0.52 + orbitSpeed * 0.18);

      const wingModeScale =
        butterfly.flightMode === "transfer"
          ? 1.12
          : butterfly.flightMode === "hover"
            ? 0.9
            : 1;
      butterfly.wingPhase +=
        delta * this.config.wingBeatFrequency * wingModeScale * Math.PI * 2;

      const toFlowerX = butterfly.targetX - butterfly.x;
      const toFlowerY = butterfly.targetY - butterfly.y;
      const flowerDistance = Math.hypot(toFlowerX, toFlowerY);
      const orbitRadiusX = Math.max(
        16,
        this.config.butterflyOrbitRadius * butterfly.orbitRadius,
      );
      const orbitRadiusY = Math.max(
        12,
        this.config.butterflyOrbitHeight * butterfly.orbitHeight,
      );

      let pointerInfluence = 0;
      let pointerDirectionX = 0;
      let pointerDirectionY = 0;
      if (pointer) {
        const fromPointerX = butterfly.x - pointer.x;
        const fromPointerY = butterfly.y - pointer.y;
        const pointerDistance = Math.hypot(fromPointerX, fromPointerY);
        if (pointerDistance < pointerRadius) {
          pointerInfluence = (1 - pointerDistance / pointerRadius) ** pointerFalloff;
          if (pointerDistance > 0.001) {
            pointerDirectionX = fromPointerX / pointerDistance;
            pointerDirectionY = fromPointerY / pointerDistance;
          } else {
            const fallbackAngle = butterfly.seed * 0.37;
            pointerDirectionX = Math.cos(fallbackAngle);
            pointerDirectionY = Math.sin(fallbackAngle);
          }
        }
      }

      if (pointerInfluence > 0.001) {
        butterfly.pointerEvading = true;
        if (Number.isFinite(butterfly.stateUntil)) butterfly.stateUntil += delta;
      } else if (butterfly.pointerEvading) {
        butterfly.pointerEvading = false;
        this.setButterflyMode(butterfly, "approach", Number.POSITIVE_INFINITY);
      }

      if (!butterfly.pointerEvading) {
        if (
          (butterfly.flightMode === "approach" || butterfly.flightMode === "transfer") &&
          flowerDistance <= Math.max(orbitRadiusX, orbitRadiusY) * 1.32
        ) {
          this.beginButterflyOrbit(butterfly);
        } else if (
          butterfly.flightMode === "orbit" &&
          this.motionTime >= butterfly.stateUntil
        ) {
          this.beginButterflyHover(butterfly);
        } else if (
          butterfly.flightMode === "hover" &&
          this.motionTime >= butterfly.stateUntil
        ) {
          this.beginButterflyTransfer(butterfly);
        }
      }

      let accelerationX = this.separationForceX[index];
      let accelerationY = this.separationForceY[index];
      let maxSpeed = 125 * flightSpeedScale;

      if (butterfly.flightMode === "orbit") {
        const relativeX = butterfly.x - butterfly.targetX;
        const relativeY = butterfly.y - butterfly.targetY;
        const localX = relativeX * tiltCos + relativeY * tiltSin;
        const localY = -relativeX * tiltSin + relativeY * tiltCos;
        const ellipseAngle = Math.atan2(localY / orbitRadiusY, localX / orbitRadiusX);
        const orbitWobble =
          1 +
          Math.sin(butterfly.flightPhase + butterfly.seed * 0.31) *
            this.config.butterflyOrbitWobble *
            0.42;
        const desiredLocalX = Math.cos(ellipseAngle) * orbitRadiusX * orbitWobble;
        const desiredLocalY = Math.sin(ellipseAngle) * orbitRadiusY * orbitWobble;
        const desiredOrbitX =
          butterfly.targetX + desiredLocalX * tiltCos - desiredLocalY * tiltSin;
        const desiredOrbitY =
          butterfly.targetY + desiredLocalX * tiltSin + desiredLocalY * tiltCos;
        const tangentLocalX = -Math.sin(ellipseAngle) * orbitRadiusX * butterfly.orbitDirection;
        const tangentLocalY = Math.cos(ellipseAngle) * orbitRadiusY * butterfly.orbitDirection;
        const tangentWorldX = tangentLocalX * tiltCos - tangentLocalY * tiltSin;
        const tangentWorldY = tangentLocalX * tiltSin + tangentLocalY * tiltCos;
        const tangentLength = Math.max(0.001, Math.hypot(tangentWorldX, tangentWorldY));
        const tangentSpeed = 58 * orbitSpeed * flightSpeedScale;
        const correctionScale = 1.75 + attraction * 0.8;
        const driftAmount = this.config.butterflyOrbitDrift * 4.5;
        const desiredVelocityX =
          (tangentWorldX / tangentLength) * tangentSpeed +
          (desiredOrbitX - butterfly.x) * correctionScale +
          Math.sin(butterfly.flightPhase * 0.73 + butterfly.seed) * driftAmount;
        const desiredVelocityY =
          (tangentWorldY / tangentLength) * tangentSpeed +
          (desiredOrbitY - butterfly.y) * correctionScale +
          Math.cos(butterfly.flightPhase * 0.61 + butterfly.seed * 0.7) * driftAmount;
        const response = 2.1 + attraction * 1.35;
        accelerationX += (desiredVelocityX - butterfly.vx) * response;
        accelerationY += (desiredVelocityY - butterfly.vy) * response;
        maxSpeed = Math.max(48, tangentSpeed * 1.55);
      } else if (butterfly.flightMode === "hover") {
        const hoverDrift = this.config.butterflyOrbitDrift * 3.2;
        const hoverTargetX =
          butterfly.targetX +
          butterfly.hoverOffsetX +
          Math.sin(butterfly.flightPhase + butterfly.seed) * hoverDrift;
        const hoverTargetY =
          butterfly.targetY +
          butterfly.hoverOffsetY +
          Math.cos(butterfly.flightPhase * 0.82 + butterfly.seed) * hoverDrift;
        const desiredVelocityX = clamp((hoverTargetX - butterfly.x) * 2.6, -38, 38);
        const desiredVelocityY = clamp((hoverTargetY - butterfly.y) * 2.6, -38, 38);
        accelerationX += (desiredVelocityX - butterfly.vx) * (3.4 + attraction);
        accelerationY += (desiredVelocityY - butterfly.vy) * (3.4 + attraction);
        maxSpeed = 42 * flightSpeedScale;
      } else {
        const isTransfer = butterfly.flightMode === "transfer";
        const arrivalRadius = isTransfer ? 190 : 145;
        const cruiseSpeed = (isTransfer ? 150 : 122) * flightSpeedScale;
        const approachSpeed = cruiseSpeed * clamp(flowerDistance / arrivalRadius, 0.2, 1);
        const inverseDistance = flowerDistance > 0.001 ? 1 / flowerDistance : 0;
        const desiredVelocityX = toFlowerX * inverseDistance * approachSpeed;
        const desiredVelocityY = toFlowerY * inverseDistance * approachSpeed;
        const response =
          2.45 +
          attraction * 1.55 +
          (butterfly.flightMode === "approach"
            ? this.config.butterflyPointerReturn * 0.5
            : 0);
        accelerationX += (desiredVelocityX - butterfly.vx) * response;
        accelerationY += (desiredVelocityY - butterfly.vy) * response;
        maxSpeed = cruiseSpeed;
      }

      if (pointerInfluence > 0) {
        const repulsion =
          390 * this.config.butterflyPointerRepulsion * pointerInfluence;
        const retainBehavior = 1 - pointerInfluence * 0.82;
        accelerationX = accelerationX * retainBehavior + pointerDirectionX * repulsion;
        accelerationY = accelerationY * retainBehavior + pointerDirectionY * repulsion;
        maxSpeed = Math.max(maxSpeed, 175 * flightSpeedScale);
      }

      accelerationX += this.config.wind * 7;
      this.applyButterflyBoundarySteering(butterfly, (x, y) => {
        accelerationX += x;
        accelerationY += y;
      });

      const accelerationLength = Math.hypot(accelerationX, accelerationY);
      const maxAcceleration = pointerInfluence > 0 ? 520 : 390;
      if (accelerationLength > maxAcceleration) {
        accelerationX = (accelerationX / accelerationLength) * maxAcceleration;
        accelerationY = (accelerationY / accelerationLength) * maxAcceleration;
      }

      butterfly.vx += accelerationX * delta;
      butterfly.vy += accelerationY * delta;
      const damping = Math.exp(-0.16 * delta);
      butterfly.vx *= damping;
      butterfly.vy *= damping;
      const speed = Math.hypot(butterfly.vx, butterfly.vy);
      if (speed > maxSpeed) {
        butterfly.vx = (butterfly.vx / speed) * maxSpeed;
        butterfly.vy = (butterfly.vy / speed) * maxSpeed;
      }

      butterfly.x += butterfly.vx * delta;
      butterfly.y += butterfly.vy * delta;
      this.keepButterflyInEmergencyBounds(butterfly);

      const headingSpeed = Math.hypot(butterfly.vx, butterfly.vy);
      if (headingSpeed > 4) {
        const desiredRotation = Math.atan2(butterfly.vy, butterfly.vx) + Math.PI / 2;
        const turn = Math.atan2(
          Math.sin(desiredRotation - butterfly.rotation),
          Math.cos(desiredRotation - butterfly.rotation),
        );
        butterfly.rotation += turn * (1 - Math.exp(-5.2 * delta));
      }
      butterfly.alpha = 0.9 * easeOutCubic(clamp(age / 0.34, 0, 1));

      if (!butterfly.flowerLinked && (flowerDistance < 112 || age > 1.65)) {
        butterfly.flowerLinked = true;
        this.activateFlower(
          butterfly.homeFlowerId,
          this.time + 0.1 + seededRandom(butterfly.seed) * 0.15,
        );
      }
    });

    this.flowers.forEach((flower) => {
      if (!flower.activated || this.time < flower.triggerAt) return;
      const age = this.time - flower.triggerAt;
      flower.stemProgress = clamp(age / 1.6, 0, 1);
      flower.leafProgress = clamp((age - 0.42) / 1.35, 0, 1);
      flower.petalProgress = clamp((age - 0.92) / 1.08, 0, 1);
    });
  }

  private ensureSeparationCapacity(count: number) {
    if (this.separationForceX.length >= count) return;
    this.separationForceX = new Float64Array(count);
    this.separationForceY = new Float64Array(count);
    this.separationGridNext = new Int32Array(count);
    this.separationCandidates = new Int32Array(count);
  }

  private getSeparationCell(x: number, y: number) {
    const column = clamp(
      Math.floor(x / BUTTERFLY_SEPARATION_RADIUS),
      0,
      SEPARATION_GRID_COLUMNS - 1,
    );
    const row = clamp(
      Math.floor(y / BUTTERFLY_SEPARATION_RADIUS),
      0,
      SEPARATION_GRID_ROWS - 1,
    );
    return row * SEPARATION_GRID_COLUMNS + column;
  }

  private accumulateButterflySeparation(
    first: number,
    second: number,
    strength: number,
    forceX: Float64Array,
    forceY: Float64Array,
  ) {
    const left = this.butterflies[first];
    const right = this.butterflies[second];
    const distanceX = left.x - right.x;
    const distanceY = left.y - right.y;
    const distanceSquared = distanceX * distanceX + distanceY * distanceY;
    if (distanceSquared >= BUTTERFLY_SEPARATION_RADIUS * BUTTERFLY_SEPARATION_RADIUS) {
      return false;
    }
    const distance = Math.hypot(distanceX, distanceY);
    const fallbackAngle = (left.seed + right.seed) * 0.19;
    const directionX = distance > 0.001 ? distanceX / distance : Math.cos(fallbackAngle);
    const directionY = distance > 0.001 ? distanceY / distance : Math.sin(fallbackAngle);
    const influence = (1 - distance / BUTTERFLY_SEPARATION_RADIUS) ** 2;
    const force = influence * 210 * strength;
    forceX[first] += directionX * force;
    forceY[first] += directionY * force;
    forceX[second] -= directionX * force;
    forceY[second] -= directionY * force;
    return true;
  }

  private computeButterflySeparation(strength: number) {
    const count = this.butterflies.length;
    this.ensureSeparationCapacity(count);
    this.separationForceX.fill(0, 0, count);
    this.separationForceY.fill(0, 0, count);
    this.separationCandidatePairs = 0;
    this.separationResolvedPairs = 0;
    if (strength <= 0 || count === 0) return;

    this.separationGridHead.fill(-1);
    this.separationGridNext.fill(-1, 0, count);
    for (let index = 0; index < count; index += 1) {
      const butterfly = this.butterflies[index];
      if (butterfly.alpha <= 0.04) continue;
      const cell = this.getSeparationCell(butterfly.x, butterfly.y);
      this.separationGridNext[index] = this.separationGridHead[cell];
      this.separationGridHead[cell] = index;
    }

    for (let first = 0; first < count; first += 1) {
      const left = this.butterflies[first];
      if (left.alpha <= 0.04) continue;
      const column = clamp(
        Math.floor(left.x / BUTTERFLY_SEPARATION_RADIUS),
        0,
        SEPARATION_GRID_COLUMNS - 1,
      );
      const row = clamp(
        Math.floor(left.y / BUTTERFLY_SEPARATION_RADIUS),
        0,
        SEPARATION_GRID_ROWS - 1,
      );
      let candidateCount = 0;
      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        const candidateRow = row + offsetY;
        if (candidateRow < 0 || candidateRow >= SEPARATION_GRID_ROWS) continue;
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          const candidateColumn = column + offsetX;
          if (
            candidateColumn < 0 ||
            candidateColumn >= SEPARATION_GRID_COLUMNS
          ) {
            continue;
          }
          let second =
            this.separationGridHead[
              candidateRow * SEPARATION_GRID_COLUMNS + candidateColumn
            ];
          while (second >= 0) {
            if (second > first) {
              this.separationCandidates[candidateCount] = second;
              candidateCount += 1;
            }
            second = this.separationGridNext[second];
          }
        }
      }
      this.separationCandidates.subarray(0, candidateCount).sort();
      for (let candidate = 0; candidate < candidateCount; candidate += 1) {
        const second = this.separationCandidates[candidate];
        this.separationCandidatePairs += 1;
        if (
          this.accumulateButterflySeparation(
            first,
            second,
            strength,
            this.separationForceX,
            this.separationForceY,
          )
        ) {
          this.separationResolvedPairs += 1;
        }
      }
    }
  }

  private setButterflyMode(
    butterfly: Butterfly,
    mode: ButterflyFlightMode,
    stateUntil: number,
  ) {
    butterfly.flightMode = mode;
    butterfly.stateStartedAt = this.motionTime;
    butterfly.stateUntil = stateUntil;
  }

  private beginButterflyOrbit(butterfly: Butterfly) {
    butterfly.visitCount += 1;
    const durationVariance =
      0.75 + seededRandom(butterfly.seed + butterfly.visitCount * 41.7 + 72) * 0.5;
    const duration = this.config.butterflyVisitDuration * durationVariance;
    this.setButterflyMode(butterfly, "orbit", this.motionTime + duration);
  }

  private beginButterflyHover(butterfly: Butterfly) {
    const visitSeed = butterfly.seed + butterfly.visitCount * 57.3;
    const angle = seededRandom(visitSeed + 81) * Math.PI * 2;
    const radius = 14 + seededRandom(visitSeed + 82) * 10;
    butterfly.hoverOffsetX = Math.cos(angle) * radius;
    butterfly.hoverOffsetY = Math.sin(angle) * radius * 0.72;
    const duration = 0.8 + seededRandom(visitSeed + 83) * 0.8;
    this.setButterflyMode(butterfly, "hover", this.motionTime + duration);
  }

  private beginButterflyTransfer(butterfly: Butterfly) {
    const currentFlowerId = butterfly.targetFlowerId;
    const nextFlowerId = this.chooseNextFlower(butterfly);
    if (nextFlowerId === currentFlowerId) {
      this.beginButterflyOrbit(butterfly);
      return;
    }
    butterfly.previousFlowerId = currentFlowerId;
    butterfly.targetFlowerId = nextFlowerId;
    this.targetOccupancy[currentFlowerId] -= 1;
    this.targetOccupancy[nextFlowerId] += 1;
    butterfly.flowerOffsetX =
      (seededRandom(butterfly.seed + butterfly.visitCount * 73.1 + 91) - 0.5) * 10;
    this.setButterflyMode(butterfly, "transfer", Number.POSITIVE_INFINITY);
    this.updateButterflyFlightTarget(butterfly);
  }

  private chooseNextFlower(butterfly: Butterfly) {
    const transferRange = 180 + this.config.butterflyOrbitDrift * 90;
    const currentX = butterfly.targetX;
    const currentY = butterfly.targetY;
    const candidates = this.flowers
      .filter(
        (flower) =>
          flower.id !== butterfly.targetFlowerId &&
          flower.id !== butterfly.previousFlowerId &&
          flower.activated &&
          flower.petalProgress >= 0.7,
      )
      .map((flower) => {
        return {
          id: flower.id,
          distance: Math.hypot(
            this.flowerHeadX[flower.id] - currentX,
            this.flowerHeadY[flower.id] - currentY,
          ),
        };
      })
      .sort((left, right) => left.distance - right.distance || left.id - right.id);

    const nearby = candidates.filter(({ distance }) => distance <= transferRange).slice(0, 6);
    const pool = nearby.length > 0 ? nearby : candidates.slice(0, 6);
    if (pool.length === 0) return butterfly.targetFlowerId;

    const weights = pool.map(
      ({ id, distance }) =>
        1 / ((distance + 60) * (1 + this.targetOccupancy[id] * 0.45)),
    );
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    let selector =
      seededRandom(butterfly.seed + butterfly.visitCount * 101.3 + 509) * totalWeight;
    for (let index = 0; index < pool.length; index += 1) {
      selector -= weights[index];
      if (selector <= 0) return pool[index].id;
    }
    return pool[pool.length - 1].id;
  }

  private applyButterflyBoundarySteering(
    butterfly: Butterfly,
    addForce: (x: number, y: number) => void,
  ) {
    const boundaryBand = 68;
    let forceX = 0;
    let forceY = 0;
    if (butterfly.x < BUTTERFLY_SAFE_MARGIN_X + boundaryBand) {
      forceX += (BUTTERFLY_SAFE_MARGIN_X + boundaryBand - butterfly.x) * 4.8;
    }
    if (butterfly.x > DESIGN_WIDTH - BUTTERFLY_SAFE_MARGIN_X - boundaryBand) {
      forceX -=
        (butterfly.x - (DESIGN_WIDTH - BUTTERFLY_SAFE_MARGIN_X - boundaryBand)) * 4.8;
    }
    if (butterfly.y < BUTTERFLY_SAFE_TOP + boundaryBand) {
      forceY += (BUTTERFLY_SAFE_TOP + boundaryBand - butterfly.y) * 4.8;
    }
    if (butterfly.y > BUTTERFLY_SAFE_BOTTOM - boundaryBand) {
      forceY -= (butterfly.y - (BUTTERFLY_SAFE_BOTTOM - boundaryBand)) * 4.8;
    }
    addForce(forceX, forceY);
  }

  private keepButterflyInEmergencyBounds(butterfly: Butterfly) {
    const minimumX = 12;
    const maximumX = DESIGN_WIDTH - 12;
    const minimumY = BUTTERFLY_ZONE_TOP - 92;
    const maximumY = DESIGN_HEIGHT - 82;
    if (butterfly.x < minimumX || butterfly.x > maximumX) {
      butterfly.x = clamp(butterfly.x, minimumX, maximumX);
      butterfly.vx *= -0.35;
    }
    if (butterfly.y < minimumY || butterfly.y > maximumY) {
      butterfly.y = clamp(butterfly.y, minimumY, maximumY);
      butterfly.vy *= -0.35;
    }
  }

  private getStage(): Stage {
    const collapseEnd = COLLAPSE_START_TIME + this.getCollapseReleaseSpan();
    const morphEnd = Math.min(SCENE_DURATION - 1.1, collapseEnd + 1.5);
    if (this.time < COLLAPSE_START_TIME) return "intro";
    if (this.time < collapseEnd) return "falling";
    if (this.time < morphEnd) return "morphing";
    return "bloom";
  }

  private getCollapseReleaseSpan() {
    const configuredDuration = clamp(this.config.collapseDuration, 1.4, 4.8);
    return this.config.collapseMode === "local-collapse" ||
      this.config.collapseMode === "column-collapse"
      ? configuredDuration
      : Math.max(1.5, configuredDuration * 0.72);
  }

  private buildGlyphs() {
    const count = Math.round(this.config.particleCount);
    const sources = this.getParticleSources(count, this.config.collapseMode);
    primeGlyphMetrics(PARTICLE_POSITIONS.map((position) => position.char));
    const depthSpread = DEPTH_SPREAD * clamp(this.config.glyphDepth, 0, 1.5);
    for (let index = 0; index < count; index += 1) {
      const seed = this.seed + index * 17.31;
      const sourcePlan = sources[index];
      const source = sourcePlan.source;
      const metrics = getGlyphMetrics(source.char, this.config.glyphMassVariance);
      const collapseOrder = this.getCollapseOrder(source, this.config.collapseMode);
      const releaseOrder = sourcePlan.collapsible
        ? this.getIndependentReleaseOrder(collapseOrder, seed, this.config.collapseMode)
        : collapseOrder;
      const releaseSpan = this.getCollapseReleaseSpan();
      const releaseAt = sourcePlan.collapsible
        ? COLLAPSE_START_TIME + releaseOrder * releaseSpan
        : Number.POSITIVE_INFINITY;
      this.glyphs.push({
        id: index,
        char: source.char,
        x: DESIGN_WIDTH / 2,
        y: 314,
        vx: 0,
        vy: 0,
        rotation: (seededRandom(seed + 4) - 0.5) * 0.6,
        rotationSpeed: (seededRandom(seed + 5) - 0.5) * 2.4,
        tilt: (seededRandom(seed + 25) - 0.5) * 0.9,
        tiltSpeed: (seededRandom(seed + 26) - 0.5) * 2.8,
        depth: (seededRandom(seed + 27) - 0.5) * 2 * depthSpread,
        mass: metrics.mass,
        dragArea: metrics.dragArea,
        chord: metrics.chord,
        releaseY: CODE_START_Y + source.sourceLine * CODE_LINE_STEP,
        color: getGlyphColor(source.sourceLine, source.sourceColumn),
        alpha: 0,
        stage: "intro",
        releaseAt,
        // The safety fallback must sit past the natural fall time, or it would
        // cut the (now slower) descent short before the glyph reaches the bed.
        morphAt: sourcePlan.collapsible
          ? releaseAt + 2.9 + seededRandom(seed + 7) * 0.28
          : Number.POSITIVE_INFINITY,
        morphThresholdY:
          FLOWER_ZONE_MIN_Y + seededRandom(seed + 8) * (FLOWER_ZONE_MAX_Y - FLOWER_ZONE_MIN_Y),
        morphProgress: 0,
        seed,
        sourceLine: source.sourceLine,
        sourceColumn: source.sourceColumn,
        active: false,
        retired: false,
        flowerLinked: false,
      });
    }
  }

  private getCollapseOrder(
    source: { sourceLine: number; sourceColumn: number },
    mode: CollapseMode,
  ) {
    const centeredColumnDistance =
      Math.abs(source.sourceColumn - MAX_CODE_COLUMN / 2) / Math.max(1, MAX_CODE_COLUMN / 2);
    const rowProgress = source.sourceLine / Math.max(1, CODE_LINES.length - 1);

    if (mode === "local-collapse") {
      const signedColumnDistance = source.sourceColumn - COLLAPSE_FOCUS_COLUMN;
      const signedRowDistance = (source.sourceLine - COLLAPSE_FOCUS_LINE) * 2.65;
      const localDistance = Math.hypot(signedColumnDistance, signedRowDistance);
      const maxDistance = Math.max(
        Math.hypot(COLLAPSE_FOCUS_COLUMN, COLLAPSE_FOCUS_LINE * 2.65),
        Math.hypot(MAX_CODE_COLUMN - COLLAPSE_FOCUS_COLUMN, (CODE_LINES.length - 1 - COLLAPSE_FOCUS_LINE) * 2.65),
      );
      // Modulating the front radius by angle turns the breach from a tidy
      // ellipse into a lobed hole that eats outward unevenly.
      const erosion = clamp(this.config.erosionIrregularity, 0, 1);
      const angle = Math.atan2(signedRowDistance, signedColumnDistance);
      const radiusScale =
        1 +
        erosion * 0.34 * Math.sin(angle * 3 + this.erosionPhaseA) +
        erosion * 0.18 * Math.sin(angle * 5.7 + this.erosionPhaseB);
      const shapedDistance = localDistance / Math.max(0.35, radiusScale);
      const normalizedDistance = clamp(
        (shapedDistance - 1.2) / Math.max(1, maxDistance - 1.2),
        0,
        1,
      );
      // Hold the breach close to its origin, then let the failure front
      // travel outward. This keeps the early gap readable instead of
      // turning the card into a full-width particle burst.
      return normalizedDistance ** 1.38;
    }
    if (mode === "column-collapse") {
      return this.getColumnCollapseReleaseOrder(source.sourceColumn);
    }
    if (mode === "wave-collapse") {
      return clamp(centeredColumnDistance * 0.68 + rowProgress * 0.32, 0, 1);
    }

    const sourceX = CODE_START_X + source.sourceColumn * CODE_CHAR_STEP;
    const sourceY = CODE_START_Y + source.sourceLine * CODE_LINE_STEP;
    return clamp(
      Math.hypot(sourceX - COLLAPSE_CENTER_X, sourceY - COLLAPSE_CENTER_Y) / 300,
      0,
      1,
    );
  }

  private getIndependentReleaseOrder(collapseOrder: number, seed: number, mode: CollapseMode) {
    if (mode === "column-collapse") return collapseOrder;

    // Spatial propagation gives the collapse its local breach. A second,
    // character-specific component prevents equal-distance glyphs from
    // releasing as a visible row or a three-character batch.
    //
    // The jitter is additive and local rather than a blend against the whole
    // span: blending let a centre glyph and an edge glyph release at nearly
    // the same time, which dissolved the entire card at once instead of
    // opening one hole that grows. This width still scatters neighbours by a
    // few tenths of a second, which is what breaks up the rows.
    const characterNoise = seededRandom(seed + 29) - 0.5;
    const jitterWidth = mode === "local-collapse" ? 0.12 : 0.09;
    return clamp(collapseOrder + characterNoise * jitterWidth, 0, 1);
  }

  private getColumnCollapseReleaseOrder(sourceColumn: number) {
    const signedOffset = sourceColumn - COLLAPSE_FOCUS_COLUMN;
    const distance = Math.abs(signedOffset);
    const maxDistance = Math.max(
      COLLAPSE_FOCUS_COLUMN,
      MAX_CODE_COLUMN - COLLAPSE_FOCUS_COLUMN,
    );
    const columnNoise =
      (seededRandom(this.seed + sourceColumn * 13.17 + 204) - 0.5) *
      COLUMN_COLLAPSE_COLUMN_JITTER;

    if (distance <= COLUMN_COLLAPSE_CORE_RADIUS) {
      // Open the initial breach from the center, then let its neighboring
      // columns follow in a short, readable leak instead of one shared burst.
      const coreRank =
        distance === 0
          ? 0
          : distance === 1
            ? signedOffset < 0
              ? 1
              : 2
            : signedOffset < 0
              ? 3
              : 4;
      return clamp(
        (coreRank / 4) * COLUMN_COLLAPSE_CORE_STAGGER + columnNoise * 0.35,
        0,
        1,
      );
    }

    const outerDistance = distance - COLUMN_COLLAPSE_CORE_RADIUS;
    const outerMaxDistance = Math.max(1, maxDistance - COLUMN_COLLAPSE_CORE_RADIUS);
    const sideBias = signedOffset > 0 ? 0.012 : -0.012;
    const outwardProgress = outerDistance / outerMaxDistance;
    return clamp(
      COLUMN_COLLAPSE_CORE_STAGGER +
        outwardProgress * (1 - COLUMN_COLLAPSE_CORE_STAGGER) +
        sideBias +
        columnNoise,
      0,
      1,
    );
  }

  private getParticleSources(count: number, mode: CollapseMode): ParticleSourcePlan[] {
    const sampledSources = Array.from({ length: count }, (_, index) => ({
      source:
        PARTICLE_POSITIONS[
          Math.min(
            PARTICLE_POSITIONS.length - 1,
            Math.floor((index * PARTICLE_POSITIONS.length) / count),
          )
        ],
      collapsible: true,
    }));
    if (mode !== "column-collapse") return sampledSources;

    const groupedSources = new Map<number, ParticleSource[]>();
    PARTICLE_POSITIONS.forEach((source) => {
      const group = getColumnCollapseGroup(source.sourceColumn);
      const groupSources = groupedSources.get(group) ?? [];
      groupSources.push(source);
      groupedSources.set(group, groupSources);
    });

    const selectedSources: ParticleSourcePlan[] = [];
    const selectedKeys = new Set<string>();
    const groupIds = [...groupedSources.keys()].sort((first, second) => first - second);
    for (const group of groupIds) {
      const groupSources = groupedSources.get(group) ?? [];
      if (selectedSources.length + groupSources.length > count) break;
      groupSources.forEach((source) => {
        selectedSources.push({ source, collapsible: true });
        selectedKeys.add(`${source.sourceLine}:${source.sourceColumn}`);
      });
    }

    const staticSources = PARTICLE_POSITIONS.filter(
      (source) => !selectedKeys.has(`${source.sourceLine}:${source.sourceColumn}`),
    );
    const staticCount = Math.min(count - selectedSources.length, staticSources.length);
    for (let index = 0; index < staticCount; index += 1) {
      selectedSources.push({
        source: staticSources[Math.floor((index * staticSources.length) / staticCount)],
        collapsible: false,
      });
    }

    while (selectedSources.length < count) {
      selectedSources.push({
        source: PARTICLE_POSITIONS[selectedSources.length % PARTICLE_POSITIONS.length],
        collapsible: false,
      });
    }

    return selectedSources.sort(
      (first, second) =>
        first.source.sourceLine - second.source.sourceLine ||
        first.source.sourceColumn - second.source.sourceColumn,
    );
  }

  private updateButterflyFlightTarget(butterfly: Butterfly) {
    const flower = this.flowers[butterfly.targetFlowerId];
    if (flower) {
      butterfly.flowerX = this.flowerHeadX[flower.id] + butterfly.flowerOffsetX;
      butterfly.flowerY = this.flowerHeadY[flower.id];
    }
    butterfly.targetX = clamp(butterfly.flowerX, 34, DESIGN_WIDTH - 34);
    butterfly.targetY = clamp(butterfly.flowerY, BUTTERFLY_ZONE_TOP - 18, DESIGN_HEIGHT - 112);
  }

  private updateFlowerPointer(delta: number) {
    const pointer = this.config.pointerInteractionEnabled ? this.pointer : null;
    const pointerRadius = Math.max(1, this.config.flowerPointerRadius);
    const pointerFalloff = Math.max(0.1, this.config.pointerFalloff);

    this.flowers.forEach((flower) => {
      const naturalPose = getFlowerPose(
        flower,
        this.motionTime,
        this.config.flowerWindStrength,
        1,
        false,
      );
      let targetOffset = 0;

      if (pointer) {
        const distanceX = naturalPose.tipX - pointer.x;
        const distanceY = naturalPose.tipY - pointer.y;
        const distance = Math.hypot(distanceX, distanceY);
        if (distance < pointerRadius) {
          const influence = (1 - distance / pointerRadius) ** pointerFalloff;
          const direction = distance > 0.001 ? distanceX / distance : 0;
          targetOffset = direction * 48 * this.config.flowerPointerStrength * influence;
        }
      }

      const responseRate =
        targetOffset === 0
          ? this.config.flowerPointerReturn
          : this.config.flowerPointerResponse;
      const smoothing = 1 - Math.exp(-Math.max(0.01, responseRate) * delta * 4);
      flower.pointerOffset += (targetOffset - flower.pointerOffset) * smoothing;
    });
  }

  private updateFlowerHeadCache() {
    this.flowers.forEach((flower) => {
      const head = getFlowerHeadPosition(
        flower,
        this.motionTime,
        this.config.flowerWindStrength,
      );
      this.flowerHeadX[flower.id] = head.x;
      this.flowerHeadY[flower.id] = head.y;
    });
  }

  private buildFlowers() {
    this.flowers = [];
    for (let index = 0; index < 36; index += 1) {
      const seed = this.seed + index * 37.4;
      this.flowers.push({
        id: index,
        x: 18 + seededRandom(seed) * 684,
        groundY: 918 + seededRandom(seed + 1) * 22,
        height: 108 + seededRandom(seed + 2) * 260,
        sway: (seededRandom(seed + 3) - 0.5) * 48,
        color: FLOWER_PALETTE[index % FLOWER_PALETTE.length],
        triggerAt: Number.POSITIVE_INFINITY,
        stemProgress: 0,
        leafProgress: 0,
        petalProgress: 0,
        activated: false,
        windPhase: seededRandom(seed + 10) * Math.PI * 2,
        pointerOffset: 0,
      });
    }
  }

  private spawnButterfly(glyph: GlyphParticle) {
    const id = this.butterflies.length;
    const targetFlowerId = id % this.flowers.length;
    const targetFlower = this.flowers[targetFlowerId];
    const flowerOffsetX = (seededRandom(glyph.seed + 13) - 0.5) * 10;
    // Spawning can happen between 60Hz agent ticks. Sample the flower at the
    // exact handoff time here; subsequent shared updates use the cached heads.
    const spawnHead = getFlowerHeadPosition(
      targetFlower,
      this.motionTime,
      this.config.flowerWindStrength,
    );
    const flowerX = spawnHead.x + flowerOffsetX;
    const flowerY = spawnHead.y;
    const baseScale = 0.43 + seededRandom(glyph.seed + 12) * 0.36;
    // Hand over at the glyph's *projected* position, or a depth-shifted glyph
    // would jump at the moment it becomes a butterfly.
    const handover = projectGlyph(glyph);
    // Both layers use px/s, so the handover preserves momentum without a
    // frame-rate conversion. The butterfly keeps only a restrained fraction
    // of the falling speed before steering toward its first flower.
    const handoverVx = glyph.vx * handover.scale;
    const handoverVy = glyph.vy * handover.scale;
    const butterfly: Butterfly = {
      id,
      x: handover.x,
      y: handover.y,
      vx: handoverVx * 0.32 + (seededRandom(glyph.seed + 9) - 0.5) * 48,
      vy: handoverVy * 0.06 + seededRandom(glyph.seed + 10) * 8,
      rotation: glyph.rotation,
      rotationSpeed: (seededRandom(glyph.seed + 11) - 0.5) * 0.032,
      scale: baseScale * this.config.butterflyScale,
      baseScale,
      alpha: 0,
      birthTime: this.motionTime,
      color: glyph.color,
      seed: glyph.seed,
      homeFlowerId: targetFlowerId,
      targetFlowerId,
      previousFlowerId: -1,
      flowerX,
      flowerY,
      flowerOffsetX,
      targetX: clamp(flowerX, 34, DESIGN_WIDTH - 34),
      targetY: clamp(flowerY, BUTTERFLY_ZONE_TOP - 18, DESIGN_HEIGHT - 112),
      orbitRadius: 0.78 + seededRandom(glyph.seed + 15) * 0.44,
      orbitHeight: 0.78 + seededRandom(glyph.seed + 16) * 0.44,
      flightPhase: seededRandom(glyph.seed + 17) * Math.PI * 2,
      wingPhase: seededRandom(glyph.seed + 18) * Math.PI * 2,
      flightMode: "approach",
      stateStartedAt: this.motionTime,
      stateUntil: Number.POSITIVE_INFINITY,
      orbitDirection: seededRandom(glyph.seed + 19) < 0.5 ? -1 : 1,
      hoverOffsetX: 0,
      hoverOffsetY: 0,
      visitCount: 0,
      pointerEvading: false,
      flowerLinked: false,
    };
    this.butterflies.push(butterfly);
  }

  private activateFlower(flowerId: number, earliestTriggerAt: number) {
    const flower = this.flowers[flowerId];
    if (!flower || flower.activated) return;

    const flowerRatio = flower.id / Math.max(1, this.flowers.length - 1);
    const scheduledTriggerAt = 3.2 + flowerRatio * 2.6;
    const latestSafeTriggerAt = SCENE_DURATION - 2.08;
    flower.activated = true;
    flower.triggerAt = Math.min(
      latestSafeTriggerAt,
      Math.max(earliestTriggerAt, scheduledTriggerAt),
    );
  }

  private buildCardCache() {
    const scale = this.renderScale;
    const width = Math.ceil(DESIGN_WIDTH * scale);
    const height = Math.ceil(CARD_CACHE_HEIGHT * scale);
    const base = document.createElement("canvas");
    const source = document.createElement("canvas");
    base.width = width;
    base.height = height;
    source.width = width;
    source.height = height;
    const baseContext = base.getContext("2d");
    const sourceContext = source.getContext("2d");
    if (!baseContext || !sourceContext) return;

    baseContext.setTransform(scale, 0, 0, scale, 0, 0);
    drawCardBase(baseContext);

    sourceContext.setTransform(scale, 0, 0, scale, 0, 0);
    sourceContext.font = GLYPH_FONT;
    sourceContext.textAlign = "left";
    sourceContext.textBaseline = "middle";
    CODE_LINES.forEach((line, lineIndex) => {
      const y = CODE_START_Y + lineIndex * CODE_LINE_STEP;
      [...line].forEach((character, characterIndex) => {
        if (character === " ") return;
        sourceContext.fillStyle = getGlyphColor(lineIndex, characterIndex);
        sourceContext.fillText(
          character,
          CODE_START_X + characterIndex * CODE_CHAR_STEP,
          y,
        );
      });
    });

    this.cardCache = { base, source, sourceContext, scale };
    this.cardCacheBuilds += 1;
    this.glyphs.forEach((glyph) => {
      if (glyph.active) this.clearCachedSourceGlyph(glyph);
    });
  }

  private clearCachedSourceGlyph(glyph: GlyphParticle) {
    const cache = this.cardCache;
    if (!cache) return;
    const x = CODE_START_X + glyph.sourceColumn * CODE_CHAR_STEP;
    const y = CODE_START_Y + glyph.sourceLine * CODE_LINE_STEP;
    // The source font fits inside one monospace cell; clearing by cell removes
    // it in one operation without touching either neighbour.
    cache.sourceContext.clearRect(
      x - 0.2,
      y - CODE_LINE_STEP / 2,
      CODE_CHAR_STEP + 0.2,
      CODE_LINE_STEP,
    );
  }

  private drawCodeCard(context: CanvasRenderingContext2D) {
    if (!this.cardCache) this.buildCardCache();
    const cache = this.cardCache;
    if (!cache) return;

    context.drawImage(
      cache.base,
      0,
      0,
      cache.base.width,
      cache.base.height,
      0,
      0,
      DESIGN_WIDTH,
      CARD_CACHE_HEIGHT,
    );

    const reveal = clamp((this.time - 0.2) / 0.9, 0, 1);
    if (reveal >= 1) {
      context.drawImage(
        cache.source,
        0,
        0,
        cache.source.width,
        cache.source.height,
        0,
        0,
        DESIGN_WIDTH,
        CARD_CACHE_HEIGHT,
      );
    } else if (reveal > 0) {
      CODE_LINES.forEach((line, lineIndex) => {
        const visibleLength = Math.ceil(line.length * reveal);
        if (visibleLength <= 0) return;
        const width = Math.min(line.length, visibleLength) * CODE_CHAR_STEP;
        const top = CODE_START_Y + lineIndex * CODE_LINE_STEP - CODE_LINE_STEP / 2;
        context.drawImage(
          cache.source,
          CODE_START_X * cache.scale,
          top * cache.scale,
          width * cache.scale,
          CODE_LINE_STEP * cache.scale,
          CODE_START_X,
          top,
          width,
          CODE_LINE_STEP,
        );
      });
    }

    this.sourceGlyphDraws = 0;
    context.save();
    context.font = GLYPH_FONT;
    context.textAlign = "left";
    context.textBaseline = "middle";
    this.liveGlyphs.forEach((glyph) => {
      const fade = clamp((this.time - glyph.releaseAt) / SOURCE_GLYPH_FADE_DURATION, 0, 1);
      if (fade >= 1) return;
      const line = CODE_LINES[glyph.sourceLine];
      const visibleLength = Math.ceil(line.length * reveal);
      if (glyph.sourceColumn >= visibleLength) return;
      context.globalAlpha = 1 - fade;
      context.fillStyle = glyph.color;
      context.fillText(
        glyph.char,
        CODE_START_X + glyph.sourceColumn * CODE_CHAR_STEP,
        CODE_START_Y + glyph.sourceLine * CODE_LINE_STEP,
      );
      this.sourceGlyphDraws += 1;
    });
    context.restore();
  }

  private renderGlyphs(context: CanvasRenderingContext2D) {
    context.save();
    context.font = GLYPH_FONT;
    context.textAlign = "center";
    context.textBaseline = "middle";
    const blurStrength = clamp(this.config.motionBlur, 0, 1.5);

    this.liveGlyphs.forEach((glyph) => {
      if (glyph.alpha <= 0.015) return;

      const projected = projectGlyph(glyph);
      // Atmospheric perspective: only the far layer washes out.
      const alpha =
        glyph.alpha * clamp(1 - Math.max(0, -glyph.depth) * 0.9, 0.4, 1);
      if (alpha <= 0.015) return;

      context.fillStyle = glyph.color;

      const speed = Math.hypot(glyph.vx, glyph.vy);
      const blur = clamp(speed / BLUR_REFERENCE_SPEED, 0, 1) * blurStrength;
      if (blur > 0.05) {
        // Ghosts rewind attitude as well as position, so the smear follows the
        // tumble instead of reading as a flat translation.
        for (let ghost = BLUR_GHOSTS; ghost >= 1; ghost -= 1) {
          const back = ghost * BLUR_STEP;
          drawGlyphAt(
            context,
            glyph.char,
            projected.x - glyph.vx * back * projected.scale,
            projected.y - glyph.vy * back * projected.scale,
            glyph.rotation - glyph.rotationSpeed * back,
            glyph.tilt - glyph.tiltSpeed * back,
            projected.scale,
            (alpha * blur * 0.3) / ghost,
          );
        }
      }

      drawGlyphAt(
        context,
        glyph.char,
        projected.x,
        projected.y,
        glyph.rotation,
        glyph.tilt,
        projected.scale,
        alpha,
      );
    });
    context.restore();
  }

  private drawTexture(context: CanvasRenderingContext2D, width: number, height: number) {
    context.save();
    context.globalAlpha = 0.09;
    context.fillStyle = "#817969";
    for (let index = 0; index < 260; index += 1) {
      const x = seededRandom(this.seed + index * 2.1) * width;
      const y = seededRandom(this.seed + index * 3.8) * height;
      const radius = 0.25 + seededRandom(this.seed + index * 5.4) * 0.65;
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  }

  private buildBackground() {
    const background = document.createElement("canvas");
    background.width = Math.ceil(this.viewport.width);
    background.height = Math.ceil(this.viewport.height);
    const context = background.getContext("2d");
    if (!context) return;

    const paperGradient = context.createLinearGradient(0, 0, 0, this.viewport.height);
    paperGradient.addColorStop(0, "#f4f0e7");
    paperGradient.addColorStop(1, "#ebe7dc");
    context.fillStyle = paperGradient;
    context.fillRect(0, 0, this.viewport.width, this.viewport.height);
    this.drawTexture(context, this.viewport.width, this.viewport.height);
    this.backgroundCanvas = background;
  }
}
