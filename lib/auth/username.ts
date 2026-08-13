/** firstname + lastname, lowercased, non-alphanumerics stripped. Shared by the
 * sign-up form and the server, so the preview can't drift from what's created. */
export const usernameFor = (firstName: string, lastName: string): string =>
  `${firstName}${lastName}`.toLowerCase().replace(/[^a-z0-9]/g, "");
