import type {
  SpiroFitMode,
  SpiroRibbonConfig,
  UploadedRasterImage,
} from './spiro-types';
import { clamp, generateSpiroLayerPoints } from './spiro-math';
import type { SpiroPoint } from './spiro-math';

const SAMPLE_SIZE = 256;

export {
  SPIRO_TAU,
  clamp,
  generateSpiroLayerPoints,
  generateSpiroNormalizedPoints,
  generateSpiroRawLayerGeometry,
  mapSpiroPointToCanvas,
  resolveSpiroAnimatedPhase,
  resolveSpiroCanvasTransform,
  resolveSpiroLayerPhase,
} from './spiro-math';
export type {
  NormalizedSpiroPoint,
  SpiroCanvasTransform,
  SpiroPoint,
  SpiroRawLayerGeometry,
  SpiroRawPoint,
} from './spiro-math';

export interface SampledColor {
  r: number;
  g: number;
  b: number;
  a: number;
  luminance: number;
}

export interface ImageSampler {
  width: number;
  height: number;
  sample: (x: number, y: number) => SampledColor;
}

function hexToRgb(hex: string): Omit<SampledColor, 'a' | 'luminance'> {
  const normalized = hex.replace('#', '');
  const safeHex = normalized.length === 3
    ? normalized.split('').map((digit) => `${digit}${digit}`).join('')
    : normalized.padEnd(6, '0').slice(0, 6);
  const numeric = Number.parseInt(safeHex, 16);

  return {
    r: (numeric >> 16) & 255,
    g: (numeric >> 8) & 255,
    b: numeric & 255,
  };
}

function rgbaString(color: SampledColor, opacity: number): string {
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${clamp(opacity * color.a, 0, 1)})`;
}

function mixColor(base: SampledColor, accent: SampledColor, amount: number): SampledColor {
  const mix = clamp(amount, 0, 1);

  return {
    r: Math.round(base.r + (accent.r - base.r) * mix),
    g: Math.round(base.g + (accent.g - base.g) * mix),
    b: Math.round(base.b + (accent.b - base.b) * mix),
    a: base.a,
    luminance: base.luminance,
  };
}

function getBaseColor(config: SpiroRibbonConfig): SampledColor {
  const color = hexToRgb(config.strokeColor);

  return {
    ...color,
    a: 1,
    luminance: (0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b) / 255,
  };
}

export function drawFittedImage(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  width: number,
  height: number,
  fitMode: SpiroFitMode,
  opacity: number,
  filter?: string
): void {
  const sourceWidth =
    'naturalWidth' in image && image.naturalWidth ? image.naturalWidth : 'width' in image ? Number(image.width) : width;
  const sourceHeight =
    'naturalHeight' in image && image.naturalHeight
      ? image.naturalHeight
      : 'height' in image
        ? Number(image.height)
        : height;

  let drawWidth = width;
  let drawHeight = height;
  let drawX = 0;
  let drawY = 0;

  if (fitMode !== 'stretch') {
    const scale = fitMode === 'cover'
      ? Math.max(width / sourceWidth, height / sourceHeight)
      : Math.min(width / sourceWidth, height / sourceHeight);
    drawWidth = sourceWidth * scale;
    drawHeight = sourceHeight * scale;
    drawX = (width - drawWidth) / 2;
    drawY = (height - drawHeight) / 2;
  }

  ctx.save();
  ctx.globalAlpha = clamp(opacity, 0, 1);
  if (filter) {
    ctx.filter = filter;
  }
  ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
  ctx.restore();
}

export function createImageSampler(image: UploadedRasterImage, fitMode: SpiroFitMode): ImageSampler {
  const canvas = document.createElement('canvas');
  canvas.width = SAMPLE_SIZE;
  canvas.height = SAMPLE_SIZE;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    throw new Error('Canvas image sampling is unavailable.');
  }

  ctx.clearRect(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
  drawFittedImage(ctx, image.element, SAMPLE_SIZE, SAMPLE_SIZE, fitMode, 1);
  const imageData = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);

  return {
    width: SAMPLE_SIZE,
    height: SAMPLE_SIZE,
    sample: (x: number, y: number) => {
      const sampleX = Math.round(clamp(x, 0, 1) * (SAMPLE_SIZE - 1));
      const sampleY = Math.round(clamp(y, 0, 1) * (SAMPLE_SIZE - 1));
      const index = (sampleY * SAMPLE_SIZE + sampleX) * 4;
      const r = imageData.data[index] ?? 0;
      const g = imageData.data[index + 1] ?? 0;
      const b = imageData.data[index + 2] ?? 0;
      const a = (imageData.data[index + 3] ?? 255) / 255;

      return {
        r,
        g,
        b,
        a,
        luminance: (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255,
      };
    },
  };
}

function getRevealLimit(config: SpiroRibbonConfig, pointCount: number, elapsedMs: number): number {
  if (config.motion !== 'draw-on') {
    return pointCount;
  }

  const animatedReveal = config.playing
    ? (config.reveal + (elapsedMs / 1000) * config.speed * 0.16) % 1
    : config.reveal;

  return Math.max(2, Math.round(pointCount * clamp(animatedReveal, 0.02, 1)));
}

function getStrokeWidth(config: SpiroRibbonConfig, elapsedMs: number, layerIndex: number): number {
  if (config.motion !== 'pulse') {
    return config.strokeWidth;
  }

  const wave = Math.sin(elapsedMs / 450 + layerIndex * 0.8);
  const pulseAmount = config.playing ? config.pulse : config.pulse * 0.35;

  return Math.max(0.4, config.strokeWidth * (1 + wave * pulseAmount * 0.55));
}

function resolveSegmentColor(
  config: SpiroRibbonConfig,
  point: SpiroPoint,
  width: number,
  height: number,
  sampler: ImageSampler | null
): SampledColor {
  const baseColor = getBaseColor(config);
  if (!sampler || config.colorMode === 'monochrome') {
    return baseColor;
  }

  const sampledColor = sampler.sample(point.x / width, point.y / height);

  if (config.colorMode === 'source-muted') {
    return mixColor(sampledColor, baseColor, 0.42);
  }

  if (config.colorMode === 'halo-tonal') {
    return mixColor(baseColor, sampledColor, sampledColor.luminance * 0.5);
  }

  return sampledColor;
}

function drawCheckerboard(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const size = 16;
  ctx.save();
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);
  for (let y = 0; y < height; y += size) {
    for (let x = 0; x < width; x += size) {
      if ((x / size + y / size) % 2 === 0) {
        ctx.fillStyle = '#F2F1EC';
        ctx.fillRect(x, y, size, size);
      }
    }
  }
  ctx.restore();
}

function fillBackground(ctx: CanvasRenderingContext2D, config: SpiroRibbonConfig, width: number, height: number): void {
  if (config.backgroundMode === 'transparent') {
    return;
  }

  if (config.backgroundMode === 'checker') {
    drawCheckerboard(ctx, width, height);
    return;
  }

  ctx.fillStyle = config.backgroundMode === 'custom' ? config.backgroundColor : '#FFFFFF';
  ctx.fillRect(0, 0, width, height);
}

function drawRibbonLines(
  ctx: CanvasRenderingContext2D,
  config: SpiroRibbonConfig,
  width: number,
  height: number,
  sampler: ImageSampler | null,
  elapsedMs: number,
  maskOnly = false
): void {
  const layerCount = Math.max(1, Math.round(config.ribbonCount));

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.globalCompositeOperation = maskOnly ? 'source-over' : config.blendMode;

  for (let layerIndex = 0; layerIndex < layerCount; layerIndex += 1) {
    const points = generateSpiroLayerPoints(config, width, height, layerIndex, elapsedMs);
    const visibleCount = getRevealLimit(config, points.length, elapsedMs);
    const strokeWidth = getStrokeWidth(config, elapsedMs, layerIndex);

    if (maskOnly || config.imageMode !== 'sampled' || !sampler) {
      const baseColor = getBaseColor(config);
      ctx.beginPath();
      points.slice(0, visibleCount).forEach((point, index) => {
        if (index === 0) {
          ctx.moveTo(point.x, point.y);
        } else {
          ctx.lineTo(point.x, point.y);
        }
      });
      ctx.strokeStyle = maskOnly ? '#000000' : rgbaString(baseColor, config.opacity);
      ctx.lineWidth = maskOnly ? Math.max(strokeWidth * 3, 5) : strokeWidth;
      ctx.stroke();
      continue;
    }

    ctx.lineWidth = strokeWidth;
    for (let index = 1; index < visibleCount; index += 1) {
      const previousPoint = points[index - 1];
      const point = points[index];
      if (!previousPoint || !point) {
        continue;
      }

      const sampledColor = resolveSegmentColor(config, point, width, height, sampler);
      const thresholdAlpha = sampledColor.luminance >= config.threshold ? 1 : sampledColor.luminance * 0.6;

      ctx.beginPath();
      ctx.moveTo(previousPoint.x, previousPoint.y);
      ctx.lineTo(point.x, point.y);
      ctx.strokeStyle = rgbaString(sampledColor, config.opacity * thresholdAlpha);
      ctx.stroke();
    }
  }

  ctx.restore();
}

export function renderSpiroRibbonFrame(
  ctx: CanvasRenderingContext2D,
  config: SpiroRibbonConfig,
  width: number,
  height: number,
  sampler: ImageSampler | null,
  image: UploadedRasterImage | null,
  elapsedMs: number
): void {
  ctx.clearRect(0, 0, width, height);
  fillBackground(ctx, config, width, height);

  const filter = `contrast(${Math.round(config.contrast * 100)}%) blur(${config.soften}px)`;

  if (image && config.imageMode === 'behind') {
    drawFittedImage(ctx, image.element, width, height, config.fitMode, config.imageOpacity, filter);
  }

  if (image && config.imageMode === 'clipped') {
    drawFittedImage(ctx, image.element, width, height, config.fitMode, config.imageOpacity, filter);
    ctx.save();
    ctx.globalCompositeOperation = 'destination-in';
    drawRibbonLines(ctx, config, width, height, null, elapsedMs, true);
    ctx.restore();

    const outlineConfig = {
      ...config,
      opacity: Math.min(config.opacity, 0.5),
      imageMode: 'behind' as const,
    };
    drawRibbonLines(ctx, outlineConfig, width, height, null, elapsedMs);
    return;
  }

  drawRibbonLines(ctx, config, width, height, sampler, elapsedMs);
}

function pointsToPath(points: SpiroPoint[]): string {
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ');
}

export function buildSpiroSvg(config: SpiroRibbonConfig, width: number, height: number, transparent = false): string {
  const baseColor = getBaseColor(config);
  const layerCount = Math.max(1, Math.round(config.ribbonCount));
  const background =
    transparent || config.backgroundMode === 'transparent'
      ? ''
      : `<rect width="100%" height="100%" fill="${config.backgroundMode === 'custom' ? config.backgroundColor : '#FFFFFF'}" />`;
  const paths = Array.from({ length: layerCount }, (_, layerIndex) => {
    const points = generateSpiroLayerPoints(config, width, height, layerIndex);
    return `<path d="${pointsToPath(points)}" fill="none" stroke="rgb(${baseColor.r} ${baseColor.g} ${baseColor.b})" stroke-width="${config.strokeWidth}" stroke-linecap="round" stroke-linejoin="round" opacity="${config.opacity}" />`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(width)}" height="${Math.round(height)}" viewBox="0 0 ${width.toFixed(2)} ${height.toFixed(2)}">${background}<g>${paths}</g></svg>`;
}
