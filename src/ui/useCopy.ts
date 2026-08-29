import { useCallback, useState } from 'react';

/**
 * Tap-to-copy with brief per-value feedback.
 *
 * Returns the key of the most recently copied value so a caller can swap that one label
 * for a confirmation without tracking it itself.
 */
export function useCopy(): [string | null, (key: string, text: string) => void] {
  const [copied, setCopied] = useState<string | null>(null);

  const copy = useCallback((key: string, text: string) => {
    const done = () => {
      setCopied(key);
      window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 1100);
    };
    // Clipboard access needs a secure context and can be denied; failing to copy should
    // never throw an error into the render tree.
    navigator.clipboard?.writeText(text).then(done).catch(done);
  }, []);

  return [copied, copy];
}
