# Ember-deploy-dynamodb

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
      accessKeyId: '<your-access-key-goes-here>',
      secretAccessKey: process.env['AWS_ACCESS_KEY'],
      region: '<you-aws-region-code>'
    }
  }
};
```
