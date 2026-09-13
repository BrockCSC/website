/**
 * The sieve script a successor mailbox runs while a retired address still
 * delivers to it: tags the subject, stamps a header, and answers each sender
 * at most once every few days. `vacation` only replies when a listed address
 * is in To or Cc, so list and bcc traffic never triggers it.
 */

export const RETIRED_NOTICE_SCRIPT = "retired-address-notice";

const quote = (value: string) => value.replace(/[\\"]/g, "\\$&");

const list = (values: string[]) =>
  `[${values.map((value) => `"${quote(value)}"`).join(", ")}]`;

export const retiredNoticeScript = (opts: {
  retired: string[];
  successor: string;
  forwardUntil: string;
  /** A script the member had active before; it keeps running after the notice. */
  include?: string | null;
}): string => {
  const until = opts.forwardUntil.slice(0, 10);
  const primary = quote(opts.retired[0]);
  const successor = quote(opts.successor);
  const extensions = ["envelope", "variables", "editheader", "vacation"];
  if (opts.include) extensions.push("include");
  return [
    `require ${list(extensions)};`,
    "",
    `if envelope :is "to" ${list(opts.retired)} {`,
    '  set "subject" "";',
    '  if header :matches "Subject" "*" { set "subject" "${1}"; }',
    '  deleteheader "Subject";',
    '  addheader "Subject" "[Sent to retired address] ${subject}";',
    `  addheader "X-BrockCSC-Retired-Address" "${primary} forwards to ${successor} until ${until}";`,
    `  vacation :days 3 :addresses ${list(opts.retired)} :subject "${primary} has been retired" text:`,
    `The address ${primary} has been retired.`,
    "",
    `Your message was forwarded to ${successor}, and that will keep happening until ${until}. After that, mail to ${primary} will bounce.`,
    "",
    `Please update your contacts to ${successor}.`,
    "",
    "This is an automated notice from BrockCSC.",
    ".",
    "  ;",
    "}",
    ...(opts.include
      ? ["", `include :personal "${quote(opts.include)}";`]
      : []),
    "",
  ].join("\n");
};
