import { Readable } from "node:stream";
import { Router, type IRouter, type Request, type Response } from "express";
import { RequestUploadUrlBody, RequestUploadUrlResponse } from "@workspace/api-zod";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";

type AuthenticatedRequest = Request & { userId?: string };
const router: IRouter = Router();
const storage = new ObjectStorageService();

router.post("/storage/uploads/request-url", async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Choose a JPEG, PNG, or WebP image that is 8 MB or smaller." });
    return;
  }
  try {
    const uploadURL = await storage.getObjectEntityUploadURL();
    res.json(RequestUploadUrlResponse.parse({
      uploadURL,
      objectPath: storage.normalizeObjectEntityPath(uploadURL),
      metadata: parsed.data,
    }));
  } catch (error) {
    req.log.error({ err: error }, "Failed to generate panorama upload URL");
    res.status(500).json({ error: "The panorama upload could not be started." });
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