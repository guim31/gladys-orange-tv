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
  let response;
  let body;
  try {
    response = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    body = await response.arrayBuffer();
  } catch (err) {
    // fetch hides the reason: a DOMException for the timeout (code 23), a
    // TypeError whose cause holds ECONNREFUSED, ENOTFOUND... Give a readable code.
    const error = new Error(err.message, { cause: err });
    error.code =
      err.name === 'TimeoutError' ? 'ETIMEDOUT' : (err.cause?.code ?? err.code ?? err.name);
    throw error;
  }
  if (body.byteLength > MAX_BODY_BYTES) {
    throw new Error('Response too large');
  }
  return { status: response.status, body: Buffer.from(body).toString('utf8') };
}
