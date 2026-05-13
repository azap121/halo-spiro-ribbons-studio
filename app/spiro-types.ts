export type SpiroCurveMode = 'hypotrochoid' | 'epitrochoid' | 'lissajous';

export type SpiroImageMode = 'behind' | 'sampled' | 'clipped';

export type SpiroFitMode = 'contain' | 'cover' | 'stretch';

export type SpiroBackgroundMode = 'white' | 'transparent' | 'checker' | 'custom';

export type SpiroColorMode = 'monochrome' | 'source' | 'source-muted' | 'halo-tonal';

export type SpiroAnimationMotion = 'rotate' | 'draw-on' | 'pulse' | 'orbit';

export type SpiroAnimationDirection = 'forward' | 'reverse' | 'alternate';

export type SpiroBlendMode = 'source-over' | 'multiply' | 'screen' | 'lighter';

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
