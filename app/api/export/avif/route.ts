import sharp from 'sharp';

export const runtime = 'nodejs';

const MAX_INPUT_BYTES = 24 * 1024 * 1024;

function clampQuality(value: FormDataEntryValue | null): number {
  const numeric = Number(value ?? 82);

  if (!Number.isFinite(numeric)) {
    return 82;
  }

  return Math.max(1, Math.min(100, Math.round(numeric)));
}

export async function POST(request: Request): Promise<Response> {
  try {
    const formData = await request.formData();
    const image = formData.get('image');

    if (!(image instanceof Blob)) {
      return new Response('Missing image payload.', { status: 400 });
    }

    if (image.size > MAX_INPUT_BYTES) {
      return new Response('Image payload is too large.', { status: 413 });
    }

    const input = Buffer.from(await image.arrayBuffer());
    const quality = clampQuality(formData.get('quality'));
    const avif = await sharp(input, { failOn: 'none' })
      .ensureAlpha()
      .avif({
        quality,
        effort: 5,
        chromaSubsampling: '4:4:4',
      })
      .toBuffer();

    return new Response(new Uint8Array(avif), {
      headers: {
        'Cache-Control': 'no-store',
        'Content-Length': String(avif.length),
        'Content-Type': 'image/avif',
      },
    });
  } catch {
    return new Response('AVIF encoding failed.', { status: 500 });
  }
}
