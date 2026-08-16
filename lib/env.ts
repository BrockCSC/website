/**
 * UAT and preview environments share the production Keycloak realm and the one
 * mail server, and their databases are copies of prod. Identity and mailbox
 * writes from those environments would hit real people, so they are refused.
 */
export const ownsIdentities = (): boolean =>
  (process.env.DB_SCHEMA ?? "public") === "prod";
