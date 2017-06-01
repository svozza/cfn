'use strict';

/**
 * Cloud Formation Module.  Handles stack creation, deletion, and updating.  Adds
 * periodic polling to check stack status.  So that stack operations are
 * synchronous.
 */

var filesystem = require('fs');

var Promise = require('bluebird'),
    YAML = require('yamljs'),
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
AWS.config.setPromisesDependency(Promise);

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
        cfParams = opts.cfParams || {},
        awsConfig = opts.awsConfig,
        capabilities = opts.capabilities || ['CAPABILITY_IAM'],
        awsOpts = {},
        async = opts.async,
        checkStackInterval = opts.checkStackInterval || 5000;

    if (PROXY) {
        awsOpts.httpOptions = {
            agent: new HttpsProxyAgent(PROXY)
        };
    }
    if (awsConfig) {
        _.merge(awsOpts, awsConfig);
    }

    // initialize cf
    var cf = new AWS.CloudFormation(awsOpts);

    name = opts.name || name;
    template = opts.template || template;

    function checkStack(action, name) {
        var logPrefix = name + ' ' + action.toUpperCase(),
            notExists = /ValidationError:\s+Stack\s+\[?.+]?\s+does not exist/,
            throttling = /Throttling:\s+Rate\s+exceeded/,
            displayedEvents = {};

        return new Promise(function (resolve, reject) {
            var interval,
                running = false;

            // on success:
            // 1. clear interval
            // 2. return resolved promise
            function _success() {
                clearInterval(interval);
                return resolve();
            }

            // on fail:
            // 1. build fail message
            // 2. clear interval
            // 3. return rejected promise with failed message
            function _failure(msg) {
                var fullMsg = logPrefix + ' Failed' + (msg ? ': ' + msg : '');
                clearInterval(interval);
                return reject(new Error(fullMsg));
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

                // Only fail/succeed on cloud formation stack resource
                if (resourceType === 'AWS::CloudFormation::Stack') {
                    // if cf stack status indicates failure AND the failed event occurred during this update, notify of failure
                    // if cf stack status indicates success, OR it failed before this current update, notify of success
                    if (_.includes(failed, status) && (timestamp >= startedAt)) {
                        _failure(statusReason);
                    } else if (_.includes(success, status) || (_.includes(failed, status) && (timestamp < startedAt))) {
                        _success();
                    }
                }
                running = false;
            }

            // provides all pagination
            function getAllStackEvents(stackName) {
                var next,
                    allEvents = [];

                function getStackEvents() {
                    return cf.describeStackEvents({
                        StackName: stackName,
                        NextToken: next
                    })
                        .promise()
                        .then(function (data) {
                            next = (data || {}).NextToken;
                            allEvents = allEvents.concat(data.StackEvents);
                            return !next ? Promise.resolve() : getStackEvents();
                        });
                }
                return getStackEvents().then(function () {
                    return allEvents;
                });
            }

            interval = setInterval(function () {
                var events = [];

                if (running) {
                    return;
                }
                running = true;

                return getAllStackEvents(name)
                    .then(function (allEvents) {
                        running = false;
                        _.forEach(allEvents, function (event) {
                            // if event has already been seen, don't add to events to process list
                            if (displayedEvents[event.EventId]) {
                                return;
                            }
                            events.push(event);
                        });
                        return _processEvents(events);
                    }).catch(function (err) {
                        // if stack does not exist, notify success
                        if (err && notExists.test(err)) {
                            return _success();
                        }
                        // if throttling has occurred, process events again
                        if (err && throttling.test(err)) {
                            return _processEvents(events);
                        }
                        // otherwise, notify of failure
                        if (err) {
                            return _failure(err);
                        }
                    });
            }, checkStackInterval);
        });
    }

    function processCfStack(action, cfparms) {
        startedAt = Date.now();
        if (action === 'update') {
            return cf.updateStack(cfparms).promise()
                .catch(function (err) {
                    if (!/No updates are to be performed/.test(err)) {
                        throw err;
                    }
                });
        }
        return cf.createStack(cfparms).promise();
    }

    function loadJs(path) {
        var tmpl = require(path);

        var fn = _.isFunction(tmpl) ? tmpl : function () {
            return tmpl;
        };
        return Promise.resolve(JSON.stringify(fn(params)));
    }

    function convertParams(p) {
        if (!_.isPlainObject(p)) return [];
        return (Object.keys(p)).map(function (key) {
            return {
                ParameterKey: key,
                ParameterValue: p[key]
            };
        });
    }

    function isStringOfType(type, str) {
        var result = true;
        try {
            type.parse(str);
        } catch (ignore) {
            result = false;
        }
        return result;
    }

    function isJSONString(str) {
        return isStringOfType(JSON, str);
    }

    function isYAMLString(str) {
        return isStringOfType(YAML, str) && str.split(/\r\n|\r|\n/).length > 1;
    }

    function isValidTemplateString(str) {
        return isJSONString(str) || isYAMLString(str);
    }

    function processStack(action, name, template) {
        var promise;

        switch (true) {
            // Check if template if a `js` file
            case _.endsWith(template, '.js'):
                promise = loadJs(template);
                break;

            // Check if template is an object, assume this is JSON good to go
            case _.isPlainObject(template):
                promise = Promise.resolve(JSON.stringify(template));
                break;

            // Check if template is a valid string, serialised json or yaml
            case isValidTemplateString(template):
                promise = Promise.resolve(template);
                break;

            // Default to loading template from file.
            default:
                promise = fs.readFileAsync(template, 'utf8');
        }

        return promise
            .then(function (data) {
                return processCfStack(action, {
                    StackName: name,
                    Capabilities: capabilities,
                    TemplateBody: data,
                    Parameters: convertParams(cfParams)
                });
            })
            .then(function () {
                return async ? Promise.resolve() : checkStack(action, name);
            });
    }

    this.stackExists = function (overrideName) {
        return cf.describeStacks({ StackName: overrideName || name }).promise()
            .then(function (data) {
                return _.includes(exists, data.Stacks[0].StackStatus);
            })
            .catch(function () {
                return false;
            });
    };

    this.createOrUpdate = function () {
        return this.stackExists()
            .then(function (exists) {
                return processStack(exists ? 'update' : 'create', name, template);
            });
    };

    this.delete = function (overrideName) {
        startedAt = Date.now();
        return cf.deleteStack({ StackName: overrideName || name }).promise()
            .then(function () {
                return async ? Promise.resolve() : checkStack('delete', overrideName || name);
            });
    };

    this.outputs = function () {
        return cf.describeStacks({ StackName: name }).promise()
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
            limit = opts.limit,
            next,
            done = false,
            stacks = [];

        startedAt = Date.now();
        return (function loop() {
            if (!done) {
                return cf.listStacks({
                    NextToken: next,
                    StackStatusFilter: [
                        'CREATE_COMPLETE',
                        'CREATE_FAILED',
                        'DELETE_FAILED',
                        'ROLLBACK_COMPLETE',
                        'UPDATE_COMPLETE'

                    ]
                }).promise()
                    .then(function (data) {
                        next = data.NextToken;
                        done = !next;
                        return data.StackSummaries;
                    })
                    .each(function (stack) {
                        var millisOld = Date.now() - ((minutesOld || 0) * ONE_MINUTE);
                        if (regex.test(stack.StackName) && moment(stack.CreationTime).valueOf() < millisOld) {
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
                var filteredStacks = _.sortBy(stacks, ['CreationTime']);

                if (limit) {
                    filteredStacks = _.take(filteredStacks, limit);
                }
                _.forEach(filteredStacks, function (stack) {
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

cfn.stackExists = function (name) {
    return new Cfn(name).stackExists();
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
