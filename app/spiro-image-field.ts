import { clamp } from './spiro-math';
import type { SpiroFitMode, UploadedRasterImage } from './spiro-types';

export type SpiroImageFieldMaskMode = 'alpha' | 'luminance' | 'alpha-luminance' | 'inverted-luminance' | 'glass';

export interface SpiroImageFieldOptions {
  resolution?: number;
  fitMode?: SpiroFitMode;
  threshold?: number;
  maskMode?: SpiroImageFieldMaskMode;
  edgeSoftness?: number;
}

export interface SpiroImageFieldSample {
  r: number;
  g: number;
  b: number;
  a: number;
  luminance: number;
  mask: number;
  backgroundDelta: number;
  edgeMagnitude: number;
  rim: number;
  highlight: number;
  refraction: number;
  interior: number;
  inside: boolean;
  signedDistance: number;
  signedDistancePx: number;
  edge: number;
  gradientX: number;
  gradientY: number;
}

export interface SpiroImageFieldData {
  color: Uint8ClampedArray;
  alpha: Float32Array;
  luminance: Float32Array;
  mask: Float32Array;
  backgroundDelta: Float32Array;
  edgeMagnitude: Float32Array;
  rim: Float32Array;
  highlight: Float32Array;
  refraction: Float32Array;
  interior: Float32Array;
  inside: Uint8Array;
  signedDistance: Float32Array;
  signedDistancePx: Float32Array;
  edge: Float32Array;
  gradientX: Float32Array;
  gradientY: Float32Array;
}

export interface SpiroImageField {
  width: number;
  height: number;
  fitMode: SpiroFitMode;
  threshold: number;
  maskMode: SpiroImageFieldMaskMode;
  data: SpiroImageFieldData;
  sample: (x: number, y: number) => SpiroImageFieldSample;
}

const DEFAULT_RESOLUTION = 128;
const MIN_RESOLUTION = 32;
const MAX_RESOLUTION = 256;
const DEFAULT_THRESHOLD = 0.08;
const DEFAULT_EDGE_SOFTNESS = 0.05;
const INF = 1_000_000;

interface RgbColor {
  r: number;
  g: number;
  b: number;
}

interface GlassCircleFit {
  x: number;
  y: number;
  radius: number;
  confidence: number;
}

function getSourceSize(image: CanvasImageSource): { width: number; height: number } {
  const width =
    'naturalWidth' in image && image.naturalWidth ? image.naturalWidth : 'width' in image ? Number(image.width) : 1;
  const height =
    'naturalHeight' in image && image.naturalHeight
      ? image.naturalHeight
      : 'height' in image
        ? Number(image.height)
        : 1;

  return {
    width: Math.max(1, width),
    height: Math.max(1, height),
  };
}

function drawFittedRaster(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  width: number,
  height: number,
  fitMode: SpiroFitMode
): void {
  const source = getSourceSize(image);
  let drawWidth = width;
  let drawHeight = height;
  let drawX = 0;
  let drawY = 0;

  if (fitMode !== 'stretch') {
    const scale =
      fitMode === 'cover'
        ? Math.max(width / source.width, height / source.height)
        : Math.min(width / source.width, height / source.height);
    drawWidth = source.width * scale;
    drawHeight = source.height * scale;
    drawX = (width - drawWidth) / 2;
    drawY = (height - drawHeight) / 2;
  }

  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
}

function resolveMaskValue(alpha: number, luminance: number, mode: SpiroImageFieldMaskMode): number {
  if (mode === 'alpha') {
    return alpha;
  }

  if (mode === 'luminance') {
    return alpha * luminance;
  }

  if (mode === 'inverted-luminance') {
    return alpha * (1 - luminance);
  }

  if (mode === 'glass') {
    return alpha * luminance;
  }

  return alpha < 0.99 ? alpha : luminance;
}

function smoothStep(edge0: number, edge1: number, value: number): number {
  if (edge0 === edge1) {
    return value < edge0 ? 0 : 1;
  }

  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);

  return t * t * (3 - 2 * t);
}

function resolveColorDelta(r: number, g: number, b: number, background: RgbColor): number {
  const dr = r / 255 - background.r;
  const dg = g / 255 - background.g;
  const db = b / 255 - background.b;

  return clamp(Math.hypot(dr, dg, db) / Math.sqrt(3), 0, 1);
}

function resolveSaturation(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;

  return max <= 0.001 ? 0 : (max - min) / max;
}

function estimateBackgroundColor(color: Uint8ClampedArray, width: number, height: number): RgbColor {
  const border = Math.max(2, Math.floor(Math.min(width, height) * 0.05));
  let r = 0;
  let g = 0;
  let b = 0;
  let weight = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (x >= border && x < width - border && y >= border && y < height - border) {
        continue;
      }

      const index = (y * width + x) * 4;
      const alpha = (color[index + 3] ?? 0) / 255;
      if (alpha <= 0.05) {
        continue;
      }

      r += ((color[index] ?? 0) / 255) * alpha;
      g += ((color[index + 1] ?? 0) / 255) * alpha;
      b += ((color[index + 2] ?? 0) / 255) * alpha;
      weight += alpha;
    }
  }

  if (weight <= 0.001) {
    return { r: 0.95, g: 0.94, b: 0.89 };
  }

  return {
    r: r / weight,
    g: g / weight,
    b: b / weight,
  };
}

function sampleCombinedSignal(
  luminance: Float32Array,
  backgroundDelta: Float32Array,
  width: number,
  height: number,
  x: number,
  y: number
): number {
  const safeX = Math.min(width - 1, Math.max(0, x));
  const safeY = Math.min(height - 1, Math.max(0, y));
  const index = safeY * width + safeX;

  return (luminance[index] ?? 0) * 0.6 + (backgroundDelta[index] ?? 0) * 0.8;
}

function createEdgeMagnitudeField(
  luminance: Float32Array,
  backgroundDelta: Float32Array,
  width: number,
  height: number
): Float32Array {
  const edgeMagnitude = new Float32Array(width * height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const topLeft = sampleCombinedSignal(luminance, backgroundDelta, width, height, x - 1, y - 1);
      const top = sampleCombinedSignal(luminance, backgroundDelta, width, height, x, y - 1);
      const topRight = sampleCombinedSignal(luminance, backgroundDelta, width, height, x + 1, y - 1);
      const left = sampleCombinedSignal(luminance, backgroundDelta, width, height, x - 1, y);
      const right = sampleCombinedSignal(luminance, backgroundDelta, width, height, x + 1, y);
      const bottomLeft = sampleCombinedSignal(luminance, backgroundDelta, width, height, x - 1, y + 1);
      const bottom = sampleCombinedSignal(luminance, backgroundDelta, width, height, x, y + 1);
      const bottomRight = sampleCombinedSignal(luminance, backgroundDelta, width, height, x + 1, y + 1);
      const gx = -topLeft - left * 2 - bottomLeft + topRight + right * 2 + bottomRight;
      const gy = -topLeft - top * 2 - topRight + bottomLeft + bottom * 2 + bottomRight;

      edgeMagnitude[y * width + x] = clamp(Math.hypot(gx, gy) * 0.28, 0, 1);
    }
  }

  return edgeMagnitude;
}

function fitGlassCircle(
  alpha: Float32Array,
  backgroundDelta: Float32Array,
  saturation: Float32Array,
  edgeMagnitude: Float32Array,
  width: number,
  height: number
): GlassCircleFit {
  const minDimension = Math.min(width, height);
  const margin = Math.max(2, Math.floor(minDimension * 0.04));
  let weightedX = 0;
  let weightedY = 0;
  let totalWeight = 0;
  let boundsMinX = width;
  let boundsMinY = height;
  let boundsMaxX = 0;
  let boundsMaxY = 0;
  let boundsWeight = 0;

  for (let y = margin; y < height - margin; y += 1) {
    for (let x = margin; x < width - margin; x += 1) {
      const index = y * width + x;
      if ((alpha[index] ?? 0) <= 0.05) {
        continue;
      }

      const weight = Math.max(
        0,
        (backgroundDelta[index] ?? 0) * 1.5 + (saturation[index] ?? 0) * 0.65 + (edgeMagnitude[index] ?? 0) * 2.2 - 0.035
      );
      const boundsSignal =
        (backgroundDelta[index] ?? 0) * 1.4 + (saturation[index] ?? 0) * 0.52 + (edgeMagnitude[index] ?? 0) * 2.4;

      if (boundsSignal > 0.045) {
        boundsMinX = Math.min(boundsMinX, x);
        boundsMinY = Math.min(boundsMinY, y);
        boundsMaxX = Math.max(boundsMaxX, x);
        boundsMaxY = Math.max(boundsMaxY, y);
        boundsWeight += boundsSignal;
      }

      weightedX += x * weight;
      weightedY += y * weight;
      totalWeight += weight;
    }
  }

  const hasSignalBounds = boundsWeight > 0.001 && boundsMaxX > boundsMinX && boundsMaxY > boundsMinY;
  const boundsCenterX = hasSignalBounds ? (boundsMinX + boundsMaxX) / 2 : width / 2;
  const boundsCenterY = hasSignalBounds ? (boundsMinY + boundsMaxY) / 2 : height / 2;
  const weightedCenterX = totalWeight > 0.001 ? weightedX / totalWeight : boundsCenterX;
  const weightedCenterY = totalWeight > 0.001 ? weightedY / totalWeight : boundsCenterY;
  const centerX = hasSignalBounds ? weightedCenterX * 0.34 + boundsCenterX * 0.66 : weightedCenterX;
  const centerY = hasSignalBounds ? weightedCenterY * 0.34 + boundsCenterY * 0.66 : weightedCenterY;
  const histogramSize = 96;
  const histogram = new Float32Array(histogramSize);
  const maxRadius = minDimension * 0.58;
  const minRadius = minDimension * 0.08;
  const boundsRadius = hasSignalBounds ? Math.max(boundsMaxX - boundsMinX, boundsMaxY - boundsMinY) * 0.56 : 0;
  let moment = 0;

  for (let y = margin; y < height - margin; y += 1) {
    for (let x = margin; x < width - margin; x += 1) {
      const index = y * width + x;
      if ((alpha[index] ?? 0) <= 0.05) {
        continue;
      }

      const distance = Math.hypot(x - centerX, y - centerY);
      if (distance < minRadius || distance > maxRadius) {
        continue;
      }

      const weight = Math.max(
        0,
        (backgroundDelta[index] ?? 0) * 1.1 + (saturation[index] ?? 0) * 0.52 + (edgeMagnitude[index] ?? 0) * 2.8 - 0.025
      );
      const bin = Math.min(histogramSize - 1, Math.max(0, Math.floor((distance / maxRadius) * histogramSize)));

      histogram[bin] = (histogram[bin] ?? 0) + weight;
      moment += distance * distance * weight;
    }
  }

  let peakIndex = 0;
  let peakValue = 0;
  for (let index = 0; index < histogram.length; index += 1) {
    const value = histogram[index] ?? 0;
    if (value > peakValue) {
      peakIndex = index;
      peakValue = value;
    }
  }

  const fallbackRadius = Math.sqrt(moment / Math.max(totalWeight, 0.001)) * 1.25;
  const peakRadius = ((peakIndex + 0.5) / histogramSize) * maxRadius;
  const radius = peakValue > 0.001 ? Math.max(peakRadius, boundsRadius * 0.88) : Math.max(fallbackRadius, boundsRadius);

  return {
    x: centerX,
    y: centerY,
    radius: clamp(radius, minDimension * 0.18, minDimension * 0.55),
    confidence: clamp(totalWeight / (width * height * 0.03), 0, 1),
  };
}

function createDistanceField(seed: Uint8Array, seedValue: number, width: number, height: number): Float32Array {
  const distance = new Float32Array(width * height);

  for (let index = 0; index < distance.length; index += 1) {
    distance[index] = seed[index] === seedValue ? 0 : INF;
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      let value = distance[index] ?? INF;

      if (x > 0) {
        value = Math.min(value, (distance[index - 1] ?? INF) + 1);
      }
      if (y > 0) {
        value = Math.min(value, (distance[index - width] ?? INF) + 1);
      }
      if (x > 0 && y > 0) {
        value = Math.min(value, (distance[index - width - 1] ?? INF) + Math.SQRT2);
      }
      if (x < width - 1 && y > 0) {
        value = Math.min(value, (distance[index - width + 1] ?? INF) + Math.SQRT2);
      }

      distance[index] = value;
    }
  }

  for (let y = height - 1; y >= 0; y -= 1) {
    for (let x = width - 1; x >= 0; x -= 1) {
      const index = y * width + x;
      let value = distance[index] ?? INF;

      if (x < width - 1) {
        value = Math.min(value, (distance[index + 1] ?? INF) + 1);
      }
      if (y < height - 1) {
        value = Math.min(value, (distance[index + width] ?? INF) + 1);
      }
      if (x < width - 1 && y < height - 1) {
        value = Math.min(value, (distance[index + width + 1] ?? INF) + Math.SQRT2);
      }
      if (x > 0 && y < height - 1) {
        value = Math.min(value, (distance[index + width - 1] ?? INF) + Math.SQRT2);
      }

      distance[index] = value;
    }
  }

  return distance;
}

function sampleFloat(data: Float32Array, width: number, height: number, x: number, y: number): number {
  const sampleX = clamp(x, 0, 1) * (width - 1);
  const sampleY = clamp(y, 0, 1) * (height - 1);
  const x0 = Math.floor(sampleX);
  const y0 = Math.floor(sampleY);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const tx = sampleX - x0;
  const ty = sampleY - y0;
  const topLeft = data[y0 * width + x0] ?? 0;
  const topRight = data[y0 * width + x1] ?? topLeft;
  const bottomLeft = data[y1 * width + x0] ?? topLeft;
  const bottomRight = data[y1 * width + x1] ?? bottomLeft;
  const top = topLeft + (topRight - topLeft) * tx;
  const bottom = bottomLeft + (bottomRight - bottomLeft) * tx;

  return top + (bottom - top) * ty;
}

function sampleColor(data: Uint8ClampedArray, width: number, height: number, x: number, y: number) {
  const sampleX = Math.round(clamp(x, 0, 1) * (width - 1));
  const sampleY = Math.round(clamp(y, 0, 1) * (height - 1));
  const index = (sampleY * width + sampleX) * 4;

  return {
    r: data[index] ?? 0,
    g: data[index + 1] ?? 0,
    b: data[index + 2] ?? 0,
  };
}

function resolveGradientValue(data: Float32Array, width: number, height: number, x: number, y: number): number {
  const safeX = Math.min(width - 1, Math.max(0, x));
  const safeY = Math.min(height - 1, Math.max(0, y));

  return data[safeY * width + safeX] ?? 0;
}

export function preprocessSpiroImageField(
  image: UploadedRasterImage,
  options: SpiroImageFieldOptions = {}
): SpiroImageField {
  const resolution = Math.round(clamp(options.resolution ?? DEFAULT_RESOLUTION, MIN_RESOLUTION, MAX_RESOLUTION));
  const fitMode = options.fitMode ?? 'contain';
  const threshold = clamp(options.threshold ?? DEFAULT_THRESHOLD, 0, 1);
  const maskMode = options.maskMode ?? 'alpha-luminance';
  const edgeSoftnessPx = Math.max(1, resolution * clamp(options.edgeSoftness ?? DEFAULT_EDGE_SOFTNESS, 0.005, 0.5));
  const canvas = document.createElement('canvas');
  canvas.width = resolution;
  canvas.height = resolution;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    throw new Error('Canvas image field preprocessing is unavailable.');
  }

  drawFittedRaster(ctx, image.element, resolution, resolution, fitMode);

  const imageData = ctx.getImageData(0, 0, resolution, resolution);
  const color = new Uint8ClampedArray(imageData.data);
  const length = resolution * resolution;
  const backgroundColor = estimateBackgroundColor(color, resolution, resolution);
  const backgroundLuminance = 0.2126 * backgroundColor.r + 0.7152 * backgroundColor.g + 0.0722 * backgroundColor.b;
  const alpha = new Float32Array(length);
  const luminance = new Float32Array(length);
  const mask = new Float32Array(length);
  const backgroundDelta = new Float32Array(length);
  const saturation = new Float32Array(length);
  const rim = new Float32Array(length);
  const highlight = new Float32Array(length);
  const refraction = new Float32Array(length);
  const interior = new Float32Array(length);
  const inside = new Uint8Array(length);
  let insideCount = 0;

  for (let index = 0; index < length; index += 1) {
    const colorIndex = index * 4;
    const r = color[colorIndex] ?? 0;
    const g = color[colorIndex + 1] ?? 0;
    const b = color[colorIndex + 2] ?? 0;
    const a = (color[colorIndex + 3] ?? 0) / 255;
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    const maskValue = resolveMaskValue(a, lum, maskMode);
    alpha[index] = a;
    luminance[index] = lum;
    backgroundDelta[index] = a <= 0.05 ? 0 : resolveColorDelta(r, g, b, backgroundColor);
    saturation[index] = a <= 0.05 ? 0 : resolveSaturation(r, g, b);
    mask[index] = maskValue;
    inside[index] = maskValue >= threshold ? 1 : 0;
    insideCount += inside[index] ?? 0;
  }

  const edgeMagnitude = createEdgeMagnitudeField(luminance, backgroundDelta, resolution, resolution);

  if (maskMode === 'glass') {
    const circle = fitGlassCircle(alpha, backgroundDelta, saturation, edgeMagnitude, resolution, resolution);
    insideCount = 0;

    for (let y = 0; y < resolution; y += 1) {
      for (let x = 0; x < resolution; x += 1) {
        const index = y * resolution + x;
        const alphaValue = alpha[index] ?? 0;
        const lum = luminance[index] ?? 0;
        const bgDelta = backgroundDelta[index] ?? 0;
        const edgeMag = edgeMagnitude[index] ?? 0;
        const sat = saturation[index] ?? 0;
        const distance = Math.hypot(x - circle.x, y - circle.y);
        const radial = circle.radius > 0 ? distance / circle.radius : 10;
        const insideCircle = alphaValue * (1 - smoothStep(1.0, 1.18, radial));
        const rimDistance = Math.abs(radial - 1);
        const analyticShell = alphaValue * (1 - smoothStep(1.0, 1.16, radial));
        const analyticRim =
          alphaValue *
          (1 - smoothStep(0.035, 0.18, rimDistance)) *
          (0.38 + circle.confidence * 0.22);
        const analyticRefraction =
          alphaValue *
          (1 - smoothStep(0.12, 0.34, rimDistance)) *
          smoothStep(0.42, 1.0, radial) *
          (0.12 + circle.confidence * 0.1);
        const analyticInterior =
          alphaValue *
          insideCircle *
          (1 - smoothStep(0.86, 1.08, radial)) *
          (0.18 + circle.confidence * 0.08);
        const detectedRim =
          alphaValue *
          clamp(
            (1 - smoothStep(0.035, 0.18, rimDistance)) *
              (0.28 + edgeMag * 1.25 + bgDelta * 0.85 + sat * 0.42),
            0,
            1
          );
        const rimValue = Math.max(analyticRim, detectedRim);
        const highlightValue = Math.max(
          analyticRim * 0.14,
          alphaValue *
            insideCircle *
            clamp(Math.max(0, lum - backgroundLuminance - 0.015) * 5.2 + edgeMag * 0.18 + sat * 0.2, 0, 1)
        );
        const refractionValue = Math.max(
          analyticRefraction,
          alphaValue * insideCircle * clamp(edgeMag * 1.8 + sat * 0.95 + bgDelta * 0.7, 0, 1)
        );
        const interiorValue = Math.max(
          analyticInterior,
          alphaValue *
            insideCircle *
            (1 - smoothStep(0.72, 1.04, radial)) *
            clamp(0.22 + bgDelta * 1.2 + sat * 0.3, 0, 1)
        );
        const maskValue = clamp(
          rimValue * 1.05 +
            refractionValue * 0.48 +
            highlightValue * 0.5 +
            interiorValue * 0.42 +
            analyticShell * 0.12,
          0,
          1
        );

        rim[index] = rimValue;
        highlight[index] = highlightValue;
        refraction[index] = refractionValue;
        interior[index] = interiorValue;
        mask[index] = maskValue;
        inside[index] =
          maskValue >= threshold || insideCircle > 0.02 || (circle.confidence > 0.42 && radial <= 1) ? 1 : 0;
        insideCount += inside[index] ?? 0;
      }
    }
  }

  const outsideCount = length - insideCount;
  const distanceToInside = insideCount > 0 ? createDistanceField(inside, 1, resolution, resolution) : null;
  const distanceToOutside = outsideCount > 0 ? createDistanceField(inside, 0, resolution, resolution) : null;
  const signedDistance = new Float32Array(length);
  const signedDistancePx = new Float32Array(length);
  const edge = new Float32Array(length);
  const gradientX = new Float32Array(length);
  const gradientY = new Float32Array(length);
  const maxDistance = resolution;

  for (let index = 0; index < length; index += 1) {
    const isInside = inside[index] === 1;
    const insideDistance = distanceToInside?.[index] ?? maxDistance;
    const outsideDistance = distanceToOutside?.[index] ?? maxDistance;
    const signedPx = isInside ? outsideDistance : -insideDistance;
    signedDistancePx[index] = signedPx;
    signedDistance[index] = clamp(signedPx / maxDistance, -1, 1);
    edge[index] = clamp(1 - Math.abs(signedPx) / edgeSoftnessPx, 0, 1);
  }

  for (let y = 0; y < resolution; y += 1) {
    for (let x = 0; x < resolution; x += 1) {
      const index = y * resolution + x;
      const dx =
        resolveGradientValue(signedDistancePx, resolution, resolution, x + 1, y) -
        resolveGradientValue(signedDistancePx, resolution, resolution, x - 1, y);
      const dy =
        resolveGradientValue(signedDistancePx, resolution, resolution, x, y + 1) -
        resolveGradientValue(signedDistancePx, resolution, resolution, x, y - 1);
      const lengthValue = Math.hypot(dx, dy);
      gradientX[index] = lengthValue > 0 ? dx / lengthValue : 0;
      gradientY[index] = lengthValue > 0 ? dy / lengthValue : 0;
    }
  }

  const data: SpiroImageFieldData = {
    color,
    alpha,
    luminance,
    mask,
    backgroundDelta,
    edgeMagnitude,
    rim,
    highlight,
    refraction,
    interior,
    inside,
    signedDistance,
    signedDistancePx,
    edge,
    gradientX,
    gradientY,
  };

  return {
    width: resolution,
    height: resolution,
    fitMode,
    threshold,
    maskMode,
    data,
    sample: (x: number, y: number) => {
      const sampledColor = sampleColor(color, resolution, resolution, x, y);
      const sampledMask = sampleFloat(mask, resolution, resolution, x, y);

      return {
        ...sampledColor,
        a: sampleFloat(alpha, resolution, resolution, x, y),
        luminance: sampleFloat(luminance, resolution, resolution, x, y),
        mask: sampledMask,
        backgroundDelta: sampleFloat(backgroundDelta, resolution, resolution, x, y),
        edgeMagnitude: sampleFloat(edgeMagnitude, resolution, resolution, x, y),
        rim: sampleFloat(rim, resolution, resolution, x, y),
        highlight: sampleFloat(highlight, resolution, resolution, x, y),
        refraction: sampleFloat(refraction, resolution, resolution, x, y),
        interior: sampleFloat(interior, resolution, resolution, x, y),
        inside: sampledMask >= threshold,
        signedDistance: sampleFloat(signedDistance, resolution, resolution, x, y),
        signedDistancePx: sampleFloat(signedDistancePx, resolution, resolution, x, y),
        edge: sampleFloat(edge, resolution, resolution, x, y),
        gradientX: sampleFloat(gradientX, resolution, resolution, x, y),
        gradientY: sampleFloat(gradientY, resolution, resolution, x, y),
      };
    },
  };
}
