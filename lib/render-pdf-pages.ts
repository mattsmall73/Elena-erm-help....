/**
 * Browser-only. Renders chosen pages of a PDF to JPEG data, for showing a
 * source page in the app and sending it to the marker.
 *
 * The worker code is imported straight into the page rather than started as
 * a separate worker. That is slower on a big document and fine on the one or
 * two pages of a source, and it avoids pointing pdf.js at a worker file by
 * URL, which is the part bundlers most often break.
 */

/** Wide enough to read body text on an A4 page when zoomed in. */
const WIDTH = 1400;
const QUALITY_LADDER = [0.8, 0.68, 0.55];
/** Per page, matching the limit the sheet route enforces. */
const MAX_CHARS = 1_400_000;

export async function renderPdfPages(
  bytes: Uint8Array,
  pageNumbers: number[],
): Promise<{ mediaType: string; data: string }[]> {
  const pdfjs = await import("pdfjs-dist");
  // Sets globalThis.pdfjsWorker, which pdf.js uses in place of a worker.
  await import("pdfjs-dist/build/pdf.worker.min.mjs");

  // getDocument takes ownership of the buffer it is given, so it gets a copy.
  const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  const out: { mediaType: string; data: string }[] = [];
  try {
    for (const n of pageNumbers) {
      if (n < 1 || n > doc.numPages) continue;
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: WIDTH / base.width });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("This browser wouldn't draw the page.");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;

      const out2 = trimMargins(canvas, ctx);

      let data = "";
      for (const q of QUALITY_LADDER) {
        const url = out2.toDataURL("image/jpeg", q);
        data = url.slice(url.indexOf(",") + 1);
        if (data.length <= MAX_CHARS) break;
      }
      out.push({ mediaType: "image/jpeg", data });
      page.cleanup();
    }
  } finally {
    await doc.destroy();
  }
  return out;
}

/**
 * Crops the white margins off a rendered page, keeping a little padding.
 *
 * A booklet page is about a quarter margin. Fitted to half a laptop screen,
 * cropping it makes the text roughly a third bigger at the same width, which
 * is the difference between reading the source at "Fit" and having to scroll
 * sideways along every line.
 */
function trimMargins(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
): HTMLCanvasElement {
  const { width, height } = canvas;
  const px = ctx.getImageData(0, 0, width, height).data;
  const ink = (i: number) => px[i] < 200 || px[i + 1] < 200 || px[i + 2] < 200;

  let top = height;
  let bottom = -1;
  let left = width;
  let right = -1;
  // Every second pixel is plenty to find the edges of a page of text.
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      if (!ink((y * width + x) * 4)) continue;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
      if (x < left) left = x;
      if (x > right) right = x;
    }
  }
  if (bottom < 0) return canvas;

  const pad = 24;
  const x0 = Math.max(0, left - pad);
  const y0 = Math.max(0, top - pad);
  const w = Math.min(width, right + pad) - x0;
  const h = Math.min(height, bottom + pad) - y0;
  // Not worth it for a sliver, and a near-blank page is better left whole.
  if (w > width * 0.95 && h > height * 0.95) return canvas;

  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const octx = out.getContext("2d");
  if (!octx) return canvas;
  octx.drawImage(canvas, x0, y0, w, h, 0, 0, w, h);
  return out;
}
