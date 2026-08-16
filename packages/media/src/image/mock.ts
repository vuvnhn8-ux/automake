import { deflateSync } from 'node:zlib';
import type { GeneratedAsset, ImageGenerationInput, ImageProvider } from '../types.js';
import { mediaError } from '../types.js';

/**
 * Produces a deterministic placeholder PNG (via a minimal PNG encoder) so the
 * media pipeline can run without any external image API. Not photorealistic.
 */
export class MockImageProvider implements ImageProvider {
  readonly name = 'MOCK' as const;
  readonly model = 'mock-image-v1';

  async generateImage(input: ImageGenerationInput): Promise<GeneratedAsset> {
    const [w = 1080, h = 1920] = (input.size ?? '1080x1920')
      .split('x')
      .map((n) => parseInt(n, 10));

    if (!w || !h || w > 4096 || h > 4096) {
      throw mediaError('INVALID_REQUEST', this.name, `Invalid size: ${input.size}`);
    }

    const data = createSolidPng(w, h, hashColor(input.prompt));
    return {
      data,
      mimeType: 'image/png',
      provider: this.name,
      model: this.model,
      metadata: { width: w, height: h, prompt: input.prompt.slice(0, 80) },
    };
  }
}

function hashColor(seed: string): [number, number, number] {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return [(hash & 0xff), ((hash >> 8) & 0xff), ((hash >> 16) & 0xff)];
}

function createSolidPng(width: number, height: number, color: [number, number, number]): Buffer {
  const crcTable = (() => {
    const table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      table[n] = c;
    }
    return table;
  })();

  const crc32 = (buf: Buffer): number => {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      crc = crcTable[(crc ^ buf[i]!) & 0xff]! ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  };

  const chunk = (type: string, data: Buffer): Buffer => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  };

  const [r, g, b] = color;
  const row = Buffer.alloc(1 + width * 3);
  row[0] = 0; // filter: none
  for (let x = 0; x < width; x++) {
    row[1 + x * 3] = r;
    row[2 + x * 3] = g;
    row[3 + x * 3] = b;
  }
  const raw = Buffer.concat(Array.from({ length: height }, () => row));

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
