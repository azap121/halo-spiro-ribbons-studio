'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, Color, NormalBlending, ShaderMaterial } from 'three';
import type { ResolvedSpiroParticleControls } from './spiro-particle-geometry';

export interface SpiroParticleMaterialProps {
  controls: ResolvedSpiroParticleControls;
  reveal: number;
}

const VERTEX_SHADER = `
attribute float aProgress;
attribute float aLayer;
attribute vec4 aRandom;
attribute float aMask;
attribute float aSize;
attribute float aDepth;
attribute float aRadius;
attribute float aAngle;
attribute vec4 aGlass;

uniform float uTime;
uniform float uPointSize;
uniform float uPixelRatio;
uniform float uDimensionality;
uniform float uDepth;
uniform float uDomeDepth;
uniform float uTwistDepth;
uniform float uTwistFrequency;
uniform float uSwirl;
uniform float uTurbulence;
uniform float uSpread;
uniform float uFlowSpeed;
uniform float uReveal;
uniform float uSizeAttenuation;
uniform float uProjectionMode;
uniform float uProjectionBlend;
uniform float uSphereRadius;
uniform float uShellThickness;
uniform float uAudioLevel;
uniform float uAudioBass;
uniform float uAudioMid;
uniform float uAudioTreble;
uniform float uHologramScanlineSpeed;
uniform float uHologramShimmer;

varying vec3 vColor;
varying float vAlpha;
varying float vPulse;
varying float vDepth;
varying float vProgress;
varying float vLayer;
varying float vRadial;
varying float vLocalY;
varying float vRandom;
varying vec4 vGlass;

const float TAU = 6.28318530718;

mat2 rotate2d(float angle) {
  float s = sin(angle);
  float c = cos(angle);
  return mat2(c, -s, s, c);
}

vec3 resolveProjectedPosition(vec3 flatPosition, float flow) {
  float radius = clamp(aRadius, 0.0, 1.0);
  vec3 plane = flatPosition;
  float poleBlend = 1.0 - smoothstep(0.035, 0.18, radius);
  float poleAngle = aAngle + aRandom.y * TAU + aLayer * 1.73;
  float poleRadius = 0.055 + aRandom.z * 0.075;
  vec2 poleDirection = vec2(cos(poleAngle), sin(poleAngle));
  vec2 projectedXY = mix(plane.xy, poleDirection * poleRadius, poleBlend);
  float projectedRadius = clamp(length(projectedXY), 0.0, 1.0);
  float shell = sqrt(max(0.0, 1.0 - projectedRadius * projectedRadius));
  vec3 dome = vec3(plane.xy, shell * uDomeDepth);
  float rearSide = step(0.5, fract(aLayer * 2.73 + aRandom.x * 1.91));
  float side = mix(1.0, -1.0, rearSide);
  vec3 sphere = vec3(projectedXY * uSphereRadius, shell * uSphereRadius * side);
  vec3 shellNormal = normalize(vec3(projectedXY, max(0.08, shell) * side));
  float shellDrift = sin(flow * 0.8 + aProgress * 9.0 + aRandom.z * TAU) * uShellThickness * 0.12;
  vec3 hologramShell = sphere + shellNormal * ((aRandom.w - 0.5) * uShellThickness + shellDrift);
  vec3 projected = plane;

  if (uProjectionMode > 2.5) {
    projected = hologramShell;
  } else if (uProjectionMode > 1.5) {
    projected = sphere;
  } else if (uProjectionMode > 0.5) {
    projected = dome;
  }

  return mix(plane, projected, clamp(uProjectionBlend, 0.0, 1.0) * step(0.5, uProjectionMode));
}

void main() {
  float flow = uTime * uFlowSpeed;
  vec3 displaced = resolveProjectedPosition(position, flow);
  float audioPulse = uAudioLevel * 0.18 + uAudioBass * 0.34;
  float twistWave = sin((aProgress * uTwistFrequency + aLayer * 0.37) * TAU + flow);
  float drift = sin(flow * 0.7 + aRandom.y * TAU + aProgress * 13.0);
  float swirlAmount = (uSwirl + uAudioMid * 0.18) * uDimensionality;
  float angle = swirlAmount * (aProgress - 0.5) + flow * 0.08 + aRandom.z * 0.08;
  float radial = clamp(aRadius, 0.0, 1.4);
  float projectionActive = step(0.5, uProjectionMode);

  displaced.xy = rotate2d(angle) * displaced.xy;
  displaced.xy *= 1.0 + uSpread * uDimensionality * (aRandom.w - 0.5) * 0.22 + audioPulse * 0.08;
  displaced.z += projectionActive * uDimensionality * (
    aDepth * uDepth * 0.34 +
    twistWave * uTwistDepth +
    drift * uTurbulence +
    uAudioBass * 0.22 * (1.0 - clamp(radial, 0.0, 1.0))
  );

  vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
  float attenuation = mix(1.0, 18.0 / max(8.0, -mvPosition.z), uSizeAttenuation);
  float revealAlpha = 1.0 - smoothstep(uReveal, min(1.0, uReveal + 0.045), aProgress);
  float shimmer = 0.82 + 0.18 * sin(flow * 2.0 + aProgress * 20.0 + aRandom.x * TAU);
  float trebleSize = 1.0 + smoothstep(0.08, 0.78, uAudioTreble) * 0.22;
  float glassSize = 1.0 + aGlass.x * 0.24 + aGlass.y * 0.58 + aGlass.z * 0.18;
  float poleAlpha = mix(0.48 + aRandom.y * 0.22, 1.0, smoothstep(0.06, 0.2, radial));

  gl_PointSize = max(1.0, uPointSize * aSize * glassSize * attenuation * uPixelRatio * trebleSize);
  gl_Position = projectionMatrix * mvPosition;

  vColor = color;
  vPulse = audioPulse;
  vDepth = displaced.z + aDepth * 0.24;
  vProgress = aProgress;
  vLayer = aLayer;
  vRadial = radial;
  vLocalY = displaced.y;
  vRandom = aRandom.x;
  vGlass = aGlass;
  vAlpha = aMask * shimmer * revealAlpha * poleAlpha;
}
`;

const FRAGMENT_SHADER = `
precision highp float;

uniform float uOpacity;
uniform float uSoftness;
uniform float uAudioTreble;
uniform float uHologramIntensity;
uniform float uHologramGlow;
uniform float uHologramScanlineDensity;
uniform float uHologramScanlineSpeed;
uniform float uHologramShimmer;
uniform float uHologramNoise;
uniform float uHologramEdgeFalloff;
uniform float uHologramChromaticSplit;
uniform vec3 uHologramColor;
uniform float uTime;

varying vec3 vColor;
varying float vAlpha;
varying float vPulse;
varying float vDepth;
varying float vProgress;
varying float vLayer;
varying float vRadial;
varying float vLocalY;
varying float vRandom;
varying vec4 vGlass;

float random2(vec2 value) {
  return fract(sin(dot(value, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec2 coord = gl_PointCoord - vec2(0.5);
  float distanceFromCenter = length(coord) * 2.0;
  float softness = clamp(uSoftness, 0.02, 0.75);
  float coreRadius = mix(0.24, 0.48, softness);
  float edgeStart = mix(0.9, 0.58, softness);
  float core = 1.0 - smoothstep(coreRadius, coreRadius + 0.08, distanceFromCenter);
  float edge = 1.0 - smoothstep(edgeStart, 1.0, distanceFromCenter);
  float grain = clamp(edge * 0.72 + core * 0.38, 0.0, 1.0);
  float alpha = grain * vAlpha * uOpacity;

  if (alpha < 0.004) {
    discard;
  }

  float depthLight = smoothstep(-0.55, 1.05, vDepth);
  vec3 color = vColor * (0.72 + depthLight * 0.34 + core * 0.16 + vPulse * 0.12 + uAudioTreble * 0.08);
  float glassRim = vGlass.x;
  float glassHighlight = vGlass.y;
  float glassBand = vGlass.z;
  float glassInterior = vGlass.w;
  float hologram = clamp(uHologramIntensity, 0.0, 1.0);
  float scanDensity = max(0.0, uHologramScanlineDensity);
  float scanWave = sin((vLocalY * scanDensity) + (vLayer * 6.2831853) + (uTime * uHologramScanlineSpeed * 6.2831853));
  float scanline = smoothstep(0.42, 0.98, scanWave);
  float rim = clamp(
    smoothstep(0.68, 1.04, vRadial) * 0.52 +
    smoothstep(0.18, 0.95, abs(vDepth)) * 0.48,
    0.0,
    1.0
  );
  rim = max(rim, glassRim);
  float shimmer = 0.5 + 0.5 * sin(uTime * (1.4 + uHologramShimmer * 3.6) + vProgress * 37.0 + vRandom * 6.2831853);
  float speckleA = random2(gl_PointCoord * 41.0 + vec2(vRandom * 17.0, vProgress * 23.0));
  float speckleB = random2(gl_PointCoord * 29.0 + vec2(vRandom * 7.0 + uTime * 0.07, vProgress * 13.0 - uTime * 0.05));
  float speckle = mix(speckleA, speckleB, 0.35 + 0.25 * shimmer);
  float edgeFringe = smoothstep(0.52, 0.98, distanceFromCenter) * (1.0 - smoothstep(0.98, 1.0, distanceFromCenter));
  float holoSignal =
    scanline * 0.22 +
    rim * uHologramEdgeFalloff * 0.38 +
    shimmer * uHologramShimmer * 0.18 +
    speckle * uHologramNoise * 0.14;
  float glow = hologram * uHologramGlow;
  vec3 holoColor = mix(color, uHologramColor, clamp(0.42 + rim * 0.35 + scanline * 0.18, 0.0, 1.0));
  vec3 chroma = vec3(-0.04, 0.025, 0.085) * edgeFringe * uHologramChromaticSplit * hologram;
  vec3 glassTint = mix(vec3(0.68, 0.95, 0.9), uHologramColor, 0.45);

  color = mix(color, holoColor * (1.0 + holoSignal + glow * 0.38), hologram * 0.72) + chroma;
  color = mix(
    color,
    glassTint * (1.0 + glassBand * 0.45),
    clamp(glassBand * 0.45 + glassRim * 0.35, 0.0, 0.75)
  );
  color += vec3(0.45, 0.68, 0.62) * glassHighlight * (0.55 + hologram * 0.35);
  alpha *= mix(1.0, 0.92 + scanline * 0.18 + rim * glow * 0.24, hologram);
  alpha *= mix(1.0, 0.82 + speckle * 0.36, uHologramNoise * hologram);
  alpha *= 1.0 + glassRim * 0.22 + glassBand * 0.12 + glassHighlight * 0.18;
  alpha *= mix(
    1.0,
    0.74 + glassInterior * 0.42 + glassRim * 0.2,
    step(0.001, glassRim + glassBand + glassHighlight + glassInterior)
  );

  gl_FragColor = vec4(color, alpha);
}
`;

function resolveHologramColor(controls: ResolvedSpiroParticleControls): Color {
  if (controls.hologramColorway === 'cyan') {
    return new Color('#62EAF3');
  }

  if (controls.hologramColorway === 'halo') {
    return new Color('#FE7A24');
  }

  return new Color('#A8BCD0');
}

function resolveProjectionModeUniform(controls: ResolvedSpiroParticleControls): number {
  if (controls.projectionMode === 'hologram-shell') {
    return 3;
  }

  if (controls.projectionMode === 'sphere') {
    return 2;
  }

  if (controls.projectionMode === 'dome') {
    return 1;
  }

  return 0;
}

function createUniforms(controls: ResolvedSpiroParticleControls, reveal: number) {
  return {
    uTime: { value: 0 },
    uPointSize: { value: controls.particleSize },
    uSoftness: { value: controls.particleSoftness },
    uPixelRatio: { value: controls.pixelRatio },
    uOpacity: { value: controls.opacity },
    uDimensionality: { value: controls.dimensionality },
    uDepth: { value: controls.depth },
    uDomeDepth: { value: controls.domeDepth },
    uTwistDepth: { value: controls.twistDepth },
    uTwistFrequency: { value: controls.twistFrequency },
    uSwirl: { value: controls.swirl },
    uTurbulence: { value: controls.turbulence },
    uSpread: { value: controls.spread },
    uFlowSpeed: { value: controls.flowSpeed },
    uReveal: { value: reveal },
    uSizeAttenuation: { value: controls.cameraMode === 'perspective' ? 1 : 0 },
    uProjectionMode: { value: resolveProjectionModeUniform(controls) },
    uProjectionBlend: { value: controls.projectionBlend },
    uSphereRadius: { value: controls.sphereRadius },
    uShellThickness: { value: controls.shellThickness },
    uAudioLevel: { value: controls.audioLevel },
    uAudioBass: { value: controls.audioBass },
    uAudioMid: { value: controls.audioMid },
    uAudioTreble: { value: controls.audioTreble },
    uHologramIntensity: { value: controls.hologramIntensity },
    uHologramGlow: { value: controls.hologramGlow },
    uHologramScanlineDensity: { value: controls.hologramScanlineDensity },
    uHologramScanlineSpeed: { value: controls.hologramScanlineSpeed },
    uHologramShimmer: { value: controls.hologramShimmer },
    uHologramNoise: { value: controls.hologramNoise },
    uHologramEdgeFalloff: { value: controls.hologramEdgeFalloff },
    uHologramChromaticSplit: { value: controls.hologramChromaticSplit },
    uHologramColor: { value: resolveHologramColor(controls) },
  };
}

export function SpiroParticleMaterial({ controls, reveal }: SpiroParticleMaterialProps) {
  const materialRef = useRef<ShaderMaterial>(null);
  const uniforms = useMemo(() => createUniforms(controls, reveal), []);

  useEffect(() => {
    uniforms.uPointSize.value = controls.particleSize;
    uniforms.uSoftness.value = controls.particleSoftness;
    uniforms.uPixelRatio.value = controls.pixelRatio;
    uniforms.uOpacity.value = controls.opacity;
    uniforms.uDimensionality.value = controls.dimensionality;
    uniforms.uDepth.value = controls.depth;
    uniforms.uDomeDepth.value = controls.domeDepth;
    uniforms.uTwistDepth.value = controls.twistDepth;
    uniforms.uTwistFrequency.value = controls.twistFrequency;
    uniforms.uSwirl.value = controls.swirl;
    uniforms.uTurbulence.value = controls.turbulence;
    uniforms.uSpread.value = controls.spread;
    uniforms.uFlowSpeed.value = controls.flowSpeed;
    uniforms.uReveal.value = reveal;
    uniforms.uSizeAttenuation.value = controls.cameraMode === 'perspective' ? 1 : 0;
    uniforms.uProjectionMode.value = resolveProjectionModeUniform(controls);
    uniforms.uProjectionBlend.value = controls.projectionBlend;
    uniforms.uSphereRadius.value = controls.sphereRadius;
    uniforms.uShellThickness.value = controls.shellThickness;
    uniforms.uAudioLevel.value = controls.audioLevel;
    uniforms.uAudioBass.value = controls.audioBass;
    uniforms.uAudioMid.value = controls.audioMid;
    uniforms.uAudioTreble.value = controls.audioTreble;
    uniforms.uHologramIntensity.value = controls.hologramIntensity;
    uniforms.uHologramGlow.value = controls.hologramGlow;
    uniforms.uHologramScanlineDensity.value = controls.hologramScanlineDensity;
    uniforms.uHologramScanlineSpeed.value = controls.hologramScanlineSpeed;
    uniforms.uHologramShimmer.value = controls.hologramShimmer;
    uniforms.uHologramNoise.value = controls.hologramNoise;
    uniforms.uHologramEdgeFalloff.value = controls.hologramEdgeFalloff;
    uniforms.uHologramChromaticSplit.value = controls.hologramChromaticSplit;
    uniforms.uHologramColor.value.copy(resolveHologramColor(controls));
  }, [controls, reveal, uniforms]);

  useFrame(({ clock }) => {
    uniforms.uTime.value = clock.elapsedTime;
  });

  return (
    <shaderMaterial
      ref={materialRef}
      vertexShader={VERTEX_SHADER}
      fragmentShader={FRAGMENT_SHADER}
      uniforms={uniforms}
      transparent
      vertexColors
      depthWrite={false}
      depthTest
      toneMapped={controls.toneMapping === 'aces'}
      blending={controls.additive ? AdditiveBlending : NormalBlending}
    />
  );
}
