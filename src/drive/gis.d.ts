// Minimal types for Google Identity Services (token model), loaded from accounts.google.com/gsi/client.
// https://developers.google.com/identity/oauth2/web/reference/js-reference

declare namespace google.accounts.oauth2 {
  interface TokenResponse {
    access_token: string;
    expires_in: number;     // seconds
    scope: string;
    error?: string;         // e.g. "access_denied"
    error_description?: string;
  }

  interface ClientConfigError {
    type: 'popup_failed_to_open' | 'popup_closed' | 'unknown';
    message: string;
  }

  interface TokenClientConfig {
    client_id: string;
    scope: string;
    callback: (r: TokenResponse) => void;
    error_callback?: (e: ClientConfigError) => void;
  }

  interface TokenClient {
    requestAccessToken(overrides?: { prompt?: '' | 'none' | 'consent' | 'select_account' }): void;
  }

  function initTokenClient(config: TokenClientConfig): TokenClient;
  function revoke(accessToken: string, done?: () => void): void;
}

interface Window {
  google?: typeof google;
}
