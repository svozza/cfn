'use strict';

var tape = require('blue-tape'),
    cfn = require('../'),
    Promise = require('bluebird'),
    AWS = require('aws-sdk'),
    cf = Promise.promisifyAll(new AWS.CloudFormation());

function test(name, stackName, fn) {
    return cf.describeStacksAsync({ StackName: stackName })
        .then(function () {
            return cfn.delete(stackName);
        })
        .catch(function () {
            return Promise.resolve();
        })
        .then(function () {
            console.log('Start... ', name, stackName);
            return tape(name, fn);
        });
}

test('Create json template', 'TEST-JSON-TEMPLATE', function (t) {
    return cfn('TEST-JSON-TEMPLATE', __dirname + '/templates/test-template-1.json')
        .then(function () {
            return cf.describeStacksAsync({ StackName: 'TEST-JSON-TEMPLATE' });
        })
        .then(function (data) {
            t.equal(data.Stacks[0].StackName, 'TEST-JSON-TEMPLATE', 'Stack Name Matches');
            t.equal(data.Stacks[0].StackStatus, 'CREATE_COMPLETE', 'Stack Status is correct');
        });
});

test('Create js template', 'TEST-JS-TEMPLATE', function (t) {
    return cfn('TEST-JS-TEMPLATE', __dirname + '/templates/test-template-2.js')
        .then(function () {
            return cf.describeStacksAsync({ StackName: 'TEST-JS-TEMPLATE' });
        })
        .then(function (data) {
            t.equal(data.Stacks[0].StackName, 'TEST-JS-TEMPLATE', 'Stack Name Matches');
            t.equal(data.Stacks[0].StackStatus, 'CREATE_COMPLETE', 'Stack Status is correct');
        });
});

test('Create js function template', 'TEST-JS-FN-TEMPLATE', function (t) {
    return cfn({
        name: 'TEST-JS-FN-TEMPLATE',
        template: __dirname + '/templates/test-template-3.js',
        params: { testParam: 'TEST-PARAM'}
    })
        .then(function () {
            return cf.describeStacksAsync({ StackName: 'TEST-JS-FN-TEMPLATE' });
        })
        .then(function (data) {
            t.equal(data.Stacks[0].StackName, 'TEST-JS-FN-TEMPLATE', 'Stack Name Matches');
            t.equal(data.Stacks[0].StackStatus, 'CREATE_COMPLETE', 'Stack Status is correct');
        });
});