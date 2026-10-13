import { Router, type IRouter } from "express";
import healthRouter from "./health";
import luminovaRouter from "./luminova";
import usersRouter, { requireAuth } from "./users";
import storageRouter from "./storage";
import invoiceSubmissionsRouter from "./invoiceSubmissions";
import projectBoardsRouter from "./projectBoards";

const router: IRouter = Router();

router.use(healthRouter);
router.use(requireAuth);
router.use(usersRouter);
router.use(storageRouter);
router.use(invoiceSubmissionsRouter);
router.use(projectBoardsRouter);
router.use(luminovaRouter);

export default router;
