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
