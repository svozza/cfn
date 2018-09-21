const path = require('path')
const sinon = require('sinon')
const should = require('should')

require('./assertions')
require('should-sinon')

const AWS = require('aws-sdk-mock')

const cfn = require('../')

cfn.configure({ checkStackInterval: 10 })

describe('create/update', function () {
  // this.timeout(6000)
  let describeStackEventsStub
  let numDescribeStackEventsCalls

  beforeEach(function () {
    AWS.mock('CloudFormation', 'describeStacks', function (params, callback) {
      callback(null, require('./mocks/describe-stacks').response)
    })
    AWS.mock('CloudFormation', 'updateStack', function (params, callback) {
      callback(null, 'success!')
    })
  })
  afterEach(function () {
    AWS.restore()
  })
  describe('if stack events need to be paginated', function () {
    beforeEach(function () {
      numDescribeStackEventsCalls = 0
      describeStackEventsStub = AWS.mock('CloudFormation', 'describeStackEvents', function (params, callback) {
        var stackEvents = require('./mocks/stack-events')
        ++numDescribeStackEventsCalls
        // if next token is provided, respond with mock that has no "NextToken"
        if (params.NextToken === 'token1') {
          return callback(null, stackEvents.mockDescribeEventsResponsePage2)
        } else {
          return callback(null, stackEvents.mockDescribeEventsResponsePage1)
        }
      })
    })
    it('should call describe stack events twice', function () {
      var cfn = require('../')
      return cfn({ name: 'test-stack-name' }, path.join(__dirname, '/templates/test-template-1.json'))
        .then(function (res) {
          describeStackEventsStub.stub.should.be.calledTwice()
          // first call should have nextToken === undefined
          var firstCall = describeStackEventsStub.stub.firstCall
          firstCall.args[0].StackName.should.equal('test-stack-name')
          should(firstCall.args[0].NextToken).be.undefined()

          // second call nextToken should be 'token1'
          var secondCall = describeStackEventsStub.stub.secondCall
          secondCall.args[0].StackName.should.equal('test-stack-name')
          secondCall.args[0].NextToken.should.equal('token1')

          return res
        })
    })
  })
  describe('if update is in progress', function () {
    beforeEach(function () {
      numDescribeStackEventsCalls = 0
      describeStackEventsStub = AWS.mock('CloudFormation', 'describeStackEvents', function (params, callback) {
        var stackEvents = require('./mocks/stack-events')
        ++numDescribeStackEventsCalls
        // on first call, return with update still in progress mock stack events
        if (numDescribeStackEventsCalls < 2) {
          return callback(null, { StackEvents: stackEvents.updateInProgress })
        } else {
          // on second call, return with stack update complete mock events
          return callback(null, { StackEvents: stackEvents.updateComplete })
        }
      })
    })
    it('should loop until update is complete', function () {
      var cfn = require('../')
      return cfn({ name: 'test-stack-name' },
        path.join(__dirname, '/templates/test-template-1.json'))
        .then(function (res) {
          describeStackEventsStub.stub.should.be.calledTwice()
          // first call should have nextToken === undefined
          var firstCall = describeStackEventsStub.stub.firstCall
          firstCall.args[0].StackName.should.equal('test-stack-name')
          should(firstCall.args[0].NextToken).be.undefined()

          // make sure 2nd call isn't due to pagination
          var secondCall = describeStackEventsStub.stub.secondCall
          secondCall.args[0].StackName.should.equal('test-stack-name')
          should(secondCall.args[0].NextToken).be.undefined()
          return res
        })
    })
  })
  describe('createOrUpdate', function () {
    var updateStackStub, createStackStub
    beforeEach(function () {
      AWS.restore()
      // setup create/update stack stubs
      updateStackStub = AWS.mock('CloudFormation', 'updateStack', sinon.stub().callsArgWith(1, null, 'updated'))
      createStackStub = AWS.mock('CloudFormation', 'createStack', sinon.stub().callsArgWith(1, null, 'created'))

      AWS.mock('CloudFormation', 'describeStackEvents', function (params, callback) {
        var stackEvents = require('./mocks/stack-events')
        callback(null, {
          StackEvents: stackEvents.updateComplete
        })
      })
    })

    describe('if stack already exists', function () {
      var successStub
      beforeEach(function () {
        successStub = sinon.stub().callsArgWith(1, null, require('./mocks/describe-stacks').response)
        AWS.mock('CloudFormation', 'describeStacks', successStub)
      })
      it('updates stack from json template file without parameters', function () {
        var cfn = require('../')
        return cfn('test-stack-name', path.join(__dirname, '/templates/test-template-1.json'))
          .then(function (data) {
            // should only have called update, not create
            createStackStub.stub.should.not.be.called()
            updateStackStub.stub.should.be.calledOnce()
          })
      })
      it('updates stack from yaml template string without parameters', function () {
        var cfn = require('../')
        return cfn('test-stack-name',
          '---\n' +
          "AWSTemplateFormatVersion: '2010-09-09'\n" +
          'Description: Test Stack\n' +
          'Resources:\n' +
          '  testTable:\n' +
          '    Type: AWS::DynamoDB::Table\n' +
          '    Properties:\n' +
          '      AttributeDefinitions:\n' +
          '      - AttributeName: id\n' +
          '        AttributeType: S\n' +
          '      KeySchema:\n' +
          '      - AttributeName: id\n' +
          '        KeyType: HASH\n' +
          '      ProvisionedThroughput:\n' +
          "        ReadCapacityUnits: '1'\n" +
          "        WriteCapacityUnits: '1'\n" +
          '      TableName: TEST-TABLE-6\n'
        )
          .then(function (data) {
            createStackStub.stub.should.not.be.called()
            updateStackStub.stub.should.be.calledOnce()
            return data
          })
      })
      it('updates stack from json template file with CloudFormation parameters', function () {
        const getTemplateSummaryStub = AWS.mock('CloudFormation', 'getTemplateSummary', sinon.stub().callsArgWith(1, null, {
          Parameters: [
            {ParameterKey: 'TableName'}
          ]
        }))
        var cfn = require('../')
        return cfn({
          name: 'test-stack-name',
          template: path.join(__dirname, '/templates/test-template-4.json'),
          cfParams: {
            TableName: 'TestTable'
          }
        })
          .then(function (data) {
            getTemplateSummaryStub.stub.should.be.calledOnce()
            createStackStub.stub.should.not.be.called()
            updateStackStub.stub.should.be.calledOnce()
            updateStackStub.stub.should.be.calledWithMatch({
              Parameters: [
                {
                  ParameterKey: 'TableName',
                  ParameterValue: 'TestTable'
                }
              ]
            })
            return data
          })
      })
      it('updates stack from yaml template file with CloudFormation parameters', function () {
        const getTemplateSummaryStub = AWS.mock('CloudFormation', 'getTemplateSummary', sinon.stub().callsArgWith(1, null, {
          Parameters: [
            {ParameterKey: 'TableName'}
          ]
        }))
        var cfn = require('../')
        return cfn({
          name: 'test-stack-name',
          template: path.join(__dirname, '/templates/test-template-5.yml'),
          cfParams: {
            TableName: 'TestTable'
          }
        })
          .then(function (data) {
            getTemplateSummaryStub.stub.should.be.calledOnce()
            createStackStub.stub.should.not.be.called()
            updateStackStub.stub.should.be.calledOnce()
            updateStackStub.stub.should.be.calledWithMatch({
              Parameters: [
                {
                  ParameterKey: 'TableName',
                  ParameterValue: 'TestTable'
                }
              ]
            })
            return data
          })
      })
      it('updates stack from yaml template file with CloudFormation parameters AND tags', function () {
        const getTemplateSummaryStub = AWS.mock('CloudFormation', 'getTemplateSummary', sinon.stub().callsArgWith(1, null, {
          Parameters: [
            {ParameterKey: 'TableName'}
          ]
        }))
        var cfn = require('../')
        return cfn({
          name: 'test-stack-name',
          template: path.join(__dirname, '/templates/test-template-5.yml'),
          cfParams: {
            TableName: 'TestTable'
          },
          tags: {
            key: 'value'
          }
        })
        .then(function (data) {
          getTemplateSummaryStub.stub.should.be.calledOnce()
          createStackStub.stub.should.not.be.called()
          updateStackStub.stub.should.be.calledOnce()
          updateStackStub.stub.should.be.calledWithMatch({
            Parameters: [
              {
                ParameterKey: 'TableName',
                ParameterValue: 'TestTable'
              }
            ],
            Tags: [
              {
                Key: 'key',
                Value: 'value'
              }
            ]
          })
          return data
        })
      })
      it('updates stack from yaml template file with CloudFormation parameters AND empty tags when none passed', function () {
        const getTemplateSummaryStub = AWS.mock('CloudFormation', 'getTemplateSummary', sinon.stub().callsArgWith(1, null, {
          Parameters: [
            {ParameterKey: 'TableName'}
          ]
        }))
        var cfn = require('../')
        return cfn({
          name: 'test-stack-name',
          template: path.join(__dirname, '/templates/test-template-5.yml'),
          cfParams: {
            TableName: 'TestTable'
          }
        })
        .then(function (data) {
          getTemplateSummaryStub.stub.should.be.calledOnce()
          createStackStub.stub.should.not.be.called()
          updateStackStub.stub.should.be.calledOnce()
          updateStackStub.stub.should.be.calledWithMatch({
            Parameters: [
              {
                ParameterKey: 'TableName',
                ParameterValue: 'TestTable'
              }
            ],
            Tags: []
          })
          return data
        })
      })
      it('updates stack from js module file with module and CloudFormation parameters', function () {
        const getTemplateSummaryStub = AWS.mock('CloudFormation', 'getTemplateSummary', sinon.stub().callsArgWith(1, null, {
          Parameters: [
            {ParameterKey: 'readCap'}
          ]
        }))
        var cfn = require('../')
        return cfn({
          name: 'test-stack-name',
          template: path.join(__dirname, '/templates/test-template-6.js'),
          cfParams: {
            readCap: '1'
          },
          params: {
            testParam: 'FOR-JS-TEMPLATE'
          }
        })
        .then(function (data) {
          getTemplateSummaryStub.stub.should.be.calledOnce()
          createStackStub.stub.should.not.be.called()
          updateStackStub.stub.should.be.calledOnce()
          updateStackStub.stub.should.be.calledWithMatch({
            Parameters: [
              {
                ParameterKey: 'readCap',
                ParameterValue: '1'
              }
            ]
          })
          updateStackStub.stub.firstCall.args[0].TemplateBody.should.match(/"TableName":"TEST-TABLE-6-FOR-JS-TEMPLATE"/)
          return data
        })
      })
    })
    describe('if stack does not exist', function () {
      beforeEach(function () {
        // callback w/ err to simulate stack doesn't exist
        AWS.mock('CloudFormation', 'describeStacks',
          sinon.stub().callsArgWith(1, 'stack does not exist!', null))
      })
      it('creates json stack from file without parameters', function () {
        var cfn = require('../')
        return cfn('test-stack-name', path.join(__dirname, '/templates/test-template-1.json'))
          .then(function (data) {
            createStackStub.stub.should.be.calledOnce()
            updateStackStub.stub.should.not.be.called()
            return data
          })
      })
      it('creates stack from yaml template string without parameters', function () {
        var cfn = require('../')
        return cfn('test-stack-name',
                            '---\n' +
                            "AWSTemplateFormatVersion: '2010-09-09'\n" +
                            'Description: Test Stack\n' +
                            'Resources:\n' +
                            '  testTable:\n' +
                            '    Type: AWS::DynamoDB::Table\n' +
                            '    Properties:\n' +
                            '      AttributeDefinitions:\n' +
                            '      - AttributeName: id\n' +
                            '        AttributeType: S\n' +
                            '      KeySchema:\n' +
                            '      - AttributeName: id\n' +
                            '        KeyType: HASH\n' +
                            '      ProvisionedThroughput:\n' +
                            "        ReadCapacityUnits: '1'\n" +
                            "        WriteCapacityUnits: '1'\n" +
                            '      TableName: TEST-TABLE-6'
                )
                .then(function (data) {
                  createStackStub.stub.should.be.calledOnce()
                  updateStackStub.stub.should.not.be.called()
                  return data
                })
      })
      it('creates stack from json template file with CloudFormation parameters', function () {
        const getTemplateSummaryStub = AWS.mock('CloudFormation', 'getTemplateSummary', sinon.stub().callsArgWith(1, null, {
          Parameters: [{ParameterKey: 'TableName'}]
        }))
        var cfn = require('../')
        return cfn({
          name: 'test-stack-name',
          template: path.join(__dirname, '/templates/test-template-4.json'),
          cfParams: {
            TableName: 'TestTable'
          }
        })
        .then(function (data) {
          getTemplateSummaryStub.stub.should.be.calledOnce()
          createStackStub.stub.should.be.calledOnce()
          createStackStub.stub.should.be.calledWithMatch({
            Parameters: [
              {
                ParameterKey: 'TableName',
                ParameterValue: 'TestTable'
              }
            ]
          })
          updateStackStub.stub.should.not.be.called()
          return data
        })
      })
      it('creates stack from yaml template file with CloudFormation parameters', function () {
        const getTemplateSummaryStub = AWS.mock('CloudFormation', 'getTemplateSummary', sinon.stub().callsArgWith(1, null, {
          Parameters: [{ParameterKey: 'TableName'}]
        }))

        var cfn = require('../')
        return cfn({
          name: 'test-stack-name',
          template: path.join(__dirname, '/templates/test-template-5.yml'),
          cfParams: {
            TableName: 'TestTable'
          }
        })
        .then(function (data) {
          getTemplateSummaryStub.stub.should.be.calledOnce()
          createStackStub.stub.should.be.calledOnce()
          createStackStub.stub.should.be.calledWithMatch({
            Parameters: [
              {
                ParameterKey: 'TableName',
                ParameterValue: 'TestTable'
              }
            ]
          })
          updateStackStub.stub.should.not.be.called()
          return data
        })
      })
      it('creates stack from yaml template file with CloudFormation parameters', function () {
        const getTemplateSummaryStub = AWS.mock('CloudFormation', 'getTemplateSummary', sinon.stub().callsArgWith(1, null, {
          Parameters: [{ParameterKey: 'TableName'}]
        }))
        var cfn = require('../')
        return cfn({
          name: 'test-stack-name',
          template: path.join(__dirname, '/templates/test-template-5.yml'),
          cfParams: {
            TableName: 'TestTable'
          }
        })
        .then(function (data) {
          getTemplateSummaryStub.stub.should.be.calledOnce()
          createStackStub.stub.should.be.calledOnce()
          createStackStub.stub.should.be.calledWithMatch({
            Parameters: [
              {
                ParameterKey: 'TableName',
                ParameterValue: 'TestTable'
              }
            ]
          })
          updateStackStub.stub.should.not.be.called()
          return data
        })
      })
      it('creates stack from js module file with module and CloudFormation parameters', function () {
        const getTemplateSummaryStub = AWS.mock('CloudFormation', 'getTemplateSummary', sinon.stub().callsArgWith(1, null, {
          Parameters: [{ParameterKey: 'readCap'}]
        }))
        var cfn = require('../')
        return cfn({
          name: 'test-stack-name',
          template: path.join(__dirname, '/templates/test-template-6.js'),
          cfParams: {
            readCap: '1'
          },
          params: {
            testParam: 'FOR-JS-TEMPLATE'
          }
        })
        .then(function (data) {
          getTemplateSummaryStub.stub.should.be.calledOnce()
          updateStackStub.stub.should.not.be.called()
          createStackStub.stub.should.be.calledOnce()
          createStackStub.stub.should.be.calledWithMatch({
            Parameters: [
              {
                ParameterKey: 'readCap',
                ParameterValue: '1'
              }
            ]
          })
          createStackStub.stub.firstCall.args[0].TemplateBody.should.match(/"TableName":"TEST-TABLE-6-FOR-JS-TEMPLATE"/)
          return data
        })
      })
    })
  })
})

describe('validate', function () {
  let validateStub

  beforeEach(function () {
    AWS.restore()
    validateStub = AWS.mock('CloudFormation', 'validateTemplate', require('./mocks/validate')())
  })

  it('should validate a valid json template file', function () {
    var cfn = require('../')
    return cfn.validate('us-west-2', path.join(__dirname, '/templates/test-template-1.json'))
      .then(function (data) {
        data.should.be.an.Object()
        data.Description.should.equal('Test Stack')
        data.Parameters.should.be.an.Array()
        data.Parameters.should.be.empty()
        validateStub.stub.should.be.calledOnce()
      })
  })
  it('should validate a valid yml template file', function () {
    var cfn = require('../')
    return cfn.validate('us-west-2', path.join(__dirname, '/templates/test-template-5.yml'))
      .then(function (data) {
        data.should.be.an.Object()
        data.Description.should.equal('Test Stack')
        data.Parameters.should.be.an.Array()
        data.Parameters.should.be.empty()
        validateStub.stub.should.be.calledOnce()
      })
  })
  it('should validate a valid js module file using interpolated module parameters', function () {
    var cfn = require('../')
    return cfn.validate('us-west-2', path.join(__dirname, '/templates/test-template-3.js'), { testParam: 'TEST' })
      .then(function (data) {
        data.should.be.an.Object()
        data.Description.should.equal('Test Stack')
        data.Parameters.should.be.an.Array()
        data.Parameters.should.be.empty()
        validateStub.stub.should.be.calledOnce()
      })
  })
  it('should validate a valid yml inline template', function () {
    var cfn = require('../')
    return cfn.validate('us-west-2', '---\n' +
      "AWSTemplateFormatVersion: '2010-09-09'\n" +
      'Description: Test Stack\n' +
      'Resources:\n' +
      '  testTable:\n' +
      '    Type: AWS::DynamoDB::Table\n' +
      '    Properties:\n' +
      '      AttributeDefinitions:\n' +
      '      - AttributeName: id\n' +
      '        AttributeType: S\n' +
      '      KeySchema:\n' +
      '      - AttributeName: id\n' +
      '        KeyType: HASH\n' +
      '      ProvisionedThroughput:\n' +
      "        ReadCapacityUnits: '1'\n" +
      "        WriteCapacityUnits: '1'\n" +
      '      TableName: TEST-TABLE-6')
      .then(function (data) {
        data.should.be.an.Object()
        data.Description.should.equal('Test Stack')
        data.Parameters.should.be.an.Array()
        data.Parameters.should.be.empty()
        validateStub.stub.should.be.calledOnce()
      })
  })
  it('should validate a invalid yml inline template', function () {
    AWS.restore('CloudFormation') // needs to be here, as there is some weird state in AWS that doesn't allow mocks to be overwritten
    validateStub = AWS.mock('CloudFormation', 'validateTemplate', require('./mocks/validate')(new Error('Template format error: Unresolved resource dependencies [TableName] in the Resources block of the template')))
    var cfn = require('../')
    return cfn.validate('us-west-2', '---\n' +
      "AWSTemplateFormatVersion: '2010-09-09'\n" +
      'Description: Test Stack\n' +
      'Resources:\n' +
      '  testTable:\n' +
      '    Type: AWS::DynamoDB::Table\n' +
      '    Properties:\n' +
      '      AttributeDefinitions:\n' +
      '      - AttributeName: id\n' +
      '        AttributeType: S\n' +
      '      KeySchema:\n' +
      '      - AttributeName: id\n' +
      '        KeyType: HASH\n' +
      '      ProvisionedThroughput:\n' +
      "        ReadCapacityUnits: '1'\n" +
      "        WriteCapacityUnits: '1'\n" +
      '      TableName: !Ref TableName')
      .then(function () {
        throw new Error('has not produced invalidation error')
      }, function (err) {
        err.should.be.an.Error()
        err.message.should.equal('Template format error: Unresolved resource dependencies [TableName] in the Resources block of the template')
        validateStub.stub.should.be.calledOnce()
      })
  })
})

describe('CF templates', function () {
  this.timeout(6000)
  var updateStackStub
  beforeEach(function () {
    AWS.restore()
    // setup create/update stack stubs
    updateStackStub = AWS.mock('CloudFormation', 'updateStack', sinon.stub().callsArgWith(1, null, 'updated'))

    AWS.mock('CloudFormation', 'describeStackEvents', function (params, callback) {
      callback(null, { StackEvents: require('./mocks/stack-events').updateComplete })
    })

    AWS.mock('CloudFormation', 'describeStacks',
      sinon.stub().callsArgWith(1, null, require('./mocks/describe-stacks').response))
  })
  describe('Create / Update json template', function () {
    it('renders json string template correctly', function () {
      var cfn = require('../')
      return cfn('test-stack-name', path.join(__dirname, '/templates/test-template-1.json'))
        .then(function (data) {
          updateStackStub.stub.should.be.calledWithCFStackParams('test-stack-name', ['CAPABILITY_IAM', 'CAPABILITY_NAMED_IAM'],
            require(path.join(__dirname, '/templates/test-template-1.json')))
          return data
        })
    })
  })
  describe('Create / Update S3 template uri', function () {
    it('parses s3 https uri template correctly', function () {
      var cfn = require('../')
      return cfn('test-stack-name', 'https://s3.amazonaws.com/s3/template')
        .then(function (data) {
          updateStackStub.stub.should.be.calledWithCFStackParams('test-stack-name', ['CAPABILITY_IAM', 'CAPABILITY_NAMED_IAM'], null, 'https://s3.amazonaws.com/s3/template')
          return data
        })
    })
  })
  describe('Create / Update js template', function () {
    it('creates stack with correct template', function () {
      var cfn = require('../')
      return cfn('test-stack-name', path.join(__dirname, '/templates/test-template-2.js'))
        .then(function (data) {
          updateStackStub.stub.should.be.calledWithCFStackParams('test-stack-name', ['CAPABILITY_IAM', 'CAPABILITY_NAMED_IAM'],
            require(path.join(__dirname, '/templates/test-template-2.js')))
          return data
        })
    })
  })
  describe('Create / Update js function template', function () {
    it('should render template with params', function () {
      var cfn = require('../')
      var testParams = { testParam: 'TEST-PARAM' }
      return cfn({
        name: 'test-stack-name',
        template: path.join(__dirname, '/templates/test-template-3.js'),
        params: testParams
      }).then(function (data) {
        updateStackStub.stub.should.be.calledWithCFStackParams('test-stack-name', ['CAPABILITY_IAM', 'CAPABILITY_NAMED_IAM'],
          require(path.join(__dirname, '/templates/test-template-3.js'))(testParams))
        return data
      })
    })
  })
  describe('Create / Update template with s3 url inside', function () {
    it('renders json string template correctly', function () {
      var cfn = require('../')
      return cfn('test-stack-name', path.join(__dirname, '/templates/test-template-7.json'))
        .then(function (data) {
          updateStackStub.stub.should.be.calledWithCFStackParams('test-stack-name', ['CAPABILITY_IAM', 'CAPABILITY_NAMED_IAM'],
            require(path.join(__dirname, '/templates/test-template-7.json')))
          return data
        })
    })
  })
})
