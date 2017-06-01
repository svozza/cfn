'use strict';

/**
 * Main Stack CloudFormation Module
 */

module.exports = function (params) {
    return {
        AWSTemplateFormatVersion: '2010-09-09',
        Description: 'Test Stack',
        Parameters: {
            readCap: {
                Type: 'String'
            }
        },
        Resources: {
            testTable: {
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
                        ReadCapacityUnits: {
                            "Ref": "readCap"
                        },
                        WriteCapacityUnits: '1'
                    },
                    TableName: 'TEST-TABLE-6-' + params.testParam
                }
            }
        }
    };
};
