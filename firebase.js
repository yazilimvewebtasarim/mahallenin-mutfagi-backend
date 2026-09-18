const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.cert(serviceAccount)
});

const db = getFirestore();

module.exports = { admin, db };
