import type { Request, Response, NextFunction } from "express";

export function adminOnly(req: Request, res: Response, next: NextFunction) {
  const adminId = process.env.ADMIN_USER_ID;
  const userId = req.header("x-user-id");

  if (!adminId) {
    return res.status(500).json({ error: "ADMIN_USER_ID no configurado" });
  }

  if (!userId) {
    return res.status(401).json({ error: "Falta x-user-id" });
  }

  if (userId !== adminId) {
    return res.status(403).json({ error: "Solo admin" });
  }

  next();
}
