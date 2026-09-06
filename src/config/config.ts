export default () => ({
  port: parseInt(process.env.PORT || '9097', 10),
  node_env: process.env.NODE_ENV || 'development',

  security: {
    bcrypt_salt_rounds: parseInt(process.env.BCRYPT_SALT_ROUNDS || '12', 10),
  },

  auth: {
    // Both forms just in case
    max_sessions: parseInt(process.env.MAX_SESSIONS || '5', 10),
    max_login_attempts: parseInt(process.env.MAX_LOGIN_ATTEMPTS || '5', 10),
    lock_time_minutes: parseInt(process.env.LOCK_TIME_MINUTES || '12', 10),

    MAX_LOGIN_ATTEMPTS: parseInt(process.env.MAX_LOGIN_ATTEMPTS || '5', 10),
    OTP_TTL_SECONDS: parseInt(process.env.OTP_TTL_SECONDS || '60', 10),
    OTP_MAX_ATTEMPTS: parseInt(process.env.OTP_MAX_ATTEMPTS || '5', 10),
    ACCOUNT_LOCKOUT_MINUTES: parseInt(process.env.ACCOUNT_LOCKOUT_MINUTES || '12', 10),
  },

  jwt: {
    // lowercase config
    access_secret: process.env.JWT_ACCESS_SECRET,
    access_expires_in: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refresh_secret: process.env.JWT_REFRESH_SECRET,
    refresh_expires_in: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    refresh_ttl_days: parseInt(process.env.REFRESH_TOKEN_TTL_DAYS || '7', 10),
    issuer: process.env.JWT_ISSUER || 'webvixxen_auth_services',
    audience: process.env.JWT_AUDIENCE || 'webvixxen_web',

    // UPPERCASE config expected by token.service.ts
    JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET,
    JWT_ACCESS_EXPIRES_IN: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    JWT_ACCESS_EXPIRES_MS: parseInt(process.env.JWT_ACCESS_EXPIRES_MS || '900000', 10),
    JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
    JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    JWT_REFRESH_EXPIRES_MS: parseInt(process.env.JWT_REFRESH_EXPIRES_MS || '604800000', 10),
    REFRESH_TOKEN_TTL_DAYS: parseInt(process.env.REFRESH_TOKEN_TTL_DAYS || '7', 10),
    JWT_ISSUER: process.env.JWT_ISSUER || 'webvixxen_auth_services',
    JWT_AUDIENCE: process.env.JWT_AUDIENCE || 'webvixxen_web',
  },

  device: {
    MAX_DEVICES: parseInt(process.env.MAX_DEVICES || '3', 10),
  },

  redis: {
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    url: process.env.REDIS_URL,
  },

  loki: {
    enabled: process.env.LOKI_ENABLED === 'true',
    url: process.env.LOKI_URL,
  },

  mail: {
    MAIL_DRIVER: (process.env.MAIL_DRIVER || process.env.EMAIL_PROVIDER || 'nodemailer').toLowerCase(),
    MAIL_HOST: process.env.MAIL_HOST || process.env.SMTP_HOST,
    MAIL_PORT: parseInt(process.env.MAIL_PORT || process.env.SMTP_PORT || '587', 10),
    MAIL_USER: process.env.MAIL_USER || process.env.SMTP_USER,
    MAIL_PASS: process.env.MAIL_PASS || process.env.SMTP_PASS,
    MAIL_FROM: process.env.MAIL_FROM || process.env.SMTP_FROM,
    AWS_REGION: process.env.AWS_REGION || 'us-east-1',
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
  },

  frontend: {
    url: process.env.FRONTEND_URL || 'http://localhost:5173',
  },
});
