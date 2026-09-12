/**
 * Browser-only. Shrinks a photo before it is posted as a data URL.
 *
 * The problem: app/new lets her photograph a revision-guide page, read it
 * straight to a data URL and post it inside a JSON body. Base64 adds about a
 * third, a Vercel serverless function rejects bodies over 4.5 MB at the edge,
 * and a phone camera produces 3 to 8 MB JPEGs. So a normal photo of a textbook
 * page frequently never reached the route at all.
 *
 * 1600px on the long edge is ample for Claude to read a page of text and lands
 * far inside the limit. Quality steps down only if the first attempt is still
 * too big, and the long edge shrinks after that, so an unusually dense photo
 * degrades rather than failing.
 */

/** Long edge, in pixels. Enough to read body text on a textbook page. */
const MAX_EDGE = 1600;
const SMALLER_EDGES = [1200, 900];
const QUALITY_LADDER = [0.82, 0.7, 0.55];

/**
 * Budget for the encoded string. The request body is this plus the topic and
 * notes, and the platform limit is 4.5 MB, so this leaves real headroom.
 */
const MAX_DATA_URL_CHARS = 3_200_000;

export type Downscaled =
  | { ok: true; dataUrl: string; width: number; height: number }
  | { ok: false; reason: string };

function draw(bitmap: ImageBitmap, edge: number): HTMLCanvasElement | null {
  const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  // A photo has no transparency to keep, and JPEG has no alpha, so an
  // undrawn corner would otherwise encode as black.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  return canvas;
}

export async function downscaleImage(file: File): Promise<Downscaled> {
  if (!file.type.startsWith("image/")) {
    return { ok: false, reason: "That doesn't look like a photo." };
  }

  let bitmap: ImageBitmap;
  try {
    // from-image honours the EXIF rotation a phone writes instead of rotating
    // the pixels. Without it a portrait photo arrives sideways, which makes it
    // much harder to read.
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return { ok: false, reason: "That photo couldn't be opened. Try another?" };
  }

  try {
    for (const edge of [MAX_EDGE, ...SMALLER_EDGES]) {
      const canvas = draw(bitmap, edge);
      if (!canvas) {
        return { ok: false, reason: "This browser wouldn't resize the photo." };
      }
      for (const quality of QUALITY_LADDER) {
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        if (dataUrl.length <= MAX_DATA_URL_CHARS) {
          return {
            ok: true,
            dataUrl,
            width: canvas.width,
            height: canvas.height,
          };
        }
      }
    }
  } finally {
    bitmap.close();
  }

  return {
    ok: false,
    reason: "That photo is too big to send, even shrunk. Try a tighter crop.",
  };
}
