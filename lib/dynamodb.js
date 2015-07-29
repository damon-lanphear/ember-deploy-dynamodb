var CoreObject = require('core-object');
var RSVP = require('rsvp');
var chalk = require('chalk');
var Promise = require('ember-cli/lib/ext/promise');
var SilentError = require('silent-error');
var AWS = require('aws-sdk');
var async = require('async');
var DDB = require('./dynamodb-client');

var DEFAULT_MANIFEST_SIZE = 10;
var DEFAULT_TAGGING_ADAPTER = 'sha';

var green = chalk.green;
var white = chalk.white;

module.exports = CoreObject.extend({
  init: function(options) {
    this._super(options);

    if (options.manifestSize) {
      this.manifestSize = options.manifestSize;
    } else {
      this.manifestSize = DEFAULT_MANIFEST_SIZE;
    }

    var cfg = {
      accessKeyId: options.accessKeyId,
      secretAccessKey: options.secretAccessKey,
      region: options.region,
      table: options.table,
      indexName: options.indexName
    };

    this.ddb = new DDB(cfg);
  },

  upload: function(value) {
    var key = this.taggingAdapter.createTag();

    return this._upload(value, key);
  },

  list: function() {
    return RSVP.hash({
        revisions: this._list(),
        current: this._current()
      })
      .then(function(results) {
        var revisions = results.revisions;
        var current = results.current;

        var message = this._revisionListMessage(revisions, current);

        this._printSuccessMessage(message);

        return message;
      }.bind(this));
  },

  activate: function(revisionKey) {
    if (!revisionKey) {
      return this._printErrorMessage(this._noRevisionPassedMessage());
    }

    var uploadKey = this._currentKey();
    var that = this;

    return this._list()
      .then(function(uploads) {
        return uploads.indexOf(revisionKey) > -1 ? RSVP.resolve() : RSVP.reject();
      })
      .then(function() {
        return that.ddb.setCurrentRevision(uploadKey, revisionKey);
      })
      .then(this._activationSuccessfulMessage)
      .then(this._printSuccessMessage.bind(this))
      .catch(function(err) {
        return this._printErrorMessage(this._revisionNotFoundMessage());
      }.bind(this));
  },

  _list: function() {
    return this.ddb.listAll();
  },

  _current: function() {
    return this.ddb.getRevision(this._currentKey());
  },

  _upload: function(value, key) {
    var that = this;

    return this._uploadIfNotAlreadyInManifest(value, key)
      .then(function() {
        return that.ddb.trim(that.manifestSize);
      })
      .then(this._deploySuccessMessage.bind(this, key))
      .then(this._printSuccessMessage.bind(this))
      .then(function() {
        return key;
      })
      .catch(function(err) {
        if (err) {
          console.dir(err);
        }
        var message = this._deployErrorMessage();
        return this._printErrorMessage(message);
      }.bind(this));
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
  },

  _revisionListMessage: function(revisions, currentRevision) {
    var manifestSize = this.manifestSize;
    var headline = '\nLast ' + manifestSize + ' uploaded revisions:\n\n';
    var footer = '\n\n# => - current revision';
    var revisionsList = revisions.reduce(function(prev, curr) {
      var prefix = (curr === currentRevision) ? '| => ' : '|    ';
      return prev + prefix + chalk.green(curr) + '\n';
    }, '');

    return headline + revisionsList + footer;
  }
});