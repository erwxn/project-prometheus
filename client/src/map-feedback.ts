/** Gives pending requests priority over an empty point array. */
export function mapFeedback(loading: boolean, error: string, count: number): 'loading' | 'error' | 'empty' | null {
  if (loading) return 'loading';
  if (error) return 'error';
  return count ? null : 'empty';
}
