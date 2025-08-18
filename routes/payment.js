const express = require('express');
const router = express.Router();
const Stripe = require('stripe');
const stripeSecret = process.env.STRIPE_SECRET_KEY;
const stripe = stripeSecret ? Stripe(stripeSecret) : null;
const paypal = require('@paypal/checkout-server-sdk');

// PayPal environment setup
function paypalClient() {
  const clientId = process.env.PAYPAL_CLIENT_ID || '';
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET || '';
  const Environment = process.env.PAYPAL_MODE === 'live'
    ? paypal.core.LiveEnvironment
    : paypal.core.SandboxEnvironment;
  return new paypal.core.PayPalHttpClient(new Environment(clientId, clientSecret));
}

router.get('/pay', (req, res) => {
  res.render('payment');
});

router.post('/pay/stripe', async (req, res) => {
  try {
    if (!stripe) throw new Error('Stripe not configured');
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: { name: 'Tuition Payment' },
            unit_amount: 10000,
          },
          quantity: 1,
        },
      ],
      success_url: `${req.protocol}://${req.get('host')}/payment/success`,
      cancel_url: `${req.protocol}://${req.get('host')}/payment/cancel`,
    });
    res.redirect(303, session.url);
  } catch (err) {
    console.error(err);
    res.status(500).send('Unable to create Stripe checkout session');
  }
});

router.post('/pay/paypal', async (req, res) => {
  try {
    const request = new paypal.orders.OrdersCreateRequest();
    request.prefer('return=representation');
    request.requestBody({
      intent: 'CAPTURE',
      purchase_units: [{ amount: { currency_code: 'USD', value: '100.00' } }],
      application_context: {
        return_url: `${req.protocol}://${req.get('host')}/payment/success`,
        cancel_url: `${req.protocol}://${req.get('host')}/payment/cancel`,
      },
    });
    const client = paypalClient();
    const order = await client.execute(request);
    const approveUrl = order.result.links.find(l => l.rel === 'approve').href;
    res.redirect(303, approveUrl);
  } catch (err) {
    console.error(err);
    res.status(500).send('Unable to create PayPal order');
  }
});

router.get('/payment/success', (req, res) => {
  res.render('payment_success');
});

router.get('/payment/cancel', (req, res) => {
  res.render('payment_cancel');
});

module.exports = router;