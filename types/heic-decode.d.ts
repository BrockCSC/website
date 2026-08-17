declare module "heic-decode" {
  const decode: (input: {
    buffer: Buffer;
  }) => Promise<{ width: number; height: number; data: Uint8ClampedArray }>;
  export default decode;
}
