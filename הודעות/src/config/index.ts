import dotenv from 'dotenv';
dotenv.config();

export const config = {
  db: {
    url: process.env.DATABASE_URL || 'postgresql://etsy_user:etsy_pass@localhost:5432/etsy_messages',
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
  adspower: {
    apiUrl: process.env.ADSPOWER_API_URL || 'http://local.adspower.net:50325',
    apiKey: process.env.ADSPOWER_API_KEY || '',
  },
  imap: {
    host: process.env.IMAP_HOST || 'imap.gmail.com',
    port: parseInt(process.env.IMAP_PORT || '993'),
    user: process.env.IMAP_USER || '',
    password: process.env.IMAP_PASSWORD || '',
  },
  api: {
    port: parseInt(process.env.API_PORT || '3500'),
    host: process.env.API_HOST || '0.0.0.0',
  },
  frontend: {
    url: process.env.FRONTEND_URL || 'http://localhost:3501',
  },
  ai: {
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  },
};
