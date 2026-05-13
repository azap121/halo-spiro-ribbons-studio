'use client';

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import type React from 'react';
import { createImageSampler, buildSpiroSvg, renderSpiroRibbonFrame } from './spiro-engine';
import type { ImageSampler } from './spiro-engine';
import type { SpiroRibbonConfig, UploadedRasterImage } from './spiro-types';

const MAX_DPR = 2;

export interface FrameStats {
  fps: number;
  segments: number;
}

export interface SpiroRibbonCanvasHandle {
  exportPng: (scale: number, transparent: boolean) => string | null;
  exportSvg: (transparent: boolean) => string | null;
}

export interface SpiroRibbonCanvasProps {
  config: SpiroRibbonConfig;
  image: UploadedRasterImage | null;
  onDropImage: (files: FileList) => void;
  onFrameStats?: (stats: FrameStats) => void;
}

function useCanvasSize(containerRef: React.RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState({ width: 960, height: 640 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return undefined;
    }

    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry?.contentRect ?? { width: 960, height: 640 };
      setSize({
        width: Math.max(320, Math.round(width)),
        height: Math.max(320, Math.round(height)),
      });
    });

    observer.observe(container);

    return () => observer.disconnect();
  }, [containerRef]);

  return size;
}

function configureCanvas(canvas: HTMLCanvasElement, width: number, height: number): CanvasRenderingContext2D | null {
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  const targetWidth = Math.round(width * dpr);
  const targetHeight = Math.round(height * dpr);

  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
  }

  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return null;
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

export const SpiroRibbonCanvas = forwardRef<SpiroRibbonCanvasHandle, SpiroRibbonCanvasProps>(
  function SpiroRibbonCanvas({ config, image, onDropImage, onFrameStats }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const statsRef = useRef({ frames: 0, lastReport: performance.now(), lastFps: 0 });
    const [dragActive, setDragActive] = useState(false);
    const [sampler, setSampler] = useState<ImageSampler | null>(null);
    const size = useCanvasSize(containerRef);

    useEffect(() => {
      if (!image) {
        setSampler(null);
        return;
      }

      try {
        setSampler(createImageSampler(image, config.fitMode));
      } catch {
        setSampler(null);
      }
    }, [config.fitMode, image]);

    useImperativeHandle(
      ref,
      () => ({
        exportPng: (scale, transparent) => {
          const exportCanvas = document.createElement('canvas');
          const safeScale = Math.max(1, Math.min(scale, 4));
          exportCanvas.width = Math.round(size.width * safeScale);
          exportCanvas.height = Math.round(size.height * safeScale);

          const ctx = exportCanvas.getContext('2d');
          if (!ctx) {
            return null;
          }

          ctx.setTransform(safeScale, 0, 0, safeScale, 0, 0);
          renderSpiroRibbonFrame(
            ctx,
            { ...config, backgroundMode: transparent ? 'transparent' : config.backgroundMode },
            size.width,
            size.height,
            sampler,
            image,
            0
          );

          return exportCanvas.toDataURL('image/png');
        },
        exportSvg: (transparent) => {
          if (image) {
            return null;
          }

          return buildSpiroSvg(config, size.width, size.height, transparent);
        },
      }),
      [config, image, sampler, size.height, size.width]
    );

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) {
        return undefined;
      }

      let animationFrame = 0;
      const startedAt = performance.now();

      const draw = (now: number) => {
        const ctx = configureCanvas(canvas, size.width, size.height);
        if (!ctx) {
          return;
        }

        renderSpiroRibbonFrame(ctx, config, size.width, size.height, sampler, image, now - startedAt);

        statsRef.current.frames += 1;
        if (now - statsRef.current.lastReport > 300) {
          const elapsed = now - statsRef.current.lastReport;
          statsRef.current.lastFps = Math.round((statsRef.current.frames / elapsed) * 1000);
          statsRef.current.frames = 0;
          statsRef.current.lastReport = now;
          onFrameStats?.({
            fps: statsRef.current.lastFps,
            segments: Math.round(config.pointCount * Math.max(config.ribbonCount, 1)),
          });
        }

        if (config.playing) {
          animationFrame = requestAnimationFrame(draw);
        }
      };

      animationFrame = requestAnimationFrame(draw);

      return () => cancelAnimationFrame(animationFrame);
    }, [config, image, onFrameStats, sampler, size.height, size.width]);

    const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragActive(false);
      if (event.dataTransfer.files.length > 0) {
        onDropImage(event.dataTransfer.files);
      }
    };

    return (
      <div
        ref={containerRef}
        className={`canvasStage ${dragActive ? 'canvasStageDragging' : ''}`}
        onDragEnter={() => setDragActive(true)}
        onDragLeave={() => setDragActive(false)}
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        <canvas
          ref={canvasRef}
          aria-label="Live spiro ribbon preview"
          role="img"
          data-testid="spiro-ribbon-canvas"
          className="ribbonCanvas"
        />
        {!image && (
          <span className="dropHint">
            Drop an image to sample color through the ribbon
          </span>
        )}
      </div>
    );
  }
);
