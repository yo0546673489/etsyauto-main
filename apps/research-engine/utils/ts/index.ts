import dotenv from 'dotenv';
dotenv.config();

import { createModuleLogger } from './utils/logger';
import { testConnection } from './storage/database';
import { phase1_discovery, phase2_analysis, phase3_keywords, phase4_scoring } from './scheduler/scheduler';

const log = createModuleLogger('index');

const args = process.argv.slice(2);
const phase = args.find(a => a.startsWith('--phase'))?.replace('--phase', '') ?? null;
const runNow = args.includes('--now');

async function main() {
  log.info('=== Profix Research Engine ===');

  const connected = await testConnection();
  if (!connected) {
    log.error('Database connection failed. Run: npm run db:setup');
    process.exit(1);
  }

  if (runNow || phase === '1') await phase1_discovery();
  if (runNow || phase === '2') await phase2_analysis();
  if (runNow || phase === '3') await phase3_keywords();
  if (runNow || phase === '4') await phase4_scoring();

  if (!phase && !runNow) {
    log.info('Usage:');
    log.info('  ts-node src/index.ts --phase1    Phase 1: shop discovery');
    log.info('  ts-node src/index.ts --phase2    Phase 2: product analysis');
    log.info('  ts-node src/index.ts --phase3    Phase 3: keyword research');
    log.info('  ts-node src/index.ts --phase4    Phase 4: scoring + AI');
    log.info('  ts-node src/index.ts --now       Run all phases');
  }

  process.exit(0);
}

main().catch((err) => {
  log.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
