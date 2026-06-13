/**
 * useEditorHistory — Undo/Redo with Debounced Grouping
 *
 * Bug fix: Previously pushed a full snapshot on every keystroke,
 * making undo go character-by-character (terrible UX).
 *
 * Now groups rapid edits into a single undo step using a debounce timer.
 * A new undo entry is created when:
 *   - The user pauses typing for 600ms
 *   - A non-typing action occurs (format, AI insert, etc.)
 */

import { useCallback, useRef, useState } from "react";

const DEBOUNCE_MS = 600;
const MAX_HISTORY = 50;

interface HistoryState {
  history: string[];
  redoStack: string[];
}

export function useEditorHistory(initialContent: string) {
  const [state, setState] = useState<HistoryState>({
    history: [],
    redoStack: [],
  });

  const contentRef = useRef(initialContent);
  const pendingRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Flush any pending snapshot into the history stack.
   * Call before non-typing actions (format, AI, etc.).
   */
  const flush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (pendingRef.current !== null) {
      const snapshot = pendingRef.current;
      pendingRef.current = null;
      setState((s) => ({
        history: [...s.history.slice(-(MAX_HISTORY - 1)), snapshot],
        redoStack: [],
      }));
    }
  }, []);

  /**
   * Record a content change (typing). Debounces: only creates an undo
   * entry after the user pauses for DEBOUNCE_MS.
   */
  const recordChange = useCallback(
    (prevContent: string, _newContent: string) => {
      // If this is the first keystroke in a burst, stash the "before" state
      if (pendingRef.current === null) {
        pendingRef.current = prevContent;
      }

      // Reset the debounce timer
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        if (pendingRef.current !== null) {
          const snapshot = pendingRef.current;
          pendingRef.current = null;
          setState((s) => ({
            history: [...s.history.slice(-(MAX_HISTORY - 1)), snapshot],
            redoStack: [],
          }));
        }
      }, DEBOUNCE_MS);
    },
    []
  );

  /**
   * Push an immediate undo snapshot (for non-typing actions like
   * format, AI insert, voice edit). Flushes any pending first.
   */
  const pushImmediate = useCallback(
    (content: string) => {
      flush();
      setState((s) => ({
        history: [...s.history.slice(-(MAX_HISTORY - 1)), content],
        redoStack: [],
      }));
    },
    [flush]
  );

  /**
   * Undo: pop from history, push current to redo.
   * Returns the restored content, or null if nothing to undo.
   */
  const undo = useCallback(
    (currentContent: string): string | null => {
      flush();
      let result: string | null = null;
      setState((s) => {
        if (s.history.length === 0) return s;
        const prev = s.history[s.history.length - 1];
        result = prev;
        return {
          history: s.history.slice(0, -1),
          redoStack: [...s.redoStack, currentContent],
        };
      });
      return result;
    },
    [flush]
  );

  /**
   * Redo: pop from redo stack, push current to history.
   * Returns the restored content, or null if nothing to redo.
   */
  const redo = useCallback(
    (currentContent: string): string | null => {
      let result: string | null = null;
      setState((s) => {
        if (s.redoStack.length === 0) return s;
        const next = s.redoStack[s.redoStack.length - 1];
        result = next;
        return {
          history: [...s.history, currentContent],
          redoStack: s.redoStack.slice(0, -1),
        };
      });
      return result;
    },
    []
  );

  return {
    history: state.history,
    redoStack: state.redoStack,
    canUndo: state.history.length > 0,
    canRedo: state.redoStack.length > 0,
    recordChange,
    pushImmediate,
    undo,
    redo,
    flush,
  };
}
