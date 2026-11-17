import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { nanoid } from 'nanoid';
import { config } from '../config.js';
import { authMiddleware } from '../middleware/auth.js';
import { AppError } from '../middleware/error-handler.js';
import { validatePassword } from '../utils/validate-password.js';

export const authRoutes: Router = Router();

function refreshExpiry(persistent: boolean): Date {
  const days = persistent ? config.refreshRememberDays : config.refreshSessionDays;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

authRoutes.post('/login', async (req: Request, res: Response, next) => {
  try {
    const { username, password } = req.body;
    // Default to "stay logged in" for older clients that don't send the flag
    const persistent = req.body.rememberMe !== false;
    if (!username || !password) throw new AppError(400, 'Username and password required');

    const prisma = req.app.locals.prisma;
    const user = await prisma.user.findUnique({ where: { username } });

    if (!user || !user.enabled) throw new AppError(401, 'Invalid credentials');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new AppError(401, 'Invalid credentials');

    const payload = { id: user.id, username: user.username, role: user.role };
    const accessToken = jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtAccessExpiry } as jwt.SignOptions);
    const refreshToken = crypto.randomBytes(64).toString('hex');
    const family = nanoid();
    const expiresAt = refreshExpiry(persistent);

    // Housekeeping: drop this user's expired refresh tokens
    await prisma.refreshToken.deleteMany({
      where: { userId: user.id, expiresAt: { lt: new Date() } },
    });

    await prisma.refreshToken.create({
      data: { token: refreshToken, userId: user.id, expiresAt, family, persistent },
    });

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    res.json({
      accessToken,
      refreshToken,
      rememberMe: persistent,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
      },
    });
  } catch (err) { next(err); }
});

authRoutes.post('/refresh', async (req: Request, res: Response, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) throw new AppError(400, 'Refresh token required');

    const prisma = req.app.locals.prisma;
    const stored = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });

    if (!stored) {
      // H5: Token not found — check if it was already used (reuse detection)
      const replaced = await prisma.refreshToken.findFirst({
        where: { replacedBy: refreshToken },
      });
      if (replaced) {
        // Reuse detected! Revoke entire token family
        console.warn(`[SECURITY] Refresh token reuse detected for user ${replaced.userId}. Revoking all tokens.`);
        await prisma.refreshToken.deleteMany({ where: { userId: replaced.userId } });
      }
      throw new AppError(401, 'Invalid refresh token');
    }

    if (stored.expiresAt < new Date() || !stored.user.enabled) {
      await prisma.refreshToken.delete({ where: { id: stored.id } });
      throw new AppError(401, 'Invalid refresh token');
    }

    // Rotate: mark old token as replaced, create new one in same family
    // Sliding expiry: an active session keeps getting extended
    const newRefreshToken = crypto.randomBytes(64).toString('hex');
    const expiresAt = refreshExpiry(stored.persistent);

    await prisma.refreshToken.update({
      where: { id: stored.id },
      data: { replacedBy: newRefreshToken },
    });

    await prisma.refreshToken.create({
      data: {
        token: newRefreshToken,
        userId: stored.userId,
        expiresAt,
        family: stored.family,
        persistent: stored.persistent,
      },
    });

    // Delete old token after creating new one
    await prisma.refreshToken.delete({ where: { id: stored.id } });

    const payload = { id: stored.user.id, username: stored.user.username, role: stored.user.role };
    const accessToken = jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtAccessExpiry } as jwt.SignOptions);

    res.json({ accessToken, refreshToken: newRefreshToken });
  } catch (err) { next(err); }
});

authRoutes.post('/logout', async (req: Request, res: Response, next) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      const prisma = req.app.locals.prisma;
      await prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
    }
    res.status(204).send();
  } catch (err) { next(err); }
});

authRoutes.get('/me', authMiddleware, async (req: Request, res: Response, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) throw new AppError(404, 'User not found');

    res.json({
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
      },
    });
  } catch (err) { next(err); }
});

authRoutes.put('/password', authMiddleware, async (req: Request, res: Response, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) throw new AppError(400, 'Both passwords required');

    const pwError = validatePassword(newPassword);
    if (pwError) throw new AppError(400, pwError);

    const prisma = req.app.locals.prisma;
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) throw new AppError(404, 'User not found');

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    // 400, not 401: a 401 makes the frontend think the session expired
    if (!valid) throw new AppError(400, 'Current password is incorrect');

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

    // Revoke all other sessions on password change, but keep the one making this request
    const keepToken = typeof req.body.refreshToken === 'string' ? req.body.refreshToken : undefined;
    await prisma.refreshToken.deleteMany({
      where: { userId: user.id, ...(keepToken && { token: { not: keepToken } }) },
    });

    res.status(204).send();
  } catch (err) { next(err); }
});
