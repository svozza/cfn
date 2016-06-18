'use strict';

/**
 * Main Stack Cloud Formation Module
 */

module.exports = {
    AWSTemplateFormatVersion: '2010-09-09',
    Description: 'Test Stack',
    Resources: {
        shopperTable: {
            Type: 'AWS::DynamoDB::Table',
            Properties: {
                AttributeDefinitions: [
                    {
                        AttributeName: 'id',
                        AttributeType: 'S'
                    }
                ],
                KeySchema: [
                    {
                        AttributeName: 'id',
                        KeyType: 'HASH'
                    }
                ],
                ProvisionedThroughput: {
                    ReadCapacityUnits: '1',
                    WriteCapacityUnits: '1'
                },
                TableName: 'TEST-TABLE'
            }
        },
        testDns: {
            Type: 'AWS::Route53::RecordSet',
            Properties: {
                HostedZoneId: 'Z36ZPHHEG9SJZC',
                Name: 'test-cfn.andyday.io',
                Comment: 'Test Dns',
                Type: 'CNAME',
                TTL: 60,
                ResourceRecords: ['google.com']
            }
        }
    }
};
