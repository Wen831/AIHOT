-- The showcase participation mode: a display-only source whose items read like a pool category
-- (own detail pages, /all?category=…), but never reach the daily report, the heat, selection or
-- grouping — e.g. a daily GitHub trending showcase. Backwards compatible: the default and the
-- existing three values are untouched.
ALTER TABLE sources DROP CONSTRAINT sources_participation_mode_check;
ALTER TABLE sources ADD CONSTRAINT sources_participation_mode_check
  CHECK (participation_mode IN ('editorial', 'hot_signal', 'isolated', 'showcase'));
