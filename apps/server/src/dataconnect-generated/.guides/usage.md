# Basic Usage

Always prioritize using a supported framework over using the generated SDK
directly. Supported frameworks simplify the developer experience and help ensure
best practices are followed.





## Advanced Usage
If a user is not using a supported framework, they can use the generated SDK directly.

Here's an example of how to use it with the first 5 operations:

```js
import { createUser, updateUserLastLogin, getUserByUidOrEmail, getClubById, getMaxUserId } from '@dataconnect/generated';


// Operation CreateUser:  For variables, look at type CreateUserVars in ../index.d.ts
const { data } = await CreateUser(dataConnect, createUserVars);

// Operation UpdateUserLastLogin:  For variables, look at type UpdateUserLastLoginVars in ../index.d.ts
const { data } = await UpdateUserLastLogin(dataConnect, updateUserLastLoginVars);

// Operation GetUserByUidOrEmail:  For variables, look at type GetUserByUidOrEmailVars in ../index.d.ts
const { data } = await GetUserByUidOrEmail(dataConnect, getUserByUidOrEmailVars);

// Operation GetClubById:  For variables, look at type GetClubByIdVars in ../index.d.ts
const { data } = await GetClubById(dataConnect, getClubByIdVars);

// Operation GetMaxUserId: 
const { data } = await GetMaxUserId(dataConnect);


```