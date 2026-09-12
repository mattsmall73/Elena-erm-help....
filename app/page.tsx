import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Elena's Apps",
  description: "Two small apps that make school days easier.",
};

const TITLE = "Elena's Apps";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-12 px-5 py-16 sm:gap-20">
      <h1
        className="font-display text-ink text-glow-cyan m-0 flex flex-wrap justify-center text-center text-6xl leading-none font-bold sm:text-8xl"
        aria-label={TITLE}
      >
        {TITLE.split("").map((ch, i) => (
          <span
            key={i}
            aria-hidden="true"
            className="wave-letter"
            style={{ animationDelay: `${i * 0.07}s` }}
          >
            {ch === " " ? "\u00A0" : ch}
          </span>
        ))}
      </h1>

      <div className="grid w-full max-w-3xl gap-5 sm:grid-cols-2">
        <Link
          href="/ummm-less-panic"
          className="card-glow bg-card border-cyan/40 flex flex-col gap-3 rounded-2xl border p-7 no-underline transition-transform hover:-translate-y-1 focus-visible:-translate-y-1"
        >
          <h2 className="font-display text-cyan text-glow-cyan m-0 text-3xl font-bold">
            Ummm Less Panic!
          </h2>
          <p className="text-muted m-0 flex-1 text-sm leading-relaxed">
            Revision questions one at a time, with somewhere to write the answer and a
            nudge when you are stuck. Make a sheet for any subject.
          </p>
          <span className="text-cyan self-start rounded-full border border-current px-3 py-1 text-sm">
            Open
          </span>
        </Link>

        <Link
          href="/forgetful-doodle"
          className="card-glow bg-card border-magenta/40 flex flex-col gap-3 rounded-2xl border p-7 no-underline transition-transform hover:-translate-y-1 focus-visible:-translate-y-1"
        >
          <h2 className="font-display text-magenta text-glow-magenta m-0 text-3xl font-bold">
            Forgetful Doodle 2.0
          </h2>
          <p className="text-muted m-0 flex-1 text-sm leading-relaxed">
            The original. Decks, flip cards and self marking, still where you left it.
          </p>
          <span className="text-magenta self-start rounded-full border border-current px-3 py-1 text-sm">
            Open
          </span>
        </Link>
      </div>
    </main>
  );
}
