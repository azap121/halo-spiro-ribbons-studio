import { BufferAttribute, BufferGeometry } from 'three';
import { clamp, generateSpiroNormalizedPoints } from './spiro-engine';
import { preprocessSpiroImageField } from './spiro-image-field';
import type { SpiroImageField, SpiroImageFieldSample } from './spiro-image-field';
import { createSeededRandom } from './spiro-random';
import type {
  SpiroProjectionMode,
  SpiroFitMode,
  SpiroRibbonConfig,
  SpiroWebglImageMaskSource,
  UploadedRasterImage,
} from './spiro-types';

export type SpiroParticleCameraMode = 'perspective' | 'orthographic';
export type SpiroParticleColorMode = 'stroke' | 'image' | 'hybrid' | 'depth';
export type SpiroParticleImageMode = 'none' | 'color' | 'mask' | 'shape' | 'shape-and-mask';
export type SpiroParticleToneMapping = 'none' | 'aces';
export type SpiroParticleLook = 'spiro-grain' | 'data-ring';
export type SpiroParticlePalette = 'halo' | 'blue-gray' | 'cyan';
export type SpiroParticleHologramColorway = 'blue-gray' | 'cyan' | 'halo';
export type SpiroParticleProjectionMode = SpiroProjectionMode;
export type SpiroParticleImageMaskSource = SpiroWebglImageMaskSource;

export interface SpiroParticleControls {
  schemaVersion?: 1;
  renderMode?: 'flat' | 'dimensional';
  look?: SpiroParticleLook;
  projectionMode?: SpiroParticleProjectionMode;
  projectionBlend?: number;
  sphereRadius?: number;
  shellThickness?: number;
  palette?: SpiroParticlePalette;
  order?: number;
  voidRadius?: number;
  ringThickness?: number;
  traceStrength?: number;
  fitMode?: SpiroFitMode;
  seed?: number | string;
  cameraMode?: SpiroParticleCameraMode;
  pixelRatio?: number;
  particleCount?: number;
  particleBudget?: number;
  worldScale?: number;
  dimensionality?: number;
  depth?: number;
  domeDepth?: number;
  twistDepth?: number;
  twistFrequency?: number;
  spread?: number;
  swirl?: number;
  turbulence?: number;
  flowSpeed?: number;
  particleSize?: number;
  particleSoftness?: number;
  particleOpacity?: number;
  particleSizeVariance?: number;
  hologramIntensity?: number;
  hologramGlow?: number;
  hologramScanlineDensity?: number;
  hologramScanlineSpeed?: number;
  hologramShimmer?: number;
  hologramNoise?: number;
  hologramEdgeFalloff?: number;
  hologramChromaticSplit?: number;
  hologramColorway?: SpiroParticleHologramColorway;
  opacity?: number;
  additive?: boolean;
  colorMode?: SpiroParticleColorMode;
  imageMode?: SpiroParticleImageMode;
  imageMaskSource?: SpiroParticleImageMaskSource;
  imageInfluence?: number;
  imageDepth?: number;
  shapeThreshold?: number;
  shapeSoftness?: number;
  imageMaskThreshold?: number;
  imageMaskSoftness?: number;
  imageShapeStrength?: number;
  preserveSpiro?: number;
  rotationX?: number;
  rotationY?: number;
  rotationZ?: number;
  positionX?: number;
  positionY?: number;
  positionZ?: number;
  cameraDistance?: number;
  cameraFov?: number;
  orthographicZoom?: number;
  autoRotate?: boolean;
  autoRotateSpeed?: number;
  showOrbitControls?: boolean;
  transparentBackground?: boolean;
  backgroundColor?: string;
  toneMapping?: SpiroParticleToneMapping;
  audioLevel?: number;
  audioBass?: number;
  audioMid?: number;
  audioTreble?: number;
}

export interface ResolvedSpiroParticleControls {
  schemaVersion: 1;
  look: SpiroParticleLook;
  projectionMode: SpiroParticleProjectionMode;
  projectionBlend: number;
  sphereRadius: number;
  shellThickness: number;
  palette: SpiroParticlePalette;
  order: number;
  voidRadius: number;
  ringThickness: number;
  traceStrength: number;
  fitMode: SpiroFitMode;
  seed: number | string;
  cameraMode: SpiroParticleCameraMode;
  pixelRatio: number;
  particleBudget: number;
  worldScale: number;
  dimensionality: number;
  depth: number;
  domeDepth: number;
  twistDepth: number;
  twistFrequency: number;
  spread: number;
  swirl: number;
  turbulence: number;
  flowSpeed: number;
  particleSize: number;
  particleSoftness: number;
  particleSizeVariance: number;
  hologramIntensity: number;
  hologramGlow: number;
  hologramScanlineDensity: number;
  hologramScanlineSpeed: number;
  hologramShimmer: number;
  hologramNoise: number;
  hologramEdgeFalloff: number;
  hologramChromaticSplit: number;
  hologramColorway: SpiroParticleHologramColorway;
  opacity: number;
  additive: boolean;
  colorMode: SpiroParticleColorMode;
  imageMode: SpiroParticleImageMode;
  imageMaskSource: SpiroParticleImageMaskSource;
  imageInfluence: number;
  imageDepth: number;
  imageMaskThreshold: number;
  imageMaskSoftness: number;
  imageShapeStrength: number;
  preserveSpiro: number;
  rotationX: number;
  rotationY: number;
  rotationZ: number;
  positionX: number;
  positionY: number;
  positionZ: number;
  cameraDistance: number;
  cameraFov: number;
  orthographicZoom: number;
  autoRotate: boolean;
  autoRotateSpeed: number;
  showOrbitControls: boolean;
  transparentBackground: boolean;
  backgroundColor: string;
  toneMapping: SpiroParticleToneMapping;
  audioLevel: number;
  audioBass: number;
  audioMid: number;
  audioTreble: number;
}

export interface SpiroParticleGeometryStats {
  particles: number;
  layers: number;
  samplesPerLayer: number;
  imageSampled: boolean;
  droppedByImageShape: number;
}

export interface SpiroParticleGeometryResult {
  geometry: BufferGeometry;
  stats: SpiroParticleGeometryStats;
}

const DEFAULT_PARTICLE_CONTROLS: ResolvedSpiroParticleControls = {
  schemaVersion: 1,
  look: 'data-ring',
  projectionMode: 'dome',
  projectionBlend: 1,
  sphereRadius: 0.92,
  shellThickness: 0.08,
  palette: 'blue-gray',
  order: 0.86,
  voidRadius: 0.24,
  ringThickness: 0.6,
  traceStrength: 0.16,
  fitMode: 'cover',
  seed: 'halo-spiro-particles',
  cameraMode: 'perspective',
  pixelRatio: 1.75,
  particleBudget: 48000,
  worldScale: 5.8,
  dimensionality: 0.72,
  depth: 1.2,
  domeDepth: 0.72,
  twistDepth: 0.38,
  twistFrequency: 3.2,
  spread: 0.18,
  swirl: 0.32,
  turbulence: 0.08,
  flowSpeed: 0.28,
  particleSize: 4.4,
  particleSoftness: 0.24,
  particleSizeVariance: 0.45,
  hologramIntensity: 0.18,
  hologramGlow: 0.22,
  hologramScanlineDensity: 18,
  hologramScanlineSpeed: 0.14,
  hologramShimmer: 0.18,
  hologramNoise: 0.18,
  hologramEdgeFalloff: 0.48,
  hologramChromaticSplit: 0.08,
  hologramColorway: 'blue-gray',
  opacity: 0.82,
  additive: false,
  colorMode: 'hybrid',
  imageMode: 'color',
  imageMaskSource: 'alpha-luminance',
  imageInfluence: 0.62,
  imageDepth: 0.45,
  imageMaskThreshold: 0.18,
  imageMaskSoftness: 0.24,
  imageShapeStrength: 0.65,
  preserveSpiro: 0.52,
  rotationX: -12,
  rotationY: 22,
  rotationZ: 0,
  positionX: 0,
  positionY: 0,
  positionZ: 0,
  cameraDistance: 8,
  cameraFov: 42,
  orthographicZoom: 82,
  autoRotate: true,
  autoRotateSpeed: 0.12,
  showOrbitControls: true,
  transparentBackground: false,
  backgroundColor: '#FAFAF7',
  toneMapping: 'none',
  audioLevel: 0,
  audioBass: 0,
  audioMid: 0,
  audioTreble: 0,
};

interface RgbColor {
  r: number;
  g: number;
  b: number;
}

function hexToRgb(hex: string): RgbColor {
  const normalized = hex.replace('#', '').trim();
  const safeHex =
    normalized.length === 3
      ? normalized
          .split('')
          .map((digit) => `${digit}${digit}`)
          .join('')
      : normalized.padEnd(6, '0').slice(0, 6);
  const numeric = Number.parseInt(safeHex, 16);

  return {
    r: ((numeric >> 16) & 255) / 255,
    g: ((numeric >> 8) & 255) / 255,
    b: (numeric & 255) / 255,
  };
}

function mixRgb(base: RgbColor, accent: RgbColor, amount: number): RgbColor {
  const mix = clamp(amount, 0, 1);

  return {
    r: base.r + (accent.r - base.r) * mix,
    g: base.g + (accent.g - base.g) * mix,
    b: base.b + (accent.b - base.b) * mix,
  };
}

function resolvePaletteColor(
  palette: SpiroParticlePalette,
  depthAmount: number,
  radialAmount = 0.5,
  accentAmount = 0
): RgbColor {
  const depth = clamp(depthAmount * 0.5 + 0.5, 0, 1);
  const radial = clamp(radialAmount, 0, 1);
  const accent = clamp(accentAmount, 0, 1);

  if (palette === 'cyan') {
    const rear = { r: 0.08, g: 0.22, b: 0.33 };
    const front = { r: 0.36, g: 0.84, b: 0.92 };
    const highlight = { r: 0.8, g: 0.98, b: 1 };

    return mixRgb(mixRgb(rear, front, depth), highlight, accent * 0.7);
  }

  if (palette === 'halo') {
    const rear = { r: 0.28, g: 0.16, b: 0.1 };
    const front = { r: 0.94, g: 0.34, b: 0.1 };
    const highlight = { r: 1, g: 0.62, b: 0.24 };

    return mixRgb(mixRgb(rear, front, depth), highlight, accent * 0.45);
  }

  const rear = { r: 0.16, g: 0.23, b: 0.34 };
  const front = { r: 0.48, g: 0.58, b: 0.7 };
  const highlight = { r: 0.78, g: 0.86, b: 0.92 };
  const edgeLift = Math.max(0, 1 - Math.abs(radial - 0.28) * 3.2);

  return mixRgb(mixRgb(rear, front, depth), highlight, Math.max(accent * 0.55, edgeLift * 0.08));
}

function sampledColorToRgb(sampledColor: SpiroImageFieldSample): RgbColor {
  return {
    r: sampledColor.r / 255,
    g: sampledColor.g / 255,
    b: sampledColor.b / 255,
  };
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge0 === edge1) {
    return value < edge0 ? 0 : 1;
  }

  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);

  return t * t * (3 - 2 * t);
}

function sampleImageColor(sampler: SpiroImageField | null, x: number, y: number): SpiroImageFieldSample | null {
  if (!sampler) {
    return null;
  }

  return sampler.sample(clamp(x, 0, 1), clamp(y, 0, 1));
}

function resolvePointColor(
  baseColor: RgbColor,
  sampledColor: SpiroImageFieldSample | null,
  controls: ResolvedSpiroParticleControls,
  depthAmount: number
): RgbColor {
  if (controls.colorMode === 'depth') {
    return resolvePaletteColor(controls.palette, depthAmount);
  }

  if (!sampledColor || controls.imageMode === 'none' || controls.colorMode === 'stroke') {
    return baseColor;
  }

  const imageColor = sampledColorToRgb(sampledColor);
  const colorSignal =
    controls.imageMaskSource === 'glass'
      ? clamp(
          sampledColor.backgroundDelta * 1.4 +
            sampledColor.refraction * 0.8 +
            sampledColor.highlight +
            sampledColor.rim * 0.8,
          0,
          1
        )
      : 1;

  if (controls.colorMode === 'image') {
    return controls.imageMaskSource === 'glass'
      ? mixRgb(resolvePaletteColor(controls.palette, depthAmount), imageColor, colorSignal)
      : imageColor;
  }

  return mixRgb(baseColor, imageColor, controls.imageInfluence * colorSignal);
}

function shouldApplyImageMask(imageMode: SpiroParticleImageMode): boolean {
  return imageMode === 'mask' || imageMode === 'shape-and-mask';
}

function shouldApplyImageShape(imageMode: SpiroParticleImageMode): boolean {
  return imageMode === 'shape' || imageMode === 'shape-and-mask';
}

function isGlassImageMode(controls: ResolvedSpiroParticleControls): boolean {
  return controls.imageMaskSource === 'glass';
}

function resolveGlassSignal(sampledColor: SpiroImageFieldSample | null): number {
  if (!sampledColor) {
    return 0;
  }

  return clamp(
    sampledColor.rim * 0.95 +
      sampledColor.highlight * 0.75 +
      sampledColor.refraction * 0.45 +
      sampledColor.interior * 0.2,
    0,
    1
  );
}

function resolveImageMask(sampledColor: SpiroImageFieldSample | null, controls: ResolvedSpiroParticleControls): number {
  if (!sampledColor || controls.imageMode === 'none') {
    return 1;
  }

  const signal = isGlassImageMode(controls)
    ? clamp(sampledColor.mask * 0.65 + resolveGlassSignal(sampledColor) * 0.55, 0, 1)
    : sampledColor.mask;
  const threshold = controls.imageMaskThreshold;
  const softness = Math.max(controls.imageMaskSoftness, 0.001);

  return smoothstep(threshold - softness, threshold + softness, signal);
}

function createSafeImageSampler(
  image: UploadedRasterImage | null,
  controls: ResolvedSpiroParticleControls
): SpiroImageField | null {
  if (!image || typeof document === 'undefined') {
    return null;
  }

  try {
    return preprocessSpiroImageField(image, {
      fitMode: controls.fitMode,
      threshold: controls.imageMaskThreshold,
      edgeSoftness: controls.imageMaskSoftness,
      maskMode: controls.imageMaskSource,
    });
  } catch {
    return null;
  }
}

export function resolveSpiroParticleControls(
  controls: Partial<SpiroParticleControls> = {}
): ResolvedSpiroParticleControls {
  return {
    ...DEFAULT_PARTICLE_CONTROLS,
    ...controls,
    schemaVersion: 1,
    projectionMode: controls.projectionMode ?? DEFAULT_PARTICLE_CONTROLS.projectionMode,
    projectionBlend: clamp(controls.projectionBlend ?? DEFAULT_PARTICLE_CONTROLS.projectionBlend, 0, 1),
    sphereRadius: clamp(controls.sphereRadius ?? DEFAULT_PARTICLE_CONTROLS.sphereRadius, 0.2, 2),
    shellThickness: clamp(controls.shellThickness ?? DEFAULT_PARTICLE_CONTROLS.shellThickness, 0, 0.6),
    order: clamp(controls.order ?? DEFAULT_PARTICLE_CONTROLS.order, 0, 1),
    voidRadius: clamp(controls.voidRadius ?? DEFAULT_PARTICLE_CONTROLS.voidRadius, 0, 0.65),
    ringThickness: clamp(controls.ringThickness ?? DEFAULT_PARTICLE_CONTROLS.ringThickness, 0.04, 1),
    traceStrength: clamp(controls.traceStrength ?? DEFAULT_PARTICLE_CONTROLS.traceStrength, 0, 1),
    fitMode: controls.fitMode ?? DEFAULT_PARTICLE_CONTROLS.fitMode,
    pixelRatio: clamp(controls.pixelRatio ?? DEFAULT_PARTICLE_CONTROLS.pixelRatio, 1, 2),
    particleBudget: Math.round(
      clamp(controls.particleBudget ?? controls.particleCount ?? DEFAULT_PARTICLE_CONTROLS.particleBudget, 1000, 90000)
    ),
    worldScale: clamp(controls.worldScale ?? DEFAULT_PARTICLE_CONTROLS.worldScale, 0.5, 18),
    dimensionality: clamp(controls.dimensionality ?? DEFAULT_PARTICLE_CONTROLS.dimensionality, 0, 2),
    depth: clamp(controls.depth ?? DEFAULT_PARTICLE_CONTROLS.depth, 0, 6),
    domeDepth: clamp(controls.domeDepth ?? DEFAULT_PARTICLE_CONTROLS.domeDepth, -3, 3),
    twistDepth: clamp(controls.twistDepth ?? DEFAULT_PARTICLE_CONTROLS.twistDepth, -3, 3),
    twistFrequency: clamp(controls.twistFrequency ?? DEFAULT_PARTICLE_CONTROLS.twistFrequency, 0, 16),
    spread: clamp(controls.spread ?? DEFAULT_PARTICLE_CONTROLS.spread, 0, 2),
    swirl: clamp(controls.swirl ?? DEFAULT_PARTICLE_CONTROLS.swirl, -4, 4),
    turbulence: clamp(controls.turbulence ?? DEFAULT_PARTICLE_CONTROLS.turbulence, 0, 2),
    flowSpeed: clamp(controls.flowSpeed ?? DEFAULT_PARTICLE_CONTROLS.flowSpeed, -3, 3),
    particleSize: clamp(controls.particleSize ?? DEFAULT_PARTICLE_CONTROLS.particleSize, 0.5, 24),
    particleSoftness: clamp(controls.particleSoftness ?? DEFAULT_PARTICLE_CONTROLS.particleSoftness, 0.02, 0.75),
    particleSizeVariance: clamp(controls.particleSizeVariance ?? DEFAULT_PARTICLE_CONTROLS.particleSizeVariance, 0, 2),
    hologramIntensity: clamp(controls.hologramIntensity ?? DEFAULT_PARTICLE_CONTROLS.hologramIntensity, 0, 1),
    hologramGlow: clamp(controls.hologramGlow ?? DEFAULT_PARTICLE_CONTROLS.hologramGlow, 0, 1),
    hologramScanlineDensity: clamp(
      controls.hologramScanlineDensity ?? DEFAULT_PARTICLE_CONTROLS.hologramScanlineDensity,
      0,
      64
    ),
    hologramScanlineSpeed: clamp(
      controls.hologramScanlineSpeed ?? DEFAULT_PARTICLE_CONTROLS.hologramScanlineSpeed,
      -2,
      2
    ),
    hologramShimmer: clamp(controls.hologramShimmer ?? DEFAULT_PARTICLE_CONTROLS.hologramShimmer, 0, 1),
    hologramNoise: clamp(controls.hologramNoise ?? DEFAULT_PARTICLE_CONTROLS.hologramNoise, 0, 1),
    hologramEdgeFalloff: clamp(controls.hologramEdgeFalloff ?? DEFAULT_PARTICLE_CONTROLS.hologramEdgeFalloff, 0, 1),
    hologramChromaticSplit: clamp(
      controls.hologramChromaticSplit ?? DEFAULT_PARTICLE_CONTROLS.hologramChromaticSplit,
      0,
      1
    ),
    hologramColorway: controls.hologramColorway ?? DEFAULT_PARTICLE_CONTROLS.hologramColorway,
    opacity: clamp(controls.opacity ?? controls.particleOpacity ?? DEFAULT_PARTICLE_CONTROLS.opacity, 0, 1),
    imageMaskSource: controls.imageMaskSource ?? DEFAULT_PARTICLE_CONTROLS.imageMaskSource,
    imageInfluence: clamp(controls.imageInfluence ?? DEFAULT_PARTICLE_CONTROLS.imageInfluence, 0, 1),
    imageDepth: clamp(controls.imageDepth ?? DEFAULT_PARTICLE_CONTROLS.imageDepth, -3, 3),
    imageMaskThreshold: clamp(
      controls.imageMaskThreshold ?? controls.shapeThreshold ?? DEFAULT_PARTICLE_CONTROLS.imageMaskThreshold,
      0,
      1
    ),
    imageMaskSoftness: clamp(
      controls.imageMaskSoftness ?? controls.shapeSoftness ?? DEFAULT_PARTICLE_CONTROLS.imageMaskSoftness,
      0.001,
      1
    ),
    imageShapeStrength: clamp(controls.imageShapeStrength ?? DEFAULT_PARTICLE_CONTROLS.imageShapeStrength, 0, 1),
    preserveSpiro: clamp(controls.preserveSpiro ?? DEFAULT_PARTICLE_CONTROLS.preserveSpiro, 0, 1),
    cameraDistance: clamp(controls.cameraDistance ?? DEFAULT_PARTICLE_CONTROLS.cameraDistance, 2, 40),
    cameraFov: clamp(controls.cameraFov ?? DEFAULT_PARTICLE_CONTROLS.cameraFov, 12, 90),
    orthographicZoom: clamp(controls.orthographicZoom ?? DEFAULT_PARTICLE_CONTROLS.orthographicZoom, 24, 180),
    autoRotateSpeed: clamp(controls.autoRotateSpeed ?? DEFAULT_PARTICLE_CONTROLS.autoRotateSpeed, -2, 2),
    audioLevel: clamp(controls.audioLevel ?? DEFAULT_PARTICLE_CONTROLS.audioLevel, 0, 1),
    audioBass: clamp(controls.audioBass ?? DEFAULT_PARTICLE_CONTROLS.audioBass, 0, 1),
    audioMid: clamp(controls.audioMid ?? DEFAULT_PARTICLE_CONTROLS.audioMid, 0, 1),
    audioTreble: clamp(controls.audioTreble ?? DEFAULT_PARTICLE_CONTROLS.audioTreble, 0, 1),
  };
}

export function createSpiroParticleGeometryKey(
  config: SpiroRibbonConfig,
  image: UploadedRasterImage | null,
  controls: ResolvedSpiroParticleControls
): string {
  return [
    config.curveMode,
    config.outerRadius,
    config.innerRadius,
    config.penOffset,
    config.symmetry,
    config.lineDensity,
    config.rotation,
    config.scale,
    config.phase,
    config.pointCount,
    config.ribbonCount,
    config.strokeColor,
    config.colorMode,
    controls.fitMode,
    image?.url ?? 'no-image',
    controls.look,
    controls.palette,
    controls.order,
    controls.voidRadius,
    controls.ringThickness,
    controls.traceStrength,
    controls.seed,
    controls.particleBudget,
    controls.colorMode,
    controls.imageMode,
    controls.imageMaskSource,
    controls.imageInfluence,
    controls.imageDepth,
    controls.imageMaskThreshold,
    controls.imageMaskSoftness,
    controls.imageShapeStrength,
    controls.preserveSpiro,
    controls.particleSizeVariance,
  ].join('|');
}

const GEOMETRY_TAU = Math.PI * 2;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

function createDataRingParticleGeometry(
  config: SpiroRibbonConfig,
  image: UploadedRasterImage | null,
  controls: ResolvedSpiroParticleControls
): SpiroParticleGeometryResult {
  const particleCount = controls.particleBudget;
  const sampler = createSafeImageSampler(image, controls);
  const random = createSeededRandom(`${controls.seed}:${createSpiroParticleGeometryKey(config, image, controls)}`);
  const ringBands = Math.max(4, Math.min(18, Math.round(config.symmetry / 3)));
  const voidRadius = controls.voidRadius;
  const outerRadius = Math.min(1, voidRadius + controls.ringThickness);
  const annulusWidth = Math.max(0.04, outerRadius - voidRadius);
  const order = controls.order;
  const chaos = 1 - order;

  const positions: number[] = [];
  const colors: number[] = [];
  const progresses: number[] = [];
  const layers: number[] = [];
  const randoms: number[] = [];
  const masks: number[] = [];
  const sizes: number[] = [];
  const depths: number[] = [];
  const radii: number[] = [];
  const angles: number[] = [];
  const glass: number[] = [];
  let droppedByImageShape = 0;

  for (let index = 0; index < particleCount; index += 1) {
    const progress = particleCount === 1 ? 1 : index / (particleCount - 1);
    const randomA = random();
    const randomB = random();
    const randomC = random();
    const randomD = random();
    const bandIndex = Math.floor(randomA * ringBands);
    const bandRatio = ringBands === 1 ? 0 : bandIndex / (ringBands - 1);
    const bandJitter = (randomB - 0.5) * (0.2 + chaos * 0.9);
    const orderedRadius =
      voidRadius +
      annulusWidth * clamp(bandRatio + bandJitter / ringBands, 0, 1) +
      Math.sin((progress * config.lineDensity + bandRatio) * GEOMETRY_TAU) * annulusWidth * 0.018 * order;
    const chaosRadius =
      voidRadius +
      annulusWidth * Math.sqrt(randomC) +
      (randomD - 0.5) * annulusWidth * 0.22 * chaos;
    const radius = clamp(orderedRadius * order + chaosRadius * chaos, voidRadius, outerRadius);
    const baseAngle = index * GOLDEN_ANGLE + bandIndex * 0.31;
    const lace =
      Math.sin(baseAngle * Math.max(2, config.symmetry * 0.12) + progress * GEOMETRY_TAU * config.lineDensity) *
      0.28 *
      order;
    const angleNoise = (randomA - 0.5) * GEOMETRY_TAU * 0.18 * chaos;
    const angle = baseAngle + lace + angleNoise;
    const squeeze = 0.88 + Math.sin(angle * 2.0 + bandRatio * GEOMETRY_TAU) * 0.035 * order;
    let x = Math.cos(angle) * radius;
    let y = Math.sin(angle) * radius * squeeze;
    const chaosAngle = randomB * GEOMETRY_TAU;
    const chaoticPolarRadius = voidRadius + annulusWidth * Math.sqrt(randomC);
    const chaoticX = Math.cos(chaosAngle) * chaoticPolarRadius + (randomD - 0.5) * annulusWidth * 0.12;
    const chaoticY = Math.sin(chaosAngle) * chaoticPolarRadius * 0.92 + (randomA - 0.5) * annulusWidth * 0.1;
    x = x * order + chaoticX * chaos;
    y = y * order + chaoticY * chaos;

    const u = x * 0.5 + 0.5;
    const v = 0.5 - y * 0.5;
    const sampledColor = sampleImageColor(sampler, u, v);
    const imageMask = resolveImageMask(sampledColor, controls);
    const glassSignal = resolveGlassSignal(sampledColor);

    if (sampler && shouldApplyImageShape(controls.imageMode)) {
      const keepProbability = isGlassImageMode(controls)
        ? clamp(0.03 + imageMask * 0.5 + glassSignal * 0.55, 0.025, 1)
        : clamp(0.08 + imageMask * 0.92, 0.04, 1);

      if (random() > keepProbability) {
        droppedByImageShape += 1;
        continue;
      }
    }

    const apertureDistance = clamp((Math.hypot(x, y) - voidRadius) / Math.max(annulusWidth, 0.001), 0, 1);
    const shell = Math.sqrt(Math.max(0, 1 - Math.min(1, radius) * Math.min(1, radius)));
    const wave = Math.sin(angle * (1.4 + order * 1.8) + bandRatio * GEOMETRY_TAU + progress * GEOMETRY_TAU * 0.5);
    const glassDepth = sampledColor
      ? sampledColor.rim * 0.18 + sampledColor.refraction * 0.12 + sampledColor.highlight * 0.18
      : 0;
    const imageDepth = sampledColor
      ? ((sampledColor.luminance - 0.5) * controls.imageDepth + glassDepth * controls.imageDepth)
      : 0;
    const depthAmount = shell + imageDepth + wave * 0.08 + (bandRatio - 0.5) * 0.18;
    const edgeAccent = Math.max(
      0,
      1 - Math.abs(Math.hypot(x, y) - voidRadius) / Math.max(annulusWidth * 0.16, 0.001)
    );
    const color = sampledColor
      ? resolvePointColor(resolvePaletteColor(controls.palette, depthAmount, apertureDistance, edgeAccent), sampledColor, controls, depthAmount)
      : resolvePaletteColor(controls.palette, depthAmount, apertureDistance, edgeAccent);
    const mask = sampler && shouldApplyImageMask(controls.imageMode)
      ? clamp(0.08 + imageMask * 0.92, 0, 1)
      : 1;
    const traceBoost = 1 + controls.traceStrength * order * (bandIndex % 3 === 0 ? 0.32 : 0);
    const size = Math.max(
      0.18,
      (0.62 + randomA * 0.45 + edgeAccent * 0.18) *
        (isGlassImageMode(controls) && sampledColor
          ? 0.78 + sampledColor.rim * 0.6 + sampledColor.highlight * 1.05 + sampledColor.refraction * 0.32
          : 1) *
        traceBoost *
        (1 + (randomD - 0.5) * controls.particleSizeVariance * 0.5)
    );

    positions.push(x, y, 0);
    colors.push(color.r, color.g, color.b);
    progresses.push(progress);
    layers.push(bandRatio);
    randoms.push(randomA, randomB, randomC, randomD);
    masks.push(mask);
    sizes.push(size);
    depths.push(depthAmount);
    radii.push(Math.hypot(x, y));
    angles.push(Math.atan2(y, x));
    glass.push(
      sampledColor?.rim ?? 0,
      sampledColor?.highlight ?? 0,
      sampledColor?.refraction ?? 0,
      sampledColor?.interior ?? 0
    );
  }

  if (positions.length === 0) {
    const color = resolvePaletteColor(controls.palette, 0);
    positions.push(voidRadius, 0, 0);
    colors.push(color.r, color.g, color.b);
    progresses.push(0);
    layers.push(0);
    randoms.push(0.5, 0.5, 0.5, 0.5);
    masks.push(1);
    sizes.push(1);
    depths.push(0);
    radii.push(voidRadius);
    angles.push(0);
    glass.push(0, 0, 0, 0);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3));
  geometry.setAttribute('aProgress', new BufferAttribute(new Float32Array(progresses), 1));
  geometry.setAttribute('aLayer', new BufferAttribute(new Float32Array(layers), 1));
  geometry.setAttribute('aRandom', new BufferAttribute(new Float32Array(randoms), 4));
  geometry.setAttribute('aMask', new BufferAttribute(new Float32Array(masks), 1));
  geometry.setAttribute('aSize', new BufferAttribute(new Float32Array(sizes), 1));
  geometry.setAttribute('aDepth', new BufferAttribute(new Float32Array(depths), 1));
  geometry.setAttribute('aRadius', new BufferAttribute(new Float32Array(radii), 1));
  geometry.setAttribute('aAngle', new BufferAttribute(new Float32Array(angles), 1));
  geometry.setAttribute('aGlass', new BufferAttribute(new Float32Array(glass), 4));
  geometry.computeBoundingSphere();

  return {
    geometry,
    stats: {
      particles: positions.length / 3,
      layers: ringBands,
      samplesPerLayer: Math.round(particleCount / ringBands),
      imageSampled: Boolean(sampler),
      droppedByImageShape,
    },
  };
}

export function createSpiroParticleGeometry(
  config: SpiroRibbonConfig,
  image: UploadedRasterImage | null,
  controls: ResolvedSpiroParticleControls
): SpiroParticleGeometryResult {
  if (controls.look === 'data-ring') {
    return createDataRingParticleGeometry(config, image, controls);
  }

  const requestedLayerCount = Math.max(1, Math.round(config.ribbonCount));
  const layerCount = Math.max(requestedLayerCount, Math.ceil(controls.particleBudget / 6000));
  const samplesPerLayer = Math.max(
    24,
    Math.min(6000, Math.floor(controls.particleBudget / layerCount))
  );
  const sampler = createSafeImageSampler(image, controls);
  const random = createSeededRandom(`${controls.seed}:${createSpiroParticleGeometryKey(config, image, controls)}`);
  const baseColor = hexToRgb(config.strokeColor);
  const geometryConfig = {
    ...config,
    pointCount: samplesPerLayer,
    playing: false,
  };

  const positions: number[] = [];
  const colors: number[] = [];
  const progresses: number[] = [];
  const layers: number[] = [];
  const randoms: number[] = [];
  const masks: number[] = [];
  const sizes: number[] = [];
  const depths: number[] = [];
  const radii: number[] = [];
  const angles: number[] = [];
  const glass: number[] = [];
  let droppedByImageShape = 0;

  for (let layerIndex = 0; layerIndex < layerCount; layerIndex += 1) {
    const points = generateSpiroNormalizedPoints(geometryConfig, layerIndex, 0);
    const layerRatio = layerCount === 1 ? 0 : layerIndex / (layerCount - 1);
    const layerDepth = (layerRatio - 0.5) * 0.28;

    for (const point of points) {
      const u = point.x * 0.5 + 0.5;
      const v = 0.5 - point.y * 0.5;
      let x = point.x;
      let y = point.y;
      let sampledColor = sampleImageColor(sampler, u, v);
      let imageMask = resolveImageMask(sampledColor, controls);
      let glassSignal = resolveGlassSignal(sampledColor);

      if (sampler && isGlassImageMode(controls) && shouldApplyImageShape(controls.imageMode)) {
        let targetX = x;
        let targetY = y;
        let targetSample = sampledColor;
        let targetMask = imageMask;
        let targetGlassSignal = glassSignal;

        for (let attempt = 0; attempt < 14; attempt += 1) {
          const candidateAngle = random() * GEOMETRY_TAU;
          const candidateRadius = random() < 0.58 ? 0.66 + Math.sqrt(random()) * 0.32 : Math.sqrt(random()) * 0.98;
          const candidateX = Math.cos(candidateAngle) * candidateRadius;
          const candidateY = Math.sin(candidateAngle) * candidateRadius;
          const candidateSample = sampleImageColor(sampler, candidateX * 0.5 + 0.5, 0.5 - candidateY * 0.5);
          const candidateMask = resolveImageMask(candidateSample, controls);
          const candidateGlassSignal = resolveGlassSignal(candidateSample);
          const candidateKeep = clamp(candidateMask * 0.58 + candidateGlassSignal * 0.86, 0.04, 1);

          if (random() <= candidateKeep) {
            targetX = candidateX;
            targetY = candidateY;
            targetSample = candidateSample;
            targetMask = candidateMask;
            targetGlassSignal = candidateGlassSignal;
            break;
          }
        }

        const imageBlend = controls.imageShapeStrength * (1 - controls.preserveSpiro);
        x += (targetX - x) * imageBlend;
        y += (targetY - y) * imageBlend;
        sampledColor = targetSample;
        imageMask = targetMask;
        glassSignal = targetGlassSignal;
      }

      if (sampler && shouldApplyImageShape(controls.imageMode)) {
        const keepProbability = isGlassImageMode(controls)
          ? clamp(
              controls.preserveSpiro * 0.42 +
                imageMask * controls.imageShapeStrength * 0.58 +
                glassSignal * controls.imageShapeStrength * 0.72,
              0.04,
              1
            )
          : clamp(
              controls.preserveSpiro + imageMask * controls.imageShapeStrength * (1 - controls.preserveSpiro),
              0.02,
              1
            );

        if (random() > keepProbability) {
          droppedByImageShape += 1;
          continue;
        }
      }

      if (sampledColor && shouldApplyImageShape(controls.imageMode)) {
        const sdfPull =
          clamp(sampledColor.signedDistance, -0.5, 0.5) *
          controls.imageShapeStrength *
          (1 - controls.preserveSpiro);
        x += sampledColor.gradientX * sdfPull;
        y -= sampledColor.gradientY * sdfPull;
      }

      const projectedRadius = Math.min(1, Math.hypot(x, y));
      const dome = Math.sqrt(Math.max(0, 1 - projectedRadius * projectedRadius));
      const glassDepth = sampledColor
        ? sampledColor.rim * 0.18 + sampledColor.refraction * 0.12 + sampledColor.highlight * 0.18
        : 0;
      const imageDepth = sampledColor
        ? ((sampledColor.luminance - 0.5) * controls.imageDepth + glassDepth * controls.imageDepth)
        : 0;
      const depthAmount = dome + imageDepth + layerDepth;
      const color = resolvePointColor(baseColor, sampledColor, controls, depthAmount);
      const mask = sampler && shouldApplyImageMask(controls.imageMode)
        ? clamp(1 - controls.imageShapeStrength + imageMask * controls.imageShapeStrength, 0, 1)
        : 1;
      const imageSize =
        sampledColor && isGlassImageMode(controls)
          ? 0.48 +
            sampledColor.rim * 0.85 +
            sampledColor.highlight * 1.25 +
            sampledColor.refraction * 0.55 +
            sampledColor.interior * 0.25
          : sampledColor
            ? 0.72 + sampledColor.luminance * 0.72 + sampledColor.edge * 0.24
            : 1;
      const variance = (random() - 0.5) * controls.particleSizeVariance;
      const size = Math.max(0.08, imageSize * (1 + variance));

      positions.push(x, y, 0);
      colors.push(color.r, color.g, color.b);
      progresses.push(point.progress);
      layers.push(layerRatio);
      randoms.push(random(), random(), random(), random());
      masks.push(mask);
      sizes.push(size);
      depths.push(depthAmount);
      radii.push(Math.hypot(x, y));
      angles.push(Math.atan2(y, x));
      glass.push(
        sampledColor?.rim ?? 0,
        sampledColor?.highlight ?? 0,
        sampledColor?.refraction ?? 0,
        sampledColor?.interior ?? 0
      );
    }
  }

  if (positions.length === 0) {
    positions.push(0, 0, 0);
    colors.push(baseColor.r, baseColor.g, baseColor.b);
    progresses.push(0);
    layers.push(0);
    randoms.push(0.5, 0.5, 0.5, 0.5);
    masks.push(1);
    sizes.push(1);
    depths.push(0);
    radii.push(0);
    angles.push(0);
    glass.push(0, 0, 0, 0);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3));
  geometry.setAttribute('aProgress', new BufferAttribute(new Float32Array(progresses), 1));
  geometry.setAttribute('aLayer', new BufferAttribute(new Float32Array(layers), 1));
  geometry.setAttribute('aRandom', new BufferAttribute(new Float32Array(randoms), 4));
  geometry.setAttribute('aMask', new BufferAttribute(new Float32Array(masks), 1));
  geometry.setAttribute('aSize', new BufferAttribute(new Float32Array(sizes), 1));
  geometry.setAttribute('aDepth', new BufferAttribute(new Float32Array(depths), 1));
  geometry.setAttribute('aRadius', new BufferAttribute(new Float32Array(radii), 1));
  geometry.setAttribute('aAngle', new BufferAttribute(new Float32Array(angles), 1));
  geometry.setAttribute('aGlass', new BufferAttribute(new Float32Array(glass), 4));
  geometry.computeBoundingSphere();

  return {
    geometry,
    stats: {
      particles: positions.length / 3,
      layers: layerCount,
      samplesPerLayer,
      imageSampled: Boolean(sampler),
      droppedByImageShape,
    },
  };
}
