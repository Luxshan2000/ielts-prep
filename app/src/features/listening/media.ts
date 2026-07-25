/** Media helpers shared by the three listening players. */

/**
 * `HTMLMediaElement.play()` returns a promise in browsers but `undefined` in
 * jsdom (and in a few older embeds). Normalising it here means callers can
 * always `await`/`.catch()` without a TypeError.
 */
export function playAudio(element: HTMLMediaElement | null): Promise<void> {
  if (!element) return Promise.resolve();
  try {
    const started = element.play() as Promise<void> | undefined;
    return started instanceof Promise ? started : Promise.resolve();
  } catch (err) {
    return Promise.reject(err instanceof Error ? err : new Error(String(err)));
  }
}
