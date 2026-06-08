# Halo Spiro Ribbons Studio

An interactive browser studio for building Halo-style spiro ribbon and particle artwork with Leva controls, Canvas 2D rendering, WebGL/Three.js rendering, image upload, animation controls, and PNG/SVG/AVIF export.

## Run Locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Deploy To Vercel

1. Import this repository in Vercel.
2. Use the default Next.js settings.
3. Deploy.

## Features

- Leva side controls for ribbon, image, animation, flat export, and WebGL settings
- Figma-inspired spiro ribbon presets
- WebGL particle mode with flat, dome, sphere, and hologram shell projections
- Glass/background image extraction for transparent sphere and product-shell uploads
- Upload, replace, and remove raster images
- Image-behind, sampled-color, and clipped-image render modes
- Mic/action reactivity controls for WebGL particle animation
- Play/pause animation, speed, phase, reveal, and pulse controls
- PNG export for all states, including transparent flat PNG export
- Flat AVIF export with color and alpha-mask modes
- SVG export when no uploaded raster image is active
- Copy CSS mask snippet for AVIF mask usage in web builds
- Copy settings JSON and shareable URL config
