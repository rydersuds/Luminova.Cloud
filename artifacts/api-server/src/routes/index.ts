import { Router, type IRouter } from "express";
import healthRouter from "./health";
import luminovaRouter from "./luminova";

const router: IRouter = Router();

router.use(healthRouter);
router.use(luminovaRouter);

export default router;
