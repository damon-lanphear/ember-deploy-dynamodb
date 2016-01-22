var CoreObject = require('core-object');
var chai = require('chai');
var chaiAsPromised = require('chai-as-promised');
var MockUI = require('ember-cli/tests/helpers/mock-ui');
var SilentError = require('silent-error');
var RSVP = require('rsvp');
var AWS = require('aws-sdk');
var DDB = require('../../../lib/dynamodb-client');
var DynamoDBAdapter = require('../../../lib/dynamodb');

chai.use(chaiAsPromised);
var expect = chai.expect;

var REVISION_KEY = 'test';
var DOCUMENT_TO_SAVE = 'Hello';
var UPLOAD_KEY = 'ember-deploy:' + REVISION_KEY;
var CURRENT_KEY = 'ember-deploy:current';
var MANIFEST_SIZE = 10;

var cfg = {
  accessKeyId: process.env.AWS_ACCESS_KEY,
  secretAccessKey: process.env.AWS_SECRET_KEY,
  region: 'us-west-2',
  table: 'ember-deploy-test',
  indexName: 'manifest-created-index'
};

var ddb = new DDB(cfg);

var ddbAdapter;
var upload;

var cleanUpDDB = function(done) {
  ddb.clear().then(done).catch(done);
};

var uploadWithRevisionKey = function(key) {
  key = key === undefined ? '' : key;
  return ddbAdapter.upload(DOCUMENT_TO_SAVE, UPLOAD_KEY + key);
};

var fillUpManifest = function(uploadCount) {
  var promises = [];

  for (var i = 0; i < uploadCount; i++) {
    promises.push(uploadWithRevisionKey(i));
  }

  return RSVP.all(promises);
};

function listRevisions() {
  return ddbAdapter.list(CURRENT_KEY);
}

describe('DynamoDBAdapter', function() {
  this.timeout(5000);

  beforeEach(function() {

    ddbAdapter = new DynamoDBAdapter({
      accessKeyId: process.env.AWS_ACCESS_KEY,
      secretAccessKey: process.env.AWS_SECRET_KEY,
      region: 'us-west-2',
      table: 'ember-deploy-test',
      indexName: 'manifest-created-index',
      manifestSize: MANIFEST_SIZE
    });

    upload = uploadWithRevisionKey();
  });

  afterEach(function(done) {
    cleanUpDDB(done);
  });

  describe('#upload', function() {

    it('stores passed value in DynamoDB', function(done) {
      return expect(upload.then(function() {
        return ddb.getRevision(UPLOAD_KEY);
      })).to.eventually.eq(DOCUMENT_TO_SAVE).notify(done);
    });

    it('resolves with the document key on successful upload', function(done) {
      expect(upload.catch(done)).to.eventually.eq(UPLOAD_KEY).and.notify(done);
    });

    it('updates a list of recent uploads when upload resolves', function(done) {
      return upload
        .then(function() {
          return ddb.listAll();
        })
        .then(function(values) {
          return expect(values.length).to.be.greaterThan(0);
        }).finally(done);
    });

    it('only keeps <manifestSize> uploads in list after upload', function(done) {
      return expect(upload
        .then(fillUpManifest.bind(null, MANIFEST_SIZE))
        .then(function() {
          return ddb.listAll();
        })
        .then(function(values) {
          return (values) ? values.length : 0;
        }).catch(function(error) {console.dir(error);})).to.eventually.eq(MANIFEST_SIZE).and.notify(done);
    });

    it('removes oldest entry', function() {
      return upload
        .then(fillUpManifest.bind(null, MANIFEST_SIZE))
        .then(function() {
          return ddb.listAll();
        })
        .then(function(values) {
          expect(values).not.to.contain(UPLOAD_KEY);
        });
    });

    describe('upload failure', function() {
      var second;

      beforeEach(function() {
        second = upload
          .then(function() {
            return ddbAdapter.upload(DOCUMENT_TO_SAVE, UPLOAD_KEY);
          });
      });

      it('rejects when passed key is already in manifest', function(done) {
        expect(second).to.be.rejected.and.notify(done);
      });

      it('rejects with a SilentError ember-cli can handle', function(done) {
        var errorMessage = /revision already exists/;
        expect(second).to.be.rejectedWith(Error, errorMessage).and.notify(done);
      });
    });
  });

  describe('list/activate', function() {
    var uploadsDone;

    beforeEach(function() {
      uploadsDone = upload
        .then(fillUpManifest.bind(null, MANIFEST_SIZE-1));
    });

    describe('#list', function() {
      it('lists all uploads stored in manifest', function(done) {
        return expect(uploadsDone
          .then(listRevisions)
          .then(function(revisions) {
            return revisions.length;
          }).catch(function(error) {console.dir(error)})).to.eventually.eq(MANIFEST_SIZE).and.notify(done);
      });
    });

    describe('#activate', function() {
      var activation;

      describe('successful activation', function() {
        beforeEach(function() {
          activation = uploadsDone
            .then(function() {
              return ddbAdapter.activate(UPLOAD_KEY, CURRENT_KEY);
            });
        });

        it('sets current key when revision key is in manifest', function() {
          function getCurrentRevision() {
            return ddb.getRevision(CURRENT_KEY);
          }
          return expect(activation.then(getCurrentRevision)).to.eventually.eq(UPLOAD_KEY);
        });

        it('lists revisions with current revision marked as active', function() {
          function findActive(revisions) {
            return revisions.filter(function(revision) { return revision.active });
          }
          return expect(activation.then(listRevisions).then(findActive))
            .to.eventually.eql([{ revision: UPLOAD_KEY, active: true }]);
        });
      });

      it('rejects when no revision is passed', function() {
        activation = uploadsDone
          .then(function() {
            return ddbAdapter.activate();
          });

        return expect(activation).to.be.rejectedWith(Error, 'revision not found');
      });

      it('rejects when key is not in manifest', function() {
        activation = uploadsDone
          .then(function() {
            return ddbAdapter.activate('not-in-manifest');
          });

        return expect(activation).to.be.rejectedWith(Error, 'revision not found');
      });

      it('does not set the current revision when key is not in manifest', function() {
        activation = uploadsDone
          .then(function() {
            return ddbAdapter.activate(UPLOAD_KEY, CURRENT_KEY);
          })
          .then(function() {
            return ddbAdapter.activate('does-not-exist');
          });

        return expect(activation).to.be.rejected
          .then(function() {
            return ddbAdapter._current(CURRENT_KEY);
          }).then(function(currentRevision) {
            return expect(currentRevision).to.eql(UPLOAD_KEY);
          });
      });
    });
  });
});
