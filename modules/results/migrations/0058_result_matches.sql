CREATE TABLE IF NOT EXISTS result_matches (
  id bigint PRIMARY KEY,
  league text NOT NULL,
  round text NOT NULL DEFAULT '',
  home_team text NOT NULL,
  away_team text NOT NULL,
  home_score integer NOT NULL,
  away_score integer NOT NULL,
  start_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
)
