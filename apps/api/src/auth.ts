import bcrypt from 'bcryptjs';
import type { NextFunction, Request, Response } from 'express';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { createHash, randomUUID } from 'node:crypto';
import { config } from './config.js';
import { pool, transaction, type DB } from './db.js';
import { AppError, type Identity, type Role, type User } from './model.js';
const issuer = 'fieldwork';
const audience = 'fieldwork-web';
export const refreshCookie = 'fieldwork_refresh';
const cookieOptions = {
  httpOnly: true,
  secure: config.NODE_ENV === 'production',
  sameSite: config.COOKIE_SAME_SITE,
  path: '/api/auth',
} as const;
const digest = (token: string) => createHash('sha256').update(token).digest('hex');
const unauthorized = () => new AppError(401, 'UNAUTHENTICATED', 'Please sign in to continue.');
export function verifyToken(token: string, secret: string, type: string): JwtPayload {
  try {
    const value = jwt.verify(token, secret, { algorithms: ['HS256'], issuer, audience });
    if (typeof value === 'string' || value.type !== type || !value.sub || !value.sid || !value.exp)
      throw unauthorized();
    return value;
  } catch {
    throw unauthorized();
  }
}
export async function identityFor(token: string): Promise<Identity> {
  const claims = verifyToken(token, config.JWT_ACCESS_SECRET, 'access');
  const row = (
    await pool.query<User>(
      `SELECT u.id,u.name,u.email,u.role,u.active FROM users u JOIN sessions s ON s.user_id=u.id
 WHERE s.id=$1 AND u.id=$2 AND u.active AND s.revoked_at IS NULL AND s.expires_at>now()`,
      [claims.sid, claims.sub],
    )
  ).rows[0];
  if (!row) throw unauthorized();
  return { ...row, session_id: claims.sid, exp: claims.exp! };
}
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw unauthorized();
    req.identity = await identityFor(header.slice(7));
    next();
  } catch (e) {
    next(e);
  }
}
export function allow(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!roles.includes(req.identity.role))
      return next(new AppError(403, 'FORBIDDEN', 'Your role cannot perform this action.'));
    next();
  };
}
async function issue(db: DB, user: User, sessionId: string, expires: Date) {
  const tokenId = randomUUID();
  const refresh = jwt.sign({ type: 'refresh', sid: sessionId }, config.JWT_REFRESH_SECRET, {
    algorithm: 'HS256',
    subject: user.id,
    jwtid: tokenId,
    issuer,
    audience,
    expiresIn: Math.max(1, Math.floor((expires.getTime() - Date.now()) / 1000)),
  });
  await db.query(
    'INSERT INTO refresh_tokens(id,session_id,token_hash,expires_at) VALUES ($1,$2,$3,$4)',
    [tokenId, sessionId, digest(refresh), expires],
  );
  const access = jwt.sign({ type: 'access', sid: sessionId }, config.JWT_ACCESS_SECRET, {
    algorithm: 'HS256',
    subject: user.id,
    issuer,
    audience,
    expiresIn: '15m',
  });
  return { accessToken: access, refresh, user, expires };
}
export function sendSession(res: Response, result: Awaited<ReturnType<typeof issue>>) {
  res.cookie(refreshCookie, result.refresh, { ...cookieOptions, expires: result.expires });
  res.json({ accessToken: result.accessToken, user: result.user });
}
export function clearSession(res: Response) {
  res.clearCookie(refreshCookie, cookieOptions);
}
export async function login(email: string, password: string) {
  const row = (
    await pool.query<User & { password_hash: string }>(
      'SELECT * FROM users WHERE email=$1 AND active',
      [email],
    )
  ).rows[0];
  if (!row || !(await bcrypt.compare(password, row.password_hash)))
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
  const { password_hash: _, ...user } = row;
  return transaction(async (db) => {
    const sid = randomUUID(),
      expires = new Date(Date.now() + 7 * 86400000);
    await db.query('INSERT INTO sessions(id,user_id,expires_at) VALUES ($1,$2,$3)', [
      sid,
      user.id,
      expires,
    ]);
    return issue(db, user, sid, expires);
  });
}
export async function rotate(token: string) {
  const claims = verifyToken(token, config.JWT_REFRESH_SECRET, 'refresh');
  const result = await transaction(async (db) => {
    const session = (await db.query('SELECT * FROM sessions WHERE id=$1 FOR UPDATE', [claims.sid]))
      .rows[0];
    if (!session || session.revoked_at || new Date(session.expires_at) <= new Date()) return null;
    const record = (
      await db.query(
        'SELECT * FROM refresh_tokens WHERE id=$1 AND session_id=$2 AND token_hash=$3',
        [claims.jti, claims.sid, digest(token)],
      )
    ).rows[0];
    if (!record || record.used_at) {
      await db.query('UPDATE sessions SET revoked_at=now() WHERE id=$1', [claims.sid]);
      return null;
    }
    const user = (
      await db.query<User>('SELECT id,name,email,role,active FROM users WHERE id=$1 AND active', [
        claims.sub,
      ])
    ).rows[0];
    if (!user) return null;
    await db.query('UPDATE refresh_tokens SET used_at=now() WHERE id=$1', [claims.jti]);
    return issue(db, user, claims.sid, new Date(session.expires_at));
  });
  if (!result) throw unauthorized();
  return result;
}
export async function logout(token: string | undefined) {
  if (!token) return undefined;
  try {
    const claims = verifyToken(token, config.JWT_REFRESH_SECRET, 'refresh');
    await pool.query('UPDATE sessions SET revoked_at=now() WHERE id=$1', [claims.sid]);
    return claims.sid as string;
  } catch {
    return undefined;
  }
}
