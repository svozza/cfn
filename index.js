'use strict';

/**
 * Cloud Formation Module.  Handles stack creation, deletion, and updating.  Adds
 * periodic polling to check stack status.  So that stack operations are
 * synchronous.
 */

var filesystem = require('fs');

var Promise = require('bluebird'),
    AWS = require('aws-sdk'),
    _ = require('lodash'),
    sprintf = require('sprintf'),
    moment = require('moment'),
    flow = require('lodash/fp/flow'),
    keyBy = require('lodash/fp/keyBy'),
    get = require('lodash/fp/get'),
    mapValues = require('lodash/fp/mapValues'),
    chalk = require('chalk'),
    HttpsProxyAgent = require('https-proxy-agent');

var fs = Promise.promisifyAll(filesystem);

var PROXY = process.env.PROXY,

    ONE_MINUTE = 60000,

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
        CREATE_IN_PROGRESS: 'gray',
        CREATE_COMPLETE: 'green',
        CREATE_FAILED: 'red',
        DELETE_IN_PROGRESS: 'gray',
        DELETE_COMPLETE: 'green',
        DELETE_FAILED: 'red',
        ROLLBACK_FAILED: 'red',
        ROLLBACK_IN_PROGRESS: 'yellow',
        ROLLBACK_COMPLETE: 'red',
        UPDATE_IN_PROGRESS: 'gray',
        UPDATE_COMPLETE: 'green',
        UPDATE_COMPLETE_CLEANUP_IN_PROGRESS: 'green',
        UPDATE_ROLLBACK_IN_PROGRESS: 'yellow',
        UPDATE_ROLLBACK_COMPLETE_CLEANUP_IN_PROGRESS: 'yellow',
        UPDATE_ROLLBACK_FAILED: 'red',
        UPDATE_ROLLBACK_COMPLETE: 'red',
        UPDATE_FAILED: 'red'
    },

    ings = {
        create: 'Creating',
        delete: 'Deleting',
        update: 'Updating'
    };

function Cfn(name, template) {
    var log = console.log,
        opts = _.isPlainObject(name) ? name : {},
        startedAt = Date.now(),
        params = opts.params,
        awsConfig = opts.awsConfig,
        capabilities = opts.capabilities || ['CAPABILITY_IAM'],
        awsOpts = {},
        async = Object.prototype.hasOwnProperty.call(opts, 'async') ? opts.async : false;

    if (PROXY) {
        awsOpts.httpOptions = {
            agent: new HttpsProxyAgent(PROXY)
        };
    }
    if (awsConfig) {
        _.merge(awsOpts, awsConfig);
    }

    // initialize cf
    var cf = Promise.promisifyAll(new AWS.CloudFormation(awsOpts));

    name = opts.name || name;
    template = opts.template || template;

    function checkStack(action, name) {
        var logPrefix = name + ' ' + action.toUpperCase(),
            notExists = /ValidationError:\s+Stack\s+\[?.+]?\s+does not exist/,
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
                    if (moment(event.Timestamp).valueOf() >= startedAt) {
                        log(sprintf('[%s] %s %s: %s - %s  %s  %s',
                            chalk.gray(moment(event.Timestamp).format('HH:mm:ss')),
                            ings[action],
                            chalk.cyan(name),
                            event.ResourceType,
                            event.LogicalResourceId,
                            chalk[colorMap[event.ResourceStatus]](event.ResourceStatus),
                            event.ResourceStatusReason || ''
                        ));
                    }
                });

                var lastEvent = _.last(events) || {},
                    timestamp = moment(lastEvent.Timestamp).valueOf(),
                    resourceType = lastEvent.ResourceType,
                    status = lastEvent.ResourceStatus,
                    statusReason = lastEvent.ResourceStatusReason;

                if (resourceType !== 'AWS::CloudFormation::Stack') {
                    // Do nothing
                } else if (_.includes(failed, status)) {
                    if (timestamp >= startedAt) {
                        _failure(statusReason);
                    } else {
                        _success();
                    }
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
                    cf.describeStackEvents({
                        StackName: name,
                        NextToken: next
                    }, function (err, data) {
                        try {
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
                            if (done) {
                                _processEvents(events);
                            } else {
                                loop();
                            }
                        } catch (err) {
                            _failure(err);
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
        startedAt = Date.now();
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
        var tmpl = require(path);

        var fn = _.isFunction(tmpl) ? tmpl : function () {
            return tmpl;
        };
        return Promise.resolve(JSON.stringify(fn(params)));
    }

    function processStack(action, name, template, async) {
        return (_.endsWith(template, '.js')
            ? loadJs(template)
            : fs.readFileAsync(template, 'utf8'))
            .then(function (data) {
                return processCfStack(action, {
                    StackName: name,
                    Capabilities: capabilities,
                    TemplateBody: data
                });
            })
            .then(function () {
                return async ? Promise.resolve() : checkStack(action, name);
            });
    }

    this.createOrUpdate = function () {
        return stackExists(name)
            .then(function (exists) {
                return processStack(exists ? 'update' : 'create', name, template, async);
            });
    };

    this.delete = function (overrideName, async) {
        startedAt = Date.now();
        return cf.deleteStackAsync({ StackName: overrideName || name })
            .then(function () {
                return async ? Promise.resolve() : checkStack('delete', overrideName || name);
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

    this.cleanup = function (opts) {
        var self = this,
            regex = opts.regex,
            minutesOld = opts.minutesOld,
            dryRun = opts.dryRun,
            async = opts.async,
            next,
            done = false,
            stacks = [];

        startedAt = Date.now();
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
                        next = data.NextToken;
                        done = !next;
                        return data.StackSummaries;
                    })
                    .each(function (stack) {
                        if (regex.test(stack.StackName) && stack.CreationTime < (Date.now() - ((minutesOld || 0) * ONE_MINUTE))) {
                            stacks.push(stack);
                        }
                    })
                    .then(function () {
                        return loop();
                    });
            }
            return Promise.resolve();
        })()
            .then(function () {
                _.forEach(stacks, function (stack) {
                    if (dryRun) {
                        log('Will clean up ' + stack.StackName + ' Created ' + stack.CreationTime);
                    } else {
                        log('Cleaning up ' + stack.StackName + ' Created ' + stack.CreationTime);
                        return self.delete(stack.StackName, async)
                            .catch(function (err) {
                                log('DELETE ERROR: ', err);
                            });
                    }
                });
            });
    };
}

var cfn = function (name, template) {
    return new Cfn(name, template).createOrUpdate();
};

cfn.create = function (name, template) {
    return new Cfn(name, template).create();
};

cfn.delete = function (name) {
    return new Cfn(name).delete();
};

cfn.outputs = function (name) {
    return new Cfn(name).outputs();
};

cfn.cleanup = function (regex, daysOld, dryRun) {
    return new Cfn().cleanup(regex, daysOld, dryRun);
};

module.exports = cfn;
