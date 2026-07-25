import { useEffect, useState, type RefObject } from "react";

/**
 * Observed content width of an element, in CSS pixels.
 *
 * Charts here are drawn at real pixel sizes rather than a scaled `viewBox`: a
 * viewBox that scales would shrink the 11px axis text along with the geometry,
 * and an unreadable axis makes an Academic Task 1 prompt unanswerable.
 */
export function useElementWidth(ref: RefObject<HTMLElement>, fallback = 640): number {
  const [width, setWidth] = useState(fallback);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const measure = () => {
      const next = node.clientWidth;
      if (next > 0) setWidth((prev) => (Math.abs(prev - next) > 1 ? next : prev));
    };
    measure();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);

  return width;
}
