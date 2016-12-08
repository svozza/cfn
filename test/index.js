'use strict';

var path = require('path');

var tape = require('blue-tape'),
    AWS = require('aws-sdk-mock');

// AWS.config.setPromisesDependency(require('bluebird'));


describe('create/update', function() {
    this.timeout(10000);
    beforeEach(function(){
        AWS.mock('CloudFormation', 'describeStackEvents', function (params, callback){
            console.log('called describestack events with params');
            console.log(params);
            var stackEvents = require('./mocks/stack-events')
            callback(null, stackEvents);
        });
        AWS.mock('CloudFormation', 'describeStacks', function (params, callback){
            console.log('describeStacks params');
            var mockResponse = { ResponseMetadata: { RequestId: '75910902-bd63-11e6-aa30-ad2ddc67a636' },
                Stacks:
                    [ { StackId: 'arn:aws:cloudformation:us-west-2:0000000000:stack/TEST-JSON-TEMPLATE/0000000-bbf9-11e6-aa85-50d5ca11b856',
                        StackName: 'TEST-JSON-TEMPLATE',
                        Description: 'Stack for testing json template',
                        Parameters: [],
                        CreationTime: "Tue Dec 06 2016 15:16:05 GMT-0600 (CST)",
                LastUpdatedTime: "Tue Dec 06 2016 16:08:10 GMT-0600 (CST)",
                StackStatus: 'UPDATE_COMPLETE',
                DisableRollback: false,
                NotificationARNs: [],
                Capabilities: [],
                Outputs: [],
                Tags: [] } ] };
            callback(null, mockResponse);
        });
        AWS.mock('CloudFormation', 'updateStack', function (params, callback){
            console.log('update stack');
            callback(null, 'hi');
        });
    });
    afterEach(function(){
        AWS.restore();
    });
    describe('#indexOf()', function() {
        it('should return -1 when the value is not present', function() {
            var cfn = require('../');
            return cfn({name: 'TEST-JSON-TEMPLATE', awsConfig: {region: "us-west-2"}}, path.join(__dirname, '/templates/test-template-1.json'))
                .then(function(res){
                    console.log('res');
                    console.log(res);
                    console.log(JSON.stringify(res));
                    return res;
                })
        });
    });
});

