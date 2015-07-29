var AWS = require('aws-sdk');
var async = require('async');
var RSVP = require('rsvp');
var moment = require('moment');

function DynamoClient(config) {

  this._ddb = new AWS.DynamoDB({
    region: config.region,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    apiVersion: 'latest'
  });

  this._table = config.table;
  this._index = config.indexName;

  /*RSVP.on('error', function(reason) {
    if (reason) {
      console.dir(reason);
    }
  });*/

  this.getRevision = function(revision) {
    var that = this;
    
    return new RSVP.Promise(function(resolve, reject) {
     
      var params = {};
      params.TableName = that._table;
      params.Key = {};
      params.Key.id = {
        S: revision
      };

      that._ddb.getItem(params, function(err, result) {
        if (err) {
          reject(err);
        } else {
          if (result.Item && result.Item.value && result.Item.value.S) {
            resolve(result.Item.value.S);
          } else {
            resolve('');
          }
        }
      });
    });
  };

  this.clear = function() {
    var that = this;
    
    return new RSVP.Promise(function(resolve, reject) {
      var params = {};
      params.TableName = that._table;
      params.ConsistentRead = true;
      params.ProjectionExpression = 'id, created';
      var more = true;
      var deleteList = [];

      async.whilst(
        function() {
          return (more);
        },
        function(cb) {
          that._ddb.scan(params, function(err, data) {
            if (err) {
              cb(err);
            } else {
              more = data.LastEvaluatedKey;

              async.each(data.Items, function(item, cback) {

                if (item.id && item.id.S) {
                  var params = {};
                  params.TableName = that._table;
                  params.Key = {};
                  params.Key.id = {
                    S: item.id.S
                  };

                  that._ddb.deleteItem(params, cback);
                } else {
                  cback('invalid row found');
                }
              }, cb);
            }
          });
        },
        function(err) {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  };

  this.setCurrentRevision = function(key, value) {
    var that = this;

    return new RSVP.Promise(function(resolve, reject) {
      var item = {};
      item.id = {};
      item.id.S = key;
      item.value = {};
      item.value.S = value;
      item.created = {};
      item.created.N = moment().valueOf().toString();
      item.head = {};
      item.head.BOOL = true;

      var params = {};
      params.TableName = that._table;
      params.Item = item;

      that._ddb.putItem(params, function(err, data) {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  };

  this.appendRevision = function(key, value) {
    var that = this;

    return new RSVP.Promise(function(resolve, reject) {

      var item = {};
      item.id = {};
      item.id.S = key;
      item.value = {};
      item.value.S = value;
      item.created = {};
      item.created.N = moment().valueOf().toString();
      item.manifest = {};
      item.manifest.S = 't';

      var params = {};
      params.TableName = that._table;
      params.Item = item;
      params.ConditionExpression = "id <> :key";
      params.ExpressionAttributeValues = {
        ":key": {
          S: key
        }
      };
      
      that._ddb.putItem(params, function(err) {

        if (err) {
          if (err.code === 'ConditionalCheckFailedException') {
            reject();
          } else {
            reject(err);
          }
        } else {
          resolve();
        }
      });
    });
  };

  this.trim = function(size) {
    var that = this;
    return this.listOrdered().then(function(list) {
      var sz = size;
      return new RSVP.Promise(function(resolve, reject) {
       
        if (list && list.length && list.length > sz) {
          var trimIndex = (list.length - sz);
          var ids = list.slice(0, trimIndex);
          async.each(ids, function(id, cback) {
              var params = {};
              params.TableName = that._table;
              params.Key = {};
              params.Key.id = {
                S: id
              };

              that._ddb.deleteItem(params, cback);
            },
            function(err) {
              if (err) {
                reject(err);
              } else {
                resolve();
              }
            });
        } else {
          resolve();
        }
      });
    });
  };


  this.listAll = function() {
    var that = this;
    return new RSVP.Promise(function(resolve, reject) {
      var params = {};
      params.TableName = that._table;
      params.ConsistentRead = true;
      params.FilterExpression = 'attribute_not_exists(head)';
      params.ProjectionExpression = 'id';
      var more = true;
      var list = [];
     
      async.whilst(
        function() {
          return (more);
        },
        function(cb) {
          that._ddb.scan(params, function(err, data) {
            if (err) {
              cb(err);
            } else {
              more = data.LastEvaluatedKey;
              async.each(data.Items, function(item, cback) {
                list.push(item.id.S);
                cback();
              }, cb);
            }
          });
        },
        function(err) {
          if (err) {
            reject(err);
          } else {
            resolve(list);
          }
        });
    });
  };

  this.listOrdered = function() {
    var that = this;
    return new RSVP.Promise(function(resolve, reject) {
      var params = {};
      params.TableName = that._table;
      params.IndexName = that._index;
      params.ConsistentRead = false;
      params.KeyConditionExpression = 'manifest = :manifest';
      params.ExpressionAttributeValues = {};
      params.ExpressionAttributeValues[':manifest'] = { S:'t'};
      params.FilterExpression = 'attribute_not_exists(head)';
      params.ProjectionExpression = 'id, created';
      params.ScanIndexForward = false;
      var more = true;
      var list = [];
     
      async.whilst(
        function() {
          return (more);
        },
        function(cb) {
          that._ddb.query(params, function(err, data) {
            if (err) {
              cb(err);
            } else {
              more = data.LastEvaluatedKey;
              async.each(data.Items, function(item, cback) {
                list.push(item.id.S);
                cback();
              }, cb);
            }
          });
        },
        function(err) {
          if (err) {
            reject(err);
          } else {
            resolve(list);
          }
        });
    });
  };
}

module.exports = DynamoClient;