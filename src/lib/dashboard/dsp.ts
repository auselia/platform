// Signal maths for the cavitation analysis dialog. A port of cavlib/live_server.py so the
// numbers match the lab PC's live page. Amplitudes are in mV, times in µs, frequencies in kHz.

export type Win = "hann" | "rect" | "blackman";

// Equivalent noise bandwidth of each window, in bins. Sets the real frequency resolution.
export const ENBW: Record<Win, number> = { hann: 1.5, rect: 1.0, blackman: 1.73 };

// A capture at full resolution.
export type Signal = {
  mv: Float64Array;   // samples in mV
  t0_us: number;      // time of the first sample, relative to the trigger
  dt_us: number;      // spacing between samples
};

export const timeAt = (s: Signal, i: number) => s.t0_us + i * s.dt_us;

// Sample range [i0, i1) covering times t0..t1 (µs). Same rule as numpy searchsorted in the server.
export function sliceRange(s: Signal, t0: number, t1: number): [number, number] {
  const n = s.mv.length;
  const i0 = Math.min(n, Math.max(0, Math.ceil((t0 - s.t0_us) / s.dt_us - 1e-9)));
  const i1 = Math.min(n, Math.max(0, Math.floor((t1 - s.t0_us) / s.dt_us + 1e-9) + 1));
  return [i0, Math.max(i0, i1)];
}

export function windowFn(name: Win, n: number): Float64Array {
  const w = new Float64Array(n);
  if (name === "rect" || n < 2) return w.fill(1);
  for (let k = 0; k < n; k++) {
    const x = (2 * Math.PI * k) / (n - 1);
    w[k] = name === "hann" ? 0.5 - 0.5 * Math.cos(x) : 0.42 - 0.5 * Math.cos(x) + 0.08 * Math.cos(2 * x);
  }
  return w;
}

const twiddles = new Map<number, [Float64Array, Float64Array]>();
function tw(n: number) {
  let t = twiddles.get(n);
  if (!t) {
    const c = new Float64Array(n / 2), s = new Float64Array(n / 2);
    for (let k = 0; k < n / 2; k++) { c[k] = Math.cos((2 * Math.PI * k) / n); s[k] = -Math.sin((2 * Math.PI * k) / n); }
    t = [c, s];
    if (twiddles.size > 4) twiddles.clear();
    twiddles.set(n, t);
  }
  return t;
}

// In-place radix-2 FFT. Length must be a power of two.
export function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  if (n & (n - 1)) throw new Error("fft length must be a power of two");
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  const [cs, sn] = tw(n);
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1, step = n / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0, ti = 0; k < half; k++, ti += step) {
        const a = i + k, b = a + half;
        const xr = re[b] * cs[ti] - im[b] * sn[ti];
        const xi = re[b] * sn[ti] + im[b] * cs[ti];
        re[b] = re[a] - xr; im[b] = im[a] - xi;
        re[a] += xr; im[a] += xi;
      }
    }
  }
}

const nextPow2 = (n: number) => 2 ** Math.ceil(Math.log2(Math.max(2, n)));

// |rfft| of x (mean removed, windowed by w) zero-padded to nfft. Returns nfft/2+1 magnitudes.
function magnitude(x: ArrayLike<number>, w: Float64Array, nfft: number): Float64Array {
  const n = x.length;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += x[i];
  mean /= n;
  const re = new Float64Array(nfft), im = new Float64Array(nfft);
  for (let i = 0; i < n; i++) re[i] = (x[i] - mean) * w[i];
  fft(re, im);
  const out = new Float64Array(nfft / 2 + 1);
  for (let k = 0; k < out.length; k++) out[k] = Math.hypot(re[k], im[k]);
  return out;
}

export type Stats = {
  n: number; dur_us: number; min_mv: number; max_mv: number; vpp_mv: number; mean_mv: number; rms_mv: number;
  t_min_us: number; t_max_us: number; freq_khz: number | null;
};

export function stats(s: Signal, t0: number, t1: number): Stats | null {
  const [i0, i1] = sliceRange(s, t0, t1);
  const n = i1 - i0;
  if (n < 2) return null;
  let lo = Infinity, hi = -Infinity, sum = 0, iLo = i0, iHi = i0;
  for (let i = i0; i < i1; i++) {
    const v = s.mv[i];
    sum += v;
    if (v < lo) { lo = v; iLo = i; }
    if (v > hi) { hi = v; iHi = i; }
  }
  const mean = sum / n;
  let ss = 0;
  for (let i = i0; i < i1; i++) ss += (s.mv[i] - mean) ** 2;
  let freq: number | null = null;
  if (n >= 32) {
    const nfft = nextPow2(Math.max(4096, 4 * n));
    const mag = magnitude(s.mv.subarray(i0, i1), windowFn("hann", n), nfft);
    const df = 1 / (s.dt_us * 1e-6 * nfft) / 1e3;   // kHz per bin
    let best = 0, bi = -1;
    for (let k = 0; k < mag.length; k++) {
      if (k * df < 20) continue;                    // ignore below 20 kHz, like the server
      if (mag[k] > best) { best = mag[k]; bi = k; }
    }
    freq = bi < 0 ? null : Math.round(bi * df);
  }
  return {
    n, dur_us: n * s.dt_us, min_mv: lo, max_mv: hi, vpp_mv: hi - lo, mean_mv: mean, rms_mv: Math.sqrt(ss / n),
    t_min_us: timeAt(s, iLo), t_max_us: timeAt(s, iHi), freq_khz: freq,
  };
}

export type SpectrumOpts = { fminKhz: number; fmaxKhz: number; win: Win; pad: number; ref: boolean };
export type Peak = { f_khz: number; a_mv: number };
export type Spectrum = {
  n: number; t_us: number; nyq_khz: number; df_khz: number; res_khz: number;
  f: number[]; a: number[]; ref: number[] | null; ref_t: [number, number] | null; ref_short: boolean; peaks: Peak[];
};

// Amplitude spectrum (peak mV of an equivalent sine) of the samples in [t0, t1] µs, limited to fmin..fmax kHz.
export function spectrum(s: Signal, t0: number, t1: number, o: SpectrumOpts): Spectrum | { error: string } {
  const [i0, i1] = sliceRange(s, t0, t1);
  const n = i1 - i0;
  if (n < 16) return { error: "shortSelection" };
  const dt = s.dt_us * 1e-6;
  const pad = Math.min(Math.max(o.pad, 1), 32);
  const nfft = nextPow2(n * pad);
  const dfHz = 1 / (dt * nfft);
  const kLo = Math.max(0, Math.ceil((o.fminKhz * 1e3) / dfHz - 1e-9));
  const kHi = Math.min(nfft / 2, Math.floor((o.fmaxKhz * 1e3) / dfHz + 1e-9));
  if (kHi - kLo + 1 < 2) return { error: "outOfRange" };

  const amp = (from: number, to: number) => {
    const len = to - from;
    const w = windowFn(o.win, len);
    let wsum = 0;
    for (let i = 0; i < len; i++) wsum += w[i];
    const mag = magnitude(s.mv.subarray(from, to), w, nfft);
    const out = new Float64Array(kHi - kLo + 1);
    for (let k = kLo; k <= kHi; k++) out[k - kLo] = (2 * mag[k]) / wsum;
    return out;
  };

  const a = amp(i0, i1);
  const f = Array.from({ length: a.length }, (_, j) => ((kLo + j) * dfHz) / 1e3);
  const res = ENBW[o.win] / (n * dt) / 1e3;
  let ref: number[] | null = null, refT: [number, number] | null = null, refShort = false;
  if (o.ref) {
    // Noise reference: the longest stretch (up to n samples) that does not overlap the selection.
    const N = s.mv.length;
    const [r0, r1] = i0 >= N - i1 ? [Math.max(0, i0 - n), i0] : [i1, Math.min(N, i1 + n)];
    if (r1 - r0 >= 512) {
      ref = Array.from(amp(r0, r1));
      refT = [timeAt(s, r0), timeAt(s, r1 - 1)];
      refShort = r1 - r0 < n;
    }
  }
  // Peaks: local maxima, strongest first, at least 1.5 resolution widths apart.
  const idx: number[] = [];
  for (let i = 1; i < a.length - 1; i++) if (a[i] > a[i - 1] && a[i] >= a[i + 1]) idx.push(i);
  idx.sort((x, y) => a[y] - a[x]);
  const sep = 1.5 * res;
  const picked: number[] = [];
  for (const i of idx) {
    if (picked.every((j) => Math.abs(f[i] - f[j]) >= sep)) picked.push(i);
    if (picked.length === 6) break;
  }
  return {
    n, t_us: n * s.dt_us, nyq_khz: 0.5 / dt / 1e3, df_khz: dfHz / 1e3, res_khz: res,
    f, a: Array.from(a), ref, ref_t: refT, ref_short: refShort,
    peaks: picked.map((i) => ({ f_khz: f[i], a_mv: a[i] })),
  };
}

// Min and max of the samples that fall in each of `cols` equal slices of [t0, t1] µs.
// Used to draw a long trace one pixel column at a time.
export function envelope(s: Signal, t0: number, t1: number, cols: number) {
  const lo = new Float64Array(cols).fill(NaN), hi = new Float64Array(cols).fill(NaN);
  const span = t1 - t0;
  const [i0, i1] = sliceRange(s, t0, t1);
  for (let i = i0; i < i1; i++) {
    const c = Math.min(cols - 1, Math.max(0, Math.floor(((timeAt(s, i) - t0) / span) * cols)));
    const v = s.mv[i];
    if (!(v >= lo[c])) lo[c] = v;
    if (!(v <= hi[c])) hi[c] = v;
  }
  return { lo, hi };
}

// "Nice" tick positions covering [min, max].
export function niceTicks(min: number, max: number, count: number): { ticks: number[]; step: number } {
  if (!(max > min)) { max = min + 1; }
  const raw = (max - min) / Math.max(1, count);
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / p;
  const step = (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) ticks.push(Math.round(v / step) * step);
  return { ticks, step };
}

export const fmtTick = (v: number, step: number) => v.toFixed(Math.max(0, Math.min(6, -Math.floor(Math.log10(step) + 1e-9)))).replace(/^-0$/, "0");

export function csvSignal(s: Signal, t0: number, t1: number): string {
  const [i0, i1] = sliceRange(s, t0, t1);
  const rows = ["time_s,volts"];
  for (let i = i0; i < i1; i++) rows.push(`${(timeAt(s, i) * 1e-6).toExponential(9)},${(s.mv[i] / 1e3).toExponential(7)}`);
  return rows.join("\n") + "\n";
}

export function csvSpectrum(sp: Spectrum): string {
  const rows = ["freq_khz,amp_mv" + (sp.ref ? ",noise_ref_mv" : "")];
  sp.f.forEach((f, i) => rows.push(`${f},${sp.a[i]}${sp.ref ? "," + sp.ref[i] : ""}`));
  return rows.join("\n") + "\n";
}
