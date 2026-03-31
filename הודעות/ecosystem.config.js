module.exports = {
  apps: [{
    name: 'etsy-messages',
    script: 'src/index.ts',
    interpreter: 'node',
    interpreter_args: '--loader ts-node/esm',
    cwd: 'C:\\etsy\\הודעות',
    env: {
      NODE_ENV: 'production',
    },
    watch: false,
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: 'C:\\etsy\\הודעות\\logs\\error.log',
    out_file: 'C:\\etsy\\הודעות\\logs\\out.log',
    merge_logs: true,
  }]
};
