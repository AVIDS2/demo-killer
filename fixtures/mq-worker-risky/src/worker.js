const { Queue, Worker } = require('bullmq');
const Redis = require('ioredis');

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: 6379,
});

/**
 * Payment notification worker.
 * Processes incoming payment events from the webhook queue and updates order status.
 * NO idempotency: duplicate messages will charge/notify twice.
 * NO dead letter queue: poison messages block the queue forever.
 * NO backoff: immediate retries hammer downstream services.
 * NO concurrency limit: thousands of concurrent jobs can overwhelm the DB.
 * NO graceful shutdown: in-flight jobs are lost on SIGTERM.
 * NO schema validation: malformed payloads crash the worker silently.
 */
const paymentWorker = new Worker(
  'payment-notifications',
  async (job) => {
    const { orderId, amount, userId, paymentMethod, cardLast4, status } = job.data;

    // --- Simulate raw DB work (no transactions, no idempotency key) ---
    console.log(`Processing payment for order ${orderId}, amount ${amount}`);

    // Call payment gateway (no idempotency — retries will double-charge)
    const chargeResult = await callPaymentGateway({
      amount,
      paymentMethod,
      cardLast4,
      orderId,
    });

    // Update order status (no transaction — partial failure leaves inconsistent state)
    await updateOrderStatus(orderId, 'paid');

    // Send notification email (fire-and-forget, no error handling)
    await sendNotificationEmail(userId, orderId, amount);

    // Update analytics (no batching, writes to DB on every single message)
    await updateAnalytics(orderId, amount, userId);

    return { success: true, chargeId: chargeResult.id };
  },
  {
    connection: redis,
    // No concurrency limit specified — BullMQ defaults to a high number
    // No limiter configured — no rate limiting on the queue
  }
);

// No dead letter queue handler — failed jobs just retry immediately forever
// No backoff strategy — retries happen with no delay
// No retry configuration at all — uses BullMQ defaults (immediate retry 3x then fail)

async function callPaymentGateway({ amount, paymentMethod, cardLast4, orderId }) {
  // Simulates calling an external payment API
  // No timeout, no circuit breaker, no retry with backoff
  console.log(`Charging ${amount} via ${paymentMethod} (card ending ${cardLast4})`);
  return { id: `charge_${orderId}_${Date.now()}` };
}

async function updateOrderStatus(orderId, status) {
  // Simulates direct DB write — no transaction wrapping, no conflict resolution
  console.log(`Order ${orderId} status -> ${status}`);
}

async function sendNotificationEmail(userId, orderId, amount) {
  // Fire-and-forget email — no error handling, no retry
  console.log(`Sending email to user ${userId} for order ${orderId}`);
}

async function updateAnalytics(orderId, amount, userId) {
  // Synchronous DB write on every message — no batching or aggregation
  console.log(`Analytics: order=${orderId} amount=${amount} user=${userId}`);
}

// --- NO SIGTERM / graceful shutdown handler ---
// In-flight jobs are killed mid-execution, leaving orders in inconsistent states.

// --- NO health check endpoint ---
// No way for orchestrators to know if the worker is healthy.

module.exports = { paymentWorker };
