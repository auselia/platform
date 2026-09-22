"use client";

import { useCallback, useEffect, useRef } from "react";

export type Colors = { ink: string; ink2: string; line: string; accent: string; amber: string; sage: string; bg: string };

function readColors(): Colors {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string) => cs.getPropertyValue(n).trim();
  return { ink: v("--ink"), ink2: v("--ink2"), line: v("--border"), accent: v("--accent"), amber: v("--amber"), sage: v("--sage"), bg: v("--bg") };
}

// A canvas that follows its CSS size at device resolution and repaints on resize and theme change.
// `draw` runs after every render, so it always sees current props and state.
export function useCanvas(
  draw: (g: CanvasRenderingContext2D, w: number, h: number, c: Colors) => void,
  onElement?: (el: HTMLCanvasElement | null) => void,
) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  // Callback ref: also hands the element to the parent, which needs it for PNG export.
  const attach = useCallback((el: HTMLCanvasElement | null) => {
    ref.current = el;
    onElement?.(el);
  }, [onElement]);
  const paintRef = useRef<() => void>(() => {});

  useEffect(() => {
    paintRef.current = () => {
      const cv = ref.current;
      if (!cv) return;
      const w = cv.clientWidth, h = cv.clientHeight, dpr = window.devicePixelRatio || 1;
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
        cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      }
      const g = cv.getContext("2d");
      if (!g) return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      draw(g, w, h, readColors());
    };
    paintRef.current();
  });

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const paint = () => paintRef.current();
    const ro = new ResizeObserver(paint);
    ro.observe(cv);
    const mo = new MutationObserver(paint);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", paint);
    return () => { ro.disconnect(); mo.disconnect(); mq.removeEventListener("change", paint); };
  }, []);

  return { ref, attach };
}

export function download(name: string, blob: Blob) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
