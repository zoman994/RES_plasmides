/**
 * dna-linear-abort — the linear kernel's cancellation signal.
 *
 * Its own leaf so the control/telemetry module can raise it without importing the kernel, which
 * would be a cycle. `SEARCH_ABORT` is deliberately NOT a resource code: a budget refusal says the
 * molecule needed more work than the caller allowed, while this says the caller changed their mind.
 */
export const SEARCH_ABORT = 'SEARCH_ABORT';

/**
 * §3.3 — an abort is NOT a resource limit. A `RESOURCE_LIMIT` says something about the INPUT:
 * this molecule needs more work than the caller allowed. `SEARCH_ABORT` says something about the
 * SESSION: nobody is waiting for the answer any more. Collapsing them would make a cancelled
 * keystroke look like a pathological sequence in the telemetry, and would tempt a caller to
 * "retry with a bigger budget" for a search the user already walked away from.
 */
export function abortError() {
  const e = new Error('SEARCH_ABORT: search cancelled');
  e.code = SEARCH_ABORT;
  return e;
}
