import crypto from 'node:crypto';

function mgf1(seed: Buffer, length: number): Buffer {
  const output = Buffer.alloc(length);
  let offset = 0;
  for (let counter = 0; offset < length; counter += 1) {
    const block = Buffer.alloc(4);
    block.writeUInt32BE(counter, 0);
    const digest = crypto.createHash('sha1').update(seed).update(block).digest();
    digest.copy(output, offset, 0, Math.min(digest.length, length - offset));
    offset += digest.length;
  }
  return output;
}

function xor(left: Buffer, right: Buffer): Buffer {
  const output = Buffer.alloc(left.length);
  for (let index = 0; index < left.length; index += 1) output[index] = left[index]! ^ right[index]!;
  return output;
}

export function unwrapAndroidOaep(privateKey: crypto.KeyObject, wrapped: Buffer): Buffer {
  const encoded = crypto.privateDecrypt({ key: privateKey, padding: crypto.constants.RSA_NO_PADDING }, wrapped);
  const hashLength = 32;
  if (encoded[0] !== 0) throw new Error('OAEP leading byte invalid');
  const maskedSeed = encoded.subarray(1, 1 + hashLength);
  const maskedDataBlock = encoded.subarray(1 + hashLength);
  const seed = xor(maskedSeed, mgf1(maskedDataBlock, hashLength));
  const dataBlock = xor(maskedDataBlock, mgf1(seed, maskedDataBlock.length));
  const labelHash = crypto.createHash('sha256').update(Buffer.alloc(0)).digest();
  if (!dataBlock.subarray(0, hashLength).equals(labelHash)) throw new Error('OAEP label hash invalid');
  let separator = hashLength;
  while (separator < dataBlock.length && dataBlock[separator] === 0) separator += 1;
  if (separator >= dataBlock.length || dataBlock[separator] !== 1) throw new Error('OAEP separator invalid');
  return dataBlock.subarray(separator + 1);
}
