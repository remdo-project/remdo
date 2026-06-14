export function isOAuthAuthorizeSearch(search: string): boolean {
  const params = new URLSearchParams(search);
  return params.has('client_id')
    && params.has('redirect_uri')
    && params.has('response_type');
}
