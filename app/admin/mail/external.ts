/** The part after the @, lowercased, or null for an unparseable address. */
export const domainOf = (email: string | null | undefined): string | null =>
  email?.split("@")[1]?.toLowerCase() || null;

/** True once we know our own domain and the sender's is a different one. */
export const isExternalSender = (
  fromEmail: string | null | undefined,
  ownDomain: string | null,
): boolean => !!ownDomain && !!fromEmail && domainOf(fromEmail) !== ownDomain;
