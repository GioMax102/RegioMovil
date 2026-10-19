/** Keep deadlines compatible with WebViews without AbortSignal.timeout. */
export async function withRequestTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  milliseconds: number,
  parent?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (parent?.aborted) cancel();
  else parent?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(cancel, milliseconds);
  try {
    // The operation includes reading the response body, not just receiving headers.
    return await operation(controller.signal);
  } finally {
    clearTimeout(timer);
    parent?.removeEventListener('abort', cancel);
  }
}
