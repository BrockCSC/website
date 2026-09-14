import { Readable } from "node:stream";

/** Node's Buffer/Uint8Array types carry a wider ArrayBufferLike than the DOM
 * body types accept — go through a Readable the same way the on-disk file
 * routes do, rather than fight that generic. Readable.from() only treats an
 * actual Buffer as a single chunk; a plain Uint8Array (what pdf-lib's
 * doc.save() returns) is iterable, so it gets pushed byte-by-byte and the
 * web ReadableStream adapter rejects each raw number — wrap in Buffer.from
 * so both producers behave the same way. */
export const bytesToBody = (bytes: Uint8Array) =>
  Readable.toWeb(
    Readable.from(Buffer.from(bytes)),
  ) as ReadableStream<Uint8Array>;
