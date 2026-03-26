-- Run once on existing databases that predate the messaging_access column.
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS messaging_access VARCHAR(20) NOT NULL DEFAULT 'none';

ALTER TABLE tenants
  DROP CONSTRAINT IF EXISTS ck_tenants_messaging_access;

ALTER TABLE tenants
  ADD CONSTRAINT ck_tenants_messaging_access
  CHECK (messaging_access IN ('none', 'pending', 'approved', 'denied'));
