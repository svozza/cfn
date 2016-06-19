'use strict';

/**
 * Cloud Formation Module.  Handles stack creation, deletion, and updating.  Adds
 * periodic polling to check stack status.  So that stack operations are
 * synchronous.
 */

var Promise = require('bluebird'),
    fs = Promise.promisifyAll(require('fs')),
    AWS = require('aws-sdk'),
    _ = require('lodash'),
    sprintf = require('sprintf'),
    moment = require('moment'),
    flow = require('lodash/fp/flow'),
    keyBy = require('lodash/fp/keyBy'),
    get = require('lodash/fp/get'),
    mapValues = require('lodash/fp/mapValues'),
    colors = require('colors'),

    success = [
        'CREATE_COMPLETE',
        'DELETE_COMPLETE',
        'UPDATE_COMPLETE'
    ],

    failed = [
        'ROLLBACK_FAILED',
        'ROLLBACK_IN_PROGRESS',
        'ROLLBACK_COMPLETE',
        'UPDATE_ROLLBACK_IN_PROGRESS',
        'UPDATE_ROLLBACK_COMPLETE',
        'UPDATE_FAILED',
        'DELETE_FAILED'
    ],

    exists = [
        'CREATE_COMPLETE',
        'UPDATE_COMPLETE',
        'ROLLBACK_COMPLETE',
        'UPDATE_ROLLBACK_COMPLETE'
    ],

    colorMap = {
        'CREATE_IN_PROGRESS': 'gray',
        'UPDATE_IN_PROGRESS': 'gray',
        'DELETE_IN_PROGRESS': 'gray',
        'CREATE_COMPLETE': 'green',
        'DELETE_COMPLETE': 'green',
        'UPDATE_COMPLETE': 'green',
        'ROLLBACK_FAILED': 'red',
        'ROLLBACK_IN_PROGRESS': 'yellow',
        'ROLLBACK_COMPLETE': 'red',
        'UPDATE_ROLLBACK_IN_PROGRESS': 'yellow',
        'UPDATE_ROLLBACK_COMPLETE': 'red',
        'UPDATE_FAILED': 'red',
        'DELETE_FAILED': 'red'
    },

    ings = {
        'create': 'Creating',
        'delete': 'Deleting',
        'update': 'Updating'
    },

    eds = {
        'create': 'Created',
        'delete': 'Deleted',
        'update': 'Updated'
    };

function Cfn(name, template) {
    var cf = Promise.promisifyAll(new AWS.CloudFormation()),
        log = console.log,
        opts = _.isPlainObject(name) ? name : {},
        params = opts.params;

    name = opts.name || name;
    template = opts.template || template;

    function checkStack(action, name) {
        var logPrefix = name + ' ' + action.toUpperCase(),
            notExists = /ValidationError: Stack with id [\w\d-]+ does not exist/,
            displayedEvents = {};

        return new Promise(function (resolve, reject) {
            var interval,
                running = false;

            function _success() {
                clearInterval(interval);
                return resolve();
            }

            function _failure(msg) {
                var fullMsg = logPrefix + ' Failed' + (msg ? ': ' + msg : '');
                clearInterval(interval);
                return reject(fullMsg);
            }

            function _processEvents(events) {
                events = _.sortBy(events, 'Timestamp');
                _.forEach(events, function (event) {
                    displayedEvents[event.EventId] = true;
                    // log(event);
                    log(sprintf('[%s] %s %s: %s - %s  %s  %s',
                        moment(event.Timestamp).format('HH:mm:ss').gray,
                        ings[action],
                        name.cyan,
                        event.ResourceType,
                        event.LogicalResourceId,
                        colors[colorMap[event.ResourceStatus]](event.ResourceStatus),
                        event.ResourceStatusReason || ''
                    ));
                });

                var lastEvent = _.last(events) || {},
                    resourceType = lastEvent.ResourceType,
                    status = lastEvent.ResourceStatus,
                    statusReason = lastEvent.ResourceStatusReason;

                if (resourceType !== 'AWS::CloudFormation::Stack') {
                    // Do nothing
                } else if (_.includes(failed, status)) {
                    _failure(statusReason);
                } else if (_.includes(success, status)) {
                    _success();
                }
                running = false;
            }

            interval = setInterval(function () {
                var next,
                    done = false,
                    events = [];

                if (running) {
                    return;
                }
                running = true;

                (function loop() {
                    // log('loop:', logPrefix, done, next ? '(' + next + ')' : '');
                    cf.describeStackEvents({
                        StackName: name,
                        NextToken: next
                    }, function (err, data) {
                        try {
                            // log('events:', logPrefix, err, !!data);
                            if (err && notExists.test(err)) {
                                return _success();
                            }
                            if (err) {
                                return _failure(err);
                            }
                            next = (data || {}).NextToken;
                            done = !next || err || !data;
                            running = false;

                            _.forEach(data.StackEvents, function (event) {
                                if (displayedEvents[event.EventId]) {
                                    return;
                                }
                                events.push(event);
                            });
                            if (!done) {
                                loop();
                            } else {
                                _processEvents(events);
                                // _describeStack();
                            }
                        } catch (e) {
                            _failure(e);
                        }
                    });
                })();
            }, 3000);
        });
    }

    function stackExists(name) {
        return cf.describeStacksAsync({ StackName: name })
            .then(function (data) {
                return _.includes(exists, data.Stacks[0].StackStatus);
            })
            .catch(function () {
                return false;
            });
    }

    function processCfStack(action, cfparms) {
        if (action === 'update') {
            return cf.updateStackAsync(cfparms)
                .catch(function (err) {
                    if (!/No updates are to be performed/.test(err)) {
                        throw err;
                    }
                });
        }
        return cf.createStackAsync(cfparms);
    }

    function loadJs(path) {
        var tmpl = require(path),
            fn = _.isFunction(tmpl) ? tmpl : function () {
                return tmpl;
            };
        return Promise.resolve(JSON.stringify(fn(params)));
    }

    function processStack(action, name, template) {
        return (_.endsWith(template, '.js')
            ? loadJs(template)
            : fs.readFileAsync(template, 'utf8'))
            .then(function (data) {
                return processCfStack(action, {
                    StackName: name,
                    Capabilities: ['CAPABILITY_IAM'],
                    TemplateBody: data
                });
            })
            .then(function () {
                return checkStack(action, name);
            });
    }

    this.createOrUpdate = function () {
        return stackExists(name)
            .then(function (exists) {
                return processStack(exists ? 'update' : 'create', name, template);
            });
    };

    this.delete = function () {
        return cf.deleteStackAsync({ StackName: name })
            .then(function () {
                return checkStack('delete', name);
            });
        /*
         .then(function () {
         return cf.waitForAsync('stackDeleteComplete');
         });*/
    };

    this.describe = function (opts) {
        return cf.describeStacksAsync(opts)
            .then(function (data) {
                log(data);
            });
    };

    this.outputs = function () {
        return cf.describeStacksAsync({ StackName: name })
            .then(function (data) {
                return flow(
                    get('Stacks[0].Outputs'),
                    keyBy('OutputKey'),
                    mapValues('OutputValue')
                )(data);
            });
    };

    this.cleanup = function (prefix, olderThan, notIn) {
        var next,
            done = false;

        return (function loop() {
            if (!done) {
                return cf.listStacksAsync({
                    NextToken: next,
                    StackStatusFilter: [
                        'CREATE_COMPLETE',
                        'CREATE_FAILED',
                        'DELETE_FAILED',
                        'ROLLBACK_COMPLETE',
                        'UPDATE_COMPLETE'

                    ]
                })
                    .then(function (data) {
                        // log(data);
                        next = data.NextToken;
                        done = !next;
                        return data.StackSummaries;
                    })
                    .each(function (stack) {
                        if (_.startsWith(stack.StackName, prefix) && !_.includes(notIn, stack.StackName) &&
                            stack.CreationTime < olderThan) {

                            log('Cleaning up ' + stack.StackName + ' Created ' + stack.CreationTime);

                            return deleteStack({ StackName: stack.StackName });
                        }
                    })
                    .then(loop);
            }
            return Promise.resolve();
        })();
    }
}

var cfn = function (name, template) {
    return new Cfn(name, template).createOrUpdate();
};

cfn.createOrUpdate = function (name, template) {
    return new Cfn(name, template).create();
};

cfn.delete = function (name) {
    return new Cfn(name).delete();
};

cfn.outputs = function (name) {
    return new Cfn(name).outputs();
};

module.exports = cfn;