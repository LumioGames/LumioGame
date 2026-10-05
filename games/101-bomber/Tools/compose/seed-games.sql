-- This game's lobby catalog row for the engine release compose (games-seed runs it once the
-- Platform container has migrated the schema). Idempotent. The slug matches platform.env's
-- Platform__Allocations__bomber__* and the bundle directory games/bomber/.
INSERT INTO games (slug, name, summary, cover_url, status, bundle_dir, server_ws_url, subprotocol, contract_id, sort_order, created_at, updated_at)
VALUES ('bomber', 'Lumio Bomber', 'Lumio Bomber gameplay.', '/games/bomber/cover.svg', 'published', 'bomber', '', '', '', 1, now(), now())
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  summary = EXCLUDED.summary,
  cover_url = EXCLUDED.cover_url,
  status = EXCLUDED.status,
  bundle_dir = EXCLUDED.bundle_dir,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
