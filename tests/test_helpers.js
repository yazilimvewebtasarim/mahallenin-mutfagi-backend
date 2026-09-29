const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../middleware/auth');

function getCustomerToken(userId = 'customer1') {
  return jwt.sign({ userId, email: 'customer@test.com', role: 'customer' }, JWT_SECRET);
}

function getChefToken(userId = 'chef1') {
  return jwt.sign({ userId, email: 'chef@test.com', role: 'chef' }, JWT_SECRET);
}

module.exports = { getCustomerToken, getChefToken };
