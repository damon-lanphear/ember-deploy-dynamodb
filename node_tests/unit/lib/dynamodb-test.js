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

var MANIFEST = 'ember-deploy';
var REVISION_KEY = 'test';
var DOCUMENT_TO_SAVE = 'Hello';
var UPLOAD_KEY = MANIFEST + ':' + REVISION_KEY;
var MANIFEST_SIZE = 10;

var cfg = {
  accessKeyId: process.env.AWS_ACCESS_KEY,
  secretAccessKey: process.env.AWS_SECRET_KEY,
  region: 'us-west-2',
  table: 'ember-deploy-test',
  indexName: 'manifest-created-index'
};

var ddb = new DDB(cfg);

var revisionsList = [];
var mockShaTaggingAdapter = new CoreObject({
  tagCount: 0,

  mockTag: UPLOAD_KEY,

  createTag: function() {
    var tag = this.tagCount < 1 ? this.mockTag : this.mockTag + this.tagCount;
    revisionsList.push(tag);
    this.tagCount++;
    return tag;
  },

  reset: function() {
    this.tagCount = 0;
  }
});

var ddbAdapter;
var upload;

var cleanUpDDB = function(done) {
  ddb.clear().then(done).catch(done);
};

var uploadWithRevisionKey = function() {
  return ddbAdapter.upload(DOCUMENT_TO_SAVE);
};

var fillUpManifest = function(uploadCount, revisionsList) {
  var promises = [];

  for (var i = 0; i < uploadCount; i++) {
    promises.push(uploadWithRevisionKey());
  }

  return RSVP.all(promises);
};

var resetUI = function(adapter) {
  adapter.ui.output = '';
};

describe('DynamoDBAdapter', function() {
  this.timeout(5000);

  beforeEach(function() {

    ddbAdapter = new DynamoDBAdapter({
      accessKeyId: process.env.AWS_ACCESS_KEY,
      secretAccessKey: process.env.AWS_SECRET_KEY,
      region: 'us-west-2',
      table: 'ember-deploy-test',
      indexName: 'manifest-created-index',
      manifest: MANIFEST,
      manifestSize: MANIFEST_SIZE,
      taggingAdapter: mockShaTaggingAdapter,
      ui: new MockUI()
    });

    upload = uploadWithRevisionKey();
  });

  afterEach(function(done) {
    mockShaTaggingAdapter.reset();
    revisionsList = [];
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

    it('prints a success message when upload succeeds', function(done) {
      return expect(upload.then(function() {
        return ddbAdapter.ui.output;
      }).catch(done)).to.eventually.contain('Upload successful').notify(done);
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

    describe('upload failure', function() {
      var second;

      beforeEach(function() {
        second = upload
          .then(function() {
            mockShaTaggingAdapter.reset();

            return ddbAdapter.upload(DOCUMENT_TO_SAVE);
          });
      });

      it('rejects when passed key is already in manifest', function(done) {
        expect(second).to.be.rejected.and.notify(done);
      });

      it('rejects with a SilentError ember-cli can handle', function(done) {
        var errorMessage = /Upload\ failed!/;
        expect(second).to.be.rejectedWith(SilentError, errorMessage).and.notify(done);
      });
    });
  });

  describe('list/activate', function() {
    var uploadsDone;

    beforeEach(function() {
      uploadsDone = upload
        .then(fillUpManifest.bind(null, MANIFEST_SIZE - 1, revisionsList));
    });

    describe('#list', function() {
      it('lists all uploads stored in manifest', function(done) {
        return expect(uploadsDone
          .then(function() {
            resetUI(ddbAdapter);
            return ddbAdapter.list();
          })
          .then(function() {
            var uploads = ddbAdapter.ui.output;
            var filtered = revisionsList.filter(function(upload) {
              return (uploads.indexOf(upload) < 0);
            });
            return filtered.length;
          }).catch(function(error) {console.dir(error)})).to.eventually.eq(0).and.notify(done);
      });

      it('prints out a formatted list of uploaded revisions', function(done) {
        return expect(uploadsDone
          .then(function() {
            resetUI(ddbAdapter);

            return ddbAdapter.list();
          })
          .then(function() {

            return ddbAdapter.ui.output;

          })).to.eventually.contain('uploaded revisions').and.notify(done);
      });
    });

    describe('#activate', function() {
      var activation;

      describe('successful activation', function() {
        var revisionToActivate;

        beforeEach(function() {
          activation = uploadsDone
            .then(function() {
              resetUI(ddbAdapter);
              revisionToActivate = revisionsList[0];
              return ddbAdapter.activate(revisionToActivate);
            });
        });

        it('sets <manifest>:current when key is in manifest', function(done) {
          return expect(activation
              .then(function() {
                return ddb.getRevision(MANIFEST + ':current');
              }))
            .to.eventually.eq(revisionsList[0]).and.notify(done);
        });

        it('prints a success message when activation succeeds', function(done) {
          return expect(activation
            .then(function() {
              return ddbAdapter.ui.output;
            })).to.eventually.contain('Activation successful!').and.notify(done);
        });
      });

      it('rejects when no revision is passed', function(done) {
        activation = uploadsDone
          .then(function() {
            return ddbAdapter.activate();
          });

        expect(activation).to.be.rejectedWith(SilentError, 'Error!');
        done();
      });

      it('rejects with SilentError when key is not in manifest', function(done) {
        activation = uploadsDone
          .then(function() {
            return ddbAdapter.activate('not-in-manifest');
          });

        expect(activation).to.be.rejectedWith(SilentError, 'Error!');
        done();
      });

      it('does not set the current revision when key is not in manifest', function(done) {
        activation = uploadsDone
          .then(function() {
            return ddbAdapter.activate(revisionsList[0]);
          })
          .then(function() {
            return ddbAdapter.activate('does-not-exist');
          });

        return expect(activation).to.be.rejected
          .then(function() {
            return ddbAdapter._current();
          }).then(function(currentRevision) {
            return expect(currentRevision).to.eql(revisionsList[0]);
          }).finally(done);
      });
    });

    describe('#_current', function() {
      it('returns revision that set <manifest>:current', function(done) {
        var rta;
        return expect(uploadsDone
          .then(function() {
            rta = revisionsList[0];
            return ddbAdapter.activate(rta);
          })
          .then(function() {
            return ddbAdapter._current();
          })).to.eventually.eq(revisionsList[0]).and.notify(done);
      });
    });
  });
});