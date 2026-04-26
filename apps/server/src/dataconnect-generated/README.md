# Generated TypeScript README
This README will guide you through the process of using the generated JavaScript SDK package for the connector `example`. It will also provide examples on how to use your generated SDK to call your Data Connect queries and mutations.

***NOTE:** This README is generated alongside the generated SDK. If you make changes to this file, they will be overwritten when the SDK is regenerated.*

# Table of Contents
- [**Overview**](#generated-javascript-readme)
- [**Accessing the connector**](#accessing-the-connector)
  - [*Connecting to the local Emulator*](#connecting-to-the-local-emulator)
- [**Queries**](#queries)
  - [*GetUserByUidOrEmail*](#getuserbyuidoremail)
  - [*GetClubById*](#getclubbyid)
  - [*GetMaxUserId*](#getmaxuserid)
- [**Mutations**](#mutations)
  - [*CreateUser*](#createuser)
  - [*UpdateUserLastLogin*](#updateuserlastlogin)

# Accessing the connector
A connector is a collection of Queries and Mutations. One SDK is generated for each connector - this SDK is generated for the connector `example`. You can find more information about connectors in the [Data Connect documentation](https://firebase.google.com/docs/data-connect#how-does).

You can use this generated SDK by importing from the package `@dataconnect/generated` as shown below. Both CommonJS and ESM imports are supported.

You can also follow the instructions from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#set-client).

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig } from '@dataconnect/generated';

const dataConnect = getDataConnect(connectorConfig);
```

## Connecting to the local Emulator
By default, the connector will connect to the production service.

To connect to the emulator, you can use the following code.
You can also follow the emulator instructions from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#instrument-clients).

```typescript
import { connectDataConnectEmulator, getDataConnect } from 'firebase/data-connect';
import { connectorConfig } from '@dataconnect/generated';

const dataConnect = getDataConnect(connectorConfig);
connectDataConnectEmulator(dataConnect, 'localhost', 9399);
```

After it's initialized, you can call your Data Connect [queries](#queries) and [mutations](#mutations) from your generated SDK.

# Queries

There are two ways to execute a Data Connect Query using the generated Web SDK:
- Using a Query Reference function, which returns a `QueryRef`
  - The `QueryRef` can be used as an argument to `executeQuery()`, which will execute the Query and return a `QueryPromise`
- Using an action shortcut function, which returns a `QueryPromise`
  - Calling the action shortcut function will execute the Query and return a `QueryPromise`

The following is true for both the action shortcut function and the `QueryRef` function:
- The `QueryPromise` returned will resolve to the result of the Query once it has finished executing
- If the Query accepts arguments, both the action shortcut function and the `QueryRef` function accept a single argument: an object that contains all the required variables (and the optional variables) for the Query
- Both functions can be called with or without passing in a `DataConnect` instance as an argument. If no `DataConnect` argument is passed in, then the generated SDK will call `getDataConnect(connectorConfig)` behind the scenes for you.

Below are examples of how to use the `example` connector's generated functions to execute each query. You can also follow the examples from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#using-queries).

## GetUserByUidOrEmail
You can execute the `GetUserByUidOrEmail` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
getUserByUidOrEmail(vars: GetUserByUidOrEmailVariables, options?: ExecuteQueryOptions): QueryPromise<GetUserByUidOrEmailData, GetUserByUidOrEmailVariables>;

interface GetUserByUidOrEmailRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: GetUserByUidOrEmailVariables): QueryRef<GetUserByUidOrEmailData, GetUserByUidOrEmailVariables>;
}
export const getUserByUidOrEmailRef: GetUserByUidOrEmailRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
getUserByUidOrEmail(dc: DataConnect, vars: GetUserByUidOrEmailVariables, options?: ExecuteQueryOptions): QueryPromise<GetUserByUidOrEmailData, GetUserByUidOrEmailVariables>;

interface GetUserByUidOrEmailRef {
  ...
  (dc: DataConnect, vars: GetUserByUidOrEmailVariables): QueryRef<GetUserByUidOrEmailData, GetUserByUidOrEmailVariables>;
}
export const getUserByUidOrEmailRef: GetUserByUidOrEmailRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the getUserByUidOrEmailRef:
```typescript
const name = getUserByUidOrEmailRef.operationName;
console.log(name);
```

### Variables
The `GetUserByUidOrEmail` query requires an argument of type `GetUserByUidOrEmailVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface GetUserByUidOrEmailVariables {
  uid: string;
  email: string;
}
```
### Return Type
Recall that executing the `GetUserByUidOrEmail` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `GetUserByUidOrEmailData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface GetUserByUidOrEmailData {
  users: ({
    id: number;
    uid: string;
    email: string;
    name: string;
    firstName?: string | null;
    lastName?: string | null;
    role: string;
    status: string;
    clubId?: number | null;
    avatarUrl?: string | null;
    phone?: string | null;
    preferredLanguage?: string | null;
    notificationPreferences?: string | null;
    lastLoginAt?: TimestampString | null;
    createdAt: TimestampString;
  } & User_Key)[];
}
```
### Using `GetUserByUidOrEmail`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, getUserByUidOrEmail, GetUserByUidOrEmailVariables } from '@dataconnect/generated';

// The `GetUserByUidOrEmail` query requires an argument of type `GetUserByUidOrEmailVariables`:
const getUserByUidOrEmailVars: GetUserByUidOrEmailVariables = {
  uid: ..., 
  email: ..., 
};

// Call the `getUserByUidOrEmail()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await getUserByUidOrEmail(getUserByUidOrEmailVars);
// Variables can be defined inline as well.
const { data } = await getUserByUidOrEmail({ uid: ..., email: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await getUserByUidOrEmail(dataConnect, getUserByUidOrEmailVars);

console.log(data.users);

// Or, you can use the `Promise` API.
getUserByUidOrEmail(getUserByUidOrEmailVars).then((response) => {
  const data = response.data;
  console.log(data.users);
});
```

### Using `GetUserByUidOrEmail`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, getUserByUidOrEmailRef, GetUserByUidOrEmailVariables } from '@dataconnect/generated';

// The `GetUserByUidOrEmail` query requires an argument of type `GetUserByUidOrEmailVariables`:
const getUserByUidOrEmailVars: GetUserByUidOrEmailVariables = {
  uid: ..., 
  email: ..., 
};

// Call the `getUserByUidOrEmailRef()` function to get a reference to the query.
const ref = getUserByUidOrEmailRef(getUserByUidOrEmailVars);
// Variables can be defined inline as well.
const ref = getUserByUidOrEmailRef({ uid: ..., email: ..., });

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = getUserByUidOrEmailRef(dataConnect, getUserByUidOrEmailVars);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.users);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.users);
});
```

## GetClubById
You can execute the `GetClubById` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
getClubById(vars: GetClubByIdVariables, options?: ExecuteQueryOptions): QueryPromise<GetClubByIdData, GetClubByIdVariables>;

interface GetClubByIdRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: GetClubByIdVariables): QueryRef<GetClubByIdData, GetClubByIdVariables>;
}
export const getClubByIdRef: GetClubByIdRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
getClubById(dc: DataConnect, vars: GetClubByIdVariables, options?: ExecuteQueryOptions): QueryPromise<GetClubByIdData, GetClubByIdVariables>;

interface GetClubByIdRef {
  ...
  (dc: DataConnect, vars: GetClubByIdVariables): QueryRef<GetClubByIdData, GetClubByIdVariables>;
}
export const getClubByIdRef: GetClubByIdRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the getClubByIdRef:
```typescript
const name = getClubByIdRef.operationName;
console.log(name);
```

### Variables
The `GetClubById` query requires an argument of type `GetClubByIdVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface GetClubByIdVariables {
  id: number;
}
```
### Return Type
Recall that executing the `GetClubById` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `GetClubByIdData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface GetClubByIdData {
  club?: {
    id: number;
    name: string;
  } & Club_Key;
}
```
### Using `GetClubById`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, getClubById, GetClubByIdVariables } from '@dataconnect/generated';

// The `GetClubById` query requires an argument of type `GetClubByIdVariables`:
const getClubByIdVars: GetClubByIdVariables = {
  id: ..., 
};

// Call the `getClubById()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await getClubById(getClubByIdVars);
// Variables can be defined inline as well.
const { data } = await getClubById({ id: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await getClubById(dataConnect, getClubByIdVars);

console.log(data.club);

// Or, you can use the `Promise` API.
getClubById(getClubByIdVars).then((response) => {
  const data = response.data;
  console.log(data.club);
});
```

### Using `GetClubById`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, getClubByIdRef, GetClubByIdVariables } from '@dataconnect/generated';

// The `GetClubById` query requires an argument of type `GetClubByIdVariables`:
const getClubByIdVars: GetClubByIdVariables = {
  id: ..., 
};

// Call the `getClubByIdRef()` function to get a reference to the query.
const ref = getClubByIdRef(getClubByIdVars);
// Variables can be defined inline as well.
const ref = getClubByIdRef({ id: ..., });

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = getClubByIdRef(dataConnect, getClubByIdVars);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.club);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.club);
});
```

## GetMaxUserId
You can execute the `GetMaxUserId` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
getMaxUserId(options?: ExecuteQueryOptions): QueryPromise<GetMaxUserIdData, undefined>;

interface GetMaxUserIdRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<GetMaxUserIdData, undefined>;
}
export const getMaxUserIdRef: GetMaxUserIdRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
getMaxUserId(dc: DataConnect, options?: ExecuteQueryOptions): QueryPromise<GetMaxUserIdData, undefined>;

interface GetMaxUserIdRef {
  ...
  (dc: DataConnect): QueryRef<GetMaxUserIdData, undefined>;
}
export const getMaxUserIdRef: GetMaxUserIdRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the getMaxUserIdRef:
```typescript
const name = getMaxUserIdRef.operationName;
console.log(name);
```

### Variables
The `GetMaxUserId` query has no variables.
### Return Type
Recall that executing the `GetMaxUserId` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `GetMaxUserIdData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface GetMaxUserIdData {
  users: ({
    id: number;
  } & User_Key)[];
}
```
### Using `GetMaxUserId`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, getMaxUserId } from '@dataconnect/generated';


// Call the `getMaxUserId()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await getMaxUserId();

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await getMaxUserId(dataConnect);

console.log(data.users);

// Or, you can use the `Promise` API.
getMaxUserId().then((response) => {
  const data = response.data;
  console.log(data.users);
});
```

### Using `GetMaxUserId`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, getMaxUserIdRef } from '@dataconnect/generated';


// Call the `getMaxUserIdRef()` function to get a reference to the query.
const ref = getMaxUserIdRef();

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = getMaxUserIdRef(dataConnect);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.users);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.users);
});
```

# Mutations

There are two ways to execute a Data Connect Mutation using the generated Web SDK:
- Using a Mutation Reference function, which returns a `MutationRef`
  - The `MutationRef` can be used as an argument to `executeMutation()`, which will execute the Mutation and return a `MutationPromise`
- Using an action shortcut function, which returns a `MutationPromise`
  - Calling the action shortcut function will execute the Mutation and return a `MutationPromise`

The following is true for both the action shortcut function and the `MutationRef` function:
- The `MutationPromise` returned will resolve to the result of the Mutation once it has finished executing
- If the Mutation accepts arguments, both the action shortcut function and the `MutationRef` function accept a single argument: an object that contains all the required variables (and the optional variables) for the Mutation
- Both functions can be called with or without passing in a `DataConnect` instance as an argument. If no `DataConnect` argument is passed in, then the generated SDK will call `getDataConnect(connectorConfig)` behind the scenes for you.

Below are examples of how to use the `example` connector's generated functions to execute each mutation. You can also follow the examples from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#using-mutations).

## CreateUser
You can execute the `CreateUser` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
createUser(vars: CreateUserVariables): MutationPromise<CreateUserData, CreateUserVariables>;

interface CreateUserRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: CreateUserVariables): MutationRef<CreateUserData, CreateUserVariables>;
}
export const createUserRef: CreateUserRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
createUser(dc: DataConnect, vars: CreateUserVariables): MutationPromise<CreateUserData, CreateUserVariables>;

interface CreateUserRef {
  ...
  (dc: DataConnect, vars: CreateUserVariables): MutationRef<CreateUserData, CreateUserVariables>;
}
export const createUserRef: CreateUserRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the createUserRef:
```typescript
const name = createUserRef.operationName;
console.log(name);
```

### Variables
The `CreateUser` mutation requires an argument of type `CreateUserVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface CreateUserVariables {
  id: number;
  uid: string;
  email: string;
  name: string;
  firstName?: string | null;
  lastName?: string | null;
  role: string;
  status: string;
  createdAt: TimestampString;
  updatedAt: TimestampString;
}
```
### Return Type
Recall that executing the `CreateUser` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `CreateUserData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface CreateUserData {
  user_insert: User_Key;
}
```
### Using `CreateUser`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, createUser, CreateUserVariables } from '@dataconnect/generated';

// The `CreateUser` mutation requires an argument of type `CreateUserVariables`:
const createUserVars: CreateUserVariables = {
  id: ..., 
  uid: ..., 
  email: ..., 
  name: ..., 
  firstName: ..., // optional
  lastName: ..., // optional
  role: ..., 
  status: ..., 
  createdAt: ..., 
  updatedAt: ..., 
};

// Call the `createUser()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await createUser(createUserVars);
// Variables can be defined inline as well.
const { data } = await createUser({ id: ..., uid: ..., email: ..., name: ..., firstName: ..., lastName: ..., role: ..., status: ..., createdAt: ..., updatedAt: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await createUser(dataConnect, createUserVars);

console.log(data.user_insert);

// Or, you can use the `Promise` API.
createUser(createUserVars).then((response) => {
  const data = response.data;
  console.log(data.user_insert);
});
```

### Using `CreateUser`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, createUserRef, CreateUserVariables } from '@dataconnect/generated';

// The `CreateUser` mutation requires an argument of type `CreateUserVariables`:
const createUserVars: CreateUserVariables = {
  id: ..., 
  uid: ..., 
  email: ..., 
  name: ..., 
  firstName: ..., // optional
  lastName: ..., // optional
  role: ..., 
  status: ..., 
  createdAt: ..., 
  updatedAt: ..., 
};

// Call the `createUserRef()` function to get a reference to the mutation.
const ref = createUserRef(createUserVars);
// Variables can be defined inline as well.
const ref = createUserRef({ id: ..., uid: ..., email: ..., name: ..., firstName: ..., lastName: ..., role: ..., status: ..., createdAt: ..., updatedAt: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = createUserRef(dataConnect, createUserVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.user_insert);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.user_insert);
});
```

## UpdateUserLastLogin
You can execute the `UpdateUserLastLogin` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
updateUserLastLogin(vars: UpdateUserLastLoginVariables): MutationPromise<UpdateUserLastLoginData, UpdateUserLastLoginVariables>;

interface UpdateUserLastLoginRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: UpdateUserLastLoginVariables): MutationRef<UpdateUserLastLoginData, UpdateUserLastLoginVariables>;
}
export const updateUserLastLoginRef: UpdateUserLastLoginRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
updateUserLastLogin(dc: DataConnect, vars: UpdateUserLastLoginVariables): MutationPromise<UpdateUserLastLoginData, UpdateUserLastLoginVariables>;

interface UpdateUserLastLoginRef {
  ...
  (dc: DataConnect, vars: UpdateUserLastLoginVariables): MutationRef<UpdateUserLastLoginData, UpdateUserLastLoginVariables>;
}
export const updateUserLastLoginRef: UpdateUserLastLoginRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the updateUserLastLoginRef:
```typescript
const name = updateUserLastLoginRef.operationName;
console.log(name);
```

### Variables
The `UpdateUserLastLogin` mutation requires an argument of type `UpdateUserLastLoginVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface UpdateUserLastLoginVariables {
  uid: string;
  lastLoginAt: TimestampString;
}
```
### Return Type
Recall that executing the `UpdateUserLastLogin` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `UpdateUserLastLoginData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface UpdateUserLastLoginData {
  user_updateMany: number;
}
```
### Using `UpdateUserLastLogin`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, updateUserLastLogin, UpdateUserLastLoginVariables } from '@dataconnect/generated';

// The `UpdateUserLastLogin` mutation requires an argument of type `UpdateUserLastLoginVariables`:
const updateUserLastLoginVars: UpdateUserLastLoginVariables = {
  uid: ..., 
  lastLoginAt: ..., 
};

// Call the `updateUserLastLogin()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await updateUserLastLogin(updateUserLastLoginVars);
// Variables can be defined inline as well.
const { data } = await updateUserLastLogin({ uid: ..., lastLoginAt: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await updateUserLastLogin(dataConnect, updateUserLastLoginVars);

console.log(data.user_updateMany);

// Or, you can use the `Promise` API.
updateUserLastLogin(updateUserLastLoginVars).then((response) => {
  const data = response.data;
  console.log(data.user_updateMany);
});
```

### Using `UpdateUserLastLogin`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, updateUserLastLoginRef, UpdateUserLastLoginVariables } from '@dataconnect/generated';

// The `UpdateUserLastLogin` mutation requires an argument of type `UpdateUserLastLoginVariables`:
const updateUserLastLoginVars: UpdateUserLastLoginVariables = {
  uid: ..., 
  lastLoginAt: ..., 
};

// Call the `updateUserLastLoginRef()` function to get a reference to the mutation.
const ref = updateUserLastLoginRef(updateUserLastLoginVars);
// Variables can be defined inline as well.
const ref = updateUserLastLoginRef({ uid: ..., lastLoginAt: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = updateUserLastLoginRef(dataConnect, updateUserLastLoginVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.user_updateMany);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.user_updateMany);
});
```

