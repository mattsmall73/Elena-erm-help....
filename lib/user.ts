/**
 * The profile these apps read and write.
 *
 * This is a partition key, not a credential: it says which rows belong to the
 * profile and nothing about who may touch them. Access control lives in
 * lib/session.ts and proxy.ts.
 */
export const USER_ID = process.env.DOODLE_USER_ID || "elena";
