var CoreObject = require('core-object');
var RSVP = require('rsvp');
var chalk = require('chalk');
var Promise = require('ember-cli/lib/ext/promise');
var SilentError = require('silent-error');
var AWS = require('aws-sdk');
var async = require('async');
var DDB = require('./dynamodb-client');

var green = chalk.green;
var white = chalk.white;

module.exports = CoreObject.extend({
  init: function(options) {
    this._super(options);

    this.manifestSize = options.manifestSize;

    var ddbConfig = {
      accessKeyId: options.accessKeyId,
      secretAccessKey: options.secretAccessKey,
      region: options.region,
      table: options.table,
      indexName: options.indexName
    };

    this.ddb = new DDB(ddbConfig);
  },

  upload: function(value, key) {
    var that = this;

    return this._uploadIfNotAlreadyInManifest(value, key)
      .then(function() {
        return that.ddb.trim(that.manifestSize);
      }).then(function() {
        return key;
      });
  },

  list: function(currentKey) {
    return RSVP.hash({
        revisions: this._list(),
        current: this._current(currentKey)
      })
      .then(function(results) {
        var current = results.current;
        var revisions = results.revisions.map(function(revision) {
          return { revision: revision, active: current === revision };
        });

        return revisions;
      }.bind(this));
  },

  activate: function(revisionKey, currentKey) {
    var that = this;

    return this._list()
      .then(function(uploads) {
        return uploads.indexOf(revisionKey) > -1 ? RSVP.resolve() : RSVP.reject(new Error('revision not found'));
      })
      .then(function() {
        return that.ddb.setCurrentRevision(currentKey, revisionKey);
      });
  },

  _list: function() {
    return this.ddb.listAll();
  },

  _current: function(currentKey) {
    return this.ddb.getRevision(currentKey);
  },

  _uploadIfNotAlreadyInManifest: function(value, key) {
    return this.ddb.appendRevision(key, value);
  },

  _currentKey: function() {
    return this.manifest + ':current';
  },

  _printSuccessMessage: function(message) {
    return this.ui.writeLine(message);
  },

  _printErrorMessage: function(message) {
    return Promise.reject(new SilentError(message));
  },

  _deploySuccessMessage: function(revisionKey) {

    var success = green('\nUpload successful!\n\n');
    var uploadMessage = white('Uploaded revision: ') + green(revisionKey);

    return success + uploadMessage;
  },

  _deployErrorMessage: function() {
    var failure = '\nUpload failed!\n';
    var suggestion = 'Did you try to upload an already uploaded revision?\n\n';
    var solution = 'Please run `' + green('ember deploy:list') + '` to ' +
      'investigate.';

    return failure + '\n' + white(suggestion) + white(solution);
  },

  _noRevisionPassedMessage: function() {
    var err = '\nError! Please pass a revision to `deploy:activate`.\n\n';

    return err + white(this._revisionSuggestion());
  },

  _activationSuccessfulMessage: function() {
    var success = green('\nActivation successful!\n\n');
    var message = white('Please run `' + green('ember deploy:list') + '` to see ' +
      'what revision is current.');

    return success + message;
  },

  _revisionNotFoundMessage: function() {
    var err = '\nError! Passed revision could not be found in manifest!\n\n';

    return err + white(this._revisionSuggestion());
  },

  _revisionSuggestion: function() {
    var suggestion = 'Try to run `' + green('ember deploy:list') + '` ' +
      'and pass a revision listed there to `' +
      green('ember deploy:activate') + '`.\n\nExample: \n\n' +
      'ember deploy:activate --revision <manifest>:<sha>';

    return suggestion;
  }
});
