export function isAuthorized(provided: string | null, expected: string): boolean {
  return typeof provided === 'string' && provided.length > 0 && provided === expected;
}
