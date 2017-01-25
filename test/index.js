'use strict';

var path = require('path');
var mocha = require('mocha'),
    describe = mocha.describe,
    beforeEach = mocha.beforeEach,
    afterEach = mocha.afterEach;

var AWS = require('aws-sdk-mock');

describe('create/update', function() {
    this.timeout(10000);
    var describeStackEventsStub, numDescribeStackEventsCalls,
        describeStacksStub, updateStackStub;
    beforeEach(function(){
        describeStacksStub = AWS.mock('CloudFormation', 'describeStacks', function (params, callback){
            var mockResponse = require('./mocks/describe-stacks').response;
            callback(null, mockResponse);
        });
        updateStackStub = AWS.mock('CloudFormation', 'updateStack', function (params, callback){
            callback(null, 'success!');
        });
    });
    afterEach(function(){
        AWS.restore();
    });
    describe('if stack events need to be paginated', function() {
        beforeEach(function(){
            numDescribeStackEventsCalls = 0;
            describeStackEventsStub = AWS.mock('CloudFormation', 'describeStackEvents', function (params, callback){
                var stackEvents = require('./mocks/stack-events');
                ++numDescribeStackEventsCalls;
                // if next token is provided, respond with mock that has no "NextToken"
                if (params.NextToken === "token1"){
                    return callback(null, stackEvents.mockDescribeEventsResponse2);
                } else {
                    return callback(null, stackEvents.mockDescribeEventsResponse1);
                }
            });
        });
        it('should call describe stack events twice', function() {
            var cfn = require('../');
            return cfn({name: 'TEST-JSON-TEMPLATE', awsConfig: {region: "us-west-2"}}, path.join(__dirname, '/templates/test-template-1.json'))
                .then(function(res){
                    describeStackEventsStub.stub.should.be.calledTwice();
                    // first call should have nextToken === undefined
                    var firstCall = describeStackEventsStub.stub.firstCall;
                    firstCall.args[0].StackName.should.equal('TEST-JSON-TEMPLATE');
                    (typeof firstCall.args[0].NextToken).should.equal('undefined');

                    // second call nextToken should be 'token1'
                    var secondCall = describeStackEventsStub.stub.secondCall;
                    secondCall.args[0].StackName.should.equal('TEST-JSON-TEMPLATE');
                    secondCall.args[0].NextToken.should.equal('token1');

                    return res;
                })
        });
    });
    describe('if update is in progress', function() {
        this.timeout(3000);
        beforeEach(function(){
            numDescribeStackEventsCalls = 0;
            describeStackEventsStub = AWS.mock('CloudFormation', 'describeStackEvents', function (params, callback){
                var stackEvents = require('./mocks/stack-events');
                ++numDescribeStackEventsCalls;
                var mockStackEvents;
                // on first call, return with update still in progress mock stack events
                if (numDescribeStackEventsCalls < 2){
                    mockStackEvents = {
                        StackEvents: stackEvents.updateInProgress
                    };
                } else {
                    // on second call, return with stack update complete mock events
                    mockStackEvents = {
                        StackEvents: stackEvents.orderedStackEventsList
                    };
                }
                return callback(null, mockStackEvents);
            });
        });
        it('should loop', function() {
            var cfn = require('../');
            return cfn({name: 'TEST-JSON-TEMPLATE', awsConfig: {region: "us-west-2"}, checkStackInterval: 1000}, path.join(__dirname, '/templates/test-template-1.json'))
                .then(function(res){
                    describeStackEventsStub.stub.should.be.calledTwice();
                    // first call should have nextToken === undefined
                    var firstCall = describeStackEventsStub.stub.firstCall;
                    firstCall.args[0].StackName.should.equal('TEST-JSON-TEMPLATE');
                    (typeof firstCall.args[0].NextToken).should.equal('undefined');

                    // make sure 2nd call isn't due to pagination
                    var secondCall = describeStackEventsStub.stub.secondCall;
                    secondCall.args[0].StackName.should.equal('TEST-JSON-TEMPLATE');
                    (typeof secondCall.args[0].NextToken).should.equal('undefined');
                    return res;
                });
        });
    });
});

