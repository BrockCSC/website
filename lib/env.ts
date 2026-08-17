export const ownsIdentities = (): boolean =>
  (process.env.DB_SCHEMA ?? "public") === "prod";
