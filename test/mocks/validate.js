'use strict'

function validateMock (error) {
  return function (params, callback) {
    if (error) return callback(error)
    callback(null, {
      ResponseMetadata: { RequestId: '53635cc4-6571-11e7-8fdb-b90de36ad5dd' },
      Parameters: [],
      Description: 'Test Stack',
      Capabilities: [],
      DeclaredTransforms: []
    })
  }
}

module.exports = validateMock
