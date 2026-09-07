import { Readable } from "node:stream";
import { Router, type IRouter, type Request, type Response } from "express";
import { RequestUploadUrlBody, RequestUploadUrlResponse } from "@workspace/api-zod";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";
import { and, eq } from "drizzle-orm";
import { db, projectImportBatchesTable } from "@workspace/db";

type AuthenticatedRequest = Request & { userId?: string };
const router: IRouter = Router();
const storage = new ObjectStorageService();
const supportedExtensions = new Set(["pdf", "doc", "docx", "xls", "xlsx", "csv", "txt", "md", "json", "rtf", "jpg", "jpeg", "png", "webp", "heic", "tif", "tiff"]);

router.post("/storage/uploads/request-url", async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!req.userId) {
    res.status(401).json({ error: "Authentication is required to upload files." });
    return;
  }
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Choose a supported construction document or image up to 200 MB." });
    return;
  }
  const extension = parsed.data.name.split(".").pop()?.toLowerCase();
  if (!extension || !supportedExtensions.has(extension)) {
    res.status(400).json({ error: "This file type is not supported for project imports." });
    return;
  }
  const importId = typeof req.body?.importId === "string" ? req.body.importId : null;
  if (importId) {
    const [session] = await db.select({ id: projectImportBatchesTable.id }).from(projectImportBatchesTable)
      .where(and(eq(projectImportBatchesTable.id, importId), eq(projectImportBatchesTable.ownerId, req.userId))).limit(1);
    if (!session) {
      res.status(404).json({ error: "Import session not found." });
      return;
    }
  }
  try {
    const uploadURL = await storage.getObjectEntityUploadURL();
    res.json(RequestUploadUrlResponse.parse({
      uploadURL,
      objectPath: storage.normalizeObjectEntityPath(uploadURL),
      metadata: parsed.data,
    }));
  } catch (error) {
    req.log.error({ err: error }, "Failed to generate project document upload URL");
    res.status(500).json({ error: "The document upload could not be started." });
  }
});

router.get("/storage/objects/*path", async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const raw = req.params.path;
    const objectPath = `/objects/${Array.isArray(raw) ? raw.join("/") : raw}`;
    const file = await storage.getObjectEntityFile(objectPath);
    if (!await storage.canRead(req.userId, file)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const response = await storage.downloadObject(file);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    if (!response.body) {
      res.end();
      return;
    }
    Readable.fromWeb(response.body as ReadableStream<Uint8Array>).pipe(res);
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Object not found" });
      return;
    }
    req.log.error({ err: error }, "Failed to serve panorama object");
    res.status(500).json({ error: "The panorama could not be loaded." });
  }
});

export default router;