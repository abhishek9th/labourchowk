// Sample ("previous works") photos are not stored in Supabase Storage: the sample seed points at fixed file names
// and the clients show the trade's bundled photo instead. See supabase/seed_portfolio_reviews.sql.
const SLUGS = ['mason', 'plumber', 'electrician', 'painter', 'carpenter', 'tile-flooring', 'welder', 'construction-helper', 'pop-false-ceiling', 'ac-appliance', 'cleaner', 'other']
const SAMPLE = /\/5a3b1e00-0000-4000-8000-0000000000(\d\d)\.jpg$/

/** Slug of the trade whose bundled photo stands in for this sample image path, or null for a real upload. */
export function sampleSlug(path: string): string | null {
  const m = SAMPLE.exec(path)
  return m ? SLUGS[Number(m[1]) - 1] ?? 'other' : null
}
