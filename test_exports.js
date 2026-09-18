const index = require('./index.js');
console.log('Exports:', Object.keys(index));
if (!index.onUserCreated || !index.api) {
  console.error('Error: Required exports not found!');
  process.exit(1);
}
console.log('Test passed.');
process.exit(0);
