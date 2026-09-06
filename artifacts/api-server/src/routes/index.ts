import { Router, type IRouter } from "express";
import healthRouter from "./health";
import luminovaRouter from "./luminova";
import usersRouter, { requireAuth } from "./users";

const router: IRouter = Router();

router.use(healthRouter);
router.use(requireAuth);
router.use(usersRouter);
router.use(luminovaRouter);

export default router;
