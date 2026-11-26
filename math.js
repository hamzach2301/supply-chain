// Shared numerical helpers. These are moved from server.js without changing behaviour.
function rng(seed = 20261114) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
function pick(r, xs) { return xs[Math.floor(r() * xs.length)]; }
function clamp(x, lo, hi) { return Math.min(hi, Math.max(lo, x)); }
function mean(xs) { return xs.reduce((a, b) => a + b, 0) / xs.length; }
function hash(s) { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }
function solve(A, b) {
  const n = b.length, m = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    [m[col], m[pivot]] = [m[pivot], m[col]];
    if (Math.abs(m[col][col]) < 1e-10) m[col][col] = 1e-10;
    const d = m[col][col]; for (let j = col; j <= n; j++) m[col][j] /= d;
    for (let r = 0; r < n; r++) if (r !== col) { const f = m[r][col]; for (let j = col; j <= n; j++) m[r][j] -= f * m[col][j]; }
  }
  return m.map(row => row[n]);
}

module.exports = { rng, pick, clamp, mean, hash, solve };
