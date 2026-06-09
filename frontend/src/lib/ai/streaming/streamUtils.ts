/**
 * Shared stream-reading utilities. No app-level dependencies.
 * Only relies on the Fetch Streams API (available in React Native 0.71+ and Node 18+).
 */

/**
 * Read a `ReadableStream<Uint8Array>` line-by-line and call `onLine` for each
 * complete line (without the trailing newline). Handles both `\n` and `\r\n`.
 */
export async function readLines(
  body: ReadableStream<Uint8Array>,
  onLine: (line: string) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    // Last element may be an incomplete line — keep it in the buffer.
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      onLine(line.replace(/\r$/, ''));
    }
  }

  // Flush any remaining content.
  if (buffer) onLine(buffer.replace(/\r$/, ''));
}
