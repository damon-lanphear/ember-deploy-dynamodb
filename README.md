# ember-deploy-dynamodb [![Build Status](https://travis-ci.org/damon-lanphear/ember-deploy-dynamodb.svg?branch=master)](https://travis-ci.org/damon-lanphear/ember-deploy-dynamodb)

This is an implementation of the ember-deploy index store that uses [DynamoDB](http://aws.amazon.com/dynamodb) with
[ember-deploy](https://github.com/levelbossmike/ember-deploy).

## Rationale and Use Case ##

The default ember-deploy revision store uses redis.  Redis is perfectly fine for this application. If you are running entirely on AWS, however, your options for Redis are to run your own in EC2 or the Container Service or to use Elastic Cache. Elastic Cache is not an attractive option for this application because you cannot route to Elastic Cache unless you are in the same VPC as your Elastic Cache instance. This poses a problem for some CI systems.  If you prefer to run on entirely managed infrastructure then running your Redis instance is not all that attractive either.

For AWS users the best option for a publicly addressable, highly available, fully managed, persistent key value store with predictable performance is DynamoDB.

## Installation ##

Execute the following in your ember-cli project:

`npm install --save-dev ember-deploy-ddb`

## Configuration ##

To use DynamoDB as your revision storage for ember deployment you frst need to set up a DynamoDB table and GSI. The table stores the revisions along with a row that refers to the current revision. It has hash key which maps to the 'id' attribute of each row. The 'id' attribute is a string. Each row consists of the id, which is the reivision identifier, a created timestamp in milliseconds since the epoch, and the revision index.html. 

The GSI is used to provide a total ordering if the reivsions by their creation time. The ordered index is required to determine which revisions are to be expired as new revisions are added.  The 10 most revisions are maintained by default.

### Configuration Steps ###

Using the AWS console or your AWS CLI of choice

1.  Select the AWS region in which you will create your revision table and make a note of it. You will need the revision code (e.g. us-west-2) to configure ember-deploy-dynamodb.
2. Create a new DynamoDB table. Set the hash key to the 'id' String attribute. Do not set a Range Key.
3. Create a new GSI. The GSI will use the 'manifest' String attribute as the hash key and the 'created' Number attribute as the range key. Project all attributes to the GSI.
4. Allocate sufficient read and write capacity for your application. The read capacity required will depent on the number of request per second you anticipate on your site. The write capacity can be far lower since you need the capacity during deployment or inspection operations. A good starting point for write capacity is 10 write capacity units. A good starting point for read capacity is 1 read capacity unit for each uncache request per second you plan to handle.


### Deploying Your Ember App

```javascript
module.exports = {
  development: {
    buildEnv: 'development',
    store: {
      type: 'dynamodb',
      accessKeyId: process.env['AWS_ACCESS_KEY'],
      secretAccessKey: process.env['AWS_SECRET_KEY'],
      region: '<your-aws-region-code>',
      table: '<your-table-name>',
      index: '<your-gsi-name>'
    }
  }
};
```