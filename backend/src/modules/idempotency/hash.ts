import crypto from 'crypto';

export function canonicalJson(obj: any): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return `[${obj.map(canonicalJson).join(',')}]`;
  }

  const sortedKeys = Object.keys(obj).sort();
  const pairs = sortedKeys
    .filter((key) => obj[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(obj[key])}`);

  return `{${pairs.join(',')}}`;
}

export function computeRequestHash(normalizedBody: any): string {
  const canonicalStr = canonicalJson(normalizedBody);
  return crypto.createHash('sha256').update(canonicalStr).digest('hex');
}
