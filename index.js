/* jshint node: true */
'use strict';

var path      = require('path');
var fs        = require('fs');

var denodeify = require('rsvp').denodeify;
var readFile  = denodeify(fs.readFile);

var DeployPluginBase = require('ember-cli-deploy-plugin');
var DynamoDBAdapter = require('./lib/dynamodb');

var DEFAULT_MANIFEST_SIZE = 10;

module.exports = {
  name: 'ember-cli-deploy-dynamodb',

  createDeployPlugin: function(options) {
    var DeployPlugin = DeployPluginBase.extend({
      name: options.name,

      defaultConfig: {
        distDir: function(context) {
          return context.distDir;
        },
        manifestSize: DEFAULT_MANIFEST_SIZE,
        revisionKey: function(context) {
          return context.commandOptions.revision || (context.revisionData && context.revisionData.revisionKey);
        },
      },

      requiredConfig: ['accessKeyId', 'secretAccessKey', 'region', 'table', 'indexName'],

      upload: function(context) {
        var revisionKey = this.readConfig('revisionKey');
        var distDir = this.readConfig('distDir');

        var options = {
          manifest: this.readConfig('manifestSize'),
          accessKeyId: this.readConfig('accessKeyId'),
          secretAccessKey: this.readConfig('secretAccessKey'),
          region: this.readConfig('region'),
          table: this.readConfig('table'),
          indexName: this.readConfig('indexName')
        };

        var DynamoDB = new DynamoDBAdapter(options);

        return this._readFileContents(path.join(distDir, "index.html"))
          .then(function(indexContents) {
            return DynamoDB.upload(indexContents, revisionKey);
          }).then(this._uploadSuccessMessage.bind(this))
          .then(function(key) {
           return { dynamodbKey: key };
         })
         .catch(this._errorMessage.bind(this));
      },

      _readFileContents: function(path) {
        return readFile(path)
        .then(function(buffer) {
          return buffer.toString();
        });
      },

      _uploadSuccessMessage: function(key) {
        this.log('Uploaded with key `' + key + '`', { verbose: true });
        return Promise.resolve(key);
      },

      _errorMessage: function(error) {
        this.log(error, { color: 'red' });
        return Promise.reject(error);
      }
    });

    return new DeployPlugin();
  }
};
