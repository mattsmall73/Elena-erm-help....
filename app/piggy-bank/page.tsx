"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { readResponse } from "@/lib/safe-json";
import {
  MAX_COINS,
  MAX_ENTRY_MINS,
  MINS_PER_COIN,
  PIG_FULL_MINS,
  barTiers,
  formatMins,
  formatPence,
  localDateKey,
  mondayOf,
  pencePerMinutes,
  streakFrom,
  weekDates,
} from "@/lib/piggy";

interface Entry {
  id: string;
  entryDate: string;
  mins: number;
}

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const QUICK_PICKS = [15, 30, 45, 60];
const SOUND_KEY = "piggy-sound";

/** Milestones in a week, in minutes. */
const FIRST_POUND = 60;
const FIVE_HOURS = 300;

const LINES = [
  "In the pig. Nice one.",
  "Pig says thank you.",
  "Banked.",
  "That's real money that is.",
  "Pig is getting heavier.",
];

const stillness = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/* ---------------------------------------------------------------- sound ---
   Synthesised, so there are no files to ship and nothing to load. The first
   tone needs a user gesture to start the context, which the button press
   always provides. */
let actx: AudioContext | null = null;
function tone(
  on: boolean,
  freq: number,
  dur: number,
  type: OscillatorType = "triangle",
  vol = 0.14,
  slideTo?: number,
) {
  if (!on) return;
  try {
    actx =
      actx ??
      new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext)();
    if (actx.state === "suspended") void actx.resume();
    const o = actx.createOscillator();
    const g = actx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, actx.currentTime);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, actx.currentTime + dur);
    g.gain.setValueAtTime(vol, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0008, actx.currentTime + dur);
    o.connect(g);
    g.connect(actx.destination);
    o.start();
    o.stop(actx.currentTime + dur + 0.02);
  } catch {
    /* no audio here; the app is not about the noise */
  }
}
function buzz(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* unsupported, and harmless */
  }
}


/* ------------------------------------------------------------- effects ---
   All of these reach straight into the DOM and hold no React state, so they
   live out here. Inside the component they were rebuilt on every render and
   their Math.random and performance.now calls counted as work done during
   render, which is exactly the kind of thing the purity rule is for. */

function fx(host: HTMLElement | null, node: HTMLElement, life: number) {
  if (!host) return;
  host.appendChild(node);
  setTimeout(() => node.remove(), life);
}

function sparkBurst(
  host: HTMLElement | null,
  x: number,
  y: number,
  colours: string[] = ["#2ee6c8"],
  count = 8,
) {
  for (let i = 0; i < count; i++) {
    const s = document.createElement("div");
    s.className = "piggy-spark";
    const c = colours[i % colours.length];
    s.style.background = c;
    s.style.boxShadow = `0 0 10px ${c}`;
    s.style.left = `${x}px`;
    s.style.top = `${y}px`;
    s.style.setProperty("--dx", `${Math.random() * 90 - 45}px`);
    s.style.setProperty("--dy", `${-Math.random() * 64 - 12}px`);
    fx(host, s, 1400);
  }
}

function squish(wrap: HTMLElement | null) {
  if (!wrap) return;
  wrap.classList.remove("is-squish");
  void wrap.offsetWidth;
  wrap.classList.add("is-squish");
  setTimeout(() => wrap.classList.remove("is-squish"), 400);
}

function fanfare(sound: boolean) {
  [523, 659, 784, 1047].forEach((f, i) =>
    setTimeout(() => tone(sound, f, 0.26, "sine", 0.12), i * 110),
  );
}

function confetti() {
  const colours = ["#2ee6c8", "#ff3ca6", "#ffc04d", "#f2f0ff"];
  for (let i = 0; i < 80; i++) {
    const c = document.createElement("div");
    c.className = "piggy-confetti";
    c.style.left = `${Math.random() * 100}vw`;
    c.style.background = colours[i % colours.length];
    c.style.animationDuration = `${1.5 + Math.random() * 1.5}s`;
    c.style.animationDelay = `${Math.random() * 0.45}s`;
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 3600);
  }
}

/** The pig's moment, once the last coin is in. */
function pigSparkle(host: HTMLElement | null, wrap: HTMLElement | null, sound: boolean) {
  if (!host || !wrap) return;
  const sRect = host.getBoundingClientRect();
  const wRect = wrap.getBoundingClientRect();
  const cx = wRect.left - sRect.left + wRect.width * 0.535;
  const cy = wRect.top - sRect.top + wRect.height * 0.565;
  const rx = wRect.width * 0.36;
  const ry = wRect.height * 0.34;

  const body = document.getElementById("piggy-body");
  if (body) {
    body.classList.remove("is-shine");
    void body.getBoundingClientRect();
    body.classList.add("is-shine");
    setTimeout(() => body.classList.remove("is-shine"), 1300);
  }

  const ring = document.createElement("div");
  ring.className = "piggy-ring";
  ring.style.left = `${cx}px`;
  ring.style.top = `${cy}px`;
  fx(host, ring, 900);

  const colours = ["#ffc04d", "#2ee6c8", "#ff3ca6", "#f2f0ff"];
  for (let i = 0; i < 11; i++) {
    setTimeout(() => {
      const a = (i / 11) * Math.PI * 2 + Math.random() * 0.35;
      const t = document.createElement("div");
      t.className = "piggy-twinkle";
      t.style.background = colours[i % colours.length];
      t.style.left = `${cx + Math.cos(a) * rx * (0.9 + Math.random() * 0.35) - 9}px`;
      t.style.top = `${cy + Math.sin(a) * ry * (0.9 + Math.random() * 0.35) - 9}px`;
      fx(host, t, 1100);
    }, i * 42);
  }
  sparkBurst(host, cx, cy, colours, 16);
  tone(sound, 1180, 0.5, "sine", 0.09, 1760);
  setTimeout(() => tone(sound, 1570, 0.45, "sine", 0.07), 90);
}

function countUp(fromPence: number, toPence: number, show: (p: number | null) => void) {
  if (stillness()) {
    show(null);
    return;
  }
  const start = performance.now();
  const step = (now: number) => {
    const p = Math.min(1, (now - start) / 1000);
    const eased = 1 - Math.pow(1 - p, 3);
    show(p < 1 ? Math.round(fromPence + (toPence - fromPence) * eased) : null);
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function dropCoins(
  host: HTMLElement | null,
  wrap: HTMLElement | null,
  sound: boolean,
  count: number,
  onDone: () => void,
) {
  if (!host) {
    onDone();
    return;
  }
  const slotX = host.getBoundingClientRect().width / 2 - 8;
  const slotY = 48;
  let landed = 0;
  const gap = stillness() ? 20 : 185;
  const fall = stillness() ? 40 : 640;

  for (let i = 0; i < count; i++) {
    setTimeout(() => {
      const c = document.createElement("div");
      c.className = "piggy-coin";
      c.textContent = "25p";
      c.style.left = `${slotX + (Math.random() * 26 - 13)}px`;
      c.style.top = `${slotY}px`;
      fx(host, c, fall + 400);

      setTimeout(() => {
        squish(wrap);
        sparkBurst(host, slotX + 10, slotY + 8);
        tone(sound, 760 + Math.random() * 500, 0.17, "triangle", 0.13, 230);
        buzz(16);
        c.remove();
        landed += 1;
        if (landed === count) {
          setTimeout(() => {
            pigSparkle(host, wrap, sound);
            buzz([12, 40, 12]);
            onDone();
          }, 180);
        }
      }, fall);
    }, i * gap);
  }
}

/* ------------------------------------------------------------------ pig ---
   At module scope on purpose. Declared inside the page component it would be
   a new component type on every render, so React would remount it and the
   animations would restart on every keystroke. */
function Pig({ pct }: { pct: number }) {
  const h = pct * 100;
  const happy = pct > 0.22;
  return (
    <svg viewBox="0 0 220 170" role="img" aria-label="A piggy bank" className="block h-auto w-full overflow-visible">
      <defs>
        <linearGradient id="pigBody" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff6dbe" />
          <stop offset="1" stopColor="#cf1c7c" />
        </linearGradient>
        <linearGradient id="pigCoins" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffdd8c" />
          <stop offset="1" stopColor="#dd951b" />
        </linearGradient>
        <clipPath id="pigClip"><ellipse cx="118" cy="96" rx="72" ry="52" /></clipPath>
      </defs>

      <rect x="70" y="132" width="20" height="26" rx="9" fill="#bd1a71" />
      <rect x="104" y="134" width="20" height="24" rx="9" fill="#a41462" />
      <rect x="140" y="132" width="20" height="26" rx="9" fill="#bd1a71" />
      <path d="M188 84 q17 -7 13 8 q-3 12 -15 7" fill="none" stroke="#e0338f" strokeWidth="6" strokeLinecap="round" />

      <g className="piggy-glow-body piggy-body" id="piggy-body">
        <ellipse cx="118" cy="96" rx="72" ry="52" fill="url(#pigBody)" />
        <g clipPath="url(#pigClip)">
          <rect x="46" y={148 - h} width="144" height={h} fill="url(#pigCoins)" opacity="0.92" />
          <circle cx="86" cy={150 - h} r="9" fill="#ffe6ab" opacity={pct > 0.06 ? 0.7 : 0} />
          <circle cx="118" cy={155 - h} r="7" fill="#ffd77f" opacity={pct > 0.06 ? 0.7 : 0} />
          <circle cx="150" cy={150 - h} r="9" fill="#ffe6ab" opacity={pct > 0.06 ? 0.7 : 0} />
        </g>
        <ellipse cx="118" cy="96" rx="72" ry="52" fill="none" stroke="#ff8ccb" strokeWidth="3" />
      </g>

      <path d="M78 52 l27 4 l-14 22 z" fill="#ff7cc3" stroke="#ffa6d8" strokeWidth="2" strokeLinejoin="round" />
      <ellipse cx="46" cy="100" rx="21" ry="17" fill="#ff7cc3" stroke="#ffa6d8" strokeWidth="2" />
      <ellipse cx="40" cy="97" rx="3.4" ry="5" fill="#8e1154" />
      <ellipse cx="52" cy="97" rx="3.4" ry="5" fill="#8e1154" />

      <circle cx="78" cy="82" r="6.5" fill="#2a0417" opacity={happy ? 0 : 1} />
      <circle cx="80.2" cy="79.6" r="2.2" fill="#fff" opacity={happy ? 0 : 1} />
      <path d="M71 84 q7 -10 14 0" fill="none" stroke="#2a0417" strokeWidth="4" strokeLinecap="round" opacity={happy ? 1 : 0} />

      <ellipse cx="72" cy="101" rx="9" ry="6" fill="#ff9ed4" opacity="0.55" />
      <rect x="98" y="41" width="46" height="9" rx="4.5" fill="#6d0f43" stroke="#ff9ed4" strokeWidth="2" />
    </svg>
  );
}

function WeekBars({ byDay, dates, todayKey }: { byDay: number[]; dates: string[]; todayKey: string }) {
  return (
    <div className="grid grid-cols-7 gap-1.5">
      {DAY_NAMES.map((name, i) => {
        const mins = byDay[i];
        const t = barTiers(mins);
        const isToday = dates[i] === todayKey;
        return (
          <div key={name} className="text-center">
            <div
              className={
                "bg-card-2 relative h-16 overflow-hidden rounded-[9px] " +
                (t.glow ? "shadow-[0_0_14px_rgba(255,60,166,0.5)] " : "") +
                (isToday ? "ring-magenta ring-2" : "")
              }
              role="img"
              aria-label={`${name}: ${mins ? formatMins(mins) : "nothing yet"}`}
            >
              <div className="piggy-fill" style={{ height: `${t.cyan}%` }} />
              {t.amber > 0 && <div className="sparkle-fill" style={{ height: `${t.amber}%` }} />}
              {t.magenta > 0 && <div className="sparkle-fill tier3" style={{ height: `${t.magenta}%` }} />}
            </div>
            <div className="text-muted mt-1 text-[0.66rem]">{name}</div>
            <div className="font-display text-ink h-4 text-[0.64rem] font-semibold">
              {mins ? formatMins(mins) : ""}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const btnBack = "text-sm text-muted hover:text-ink hover:underline";
const card = "bg-card border-muted/20 mb-4 rounded-[18px] border p-4";
const cardTitle = "font-display text-cyan m-0 mb-3 text-[1.05rem] font-semibold";

export default function PiggyBank() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [recentDates, setRecentDates] = useState<string[]>([]);
  const [lifetimePence, setLifetimePence] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toastMsg, setToastMsg] = useState("");

  const [picked, setPicked] = useState(0);
  const [custom, setCustom] = useState("");
  const [adding, setAdding] = useState(false);
  const [paying, setPaying] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [sound, setSound] = useState(true);

  const [shoutPence, setShoutPence] = useState<number | null>(null);
  /* Only set while the count-up owns the number. Null the rest of the time,
     so the headline is derived from the total rather than kept in step with
     it by an effect. */
  const [animPence, setAnimPence] = useState<number | null>(null);

  const fxRef = useRef<HTMLDivElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shoutTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* Synchronous, unlike the paying state behind it. Two taps landing before
     React re-renders would both read paying as false and fire two paydays.
     The route cannot double pay either, but this is the half that stops her
     watching two pigs spin. Same lesson as mark-everything. */
  const payingNow = useRef(false);

  /* Held rather than read during render, and refreshed on a timer: she may
     well leave this open past midnight, and an entry filed to yesterday
     would land in the wrong week as well as the wrong day. */
  const [todayKey, setTodayKey] = useState(localDateKey);

  /* ------------------------------------------------------------- derived -- */
  const openMins = entries.reduce((sum, e) => sum + e.mins, 0);
  const openPence = pencePerMinutes(openMins);
  const monday = mondayOf(todayKey);
  const dates = weekDates(todayKey);
  const byDay = dates.map((d) =>
    entries.filter((e) => e.entryDate === d).reduce((s, e) => s + e.mins, 0),
  );
  const weekMins = byDay.reduce((a, b) => a + b, 0);
  const earlierMins = openMins - weekMins;
  const pct = Math.min(1, weekMins / PIG_FULL_MINS);
  const streak = streakFrom(
    new Set([...recentDates, ...entries.map((e) => e.entryDate)]),
    todayKey,
  );

  /* ---------------------------------------------------------------- load -- */
  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/piggy-bank");
    const out = await readResponse<{
      open: Entry[];
      recentDates: string[];
      lifetimePence: number;
    }>(res);
    if (out.ok) {
      setEntries(out.data.open);
      setRecentDates(out.data.recentDates);
      setLifetimePence(out.data.lifetimePence);
      setError("");
    } else {
      setError(out.error);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const tick = setInterval(() => setTodayKey(localDateKey()), 60_000);
    const onShow = () => setTodayKey(localDateKey());
    document.addEventListener("visibilitychange", onShow);
    return () => {
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, []);

  useEffect(() => {
    try {
      setSound(localStorage.getItem(SOUND_KEY) !== "off");
    } catch {
      /* private window, or storage blocked; the default stands */
    }
  }, []);

  function toast(msg: string) {
    setToastMsg(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(""), 2600);
  }

  function toggleSound() {
    const next = !sound;
    setSound(next);
    try {
      localStorage.setItem(SOUND_KEY, next ? "on" : "off");
    } catch {
      /* the toggle still works for this session */
    }
    if (next) tone(true, 900, 0.16, "triangle", 0.12, 260);
  }

  /* -------------------------------------------------------------- actions -- */
  async function feedThePig() {
    if (adding || paying) return;
    const mins = Math.round(picked);
    if (!mins || mins < 1) {
      toast("Pick how long first");
      return;
    }
    if (mins > MAX_ENTRY_MINS) {
      toast("Ten hours in one go? Nice try.");
      return;
    }

    setAdding(true);
    setError("");
    const beforeWeek = weekMins;
    const beforePence = openPence;

    /* Shown straight away and reconciled against the server underneath. The
       coins take a second to land, and a second of nothing happening is the
       thing that makes an app feel broken. If the save fails the entry comes
       straight back out and she is told. */
    const optimistic: Entry = { id: `local_${Date.now()}`, entryDate: todayKey, mins };
    setEntries((prev) => [optimistic, ...prev]);
    setPicked(0);
    setCustom("");

    const saving = fetch("/api/piggy-bank", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entryDate: todayKey, mins }),
    })
      .then((res) => readResponse<{ entry: Entry }>(res))
      .catch(() => ({ ok: false as const, error: "Couldn't reach the pig. Check your connection?" }));

    const coins = Math.min(MAX_COINS, Math.max(1, Math.round(mins / MINS_PER_COIN)));
    dropCoins(fxRef.current, wrapRef.current, sound, coins, () => {
      void saving.then((out) => {
        if (!out.ok) {
          setEntries((prev) => prev.filter((e) => e.id !== optimistic.id));
          setError(out.error);
          setAdding(false);
          return;
        }
        setEntries((prev) =>
          prev.map((e) => (e.id === optimistic.id ? out.data.entry : e)),
        );
        countUp(beforePence, pencePerMinutes(openMins + mins), setAnimPence);
        setAdding(false);

        const afterWeek = beforeWeek + mins;
        if (beforeWeek < FIVE_HOURS && afterWeek >= FIVE_HOURS) {
          confetti();
          fanfare(sound);
          buzz([30, 50, 30]);
          toast("Five hours this week. Look at you.");
        } else if (beforeWeek < FIRST_POUND && afterWeek >= FIRST_POUND) {
          confetti();
          fanfare(sound);
          toast("First whole pound. Dad's wallet is sweating.");
        } else {
          toast(
            `${mins} minutes in. That's ${formatPence(pencePerMinutes(mins))}. ` +
              LINES[Math.floor(Math.random() * LINES.length)],
          );
        }
      });
    });
  }

  async function undoLast() {
    if (adding || paying) return;
    const last = entries[0];
    if (!last) {
      toast("Nothing to undo");
      return;
    }
    const kept = entries;
    setEntries((prev) => prev.filter((e) => e.id !== last.id));

    const res = await fetch(`/api/piggy-bank?id=${encodeURIComponent(last.id)}`, {
      method: "DELETE",
    }).catch(() => null);
    const out = res
      ? await readResponse<{ ok: true }>(res)
      : { ok: false as const, error: "Couldn't reach the pig. Check your connection?" };

    if (!out.ok) {
      setEntries(kept);
      setError(out.error);
      return;
    }

    const w = wrapRef.current;
    if (w) {
      w.classList.remove("is-wiggle");
      void w.offsetWidth;
      w.classList.add("is-wiggle");
      setTimeout(() => w.classList.remove("is-wiggle"), 1200);
    }
    toast(`Took back ${last.mins} minutes`);
  }

  async function payday() {
    if (payingNow.current || adding) return;
    payingNow.current = true;
    setPaying(true);
    setError("");
    setSpinning(true);
    buzz([25, 45, 25]);
    tone(sound, 180, 0.9, "sawtooth", 0.07, 90);

    const hold = new Promise((r) => setTimeout(r, stillness() ? 200 : 1450));
    const call = fetch("/api/piggy-bank/payday", { method: "POST" })
      .then((res) => readResponse<{ mins: number; amountPence: number }>(res))
      .catch(() => ({ ok: false as const, error: "Couldn't reach the pig. Nothing has been paid out." }));

    const [out] = await Promise.all([call, hold]);
    setSpinning(false);

    if (!out.ok) {
      setError(out.error);
      payingNow.current = false;
      setPaying(false);
      return;
    }

    /* The amount on screen is the one the server actually wrote, never a
       number worked out here. */
    confetti();
    fanfare(sound);
    buzz([20, 60, 20, 60, 40]);
    setShoutPence(out.data.amountPence);
    if (shoutTimer.current) clearTimeout(shoutTimer.current);
    shoutTimer.current = setTimeout(() => setShoutPence(null), 4600);

    // The reset runs behind the shout, so the pig is already empty when it clears.
    setEntries([]);
    setLifetimePence((p) => p + out.data.amountPence);
    setRecentDates((prev) => [...new Set([...prev, todayKey])]);
    setAnimPence(null);
    payingNow.current = false;
    setPaying(false);
    toast(`${formatPence(out.data.amountPence)} paid. Piggy is hungry again.`);
  }

  /* ----------------------------------------------------------------- view -- */
  return (
    <main className="mx-auto w-full max-w-[29rem] px-4 pt-5 pb-14">
      <div className="mb-1 flex items-center justify-between">
        <Link href="/" className={btnBack}>
          &larr; Elena&apos;s Apps
        </Link>
        <button
          onClick={toggleSound}
          className="border-muted/30 text-muted hover:text-ink hover:border-muted rounded-full border px-3 py-1 text-xs"
        >
          {sound ? "sound on" : "sound off"}
        </button>
      </div>

      <h1 className="font-display text-magenta text-glow-magenta m-0 text-center text-5xl font-bold sm:text-6xl">
        Piggy Bank
      </h1>
      <p className="text-muted mt-1 mb-2 text-center text-sm">
        £1 an hour. 25p a quarter. The pig does not do maths wrong.
      </p>

      {error && (
        <p className="border-nope/50 bg-nope/10 text-nope mb-4 rounded-xl border px-4 py-3 text-sm">
          {error}
        </p>
      )}

      <div className="piggy-stage relative flex h-[250px] items-end justify-center">
        <div
          ref={wrapRef}
          className={"piggy-wrap w-[250px] " + (spinning ? "is-spin" : "")}
        >
          <Pig pct={pct} />
        </div>
        <div ref={fxRef} className="pointer-events-none absolute inset-0" aria-hidden="true" />
      </div>

      <div className="font-display text-amber text-glow-amber mt-1 text-center text-5xl leading-none font-bold sm:text-6xl">
        {formatPence(animPence ?? openPence)}
      </div>
      <p className="text-muted mt-1 mb-5 min-h-[1.2em] text-center text-sm">
        {loading
          ? "counting it up"
          : openMins
            ? `${formatMins(weekMins)} of extra revision this week`
            : "nothing in there yet"}
      </p>

      <section className={card}>
        <h2 className={cardTitle}>How long did you do?</h2>
        <div className="mb-3 grid grid-cols-4 gap-2">
          {QUICK_PICKS.map((m) => (
            <button
              key={m}
              onClick={() => {
                setPicked(m);
                setCustom("");
              }}
              className={
                "font-display bg-card-2 rounded-xl border-2 px-1 py-2.5 text-base font-semibold transition " +
                (picked === m && !custom
                  ? "border-cyan text-cyan shadow-[0_0_14px_rgba(46,230,200,0.35)]"
                  : "text-ink hover:border-cyan hover:text-cyan border-transparent")
              }
            >
              {formatMins(m)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_ENTRY_MINS}
            step={5}
            value={custom}
            onChange={(e) => {
              setCustom(e.target.value);
              setPicked(Number(e.target.value) || 0);
            }}
            placeholder="or type the minutes"
            className="input flex-1"
            aria-label="Minutes"
          />
          <span className="text-muted text-sm">mins</span>
        </div>
        <button
          onClick={() => void feedThePig()}
          disabled={adding || paying}
          className="font-display bg-magenta mt-3 w-full rounded-2xl px-4 py-3 text-lg font-bold text-[#2a0417] shadow-[0_0_22px_rgba(255,60,166,0.45)] transition hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-40 disabled:shadow-none"
        >
          {adding ? "dropping it in…" : "Feed the pig"}
        </button>
      </section>

      <section className={card}>
        <h2 className={cardTitle}>This week</h2>
        <WeekBars byDay={byDay} dates={dates} todayKey={todayKey} />
        <p className="text-muted mt-3 text-center text-xs">
          An hour fills a bar. Go past it and the sparkly stuff starts.
        </p>
      </section>

      <section className={card}>
        <div className="mb-1 flex items-baseline justify-between">
          <span>Dad owes you</span>
          <b className="font-display text-amber text-xl font-bold">{formatPence(openPence)}</b>
        </div>
        {earlierMins > 0 && (
          <p className="text-muted mt-0 mb-1 text-xs">
            Includes {formatPence(pencePerMinutes(earlierMins))} from before{" "}
            {monday === todayKey ? "today" : "this week"}, still waiting to be paid.
          </p>
        )}
        {streak >= 2 && <p className="text-cyan mt-1 mb-2 text-sm">{streak} days on the bounce</p>}
        <button
          onClick={() => void payday()}
          disabled={paying || adding || openMins === 0}
          className="font-display bg-amber mt-2 w-full rounded-2xl px-4 py-3 text-lg font-bold text-[#3a2704] shadow-[0_0_22px_rgba(255,192,77,0.45)] transition hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-40 disabled:shadow-none"
        >
          {paying ? "shaking…" : "Payday! Shake it out"}
        </button>
      </section>

      <p className="text-muted mt-5 text-center text-xs leading-7">
        Paid out so far: <b className="font-display text-amber">{formatPence(lifetimePence)}</b>
        <br />
        <button
          onClick={() => void undoLast()}
          disabled={adding || paying || entries.length === 0}
          className="border-muted/30 text-muted hover:text-ink hover:border-muted mt-2 rounded-xl border px-4 py-2 text-sm disabled:opacity-40"
        >
          Undo last entry
        </button>
      </p>

      {shoutPence !== null && (
        <div
          className="piggy-shout is-on fixed inset-0 z-[70] flex cursor-pointer items-center justify-center p-6 text-center"
          style={{
            background:
              "radial-gradient(circle at 50% 46%, rgba(19,16,36,.68), rgba(19,16,36,.95))",
          }}
          onClick={() => setShoutPence(null)}
          role="status"
          aria-live="polite"
        >
          <div className="piggy-shout-inner">
            <h2 className="font-display text-amber m-0 text-4xl leading-tight font-bold sm:text-6xl [text-shadow:0_0_24px_rgba(255,192,77,.85),0_0_62px_rgba(255,60,166,.45)]">
              Get your wallet out Dad!
            </h2>
            <p className="font-display text-cyan mt-3 mb-0 text-3xl font-bold sm:text-5xl [text-shadow:0_0_22px_rgba(46,230,200,.7)]">
              {formatPence(shoutPence)}
            </p>
            <p className="text-muted mt-6 text-xs">tap to close</p>
          </div>
        </div>
      )}

      <div
        className={
          "bg-card-2 border-cyan text-ink fixed bottom-6 left-1/2 z-[60] max-w-[88vw] -translate-x-1/2 rounded-full border px-4 py-2.5 text-center text-sm shadow-[0_0_26px_rgba(46,230,200,0.35)] transition-transform " +
          (toastMsg ? "translate-y-0" : "translate-y-[140px]")
        }
        role="status"
        aria-live="polite"
      >
        {toastMsg}
      </div>
    </main>
  );
}
