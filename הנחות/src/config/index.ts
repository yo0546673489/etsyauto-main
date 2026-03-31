import dotenv from 'dotenv';
dotenv.config();

export const config = {
  db: {
    url: process.env.DATABASE_URL || 'postgresql://postgres:postgres_dev_password@185.241.4.225:5433/etsy_messages',
  },
  platformDb: {
    url: process.env.PLATFORM_DATABASE_URL || 'postgresql://postgres:postgres_dev_password@185.241.4.225:5433/etsy_platform',
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://185.241.4.225:6380',
  },
  adspower: {
    apiUrl: process.env.ADSPOWER_API_URL || 'http://127.0.0.1:50325',
    apiKey: process.env.ADSPOWER_API_KEY || '',
  },
  api: {
    port: parseInt(process.env.API_PORT || '3510'),
    host: process.env.API_HOST || '0.0.0.0',
  },
};
