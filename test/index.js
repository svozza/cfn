'use strict';

var path = require('path');

var tape = require('blue-tape'),
    AWS = require('aws-sdk');

var cfn = require('../');

AWS.config.setPromisesDependency(require('bluebird'));
var cf = new AWS.CloudFormation();

tape('Create / Update json template', 'TEST-JSON-TEMPLATE', function (t) {
    return cfn('TEST-JSON-TEMPLATE', path.join(__dirname, '/templates/test-template-1.json'))
        .then(function () {
            return cf.describeStacks({ StackName: 'TEST-JSON-TEMPLATE' }).promise();
        })
        .then(function (data) {
            t.equal(data.Stacks[0].StackName, 'TEST-JSON-TEMPLATE', 'Stack Name Matches');
            t.equal(data.Stacks[0].StackStatus, 'CREATE_COMPLETE', 'Stack Status is correct');
        });
});

tape('Create / Update js template', 'TEST-JS-TEMPLATE', function (t) {
    return cfn('TEST-JS-TEMPLATE', path.join(__dirname, '/templates/test-template-2.js'))
        .then(function () {
            return cf.describeStacks({ StackName: 'TEST-JS-TEMPLATE' }).promise();
        })
        .then(function (data) {
            t.equal(data.Stacks[0].StackName, 'TEST-JS-TEMPLATE', 'Stack Name Matches');
            t.equal(data.Stacks[0].StackStatus, 'CREATE_COMPLETE', 'Stack Status is correct');
        });
});

tape('Create / Update js function template', 'TEST-JS-FN-TEMPLATE', function (t) {
    return cfn({
        name: 'TEST-JS-FN-TEMPLATE',
        template: path.join(__dirname, '/templates/test-template-3.js'),
        params: { testParam: 'TEST-PARAM' }
    })
        .then(function () {
            return cf.describeStacks({ StackName: 'TEST-JS-FN-TEMPLATE' }).promise();
        })
        .then(function (data) {
            t.equal(data.Stacks[0].StackName, 'TEST-JS-FN-TEMPLATE', 'Stack Name Matches');
            t.equal(data.Stacks[0].StackStatus, 'CREATE_COMPLETE', 'Stack Status is correct');
        });
});

tape('Create / Update json string', 'TEST-JSON-STRING-TEMPLATE', function (t) {
    return cfn('TEST-JSON-TEMPLATE', require(path.join(__dirname, '/templates/test-template-1.json')))
        .then(function () {
            return cf.describeStacks({ StackName: 'TEST-JSON-TEMPLATE' }).promise();
        })
        .then(function (data) {
            t.equal(data.Stacks[0].StackName, 'TEST-JSON-TEMPLATE', 'Stack Name Matches');
            t.equal(data.Stacks[0].StackStatus, 'CREATE_COMPLETE', 'Stack Status is correct');
        });
});

tape('Cleanup js stacks', function () {
    return cfn.cleanup(/TEST-JS-/);
});
