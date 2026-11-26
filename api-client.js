/* Safe fetch wrapper: validates status, content type, and JSON before use. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TiqApiClient = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function makeError(message, code, status, details) {
    const error = new Error(message);
    error.code = code;
    error.status = status || 0;
    if (details) error.details = details;
    return error;
  }

  async function request(fetchImpl, url, options = {}) {
    let response;
    try {
      response = await fetchImpl(url, {
        ...options,
        headers: { Accept: 'application/json', ...(options.headers || {}) }
      });
    } catch (_) {
      throw makeError('Network error: model service is unreachable.', 'NETWORK_ERROR', 0);
    }

    const contentType = String(response.headers && response.headers.get ? response.headers.get('content-type') : '');
    const status = Number(response.status) || 0;
    if (!/application\/json/i.test(contentType)) {
      let snippet = '';
      try { snippet = String(await response.text()).replace(/\s+/g, ' ').trim().slice(0, 140); } catch (_) { /* body unavailable */ }
      const message = response.ok
        ? `Model service returned a non-JSON response (${contentType || 'unknown content type'}).`
        : `Model service returned ${status}${response.statusText ? ' ' + response.statusText : ''}${snippet ? ': ' + snippet : ''}.`;
      throw makeError(message, 'INVALID_RESPONSE', status);
    }

    let data;
    try { data = await response.json(); }
    catch (_) { throw makeError('Model service returned malformed JSON.', 'INVALID_JSON', status); }

    if (!response.ok) {
      throw makeError(
        (data && (data.error || data.message)) || `Model service request failed (${status}).`,
        (data && data.code) || 'API_ERROR', status, data && data.details
      );
    }
    if (data && data.success === false) {
      throw makeError((data.error || 'Model service request failed.'), (data.code || 'API_ERROR'), status, data.details);
    }
    return data;
  }

  return { request, makeError };
});
