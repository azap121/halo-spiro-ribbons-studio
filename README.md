# Halo Spiro Ribbons Studio

An interactive browser studio for building Halo-style spiro ribbon and particle artwork with Leva controls, Canvas 2D rendering, WebGL/Three.js rendering, image upload, animation controls, and PNG/SVG export.

## Run Locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

FontAwesome Pro packages are resolved through `.npmrc`. Set `FONTAWESOME_NPM_AUTH_TOKEN` before installing if you are running this outside the configured Vercel project.

## Deploy To Vercel

1. Import this repository in Vercel.
2. Use the default Next.js settings.
3. Ensure `FONTAWESOME_NPM_AUTH_TOKEN` is configured for the project.
4. Deploy.

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
- SVG export when no uploaded raster image is active
- Copy settings JSON and shareable URL config
