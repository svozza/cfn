'use strict';

var tape = require('blue-tape'),
    cfn = require('../'),
    Promise = require('bluebird'),
    AWS = require('aws-sdk'),
    cf = Promise.promisifyAll(new AWS.CloudFormation());

function test(name, fn) {
    return cf.describeStacksAsync({ StackName: 'TEST-JS-TEMPLATE' })
        .then(function () {
            return cfn.delete('TEST-JS-TEMPLATE');
        })
        .catch(function () {
            return Promise.resolve();
        })
        .then(function () {
            return tape(name, fn);
        });
}

test('Default js template', function (t) {
    return cfn('TEST-JS-TEMPLATE', __dirname + '/templates/test-template.js')
        .then(function () {
            return cf.describeStacksAsync({ StackName: 'TEST-JS-TEMPLATE' });
        })
        .then(function (data) {
            t.equal(data.Stacks[0].StackName, 'TEST-JS-TEMPLAT', 'Stack Name Matches');
            t.equal(data.Stacks[0].StackStatus, 'CREATE_COMPLETE', 'Stack Status is correct');
        });
});