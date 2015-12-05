# ember-cli-deploy-dynamodb [![Build Status](https://travis-ci.org/damon-lanphear/ember-deploy-dynamodb.svg?branch=master)](https://travis-ci.org/damon-lanphear/ember-deploy-dynamodb) [![](https://ember-cli-deploy.github.io/ember-cli-deploy-version-badges/plugins/ember-deploy-dynamodb.svg)](http://ember-cli-deploy.github.io/ember-cli-deploy-version-badges/)

> An ember-cli-deploy plugin to upload index.html to a DynamoDB store

#### WARNING: This plugin is only compatible with ember-cli-deploy versions >= 0.5.0 (see v0.4.0 tag for old version)

This plugin uploads a file, presumably index.html, to a specified [DynamoDB](http://aws.amazon.com/dynamodb) database.

## Rationale and Use Case ##

The default ember-deploy revision store uses DynamoDB.  DynamoDB is perfectly fine for this application. If you are running entirely on AWS, however, your options for DynamoDB are to run your own in EC2 or the Container Service or to use Elastic Cache. Elastic Cache is not an attractive option for this application because you cannot route to Elastic Cache unless you are in the same VPC as your Elastic Cache instance. This poses a problem for some CI systems.  If you prefer to run on entirely managed infrastructure then running your own DynamoDB instance is not all that attractive either.

For AWS users who prefer a managed solution the best option for a publicly addressable, highly available, fully managed, persistent key value store with predictable performance is DynamoDB.  

An additional benefit to using DynamoDB to host the index.html revisions for your Ember application is that you get seamless integration with other managed services to deliver an end-to-end solution.  Below I describe how you can configure [AWS Lambda](http://aws.amazon.com/lambda) and [AWS API Gateway](http://aws.amazon.com/api-gateway) to serve your index.html revisions in a way that is low-cost, fully managed, and highly scalable.  [AWS Lambda](http://aws.amazon.com/lambda) and [AWS CloudFront](http://aws.amazon.com/cloudfront) are low cost because you pay per request, not per instance-hour. Further, [AWS API Gateway](http://aws.amazon.com/api-gateway) is transparently fronted with AWS CloudFront, a CDN solution. Through careful configuration of your HTTP cache-control headers you can reduce overall request volume to your DynamoDB and Lambda instances, offloading the requests to a cached instance of your live index.html in [AWS CloudFront](http://aws.amazon.com/cloudfront).

## What is an ember-cli-deploy plugin?

A plugin is an addon that can be executed as a part of the ember-cli-deploy pipeline. A plugin will implement one or more of the ember-cli-deploy's pipeline hooks.

For more information on what plugins are and how they work, please refer to the [Plugin Documentation][1].

## Installation ##

Execute the following in your ember-cli project:

- Install this plugin `npm install --save-dev ember-cli-deploy-ddb`

- Place the following configuration into `config/deploy.js`

```js
ENV.dynamodb = {
  accessKeyId: 'AWS_ACCESS_KEY',
  secretAccessKey: 'AWS_SECRET_KEY',
  region: 'AWS_DYNAMODB_REGION',
  table: 'AWS_DYNAMODB_TABLE',
  indexName: 'AWS_DYNAMODB_INDEX'
};
```

## Configuration ##

To use DynamoDB as your revision storage for ember deployment you first need to set up a DynamoDB table and GSI. The table stores the revisions along with a row that refers to the current revision. It has hash key which maps to the 'id' attribute of each row. The 'id' attribute is a string. Each row consists of the id, which is the revision identifier, a created timestamp in milliseconds since the epoch, and the revision index.html.

The GSI is used to provide a total ordering if the revisions by their creation time. The ordered index is required to determine which revisions are to be expired as new revisions are added.  The 10 most revisions are maintained by default.

### Configuration Steps ###

Using the AWS console or your AWS CLI of choice

1.  Select the AWS region in which you will create your revision table and make a note of it. You will need the revision code (e.g. us-west-2) to configure ember-deploy-dynamodb.
2. Create a new DynamoDB table. Set the hash key to the 'id' String attribute. Do not set a Range Key.
3. Create a new GSI. The GSI will use the 'manifest' String attribute as the hash key and the 'created' Number attribute as the range key. Project all attributes to the GSI.
4. Allocate sufficient read and write capacity for your application. The read capacity required will depend on the number of request per second you anticipate on your site. The write capacity can be far lower since you need the capacity during deployment or inspection operations. A good starting point for write capacity is 10 write capacity units. A good starting point for read capacity is 1 read capacity unit for each uncache request per second you plan to handle.

## End-to-end Environment ##

You have several options for serving your index.html revisions out of DynamoDB. A relatively low-cost and fully managed solution is to use a combination of [AWS Lambda](http://aws.amazon.com/lambda) and [AWS API Gateway](http://aws.amazon.com/api-gateway) to serve your index.html documents.  To work with this setup you can implement the following, referring to the relevant documentation for each on service on the details:

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

## ember-cli-deploy Hooks Implemented

For detailed information on what plugin hooks are and how they work, please refer to the [Plugin Documentation][1].

- `upload`
- `activate`
- `fetchRevisions`
- `didDeploy`

## Configuration Options

For detailed information on how configuration of plugins works, please refer to the [Plugin Documentation][1].

### accessKeyId (`required`)

The AWS access key for the user that has the ability to upload to the database.

*Default:* `undefined`

### secretAccessKey (`required`)

The AWS secret for the user that has the ability to upload to the database.

*Default:* `undefined`

### table (`required`)

The DynamoDB table name that the file will be uploaded to.

*Default:* `undefined`

### region (`required`)

The region the database is located in.

*Default:* `undefined`

### indexName (`required`)

The index of the column containing the revision.

*Default:* `undefined`

### filePattern

A file matching this pattern will be uploaded to DynamoDB.

*Default:* `'index.html'`

### distDir

The root directory where the file matching `filePattern` will be searched for. By default, this option will use the `distDir` property of the deployment context.

*Default:* `context.distDir`

### keyPrefix

The prefix to be used for the DynamoDB key under which file will be uploaded to DynamoDB. The DynamoDB key will be a combination of the `keyPrefix` and the `revisionKey`. By default this option will use the `project.name()` property from the deployment context.

*Default:* `context.project.name() + ':index'`

### activationSuffix

The suffix to be used for the DynamoDB key under which the activated revision will be stored in DynamoDB. By default this option will be `"current"`. This makes the default activated revision key in DynamoDB looks like: `project.name() + ':index:current'`

*Default:* `current`

### revisionKey

The unique revision number for the version of the file being uploaded to DynamoDB. The DynamoDB key will be a combination of the `keyPrefix` and the `revisionKey`. By default this option will use either the `revisionKey` passed in from the command line or the `revisionData.revisionKey` property from the deployment context.

*Default:* `context.commandLineArgs.revisionKey || context.revisionData.revisionKey`


## Activation

As well as uploading a file to DynamoDB, *ember-cli-deploy-dynamodb* has the ability to mark a revision of a deployed file as `current`.

### How do I activate a revision?

A user can activate a revision by either:

- Passing a command line argument to the `deploy` command:

```bash
$ ember deploy --activate=true
```

- Running the `deploy:activate` command:

```bash
$ ember deploy:activate <revision-key>
```

- Setting the `activateOnDeploy` flag in `deploy.js`

```javascript
ENV.pipeline = {
  activateOnDeploy: true
}
```

### When does activation occur?

Activation occurs during the `activate` hook of the pipeline. By default, activation is turned off and must be explicitly enabled by one of the 3 methods above.

## Prerequisites

The following properties are expected to be present on the deployment `context` object:

- `distDir`                     (provided by [ember-cli-deploy-build][2])
- `project.name()`              (provided by [ember-cli-deploy][3])
- `revisionData.revisionKey`    (provided by [ember-cli-deploy-revision-data][4])
- `commandLineArgs.revisionKey` (provided by [ember-cli-deploy][3])
- `deployEnvironment`           (provided by [ember-cli-deploy][3])

## Running Tests

- `npm test`

[1]: http://ember-cli.github.io/ember-cli-deploy/plugins "Plugin Documentation"
[2]: https://github.com/ember-cli-deploy/ember-cli-deploy-build "ember-cli-deploy-build"
[3]: https://github.com/ember-cli/ember-cli-deploy "ember-cli-deploy"
[4]: https://github.com/ember-cli-deploy/ember-cli-deploy-revision-data "ember-cli-deploy-revision-data"
