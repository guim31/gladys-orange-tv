// -----------------------------------------------------------------------------
// The one function that talks to the network: a plain HTTP GET with a
// timeout and a size cap. The client takes it as a parameter: the tests
// replace it with in-memory decoders (test/helpers/fakeDecoder.js).
// -----------------------------------------------------------------------------

const MAX_BODY_BYTES = 256 * 1024;

/**
 * @param {string} url
 * @param {{ timeoutMs?: number }} [options]
 * @returns {Promise<{ status: number, body: string }>}
 */
export async function httpGet(url, { timeoutMs = 4000 } = {}) {
  const response = await fetch(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await response.arrayBuffer();
  if (body.byteLength > MAX_BODY_BYTES) {
    throw new Error('Response too large');
  }
  return { status: response.status, body: Buffer.from(body).toString('utf8') };
}
