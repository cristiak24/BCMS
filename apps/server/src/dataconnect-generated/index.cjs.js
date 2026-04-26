const { queryRef, executeQuery, validateArgsWithOptions, mutationRef, executeMutation, validateArgs, makeMemoryCacheProvider } = require('firebase/data-connect');

const connectorConfig = {
  connector: 'example',
  service: 'bcms-61b00-service',
  location: 'europe-central2'
};
exports.connectorConfig = connectorConfig;
const dataConnectSettings = {
  cacheSettings: {
    cacheProvider: makeMemoryCacheProvider()
  }
};
exports.dataConnectSettings = dataConnectSettings;

const createUserRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'CreateUser', inputVars);
}
createUserRef.operationName = 'CreateUser';
exports.createUserRef = createUserRef;

exports.createUser = function createUser(dcOrVars, vars) {
  const { dc: dcInstance, vars: inputVars } = validateArgs(connectorConfig, dcOrVars, vars, true);
  return executeMutation(createUserRef(dcInstance, inputVars));
}
;

const updateUserLastLoginRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'UpdateUserLastLogin', inputVars);
}
updateUserLastLoginRef.operationName = 'UpdateUserLastLogin';
exports.updateUserLastLoginRef = updateUserLastLoginRef;

exports.updateUserLastLogin = function updateUserLastLogin(dcOrVars, vars) {
  const { dc: dcInstance, vars: inputVars } = validateArgs(connectorConfig, dcOrVars, vars, true);
  return executeMutation(updateUserLastLoginRef(dcInstance, inputVars));
}
;

const getUserByUidOrEmailRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'GetUserByUidOrEmail', inputVars);
}
getUserByUidOrEmailRef.operationName = 'GetUserByUidOrEmail';
exports.getUserByUidOrEmailRef = getUserByUidOrEmailRef;

exports.getUserByUidOrEmail = function getUserByUidOrEmail(dcOrVars, varsOrOptions, options) {
  
  const { dc: dcInstance, vars: inputVars, options: inputOpts } = validateArgsWithOptions(connectorConfig, dcOrVars, varsOrOptions, options, true, true);
  return executeQuery(getUserByUidOrEmailRef(dcInstance, inputVars), inputOpts && inputOpts.fetchPolicy);
}
;

const getClubByIdRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'GetClubById', inputVars);
}
getClubByIdRef.operationName = 'GetClubById';
exports.getClubByIdRef = getClubByIdRef;

exports.getClubById = function getClubById(dcOrVars, varsOrOptions, options) {
  
  const { dc: dcInstance, vars: inputVars, options: inputOpts } = validateArgsWithOptions(connectorConfig, dcOrVars, varsOrOptions, options, true, true);
  return executeQuery(getClubByIdRef(dcInstance, inputVars), inputOpts && inputOpts.fetchPolicy);
}
;

const getMaxUserIdRef = (dc) => {
  const { dc: dcInstance} = validateArgs(connectorConfig, dc, undefined);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'GetMaxUserId');
}
getMaxUserIdRef.operationName = 'GetMaxUserId';
exports.getMaxUserIdRef = getMaxUserIdRef;

exports.getMaxUserId = function getMaxUserId(dcOrOptions, options) {
  
  const { dc: dcInstance, vars: inputVars, options: inputOpts } = validateArgsWithOptions(connectorConfig, dcOrOptions, options, undefined,false, false);
  return executeQuery(getMaxUserIdRef(dcInstance, inputVars), inputOpts && inputOpts.fetchPolicy);
}
;
