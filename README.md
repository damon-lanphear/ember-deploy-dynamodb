# ember-deploy-dynamodb [![Build Status](https://travis-ci.org/damon-lanphear/ember-deploy-dynamodb.svg?branch=master)](https://travis-ci.org/damon-lanphear/ember-deploy-dynamodb) [![](https://ember-cli-deploy.github.io/ember-cli-deploy-version-badges/plugins/ember-deploy-dynamodb.svg)](http://ember-cli-deploy.github.io/ember-cli-deploy-version-badges/)

This is an implementation of the ember-deploy index store that uses [DynamoDB](http://aws.amazon.com/dynamodb) with
[ember-deploy](https://github.com/levelbossmike/ember-deploy).

## Rationale and Use Case ##

The default ember-deploy revision store uses redis.  Redis is perfectly fine for this application. If you are running entirely on AWS, however, your options for Redis are to run your own in EC2 or the Container Service or to use Elastic Cache. Elastic Cache is not an attractive option for this application because you cannot route to Elastic Cache unless you are in the same VPC as your Elastic Cache instance. This poses a problem for some CI systems.  If you prefer to run on entirely managed infrastructure then running your own Redis instance is not all that attractive either.

For AWS users who prefer a managed solution the best option for a publicly addressable, highly available, fully managed, persistent key value store with predictable performance is DynamoDB.  

An additional benefit to using DynamoDB to host the index.html revisions for your Ember application is that you get seamless integration with other managed services to deliver an end-to-end solution.  Below I describe how you can configure [AWS Lambda](http://aws.amazon.com/lambda) and [AWS API Gateway](http://aws.amazon.com/api-gateway) to serve your index.html revisions in a way that is low-cost, fully managed, and highly scalable.  [AWS Lambda](http://aws.amazon.com/lambda) and [AWS CloudFront](http://aws.amazon.com/cloudfront) are low cost because you pay per request, not per instance-hour. Further, [AWS API Gateway](http://aws.amazon.com/api-gateway) is transparently fronted with AWS CloudFront, a CDN solution. Through careful configuration of your HTTP cache-control headers you can reduce overall request volume to your DynamoDB and Lambda instances, offloading the requests to a cached instance of your live index.html in [AWS CloudFront](http://aws.amazon.com/cloudfront). 

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

## End-to-end Environment ##

You have several options for serving your index.html revisions out of DynamoDB. A relativel low-cost and fully managed solution is to use a combination of [AWS Lambda](http://aws.amazon.com/lambda) and [AWS API Gateway](http://aws.amazon.com/api-gateway) to serve your index.html documents.  To work with this setup you can implement the following, referring to the relevant documentation for each on service on the details:

### Create a Lambda Function ###

The following [AWS Lambda](http://aws.amazon.com/lambda) function will retrieve the current pointer from DynamoDB, dereference it and retrieve the resulting revision. You will need to change the app name and table-name to match your configuration. The resulting document is decoded from the byte form stored in DynamoDB, assuming a UTF-8 encoding, and return a JSON document with the index.html set to the html property.

```javascript
console.log('Loading function');

var AWS = require("aws-sdk");
var doc = require('dynamodb-doc');

AWS.config.update({region: "us-west-2"});

var ddb = new AWS.DynamoDB();

exports.handler = function(event, context) {
 
    var params = {};
    params.TableName = 'table-name';
    params.Key = {};
    params.Key.id = {
        S: 'app:current'
    };
        
    ddb.getItem(params, function(err, item) {
        if(err) {
            context.fail(err);
        } else {
            var p = {};
            p.TableName = 'table-name';
            p.Key = {};
            p.Key.id = {
                S: item.Item.value.S
            };

            ddb.getItem(p, function(err, index) {
                if (err) {
                    context.fail(err);
                } else {
                    var resp = {};
                    resp.html = index.Item.value.B.toString('utf8')
                    context.succeed(resp);
                }
            });
        }
    });
};
```

### Create a AWS API Gateway Resource ###

Following the documentation for the AWS API Gateway, create a resource that is backed by your lambda function. This resource will typically support only GET. The resource will need to have a AWA API Gateway model definition and mapping template that will extract the html property and convert it to an HTML body for the response. The model and template should look as follows:

Model:

```javascript
{
  "$schema": "http://json-schema.org/draft-04/schema#",
  "title": "LambdaIndexModel",
  "type": "object",
  "properties": {
    "html": { "type": "string" }
    }
}
```

And your resource mapping template should look as follows:

```
#set($inputRoot = $input.path('$'))
$inputRoot.html
```
