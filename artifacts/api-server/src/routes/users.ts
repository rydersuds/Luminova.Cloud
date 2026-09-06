import { createClerkClient } from "@clerk/backend";
import { getAuth } from "@clerk/express";
import { Router, type Request, type Response, type NextFunction } from "express";

const router = Router();
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
const ROLES = ["Admin", "Project Manager", "Field Team", "Client"] as const;

type AuthenticatedRequest = Request & { userId?: string };

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const auth = getAuth(req);
  const userId = auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  req.userId = userId;
  next();
}

async function ensureRole(userId: string) {
  const current = await clerk.users.getUser(userId);
  let role = current.publicMetadata.role as string | undefined;
  if (!role) {
    const users = await clerk.users.getUserList({ limit: 100 });
    const hasAdmin = users.data.some((user) => user.publicMetadata.role === "Admin");
    role = hasAdmin ? "Project Manager" : "Admin";
    await clerk.users.updateUserMetadata(userId, {
      publicMetadata: { ...current.publicMetadata, role },
    });
  }
  return role;
}

router.get("/users/me", async (req: AuthenticatedRequest, res) => {
  const role = await ensureRole(req.userId!);
  res.json({ userId: req.userId, role });
});

router.get("/users", async (req: AuthenticatedRequest, res) => {
  const role = await ensureRole(req.userId!);
  if (role !== "Admin") return res.status(403).json({ error: "Admin access required" });
  const result = await clerk.users.getUserList({ limit: 100, orderBy: "-created_at" });
  return res.json(result.data.map((user) => ({
    id: user.id,
    name: user.fullName || user.username || "Unnamed user",
    email: user.primaryEmailAddress?.emailAddress || "",
    role: user.publicMetadata.role || "Project Manager",
    createdAt: user.createdAt,
    lastSignInAt: user.lastSignInAt,
    imageUrl: user.imageUrl,
  })));
});

router.patch("/users/:userId/role", async (req: AuthenticatedRequest, res) => {
  const role = await ensureRole(req.userId!);
  if (role !== "Admin") return res.status(403).json({ error: "Admin access required" });
  const nextRole = req.body?.role;
  if (!ROLES.includes(nextRole)) return res.status(400).json({ error: "Invalid role" });
  const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const target = await clerk.users.getUser(userId);
  await clerk.users.updateUserMetadata(userId, {
    publicMetadata: { ...target.publicMetadata, role: nextRole },
  });
  return res.json({ id: target.id, role: nextRole });
});

export default router;