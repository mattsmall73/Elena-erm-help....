/**
 * Shown in production when no passcode is configured.
 *
 * The counterpart to the boot warning: a log line is only seen by whoever
 * goes looking, and the point of this state is that it looks identical to a
 * working one. Small and out of the way, since open is a supported choice.
 *
 * Server component, so it reads the variable directly and ships nothing to the
 * browser when the gate is on.
 */
export function GateNotice() {
  if (process.env.NODE_ENV !== "production") return null;
  if (process.env.DOODLE_PASSCODE) return null;

  return (
    <div
      role="status"
      title="DOODLE_PASSCODE is not set, so this is reachable by anyone with the link. Set it in the project's environment variables to require a passcode."
      className="border-amber/35 bg-card/90 text-amber fixed bottom-3 left-3 z-50 flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-500 backdrop-blur-sm"
    >
      <span
        aria-hidden="true"
        className="bg-amber inline-block size-1.5 rounded-full"
      />
      No passcode set
    </div>
  );
}
