import type { SpiroRibbonConfig } from './spiro-types';

export const SPIRO_TAU = Math.PI * 2;

export interface SpiroRawPoint {
  x: number;
  y: number;
  progress: number;
}

export interface NormalizedSpiroPoint {
  x: number;
  y: number;
  progress: number;
  rawX: number;
  rawY: number;
  bound: number;
  layerIndex: number;
}

export interface SpiroPoint {
  x: number;
  y: number;
  progress: number;
}

export interface SpiroRawLayerGeometry {
  points: SpiroRawPoint[];
  bound: number;
  layerPhase: number;
  pointCount: number;
  tMax: number;
}

export interface SpiroCanvasTransform {
  centerX: number;
  centerY: number;
  scale: number;
  rotation: number;
  cos: number;
  sin: number;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function resolveSpiroAnimatedPhase(config: SpiroRibbonConfig, elapsedMs: number): number {
  if (!config.playing) {
    return config.phase * SPIRO_TAU;
  }

  const elapsed = elapsedMs / 1000;
  const direction = config.direction === 'reverse' ? -1 : 1;
  const alternateDirection =
    config.direction === 'alternate' && Math.floor(elapsed * Math.max(config.speed, 0.05)) % 2 === 1
      ? -1
      : direction;

  return (config.phase + elapsed * config.speed * 0.08 * alternateDirection) * SPIRO_TAU;
}

export function resolveSpiroLayerPhase(config: SpiroRibbonConfig, layerIndex: number, elapsedMs = 0): number {
  return resolveSpiroAnimatedPhase(config, elapsedMs) + (layerIndex / Math.max(config.ribbonCount, 1)) * SPIRO_TAU;
}

function getRawPoint(config: SpiroRibbonConfig, t: number, layerPhase: number): SpiroRawPoint {
  const phase = t + layerPhase;
  const radiusA = Math.max(config.outerRadius, config.innerRadius + 0.05);
  const radiusB = Math.max(config.innerRadius, 0.04);
  const penOffset = Math.max(config.penOffset, 0.02);

  if (config.curveMode === 'epitrochoid') {
    const ratio = (radiusA + radiusB) / radiusB;

    return {
      x: (radiusA + radiusB) * Math.cos(phase) - penOffset * Math.cos(ratio * phase),
      y: (radiusA + radiusB) * Math.sin(phase) - penOffset * Math.sin(ratio * phase),
      progress: 0,
    };
  }

  if (config.curveMode === 'lissajous') {
    const primary = Math.max(1, Math.round(config.symmetry));
    const secondary = Math.max(1, Math.round(config.symmetry + config.lineDensity));

    return {
      x: Math.sin(primary * phase + penOffset * SPIRO_TAU),
      y: Math.sin(secondary * phase),
      progress: 0,
    };
  }

  const ratio = (radiusA - radiusB) / radiusB;

  return {
    x: (radiusA - radiusB) * Math.cos(phase) + penOffset * Math.cos(ratio * phase),
    y: (radiusA - radiusB) * Math.sin(phase) - penOffset * Math.sin(ratio * phase),
    progress: 0,
  };
}

export function generateSpiroRawLayerGeometry(
  config: SpiroRibbonConfig,
  layerIndex: number,
  elapsedMs = 0
): SpiroRawLayerGeometry {
  const pointCount = Math.round(clamp(config.pointCount, 120, 6000));
  const points: SpiroRawPoint[] = [];
  const layerPhase = resolveSpiroLayerPhase(config, layerIndex, elapsedMs);
  const tMax = SPIRO_TAU * Math.max(config.lineDensity, 1);
  let bound = 0.001;

  for (let index = 0; index < pointCount; index += 1) {
    const progress = pointCount === 1 ? 1 : index / (pointCount - 1);
    const rawPoint = getRawPoint(config, progress * tMax, layerPhase);
    rawPoint.progress = progress;
    points.push(rawPoint);
    bound = Math.max(bound, Math.abs(rawPoint.x), Math.abs(rawPoint.y));
  }

  return {
    points,
    bound,
    layerPhase,
    pointCount,
    tMax,
  };
}

export function generateSpiroNormalizedPoints(
  config: SpiroRibbonConfig,
  layerIndex: number,
  elapsedMs = 0
): NormalizedSpiroPoint[] {
  const layer = generateSpiroRawLayerGeometry(config, layerIndex, elapsedMs);

  return layer.points.map((point) => ({
    x: point.x / layer.bound,
    y: point.y / layer.bound,
    progress: point.progress,
    rawX: point.x,
    rawY: point.y,
    bound: layer.bound,
    layerIndex,
  }));
}

export function resolveSpiroCanvasTransform(
  config: SpiroRibbonConfig,
  width: number,
  height: number,
  layerIndex: number,
  elapsedMs = 0
): SpiroCanvasTransform {
  const canvasMin = Math.min(width, height);
  const centerX = width / 2;
  const centerY = height / 2;
  const scale = canvasMin * 0.42 * config.scale;
  const baseRotation = ((config.rotation + layerIndex * (180 / Math.max(config.ribbonCount, 1))) * Math.PI) / 180;
  const animatedRotation =
    config.playing && (config.motion === 'rotate' || config.motion === 'orbit')
      ? (elapsedMs / 1000) * config.speed * (config.direction === 'reverse' ? -0.35 : 0.35)
      : 0;
  const rotation = baseRotation + animatedRotation;

  return {
    centerX,
    centerY,
    scale,
    rotation,
    cos: Math.cos(rotation),
    sin: Math.sin(rotation),
  };
}

export function mapSpiroPointToCanvas(point: NormalizedSpiroPoint, transform: SpiroCanvasTransform): SpiroPoint {
  return {
    x: transform.centerX + (point.x * transform.cos - point.y * transform.sin) * transform.scale,
    y: transform.centerY + (point.x * transform.sin + point.y * transform.cos) * transform.scale,
    progress: point.progress,
  };
}

export function generateSpiroLayerPoints(
  config: SpiroRibbonConfig,
  width: number,
  height: number,
  layerIndex: number,
  elapsedMs = 0
): SpiroPoint[] {
  const points = generateSpiroNormalizedPoints(config, layerIndex, elapsedMs);
  const transform = resolveSpiroCanvasTransform(config, width, height, layerIndex, elapsedMs);

  return points.map((point) => mapSpiroPointToCanvas(point, transform));
}
