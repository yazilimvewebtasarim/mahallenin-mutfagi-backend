require('dotenv').config();
const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth');
const foodRoutes = require('./routes/foods');
const customerRoutes = require('./routes/customer');
const orderRoutes = require('./routes/orders');
const chefOrderRoutes = require('./routes/chef_orders');
const paymentRoutes = require('./routes/payments');
const reviewRoutes = require('./routes/reviews');
const storiesRoutes = require('./routes/stories');
const financeRoutes = require('./routes/finance');
const aiRoutes = require('./routes/ai');
const chefSubscriptionRoutes = require('./routes/chef_subscription');
const customerRequestsRoutes = require('./routes/customer_requests');
const chefRequestsRoutes = require('./routes/chef_requests');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/chef/foods', foodRoutes);
app.use('/api/v1/customer', customerRoutes);
app.use('/api/v1/customer/requests', customerRequestsRoutes);
app.use('/api/v1/chef/requests', chefRequestsRoutes);
app.use('/api/v1/orders', orderRoutes);
app.use('/api/v1/chef/orders', chefOrderRoutes);
app.use('/api/v1/payment', paymentRoutes);
app.use('/api/v1/reviews', reviewRoutes);
app.use('/api/v1/stories', storiesRoutes);
app.use('/api/v1/chef/finance', financeRoutes);
app.use('/api/v1/ai', aiRoutes);
app.use('/api/v1/chef/subscription', chefSubscriptionRoutes);

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something broke!' });
});

module.exports = app;
