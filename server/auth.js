import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import db from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'roost-dev-secret-change-me';
const TOKEN_TTL = '7d';

export function hashPassword(plain) {
  return bcrypt.hashSync(plain, 10);
}

export function verifyPassword(plain, hash) {
  return bcrypt.compareSync(plain, hash);
}

export function signToken(user) {
  return jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, {
    expiresIn: TOKEN_TTL,
  });
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

// Express middleware: requires a valid Bearer token.
export function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const payload = token && verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'Не авторизован' });

  const user = db.prepare('SELECT id, username, avatar, is_banned, is_admin FROM users WHERE id = ?').get(payload.id);
  if (!user) return res.status(401).json({ error: 'Пользователь не найден' });
  if (user.is_banned) return res.status(403).json({ error: 'Аккаунт заблокирован' });

  req.user = { id: user.id, username: user.username, avatar: user.avatar, is_admin: !!user.is_admin };
  next();
}

// Middleware: requires the current user to be a site administrator.
export function adminRequired(req, res, next) {
  if (!req.user || !req.user.is_admin) return res.status(403).json({ error: 'Только для администратора' });
  next();
}
