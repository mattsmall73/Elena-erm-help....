export function Wordmark({ small = false }: { small?: boolean }) {
  return (
    <div className="flex items-baseline gap-2 select-none">
      <span
        className={`font-display font-700 tracking-tight ${
          small ? "text-2xl" : "text-4xl sm:text-5xl"
        }`}
      >
        <span className="text-cyan text-glow-cyan">Forgetful</span>{" "}
        <span className="text-ink">Doodle</span>{" "}
        <span className="text-magenta text-glow-magenta">2.0</span>
      </span>
      <span className="font-display text-muted text-sm sm:text-base">
        for Elena
      </span>
    </div>
  );
}
