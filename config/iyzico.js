const Iyzipay = require('iyzipay');

const apiKey = process.env.IYZICO_API_KEY || 'sandbox-api-key-mahallenin-mutfagi';
const secretKey = process.env.IYZICO_SECRET_KEY || 'sandbox-secret-key-mahallenin-mutfagi';
const baseUrl = process.env.IYZICO_BASE_URL || 'https://sandbox-api.iyzipay.com';

const iyzipay = new Iyzipay({
  apiKey,
  secretKey,
  uri: baseUrl
});

/**
 * Promise-based wrapper for iyzico checkoutFormInitialize
 */
function initializeCheckoutForm(request) {
  return new Promise((resolve, reject) => {
    iyzipay.checkoutFormInitialize.create(request, (err, result) => {
      if (err) {
        return reject(err);
      }
      resolve(result);
    });
  });
}

/**
 * Promise-based wrapper for iyzico checkoutForm.retrieve
 */
function retrieveCheckoutForm(token) {
  return new Promise((resolve, reject) => {
    iyzipay.checkoutForm.retrieve({ token }, (err, result) => {
      if (err) {
        return reject(err);
      }
      resolve(result);
    });
  });
}

module.exports = {
  iyzipay,
  initializeCheckoutForm,
  retrieveCheckoutForm,
  apiKey,
  secretKey,
  baseUrl
};
