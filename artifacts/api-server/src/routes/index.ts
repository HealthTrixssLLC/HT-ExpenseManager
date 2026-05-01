import { Router, type IRouter } from "express";
import healthRouter from "./health";
import storageRouter from "./storage";
import authRouter from "./auth";
import lookupsRouter from "./lookups";
import reportsRouter from "./reports";
import managerRouter from "./manager";
import financeRouter from "./finance";
import payrollRouter from "./payroll";
import adminRouter from "./admin";
import qboOauthRouter from "./qboOauth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(storageRouter);
router.use(authRouter);
router.use(lookupsRouter);
router.use(reportsRouter);
router.use(managerRouter);
router.use(financeRouter);
router.use(payrollRouter);
// QBO OAuth callback must register BEFORE the admin router, since the admin
// router's requireAuth gate would otherwise block the unauthenticated browser
// redirect coming back from Intuit.
router.use(qboOauthRouter);
router.use(adminRouter);

export default router;
