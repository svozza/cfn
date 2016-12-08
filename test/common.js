
// global promise library
global.Promise = require('bluebird');

// testing modules
global.chai = require("chai");
global.expect = require("chai").expect;
global.should = require("chai").should;
global.AssertionError = require("chai").AssertionError;
global.chaiAsPromised = require("chai-as-promised");
chai.use(chaiAsPromised);

global.sinonChai = require("sinon-chai");
chai.use(sinonChai);

