# Ember-deploy-dynamodb [![Build Status](hhttps://travis-ci.org/damon-lanphear/ember-deploy-dynamodb.svg?branch=master)](https://travis-ci.org/damon-lanphear/ember-deploy-dynamodb)

This is an implementation of the ember-deploy index store that uses [DynamoDB](http://aws.amazon.com/dynamodb) with
[ember-deploy](https://github.com/levelbossmike/ember-deploy).

This module is currently a **work in progress** and not ready for use.

### Deploying Your Ember App

```javascript
module.exports = {
  development: {
    buildEnv: 'development',
    store: {
      type: 'dynamodb',
      accessKey: process.env['AWS_ACCESS_KEY'],
      secretKey: process.env['AWS_SECRET_KEY'],
      region: '<your-aws-region-code>',
      table: '<your-table-name>'
    }
  }
};
```