const AWS = require('aws-sdk');

const dynamodb = new AWS.DynamoDB.DocumentClient({
  region: 'us-west-2' // غيّرها حسب منطقتك
});

const TABLE_NAME = 'Todos';

module.exports = { dynamodb, TABLE_NAME };
