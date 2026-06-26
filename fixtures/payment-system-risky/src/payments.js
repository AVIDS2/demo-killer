const express = require('express');
const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_FAKE');
const app = express();
app.use(express.json());

// In-memory store for raw card data — PCI violation
const cardStore = new Map();

// ---------------------------------------------------------------
// POST /charge — charge a card
// Problems:
//   - Stores raw card numbers (PCI violation)
//   - No amount validation (accepts negative, zero, or absurd amounts)
//   - No currency handling (amount is a bare number, no currency code)
//   - No idempotency key (duplicate submissions = duplicate charges)
//   - No rate limiting
// ---------------------------------------------------------------
app.post('/charge', async (req, res) => {
  try {
    const { cardNumber, expMonth, expYear, cvc, amount, email, description } = req.body;

    // Store raw card number — PCI DSS strictly forbids this
    cardStore.set(email, {
      cardNumber,
      expMonth,
      expYear,
      cvc,
      storedAt: new Date().toISOString(),
    });

    // No amount validation: accepts zero, negative, or impossibly large values
    // No currency code: Stripe requires currency; this will fail or default to USD silently
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount,  // raw number, no Math.round, no minimum check
      currency: 'usd', // hardcoded, not from request
      payment_method_data: {
        type: 'card',
        card: {
          number: cardNumber,
          exp_month: expMonth,
          exp_year: expYear,
          cvc: cvc,
        },
      },
      confirm: true,
      description: description || 'Charge',
    });

    res.json({
      success: true,
      paymentIntentId: paymentIntent.id,
      amount: amount,
      // Echoes back raw card data in response — another PCI violation
      card: {
        number: cardNumber,
        last4: cardNumber.slice(-4),
      },
    });
  } catch (err) {
    // Leaks internal error details to client
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

// ---------------------------------------------------------------
// POST /refund — refund a charge
// Problems:
//   - No refund amount limit (can refund more than original charge)
//   - No approval workflow (anyone can trigger unlimited refunds)
//   - No reason requirement
//   - No audit trail
//   - No rate limiting
// ---------------------------------------------------------------
app.post('/refund', async (req, res) => {
  try {
    const { paymentIntentId, amount, reason } = req.body;

    // No validation: amount could exceed original charge
    // No admin/authorization check: anyone with the endpoint can refund
    // No idempotency: duplicate requests = duplicate refunds
    const refund = await stripe.refunds.create({
      payment_intent: paymentIntentId,
      amount: amount,  // optional — if omitted, Stripe refunds full amount
      reason: reason || 'requested_by_customer',
    });

    res.json({
      success: true,
      refundId: refund.id,
      amount: refund.amount,
    });
  } catch (err) {
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

// ---------------------------------------------------------------
// GET /cards/:email — retrieve stored card data
// Problems:
//   - Returns full card number over HTTP
//   - No authentication
// ---------------------------------------------------------------
app.get('/cards/:email', (req, res) => {
  const card = cardStore.get(req.params.email);
  if (!card) {
    return res.status(404).json({ error: 'Card not found' });
  }
  // Returns full card number, CVC, expiration — massive PCI breach
  res.json(card);
});

// ---------------------------------------------------------------
// POST /cards — manually store card data
// Problems:
//   - No encryption at rest
//   - No access control
// ---------------------------------------------------------------
app.post('/cards', (req, res) => {
  const { email, cardNumber, expMonth, expYear, cvc } = req.body;
  cardStore.set(email, { cardNumber, expMonth, expYear, cvc, storedAt: new Date().toISOString() });
  res.json({ success: true, message: 'Card stored' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Payment service running on port ${PORT}`);
});

module.exports = app;
