import { createClerkClient, type Invitation, type User } from "@clerk/backend";
import { getAuth } from "@clerk/express";
import { clientAccessCleanupTable, clientMembersTable, clientsTable, db, pool } from "@workspace/db";
import {
  CreateClientBody,
  CreateClientResponse,
  RequestClientLogoUploadBody,
  RequestClientLogoUploadParams,
  RequestClientLogoUploadResponse,
  AttachClientLogoBody,
  AttachClientLogoParams,
  AttachClientLogoResponse,
  ClearClientLogoParams,
  ClearClientLogoResponse,
  DeleteClientParams,
  GetClientsResponse,
  DeleteWorkspaceUserParams,
  GetWorkspaceInvitationsResponse,
  GetCurrentWorkspaceUserResponse,
  GetWorkspaceUsersResponse,
  GrantClientAccessBody,
  GrantClientAccessParams,
  InviteWorkspaceUserBody,
  InviteWorkspaceUserResponse,
  RevokeClientAccessParams,
  ResendWorkspaceInvitationParams,
  ResendWorkspaceInvitationResponse,
  RevokeWorkspaceInvitationParams,
  UpdateWorkspaceUserBody,
  UpdateWorkspaceUserParams,
  UpdateWorkspaceUserResponse,
} from "@workspace/api-zod";
import { Router, type Request, type Response, type NextFunction } from "express";
import { and, asc, eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { WEIDNER_CLIENT_NAME } from "../lib/partyClassification";
import { ObjectStorageService } from "../lib/objectStorage";

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
export const ROLES = ["Admin", "Project Manager", "Field Team", "Client"] as const;

export const CLIENT_MEMBER_PROFILE_LOOKUP_CONCURRENCY = 8;
type AuthenticatedRequest = Request & { userId?: string };
type ClerkError = {
  status?: number;
  errors?: Array<{ code?: string; message?: string; longMessage?: string }>;
};
class ClientMemberProfileLookupError extends Error {
  constructor(public readonly clerkError: ClerkError) {
    super("Unable to load client member profiles");
    this.name = "ClientMemberProfileLookupError";
  }
}

function postgresErrorCode(error: unknown): string | undefined {
  const candidate = error as { code?: unknown; cause?: { code?: unknown } };
  if (typeof candidate.code === "string") return candidate.code;
  return typeof candidate.cause?.code === "string" ? candidate.cause.code : undefined;
}
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
    clientAccessCleanupPending: false,
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

function workspaceId(req: AuthenticatedRequest) {
  return getAuth(req).orgId || "default";
}

function clientLogoUrl(objectPath: string | null) {
  return objectPath ? `/api/storage${objectPath}` : null;
}

async function resolveClientMemberUsers(client: ClerkClient, memberUserIds: string[]) {
  const usersById = new Map<string, User>();
  let profileLookupError: ClerkError | undefined;
  let nextUserIndex = 0;

  async function resolveNextUser(): Promise<void> {
    while (true) {
      const userIndex = nextUserIndex++;
      if (userIndex >= memberUserIds.length) return;

      const userId = memberUserIds[userIndex];
      try {
        usersById.set(userId, await client.users.getUser(userId));
      } catch (error) {
        const clerkError = error as ClerkError;
        if (clerkError.status !== 404 && !profileLookupError) profileLookupError = clerkError;
      }
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(CLIENT_MEMBER_PROFILE_LOOKUP_CONCURRENCY, memberUserIds.length) },
      () => resolveNextUser(),
    ),
  );
  if (profileLookupError) throw new ClientMemberProfileLookupError(profileLookupError);
  return usersById;
}
async function serializeClients(client: ClerkClient, scope: string, clientId?: string) {
  const records = await db
    .select()
    .from(clientsTable)
    .where(clientId
      ? and(eq(clientsTable.id, clientId), eq(clientsTable.workspaceId, scope))
      : eq(clientsTable.workspaceId, scope))
    .orderBy(asc(clientsTable.name));
  if (!records.length) return [];

  const memberships = await db
    .select()
    .from(clientMembersTable)
    .where(inArray(clientMembersTable.clientId, records.map((record) => record.id)));
  const memberUserIds = [...new Set(memberships.map((membership) => membership.userId))];
  const usersById = await resolveClientMemberUsers(client, memberUserIds);

  return records.map((record) => ({
    id: record.id,
    name: record.name,
    logoUrl: clientLogoUrl(record.logoObjectPath),
    createdAt: record.createdAt.getTime(),
    members: memberships
      .filter((membership) => membership.clientId === record.id)
      .map((membership) => {
        const user = usersById.get(membership.userId);
        // A deleted or otherwise unresolvable Clerk user has no profile to serialize.
        // Omit only that stale membership; other memberships remain visible.
        if (!user) return null;
        return {
          id: membership.id,
          userId: user.id,
          name: user.fullName || user.username || [user.firstName, user.lastName].filter(Boolean).join(" ") || "Unnamed user",
          email: user.primaryEmailAddress?.emailAddress || "",
          imageUrl: user.imageUrl,
          role: workspaceRole(user),
          addedAt: membership.createdAt.getTime(),
        };
      })
      .filter((member): member is NonNullable<typeof member> => Boolean(member)),
  }));
}

async function ensureKnownClients(scope: string, createdBy: string) {
  await db.insert(clientsTable).values({
    id: randomUUID(),
    workspaceId: scope,
    name: WEIDNER_CLIENT_NAME,
    createdBy,
  }).onConflictDoNothing({
    target: [clientsTable.workspaceId, clientsTable.name],
  });
}

export async function revokeClientMemberships(userId: string, scope: string) {
  const clients = await db
    .select({ id: clientsTable.id })
    .from(clientsTable)
    .where(eq(clientsTable.workspaceId, scope));
  if (!clients.length) return;

  await db.delete(clientMembersTable).where(and(
    eq(clientMembersTable.userId, userId),
    inArray(clientMembersTable.clientId, clients.map((client) => client.id)),
  ));
}
async function markClientAccessCleanup(userId: string, scope: string) {
  await clearClientAccessCleanup(userId, scope);
  await db.insert(clientAccessCleanupTable).values({ workspaceId: scope, userId });
}
async function clearClientAccessCleanup(userId: string, scope: string) {
  await db.delete(clientAccessCleanupTable).where(and(
    eq(clientAccessCleanupTable.userId, userId),
    eq(clientAccessCleanupTable.workspaceId, scope),
  ));
}
async function deleteClientMemberships(userId: string) {
  await db.delete(clientMembersTable).where(eq(clientMembersTable.userId, userId));
}
type ClerkClient = typeof clerk;
type AdminLock = <T>(operation: () => Promise<T>) => Promise<T>;
export type RevokeClientMemberships = (userId: string, scope: string) => Promise<void>;
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

async function listAllWorkspaceUsers(client: ClerkClient): Promise<User[]> {
  const limit = 100;
  const users: User[] = [];
  let offset = 0;

  while (true) {
    const result = await client.users.getUserList({
      limit,
      offset,
      orderBy: "-created_at",
    });
    users.push(...result.data);
    if (result.data.length < limit || users.length >= result.totalCount) break;
    offset += result.data.length;
  }

  return users;
}

async function deleteObjectQuietly(storage: ObjectStorageService, objectPath: string | null | undefined, log: Request["log"]) {
  if (!objectPath) return;
  try {
    await storage.deleteObject(objectPath);
  } catch (error) {
    log.warn({ err: error, objectPath }, "Client logo object cleanup failed");
  }
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

export function createUsersRouter(
  client: ClerkClient = clerk,
  withAdminLock: AdminLock = withWorkspaceAdminLock,
  revokeMemberships: RevokeClientMemberships = revokeClientMemberships,
  logoStorage: ObjectStorageService = new ObjectStorageService(),
) {
const router = Router();

router.get("/users/me", async (req: AuthenticatedRequest, res): Promise<void> => {
  const role = await ensureRole(client, req.userId!);
  res.json(GetCurrentWorkspaceUserResponse.parse({ userId: req.userId, role }));
});

router.get("/users", async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!await requireAdmin(client, req, res)) return;
  const users = await listAllWorkspaceUsers(client);
  const pendingCleanup = await db.select({ userId: clientAccessCleanupTable.userId })
    .from(clientAccessCleanupTable)
    .where(eq(clientAccessCleanupTable.workspaceId, workspaceId(req)));
  const pendingUserIds = new Set(pendingCleanup.map(({ userId }) => userId));
  res.json(GetWorkspaceUsersResponse.parse(users.map((user) => ({
    ...serializeUser(user),
    clientAccessCleanupPending: pendingUserIds.has(user.id),
  }))));
});

router.post("/users/:userId/client-access-reconciliation", async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!await requireAdmin(client, req, res)) return;
  const params = UpdateWorkspaceUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid user" });
    return;
  }
  try {
    await withAdminLock(async () => {
      await client.users.getUser(params.data.userId);
      await revokeClientMemberships(params.data.userId, workspaceId(req));
      await clearClientAccessCleanup(params.data.userId, workspaceId(req));
    });
    res.status(204).send();
  } catch (error) {
    if ((error as ClerkError).status === 404) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    req.log.error({ error }, "Client access reconciliation failed");
    res.status(503).json({ error: "Client access cleanup failed again. Try reconciling this user again." });
  }
});

router.get("/clients", async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!await requireAdmin(client, req, res)) return;
  try {
    const scope = workspaceId(req);
    await ensureKnownClients(scope, req.userId!);
    res.json(GetClientsResponse.parse(await serializeClients(client, scope)));
  } catch (error) {
    if (error instanceof ClientMemberProfileLookupError) {
      const normalized = clerkErrorResponse(error.clerkError, error.message);
      req.log.warn({ status: normalized.status }, "Client member profile lookup failed");
      res.status(normalized.status).json({ error: normalized.error });
      return;
    }
    req.log.error({ error }, "Client organization listing failed");
    res.status(500).json({ error: "Unable to load client organizations" });
  }
});

router.post("/clients", async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!await requireAdmin(client, req, res)) return;
  const body = CreateClientBody.safeParse({
    ...req.body,
    name: typeof req.body?.name === "string" ? req.body.name.trim() : req.body?.name,
  });
  if (!body.success) {
    res.status(400).json({ error: "Enter a client name" });
    return;
  }

  try {
    const record = await db.insert(clientsTable).values({
      id: randomUUID(),
      workspaceId: workspaceId(req),
      name: body.data.name,
      createdBy: req.userId!,
    }).returning();
    const created = await serializeClients(client, workspaceId(req), record[0].id);
    res.status(201).json(CreateClientResponse.parse(created[0]));
  } catch (error) {
    if (postgresErrorCode(error) === "23505") {
      res.status(409).json({ error: "A client with that name already exists" });
      return;
    }
    req.log.error({ error }, "Client organization creation failed");
    res.status(500).json({ error: "Unable to create the client organization" });
  }
});

  router.post("/clients/:clientId/logo-upload", async (req: AuthenticatedRequest, res): Promise<void> => {
    if (!await requireAdmin(client, req, res)) return;
    const params = RequestClientLogoUploadParams.safeParse(req.params);
    const body = RequestClientLogoUploadBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Choose a JPEG, PNG, or WebP logo up to 8 MB." });
      return;
    }
    const scope = workspaceId(req);
    const [record] = await db.select().from(clientsTable).where(and(
      eq(clientsTable.id, params.data.clientId),
      eq(clientsTable.workspaceId, scope),
    )).limit(1);
    if (!record) {
      res.status(404).json({ error: "Client not found" });
      return;
    }

    let objectPath: string | undefined;
    try {
      const uploadURL = await logoStorage.getObjectEntityUploadURL();
      objectPath = logoStorage.normalizeObjectEntityPath(uploadURL);
      await db.update(clientsTable)
        .set({ pendingLogoObjectPath: objectPath })
        .where(and(eq(clientsTable.id, record.id), eq(clientsTable.workspaceId, scope)));
      await deleteObjectQuietly(logoStorage, record.pendingLogoObjectPath, req.log);
      res.json(RequestClientLogoUploadResponse.parse({
        uploadURL,
        objectPath,
        metadata: body.data,
      }));
    } catch (error) {
      await deleteObjectQuietly(logoStorage, objectPath, req.log);
      req.log.error({ err: error }, "Client logo upload URL generation failed");
      res.status(500).json({ error: "The client logo upload could not be started." });
    }
  });

  router.put("/clients/:clientId/logo", async (req: AuthenticatedRequest, res): Promise<void> => {
    if (!await requireAdmin(client, req, res)) return;
    const params = AttachClientLogoParams.safeParse(req.params);
    const body = AttachClientLogoBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "The uploaded client logo is invalid." });
      return;
    }
    const scope = workspaceId(req);
    const [record] = await db.select().from(clientsTable).where(and(
      eq(clientsTable.id, params.data.clientId),
      eq(clientsTable.workspaceId, scope),
    )).limit(1);
    if (!record) {
      res.status(404).json({ error: "Client not found" });
      return;
    }
    if (record.pendingLogoObjectPath !== body.data.objectPath) {
      res.status(400).json({ error: "Request a new client logo upload before saving it." });
      return;
    }

    try {
      await logoStorage.verifyClientLogo(body.data.objectPath);
      await logoStorage.setAcl(body.data.objectPath, {
        owner: req.userId!,
        visibility: "private",
        workspaceId: scope,
      });
    } catch (error) {
      await deleteObjectQuietly(logoStorage, body.data.objectPath, req.log);
      await db.update(clientsTable).set({ pendingLogoObjectPath: null }).where(and(
        eq(clientsTable.id, record.id),
        eq(clientsTable.workspaceId, scope),
        eq(clientsTable.pendingLogoObjectPath, body.data.objectPath),
      ));
      req.log.error({ err: error }, "Client logo attachment failed");
      res.status(500).json({ error: "The client logo could not be saved." });
      return;
    }

    let committed: { logoObjectPath: string | null } | undefined;
    try {
      [committed] = await db.update(clientsTable).set({
        logoObjectPath: body.data.objectPath,
        pendingLogoObjectPath: null,
      }).where(and(
        eq(clientsTable.id, record.id),
        eq(clientsTable.workspaceId, scope),
        eq(clientsTable.pendingLogoObjectPath, body.data.objectPath),
      )).returning({ logoObjectPath: clientsTable.logoObjectPath });
    } catch (error) {
      await deleteObjectQuietly(logoStorage, body.data.objectPath, req.log);
      req.log.error({ err: error }, "Client logo database update failed");
      res.status(500).json({ error: "The client logo could not be saved." });
      return;
    }

    if (!committed) {
      const [current] = await db.select({ logoObjectPath: clientsTable.logoObjectPath })
        .from(clientsTable)
        .where(and(eq(clientsTable.id, record.id), eq(clientsTable.workspaceId, scope)))
        .limit(1);
      if (current?.logoObjectPath !== body.data.objectPath) {
        await deleteObjectQuietly(logoStorage, body.data.objectPath, req.log);
      }
      res.status(409).json({ error: "A newer client logo upload replaced this one." });
      return;
    }

    await deleteObjectQuietly(logoStorage, record.logoObjectPath, req.log);
    try {
      const [updated] = await serializeClients(client, scope, record.id);
      res.json(AttachClientLogoResponse.parse(updated));
    } catch (error) {
      req.log.error({ err: error }, "Client logo saved but response serialization failed");
      res.status(500).json({ error: "The client logo was saved, but the client details could not be refreshed." });
    }
  });

  router.delete("/clients/:clientId/logo", async (req: AuthenticatedRequest, res): Promise<void> => {
    if (!await requireAdmin(client, req, res)) return;
    const params = ClearClientLogoParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid client" });
      return;
    }
    const scope = workspaceId(req);
    const [record] = await db.select().from(clientsTable).where(and(
      eq(clientsTable.id, params.data.clientId),
      eq(clientsTable.workspaceId, scope),
    )).limit(1);
    if (!record) {
      res.status(404).json({ error: "Client not found" });
      return;
    }
    await db.update(clientsTable).set({
      logoObjectPath: null,
      pendingLogoObjectPath: null,
    }).where(and(eq(clientsTable.id, record.id), eq(clientsTable.workspaceId, scope)));
    await deleteObjectQuietly(logoStorage, record.logoObjectPath, req.log);
    if (record.pendingLogoObjectPath !== record.logoObjectPath) {
      await deleteObjectQuietly(logoStorage, record.pendingLogoObjectPath, req.log);
    }
    const [updated] = await serializeClients(client, scope, record.id);
    res.json(ClearClientLogoResponse.parse(updated));
  });

router.delete("/clients/:clientId", async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!await requireAdmin(client, req, res)) return;
  const params = DeleteClientParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid client" });
    return;
  }
  const [record] = await db.select({
    id: clientsTable.id,
    logoObjectPath: clientsTable.logoObjectPath,
    pendingLogoObjectPath: clientsTable.pendingLogoObjectPath,
  }).from(clientsTable).where(and(
    eq(clientsTable.id, params.data.clientId),
    eq(clientsTable.workspaceId, workspaceId(req)),
  )).limit(1);
  const deleted = await db.delete(clientsTable).where(
    and(
      eq(clientsTable.id, params.data.clientId),
      eq(clientsTable.workspaceId, workspaceId(req)),
    ),
  ).returning({ id: clientsTable.id });
  if (!deleted.length || !record) {
    res.status(404).json({ error: "Client not found" });
    return;
  }
  await db.delete(clientMembersTable).where(eq(clientMembersTable.clientId, params.data.clientId));
  await deleteObjectQuietly(logoStorage, record.logoObjectPath, req.log);
  if (record.pendingLogoObjectPath !== record.logoObjectPath) {
    await deleteObjectQuietly(logoStorage, record.pendingLogoObjectPath, req.log);
  }
  res.status(204).send();
});

router.post("/clients/:clientId/members", async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!await requireAdmin(client, req, res)) return;
  const params = GrantClientAccessParams.safeParse(req.params);
  const body = GrantClientAccessBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Select a workspace client user" });
    return;
  }
  const scope = workspaceId(req);
  const ownedClient = await db.select({ id: clientsTable.id }).from(clientsTable).where(
    and(
      eq(clientsTable.id, params.data.clientId),
      eq(clientsTable.workspaceId, scope),
    ),
  );
  if (!ownedClient.length) {
    res.status(404).json({ error: "Client not found" });
    return;
  }
  try {
    const grant = await withAdminLock(async () => {
      const user = await client.users.getUser(body.data.userId);
      if (workspaceRole(user) !== "Client") return false;
      await db.insert(clientMembersTable).values({
        id: randomUUID(),
        clientId: params.data.clientId,
        userId: body.data.userId,
        addedBy: req.userId!,
      });
      return true;
    });
    if (!grant) {
      res.status(403).json({ error: "Only workspace users with the Client role can receive client access" });
      return;
    }
    const updated = await serializeClients(client, scope, params.data.clientId);
    res.status(201).json(updated[0]);
  } catch (error) {
    if (postgresErrorCode(error) === "23505") {
      res.status(409).json({ error: "This user already has access to the client" });
      return;
    }
    if ((error as { status?: number }).status === 404) {
      res.status(404).json({ error: "Workspace user not found" });
      return;
    }
    req.log.error({ error }, "Client access grant failed");
    res.status(500).json({ error: "Unable to grant client access" });
  }
});

router.delete("/clients/:clientId/members/:userId", async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!await requireAdmin(client, req, res)) return;
  const params = RevokeClientAccessParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid client membership" });
    return;
  }
  const ownedClient = await db.select({ id: clientsTable.id }).from(clientsTable).where(
    and(
      eq(clientsTable.id, params.data.clientId),
      eq(clientsTable.workspaceId, workspaceId(req)),
    ),
  );
  if (!ownedClient.length) {
    res.status(404).json({ error: "Client not found" });
    return;
  }
  const removed = await db.delete(clientMembersTable).where(
    and(
      eq(clientMembersTable.clientId, params.data.clientId),
      eq(clientMembersTable.userId, params.data.userId),
    ),
  ).returning({ id: clientMembersTable.id, userId: clientMembersTable.userId });
  if (!removed.length) {
    res.status(404).json({ error: "Client membership not found" });
    return;
  }
  res.status(204).send();
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
        if (workspaceRole(updatedTarget) !== body.data.role) {
          updatedTarget = await client.users.updateUserMetadata(updatedTarget.id, {
            publicMetadata: { ...updatedTarget.publicMetadata, role: body.data.role },
          });
        }
        if (body.data.role !== "Client") {
          try {
            await revokeMemberships(updatedTarget.id, workspaceId(req));
          } catch (error) {
            throw new ClientAccessCleanupError(error, updatedTarget.id, workspaceId(req));
          }
        }
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
    if (error instanceof ClientAccessCleanupError) {
      await markClientAccessCleanup(error.userId, error.workspaceId);
      req.log.error({ error: error.cause }, "Client access cleanup failed after role update");
      res.status(503).json({ error: error.message });
      return;
    }
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
      await deleteClientMemberships(target.id);
      await clearClientAccessCleanup(target.id, workspaceId(req));
      return true;
    });
    if (!deleted) {
      res.status(403).json({ error: "The workspace must keep at least one administrator" });
      return;
    }
    res.status(204).send();
  } catch (error) {
    if (error instanceof ClientAccessCleanupError) {
      req.log.error({ error: error.cause }, "Client access cleanup failed after user deletion");
      res.status(503).json({ error: error.message });
      return;
    }
    const normalized = clerkErrorResponse(error, "Clerk could not delete this user");
    req.log.warn({ status: normalized.status }, "Clerk user deletion failed");
    res.status(normalized.status).json({ error: normalized.error });
  }
});

return router;
}

export default createUsersRouter();

class ClientAccessCleanupError extends Error {
  readonly cause: unknown;
  readonly userId: string;
  readonly workspaceId: string;

  constructor(cause: unknown, userId: string, workspaceId: string) {
    super("The role was updated, but client access cleanup failed. Retry this role change to finish removing access.");
    this.name = "ClientAccessCleanupError";
    this.cause = cause;
    this.userId = userId;
    this.workspaceId = workspaceId;
  }
}
