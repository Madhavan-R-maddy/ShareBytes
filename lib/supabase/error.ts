/**
 * Centralized Supabase & Network Error Utility for ShareBytes
 * 
 * Distinguishes between:
 * 1. Real API error responses from Supabase (e.g. "Invalid login credentials", "Email not confirmed")
 * 2. Network-level failures (fetch throws before receiving response due to ad-blockers, VPN, offline status, DNS failure, etc.)
 */

export const FRIENDLY_NETWORK_ERROR =
  "Couldn't reach the server. Please check your internet connection, disable any ad-blocker/VPN browser extensions, and try again.";

/**
 * Checks if an error is a network-level fetch failure rather than a server response.
 */
export function isNetworkError(error: any): boolean {
  if (!error) return false;

  const msg = (typeof error === 'string' ? error : error?.message || String(error)).toLowerCase();
  const name = error?.name || '';
  const status = error?.status;

  if (
    error instanceof TypeError ||
    status === 0 ||
    name === 'AuthRetryableFetchError' ||
    name === 'FetchError' ||
    name === 'AbortError' ||
    msg.includes('failed to fetch') ||
    msg.includes('fetch failed') ||
    msg.includes('networkerror') ||
    msg.includes('network error') ||
    msg.includes('err_') ||
    msg.includes('connection closed') ||
    msg.includes('connection refused') ||
    msg.includes('blocked by client') ||
    msg.includes('load failed') ||
    msg.includes('offline')
  ) {
    return true;
  }

  return false;
}

/**
 * Formats any Supabase or generic error into a clean, accurate, user-friendly error string.
 */
export function parseSupabaseError(error: any, fallbackMessage: string = 'An unexpected error occurred'): string {
  if (!error) return fallbackMessage;

  if (isNetworkError(error)) {
    return FRIENDLY_NETWORK_ERROR;
  }

  const rawMsg = error?.message || error?.error_description || (typeof error === 'string' ? error : null);
  const code = error?.code || error?.error;
  const msgLower = (rawMsg || '').toLowerCase();

  // Explicit handling for unconfirmed email accounts
  if (
    code === 'email_not_confirmed' ||
    msgLower.includes('email not confirmed') ||
    msgLower.includes('confirm your email') ||
    msgLower.includes('email link is invalid')
  ) {
    return 'Please confirm your email before logging in. Check your inbox for a confirmation link.';
  }

  return rawMsg || fallbackMessage;
}

