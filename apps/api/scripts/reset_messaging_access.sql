-- Reset messaging gate: only tenants already approved keep access; all others -> 'none'
UPDATE tenants SET messaging_access = 'none' WHERE messaging_access IS NULL OR messaging_access != 'approved';
