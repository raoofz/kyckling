import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "محاولات كثيرة. يرجى الانتظار 15 دقيقة" },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
});

const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 100,
  message: { error: "طلبات كثيرة. يرجى الانتظار" },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
});

router.use(apiLimiter);

router.post("/auth/login", loginLimiter, async (req, res) => {
  const { username, password } = req.body as { username: string; password: string };
  if (!username || !password) {
    res.status(400).json({ error: "يرجى إدخال اسم المستخدم وكلمة المرور" });
    return;
  }
  if (typeof username !== "string" || typeof password !== "string") {
    res.status(400).json({ error: "بيانات غير صحيحة" });
    return;
  }
  if (username.length > 50 || password.length > 128) {
    res.status(400).json({ error: "بيانات غير صحيحة" });
    return;
  }
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.username, username.trim().toLowerCase()));
    if (!user) {
      logger.warn({ username: username.trim() }, "Failed login attempt - unknown user");
      res.status(401).json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة" });
      return;
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      logger.warn({ username: username.trim(), userId: user.id }, "Failed login attempt - wrong password");
      res.status(401).json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة" });
      return;
    }
    req.session.userId = user.id;
    req.session.role = user.role;
    req.session.name = user.name;
    // ── Save session explicitly before responding to prevent race condition ──
    req.session.save((err) => {
      if (err) {
        logger.error({ err }, "Session save failed on login");
        res.status(500).json({ error: "خطأ في حفظ الجلسة" });
        return;
      }
      logger.info({ username: user.username, userId: user.id, role: user.role }, "Successful login");
      res.json({ id: user.id, username: user.username, name: user.name, role: user.role });
    });
  } catch (err) {
    logger.error({ err }, "Login DB error");
    res.status(503).json({ error: "خطأ في الاتصال بقاعدة البيانات. يرجى المحاولة بعد قليل" });
  }
});

router.post("/auth/logout", (req, res) => {
  const userId = req.session.userId;
  req.session.destroy((err) => {
    if (err) logger.warn({ err, userId }, "Session destroy error");
    if (userId) logger.info({ userId }, "User logged out");
    res.clearCookie("kyckling.sid");
    res.json({ ok: true });
  });
});

router.post("/auth/change-password", async (req, res) => {
  if (!req.session.userId) {
    res.status(401).json({ error: "غير مسجل الدخول" });
    return;
  }
  const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };
  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: "يرجى إدخال كلمة المرور الحالية والجديدة" });
    return;
  }
  if (typeof currentPassword !== "string" || typeof newPassword !== "string") {
    res.status(400).json({ error: "بيانات غير صحيحة" });
    return;
  }
  if (newPassword.length < 4) {
    res.status(400).json({ error: "كلمة المرور الجديدة يجب أن تكون 4 أحرف على الأقل" });
    return;
  }
  if (newPassword.length > 128) {
    res.status(400).json({ error: "كلمة المرور طويلة جداً" });
    return;
  }
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.session.userId));
    if (!user) {
      res.status(404).json({ error: "المستخدم غير موجود" });
      return;
    }
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      logger.warn({ userId: req.session.userId }, "Failed password change - wrong current password");
      res.status(401).json({ error: "كلمة المرور الحالية غير صحيحة" });
      return;
    }
    const hash = await bcrypt.hash(newPassword, 10);
    await db.update(usersTable).set({ passwordHash: hash }).where(eq(usersTable.id, req.session.userId));
    logger.info({ userId: req.session.userId }, "Password changed successfully");
    res.json({ ok: true, message: "تم تغيير كلمة المرور بنجاح" });
  } catch (err) {
    logger.error({ err }, "Change password DB error");
    res.status(503).json({ error: "خطأ في الاتصال بقاعدة البيانات. يرجى المحاولة بعد قليل" });
  }
});

// ── Update Profile (name + username) ─────────────────────────────────────────
router.put("/auth/profile", async (req, res) => {
  if (!req.session.userId) {
    res.status(401).json({ error: "غير مسجل الدخول" });
    return;
  }
  const { name, username } = req.body as { name?: string; username?: string };
  if (!name && !username) {
    res.status(400).json({ error: "يرجى إدخال البيانات المراد تغييرها" });
    return;
  }
  if (name && (typeof name !== "string" || name.trim().length < 2 || name.trim().length > 100)) {
    res.status(400).json({ error: "الاسم يجب أن يكون بين 2 و 100 حرف" });
    return;
  }
  if (username && (typeof username !== "string" || username.trim().length < 3 || username.trim().length > 50)) {
    res.status(400).json({ error: "اسم المستخدم يجب أن يكون بين 3 و 50 حرف" });
    return;
  }
  if (username && !/^[a-zA-Z0-9_]+$/.test(username.trim())) {
    res.status(400).json({ error: "اسم المستخدم يجب أن يحتوي فقط على حروف إنجليزية وأرقام و _" });
    return;
  }
  try {
    if (username) {
      const [existing] = await db.select().from(usersTable).where(eq(usersTable.username, username.trim().toLowerCase()));
      if (existing && existing.id !== req.session.userId) {
        res.status(400).json({ error: "اسم المستخدم مستخدم بالفعل" });
        return;
      }
    }
    const updateData: Partial<{ name: string; username: string }> = {};
    if (name) updateData.name = name.trim();
    if (username) updateData.username = username.trim().toLowerCase();

    await db.update(usersTable).set(updateData).where(eq(usersTable.id, req.session.userId));

    if (name) req.session.name = name.trim();

    const [updated] = await db.select().from(usersTable).where(eq(usersTable.id, req.session.userId));
    logger.info({ userId: req.session.userId, updateData }, "Profile updated");
    res.json({ ok: true, user: { id: updated.id, username: updated.username, name: updated.name, role: updated.role } });
  } catch (err) {
    logger.error({ err }, "Profile update DB error");
    res.status(503).json({ error: "خطأ في الاتصال بقاعدة البيانات. يرجى المحاولة بعد قليل" });
  }
});

router.get("/auth/me", async (req, res) => {
  if (!req.session.userId) {
    res.status(401).json({ error: "غير مسجل الدخول" });
    return;
  }
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.session.userId));
    if (!user) {
      req.session.destroy(() => {});
      res.status(401).json({ error: "المستخدم غير موجود" });
      return;
    }
    res.json({ id: user.id, username: user.username, name: user.name, role: user.role });
  } catch (err) {
    logger.error({ err }, "Auth me DB error");
    res.status(503).json({ error: "خطأ في الاتصال بقاعدة البيانات" });
  }
});

export default router;
