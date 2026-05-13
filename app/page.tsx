'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import { LevaPanel, useControls, useCreateStore } from 'leva';
import { DEFAULT_PRESET_ID, HALO_ORANGE, PRESET_OPTIONS, SPIRO_PRESETS, getPresetById } from './presets';
import { SpiroRibbonCanvas } from './spiro-ribbon-canvas';
import type { FrameStats, SpiroRibbonCanvasHandle } from './spiro-ribbon-canvas';
import type {
  AnimationControlValues,
  ExportControlValues,
  ImageControlValues,
  RibbonControlValues,
  SpiroPreset,
  SpiroRibbonConfig,
  UploadedRasterImage,
} from './spiro-types';

type ControlTuple<T> = [T, (values: Partial<T>) => void, (path: keyof T) => unknown];
type LevaStore = ReturnType<typeof useCreateStore>;

type StudioStatus = {
  severity: 'success' | 'info' | 'warning' | 'error';
  message: string;
} | null;

const ACCEPTED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']);
const LARGE_FILE_BYTES = 8 * 1024 * 1024;
const DEFAULT_RIBBON_PRESET = getPresetById(DEFAULT_PRESET_ID);

const levaTheme = {
  colors: {
    elevation1: '#FFFFFF',
    elevation2: '#FAFAF7',
    elevation3: '#FFFFFF',
    accent1: HALO_ORANGE,
    accent2: HALO_ORANGE,
    accent3: '#FF8A3D',
    highlight1: '#D8D6CD',
    highlight2: '#868684',
    highlight3: '#191919',
    folderWidgetColor: '#868684',
    folderTextColor: '#191919',
    toolTipBackground: '#191919',
    toolTipText: '#FFFFFF',
  },
  radii: {
    xs: '2px',
    sm: '4px',
    lg: '8px',
  },
  sizes: {
    rootWidth: '100%',
    controlWidth: '154px',
  },
  fonts: {
    sans: 'Inter, ui-sans-serif, system-ui, sans-serif',
    mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  },
};

function downloadDataUrl(dataUrl: string, fileName: string): void {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = fileName;
  link.click();
}

function downloadTextFile(contents: string, fileName: string, type: string): void {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  downloadDataUrl(url, fileName);
  URL.revokeObjectURL(url);
}

async function copyText(text: string): Promise<void> {
  if (!navigator.clipboard) {
    throw new Error('Clipboard is unavailable in this browser.');
  }

  await navigator.clipboard.writeText(text);
}

function encodeSettings(settings: unknown): string {
  return window.btoa(JSON.stringify(settings));
}

function decodeSettings(encoded: string): unknown {
  return JSON.parse(window.atob(encoded));
}

function createImageFromFile(file: File): Promise<UploadedRasterImage> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      resolve({
        fileName: file.name,
        fileSize: file.size,
        url,
        element: image,
      });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Image could not be decoded.'));
    };
    image.src = url;
  });
}

function ControlPanel({ store }: { store: LevaStore }) {
  return (
    <aside className="controlPanel">
      <div className="panelHeader">
        <strong>Leva controls</strong>
        <span>Tweak the ribbon live, then export or share the settings.</span>
      </div>
      <div className="levaWrap">
        <LevaPanel
          store={store}
          fill
          flat
          oneLineLabels={false}
          hideCopyButton
          theme={levaTheme}
          titleBar={{ title: 'Spiro ribbon studio', drag: false, filter: false }}
        />
      </div>
    </aside>
  );
}

function PresetCard({
  preset,
  selected,
  onSelect,
}: {
  preset: SpiroPreset;
  selected: boolean;
  onSelect: (presetId: string) => void;
}) {
  const thumbnailStyle = {
    '--preset-color': preset.controls.strokeColor,
    '--preset-rotation': `${preset.controls.rotation}deg`,
    '--preset-scale': preset.controls.scale,
    '--preset-opacity': preset.controls.opacity,
  } as React.CSSProperties;

  return (
    <button
      type="button"
      className={`presetCard ${selected ? 'presetSelected' : ''}`}
      onClick={() => onSelect(preset.id)}
    >
      <span className="presetThumb" style={thumbnailStyle}>
        <span className={preset.controls.curveMode === 'lissajous' ? 'presetLoop lissajousLoop' : 'presetLoop'} />
        <span className="presetCenter" />
      </span>
      <strong>{preset.name}</strong>
      <span>{preset.description}</span>
    </button>
  );
}

export default function SpiroRibbonsStudioPage() {
  const store = useCreateStore();
  const canvasRef = useRef<SpiroRibbonCanvasHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const presetRef = useRef(DEFAULT_PRESET_ID);
  const [uploadedImage, setUploadedImage] = useState<UploadedRasterImage | null>(null);
  const [status, setStatus] = useState<StudioStatus>(null);
  const [frameStats, setFrameStats] = useState<FrameStats>({ fps: 0, segments: 0 });

  const [ribbonControls, setRibbonControls] = useControls(
    'Ribbon',
    () => ({
      preset: { value: DEFAULT_RIBBON_PRESET.id, options: PRESET_OPTIONS, label: 'Preset' },
      curveMode: {
        value: DEFAULT_RIBBON_PRESET.controls.curveMode,
        options: {
          Hypotrochoid: 'hypotrochoid',
          Epitrochoid: 'epitrochoid',
          Lissajous: 'lissajous',
        },
        label: 'Curve',
      },
      strokeColor: { value: DEFAULT_RIBBON_PRESET.controls.strokeColor, label: 'Stroke color' },
      strokeWidth: { value: DEFAULT_RIBBON_PRESET.controls.strokeWidth, min: 0.4, max: 6, step: 0.1, label: 'Stroke width' },
      opacity: { value: DEFAULT_RIBBON_PRESET.controls.opacity, min: 0.05, max: 1, step: 0.01, label: 'Opacity' },
      pointCount: { value: DEFAULT_RIBBON_PRESET.controls.pointCount, min: 400, max: 6000, step: 100, label: 'Line density' },
      ribbonCount: { value: DEFAULT_RIBBON_PRESET.controls.ribbonCount, min: 1, max: 10, step: 1, label: 'Ribbons' },
      outerRadius: { value: DEFAULT_RIBBON_PRESET.controls.outerRadius, min: 0.2, max: 2, step: 0.01, label: 'Outer radius' },
      innerRadius: { value: DEFAULT_RIBBON_PRESET.controls.innerRadius, min: 0.04, max: 1.4, step: 0.01, label: 'Inner radius' },
      penOffset: { value: DEFAULT_RIBBON_PRESET.controls.penOffset, min: 0.02, max: 1.4, step: 0.01, label: 'Offset' },
      symmetry: { value: DEFAULT_RIBBON_PRESET.controls.symmetry, min: 2, max: 48, step: 1, label: 'Symmetry' },
      lineDensity: { value: DEFAULT_RIBBON_PRESET.controls.lineDensity, min: 1, max: 18, step: 0.1, label: 'Loops' },
      rotation: { value: DEFAULT_RIBBON_PRESET.controls.rotation, min: -180, max: 180, step: 1, label: 'Rotation' },
      scale: { value: DEFAULT_RIBBON_PRESET.controls.scale, min: 0.2, max: 1.25, step: 0.01, label: 'Scale' },
      blendMode: {
        value: DEFAULT_RIBBON_PRESET.controls.blendMode,
        options: {
          Normal: 'source-over',
          Multiply: 'multiply',
          Screen: 'screen',
          Lighter: 'lighter',
        },
        label: 'Blend',
      },
    }),
    { collapsed: false },
    { store },
    []
  ) as unknown as ControlTuple<RibbonControlValues>;

  const [imageControls, setImageControls] = useControls(
    'Image',
    () => ({
      imageMode: {
        value: 'behind',
        options: {
          'Image behind ribbon': 'behind',
          'Sample image colors': 'sampled',
          'Clip image to ribbon': 'clipped',
        },
        label: 'Render mode',
      },
      colorMode: {
        value: 'halo-tonal',
        options: {
          Monochrome: 'monochrome',
          Source: 'source',
          'Source muted': 'source-muted',
          'Halo tonal': 'halo-tonal',
        },
        label: 'Line color',
      },
      fitMode: {
        value: 'cover',
        options: {
          Cover: 'cover',
          Contain: 'contain',
          Stretch: 'stretch',
        },
        label: 'Fit',
      },
      imageOpacity: { value: 0.72, min: 0, max: 1, step: 0.01, label: 'Image opacity' },
      backgroundMode: {
        value: 'white',
        options: {
          White: 'white',
          Transparent: 'transparent',
          Checkerboard: 'checker',
          Custom: 'custom',
        },
        label: 'Background',
      },
      backgroundColor: { value: '#FFFFFF', label: 'Custom bg' },
      threshold: { value: 0.08, min: 0, max: 1, step: 0.01, label: 'Threshold' },
      contrast: { value: 1, min: 0.25, max: 2.5, step: 0.05, label: 'Contrast' },
      soften: { value: 0, min: 0, max: 8, step: 0.25, label: 'Soften' },
    }),
    { collapsed: false },
    { store },
    []
  ) as unknown as ControlTuple<ImageControlValues>;

  const [animationControls, setAnimationControls] = useControls(
    'Animation',
    () => ({
      playing: { value: true, label: 'Play' },
      speed: { value: 1, min: 0.05, max: 4, step: 0.05, label: 'Speed' },
      direction: {
        value: 'forward',
        options: {
          Forward: 'forward',
          Reverse: 'reverse',
          Alternate: 'alternate',
        },
        label: 'Direction',
      },
      motion: {
        value: 'rotate',
        options: {
          Rotate: 'rotate',
          'Draw on': 'draw-on',
          Pulse: 'pulse',
          Orbit: 'orbit',
        },
        label: 'Motion',
      },
      phase: { value: 0, min: 0, max: 1, step: 0.01, label: 'Phase' },
      reveal: { value: 1, min: 0.02, max: 1, step: 0.01, label: 'Scrub' },
      pulse: { value: 0.2, min: 0, max: 1, step: 0.01, label: 'Pulse' },
    }),
    { collapsed: false },
    { store },
    []
  ) as unknown as ControlTuple<AnimationControlValues>;

  const [exportControls] = useControls(
    'Export',
    () => ({
      exportScale: { value: 2, min: 1, max: 4, step: 1, label: 'PNG scale' },
      transparentExport: { value: false, label: 'Transparent PNG' },
    }),
    { collapsed: false },
    { store },
    []
  ) as unknown as ControlTuple<ExportControlValues>;

  const config = useMemo<SpiroRibbonConfig>(
    () => ({
      ...ribbonControls,
      ...imageControls,
      ...animationControls,
    }),
    [animationControls, imageControls, ribbonControls]
  );

  const currentSettings = useMemo(
    () => ({
      ribbon: ribbonControls,
      image: imageControls,
      animation: animationControls,
      export: exportControls,
    }),
    [animationControls, exportControls, imageControls, ribbonControls]
  );

  const activePreset = useMemo(
    () => getPresetById(ribbonControls.preset),
    [ribbonControls.preset]
  );

  const applyPreset = useCallback(
    (presetId: string) => {
      const selectedPreset = getPresetById(presetId);
      presetRef.current = selectedPreset.id;
      setRibbonControls(selectedPreset.controls);
      setStatus({ severity: 'info', message: `${selectedPreset.name} preset applied.` });
    },
    [setRibbonControls]
  );

  useEffect(() => {
    if (ribbonControls.preset !== presetRef.current) {
      applyPreset(ribbonControls.preset);
    }
  }, [applyPreset, ribbonControls.preset]);

  useEffect(() => {
    const encodedSettings = new URLSearchParams(window.location.search).get('config');
    if (!encodedSettings) {
      return;
    }

    try {
      const decoded = decodeSettings(encodedSettings) as Partial<typeof currentSettings>;
      if (decoded.ribbon) {
        setRibbonControls(decoded.ribbon);
        presetRef.current = decoded.ribbon.preset ?? presetRef.current;
      }
      if (decoded.image) {
        setImageControls(decoded.image);
      }
      if (decoded.animation) {
        setAnimationControls(decoded.animation);
      }
      setStatus({ severity: 'success', message: 'Shared ribbon settings restored.' });
    } catch {
      setStatus({ severity: 'warning', message: 'The shared settings URL could not be read. Defaults loaded.' });
    }
  }, [setAnimationControls, setImageControls, setRibbonControls]);

  useEffect(() => () => {
    if (uploadedImage) {
      URL.revokeObjectURL(uploadedImage.url);
    }
  }, [uploadedImage]);

  const loadFiles = useCallback(async (files: FileList) => {
    const file = files.item(0);
    if (!file) {
      return;
    }

    if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
      setStatus({ severity: 'error', message: 'Use PNG, JPG, SVG, or WebP.' });
      return;
    }

    try {
      const nextImage = await createImageFromFile(file);
      setUploadedImage(nextImage);
      setStatus({
        severity: file.size > LARGE_FILE_BYTES ? 'warning' : 'success',
        message:
          file.size > LARGE_FILE_BYTES
            ? `${file.name} was loaded. Large images are sampled down for preview performance.`
            : `${file.name} loaded.`,
      });
    } catch {
      setStatus({ severity: 'error', message: 'The image could not be loaded.' });
    }
  }, []);

  const clearImage = () => {
    setUploadedImage(null);
    setStatus({ severity: 'info', message: 'Image removed. Ribbon settings were preserved.' });
  };

  const handleExportPng = () => {
    const dataUrl = canvasRef.current?.exportPng(exportControls.exportScale, exportControls.transparentExport);
    if (!dataUrl) {
      setStatus({ severity: 'error', message: 'PNG export failed.' });
      return;
    }

    downloadDataUrl(dataUrl, `halo-spiro-${activePreset.id}.png`);
    setStatus({ severity: 'success', message: 'PNG exported.' });
  };

  const handleExportSvg = () => {
    const svg = canvasRef.current?.exportSvg(exportControls.transparentExport);
    if (!svg) {
      setStatus({ severity: 'warning', message: 'SVG export is available when no uploaded image is active.' });
      return;
    }

    downloadTextFile(svg, `halo-spiro-${activePreset.id}.svg`, 'image/svg+xml');
    setStatus({ severity: 'success', message: 'SVG exported.' });
  };

  const handleCopySettings = async () => {
    try {
      await copyText(JSON.stringify(currentSettings, null, 2));
      setStatus({ severity: 'success', message: 'Settings JSON copied.' });
    } catch {
      setStatus({ severity: 'error', message: 'Settings could not be copied.' });
    }
  };

  const handleCopyShareUrl = async () => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('config', encodeSettings(currentSettings));
      await copyText(url.toString());
      setStatus({ severity: 'success', message: 'Share URL copied. Uploaded image data is not included.' });
    } catch {
      setStatus({ severity: 'error', message: 'Share URL could not be copied.' });
    }
  };

  const togglePlaying = () => {
    setAnimationControls({ playing: !animationControls.playing });
  };

  const resetStudio = () => {
    applyPreset(DEFAULT_PRESET_ID);
    setImageControls({
      imageMode: 'behind',
      colorMode: 'halo-tonal',
      fitMode: 'cover',
      imageOpacity: 0.72,
      backgroundMode: 'white',
      backgroundColor: '#FFFFFF',
      threshold: 0.08,
      contrast: 1,
      soften: 0,
    });
    setAnimationControls({
      playing: true,
      speed: 1,
      direction: 'forward',
      motion: 'rotate',
      phase: 0,
      reveal: 1,
      pulse: 0.2,
    });
    setStatus({ severity: 'info', message: 'Studio reset to the default Halo ribbon.' });
  };

  return (
    <main className="studioShell">
      <header className="topBar">
        <div>
          <span className="eyebrow">Studio</span>
          <div className="titleRow">
            <h1>Spiro ribbons</h1>
            <span className="pill">{activePreset.name}</span>
            <span className="pill">{frameStats.segments.toLocaleString()} segments</span>
            {frameStats.fps > 0 && <span className="pill">{frameStats.fps} fps</span>}
          </div>
        </div>
        <div className="topActions">
          <button type="button" className="iconButton" onClick={togglePlaying} aria-label={animationControls.playing ? 'Pause animation' : 'Play animation'}>
            {animationControls.playing ? 'Pause' : 'Play'}
          </button>
          <button type="button" className="secondaryButton" onClick={resetStudio}>Reset</button>
          <button type="button" className="primaryButton" onClick={handleExportPng}>PNG</button>
        </div>
      </header>

      {status && (
        <div className={`status ${status.severity}`}>
          <span>{status.message}</span>
          <button type="button" onClick={() => setStatus(null)} aria-label="Dismiss status">Dismiss</button>
        </div>
      )}

      <section className="workspace">
        <ControlPanel store={store} />

        <div className="previewColumn">
          <div className="assetBar">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              hidden
              onChange={(event) => {
                if (event.target.files) {
                  void loadFiles(event.target.files);
                }
                event.currentTarget.value = '';
              }}
            />
            <button type="button" className="secondaryButton" onClick={() => fileInputRef.current?.click()}>
              {uploadedImage ? 'Replace image' : 'Upload image'}
            </button>
            {uploadedImage ? (
              <>
                <span className="filePill">{uploadedImage.fileName}</span>
                <button type="button" className="textButton" onClick={clearImage}>Remove</button>
              </>
            ) : (
              <span className="muted">Drop an image on the canvas or start from the ribbon alone.</span>
            )}
            <span className="assetSpacer" />
            <button type="button" className="textButton" onClick={handleExportSvg} disabled={Boolean(uploadedImage)}>SVG</button>
            <button type="button" className="textButton" onClick={() => void handleCopySettings()}>Copy JSON</button>
            <button type="button" className="textButton" onClick={() => void handleCopyShareUrl()}>Share</button>
          </div>

          <SpiroRibbonCanvas
            ref={canvasRef}
            config={config}
            image={uploadedImage}
            onDropImage={(files) => void loadFiles(files)}
            onFrameStats={setFrameStats}
          />

          <div className="presetStrip">
            {SPIRO_PRESETS.map((preset) => (
              <PresetCard
                key={preset.id}
                preset={preset}
                selected={preset.id === ribbonControls.preset}
                onSelect={applyPreset}
              />
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
