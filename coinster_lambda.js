'use strict';
const fetch = require('node-fetch');
const moment = require('moment');
const AWS = require('aws-sdk');
const encrypted = process.env['DB_API_KEY'];
const apiHost = process.env['API_HOST'];
const bucketId = process.env['BUCKET_ID'];
let decrypted;

console.log('Loading event');

function processEvent(event, context, callback) {
const s3 = new AWS.S3({ signatureVersion: 'v4' });
const yesterday = moment().subtract(1, 'day').toISOString();
const host = apiHost;
const fields = JSON.stringify({
  _id: 0,
  price_raw: 0,
  currency: 0,
});

function getUrl(currency) {
  const query = JSON.stringify({
    type: currency,
    date: {
      $gt: {
        $date: yesterday,
      },
    },
  });
  return `${host}?f=${fields}&q=${query}&apiKey=${decrypted}`;
}

const promises = ['bitcoin', 'ethereum', 'bitcoin_cash'].map(currency => (
  fetch(getUrl(currency)).then(res  => res.json())
));

Promise.all(promises)
  .then(([bitcoin, ethereum, bitcoin_cash]) => {
      const obj = {
          bitcoin: bitcoin.reverse(),
          ethereum: ethereum.reverse(),
          bitcoin_cash: bitcoin_cash.reverse(),
      };
        const params = {
    Bucket: bucketId,
    Key: 'prices.json',
    Body: JSON.stringify(obj),
    ACL: 'public-read',
    ContentType: 'application/json',
    CacheControl: 'max-age=300',
  };
  s3.putObject(params, (err, data) => {
    if (err) { console.log(err); }
    else { callback(null, true); }
  });
  });
}

exports.handler = (event, context, callback) => {
  if (decrypted) {
    processEvent(event, context, callback);
  } else {
    // Decrypt code should run once and variables stored outside of the function
    // handler so that these are decrypted once per container
    const kms = new AWS.KMS();
    kms.decrypt({ CiphertextBlob: new Buffer(encrypted, 'base64') }, (err, data) => {
      if (err) {
        console.log('Decrypt error:', err);
        return callback(err);
      }
      decrypted = data.Plaintext.toString('ascii');
      processEvent(event, context, callback);
    });
  }
};
