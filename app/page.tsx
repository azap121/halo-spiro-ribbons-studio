'use client';

import { Component, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ErrorInfo, ReactNode, SyntheticEvent } from 'react';
import Box from '@mui/material/Box';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCloudArrowUp,
  faCopy,
  faDownload,
  faImage,
  faLink,
  faMicrophone,
  faPause,
  faPlay,
  faRotateRight,
  faSliders,
  faSparkles,
  faTrashCan,
} from '@fortawesome/pro-light-svg-icons';
import { LevaPanel, folder, useControls, useCreateStore } from 'leva';
import { HALO_ORANGE, PRESET_OPTIONS, SPIRO_PRESETS, getPresetById } from './presets';
import { SpiroParticle3D } from './spiro-particle-3d';
import type { SpiroParticle3DHandle, SpiroParticleControls, SpiroParticleFrameStats } from './spiro-particle-3d';
import { SpiroRibbonCanvas } from './spiro-ribbon-canvas';
import type { FrameStats, SpiroRibbonCanvasHandle } from './spiro-ribbon-canvas';
import { DEFAULT_WEBGL_PRESET_ID, WEBGL_PRESET_OPTIONS, getWebglPresetById } from './spiro-webgl-presets';
import type {
  AnimationControlValues,
  ExportControlValues,
  ImageControlValues,
  RenderControlValues,
  RibbonControlValues,
  SpiroRenderMode,
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

type AudioBands = {
  level: number;
  bass: number;
  mid: number;
  treble: number;
};

type AudioContextConstructor = typeof AudioContext;

type SharedStudioSettings = Partial<{
  schemaVersion: number;
  renderer: SpiroRenderMode;
  ribbon: Partial<RibbonControlValues>;
  image: Partial<ImageControlValues>;
  animation: Partial<AnimationControlValues>;
  render: Partial<RenderControlValues> & { renderMode?: SpiroRenderMode };
  export: Partial<ExportControlValues>;
}>;

interface WebglErrorBoundaryProps {
  children: ReactNode;
  fallback: ReactNode;
  resetKey: number;
  onError: (error: Error) => void;
}

interface WebglErrorBoundaryState {
  hasError: boolean;
}

const ACCEPTED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']);
const LARGE_FILE_BYTES = 8 * 1024 * 1024;
const SETTINGS_SCHEMA_VERSION = 7;
const DEFAULT_WEBGL_RIBBON_PRESET_ID = 'ring-lace';
const DEFAULT_RIBBON_PRESET = getPresetById(DEFAULT_WEBGL_RIBBON_PRESET_ID);
const DEFAULT_WEBGL_PRESET = getWebglPresetById(DEFAULT_WEBGL_PRESET_ID);
const EMPTY_AUDIO_BANDS: AudioBands = { level: 0, bass: 0, mid: 0, treble: 0 };
const AUDIO_NOISE_FLOOR = 0.025;
const AUDIO_ATTACK = 0.18;
const AUDIO_RELEASE = 0.055;
const AUDIO_UPDATE_INTERVAL_MS = 66;
const WEBGL_FORCE_RECOVERY_MS = 2800;

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
    sans: 'var(--font-sans, Figtree, system-ui, sans-serif)',
    mono: 'var(--font-mono, "IBM Plex Mono", ui-monospace, monospace)',
  },
};

class WebglErrorBoundary extends Component<WebglErrorBoundaryProps, WebglErrorBoundaryState> {
  state: WebglErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): WebglErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, _errorInfo: ErrorInfo): void {
    this.props.onError(error);
  }

  componentDidUpdate(previousProps: WebglErrorBoundaryProps): void {
    if (previousProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }

    return this.props.children;
  }
}

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

function clamp01(value: number): number {
  return Math.max(0, Math.min(value, 1));
}

function gateAudioSignal(value: number): number {
  return clamp01((value - AUDIO_NOISE_FLOOR) / (1 - AUDIO_NOISE_FLOOR));
}

function smoothAudioBand(current: number, target: number): number {
  const coefficient = target > current ? AUDIO_ATTACK : AUDIO_RELEASE;

  return current + (target - current) * coefficient;
}

function smoothAudioBands(current: AudioBands, target: AudioBands): AudioBands {
  return {
    level: smoothAudioBand(current.level, target.level),
    bass: smoothAudioBand(current.bass, target.bass),
    mid: smoothAudioBand(current.mid, target.mid),
    treble: smoothAudioBand(current.treble, target.treble),
  };
}

function getImageShapePresetAdjustments(preset: RenderControlValues['imageShapePreset']) {
  if (preset === 'cloud') {
    return { softness: 0.34, preserveSpiro: 0.44, shapeStrength: 0.82, depthScale: 1.18 };
  }

  if (preset === 'tree') {
    return { softness: 0.18, preserveSpiro: 0.34, shapeStrength: 0.94, depthScale: 0.86 };
  }

  if (preset === 'petals') {
    return { softness: 0.14, preserveSpiro: 0.28, shapeStrength: 0.98, depthScale: 0.72 };
  }

  if (preset === 'globe') {
    return { softness: 0.22, preserveSpiro: 0.18, shapeStrength: 0.9, depthScale: 1.08 };
  }

  if (preset === 'planet') {
    return { softness: 0.16, preserveSpiro: 0.12, shapeStrength: 0.96, depthScale: 1.24 };
  }

  if (preset === 'glass-sphere') {
    return { softness: 0.32, preserveSpiro: 0.08, shapeStrength: 0.98, depthScale: 1.32 };
  }

  return { softness: 0, preserveSpiro: 1, shapeStrength: 0.92, depthScale: 1 };
}

function getProjectionLabel(projectionMode: RenderControlValues['projectionMode']): string {
  if (projectionMode === 'hologram-shell') {
    return 'Hologram shell';
  }

  if (projectionMode === 'sphere') {
    return 'Sphere';
  }

  if (projectionMode === 'dome') {
    return 'Dome';
  }

  return 'Flat projection';
}

function averageFrequencyBand(data: Uint8Array, startRatio: number, endRatio: number): number {
  const start = Math.max(0, Math.floor(data.length * startRatio));
  const end = Math.max(start + 1, Math.min(data.length, Math.floor(data.length * endRatio)));
  let total = 0;

  for (let index = start; index < end; index += 1) {
    total += data[index];
  }

  return total / (end - start) / 255;
}

function getAudioContextConstructor(): AudioContextConstructor | null {
  const maybeWindow = window as Window & { webkitAudioContext?: AudioContextConstructor };

  return window.AudioContext ?? maybeWindow.webkitAudioContext ?? null;
}

function isSpiroRenderMode(value: unknown): value is SpiroRenderMode {
  return value === 'flat' || value === 'dimensional';
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

function LevaPanelBlock({ store, title }: { store: LevaStore; title: string }) {
  return (
    <Box sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
      <LevaPanel
        store={store}
        fill
        flat
        oneLineLabels={false}
        hideCopyButton
        theme={levaTheme}
        titleBar={{ title, drag: false, filter: false }}
      />
    </Box>
  );
}

function ControlPanel({
  rendererMode,
  shapeStore,
  flatStore,
  webglStore,
}: {
  rendererMode: SpiroRenderMode;
  shapeStore: LevaStore;
  flatStore: LevaStore;
  webglStore: LevaStore;
}) {
  const modeTitle = rendererMode === 'dimensional' ? 'WebGL controls' : 'Flat controls';

  return (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.paper',
      }}
    >
      <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Stack direction="row" gap={1} alignItems="center">
          <FontAwesomeIcon icon={faSliders} style={{ width: 16, height: 16 }} />
          <Typography variant="subtitle2">Leva controls</Typography>
        </Stack>
        <Typography variant="caption" color="text.secondary">
          {rendererMode === 'dimensional'
            ? 'Shape controls plus particle, camera, and WebGL image controls.'
            : 'Shape controls plus flat image, animation, and export controls.'}
        </Typography>
      </Box>
      <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        <LevaPanelBlock store={shapeStore} title="Shared shape" />
        <LevaPanelBlock store={rendererMode === 'dimensional' ? webglStore : flatStore} title={modeTitle} />
      </Box>
    </Box>
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
  return (
    <Box
      component="button"
      type="button"
      onClick={() => onSelect(preset.id)}
      data-testid={`spiro-preset-${preset.id}`}
      sx={{
        width: 160,
        flexShrink: 0,
        textAlign: 'left',
        border: '1px solid',
        borderColor: selected ? 'primary.main' : 'divider',
        borderRadius: 1,
        bgcolor: selected ? 'action.selected' : 'background.paper',
        color: 'text.primary',
        p: 1,
        cursor: 'pointer',
        transition: 'border-color 150ms ease, background-color 150ms ease',
        '&:hover': {
          borderColor: 'primary.main',
          bgcolor: 'action.hover',
        },
      }}
    >
      <Box
        sx={{
          height: 66,
          mb: 1,
          borderRadius: 0.75,
          bgcolor: 'background.default',
          border: '1px solid',
          borderColor: 'divider',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            position: 'absolute',
            inset: 10,
            border: '1px solid',
            borderColor: preset.controls.strokeColor,
            borderRadius: preset.controls.curveMode === 'lissajous' ? '45% 55% 42% 58%' : '50%',
            opacity: preset.controls.opacity,
            transform: `rotate(${preset.controls.rotation}deg) scale(${preset.controls.scale})`,
            boxShadow: `0 0 0 3px ${preset.controls.strokeColor}22, 0 0 0 8px ${preset.controls.strokeColor}11`,
          }}
        />
        <Box
          sx={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: `${Math.max(18, 68 / Math.max(preset.controls.symmetry / 2, 1))}%`,
            height: `${Math.max(18, 68 / Math.max(preset.controls.symmetry / 2, 1))}%`,
            borderRadius: '50%',
            border: '1px solid',
            borderColor: preset.controls.strokeColor,
            transform: 'translate(-50%, -50%)',
            opacity: 0.7,
          }}
        />
      </Box>
      <Typography variant="caption" sx={{ display: 'block', fontWeight: 600 }}>
        {preset.name}
      </Typography>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{
          display: 'block',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {preset.description}
      </Typography>
    </Box>
  );
}

function WebglFallbackPanel({
  message,
  onRetry,
  onSwitchFlat,
}: {
  message: string;
  onRetry: () => void;
  onSwitchFlat: () => void;
}) {
  return (
    <Box
      sx={{
        height: '100%',
        minHeight: 420,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        px: 3,
        bgcolor: 'background.default',
      }}
    >
      <Stack
        gap={1.5}
        alignItems="center"
        sx={{
          maxWidth: 440,
          textAlign: 'center',
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1,
          bgcolor: 'background.paper',
          p: 3,
        }}
      >
        <Typography variant="subtitle1">WebGL renderer paused</Typography>
        <Typography variant="body2" color="text.secondary">
          {message}
        </Typography>
        <Stack direction="row" gap={1} sx={{ flexWrap: 'wrap', justifyContent: 'center' }}>
          <Button variant="contained" size="small" disableElevation onClick={onRetry}>
            Retry WebGL
          </Button>
          <Button variant="outlined" size="small" onClick={onSwitchFlat}>
            Open Flat
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}

export default function SpiroRibbonsStudioPage() {
  const shapeStore = useCreateStore();
  const flatStore = useCreateStore();
  const webglStore = useCreateStore();
  const isMobile = useMediaQuery('(max-width:899px)');
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const canvasRef = useRef<SpiroRibbonCanvasHandle>(null);
  const particleRef = useRef<SpiroParticle3DHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const presetRef = useRef(DEFAULT_WEBGL_RIBBON_PRESET_ID);
  const webglPresetRef = useRef(DEFAULT_WEBGL_PRESET_ID);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioFrameRef = useRef<number | null>(null);
  const audioLastUpdateRef = useRef(0);
  const audioSmoothedBandsRef = useRef<AudioBands>(EMPTY_AUDIO_BANDS);
  const [mobileControlsOpen, setMobileControlsOpen] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<UploadedRasterImage | null>(null);
  const [status, setStatus] = useState<StudioStatus>(null);
  const [frameStats, setFrameStats] = useState<FrameStats>({ fps: 0, segments: 0 });
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [audioBands, setAudioBands] = useState<AudioBands>(EMPTY_AUDIO_BANDS);
  const [actionPulse, setActionPulse] = useState(0);
  const [rendererMode, setRendererMode] = useState<SpiroRenderMode>('dimensional');
  const [webglError, setWebglError] = useState<string | null>(null);
  const [webglResetKey, setWebglResetKey] = useState(0);
  const rendererModeRef = useRef<SpiroRenderMode>('dimensional');
  const webglResetKeyRef = useRef(0);
  const webglRecoveryAttemptsRef = useRef(0);
  const webglRecoveryTimerRef = useRef<number | null>(null);

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
    { store: shapeStore },
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
    { store: flatStore },
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
    { store: flatStore },
    []
  ) as unknown as ControlTuple<AnimationControlValues>;

  const [renderControls, setRenderControls] = useControls(
    'WebGL particles',
    () => ({
      webglPreset: {
        value: DEFAULT_WEBGL_PRESET_ID,
        options: WEBGL_PRESET_OPTIONS,
        label: 'Preset',
      },
      look: {
        value: DEFAULT_WEBGL_PRESET.render.look ?? 'data-ring',
        options: {
          'Spiro grain': 'spiro-grain',
          'Data ring': 'data-ring',
        },
        label: 'Look',
      },
      projectionMode: {
        value: DEFAULT_WEBGL_PRESET.render.projectionMode ?? 'dome',
        options: {
          'Flat plane': 'flat',
          Dome: 'dome',
          Sphere: 'sphere',
          'Hologram shell': 'hologram-shell',
        },
        label: 'Projection',
      },
      projectionBlend: {
        value: DEFAULT_WEBGL_PRESET.render.projectionBlend ?? 1,
        min: 0,
        max: 1,
        step: 0.01,
        label: 'Projection mix',
      },
      sphereRadius: {
        value: DEFAULT_WEBGL_PRESET.render.sphereRadius ?? 0.92,
        min: 0.35,
        max: 1.5,
        step: 0.01,
        label: 'Sphere radius',
      },
      shellThickness: {
        value: DEFAULT_WEBGL_PRESET.render.shellThickness ?? 0.08,
        min: 0,
        max: 0.45,
        step: 0.01,
        label: 'Shell thickness',
      },
      palette: {
        value: DEFAULT_WEBGL_PRESET.render.palette ?? 'blue-gray',
        options: {
          'Blue gray': 'blue-gray',
          Cyan: 'cyan',
          Halo: 'halo',
        },
        label: 'Palette',
      },
      order: { value: DEFAULT_WEBGL_PRESET.render.order ?? 0.86, min: 0, max: 1, step: 0.01, label: 'Order' },
      voidRadius: { value: DEFAULT_WEBGL_PRESET.render.voidRadius ?? 0.24, min: 0, max: 0.55, step: 0.01, label: 'Void' },
      ringThickness: {
        value: DEFAULT_WEBGL_PRESET.render.ringThickness ?? 0.6,
        min: 0.08,
        max: 0.95,
        step: 0.01,
        label: 'Ring thickness',
      },
      traceStrength: {
        value: DEFAULT_WEBGL_PRESET.render.traceStrength ?? 0.16,
        min: 0,
        max: 1,
        step: 0.01,
        label: 'Trace',
      },
      seed: { value: 121, min: 1, max: 9999, step: 1, label: 'Seed' },
      fitMode: {
        value: 'cover',
        options: {
          Cover: 'cover',
          Contain: 'contain',
          Stretch: 'stretch',
        },
        label: 'Image fit',
      },
      backgroundMode: {
        value: 'white',
        options: {
          White: 'white',
          Transparent: 'transparent',
          Custom: 'custom',
        },
        label: 'Background',
      },
      backgroundColor: { value: '#FFFFFF', label: 'Custom bg' },
      particleCount: { value: DEFAULT_WEBGL_PRESET.render.particleCount ?? 42000, min: 800, max: 60000, step: 500, label: 'Particles' },
      particleSize: { value: DEFAULT_WEBGL_PRESET.render.particleSize ?? 0.9, min: 0.4, max: 8, step: 0.05, label: 'Size' },
      particleSoftness: { value: DEFAULT_WEBGL_PRESET.render.particleSoftness ?? 0.09, min: 0.02, max: 0.45, step: 0.01, label: 'Softness' },
      particleOpacity: { value: DEFAULT_WEBGL_PRESET.render.particleOpacity ?? 0.44, min: 0.05, max: 1, step: 0.01, label: 'Opacity' },
      'Image mapping': folder(
        {
          imageRole: {
            value: DEFAULT_WEBGL_PRESET.render.imageRole ?? 'shape-color',
            options: {
              'Shape + color': 'shape-color',
              'Shape only': 'shape-only',
              'Color only': 'color-only',
              'Depth only': 'depth-only',
            },
            label: 'Image role',
          },
          imageMaskSource: {
            value: DEFAULT_WEBGL_PRESET.render.imageMaskSource ?? 'alpha-luminance',
            options: {
              Alpha: 'alpha',
              Luminance: 'luminance',
              'Alpha/luma': 'alpha-luminance',
              'Invert luma': 'inverted-luminance',
              'Glass/background': 'glass',
            },
            label: 'Mask source',
          },
          imageShapePreset: {
            value: DEFAULT_WEBGL_PRESET.render.imageShapePreset ?? 'auto',
            options: {
              Auto: 'auto',
              Cloud: 'cloud',
              Tree: 'tree',
              Petals: 'petals',
              Globe: 'globe',
              Planet: 'planet',
              'Glass sphere': 'glass-sphere',
            },
            label: 'Shape hint',
          },
        },
        { collapsed: false }
      ),
      'Hologram look': folder(
        {
          hologramIntensity: {
            value: DEFAULT_WEBGL_PRESET.render.hologramIntensity ?? 0.26,
            min: 0,
            max: 1,
            step: 0.01,
            label: 'Intensity',
          },
          hologramGlow: {
            value: DEFAULT_WEBGL_PRESET.render.hologramGlow ?? 0.24,
            min: 0,
            max: 1,
            step: 0.01,
            label: 'Glow',
          },
          hologramScanlineDensity: {
            value: DEFAULT_WEBGL_PRESET.render.hologramScanlineDensity ?? 18,
            min: 0,
            max: 48,
            step: 1,
            label: 'Scanlines',
          },
          hologramScanlineSpeed: {
            value: DEFAULT_WEBGL_PRESET.render.hologramScanlineSpeed ?? 0.12,
            min: -1,
            max: 1,
            step: 0.01,
            label: 'Scan speed',
          },
          hologramShimmer: {
            value: DEFAULT_WEBGL_PRESET.render.hologramShimmer ?? 0.2,
            min: 0,
            max: 1,
            step: 0.01,
            label: 'Shimmer',
          },
          hologramNoise: {
            value: DEFAULT_WEBGL_PRESET.render.hologramNoise ?? 0.16,
            min: 0,
            max: 1,
            step: 0.01,
            label: 'Noise',
          },
          hologramEdgeFalloff: {
            value: DEFAULT_WEBGL_PRESET.render.hologramEdgeFalloff ?? 0.5,
            min: 0,
            max: 1,
            step: 0.01,
            label: 'Edge falloff',
          },
          hologramChromaticSplit: {
            value: DEFAULT_WEBGL_PRESET.render.hologramChromaticSplit ?? 0.08,
            min: 0,
            max: 1,
            step: 0.01,
            label: 'Color split',
          },
          hologramColorway: {
            value: DEFAULT_WEBGL_PRESET.render.hologramColorway ?? 'blue-gray',
            options: {
              'Blue gray': 'blue-gray',
              Cyan: 'cyan',
              Halo: 'halo',
            },
            label: 'Colorway',
          },
        },
        { collapsed: false }
      ),
      dimensionality: { value: DEFAULT_WEBGL_PRESET.render.dimensionality ?? 1, min: 0, max: 1.8, step: 0.01, label: 'Dimensionality' },
      domeDepth: { value: DEFAULT_WEBGL_PRESET.render.domeDepth ?? 0.76, min: -1.5, max: 1.5, step: 0.01, label: 'Dome depth' },
      twistDepth: { value: DEFAULT_WEBGL_PRESET.render.twistDepth ?? 0.2, min: -1.2, max: 1.2, step: 0.01, label: 'Twist depth' },
      twistFrequency: { value: DEFAULT_WEBGL_PRESET.render.twistFrequency ?? 5.2, min: 0, max: 18, step: 0.25, label: 'Twist frequency' },
      imageDepth: { value: 0.34, min: -1.5, max: 1.5, step: 0.01, label: 'Image depth' },
      shapeThreshold: { value: 0.05, min: 0, max: 0.9, step: 0.01, label: 'Shape threshold' },
      shapeSoftness: { value: 0.2, min: 0.01, max: 0.8, step: 0.01, label: 'Shape softness' },
      preserveSpiro: { value: DEFAULT_WEBGL_PRESET.render.preserveSpiro ?? 0.8, min: 0, max: 1, step: 0.01, label: 'Preserve spiro' },
      swirl: { value: DEFAULT_WEBGL_PRESET.render.swirl ?? 0.14, min: 0, max: 2, step: 0.01, label: 'Swirl' },
      turbulence: { value: DEFAULT_WEBGL_PRESET.render.turbulence ?? 0.08, min: 0, max: 2, step: 0.01, label: 'Turbulence' },
      audioSensitivity: { value: 1, min: 0, max: 3, step: 0.05, label: 'Mic gain' },
      actionStrength: { value: 0.82, min: 0, max: 2, step: 0.05, label: 'Action strength' },
      autoRotate: { value: true, label: 'Auto rotate' },
      rotationX: { value: DEFAULT_WEBGL_PRESET.render.rotationX ?? 58, min: -180, max: 180, step: 1, label: 'Rotate X' },
      rotationY: { value: DEFAULT_WEBGL_PRESET.render.rotationY ?? -6, min: -180, max: 180, step: 1, label: 'Rotate Y' },
      rotationZ: { value: DEFAULT_WEBGL_PRESET.render.rotationZ ?? -10, min: -180, max: 180, step: 1, label: 'Rotate Z' },
      cameraMode: {
        value: 'perspective',
        options: {
          Perspective: 'perspective',
          Orthographic: 'orthographic',
        },
        label: 'Camera',
      },
      cameraDistance: { value: DEFAULT_WEBGL_PRESET.render.cameraDistance ?? 7.8, min: 2.8, max: 12, step: 0.1, label: 'Distance' },
      cameraFov: { value: DEFAULT_WEBGL_PRESET.render.cameraFov ?? 36, min: 18, max: 80, step: 1, label: 'FOV' },
      toneMapping: {
        value: 'none',
        options: {
          'No tone mapping': 'none',
          'ACES Filmic': 'aces',
        },
        label: 'Tone mapping',
      },
    }),
    { collapsed: false },
    { store: webglStore },
    []
  ) as unknown as ControlTuple<RenderControlValues>;

  const [exportControls] = useControls(
    'Export',
    () => ({
      exportScale: { value: 2, min: 1, max: 4, step: 1, label: 'PNG scale' },
      transparentExport: { value: false, label: 'Transparent PNG' },
    }),
    { collapsed: false },
    { store: flatStore },
    []
  ) as unknown as ControlTuple<ExportControlValues>;

  const config = useMemo<SpiroRibbonConfig>(
    () => ({
      ...ribbonControls,
      ...imageControls,
      ...animationControls,
      playing: reducedMotion ? false : animationControls.playing,
    }),
    [animationControls, imageControls, reducedMotion, ribbonControls]
  );

  const particleConfig = useMemo<SpiroRibbonConfig>(
    () => ({
      ...config,
      fitMode: renderControls.fitMode,
      backgroundMode: renderControls.backgroundMode,
      backgroundColor: renderControls.backgroundColor,
    }),
    [config, renderControls.backgroundColor, renderControls.backgroundMode, renderControls.fitMode]
  );

  const clearWebglRecoveryTimer = useCallback(() => {
    if (webglRecoveryTimerRef.current === null) {
      return;
    }

    window.clearTimeout(webglRecoveryTimerRef.current);
    webglRecoveryTimerRef.current = null;
  }, []);

  const setRendererModeValue = useCallback((nextMode: SpiroRenderMode) => {
    rendererModeRef.current = nextMode;
    setRendererMode(nextMode);
  }, []);

  const bumpWebglResetKey = useCallback(() => {
    clearWebglRecoveryTimer();
    webglResetKeyRef.current += 1;
    setWebglResetKey(webglResetKeyRef.current);
  }, [clearWebglRecoveryTimer]);

  const stopAudio = useCallback(() => {
    if (audioFrameRef.current !== null) {
      window.cancelAnimationFrame(audioFrameRef.current);
      audioFrameRef.current = null;
    }

    audioSourceRef.current?.disconnect();
    audioSourceRef.current = null;
    audioStreamRef.current?.getTracks().forEach((track) => track.stop());
    audioStreamRef.current = null;
    void audioContextRef.current?.close();
    audioContextRef.current = null;
    audioSmoothedBandsRef.current = EMPTY_AUDIO_BANDS;
    setAudioEnabled(false);
    setAudioBands(EMPTY_AUDIO_BANDS);
  }, []);

  const recoverWebglRenderer = useCallback(
    (message: string, sourceResetKey: number) => {
      if (rendererModeRef.current !== 'dimensional' || sourceResetKey !== webglResetKeyRef.current) {
        return;
      }

      clearWebglRecoveryTimer();

      if (webglRecoveryAttemptsRef.current >= 2) {
        stopAudio();
        setWebglError(message);
        setStatus({ severity: 'warning', message: 'WebGL renderer paused. Flat mode is still available.' });
        return;
      }

      webglRecoveryAttemptsRef.current += 1;
      setWebglError(null);
      setStatus({ severity: 'info', message: 'WebGL context recovering. Waiting for the browser to restore it.' });

      webglRecoveryTimerRef.current = window.setTimeout(() => {
        webglRecoveryTimerRef.current = null;

        if (rendererModeRef.current !== 'dimensional' || sourceResetKey !== webglResetKeyRef.current) {
          return;
        }

        bumpWebglResetKey();
      }, WEBGL_FORCE_RECOVERY_MS);
    },
    [bumpWebglResetKey, clearWebglRecoveryTimer, stopAudio]
  );

  const handleWebglFrameStats = useCallback((stats: SpiroParticleFrameStats) => {
    if (stats.fps > 0 && stats.segments > 0) {
      webglRecoveryAttemptsRef.current = 0;
    }

    setFrameStats(stats);
  }, []);

  useEffect(
    () => () => {
      clearWebglRecoveryTimer();
    },
    [clearWebglRecoveryTimer]
  );

  const handleRetryWebgl = useCallback(() => {
    webglRecoveryAttemptsRef.current = 0;
    setWebglError(null);
    setRendererModeValue('dimensional');
    setFrameStats({ fps: 0, segments: 0 });
    bumpWebglResetKey();
    setStatus({ severity: 'info', message: 'WebGL renderer restarted.' });
  }, [bumpWebglResetKey, setRendererModeValue]);

  const handleSwitchToFlat = useCallback(() => {
    stopAudio();
    setActionPulse(0);
    setWebglError(null);
    setRendererModeValue('flat');
    bumpWebglResetKey();
    setFrameStats({ fps: 0, segments: 0 });
    setStatus({ severity: 'info', message: 'Flat canvas renderer opened.' });
  }, [bumpWebglResetKey, setRendererModeValue, stopAudio]);

  const handleRendererModeChange = useCallback(
    (_event: SyntheticEvent, nextMode: SpiroRenderMode) => {
      if (!isSpiroRenderMode(nextMode) || nextMode === rendererMode) {
        return;
      }

      setRendererModeValue(nextMode);
      setFrameStats({ fps: 0, segments: 0 });

      if (nextMode === 'flat') {
        stopAudio();
        setActionPulse(0);
        bumpWebglResetKey();
        setStatus({ severity: 'info', message: 'Flat canvas renderer opened.' });
        return;
      }

      webglRecoveryAttemptsRef.current = 0;
      setWebglError(null);
      bumpWebglResetKey();
      setStatus({ severity: 'info', message: 'WebGL particle renderer opened.' });
    },
    [bumpWebglResetKey, rendererMode, setRendererModeValue, stopAudio]
  );

  const handleToggleAudio = useCallback(async () => {
    if (audioEnabled) {
      stopAudio();
      setStatus({ severity: 'info', message: 'Microphone reactivity stopped.' });
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus({ severity: 'error', message: 'Microphone input is unavailable in this browser.' });
      return;
    }

    const AudioContextCtor = getAudioContextConstructor();
    if (!AudioContextCtor) {
      setStatus({ severity: 'error', message: 'AudioContext is unavailable in this browser.' });
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioContext = new AudioContextCtor();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();

      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.82;
      const frequencyData = new Uint8Array(analyser.frequencyBinCount);
      source.connect(analyser);
      await audioContext.resume();

      audioContextRef.current = audioContext;
      audioSourceRef.current = source;
      audioStreamRef.current = stream;
      audioLastUpdateRef.current = 0;
      audioSmoothedBandsRef.current = EMPTY_AUDIO_BANDS;
      setAudioEnabled(true);
      setStatus({ severity: 'success', message: 'Microphone reactivity is driving the particle field.' });

      const tick: FrameRequestCallback = (time) => {
        analyser.getByteFrequencyData(frequencyData);

        if (time - audioLastUpdateRef.current > AUDIO_UPDATE_INTERVAL_MS) {
          const bass = gateAudioSignal(averageFrequencyBand(frequencyData, 0.01, 0.12));
          const mid = gateAudioSignal(averageFrequencyBand(frequencyData, 0.12, 0.46));
          const treble = gateAudioSignal(averageFrequencyBand(frequencyData, 0.46, 0.92));
          const targetBands = {
            level: clamp01(bass * 0.5 + mid * 0.32 + treble * 0.18),
            bass,
            mid,
            treble,
          };
          const smoothedBands = smoothAudioBands(audioSmoothedBandsRef.current, targetBands);

          audioSmoothedBandsRef.current = smoothedBands;
          setAudioBands(smoothedBands);
          audioLastUpdateRef.current = time;
        }

        audioFrameRef.current = window.requestAnimationFrame(tick);
      };

      audioFrameRef.current = window.requestAnimationFrame(tick);
    } catch {
      stopAudio();
      setStatus({ severity: 'warning', message: 'Microphone permission was not granted.' });
    }
  }, [audioEnabled, stopAudio]);

  useEffect(() => stopAudio, [stopAudio]);

  useEffect(() => {
    if (actionPulse <= 0) {
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      setActionPulse((currentPulse) => Math.max(0, currentPulse - 0.08));
    }, 32);

    return () => window.clearTimeout(timeout);
  }, [actionPulse]);

  useEffect(() => {
    if (process.env.NODE_ENV === 'production') {
      return undefined;
    }

    const maybeWindow = window as Window & {
      __haloSpiroSetAudioBands?: (bands: Partial<AudioBands>) => void;
      __haloSpiroPulse?: (strength?: number) => void;
    };

    maybeWindow.__haloSpiroSetAudioBands = (bands: Partial<AudioBands>) => {
      const nextBands = {
        level: clamp01(bands.level ?? 0),
        bass: clamp01(bands.bass ?? 0),
        mid: clamp01(bands.mid ?? 0),
        treble: clamp01(bands.treble ?? 0),
      };

      audioSmoothedBandsRef.current = nextBands;
      setAudioBands(nextBands);
      setAudioEnabled(true);
    };
    maybeWindow.__haloSpiroPulse = (strength = 1) => {
      setActionPulse(clamp01(strength));
    };

    return () => {
      delete maybeWindow.__haloSpiroSetAudioBands;
      delete maybeWindow.__haloSpiroPulse;
    };
  }, []);

  const reactiveBands = useMemo(() => {
    const gain = renderControls.audioSensitivity;
    const action = actionPulse * renderControls.actionStrength;

    return {
      level: clamp01(audioBands.level * gain + action),
      bass: clamp01(audioBands.bass * gain + action),
      mid: clamp01(audioBands.mid * gain + action * 0.56),
      treble: clamp01(audioBands.treble * gain + action * 0.28),
    };
  }, [actionPulse, audioBands, renderControls.actionStrength, renderControls.audioSensitivity]);

  const particleControls = useMemo<Partial<SpiroParticleControls>>(
    () => {
      const hasUploadedImage = Boolean(uploadedImage);
      const shapePreset = getImageShapePresetAdjustments(renderControls.imageShapePreset);
      const imageMode: SpiroParticleControls['imageMode'] = !hasUploadedImage
        ? 'none'
        : renderControls.imageRole === 'color-only'
          ? 'color'
          : renderControls.imageRole === 'depth-only'
            ? 'shape'
            : 'shape-and-mask';
      const colorMode: SpiroParticleControls['colorMode'] = !hasUploadedImage
        ? 'depth'
        : renderControls.imageRole === 'shape-only' || renderControls.imageRole === 'depth-only'
          ? 'depth'
          : 'hybrid';
      const imageInfluence =
        hasUploadedImage && (renderControls.imageRole === 'shape-color' || renderControls.imageRole === 'color-only')
          ? 0.72
          : 0;
      const effectivePreserveSpiro = Math.min(renderControls.preserveSpiro, shapePreset.preserveSpiro);
      const effectiveShapeSoftness = Math.max(renderControls.shapeSoftness, shapePreset.softness);
      const effectiveProjectionMode = renderControls.projectionMode;
      const projectionWorldScale =
        effectiveProjectionMode === 'sphere' || effectiveProjectionMode === 'hologram-shell'
          ? isMobile
            ? 1.2
            : 1.62
          : renderControls.look === 'data-ring'
            ? isMobile
              ? 1.3
              : 1.85
            : 1.65;

      return {
        look: renderControls.look,
        projectionMode: effectiveProjectionMode,
        projectionBlend: renderControls.projectionBlend,
        sphereRadius: renderControls.sphereRadius,
        shellThickness: renderControls.shellThickness,
        order: renderControls.order,
        voidRadius: renderControls.voidRadius,
        ringThickness: renderControls.ringThickness,
        traceStrength: renderControls.traceStrength,
        fitMode: renderControls.fitMode,
        palette: renderControls.palette,
        seed: renderControls.seed,
        pixelRatio: isMobile ? 1.25 : 1.6,
        particleBudget: renderControls.particleCount,
        particleSize: renderControls.particleSize,
        particleSoftness: renderControls.particleSoftness,
        particleSizeVariance: 0.52,
        opacity: renderControls.particleOpacity,
        hologramIntensity: renderControls.hologramIntensity,
        hologramGlow: renderControls.hologramGlow,
        hologramScanlineDensity: renderControls.hologramScanlineDensity,
        hologramScanlineSpeed: renderControls.hologramScanlineSpeed,
        hologramShimmer: renderControls.hologramShimmer,
        hologramNoise: renderControls.hologramNoise,
        hologramEdgeFalloff: renderControls.hologramEdgeFalloff,
        hologramChromaticSplit: renderControls.hologramChromaticSplit,
        hologramColorway: renderControls.hologramColorway,
        dimensionality: effectiveProjectionMode === 'flat' ? 0 : renderControls.dimensionality,
        depth: 1.1,
        domeDepth: effectiveProjectionMode === 'flat' ? 0 : renderControls.domeDepth,
        twistDepth: renderControls.twistDepth,
        twistFrequency: renderControls.twistFrequency,
        imageDepth: renderControls.imageRole === 'color-only' ? 0 : renderControls.imageDepth * shapePreset.depthScale,
        imageMaskThreshold: renderControls.shapeThreshold,
        imageMaskSoftness: effectiveShapeSoftness,
        imageMaskSource: renderControls.imageMaskSource,
        imageShapeStrength: shapePreset.shapeStrength,
        preserveSpiro: effectivePreserveSpiro,
        worldScale: projectionWorldScale,
        spread: 0.18,
        swirl: renderControls.swirl,
        turbulence: renderControls.turbulence,
        flowSpeed: (config.playing || audioEnabled) && !reducedMotion ? 0.28 + reactiveBands.level * 0.08 : 0,
        autoRotate: renderControls.autoRotate && !reducedMotion,
        autoRotateSpeed: 0.14,
        rotationX: renderControls.rotationX,
        rotationY: renderControls.rotationY,
        rotationZ: renderControls.rotationZ,
        positionX: 0,
        positionY: renderControls.look === 'data-ring' ? 0.16 : 0,
        positionZ: 0,
        cameraMode: renderControls.cameraMode,
        cameraDistance: renderControls.cameraDistance,
        cameraFov: renderControls.cameraFov,
        orthographicZoom: 160,
        showOrbitControls: true,
        colorMode,
        imageMode,
        imageInfluence,
        transparentBackground: renderControls.backgroundMode === 'transparent',
        backgroundColor:
          renderControls.backgroundMode === 'custom'
            ? renderControls.backgroundColor
            : renderControls.backgroundMode === 'transparent'
              ? '#FFFFFF'
              : '#FAFAF7',
        toneMapping: renderControls.toneMapping,
        additive: false,
        audioLevel: reactiveBands.level,
        audioBass: reactiveBands.bass,
        audioMid: reactiveBands.mid,
        audioTreble: reactiveBands.treble,
      };
    },
    [
      config.playing,
      audioEnabled,
      isMobile,
      reactiveBands,
      reducedMotion,
      renderControls,
      uploadedImage,
    ]
  );

  const currentSettings = useMemo(
    () => ({
      schemaVersion: SETTINGS_SCHEMA_VERSION,
      renderer: rendererMode,
      ribbon: ribbonControls,
      image: imageControls,
      animation: animationControls,
      render: renderControls,
      export: exportControls,
    }),
    [animationControls, exportControls, imageControls, renderControls, rendererMode, ribbonControls]
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

  const applyWebglPreset = useCallback(
    (presetId: string) => {
      const selectedPreset = getWebglPresetById(presetId);
      webglPresetRef.current = selectedPreset.id;
      setRenderControls(selectedPreset.render);
      setStatus({ severity: 'info', message: `${selectedPreset.name} WebGL preset applied.` });
    },
    [setRenderControls]
  );

  useEffect(() => {
    if (ribbonControls.preset !== presetRef.current) {
      applyPreset(ribbonControls.preset);
    }
  }, [applyPreset, ribbonControls.preset]);

  useEffect(() => {
    if (renderControls.webglPreset !== webglPresetRef.current) {
      applyWebglPreset(renderControls.webglPreset);
    }
  }, [applyWebglPreset, renderControls.webglPreset]);

  useEffect(() => {
    const encodedSettings = new URLSearchParams(window.location.search).get('config');
    if (!encodedSettings) {
      return;
    }

    try {
      const decoded = decodeSettings(encodedSettings) as SharedStudioSettings;
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
      if (decoded.render) {
        const { renderMode, ...nextRenderControls } = decoded.render;

        if (Object.keys(nextRenderControls).length > 0) {
          const shouldExpandPreset =
            Boolean(nextRenderControls.webglPreset) && Object.keys(nextRenderControls).length === 1;
          const restoredRenderControls = shouldExpandPreset
            ? getWebglPresetById(nextRenderControls.webglPreset ?? DEFAULT_WEBGL_PRESET_ID).render
            : nextRenderControls;

          webglPresetRef.current = restoredRenderControls.webglPreset ?? webglPresetRef.current;
          setRenderControls(restoredRenderControls);
        }

        if (isSpiroRenderMode(renderMode)) {
          setRendererModeValue(renderMode);
        }
      }
      if (isSpiroRenderMode(decoded.renderer)) {
        setRendererModeValue(decoded.renderer);
      }
      setStatus({ severity: 'success', message: 'Shared ribbon settings restored.' });
    } catch {
      setStatus({ severity: 'warning', message: 'The shared settings URL could not be read. Defaults loaded.' });
    }
  }, [setAnimationControls, setImageControls, setRenderControls, setRendererModeValue, setRibbonControls]);

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
      const usesGlassExtraction =
        renderControls.imageMaskSource === 'glass' || renderControls.imageShapePreset === 'glass-sphere';
      setUploadedImage(nextImage);
      setStatus({
        severity: file.size > LARGE_FILE_BYTES ? 'warning' : 'success',
        message:
          file.size > LARGE_FILE_BYTES
            ? `${file.name} was loaded. Large images are sampled down for preview performance.`
            : usesGlassExtraction
              ? `${file.name} loaded. Glass/background extraction will use edge and rim contrast.`
            : `${file.name} loaded.`,
      });
    } catch {
      setStatus({ severity: 'error', message: 'The image could not be loaded.' });
    }
  }, [renderControls.imageMaskSource, renderControls.imageShapePreset]);

  const clearImage = () => {
    setUploadedImage(null);
    setStatus({ severity: 'info', message: 'Image removed. Ribbon settings were preserved.' });
  };

  const handleExportPng = () => {
    const dataUrl =
      rendererMode === 'dimensional'
        ? particleRef.current?.exportPng()
        : canvasRef.current?.exportPng(exportControls.exportScale, exportControls.transparentExport);
    if (!dataUrl) {
      setStatus({ severity: 'error', message: 'PNG export failed.' });
      return;
    }

    downloadDataUrl(dataUrl, `halo-spiro-${activePreset.id}.png`);
    setStatus({ severity: 'success', message: 'PNG exported.' });
  };

  const handleExportSvg = () => {
    if (rendererMode === 'dimensional') {
      setStatus({ severity: 'warning', message: 'SVG export is available in Flat mode.' });
      return;
    }

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
    stopAudio();
    setActionPulse(0);
    webglRecoveryAttemptsRef.current = 0;
    setWebglError(null);
    bumpWebglResetKey();
    setRendererModeValue('dimensional');
    webglPresetRef.current = DEFAULT_WEBGL_PRESET_ID;
    applyPreset(DEFAULT_WEBGL_RIBBON_PRESET_ID);
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
    setRenderControls({
      seed: 121,
      fitMode: 'cover',
      backgroundMode: 'white',
      backgroundColor: '#FFFFFF',
      imageDepth: 0.34,
      shapeThreshold: 0.05,
      shapeSoftness: 0.2,
      audioSensitivity: 1,
      actionStrength: 0.82,
      autoRotate: true,
      cameraMode: 'perspective',
      toneMapping: 'none',
      ...DEFAULT_WEBGL_PRESET.render,
    });
    setStatus({ severity: 'info', message: 'Studio reset to the default Halo ribbon.' });
  };

  const activeRendererLabel = rendererMode === 'dimensional' ? 'WebGL particles' : 'Flat canvas';

  return (
    <Box
      sx={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.default',
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          px: { xs: 2, md: 3 },
          py: 1.5,
          borderBottom: '1px solid',
          borderColor: 'divider',
          display: 'flex',
          alignItems: { xs: 'flex-start', md: 'center' },
          justifyContent: 'space-between',
          gap: 2,
          flexWrap: 'wrap',
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="overline" color="text.secondary">
            Studio
          </Typography>
          <Stack direction="row" gap={1.25} alignItems="center" sx={{ flexWrap: 'wrap' }}>
            <Typography variant="h4" component="h1">
              Spiro ribbons
            </Typography>
            <Chip size="small" label={activePreset.name} />
            <Chip
              size="small"
              label={activeRendererLabel}
              color={rendererMode === 'dimensional' ? 'primary' : 'default'}
              variant={rendererMode === 'dimensional' ? 'filled' : 'outlined'}
            />
            {rendererMode === 'dimensional' && (
              <Chip size="small" label={getProjectionLabel(renderControls.projectionMode)} variant="outlined" />
            )}
            <Chip size="small" label={`${frameStats.segments.toLocaleString()} segments`} variant="outlined" />
            {frameStats.fps > 0 && <Chip size="small" label={`${frameStats.fps} fps`} variant="outlined" />}
          </Stack>
        </Box>

        <Stack direction="row" gap={1} alignItems="center" sx={{ flexWrap: 'wrap' }}>
          {isMobile && (
            <Button
              variant="outlined"
              size="small"
              startIcon={<FontAwesomeIcon icon={faSliders} style={{ width: 14, height: 14 }} />}
              onClick={() => setMobileControlsOpen(true)}
            >
              Controls
            </Button>
          )}
          <Tooltip title={animationControls.playing ? 'Pause animation' : 'Play animation'}>
            <IconButton
              aria-label={animationControls.playing ? 'Pause animation' : 'Play animation'}
              onClick={togglePlaying}
              data-testid="spiro-play-toggle"
            >
              <FontAwesomeIcon icon={animationControls.playing ? faPause : faPlay} style={{ width: 16, height: 16 }} />
            </IconButton>
          </Tooltip>
          <Button
            variant={audioEnabled ? 'contained' : 'outlined'}
            size="small"
            disableElevation
            startIcon={<FontAwesomeIcon icon={faMicrophone} style={{ width: 14, height: 14 }} />}
            onClick={() => void handleToggleAudio()}
            disabled={rendererMode === 'flat'}
          >
            {audioEnabled ? 'Mic on' : 'Mic'}
          </Button>
          <Button
            variant="outlined"
            size="small"
            startIcon={<FontAwesomeIcon icon={faSparkles} style={{ width: 14, height: 14 }} />}
            onClick={() => setActionPulse(1)}
            disabled={rendererMode === 'flat'}
          >
            Pulse
          </Button>
          <Button
            variant="outlined"
            size="small"
            startIcon={<FontAwesomeIcon icon={faRotateRight} style={{ width: 14, height: 14 }} />}
            onClick={resetStudio}
          >
            Reset
          </Button>
          <Button
            variant="contained"
            size="small"
            disableElevation
            startIcon={<FontAwesomeIcon icon={faDownload} style={{ width: 14, height: 14 }} />}
            onClick={handleExportPng}
          >
            PNG
          </Button>
        </Stack>
      </Box>

      {status && (
        <Alert severity={status.severity} onClose={() => setStatus(null)} sx={{ borderRadius: 0 }}>
          {status.message}
        </Alert>
      )}

      <Box sx={{ flex: 1, minHeight: 0, display: 'flex' }}>
        {!isMobile && (
          <Box
            sx={{
              width: 340,
              flexShrink: 0,
              borderRight: '1px solid',
              borderColor: 'divider',
            }}
          >
            <ControlPanel
              rendererMode={rendererMode}
              shapeStore={shapeStore}
              flatStore={flatStore}
              webglStore={webglStore}
            />
          </Box>
        )}

        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <Box
            sx={{
              px: { xs: 2, md: 3 },
              py: 1.25,
              borderBottom: '1px solid',
              borderColor: 'divider',
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              flexWrap: 'wrap',
            }}
          >
            <Tabs
              value={rendererMode}
              onChange={handleRendererModeChange}
              aria-label="Renderer mode"
              sx={{
                minHeight: 34,
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1,
                p: 0.25,
                '& .MuiTabs-indicator': { display: 'none' },
                '& .MuiTabs-flexContainer': { gap: 0.25 },
                '& .MuiTab-root': {
                  minHeight: 28,
                  px: 1.5,
                  py: 0.5,
                  borderRadius: 0.75,
                  color: 'text.secondary',
                  fontSize: 13,
                  lineHeight: 1.2,
                  textTransform: 'none',
                },
                '& .Mui-selected': {
                  bgcolor: 'text.primary',
                  color: 'background.paper !important',
                },
              }}
            >
              <Tab value="flat" label="Flat" disableRipple />
              <Tab value="dimensional" label="WebGL" disableRipple />
            </Tabs>
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
            <Button
              variant="outlined"
              size="small"
              startIcon={<FontAwesomeIcon icon={faCloudArrowUp} style={{ width: 14, height: 14 }} />}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploadedImage ? 'Replace image' : 'Upload image'}
            </Button>
            {uploadedImage ? (
              <>
                <Chip
                  icon={<FontAwesomeIcon icon={faImage} style={{ width: 12, height: 12 }} />}
                  label={uploadedImage.fileName}
                  size="small"
                  variant="outlined"
                />
                <Tooltip title="Remove image">
                  <IconButton aria-label="Remove image" size="small" onClick={clearImage}>
                    <FontAwesomeIcon icon={faTrashCan} style={{ width: 14, height: 14 }} />
                  </IconButton>
                </Tooltip>
              </>
            ) : (
              <Typography variant="body2" color="text.secondary">
                Drop an image on the canvas or start from the ribbon alone.
              </Typography>
            )}
            <Box sx={{ flex: 1 }} />
            <Button
              variant="text"
              size="small"
              startIcon={<FontAwesomeIcon icon={faDownload} style={{ width: 14, height: 14 }} />}
              onClick={handleExportSvg}
              disabled={Boolean(uploadedImage) || rendererMode === 'dimensional'}
            >
              SVG
            </Button>
            <Button
              variant="text"
              size="small"
              startIcon={<FontAwesomeIcon icon={faCopy} style={{ width: 14, height: 14 }} />}
              onClick={() => void handleCopySettings()}
            >
              Copy JSON
            </Button>
            <Button
              variant="text"
              size="small"
              startIcon={<FontAwesomeIcon icon={faLink} style={{ width: 14, height: 14 }} />}
              onClick={() => void handleCopyShareUrl()}
            >
              Share
            </Button>
          </Box>

          <Box sx={{ flex: 1, minHeight: 0 }}>
            {rendererMode === 'dimensional' ? (
              webglError ? (
                <WebglFallbackPanel
                  message={webglError}
                  onRetry={handleRetryWebgl}
                  onSwitchFlat={handleSwitchToFlat}
                />
              ) : (
                <WebglErrorBoundary
                  resetKey={webglResetKey}
                  onError={(error) => {
                    const message = error.message || 'The WebGL renderer hit an unexpected error.';
                    recoverWebglRenderer(message, webglResetKey);
                  }}
                  fallback={
                    <WebglFallbackPanel
                      message={webglError ?? 'The WebGL renderer hit an unexpected error.'}
                      onRetry={handleRetryWebgl}
                      onSwitchFlat={handleSwitchToFlat}
                    />
                  }
                >
                  <SpiroParticle3D
                    key={webglResetKey}
                    ref={particleRef}
                    config={particleConfig}
                    controls={particleControls}
                    image={uploadedImage}
                    reducedMotion={reducedMotion}
                    fallback={
                      <WebglFallbackPanel
                        message={webglError ?? 'WebGL is unavailable in this browser.'}
                        onRetry={handleRetryWebgl}
                        onSwitchFlat={handleSwitchToFlat}
                      />
                    }
                    onDropImage={(files) => void loadFiles(files)}
                    onFrameStats={handleWebglFrameStats}
                    onWebGLUnavailable={(reason) => {
                      if (rendererModeRef.current !== 'dimensional') {
                        return;
                      }

                      setWebglError(reason);
                      setStatus({ severity: 'warning', message: 'WebGL renderer paused. Flat mode is still available.' });
                    }}
                    onContextLost={() => {
                      recoverWebglRenderer('WebGL context was lost.', webglResetKey);
                    }}
                    onContextRestored={() => {
                      if (rendererModeRef.current !== 'dimensional' || webglResetKey !== webglResetKeyRef.current) {
                        return;
                      }

                      clearWebglRecoveryTimer();
                      webglRecoveryAttemptsRef.current = 0;
                      setWebglError(null);
                      setStatus({ severity: 'success', message: 'WebGL context restored.' });
                    }}
                  />
                </WebglErrorBoundary>
              )
            ) : (
              <SpiroRibbonCanvas
                ref={canvasRef}
                config={config}
                image={uploadedImage}
                onDropImage={(files) => void loadFiles(files)}
                onFrameStats={setFrameStats}
              />
            )}
          </Box>

          <Box
            sx={{
              borderTop: '1px solid',
              borderColor: 'divider',
              p: 1.5,
              bgcolor: 'background.paper',
            }}
          >
            <Stack direction="row" gap={1.25} sx={{ overflowX: 'auto', pb: 0.5 }}>
              {SPIRO_PRESETS.map((preset) => (
                <PresetCard
                  key={preset.id}
                  preset={preset}
                  selected={preset.id === ribbonControls.preset}
                  onSelect={applyPreset}
                />
              ))}
            </Stack>
          </Box>
        </Box>
      </Box>

      <Drawer
        anchor="left"
        open={mobileControlsOpen}
        onClose={() => setMobileControlsOpen(false)}
        PaperProps={{ sx: { width: 'min(360px, 92vw)' } }}
      >
        {isMobile && (
          <ControlPanel
            rendererMode={rendererMode}
            shapeStore={shapeStore}
            flatStore={flatStore}
            webglStore={webglStore}
          />
        )}
      </Drawer>
    </Box>
  );
}
