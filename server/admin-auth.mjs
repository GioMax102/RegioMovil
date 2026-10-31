import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { betterAuth } from 'better-auth';
import { twoFactor } from 'better-auth/plugins/two-factor';

export const ADMIN_ROLES = ['analyst', 'moderator', 'admin'];

export function adminOptionsFromEnv(env = process.env) {
  if (env.ADMIN_ENABLED !== 'true') return null;
  if (env.NODE_ENV === 'production' && env.ADMIN_ALLOW_INSECURE_LOCALHOST === 'true')
    throw new Error('ADMIN_ALLOW_INSECURE_LOCALHOST is forbidden in production.');
  return {
    origin: env.ADMIN_ORIGIN,
    secret: env.ADMIN_AUTH_SECRET,
    databasePath: env.ADMIN_DATABASE_PATH || resolve('.data/admin-auth.sqlite'),
    allowInsecureLocalhost: env.ADMIN_ALLOW_INSECURE_LOCALHOST === 'true',
  };
}

export function createAdminAuth({
  origin,
  secret,
  databasePath = ':memory:',
  allowInsecureLocalhost = false,
} = {}) {
  const parsed = new URL(origin);
  if (parsed.origin !== origin || parsed.username || parsed.password)
    throw new Error('ADMIN_ORIGIN must be an exact origin without path or credentials.');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  if (
    parsed.protocol !== 'https:' &&
    !(parsed.protocol === 'http:' && local && allowInsecureLocalhost)
  )
    throw new Error(
      'Administration requires HTTPS; HTTP is allowed only on explicitly enabled loopback development origins.',
    );
  if (typeof secret !== 'string' || Buffer.byteLength(secret) < 32)
    throw new Error('ADMIN_AUTH_SECRET requires at least 32 random bytes.');
  if (databasePath !== ':memory:')
    mkdirSync(dirname(resolve(databasePath)), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(databasePath);
  db.exec('PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON; PRAGMA secure_delete = ON;');
  if (databasePath !== ':memory:') chmodSync(databasePath, 0o600);
  const auth = betterAuth({
    appName: 'RegioMóvil Administración',
    baseURL: origin,
    basePath: '/api/admin/auth',
    secret,
    database: db,
    trustedOrigins: [origin],
    logger: { disabled: true },
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 15,
      maxPasswordLength: 128,
    },
    user: {
      additionalFields: {
        role: { type: 'string', required: true, defaultValue: 'analyst', input: false },
        disabled: { type: 'boolean', required: true, defaultValue: false, input: false },
      },
    },
    session: {
      expiresIn: 60 * 60,
      disableSessionRefresh: true,
      freshAge: 15 * 60,
      cookieCache: { enabled: false },
    },
    advanced: {
      useSecureCookies: parsed.protocol === 'https:',
      cookiePrefix: 'regiomovil-admin',
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: 'strict',
        path: '/api/admin',
        secure: parsed.protocol === 'https:',
      },
      // This header is inserted by our Node adapter from the socket; inbound
      // forwarding headers are never copied into Better Auth's request.
      ipAddress: { ipAddressHeaders: ['x-regiomovil-socket-ip'] },
    },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 50,
      storage: 'database',
      customRules: {
        '/sign-in/email': { window: 60, max: 5 },
        '/two-factor/*': { window: 60, max: 8 },
      },
    },
    plugins: [
      twoFactor({
        issuer: 'RegioMóvil Administración',
        twoFactorCookieMaxAge: 300,
        accountLockout: { enabled: true, maxFailedAttempts: 5, durationSeconds: 900 },
      }),
    ],
  });
  const ready = auth.$context.then(async (context) => {
    await context.runMigrations();
    db.exec(`CREATE TABLE IF NOT EXISTS admin_access_events (
      id INTEGER PRIMARY KEY, user_id TEXT, action TEXT NOT NULL, target_id TEXT, created_at TEXT NOT NULL
    ); CREATE INDEX IF NOT EXISTS admin_access_events_date ON admin_access_events(created_at);
    CREATE TABLE IF NOT EXISTS admin_session_assurance (session_id TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS admin_access_revision (id INTEGER PRIMARY KEY CHECK(id = 1), revision INTEGER NOT NULL CHECK(revision >= 0));
    INSERT OR IGNORE INTO admin_access_revision(id,revision) VALUES (1,0)`);
    if (
      !db
        .prepare('PRAGMA table_info(admin_access_events)')
        .all()
        .some((column) => column.name === 'target_id')
    )
      db.exec('ALTER TABLE admin_access_events ADD COLUMN target_id TEXT');
    return context;
  });
  let lastMaintenance = 0;
  function maintenance() {
    const timestamp = Date.now();
    if (timestamp - lastMaintenance < 60 * 60 * 1000) return;
    db.prepare('DELETE FROM admin_access_events WHERE created_at < ?').run(
      new Date(timestamp - 90 * 86400000).toISOString(),
    );
    db.prepare(
      'DELETE FROM admin_access_events WHERE id NOT IN (SELECT id FROM admin_access_events ORDER BY id DESC LIMIT 100000)',
    ).run();
    db.prepare('DELETE FROM session WHERE expiresAt <= ?').run(timestamp);
    db.prepare('DELETE FROM verification WHERE expiresAt <= ?').run(timestamp);
    db.prepare(
      'DELETE FROM admin_session_assurance WHERE expires_at <= ? OR session_id NOT IN (SELECT id FROM session)',
    ).run(timestamp);
    lastMaintenance = timestamp;
  }
  function audit(userId, action, targetId = null) {
    maintenance();
    db.prepare(
      'INSERT INTO admin_access_events(user_id,action,target_id,created_at) VALUES (?,?,?,?)',
    ).run(userId || null, action, targetId, new Date().toISOString());
  }
  async function session(headers) {
    await ready;
    maintenance();
    const result = await auth.api.getSession({
      headers,
      query: { disableCookieCache: true, disableRefresh: true },
    });
    if (!result || !ADMIN_ROLES.includes(result.user.role) || result.user.disabled) return null;
    return result;
  }
  const csrfToken = (current) =>
    createHmac('sha256', secret)
      .update(`admin-csrf:${current.session.id}:${current.session.token}`)
      .digest('base64url');
  function validCsrf(current, value) {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value)) return false;
    return timingSafeEqual(Buffer.from(value), Buffer.from(csrfToken(current)));
  }
  function mfaVerified(current) {
    db.prepare('DELETE FROM admin_session_assurance WHERE expires_at <= ?').run(Date.now());
    return (
      current.user.twoFactorEnabled === true &&
      !!db
        .prepare('SELECT session_id FROM admin_session_assurance WHERE session_id = ?')
        .get(current.session.id)
    );
  }
  function confirmMfa(current) {
    if (!current?.user.twoFactorEnabled) return;
    db.prepare(
      'INSERT OR REPLACE INTO admin_session_assurance(session_id,expires_at) VALUES (?,?)',
    ).run(current.session.id, new Date(current.session.expiresAt).getTime());
    audit(current.user.id, 'mfa_verified');
  }
  function accessRevision() {
    return db.prepare('SELECT revision FROM admin_access_revision WHERE id = 1').get().revision;
  }
  function revokeSession(sessionId) {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('DELETE FROM admin_session_assurance WHERE session_id = ?').run(sessionId);
      const result = db.prepare('DELETE FROM session WHERE id = ?').run(sessionId);
      db.exec('COMMIT');
      return result.changes > 0;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  return {
    auth,
    ready,
    origin,
    db,
    session,
    csrfToken,
    validCsrf,
    audit,
    mfaVerified,
    confirmMfa,
    maintenance,
    accessRevision,
    revokeSession,
    close() {
      db.close();
    },
    async provision({ email, name, role, password }) {
      if (!ADMIN_ROLES.includes(role))
        throw new RangeError('Role must be analyst, moderator or admin.');
      if (
        typeof email !== 'string' ||
        email.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      )
        throw new RangeError('A valid email is required.');
      if (
        typeof name !== 'string' ||
        !name.trim() ||
        name.length > 100 ||
        /[\u0000-\u001f\u007f]/.test(name)
      )
        throw new RangeError('A name of at most 100 characters is required.');
      if (typeof password !== 'string' || password.length < 15 || password.length > 128)
        throw new RangeError('Password length must be 15–128 characters.');
      const context = await ready;
      email = email.toLowerCase().trim();
      // Hash with Better Auth before opening a transaction. Never yield while
      // identity/account/audit changes share this synchronous SQLite connection.
      const hashedPassword = await context.password.hash(password);
      const id = context.generateId({ model: 'user' });
      const accountId = context.generateId({ model: 'account' });
      const timestamp = Date.now();
      db.exec('BEGIN IMMEDIATE');
      try {
        if (db.prepare('SELECT id FROM user WHERE email = ?').get(email))
          throw new Error('Account already exists.');
        // These columns belong to the pinned Better Auth SQLite schema. The
        // integration tests verify credentials through its API after CLI writes.
        db.prepare(
          'INSERT INTO user (id,name,email,emailVerified,createdAt,updatedAt,twoFactorEnabled,role,disabled) VALUES (?,?,?,1,?,?,0,?,0)',
        ).run(id, name.trim(), email, timestamp, timestamp, role);
        db.prepare(
          'INSERT INTO account (id,accountId,providerId,userId,password,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?)',
        ).run(accountId, id, 'credential', id, hashedPassword, timestamp, timestamp);
        db.prepare('UPDATE admin_access_revision SET revision = revision + 1 WHERE id = 1').run();
        audit(id, 'account_created');
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
      return { id, email, name: name.trim(), role };
    },
    async changeAccess(email, { role, disabled, resetMfa = false, password } = {}) {
      const context = await ready;
      if (role !== undefined && !ADMIN_ROLES.includes(role)) throw new RangeError('Invalid role.');
      if (disabled !== undefined && typeof disabled !== 'boolean')
        throw new RangeError('Disabled must be a boolean.');
      if (typeof resetMfa !== 'boolean') throw new RangeError('Reset MFA must be a boolean.');
      if (
        password !== undefined &&
        (typeof password !== 'string' || password.length < 15 || password.length > 128)
      )
        throw new RangeError('Password length must be 15–128 characters.');
      const hashedPassword =
        password === undefined ? undefined : await context.password.hash(password);
      db.exec('BEGIN IMMEDIATE');
      try {
        const user = db
          .prepare('SELECT id,email FROM user WHERE email = ?')
          .get(email.toLowerCase().trim());
        if (!user) throw new Error('Account not found.');
        const timestamp = Date.now();
        if (
          hashedPassword !== undefined &&
          db
            .prepare(
              'UPDATE account SET password = ?, updatedAt = ? WHERE userId = ? AND providerId = ?',
            )
            .run(hashedPassword, timestamp, user.id, 'credential').changes !== 1
        )
          throw new Error('Credential account not found.');
        db.prepare(
          'UPDATE user SET role = COALESCE(?,role), disabled = COALESCE(?,disabled), twoFactorEnabled = CASE WHEN ? THEN 0 ELSE twoFactorEnabled END, updatedAt = ? WHERE id = ?',
        ).run(
          role ?? null,
          disabled === undefined ? null : Number(disabled),
          Number(resetMfa),
          timestamp,
          user.id,
        );
        if (resetMfa) db.prepare('DELETE FROM twoFactor WHERE userId = ?').run(user.id);
        db.prepare(
          'DELETE FROM admin_session_assurance WHERE session_id IN (SELECT id FROM session WHERE userId = ?)',
        ).run(user.id);
        db.prepare('DELETE FROM session WHERE userId = ?').run(user.id);
        // Better Auth stores each unfinished MFA challenge's value as user id.
        db.prepare('DELETE FROM verification WHERE value = ?').run(user.id);
        db.prepare('UPDATE admin_access_revision SET revision = revision + 1 WHERE id = 1').run();
        audit(
          user.id,
          resetMfa
            ? 'mfa_reset_and_sessions_revoked'
            : password
              ? 'password_reset_and_sessions_revoked'
              : 'access_changed_and_sessions_revoked',
        );
        db.exec('COMMIT');
        return { id: user.id, email: user.email };
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  };
}
