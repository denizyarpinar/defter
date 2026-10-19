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
    scope: string;          // space separated
    include_granted_scopes?: boolean;
    callback: (r: TokenResponse) => void;
    error_callback?: (e: ClientConfigError) => void;
  }

  // what requestAccessToken may change for one request
  interface OverridableTokenClientConfig {
    prompt?: '' | 'none' | 'consent' | 'select_account';
    login_hint?: string;
    scope?: string;
    include_granted_scopes?: boolean;   // the token also carries the scopes granted before
  }

  interface TokenClient {
    requestAccessToken(overrides?: OverridableTokenClientConfig): void;
  }

  function initTokenClient(config: TokenClientConfig): TokenClient;
  function hasGrantedAllScopes(r: TokenResponse, first: string, ...rest: string[]): boolean;
  function hasGrantedAnyScope(r: TokenResponse, first: string, ...rest: string[]): boolean;
  function revoke(accessToken: string, done?: () => void): void;
}

interface Window {
  google?: typeof google;
}
