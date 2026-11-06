import { Router } from 'express';
import { billingService } from '../services/billingService.js';
import { billingConfig, PRO_PLAN } from '../config/billing.js';
import { getDailyLimits } from '../config/usageLimits.js';
import { creatorOf, requireUser } from '../middlewares/auth.js';
import { requireDatabase } from '../middlewares/requireDatabase.js';
import { billingWriteLimiter } from '../middlewares/burstLimits.js';

export function createBillingRouter({ service = billingService, settings = billingConfig, limiter = billingWriteLimiter } = {}) {
  const router = Router();
  router.use((req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
  router.get('/plan', (req, res) => res.json({ mode: settings.mode, available: settings.enabled,
    pro: PRO_PLAN, freeDailyLimits: getDailyLimits('user') }));
  router.use(requireUser, requireDatabase);
  router.get('/status', async (req, res) => res.json({ account: await service.read(creatorOf(req)) }));
  router.post('/checkout', limiter, async (req, res) => res.json(await service.checkout(creatorOf(req))));
  router.post('/verify', limiter, async (req, res) => res.json({ account: await service.verify(creatorOf(req), req.body) }));
  router.post('/sync', limiter, async (req, res) => res.json({ account: await service.sync(creatorOf(req)) }));
  router.post('/cancel', limiter, async (req, res) => res.json({ account: await service.sync(creatorOf(req), { cancel: true }) }));
  return router;
}

export function createBillingWebhook({ service = billingService } = {}) {
  return async (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    res.json(await service.webhook(req.body, req.get('X-Razorpay-Signature'), req.get('X-Razorpay-Event-Id')));
  };
}

export default createBillingRouter();
