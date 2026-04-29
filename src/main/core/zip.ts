import { inflateRawSync } from 'node:zlib';

/**
 * From-scratch ZIP parser. Built for EPUB (which is just a ZIP archive),
 * so we support the common subset: store + DEFLATE compression, single-disk
 * archives, no encryption, no ZIP64 (>4 GiB).
 *
 * Layout of a ZIP file, read from back to front:
 *
 *   [LFH][file data]  [LFH][file data]  ...  [LFH][file data]
 *   [CDH][CDH] ... [CDH]
 *   [EOCD][optional comment]
 *
 * Three signatures matter:
 *   - LFH  (Local File Header)             0x04034b50  "PK\x03\x04"
 *   - CDH  (Central Directory File Header) 0x02014b50  "PK\x01\x02"
 *   - EOCD (End of Central Directory)      0x06054b50  "PK\x05\x06"
 *
 * All multi-byte integers are little-endian.
 */

const SIG_LFH = 0x04034b50;
const SIG_CDH = 0x02014b50;
const SIG_EOCD = 0x06054b50;

const COMPRESSION_STORED = 0;
const COMPRESSION_DEFLATE = 8;

export interface ZipEntry {
  filename: string;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  crc32: number;
  /** Decompressed file contents. */
  data: Buffer;
}

export function parseZip(input: Buffer | ArrayBuffer): Map<string, ZipEntry> {
  const buf = input instanceof ArrayBuffer ? Buffer.from(input) : input;

  const eocdOffset = findEOCD(buf);
  if (eocdOffset < 0) {
    throw new Error('Not a ZIP file: End of Central Directory record not found');
  }

  // EOCD record layout (offsets relative to EOCD start):
  //    0  signature                            (4)  = 0x06054b50
  //    4  number of this disk                  (2)
  //    6  disk where central directory starts  (2)
  //    8  number of CD records on this disk    (2)
  //   10  total number of CD records           (2)  ← we use this
  //   12  size of central directory in bytes   (4)
  //   16  offset of CD from start of archive   (4)  ← and this
  //   20  comment length                       (2)
  //   22+ comment                              (var)
  const totalEntries = buf.readUInt16LE(eocdOffset + 10);
  const cdOffset = buf.readUInt32LE(eocdOffset + 16);

  const entries = new Map<string, ZipEntry>();

  // Walk the Central Directory: one CDH per entry, laid out back-to-back.
  let p = cdOffset;
  for (let i = 0; i < totalEntries; i++) {
    const sig = buf.readUInt32LE(p);
    if (sig !== SIG_CDH) {
      throw new Error(
        `Bad Central Directory entry at offset ${p}: ` +
          `expected 0x${SIG_CDH.toString(16)}, got 0x${sig.toString(16)}`,
      );
    }

    // CDH layout:
    //    0  signature              (4)  = 0x02014b50
    //    4  version made by        (2)
    //    6  version needed         (2)
    //    8  general-purpose flag   (2)
    //   10  compression method     (2)  ← 0 = stored, 8 = deflate
    //   12  last mod file time     (2)
    //   14  last mod file date     (2)
    //   16  CRC-32                 (4)
    //   20  compressed size        (4)
    //   24  uncompressed size      (4)
    //   28  filename length    n   (2)
    //   30  extra field length m   (2)
    //   32  file comment length k  (2)
    //   34  disk number start      (2)
    //   36  internal file attrs    (2)
    //   38  external file attrs    (4)
    //   42  LFH offset             (4)  ← where the entry's data lives
    //   46  filename               (n)
    //   46+n  extra field          (m)
    //   46+n+m  file comment       (k)
    const compressionMethod = buf.readUInt16LE(p + 10);
    const crc32 = buf.readUInt32LE(p + 16);
    const compressedSize = buf.readUInt32LE(p + 20);
    const uncompressedSize = buf.readUInt32LE(p + 24);
    const filenameLength = buf.readUInt16LE(p + 28);
    const extraLength = buf.readUInt16LE(p + 30);
    const commentLength = buf.readUInt16LE(p + 32);
    const lfhOffset = buf.readUInt32LE(p + 42);

    const filename = buf.toString('utf8', p + 46, p + 46 + filenameLength);

    // Jump to this entry's Local File Header. The CDH already told us the
    // sizes and compression method, but the LFH owns the actual file bytes.
    // Critically, the LFH's filename / extra-field lengths may differ from
    // the CDH's, so we must read them here to find where the data starts.
    if (buf.readUInt32LE(lfhOffset) !== SIG_LFH) {
      throw new Error(
        `Bad Local File Header at offset ${lfhOffset} for "${filename}"`,
      );
    }

    // LFH layout:
    //    0  signature              (4)  = 0x04034b50
    //    4  version needed         (2)
    //    6  general-purpose flag   (2)
    //    8  compression method     (2)
    //   10  last mod file time     (2)
    //   12  last mod file date     (2)
    //   14  CRC-32                 (4)
    //   18  compressed size        (4)
    //   22  uncompressed size      (4)
    //   26  filename length    n'  (2)
    //   28  extra field length m'  (2)
    //   30  filename               (n')
    //   30+n'  extra field         (m')
    //   30+n'+m'  file data        (compressedSize bytes)
    const lfhFilenameLength = buf.readUInt16LE(lfhOffset + 26);
    const lfhExtraLength = buf.readUInt16LE(lfhOffset + 28);
    const dataStart = lfhOffset + 30 + lfhFilenameLength + lfhExtraLength;
    const dataEnd = dataStart + compressedSize;
    const rawData = buf.subarray(dataStart, dataEnd);

    let data: Buffer;
    if (compressionMethod === COMPRESSION_STORED) {
      // Copy out of the slice so the returned Buffer doesn't pin the input.
      data = Buffer.from(rawData);
    } else if (compressionMethod === COMPRESSION_DEFLATE) {
      // ZIP stores raw DEFLATE streams (no zlib header / Adler-32 trailer),
      // so inflateRawSync — not inflateSync — is the right choice.
      data = inflateRawSync(rawData);
    } else {
      throw new Error(
        `Unsupported compression method ${compressionMethod} for "${filename}"`,
      );
    }

    entries.set(filename, {
      filename,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      crc32,
      data,
    });

    // Advance past this CDH (header + variable-length tail).
    p += 46 + filenameLength + extraLength + commentLength;
  }

  return entries;
}

/**
 * Locate the EOCD by scanning backwards from the end of the buffer.
 *
 * The EOCD is fixed-size (22 bytes) but may be followed by a comment of up
 * to 65535 bytes — and the comment's length is stored *inside* the EOCD,
 * so we can't seek to it. We scan the last (22 + 65535) bytes for the
 * signature, and double-check by verifying that comment_length lands us
 * exactly at end-of-file (this rules out the signature accidentally
 * appearing inside compressed data).
 */
function findEOCD(buf: Buffer): number {
  const minEOCDSize = 22;
  const maxCommentSize = 0xffff;
  const scanFrom = Math.max(0, buf.length - minEOCDSize - maxCommentSize);

  for (let i = buf.length - minEOCDSize; i >= scanFrom; i--) {
    if (buf.readUInt32LE(i) !== SIG_EOCD) continue;
    const commentLength = buf.readUInt16LE(i + 20);
    if (i + minEOCDSize + commentLength === buf.length) {
      return i;
    }
  }
  return -1;
}
