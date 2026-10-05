-- Measured GitHub repo state (stars, forks, language) of showcase items: the trending feed carries
-- only the README. Nullable jsonb, written by the showcase collection round; every other article
-- keeps it null.
ALTER TABLE articles ADD COLUMN IF NOT EXISTS showcase_stats jsonb;
