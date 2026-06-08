'use client';

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { CSSProperties, DragEvent, ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  AdaptiveDpr,
  AdaptiveEvents,
  OrbitControls,
  OrthographicCamera,
  PerformanceMonitor,
  PerspectiveCamera,
} from '@react-three/drei';
import {
  ACESFilmicToneMapping,
  Color,
  Group,
  NoToneMapping,
  SRGBColorSpace,
} from 'three';
import { SpiroParticleMaterial } from './spiro-particle-material';
import {
  createSpiroParticleGeometry,
  createSpiroParticleGeometryKey,
  resolveSpiroParticleControls,
} from './spiro-particle-geometry';
import type {
  ResolvedSpiroParticleControls,
  SpiroParticleControls,
  SpiroParticleGeometryStats,
} from './spiro-particle-geometry';
import {
  attachWebglContextLossHandlers,
  detectWebglSupport,
} from './spiro-webgl-support';
import type { WebglSupportResult } from './spiro-webgl-support';
import type { SpiroRibbonConfig, UploadedRasterImage } from './spiro-types';

export type { SpiroParticleControls } from './spiro-particle-geometry';

export interface SpiroParticleFrameStats extends SpiroParticleGeometryStats {
  fps: number;
  segments: number;
  calls: number;
  triangles: number;
}

export interface SpiroParticle3DHandle {
  exportPng: () => string | null;
}

export interface SpiroParticle3DProps {
  config: SpiroRibbonConfig;
  image: UploadedRasterImage | null;
  controls?: Partial<SpiroParticleControls>;
  reducedMotion?: boolean;
  className?: string;
  style?: CSSProperties;
  fallback?: ReactNode;
  onDropImage?: (files: FileList) => void;
  onContextLost?: (event: WebGLContextEvent) => void;
  onContextRestored?: (event: WebGLContextEvent) => void;
  onNoWebGL?: (result: WebglSupportResult) => void;
  onWebGLUnavailable?: (reason: string) => void;
  onFrameStats?: (stats: SpiroParticleFrameStats) => void;
  onPerformanceChange?: (factor: number) => void;
}

interface SceneProps {
  config: SpiroRibbonConfig;
  image: UploadedRasterImage | null;
  controls: ResolvedSpiroParticleControls;
  onContextLost?: (event: WebGLContextEvent) => void;
  onContextRestored?: (event: WebGLContextEvent) => void;
  onFrameStats?: (stats: SpiroParticleFrameStats) => void;
}

const DEG_TO_RAD = Math.PI / 180;

function getReveal(config: SpiroRibbonConfig): number {
  if (config.motion !== 'draw-on') {
    return 1;
  }

  return Math.max(0.02, Math.min(config.reveal, 1));
}

function WebglLifecycle({
  onContextLost,
  onContextRestored,
}: {
  onContextLost?: (event: WebGLContextEvent) => void;
  onContextRestored?: (event: WebGLContextEvent) => void;
}) {
  const gl = useThree((state) => state.gl);

  useEffect(() => {
    return attachWebglContextLossHandlers(gl.domElement, {
      onContextLost,
      onContextRestored,
    });
  }, [gl, onContextLost, onContextRestored]);

  return null;
}

function RendererSettings({ controls }: { controls: ResolvedSpiroParticleControls }) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);

  useEffect(() => {
    gl.outputColorSpace = SRGBColorSpace;
    gl.toneMapping = controls.toneMapping === 'aces' ? ACESFilmicToneMapping : NoToneMapping;
    scene.background = controls.transparentBackground ? null : new Color(controls.backgroundColor);
  }, [controls.backgroundColor, controls.toneMapping, controls.transparentBackground, gl, scene]);

  return null;
}

function SpiroParticleCamera({ controls }: { controls: ResolvedSpiroParticleControls }) {
  if (controls.cameraMode === 'orthographic') {
    return (
      <OrthographicCamera
        makeDefault
        position={[0, 0, controls.cameraDistance]}
        zoom={controls.orthographicZoom}
        near={0.01}
        far={1000}
      />
    );
  }

  return (
    <PerspectiveCamera
      makeDefault
      position={[0, 0, controls.cameraDistance]}
      fov={controls.cameraFov}
      near={0.01}
      far={1000}
    />
  );
}

function SpiroParticleStats({
  geometryStats,
  onFrameStats,
}: {
  geometryStats: SpiroParticleGeometryStats;
  onFrameStats?: (stats: SpiroParticleFrameStats) => void;
}) {
  const gl = useThree((state) => state.gl);
  const frameRef = useRef({ frames: 0, lastReport: 0, lastElapsed: 0 });

  useFrame(({ clock }) => {
    if (!onFrameStats) {
      return;
    }

    const elapsed = clock.elapsedTime;
    frameRef.current.frames += 1;

    if (elapsed - frameRef.current.lastReport < 0.35) {
      return;
    }

    const delta = Math.max(0.001, elapsed - frameRef.current.lastElapsed);
    const fps = Math.round(frameRef.current.frames / delta);

    onFrameStats({
      ...geometryStats,
      fps,
      segments: geometryStats.particles,
      calls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
    });

    frameRef.current.frames = 0;
    frameRef.current.lastReport = elapsed;
    frameRef.current.lastElapsed = elapsed;
  });

  return null;
}

function SpiroParticleScene({
  config,
  image,
  controls,
  onContextLost,
  onContextRestored,
  onFrameStats,
}: SceneProps) {
  const groupRef = useRef<Group>(null);
  const geometryKey = createSpiroParticleGeometryKey(config, image, controls);
  const geometryResult = useMemo(
    () => createSpiroParticleGeometry(config, image, controls),
    [geometryKey]
  );
  const reveal = getReveal(config);

  useEffect(() => {
    const geometry = geometryResult.geometry;

    return () => geometry.dispose();
  }, [geometryResult.geometry]);

  useFrame(({ clock }) => {
    const group = groupRef.current;
    if (!group) {
      return;
    }

    const autoRotation = controls.autoRotate ? clock.elapsedTime * controls.autoRotateSpeed : 0;

    group.position.set(controls.positionX, controls.positionY, controls.positionZ);
    group.rotation.set(
      controls.rotationX * DEG_TO_RAD,
      controls.rotationY * DEG_TO_RAD + autoRotation,
      controls.rotationZ * DEG_TO_RAD
    );
    group.scale.setScalar(controls.worldScale);
  });

  return (
    <>
      <RendererSettings controls={controls} />
      <WebglLifecycle onContextLost={onContextLost} onContextRestored={onContextRestored} />
      <SpiroParticleCamera controls={controls} />
      <ambientLight intensity={0.75} />
      <directionalLight position={[3, 4, 6]} intensity={1.35} />
      <group ref={groupRef}>
        <points geometry={geometryResult.geometry} frustumCulled={false}>
          <SpiroParticleMaterial controls={controls} reveal={reveal} />
        </points>
      </group>
      {controls.showOrbitControls && (
        <OrbitControls
          enableDamping
          dampingFactor={0.08}
          enablePan
          enableZoom
          minDistance={2}
          maxDistance={40}
        />
      )}
      <SpiroParticleStats geometryStats={geometryResult.stats} onFrameStats={onFrameStats} />
    </>
  );
}

function getWebglUnavailableReason(result: WebglSupportResult): string {
  if (result.reason === 'context-unavailable') {
    return 'WebGL is not available in this browser.';
  }

  if (result.reason === 'document-unavailable') {
    return 'WebGL can only be checked in the browser.';
  }

  return result.reason ? `WebGL is unavailable: ${result.reason}.` : 'WebGL is unavailable.';
}

export const SpiroParticle3D = forwardRef<SpiroParticle3DHandle, SpiroParticle3DProps>(function SpiroParticle3D(
  {
    config,
    image,
    controls,
    reducedMotion = false,
    className,
    style,
    fallback = null,
    onDropImage,
    onContextLost,
    onContextRestored,
    onNoWebGL,
    onWebGLUnavailable,
    onFrameStats,
    onPerformanceChange,
  },
  ref
) {
  const [webglSupport, setWebglSupport] = useState<WebglSupportResult | null>(null);
  const noWebglReportedRef = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const resolvedControls = resolveSpiroParticleControls(controls);
  const effectiveControls = reducedMotion
    ? {
        ...resolvedControls,
        autoRotate: false,
        flowSpeed: 0,
        audioLevel: 0,
        audioBass: 0,
        audioMid: 0,
        audioTreble: 0,
      }
    : resolvedControls;

  useImperativeHandle(
    ref,
    () => ({
      exportPng: () => canvasRef.current?.toDataURL('image/png') ?? null,
    }),
    []
  );

  useEffect(() => {
    const result = detectWebglSupport();
    setWebglSupport(result);

    if (!result.supported && !noWebglReportedRef.current) {
      noWebglReportedRef.current = true;
      onNoWebGL?.(result);
      onWebGLUnavailable?.(getWebglUnavailableReason(result));
    }
  }, [onNoWebGL, onWebGLUnavailable]);

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (event.dataTransfer.files.length > 0) {
      onDropImage?.(event.dataTransfer.files);
    }
  };

  if (webglSupport && !webglSupport.supported) {
    return fallback;
  }

  return (
    <div
      className={className}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: 420,
        overflow: 'hidden',
        ...style,
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
    >
      {webglSupport?.supported && (
        <Canvas
          dpr={[1, effectiveControls.pixelRatio]}
          frameloop={config.playing || effectiveControls.flowSpeed > 0 ? 'always' : 'demand'}
          gl={{
            alpha: effectiveControls.transparentBackground,
            antialias: true,
            powerPreference: 'high-performance',
            preserveDrawingBuffer: true,
          }}
          onCreated={({ gl }) => {
            canvasRef.current = gl.domElement;
          }}
        >
          <AdaptiveDpr pixelated />
          <AdaptiveEvents />
          <PerformanceMonitor onChange={({ factor }) => onPerformanceChange?.(factor)} />
          <SpiroParticleScene
            config={config}
            image={image}
            controls={effectiveControls}
            onContextLost={onContextLost}
            onContextRestored={onContextRestored}
            onFrameStats={onFrameStats}
          />
        </Canvas>
      )}
    </div>
  );
});
