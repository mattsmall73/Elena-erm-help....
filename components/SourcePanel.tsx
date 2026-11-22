"use client";

import { useState } from "react";

/**
 * The reading source, beside the question.
 *
 * Shown as the pages of her own booklet rather than as text. The extracts are
 * mostly copyrighted novels, and the API will not write out long published
 * passages word for word, so the app keeps the page itself. The printed line
 * numbers are on it, and the header says which lines this question wants.
 *
 * Zoom, for when the fitted page is still too small. The larger settings
 * scroll sideways inside the panel.
 *
 * On a phone it folds to one bar until opened, so the question comes first.
 */
export default function SourcePanel({
  pages,
  focus,
}: {
  /** data: URLs, in order. */
  pages: string[];
  focus?: { from: number; to: number };
}) {
  /* Fit by default: sideways scrolling along every line is the thing to
     avoid. The page is already cropped to its text, so Fit is readable on a
     laptop; the bigger sizes are there for a tired day. */
  const [zoom, setZoom] = useState<1 | 1.5 | 2>(1);
  const [open, setOpen] = useState(false);

  return (
    <section aria-label="The source" className="border-calm-line bg-calm-card border">
      <div className="border-calm-line flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-3">
        <span className="text-calm-plum text-sm font-medium">The source</span>
        <span className="text-calm-ink text-sm">
          {focus
            ? focus.from === focus.to
              ? `Use line ${focus.from}`
              : `Use lines ${focus.from} to ${focus.to}`
            : "All of it"}
        </span>
        <span className="flex-1" />
        <button
          className="text-calm-ink border-calm-line rounded-sm border px-3 py-1 text-sm lg:hidden"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
        >
          {open ? "Hide the source" : "Show the source"}
        </button>
      </div>

      <div className={open ? "block" : "hidden lg:block"}>
        <div
          className="border-calm-line flex items-center gap-2 border-b px-4 py-2"
          role="radiogroup"
          aria-label="Page size"
        >
          <span className="text-calm-soft mr-1 text-sm">Size</span>
          {(
            [
              [1, "Fit"],
              [1.5, "Bigger"],
              [2, "Biggest"],
            ] as const
          ).map(([z, text]) => (
            <button
              key={z}
              role="radio"
              aria-checked={zoom === z}
              onClick={() => setZoom(z)}
              className={
                "rounded-sm border px-2.5 py-1 text-sm " +
                (zoom === z
                  ? "border-calm-ink bg-calm-ink text-calm-card"
                  : "border-calm-line text-calm-soft hover:text-calm-ink")
              }
            >
              {text}
            </button>
          ))}
        </div>

        {pages.length === 0 ? (
          <p className="text-calm-soft px-4 py-4 text-sm">
            The source pages are not here. They are in your booklet.
          </p>
        ) : (
          <div className="max-h-[70vh] overflow-auto lg:max-h-[calc(100vh-9rem)]">
            <div style={{ width: `${zoom * 100}%` }}>
              {pages.map((src, i) => (
                // A data: URL of her own page, so next/image has nothing to
                // optimise and a plain img is the right element.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  src={src}
                  alt={`Source page ${i + 1} of ${pages.length}`}
                  className="border-calm-line block w-full border-b"
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
