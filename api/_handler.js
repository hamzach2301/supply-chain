const { handleRequest } = require('../server');

module.exports = function handler(req, res) {
  // Vercel's Node runtime exposes http-like req/res objects. Keep a small
  // compatibility shim in case a runtime only provides status/end helpers.
  if (typeof res.writeHead !== 'function') {
    res.writeHead = (code, headers) => {
      res.statusCode = code;
      Object.entries(headers || {}).forEach(([key, value]) => res.setHeader(key, value));
      return res;
    };
  }
  return handleRequest(req, res);
};
