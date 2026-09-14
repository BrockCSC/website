/** Bump when the text changes, so a consent record says which version was accepted. */
export const DISCLOSURE_VERSION = "2026-09-14";

export const DISCLOSURE_SHORT =
  "Please read the Electronic Record and Signature Disclosure. By continuing, you agree to receive and sign this document electronically.";

export const DISCLOSURE_FULL = [
  "Electronic Record and Signature Disclosure",
  'Brock University Computer Science Club ("BrockCSC") uses BrockCSC Sign to send documents and collect signatures electronically. Before you review and sign, please read this disclosure.',
  "Getting paper copies. You can ask the person who sent you this document for a paper copy at any time, at no charge. Contact them using the email address in the request.",
  "Withdrawing your consent. You may decline to sign electronically at any time before you finish, using Decline. Declining ends your part of this request, and the sender will be told. It does not affect anything you have already signed.",
  "What you need. A current web browser with JavaScript enabled, an internet connection, and access to the email address or BrockCSC account this request was sent to. You can view the document in your browser; no download or extra software is required.",
  "How your signature works. When you adopt a signature, whether you pick a typed style or draw it, you agree that it is the electronic representation of your signature and initials for all purposes when you use it on this document, just like a pen-and-ink signature. The date and your name are added automatically when you finish.",
  "What we record. BrockCSC Sign records when this request was sent, viewed and signed, the IP address and browser used, and a fingerprint (SHA-256) of the original and signed documents. These details appear on the Certificate of Completion.",
  "This is an internal club signing record. It is not a certified or regulated electronic signature service.",
].join("\n\n");
