var stackEventsMock = {};

var mockEvents = {
    UPDATE_COMPLETE: {
        "StackId": "arn:aws:cloudformation:us-west-2:00000000000:stack/test-stack-name/000f000-0000-0000-a000-00000000000",
        "EventId": "418b8290-a790-11e6-a1aa-503f2a2ceeba",
        "StackName": "test-stack-name",
        "LogicalResourceId": "test-stack-name",
        "PhysicalResourceId": "arn:aws:cloudformation:us-west-2:00000000000:stack/test-stack-name/000f000-0000-0000-a000-00000000000",
        "ResourceType": "AWS::CloudFormation::Stack",
        "Timestamp": "2016-11-10T21:54:29.786Z",
        "ResourceStatus": "UPDATE_COMPLETE"
    },
    DELETE_COMPLETE: {
        "StackId": "arn:aws:cloudformation:us-west-2:00000000000:stack/test-stack-name/000f000-0000-0000-a000-00000000000",
        "EventId": "version-a2414723-95d7-4c48-9146-4c36bcaeee8c",
        "StackName": "test-stack-name",
        "LogicalResourceId": "version",
        "PhysicalResourceId": "TESTPhysicalResourceId",
        "ResourceType": "AWS::ElasticBeanstalk::ApplicationVersion",
        "Timestamp": "2016-11-10T21:54:29.278Z",
        "ResourceStatus": "DELETE_COMPLETE"
    },
    DELETE_IN_PROGRESS: {
        "StackId": "arn:aws:cloudformation:us-west-2:00000000000:stack/test-stack-name/000f000-0000-0000-a000-00000000000",
        "EventId": "version-71c1ffb5-f38b-48fe-a429-7ea364fed6cb",
        "StackName": "test-stack-name",
        "LogicalResourceId": "version",
        "PhysicalResourceId": "TESTPhysicalResourceId",
        "ResourceType": "AWS::ElasticBeanstalk::ApplicationVersion",
        "Timestamp": "2016-11-10T21:54:28.859Z",
        "ResourceStatus": "DELETE_IN_PROGRESS"
    },
    UPDATE_COMPLETE_CLEANUP_IN_PROGRESS: {
        "StackId": "arn:aws:cloudformation:us-west-2:00000000000:stack/test-stack-name/000f000-0000-0000-a000-00000000000",
        "EventId": "3ff440c0-a790-11e6-b4cc-50a68a0e32ba",
        "StackName": "test-stack-name",
        "LogicalResourceId": "test-stack-name",
        "PhysicalResourceId": "arn:aws:cloudformation:us-west-2:00000000000:stack/test-stack-name/000f000-0000-0000-a000-00000000000",
        "ResourceType": "AWS::CloudFormation::Stack",
        "Timestamp": "2016-11-10T21:54:27.113Z",
        "ResourceStatus": "UPDATE_COMPLETE_CLEANUP_IN_PROGRESS"
    },
    ENV_UPDATE_COMPLETE: {
        "StackId": "arn:aws:cloudformation:us-west-2:00000000000:stack/test-stack-name/000f000-0000-0000-a000-00000000000",
        "EventId": "environment-UPDATE_COMPLETE-2016-11-10T21:54:25.086Z",
        "StackName": "test-stack-name",
        "LogicalResourceId": "environment",
        "PhysicalResourceId": "beanstalk-env-name",
        "ResourceType": "AWS::ElasticBeanstalk::Environment",
        "Timestamp": "2016-11-10T21:54:25.086Z",
        "ResourceStatus": "UPDATE_COMPLETE",
        "ResourceProperties": "testproperties"
    }
};

stackEventsMock.orderedStackEventsList = [
    mockEvents.UPDATE_COMPLETE,
    mockEvents.DELETE_COMPLETE,
    mockEvents.DELETE_IN_PROGRESS,
    mockEvents.UPDATE_COMPLETE_CLEANUP_IN_PROGRESS,
    mockEvents.ENV_UPDATE_COMPLETE
];

stackEventsMock.mockDescribeEventsResponse1 = {
    StackEvents: stackEventsMock.orderedStackEventsList,
    NextToken: "token1"
};

stackEventsMock.mockEventTypes = mockEvents;

module.exports = stackEventsMock;
