module.exports = {
  apps: [{
    name: 'etsy-messages',
    script: 'dist/index.js',
    interpreter: 'node',
    cwd: 'C:\\etsy\\הודעות',
    env_file: 'C:\\etsy\\הודעות\\.env',
    env: {
      NODE_ENV: 'production',
    },
    watch: false,
    autorestart: true,
    max_restarts: 20,
    min_uptime: '10s',
    restart_delay: 5000,
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: 'C:\\etsy\\הודעות\\logs\\error.log',
    out_file: 'C:\\etsy\\הודעות\\logs\\out.log',
    merge_logs: true,
  }]
};
