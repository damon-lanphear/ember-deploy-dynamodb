/* jshint node: true */
'use strict';

var DynamoDBAdapter = require('./lib/dynamodb');

module.exports = {
  name: 'ember-deploy-dynamodb',
  type: 'ember-deploy-addon',

  adapters: {
    index: {
      'dynamodb': DynamoDBAdapter
    }
  }
};
