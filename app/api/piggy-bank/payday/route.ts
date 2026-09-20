import { isMissingTable, payday } from "@/lib/piggy-db";
import { withSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Pay out everything outstanding.
 *
 * Takes nothing. The amount is worked out inside the transaction from the
 * entries it actually claims, so the browser never gets a say in what it is
 * owed. The guard against a double press lives on the page as well, but this
 * does not depend on it: the claiming UPDATE can only take each entry once.
 */
export const POST = withSession(async () => {
  try {
    const paid = await payday();
    if (!paid) {
      return Response.json({ paid: false, error: "Nothing in the pig yet." }, { status: 409 });
    }
    return Response.json({ paid: true, ...paid });
  } catch (err) {
    if (isMissingTable(err)) {
      console.error(
        "[piggy-bank] piggy_entry or piggy_payout is missing. " +
          "Run scripts/schema-piggy-bank.sql to create them.",
      );
      return Response.json(
        { error: "The piggy bank isn't switched on here yet." },
        { status: 503 },
      );
    }
    console.error("[piggy-bank] payday failed:", err);
    return Response.json(
      { error: "Something went wrong at our end. Nothing has been paid out." },
      { status: 500 },
    );
  }
});
