import type { RibbonControlValues, SpiroPreset } from './spiro-types';

export const HALO_ORANGE = '#EF601A';

export const DEFAULT_PRESET_ID = 'dense-halo';

const baseRibbonControls: RibbonControlValues = {
  preset: DEFAULT_PRESET_ID,
  curveMode: 'hypotrochoid',
  strokeColor: HALO_ORANGE,
  strokeWidth: 1.3,
  opacity: 0.9,
  pointCount: 2400,
  ribbonCount: 1,
  outerRadius: 1,
  innerRadius: 0.2,
  penOffset: 0.64,
  symmetry: 8,
  lineDensity: 8,
  rotation: 0,
  scale: 0.94,
  blendMode: 'source-over',
};

function preset(
  id: string,
  name: string,
  description: string,
  controls: Partial<RibbonControlValues>
): SpiroPreset {
  return {
    id,
    name,
    description,
    controls: {
      ...baseRibbonControls,
      ...controls,
      preset: id,
    },
  };
}

export const SPIRO_PRESETS: SpiroPreset[] = [
  preset('six-petal-bloom', 'Six Petal Bloom', 'Large floral loops from the Figma reference.', {
    innerRadius: 0.33,
    penOffset: 0.78,
    symmetry: 6,
    lineDensity: 6,
    pointCount: 1900,
    strokeWidth: 1.25,
    scale: 0.82,
  }),
  preset('small-bow', 'Small Bow', 'A compact ribbon twist with a narrow crossing center.', {
    curveMode: 'lissajous',
    innerRadius: 0.32,
    penOffset: 0.58,
    symmetry: 3,
    lineDensity: 2.4,
    pointCount: 1500,
    strokeWidth: 1.15,
    scale: 0.68,
    rotation: 32,
  }),
  preset('ring-lace', 'Ring Lace', 'Fine circular lace with open center.', {
    innerRadius: 0.14,
    penOffset: 0.86,
    symmetry: 30,
    lineDensity: 10,
    pointCount: 3600,
    strokeWidth: 1,
    opacity: 0.72,
    scale: 0.9,
  }),
  preset('dense-halo', 'Dense Halo', 'Dense orange halo, closest to the strongest Figma reference.', {
    innerRadius: 0.11,
    penOffset: 0.82,
    symmetry: 42,
    lineDensity: 13,
    pointCount: 5200,
    strokeWidth: 1.3,
    opacity: 0.96,
    scale: 0.93,
  }),
  preset('ribbon-twist', 'Ribbon Twist', 'Horizontal fan ribbons with a pinched crossing.', {
    curveMode: 'lissajous',
    innerRadius: 0.24,
    penOffset: 0.8,
    symmetry: 2,
    lineDensity: 3.2,
    pointCount: 2200,
    strokeWidth: 1.05,
    scale: 0.82,
    rotation: -6,
  }),
  preset('ghost-ring', 'Ghost Ring', 'A light low-contrast ring for background illustration use.', {
    innerRadius: 0.13,
    penOffset: 0.8,
    symmetry: 28,
    lineDensity: 8,
    pointCount: 2800,
    strokeColor: '#DCDAD2',
    strokeWidth: 0.95,
    opacity: 0.45,
    scale: 0.78,
  }),
  preset('starburst-ring', 'Starburst Ring', 'Angular radial burst with a generous center aperture.', {
    curveMode: 'epitrochoid',
    innerRadius: 0.16,
    penOffset: 0.74,
    symmetry: 18,
    lineDensity: 7,
    pointCount: 2600,
    strokeWidth: 1,
    opacity: 0.82,
    scale: 0.84,
  }),
  preset('soft-flower', 'Soft Flower', 'Rounded multi-petal flower with a calm cadence.', {
    innerRadius: 0.18,
    penOffset: 0.7,
    symmetry: 18,
    lineDensity: 9,
    pointCount: 3200,
    strokeWidth: 1.05,
    opacity: 0.72,
    scale: 0.8,
  }),
  preset('large-bloom', 'Large Bloom', 'Oversized overlapping loops for feature artwork.', {
    innerRadius: 0.42,
    penOffset: 0.92,
    symmetry: 9,
    lineDensity: 7,
    pointCount: 2600,
    strokeWidth: 1.25,
    opacity: 0.86,
    scale: 0.96,
  }),
  preset('triple-loop', 'Triple Loop', 'Three-lobed folded ribbon with a high-energy center.', {
    curveMode: 'lissajous',
    innerRadius: 0.28,
    penOffset: 0.72,
    symmetry: 3,
    lineDensity: 4.5,
    pointCount: 2200,
    strokeWidth: 1.2,
    opacity: 0.88,
    scale: 0.74,
  }),
  preset('sunwheel', 'Sunwheel', 'Radial sunwheel with fine repeated scallops.', {
    innerRadius: 0.1,
    penOffset: 0.72,
    symmetry: 36,
    lineDensity: 11,
    pointCount: 4600,
    strokeWidth: 0.95,
    opacity: 0.78,
    scale: 0.86,
  }),
  preset('mini-star', 'Mini Star', 'Small sharp star for compact marks and loaders.', {
    curveMode: 'epitrochoid',
    innerRadius: 0.22,
    penOffset: 0.48,
    symmetry: 11,
    lineDensity: 4.5,
    pointCount: 1800,
    strokeWidth: 1.05,
    opacity: 0.82,
    scale: 0.58,
  }),
];

export const PRESET_OPTIONS = Object.fromEntries(
  SPIRO_PRESETS.map((spiroPreset) => [spiroPreset.name, spiroPreset.id])
) as Record<string, string>;

export function getPresetById(presetId: string): SpiroPreset {
  return SPIRO_PRESETS.find((spiroPreset) => spiroPreset.id === presetId) ?? SPIRO_PRESETS[0];
}
