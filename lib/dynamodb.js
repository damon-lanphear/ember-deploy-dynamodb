var CoreObject = require('core-object');
var RSVP = require('rsvp');
var DDB = require('./dynamodb-client');

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
  }
});
