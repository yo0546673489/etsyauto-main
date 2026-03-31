/**
 * Creates discount_rules table and marks Alembic migration as applied.
 * Also updates Node.js migration SQL to not create discount_tasks (avoids future conflicts).
 */
const { Client } = require('C:\\Users\\Administrator\\Desktop\\קלוד\\node_modules\\ssh2');
const fs = require('fs');
const path = require('path');

const SSH = { host: '185.241.4.225', port: 22, username: 'root', password: 'aA@05466734890', readyTimeout: 20000 };

function sshExec(conn, cmd, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    let output = '';
    conn.exec(cmd, (err, stream) => {
      if (err) { reject(err); return; }
      stream.on('data', d => { process.stdout.write(d); output += d.toString(); });
      stream.stderr.on('data', d => { process.stderr.write(d); output += d.toString(); });
      stream.on('close', () => resolve(output));
    });
    setTimeout(() => reject(new Error('Exec timeout')), timeoutMs);
  });
}

const CREATE_DISCOUNT_RULES_SQL = `
-- Create discount_rules if not exists
CREATE TABLE IF NOT EXISTS discount_rules (
    id SERIAL PRIMARY KEY,
    shop_id BIGINT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    discount_type VARCHAR(50) NOT NULL,
    discount_value FLOAT NOT NULL,
    scope VARCHAR(50) NOT NULL DEFAULT 'entire_shop',
    listing_ids JSON,
    category_id VARCHAR(100),
    is_scheduled BOOLEAN NOT NULL DEFAULT FALSE,
    schedule_type VARCHAR(50),
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    rotation_config JSON,
    target_country VARCHAR(100) DEFAULT 'everywhere',
    terms_text VARCHAR(500),
    etsy_sale_name VARCHAR(200),
    status VARCHAR(50) NOT NULL DEFAULT 'draft',
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_discount_rules_shop_id ON discount_rules(shop_id);

-- Mark Alembic migration as applied (to avoid Alembic trying to create it again)
INSERT INTO alembic_version (version_num) VALUES ('ec1e8d4b1e8e') ON CONFLICT DO NOTHING;
`;

async function main() {
  const conn = new Client();
  await new Promise((res, rej) => conn.on('ready', res).on('error', rej).connect(SSH));
  console.log('SSH connected\n');

  // Step 1: Create discount_rules via direct SQL
  console.log('[1] Creating discount_rules table...');
  const b64 = Buffer.from(CREATE_DISCOUNT_RULES_SQL, 'utf8').toString('base64');
  const r1 = await sshExec(conn, `printf '%s' '${b64}' | base64 -d | docker exec -i etsy-db psql -U postgres -d etsy_platform 2>&1`);
  console.log('Result:', r1);

  // Step 2: Verify tables
  console.log('\n[2] Verifying tables...');
  const r2 = await sshExec(conn, `
    docker exec etsy-db psql -U postgres -d etsy_platform -c "
      SELECT table_name FROM information_schema.tables
      WHERE table_schema='public' AND table_name LIKE 'discount%'
      ORDER BY table_name;
    " 2>&1
  `);
  console.log(r2);

  // Step 3: Check alembic_version
  const r3 = await sshExec(conn, `
    docker exec etsy-db psql -U postgres -d etsy_platform -c "SELECT version_num FROM alembic_version ORDER BY version_num;" 2>&1
  `);
  console.log('Alembic versions:', r3);

  conn.end();
  console.log('\nDone!');
}
main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
