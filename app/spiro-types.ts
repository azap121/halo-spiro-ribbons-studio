export type SpiroCurveMode = 'hypotrochoid' | 'epitrochoid' | 'lissajous';

export type SpiroImageMode = 'behind' | 'sampled' | 'clipped';

export type SpiroFitMode = 'contain' | 'cover' | 'stretch';

export type SpiroBackgroundMode = 'white' | 'transparent' | 'checker' | 'custom';

export type SpiroColorMode = 'monochrome' | 'source' | 'source-muted' | 'halo-tonal';

export type SpiroAnimationMotion = 'rotate' | 'draw-on' | 'pulse' | 'orbit';

export type SpiroAnimationDirection = 'forward' | 'reverse' | 'alternate';

export type SpiroBlendMode = 'source-over' | 'multiply' | 'screen' | 'lighter';

export type SpiroRenderMode = 'flat' | 'dimensional';

export type SpiroCameraMode = 'perspective' | 'orthographic';

export type SpiroToneMappingMode = 'none' | 'aces';

export type SpiroWebglLook = 'spiro-grain' | 'data-ring';

export type SpiroWebglPalette = 'halo' | 'blue-gray' | 'cyan';

export type SpiroHologramColorway = 'blue-gray' | 'cyan' | 'halo';

export type SpiroProjectionMode = 'flat' | 'dome' | 'sphere' | 'hologram-shell';

export type SpiroWebglImageRole = 'shape-color' | 'shape-only' | 'color-only' | 'depth-only';

export type SpiroWebglImageMaskSource = 'alpha' | 'luminance' | 'alpha-luminance' | 'inverted-luminance' | 'glass';

export type SpiroWebglImageShapePreset =
  | 'auto'
  | 'cloud'
  | 'tree'
  | 'petals'
  | 'globe'
  | 'planet'
  | 'glass-sphere';

export interface RibbonControlValues {
  preset: string;
  curveMode: SpiroCurveMode;
  strokeColor: string;
  strokeWidth: number;
  opacity: number;
  pointCount: number;
  ribbonCount: number;
  outerRadius: number;
  innerRadius: number;
  penOffset: number;
  symmetry: number;
  lineDensity: number;
  rotation: number;
  scale: number;
  blendMode: SpiroBlendMode;
}

export interface ImageControlValues {
  imageMode: SpiroImageMode;
  colorMode: SpiroColorMode;
  fitMode: SpiroFitMode;
  imageOpacity: number;
  backgroundMode: SpiroBackgroundMode;
  backgroundColor: string;
  threshold: number;
  contrast: number;
  soften: number;
}

export interface AnimationControlValues {
  playing: boolean;
  speed: number;
  direction: SpiroAnimationDirection;
  motion: SpiroAnimationMotion;
  phase: number;
  reveal: number;
  pulse: number;
}

export interface ExportControlValues {
  exportScale: number;
  transparentExport: boolean;
}

export interface RenderControlValues {
  webglPreset: string;
  look: SpiroWebglLook;
  projectionMode: SpiroProjectionMode;
  projectionBlend: number;
  sphereRadius: number;
  shellThickness: number;
  palette: SpiroWebglPalette;
  order: number;
  voidRadius: number;
  ringThickness: number;
  traceStrength: number;
  seed: number;
  fitMode: SpiroFitMode;
  backgroundMode: SpiroBackgroundMode;
  backgroundColor: string;
  particleCount: number;
  particleSize: number;
  particleSoftness: number;
  particleOpacity: number;
  imageRole: SpiroWebglImageRole;
  imageMaskSource: SpiroWebglImageMaskSource;
  imageShapePreset: SpiroWebglImageShapePreset;
  hologramIntensity: number;
  hologramGlow: number;
  hologramScanlineDensity: number;
  hologramScanlineSpeed: number;
  hologramShimmer: number;
  hologramNoise: number;
  hologramEdgeFalloff: number;
  hologramChromaticSplit: number;
  hologramColorway: SpiroHologramColorway;
  dimensionality: number;
  domeDepth: number;
  twistDepth: number;
  twistFrequency: number;
  imageDepth: number;
  shapeThreshold: number;
  shapeSoftness: number;
  preserveSpiro: number;
  swirl: number;
  turbulence: number;
  audioSensitivity: number;
  actionStrength: number;
  autoRotate: boolean;
  rotationX: number;
  rotationY: number;
  rotationZ: number;
  cameraMode: SpiroCameraMode;
  cameraDistance: number;
  cameraFov: number;
  toneMapping: SpiroToneMappingMode;
}

export interface SpiroRibbonConfig
  extends RibbonControlValues,
    ImageControlValues,
    AnimationControlValues {}

export interface UploadedRasterImage {
  fileName: string;
  fileSize: number;
  url: string;
  element: HTMLImageElement;
}

export interface SpiroPreset {
  id: string;
  name: string;
  description: string;
  controls: RibbonControlValues;
}
