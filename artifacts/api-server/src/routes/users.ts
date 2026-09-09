import { createClerkClient, type Invitation, type User } from "@clerk/backend";
import { getAuth } from "@clerk/express";
import { pool } from "@workspace/db";
import {
  DeleteWorkspaceUserParams,
  GetWorkspaceInvitationsResponse,
  GetCurrentWorkspaceUserResponse,
  GetWorkspaceUsersResponse,
  InviteWorkspaceUserBody,
  InviteWorkspaceUserResponse,
  ResendWorkspaceInvitationParams,
  ResendWorkspaceInvitationResponse,
  RevokeWorkspaceInvitationParams,
  UpdateWorkspaceUserBody,
  UpdateWorkspaceUserParams,
  UpdateWorkspaceUserResponse,
} from "@workspace/api-zod";
import { Router, type Request, type Response, type NextFunction } from "express";

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
export const ROLES = ["Admin", "Project Manager", "Field Team", "Client"] as const;

type AuthenticatedRequest = Request & { userId?: string };
type ClerkError = {
  status?: number;
  errors?: Array<{ code?: string; message?: string; longMessage?: string }>;
};

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const auth = getAuth(req);
  const userId = auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  req.userId = userId;
  next();
}

function workspaceRole(user: User): (typeof ROLES)[number] {
  const role = user.publicMetadata.role;
  return ROLES.includes(role as (typeof ROLES)[number])
    ? role as (typeof ROLES)[number]
    : "Project Manager";
}

function serializeUser(user: User) {
  const firstName = user.firstName ?? "";
  const lastName = user.lastName ?? "";
  return {
    id: user.id,
    firstName,
    lastName,
    name: user.fullName || user.username || [firstName, lastName].filter(Boolean).join(" ") || "Unnamed user",
    email: user.primaryEmailAddress?.emailAddress || "",
    role: workspaceRole(user),
    createdAt: user.createdAt,
    lastSignInAt: user.lastSignInAt,
    imageUrl: user.imageUrl,
  };
}

function invitationRole(invitation: Invitation): (typeof ROLES)[number] {
  const role = invitation.publicMetadata?.role;
  return ROLES.includes(role as (typeof ROLES)[number])
    ? role as (typeof ROLES)[number]
    : "Project Manager";
}

function serializeInvitation(invitation: Invitation) {
  return {
    id: invitation.id,
    email: invitation.emailAddress,
    role: invitationRole(invitation),
    status: invitation.status,
    createdAt: invitation.createdAt,
  };
}

type ClerkClient = typeof clerk;
type AdminLock = <T>(operation: () => Promise<T>) => Promise<T>;

async function withWorkspaceAdminLock<T>(operation: () => Promise<T>): Promise<T> {
  const connection = await pool.connect();
  try {
    await connection.query("BEGIN");
    await connection.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["luminova-workspace-admin-role"]);
    const result = await operation();
    await connection.query("COMMIT");
    return result;
  } catch (error) {
    await connection.query("ROLLBACK");
    throw error;
  } finally {
    connection.release();
  }
}

async function ensureRole(client: ClerkClient, userId: string) {
  const current = await client.users.getUser(userId);
  let role = current.publicMetadata.role as string | undefined;
  if (!role) {
    const users = await client.users.getUserList({ limit: 100 });
    const hasAdmin = users.data.some((user) => workspaceRole(user) === "Admin");
    role = hasAdmin ? "Project Manager" : "Admin";
    await client.users.updateUserMetadata(userId, {
      publicMetadata: { ...current.publicMetadata, role },
    });
  }
  return role;
}

export async function requireWorkspaceRole(
  req: AuthenticatedRequest,
  res: Response,
  allowedRoles: readonly string[],
  errorMessage: string,
): Promise<boolean> {
  if (!req.userId) {
    res.status(401).json({ error: "Authentication required" });
    return false;
  }
  const role = await ensureRole(clerk, req.userId);
  if (allowedRoles.includes(role)) return true;
  res.status(403).json({ error: errorMessage });
  return false;
}

export async function workspaceUserDisplayName(userId: string): Promise<string> {
  const user = await clerk.users.getUser(userId);
  const firstName = user.firstName ?? "";
  const lastName = user.lastName ?? "";
  return user.fullName || user.username || [firstName, lastName].filter(Boolean).join(" ") || "Workspace user";
}

async function requireAdmin(client: ClerkClient, req: AuthenticatedRequest, res: Response): Promise<boolean> {
  const role = await ensureRole(client, req.userId!);
  if (role === "Admin") return true;
  res.status(403).json({ error: "Administrator access required" });
  return false;
}

async function isFinalAdmin(client: ClerkClient, target: User): Promise<boolean> {
  if (workspaceRole(target) !== "Admin") return false;
  const users = await client.users.getUserList({ limit: 100 });
  return users.data.filter((user) => workspaceRole(user) === "Admin").length <= 1;
}

export function clerkErrorResponse(error: unknown, fallback: string) {
  const clerkError = error as ClerkError;
  const detail = clerkError.errors?.[0];
  const code = detail?.code ?? "";
  const status = clerkError.status;
  if (status === 404) return { status: 404, error: fallback.includes("invitation") ? "Invitation not found" : "User not found" };
  if (status === 409 || code.includes("already") || code.includes("taken") || code.includes("exists")) {
    return { status: 409, error: detail?.longMessage || detail?.message || "That email address is already in use" };
  }
  return { status: 502, error: detail?.longMessage || detail?.message || fallback };
}

export function createUsersRouter(client: ClerkClient = clerk, withAdminLock: AdminLock = withWorkspaceAdminLock) {
const router = Router();

router.get("/users/me", async (req: AuthenticatedRequest, res): Promise<void> => {
  const role = await ensureRole(client, req.userId!);
  res.json(GetCurrentWorkspaceUserResponse.parse({ userId: req.userId, role }));
});

router.get("/users", async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!await requireAdmin(client, req, res)) return;
  const result = await client.users.getUserList({ limit: 100, orderBy: "-created_at" });
  res.json(GetWorkspaceUsersResponse.parse(result.data.map(serializeUser)));
});

router.get("/users/invitations", async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!await requireAdmin(client, req, res)) return;
  try {
    const result = await client.invitations.getInvitationList({
      status: "pending",
      limit: 100,
      orderBy: "-created_at",
    });
    res.json(GetWorkspaceInvitationsResponse.parse(result.data.map(serializeInvitation)));
  } catch (error) {
    const normalized = clerkErrorResponse(error, "Clerk could not list pending invitations");
    req.log.warn({ status: normalized.status }, "Clerk invitation listing failed");
    res.status(normalized.status).json({ error: normalized.error });
  }
});

router.post("/users/invitations", async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!await requireAdmin(client, req, res)) return;
  const parsed = InviteWorkspaceUserBody.safeParse({
    ...req.body,
    email: typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : req.body?.email,
  });
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a valid email address and workspace role" });
    return;
  }
  try {
    const invitation = await client.invitations.createInvitation({
      emailAddress: parsed.data.email.trim().toLowerCase(),
      publicMetadata: { role: parsed.data.role },
      notify: true,
      ignoreExisting: false,
    });
    res.status(201).json(InviteWorkspaceUserResponse.parse({
      id: invitation.id,
      email: invitation.emailAddress,
      role: parsed.data.role,
      status: invitation.status,
      createdAt: invitation.createdAt,
    }));
  } catch (error) {
    const normalized = clerkErrorResponse(error, "Clerk could not send the invitation");
    req.log.warn({ status: normalized.status }, "Clerk invitation failed");
    res.status(normalized.status).json({ error: normalized.error });
  }
});

router.post("/users/invitations/:invitationId/resend", async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!await requireAdmin(client, req, res)) return;
  const params = ResendWorkspaceInvitationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid invitation" });
    return;
  }
  try {
    const pending = await client.invitations.getInvitationList({
      status: "pending",
      query: params.data.invitationId,
      limit: 1,
    });
    const invitation = pending.data.find((candidate) => candidate.id === params.data.invitationId);
    if (!invitation) {
      res.status(404).json({ error: "Invitation not found" });
      return;
    }
    const replacement = await client.invitations.createInvitation({
      emailAddress: invitation.emailAddress,
      publicMetadata: { role: invitationRole(invitation) },
      notify: true,
      ignoreExisting: true,
    });
    try {
      await client.invitations.revokeInvitation(invitation.id);
    } catch (error) {
      try {
        await client.invitations.revokeInvitation(replacement.id);
      } catch (cleanupError) {
        req.log.warn({ status: (cleanupError as ClerkError).status }, "Replacement invitation cleanup failed");
      }
      throw error;
    }
    res.json(ResendWorkspaceInvitationResponse.parse(serializeInvitation(replacement)));
  } catch (error) {
    const normalized = clerkErrorResponse(error, "Clerk could not resend the invitation");
    req.log.warn({ status: normalized.status }, "Clerk invitation resend failed");
    res.status(normalized.status).json({ error: normalized.error });
  }
});

router.delete("/users/invitations/:invitationId", async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!await requireAdmin(client, req, res)) return;
  const params = RevokeWorkspaceInvitationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid invitation" });
    return;
  }
  try {
    await client.invitations.revokeInvitation(params.data.invitationId);
    res.status(204).send();
  } catch (error) {
    const normalized = clerkErrorResponse(error, "Clerk could not revoke the invitation");
    req.log.warn({ status: normalized.status }, "Clerk invitation revocation failed");
    res.status(normalized.status).json({ error: normalized.error });
  }
});

router.patch("/users/:userId", async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!await requireAdmin(client, req, res)) return;
  const params = UpdateWorkspaceUserParams.safeParse(req.params);
  const normalizedBody = req.body && typeof req.body === "object" ? { ...req.body } : req.body;
  if (typeof normalizedBody?.firstName === "string") normalizedBody.firstName = normalizedBody.firstName.trim();
  if (typeof normalizedBody?.lastName === "string") normalizedBody.lastName = normalizedBody.lastName.trim();
  if (typeof normalizedBody?.email === "string") normalizedBody.email = normalizedBody.email.trim().toLowerCase();
  const body = UpdateWorkspaceUserBody.safeParse(normalizedBody);
  const bodyKeys = req.body && typeof req.body === "object" ? Object.keys(req.body) : [];
  const supportedKeys = new Set(["firstName", "lastName", "email", "role"]);
  if (
    !params.success ||
    !body.success ||
    Object.keys(body.success ? body.data : {}).length === 0 ||
    bodyKeys.some((key) => !supportedKeys.has(key))
  ) {
    res.status(400).json({ error: "Enter a valid name, email address, and workspace role" });
    return;
  }

  try {
    const applyUpdate = async (initialTarget: User) => {
      let updatedTarget = initialTarget;
      if (body.data.firstName !== undefined || body.data.lastName !== undefined) {
        updatedTarget = await client.users.updateUser(updatedTarget.id, {
          firstName: body.data.firstName,
          lastName: body.data.lastName,
        });
      }
      if (body.data.email && body.data.email !== updatedTarget.primaryEmailAddress?.emailAddress.toLowerCase()) {
        await client.users.replaceUserEmailAddress(updatedTarget.id, { emailAddress: body.data.email });
        updatedTarget = await client.users.getUser(updatedTarget.id);
      }
      if (body.data.role) {
        updatedTarget = await client.users.updateUserMetadata(updatedTarget.id, {
          publicMetadata: { ...updatedTarget.publicMetadata, role: body.data.role },
        });
      }
      return updatedTarget;
    };

    let target: User | null;
    if (body.data.role) {
      target = await withAdminLock(async () => {
        const lockedTarget = await client.users.getUser(params.data.userId);
        if (body.data.role !== "Admin" && await isFinalAdmin(client, lockedTarget)) return null;
        return applyUpdate(lockedTarget);
      });
      if (!target) {
        res.status(403).json({ error: "The workspace must keep at least one administrator" });
        return;
      }
    } else {
      target = await applyUpdate(await client.users.getUser(params.data.userId));
    }
    res.json(UpdateWorkspaceUserResponse.parse(serializeUser(target)));
  } catch (error) {
    const normalized = clerkErrorResponse(error, "Clerk could not update this user");
    req.log.warn({ status: normalized.status }, "Clerk user update failed");
    res.status(normalized.status).json({ error: normalized.error });
  }
});

router.delete("/users/:userId", async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!await requireAdmin(client, req, res)) return;
  const params = DeleteWorkspaceUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid user" });
    return;
  }
  if (params.data.userId === req.userId) {
    res.status(403).json({ error: "You cannot delete your own account" });
    return;
  }
  try {
    const deleted = await withAdminLock(async () => {
      const target = await client.users.getUser(params.data.userId);
      if (await isFinalAdmin(client, target)) return false;
      await client.users.deleteUser(target.id);
      return true;
    });
    if (!deleted) {
      res.status(403).json({ error: "The workspace must keep at least one administrator" });
      return;
    }
    res.status(204).send();
  } catch (error) {
    const normalized = clerkErrorResponse(error, "Clerk could not delete this user");
    req.log.warn({ status: normalized.status }, "Clerk user deletion failed");
    res.status(normalized.status).json({ error: normalized.error });
  }
});

return router;
}

export default createUsersRouter();