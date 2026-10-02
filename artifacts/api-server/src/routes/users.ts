import { createClerkClient, type User } from "@clerk/backend";
import { getAuth } from "@clerk/express";
import { clientAccessCleanupTable, clientInvitationsTable, clientMembersTable, clientsTable, db, pool } from "@workspace/db";
import {
  CreateClientBody,
  CreateClientResponse,
  RequestClientLogoUploadBody,
  RequestClientLogoUploadParams,
  RequestClientLogoUploadResponse,
  AttachClientLogoBody,
  AttachClientLogoParams,
  AttachClientLogoResponse,
  InviteClientUserBody,
  ClearClientLogoParams,
  ClearClientLogoResponse,
  DeleteClientParams,
  GetClientsResponse,
  DeleteWorkspaceUserParams,
  GetWorkspaceInvitationsResponse,
  GetCurrentWorkspaceUserResponse,
  GetProjectManagersResponse,
  GetWorkspaceUsersResponse,
  GrantClientAccessBody,
  GrantClientAccessParams,
  InviteClientUserParams,
  InviteWorkspaceUserBody,
  InviteWorkspaceUserResponse,
  RevokeClientAccessParams,
  ResendWorkspaceInvitationParams,
  ResendWorkspaceInvitationResponse,
  RevokeWorkspaceInvitationParams,
  UpdateWorkspaceUserBody,
  UpdateWorkspaceUserParams,
  UpdateWorkspaceUserResponse,
  UpdateWorkspaceUserProfileImageBody,
} from "@workspace/api-zod";
import { Router, type Request, type Response, type NextFunction } from "express";
import { and, asc, eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { WEIDNER_CLIENT_NAME } from "../lib/partyClassification";
import { ObjectStorageService } from "../lib/objectStorage";

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
export const ROLES = ["Admin", "Project Manager", "Field Team", "Client"] as const;
const MAX_PROFILE_IMAGE_BYTES = 8 * 1024 * 1024;
const PROFILE_IMAGE_DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/;

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
  const sessionClaimUserId = auth?.sessionClaims?.userId;
  const userId = typeof sessionClaimUserId === "string" ? sessionClaimUserId : auth?.userId;
  if (!userId) {
    if (process.env.NODE_ENV !== "production") {
      req.log.warn(
        {
          hasAuthContext: Boolean(auth),
          hasSessionClaimUserId: typeof sessionClaimUserId === "string",
          method: req.method,
          path: req.path,
        },
        "Clerk auth missing for protected API request",
      );
    }
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  req.userId = userId;
  next();
}

function explicitWorkspaceRole(
  user: User,
  scope = "default",
): (typeof ROLES)[number] | null {
  const metadata = user.publicMetadata as Record<string, unknown>;
  const workspaceRoles = metadata.workspaceRoles && typeof metadata.workspaceRoles === "object"
    ? metadata.workspaceRoles as Record<string, unknown>
    : {};
  const scopedRole = workspaceRoles[scope];
  const role = scopedRole ?? (scope === "default" ? metadata.role : undefined);
  return ROLES.includes(role as (typeof ROLES)[number])
    ? role as (typeof ROLES)[number]
    : null;
}

function workspaceRole(user: User, scope = "default"): (typeof ROLES)[number] {
  return explicitWorkspaceRole(user, scope) ?? "Project Manager";
}

function userWorkspaceIds(user: User): string[] {
  const metadata = user.publicMetadata as Record<string, unknown>;
  const workspaceIds = Array.isArray(metadata.workspaceIds)
    ? metadata.workspaceIds.filter((value): value is string => typeof value === "string")
    : [];
  if (typeof metadata.workspaceId === "string") workspaceIds.push(metadata.workspaceId);
  return [...new Set(workspaceIds)];
}
function userBelongsToWorkspace(user: User, scope: string): boolean {
  const workspaceIds = userWorkspaceIds(user);
  return workspaceIds.length ? workspaceIds.includes(scope) : scope === "default";
}
export type ProjectManagerProfile = {
  id: string;
  name: string;
  email: string;
};

function serializeUser(user: User, scope = "default") {
  const firstName = user.firstName ?? "";
  const lastName = user.lastName ?? "";
  return {
    id: user.id,
    firstName,
    lastName,
    name: user.fullName || user.username || [firstName, lastName].filter(Boolean).join(" ") || "Unnamed user",
    email: user.primaryEmailAddress?.emailAddress || "",
    role: workspaceRole(user, scope),
    createdAt: user.createdAt,
    lastSignInAt: user.lastSignInAt,
    imageUrl: user.imageUrl,
    clientAccessCleanupPending: false,
  };
}

type WorkspaceInvitationRecord = {
  id: string;
  emailAddress: string;
  publicMetadata?: Record<string, unknown> | null;
  status: string;
  createdAt: number;
};

export async function workspaceChatUsers(req: AuthenticatedRequest, client: ClerkClient = clerk) {
  const auth = getAuth(req);
  const scope = auth.orgId || "default";
  const users = await listAllWorkspaceUsers(client, scope);
  return users.map((user) => serializeUser(user, scope));
}
function invitationRole(invitation: WorkspaceInvitationRecord): (typeof ROLES)[number] {
  const role = invitation.publicMetadata?.role;
  return ROLES.includes(role as (typeof ROLES)[number])
    ? role as (typeof ROLES)[number]
    : "Project Manager";
}

function invitationWorkspaceId(invitation: WorkspaceInvitationRecord): string {
  const scope = invitation.publicMetadata?.workspaceId;
  return typeof scope === "string" && scope ? scope : "default";
}
function serializeInvitation(invitation: WorkspaceInvitationRecord) {
  return {
    id: invitation.id,
    email: invitation.emailAddress,
    role: invitationRole(invitation),
    status: invitation.status,
    createdAt: invitation.createdAt,
  };
}

function workspaceId(req: AuthenticatedRequest) {
  try {
    return getAuth(req).orgId || "default";
  } catch (error) {
    if (process.env.NODE_ENV === "test") return "default";
    throw error;
  }
}

function clientLogoUrl(objectPath: string | null) {
  return objectPath ? `/api/storage${objectPath}` : null;
}

function profileImageBlob(imageData: string): Blob | null {
  const match = PROFILE_IMAGE_DATA_URL.exec(imageData);
  if (!match || match[2].length % 4 === 1) return null;
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length === 0 || bytes.length > MAX_PROFILE_IMAGE_BYTES) return null;
  return new Blob([new Uint8Array(bytes)], { type: match[1] });
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
  const pendingInvitations = await db
    .select()
    .from(clientInvitationsTable)
    .where(inArray(clientInvitationsTable.clientId, records.map((record) => record.id)));
  const memberUserIds = [...new Set(memberships.map((membership) => membership.userId))];
  const usersById = await resolveClientMemberUsers(client, memberUserIds);

  return records.map((record) => ({
    id: record.id,
    name: record.name,
    logoUrl: clientLogoUrl(record.logoObjectPath),
    createdAt: record.createdAt.getTime(),
    pendingInvitations: pendingInvitations
      .filter((invitation) => invitation.clientId === record.id)
      .map((invitation) => ({
        id: invitation.id,
        email: invitation.email,
        role: "Client" as const,
        status: "pending",
        createdAt: invitation.createdAt.getTime(),
      })),
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
          role: workspaceRole(user, scope),
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
type ClerkClient = typeof clerk;
type AdminLock = <T>(operation: () => Promise<T>) => Promise<T>;
export type RevokeClientMemberships = (userId: string, scope: string) => Promise<void>;

function usesOrganizationInvitations(client: ClerkClient, scope: string): boolean {
  return scope !== "default" && Boolean(client.organizations?.createOrganizationInvitation);
}
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

async function ensureRole(client: ClerkClient, userId: string, scope = "default") {
  const current = await client.users.getUser(userId);
  if (!await userHasWorkspaceMembership(client, current, scope)) throw { status: 403 };
  let role: unknown = explicitWorkspaceRole(current, scope);
  if (!ROLES.includes(role as (typeof ROLES)[number])) {
    const acceptedInvitation = scope === "default"
      ? undefined
      : (await listWorkspaceInvitations(client, scope, "accepted")).find((invitation) =>
          invitation.emailAddress.trim().toLowerCase()
          === current.primaryEmailAddress?.emailAddress.trim().toLowerCase()
        );
    if (acceptedInvitation) {
      role = invitationRole(acceptedInvitation);
    } else if (scope === "default") {
      const users = await listAllWorkspaceUsers(client, scope);
      const hasAdmin = users.some((user) => workspaceRole(user, scope) === "Admin");
      role = hasAdmin ? "Project Manager" : "Admin";
    } else {
      role = "Project Manager";
    }
    await syncWorkspaceRoleMetadata(
      client,
      current,
      scope,
      role as (typeof ROLES)[number],
    );
  }
  return role as (typeof ROLES)[number];
}

async function listUserOrganizationIds(client: ClerkClient, userId: string): Promise<string[] | null> {
  if (typeof client.users.getOrganizationMembershipList !== "function") return null;
  const limit = 100;
  const organizationIds: string[] = [];
  let offset = 0;
  while (true) {
    const result = await client.users.getOrganizationMembershipList({ userId, limit, offset });
    organizationIds.push(...result.data.map((membership) => membership.organization.id));
    if (result.data.length < limit || organizationIds.length >= result.totalCount) break;
    offset += result.data.length;
  }
  return [...new Set(organizationIds)];
}

async function userHasOtherWorkspaceIdentity(
  client: ClerkClient,
  user: User,
  scope: string,
): Promise<boolean> {
  const cachedWorkspaceIds = userWorkspaceIds(user);
  const knownWorkspaceIds = new Set(
    cachedWorkspaceIds.length ? cachedWorkspaceIds : ["default"],
  );
  const organizationIds = await listUserOrganizationIds(client, user.id);
  if (organizationIds === null) return scope !== "default";
  for (const organizationId of organizationIds) knownWorkspaceIds.add(organizationId);
  return [...knownWorkspaceIds].some((workspaceId) => workspaceId !== scope);
}
let resolveWorkspaceRole = (userId: string, scope = "default") => ensureRole(clerk, userId, scope);

export async function getRequestWorkspaceRole(req: AuthenticatedRequest) {
  if (!req.userId) return null;
  return resolveWorkspaceRole(req.userId, workspaceId(req));
}

export async function requireWorkspaceRole(
  req: AuthenticatedRequest,
  res: Response,
  allowedRoles: readonly string[],
  errorMessage: string,
  client: ClerkClient = clerk,
): Promise<boolean> {
  if (!req.userId) {
    res.status(401).json({ error: "Authentication required" });
    return false;
  }
  const scope = workspaceId(req);
  let role: (typeof ROLES)[number];
  try {
    role = client === clerk
      ? await resolveWorkspaceRole(req.userId, scope)
      : await ensureRole(client, req.userId, scope);
  } catch (error) {
    if ((error as ClerkError).status === 403) {
      res.status(403).json({ error: errorMessage });
      return false;
    }
    throw error;
  }
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
  let role: (typeof ROLES)[number];
  try {
    role = await ensureRole(client, req.userId!, workspaceId(req));
  } catch (error) {
    if ((error as ClerkError).status === 403) {
      res.status(403).json({ error: "Administrator access required" });
      return false;
    }
    throw error;
  }
  if (role === "Admin") return true;
  res.status(403).json({ error: "Administrator access required" });
  return false;
}

async function isFinalAdmin(client: ClerkClient, target: User, scope: string): Promise<boolean> {
  if (workspaceRole(target, scope) !== "Admin") return false;
  const users = await listAllWorkspaceUsers(client, scope);
  return users.filter((user) => workspaceRole(user, scope) === "Admin").length <= 1;
}

async function listAllProviderUsers(client: ClerkClient): Promise<User[]> {
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
async function listAllWorkspaceUsers(client: ClerkClient, scope: string): Promise<User[]> {
  const [users, memberIds] = await Promise.all([
    listAllProviderUsers(client),
    workspaceMemberIds(client, scope),
  ]);
  return users.filter((user) =>
    memberIds ? memberIds.has(user.id) : userBelongsToWorkspace(user, scope),
  );
}

async function reconcileClientInvitations(
  client: ClerkClient,
  scope: string,
  log: Request["log"],
  targetUserId?: string,
) {
  let users: User[];
  let targetEmail: string | null = null;
  if (targetUserId) {
    try {
      const target = await client.users.getUser(targetUserId);
      if (!await userHasWorkspaceMembership(client, target, scope)) return;
      targetEmail = target.primaryEmailAddress?.emailAddress.trim().toLowerCase() ?? null;
      if (!targetEmail) return;
      users = [target];
    } catch (error) {
      log.warn({ err: error, userId: targetUserId }, "Client invitation reconciliation could not load the signed-in user");
      return;
    }
  } else {
    try {
      users = await listAllWorkspaceUsers(client, scope);
    } catch (error) {
      log.warn({ err: error }, "Client invitation reconciliation could not list workspace users");
      return;
    }
  }

  const pending = await db
    .select()
    .from(clientInvitationsTable)
    .where(targetEmail
      ? and(
          eq(clientInvitationsTable.workspaceId, scope),
          eq(clientInvitationsTable.email, targetEmail),
        )
      : eq(clientInvitationsTable.workspaceId, scope));
  if (!pending.length) return;

  for (const record of pending) {
    let invitation: WorkspaceInvitationRecord | undefined;
    try {
      invitation = await getWorkspaceInvitation(client, scope, record.invitationId);
    } catch (error) {
      log.warn({ err: error, invitationId: record.invitationId }, "Client invitation reconciliation could not read invitation");
      continue;
    }

    const user = users.find((candidate) =>
      candidate.primaryEmailAddress?.emailAddress.trim().toLowerCase() === record.email,
    );
    const invitationWasAccepted = invitation?.status === "accepted";
    if (invitationWasAccepted && user) {
      try {
        await syncWorkspaceRoleMetadata(client, user, scope, "Client");
      } catch (error) {
        log.warn({ err: error, invitationId: record.invitationId }, "Accepted client invitation role could not be synchronized");
        continue;
      }
      const connection = await pool.connect();
      try {
        await connection.query("BEGIN");
        const locked = await connection.query<{ id: string }>(
          `SELECT ci.id
             FROM client_invitations ci
             JOIN clients c
               ON c.id = ci.client_id
              AND c.workspace_id = ci.workspace_id
            WHERE ci.id = $1
              AND ci.workspace_id = $2
            FOR UPDATE OF ci, c`,
          [record.id, scope],
        );
        if (locked.rowCount) {
          await connection.query(
            `INSERT INTO client_members (id, client_id, user_id, added_by)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (client_id, user_id) DO NOTHING`,
            [randomUUID(), record.clientId, user.id, record.id],
          );
          await connection.query(
            "DELETE FROM client_invitations WHERE id = $1 AND workspace_id = $2",
            [record.id, scope],
          );
        }
        await connection.query("COMMIT");
      } catch (error) {
        await connection.query("ROLLBACK");
        log.warn({ err: error, invitationId: record.invitationId }, "Client invitation reconciliation failed");
      } finally {
        connection.release();
      }
      continue;
    }

    if (!invitation || invitation.status === "revoked") {
      await db.delete(clientInvitationsTable).where(and(
        eq(clientInvitationsTable.id, record.id),
        eq(clientInvitationsTable.workspaceId, scope),
      ));
    }
  }
}
async function workspaceMemberIds(client: ClerkClient, scope: string): Promise<Set<string> | null> {
  if (scope === "default" || !client.organizations?.getOrganizationMembershipList) return null;
  const members: Array<{ publicUserData?: { userId?: string } | null }> = [];
  let offset = 0;
  const limit = 100;
  while (true) {
    const result = await client.organizations.getOrganizationMembershipList({
      organizationId: scope,
      limit,
      offset,
    });
    members.push(...result.data);
    if (result.data.length < limit || members.length >= result.totalCount) break;
    offset += result.data.length;
  }
  return new Set(
    members
      .map((membership) => membership.publicUserData?.userId)
      .filter((userId): userId is string => Boolean(userId)),
  );
}

async function userHasWorkspaceMembership(client: ClerkClient, user: User, scope: string): Promise<boolean> {
  const memberIds = await workspaceMemberIds(client, scope);
  return memberIds ? memberIds.has(user.id) : userBelongsToWorkspace(user, scope);
}
function serializeProjectManager(user: User): ProjectManagerProfile | null {
  const email = user.primaryEmailAddress?.emailAddress;
  if (!email) return null;
  return {
    id: user.id,
    name: user.fullName || user.username || [user.firstName, user.lastName].filter(Boolean).join(" ") || "Unnamed user",
    email,
  };
}

export async function listProjectManagers(
  client: ClerkClient = clerk,
  scope = "default",
): Promise<ProjectManagerProfile[]> {
  const [users, memberIds] = await Promise.all([
    listAllProviderUsers(client),
    workspaceMemberIds(client, scope),
  ]);
  return users
    .filter((user) =>
      explicitWorkspaceRole(user, scope) === "Project Manager" &&
      (memberIds ? memberIds.has(user.id) : userBelongsToWorkspace(user, scope)),
    )
    .map(serializeProjectManager)
    .filter((profile): profile is ProjectManagerProfile => profile !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function resolveProjectManager(
  userId: string,
  client: ClerkClient = clerk,
  scope = "default",
): Promise<{ kind: "valid"; profile: ProjectManagerProfile } | { kind: "not-found" } | { kind: "wrong-role" } | { kind: "missing-email" }> {
  let user: User;
  try {
    user = await client.users.getUser(userId);
  } catch (error) {
    if ((error as ClerkError).status === 404) return { kind: "not-found" };
    throw error;
  }
  const memberIds = await workspaceMemberIds(client, scope);
  if (memberIds ? !memberIds.has(user.id) : !userBelongsToWorkspace(user, scope)) return { kind: "not-found" };
  if (explicitWorkspaceRole(user, scope) !== "Project Manager") return { kind: "wrong-role" };
  const profile = serializeProjectManager(user);
  return profile ? { kind: "valid", profile } : { kind: "missing-email" };
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
  if (status === 403) return { status: 403, error: detail?.longMessage || detail?.message || "This action is not allowed" };
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
  try {
    const scope = workspaceId(req);
    const role = await ensureRole(client, req.userId!, scope);
    if (role === "Client") {
      await reconcileClientInvitations(client, scope, req.log, req.userId!);
    }
    res.json(GetCurrentWorkspaceUserResponse.parse({ userId: req.userId, role }));
  } catch (error) {
    if ((error as ClerkError).status === 403) {
      res.status(403).json({ error: "Workspace membership required" });
      return;
    }
    throw error;
  }
});

router.get("/users", async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!await requireAdmin(client, req, res)) return;
  const users = await listAllWorkspaceUsers(client, workspaceId(req));
  const pendingCleanup = await db.select({ userId: clientAccessCleanupTable.userId })
    .from(clientAccessCleanupTable)
    .where(eq(clientAccessCleanupTable.workspaceId, workspaceId(req)));
  const pendingUserIds = new Set(pendingCleanup.map(({ userId }) => userId));
  res.json(GetWorkspaceUsersResponse.parse(users.map((user) => ({
    ...serializeUser(user, workspaceId(req)),
    clientAccessCleanupPending: pendingUserIds.has(user.id),
  }))));
});

router.patch("/users/:userId/profile-image", async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = UpdateWorkspaceUserParams.safeParse(req.params);
  const body = UpdateWorkspaceUserProfileImageBody.safeParse(req.body);
  const imageFile = body.success ? profileImageBlob(body.data.imageData) : null;
  if (!params.success || !body.success || !imageFile) {
    res.status(400).json({ error: "Choose a valid JPEG, PNG, or WebP image up to 8 MB." });
    return;
  }

  try {
    const scope = workspaceId(req);
    const actorRole = await ensureRole(client, req.userId!, scope);
    const target = await client.users.getUser(params.data.userId);
    if (!await userHasWorkspaceMembership(client, target, scope)) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (params.data.userId !== req.userId && actorRole !== "Admin") {
      res.status(403).json({ error: "Administrator access required to update another user" });
      return;
    }
    const updated = await client.users.updateUserProfileImage(target.id, { file: imageFile });
    res.json(UpdateWorkspaceUserResponse.parse(serializeUser(updated, scope)));
  } catch (error) {
    const normalized = clerkErrorResponse(error, "Clerk could not update this profile image");
    req.log.warn({ status: normalized.status }, "Clerk profile image update failed");
    res.status(normalized.status).json({ error: normalized.error });
  }
});

router.get("/users/project-managers", async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!await requireAdmin(client, req, res)) return;
  try {
    res.json(GetProjectManagersResponse.parse(await listProjectManagers(client, workspaceId(req))));
  } catch (error) {
    req.log.error({ error }, "Project manager directory listing failed");
    res.status(500).json({ error: "Unable to load project managers" });
  }
});

router.post("/users/client-access-reconciliation", async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!await requireAdmin(client, req, res)) return;
  const scope = workspaceId(req);
  const pendingCleanup = await db.select({ userId: clientAccessCleanupTable.userId })
    .from(clientAccessCleanupTable)
    .where(eq(clientAccessCleanupTable.workspaceId, scope));
  const reconciled: string[] = [];
  const failed: Array<{ userId: string; error: string }> = [];

  for (const { userId } of pendingCleanup) {
    try {
      await withAdminLock(async () => {
        await client.users.getUser(userId);
        await revokeClientMemberships(userId, scope);
        await clearClientAccessCleanup(userId, scope);
      });
      reconciled.push(userId);
    } catch (error) {
      if ((error as ClerkError).status === 404) {
        failed.push({ userId, error: "User not found" });
        continue;
      }
      req.log.error({ error, userId }, "Client access bulk reconciliation failed");
      failed.push({ userId, error: "Client access cleanup failed again. Try reconciling this user again." });
    }
  }

  res.json({ reconciled, failed });
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
    await reconcileClientInvitations(client, scope, req.log);
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
  const scope = workspaceId(req);
  try {
    const record = await withAdminLock(async () => {
      const connection = await pool.connect();
      try {
        await connection.query("BEGIN");
        const locked = await connection.query<{
          id: string;
          logo_object_path: string | null;
          pending_logo_object_path: string | null;
        }>(
          `SELECT id, logo_object_path, pending_logo_object_path
             FROM clients
            WHERE id = $1 AND workspace_id = $2
            FOR UPDATE`,
          [params.data.clientId, scope],
        );
        const ownedClient = locked.rows[0];
        if (!ownedClient) {
          await connection.query("ROLLBACK");
          return null;
        }
        const pendingInvitations = await connection.query<{ invitation_id: string }>(
          `SELECT invitation_id
             FROM client_invitations
            WHERE client_id = $1 AND workspace_id = $2
            FOR UPDATE`,
          [params.data.clientId, scope],
        );
        for (const pending of pendingInvitations.rows) {
          try {
            await revokeWorkspaceInvitation(client, scope, pending.invitation_id, req.userId);
          } catch (error) {
            if ((error as ClerkError).status !== 404) throw error;
          }
        }
        await connection.query("DELETE FROM client_members WHERE client_id = $1", [params.data.clientId]);
        await connection.query(
          "DELETE FROM client_invitations WHERE client_id = $1 AND workspace_id = $2",
          [params.data.clientId, scope],
        );
        await connection.query(
          "DELETE FROM clients WHERE id = $1 AND workspace_id = $2",
          [params.data.clientId, scope],
        );
        await connection.query("COMMIT");
        return {
          logoObjectPath: ownedClient.logo_object_path,
          pendingLogoObjectPath: ownedClient.pending_logo_object_path,
        };
      } catch (error) {
        await connection.query("ROLLBACK");
        throw error;
      } finally {
        connection.release();
      }
    });
    if (!record) {
      res.status(404).json({ error: "Client not found" });
      return;
    }
    await deleteObjectQuietly(logoStorage, record.logoObjectPath, req.log);
    if (record.pendingLogoObjectPath !== record.logoObjectPath) {
      await deleteObjectQuietly(logoStorage, record.pendingLogoObjectPath, req.log);
    }
    res.status(204).send();
  } catch (error) {
    const normalized = clerkErrorResponse(error, "Clerk could not revoke the client invitation");
    req.log.warn({ status: normalized.status, clientId: params.data.clientId }, "Client deletion invitation cleanup failed");
    res.status(normalized.status).json({ error: normalized.error });
  }
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
  try {
    const grant = await withAdminLock(async () => {
      const [ownedClient] = await db.select({ id: clientsTable.id }).from(clientsTable).where(
        and(
          eq(clientsTable.id, params.data.clientId),
          eq(clientsTable.workspaceId, scope),
        ),
      ).limit(1);
      if (!ownedClient) return { status: "missing" as const };
      const user = await client.users.getUser(body.data.userId);
      if (!await userHasWorkspaceMembership(client, user, scope) || workspaceRole(user, scope) !== "Client") {
        return { status: "ineligible" as const };
      }
      await db.insert(clientMembersTable).values({
        id: randomUUID(),
        clientId: params.data.clientId,
        userId: body.data.userId,
        addedBy: req.userId!,
      });
      const [updated] = await serializeClients(client, scope, params.data.clientId);
      return { status: "granted" as const, client: updated };
    });
    if (grant.status === "missing") {
      res.status(404).json({ error: "Client not found" });
      return;
    }
    if (grant.status === "ineligible") {
      res.status(403).json({ error: "Only workspace users with the Client role can receive client access" });
      return;
    }
    res.status(201).json(grant.client);
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

router.post("/clients/:clientId/invitations", async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!await requireAdmin(client, req, res)) return;
  const params = InviteClientUserParams.safeParse(req.params);
  const body = InviteClientUserBody.safeParse({
    ...req.body,
    email: typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : req.body?.email,
  });
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Enter a valid email address" });
    return;
  }

  const scope = workspaceId(req);
  let createdInvitation: WorkspaceInvitationRecord | undefined;
  try {
    const attached = await withAdminLock(async () => {
      const [ownedClient] = await db.select({ id: clientsTable.id }).from(clientsTable).where(and(
        eq(clientsTable.id, params.data.clientId),
        eq(clientsTable.workspaceId, scope),
      )).limit(1);
      if (!ownedClient) return false;
      const [existingPending] = await db.select({ id: clientInvitationsTable.id })
        .from(clientInvitationsTable)
        .where(and(
          eq(clientInvitationsTable.workspaceId, scope),
          eq(clientInvitationsTable.clientId, params.data.clientId),
          eq(clientInvitationsTable.email, body.data.email),
        ))
        .limit(1);
      if (existingPending) {
        throw { code: "client_invitation_exists" };
      }

      const users = await listAllWorkspaceUsers(client, scope);
      if (users.some((user) => user.primaryEmailAddress?.emailAddress.trim().toLowerCase() === body.data.email)) {
        throw { code: "workspace_user_exists" };
      }

      createdInvitation = await createWorkspaceInvitation(
        client,
        scope,
        body.data.email,
        "Client",
        req.userId,
      );
      try {
        await db.insert(clientInvitationsTable).values({
          id: randomUUID(),
          invitationId: createdInvitation.id,
          workspaceId: scope,
          clientId: params.data.clientId,
          email: body.data.email,
        });
      } catch (error) {
        try {
          await revokeWorkspaceInvitation(client, scope, createdInvitation.id, req.userId);
        } catch (cleanupError) {
          req.log.warn({ err: cleanupError, invitationId: createdInvitation.id }, "Client invitation cleanup failed");
        }
        throw error;
      }
      return true;
    });
    if (!attached) {
      res.status(404).json({ error: "Client not found" });
      return;
    }
    res.status(201).json(InviteWorkspaceUserResponse.parse(serializeInvitation(createdInvitation!)));
  } catch (error) {
    if ((error as { code?: string }).code === "client_invitation_exists") {
      res.status(409).json({ error: "This email already has a pending invitation for the client" });
      return;
    }
    if ((error as { code?: string }).code === "workspace_user_exists") {
      res.status(409).json({ error: "This email already belongs to a workspace user. Select that user instead." });
      return;
    }
    if (postgresErrorCode(error) === "23505") {
      res.status(409).json({ error: "This email already has a pending invitation for the client" });
      return;
    }
    const normalized = clerkErrorResponse(error, "Clerk could not send the client invitation");
    req.log.warn({ status: normalized.status }, "Client invitation failed");
    res.status(normalized.status).json({ error: normalized.error });
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
    res.json(GetWorkspaceInvitationsResponse.parse(
      (await listWorkspaceInvitations(client, workspaceId(req), "pending")).map(serializeInvitation),
    ));
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
    const invitation = await createWorkspaceInvitation(
      client,
      workspaceId(req),
      parsed.data.email.trim().toLowerCase(),
      parsed.data.role,
      req.userId,
    );
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
    const scope = workspaceId(req);
    const invitation = await getWorkspaceInvitation(client, scope, params.data.invitationId);
    if (!invitation || invitation.status !== "pending") {
      res.status(404).json({ error: "Invitation not found" });
      return;
    }
    if (usesOrganizationInvitations(client, scope)) {
      await revokeWorkspaceInvitation(client, scope, invitation.id, req.userId);
    }
    const replacement = await createWorkspaceInvitation(
      client,
      scope,
      invitation.emailAddress,
      invitationRole(invitation),
      req.userId,
      !usesOrganizationInvitations(client, scope),
    );
    try {
      if (!usesOrganizationInvitations(client, scope)) {
        await revokeWorkspaceInvitation(client, scope, invitation.id, req.userId);
      }
      await db.update(clientInvitationsTable)
        .set({ invitationId: replacement.id })
        .where(and(
          eq(clientInvitationsTable.workspaceId, scope),
          eq(clientInvitationsTable.invitationId, invitation.id),
        ));
    } catch (error) {
      try {
        await revokeWorkspaceInvitation(client, scope, replacement.id, req.userId);
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
    const scope = workspaceId(req);
    const invitation = await getWorkspaceInvitation(client, scope, params.data.invitationId);
    if (!invitation || invitation.status !== "pending") {
      res.status(404).json({ error: "Invitation not found" });
      return;
    }
    await revokeWorkspaceInvitation(client, scope, params.data.invitationId, req.userId);
    await db.delete(clientInvitationsTable).where(and(
      eq(clientInvitationsTable.workspaceId, scope),
      eq(clientInvitationsTable.invitationId, params.data.invitationId),
    ));
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
    const scope = workspaceId(req);
    const applyUpdate = async (initialTarget: User) => {
      let updatedTarget = initialTarget;
      const updatesGlobalIdentity = body.data.firstName !== undefined
        || body.data.lastName !== undefined
        || body.data.email !== undefined;
      if (
        scope !== "default"
        && updatesGlobalIdentity
        && await userHasOtherWorkspaceIdentity(client, initialTarget, scope)
      ) {
        throw {
          status: 403,
          errors: [{
            longMessage: "Name and email are shared across workspaces and cannot be changed here",
          }],
        };
      }
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
        if (workspaceRole(updatedTarget, scope) !== body.data.role) {
          const metadata = updatedTarget.publicMetadata as Record<string, unknown>;
          const workspaceRoles = metadata.workspaceRoles && typeof metadata.workspaceRoles === "object"
            ? metadata.workspaceRoles as Record<string, unknown>
            : {};
          const workspaceIds = userWorkspaceIds(updatedTarget);
          const onlyWorkspace = workspaceIds.length === 0
            ? scope === "default"
            : workspaceIds.length === 1 && workspaceIds[0] === scope;
          updatedTarget = await client.users.updateUserMetadata(updatedTarget.id, {
            publicMetadata: {
              ...updatedTarget.publicMetadata,
              ...(onlyWorkspace ? { role: body.data.role } : {}),
              workspaceRoles: { ...workspaceRoles, [scope]: body.data.role },
            },
          });
        }
        if (body.data.role !== "Client") {
          try {
            await revokeMemberships(updatedTarget.id, scope);
          } catch (error) {
            throw new ClientAccessCleanupError(error, updatedTarget.id, scope);
          }
        }
      }
      return updatedTarget;
    };

    let target: User | null;
    if (body.data.role) {
      target = await withAdminLock(async () => {
        const lockedTarget = await client.users.getUser(params.data.userId);
        if (!await userHasWorkspaceMembership(client, lockedTarget, scope)) throw { status: 404 };
        if (body.data.role !== "Admin" && await isFinalAdmin(client, lockedTarget, scope)) return null;
        return applyUpdate(lockedTarget);
      });
      if (!target) {
        res.status(403).json({ error: "The workspace must keep at least one administrator" });
        return;
      }
    } else {
      const workspaceTarget = await client.users.getUser(params.data.userId);
      if (!await userHasWorkspaceMembership(client, workspaceTarget, scope)) throw { status: 404 };
      target = await applyUpdate(workspaceTarget);
    }
    res.json(UpdateWorkspaceUserResponse.parse(serializeUser(target, scope)));
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
    const scope = workspaceId(req);
    const deleted = await withAdminLock(async () => {
      const target = await client.users.getUser(params.data.userId);
      if (!await userHasWorkspaceMembership(client, target, scope)) throw { status: 404 };
      if (await isFinalAdmin(client, target, scope)) return false;
      const organizationIds = await listUserOrganizationIds(client, target.id);
      await revokeMemberships(target.id, scope);
      if (scope !== "default" && client.organizations?.deleteOrganizationMembership) {
        await client.organizations.deleteOrganizationMembership({
          organizationId: scope,
          userId: target.id,
        });
      }
      const explicitWorkspaceIds = userWorkspaceIds(target);
      const cachedWorkspaceIds = (explicitWorkspaceIds.length ? explicitWorkspaceIds : ["default"])
        .filter((workspaceId) => workspaceId !== scope);
      const remainingOrganizationIds = organizationIds?.filter((organizationId) => organizationId !== scope) ?? [];
      const remainingWorkspaceIds = organizationIds
        ? [...new Set([...cachedWorkspaceIds, ...remainingOrganizationIds])]
        : cachedWorkspaceIds;
      if (remainingWorkspaceIds.length) {
        const metadata = target.publicMetadata as Record<string, unknown>;
        const workspaceRoles = metadata.workspaceRoles && typeof metadata.workspaceRoles === "object"
          ? { ...metadata.workspaceRoles as Record<string, unknown> }
          : {};
        delete workspaceRoles[scope];
        const { workspaceId: _workspaceId, ...metadataWithoutSingularWorkspace } = metadata;
        await client.users.updateUserMetadata(target.id, {
          publicMetadata: {
            ...metadataWithoutSingularWorkspace,
            workspaceIds: remainingWorkspaceIds,
            workspaceRoles,
          },
        });
      } else {
        await client.users.deleteUser(target.id);
      }
      await clearClientAccessCleanup(target.id, scope);
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

export function setWorkspaceRoleResolverForTests(
  resolver?: (userId: string, scope?: string) => Promise<(typeof ROLES)[number]>,
): void {
  resolveWorkspaceRole = resolver ?? ((userId, scope) => ensureRole(clerk, userId, scope));
}

async function createWorkspaceInvitation(
  client: ClerkClient,
  scope: string,
  email: string,
  role: (typeof ROLES)[number],
  inviterUserId?: string,
  ignoreExisting = false,
): Promise<WorkspaceInvitationRecord> {
  if (usesOrganizationInvitations(client, scope)) {
    return await client.organizations.createOrganizationInvitation({
      organizationId: scope,
      emailAddress: email,
      role: "org:member",
      inviterUserId,
      publicMetadata: { role, workspaceId: scope },
    }) as unknown as WorkspaceInvitationRecord;
  }
  return await client.invitations.createInvitation({
    emailAddress: email,
    publicMetadata: { role, workspaceId: scope },
    notify: true,
    ignoreExisting,
  }) as WorkspaceInvitationRecord;
}

async function revokeWorkspaceInvitation(
  client: ClerkClient,
  scope: string,
  invitationId: string,
  requestingUserId?: string,
): Promise<void> {
  if (usesOrganizationInvitations(client, scope)) {
    await client.organizations.revokeOrganizationInvitation({
      organizationId: scope,
      invitationId,
      requestingUserId,
    });
    return;
  }
  await client.invitations.revokeInvitation(invitationId);
}

async function listWorkspaceInvitations(
  client: ClerkClient,
  scope: string,
  status?: string,
): Promise<WorkspaceInvitationRecord[]> {
  if (usesOrganizationInvitations(client, scope)) {
    const result = await client.organizations.getOrganizationInvitationList({
      organizationId: scope,
      ...(status ? { status: [status as "pending" | "accepted" | "revoked"] } : {}),
      limit: 100,
    });
    return result.data as unknown as WorkspaceInvitationRecord[];
  }
  const result = await client.invitations.getInvitationList({
    ...(status ? { status: status as "pending" | "accepted" | "revoked" } : {}),
    limit: 100,
    orderBy: "-created_at",
  });
  return (
    result.data.filter((invitation) =>
      invitationWorkspaceId(invitation as WorkspaceInvitationRecord) === scope
    )
  ) as unknown as WorkspaceInvitationRecord[];
}

async function syncWorkspaceRoleMetadata(
  client: ClerkClient,
  user: User,
  scope: string,
  role: (typeof ROLES)[number],
): Promise<void> {
  const metadata = user.publicMetadata as Record<string, unknown>;
  const workspaceIds = userWorkspaceIds(user);
  const hadImplicitDefaultMembership = workspaceIds.length === 0 && scope !== "default";
  if (hadImplicitDefaultMembership) workspaceIds.push("default");
  if (!workspaceIds.includes(scope)) workspaceIds.push(scope);
  const workspaceRoles = metadata.workspaceRoles && typeof metadata.workspaceRoles === "object"
    ? { ...metadata.workspaceRoles as Record<string, unknown> }
    : {};
  if (
    hadImplicitDefaultMembership
    && workspaceRoles.default === undefined
    && ROLES.includes(metadata.role as (typeof ROLES)[number])
  ) {
    workspaceRoles.default = metadata.role;
  }
  if (
    workspaceRoles[scope] === role &&
    (scope !== "default" || metadata.role === role) &&
    userWorkspaceIds(user).includes(scope)
  ) return;
  const publicMetadata = {
    ...metadata,
    ...(scope === "default" ? { role } : {}),
    workspaceIds,
    workspaceRoles: { ...workspaceRoles, [scope]: role },
  };
  await client.users.updateUserMetadata(user.id, { publicMetadata });
  Object.assign(user, { publicMetadata });
}

async function getWorkspaceInvitation(
  client: ClerkClient,
  scope: string,
  invitationId: string,
): Promise<WorkspaceInvitationRecord | undefined> {
  if (usesOrganizationInvitations(client, scope)) {
    try {
      return await client.organizations.getOrganizationInvitation({
        organizationId: scope,
        invitationId,
      }) as unknown as WorkspaceInvitationRecord;
    } catch (error) {
      if ((error as ClerkError).status === 404) return undefined;
      throw error;
    }
  }
  const result = await client.invitations.getInvitationList({
    query: invitationId,
    limit: 1,
  });
  const invitation = result.data.find((candidate) => candidate.id === invitationId);
  if (!invitation || invitationWorkspaceId(invitation as WorkspaceInvitationRecord) !== scope) return undefined;
  return invitation as WorkspaceInvitationRecord;
}
