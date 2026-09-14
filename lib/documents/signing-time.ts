import { SIGNING_TIME_ZONE } from "./fields";

const formatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: SIGNING_TIME_ZONE,
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});

export const formatSigningTime = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : formatter.format(date);
};

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: SIGNING_TIME_ZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

/** Date Signed, e.g. 9/14/2026: the tag preview and the stored value must match. */
export const formatSignedDate = (iso: string): string =>
  dateFormatter.format(new Date(iso));
