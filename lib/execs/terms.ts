const FIRST_TERM_YEAR = 2010;

/** Academic years, newest first. The list a picker offers is the only valid set. */
export const academicTerms = (now = new Date()): string[] => {
  // A term starting in September is named for that year, so from September
  // onwards the current academic year is the one that just began.
  const latestStart =
    now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;

  const terms: string[] = [];
  for (let year = latestStart + 1; year >= FIRST_TERM_YEAR; year--) {
    terms.push(`${year}-${year + 1}`);
  }
  return terms;
};

export const isValidTerm = (term: string, now = new Date()): boolean =>
  !term || academicTerms(now).includes(term);
