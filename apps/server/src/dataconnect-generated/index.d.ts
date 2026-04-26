import { ConnectorConfig, DataConnect, QueryRef, QueryPromise, ExecuteQueryOptions, MutationRef, MutationPromise, DataConnectSettings } from 'firebase/data-connect';

export const connectorConfig: ConnectorConfig;
export const dataConnectSettings: DataConnectSettings;

export type TimestampString = string;
export type UUIDString = string;
export type Int64String = string;
export type DateString = string;




export interface Club_Key {
  id: number;
  __typename?: 'Club_Key';
}

export interface CreateUserData {
  user_insert: User_Key;
}

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

export interface GetClubByIdData {
  club?: {
    id: number;
    name: string;
  } & Club_Key;
}

export interface GetClubByIdVariables {
  id: number;
}

export interface GetMaxUserIdData {
  users: ({
    id: number;
  } & User_Key)[];
}

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

export interface GetUserByUidOrEmailVariables {
  uid: string;
  email: string;
}

export interface UpdateUserLastLoginData {
  user_updateMany: number;
}

export interface UpdateUserLastLoginVariables {
  uid: string;
  lastLoginAt: TimestampString;
}

export interface User_Key {
  id: number;
  __typename?: 'User_Key';
}

interface CreateUserRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: CreateUserVariables): MutationRef<CreateUserData, CreateUserVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: CreateUserVariables): MutationRef<CreateUserData, CreateUserVariables>;
  operationName: string;
}
export const createUserRef: CreateUserRef;

export function createUser(vars: CreateUserVariables): MutationPromise<CreateUserData, CreateUserVariables>;
export function createUser(dc: DataConnect, vars: CreateUserVariables): MutationPromise<CreateUserData, CreateUserVariables>;

interface UpdateUserLastLoginRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: UpdateUserLastLoginVariables): MutationRef<UpdateUserLastLoginData, UpdateUserLastLoginVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: UpdateUserLastLoginVariables): MutationRef<UpdateUserLastLoginData, UpdateUserLastLoginVariables>;
  operationName: string;
}
export const updateUserLastLoginRef: UpdateUserLastLoginRef;

export function updateUserLastLogin(vars: UpdateUserLastLoginVariables): MutationPromise<UpdateUserLastLoginData, UpdateUserLastLoginVariables>;
export function updateUserLastLogin(dc: DataConnect, vars: UpdateUserLastLoginVariables): MutationPromise<UpdateUserLastLoginData, UpdateUserLastLoginVariables>;

interface GetUserByUidOrEmailRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: GetUserByUidOrEmailVariables): QueryRef<GetUserByUidOrEmailData, GetUserByUidOrEmailVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: GetUserByUidOrEmailVariables): QueryRef<GetUserByUidOrEmailData, GetUserByUidOrEmailVariables>;
  operationName: string;
}
export const getUserByUidOrEmailRef: GetUserByUidOrEmailRef;

export function getUserByUidOrEmail(vars: GetUserByUidOrEmailVariables, options?: ExecuteQueryOptions): QueryPromise<GetUserByUidOrEmailData, GetUserByUidOrEmailVariables>;
export function getUserByUidOrEmail(dc: DataConnect, vars: GetUserByUidOrEmailVariables, options?: ExecuteQueryOptions): QueryPromise<GetUserByUidOrEmailData, GetUserByUidOrEmailVariables>;

interface GetClubByIdRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: GetClubByIdVariables): QueryRef<GetClubByIdData, GetClubByIdVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: GetClubByIdVariables): QueryRef<GetClubByIdData, GetClubByIdVariables>;
  operationName: string;
}
export const getClubByIdRef: GetClubByIdRef;

export function getClubById(vars: GetClubByIdVariables, options?: ExecuteQueryOptions): QueryPromise<GetClubByIdData, GetClubByIdVariables>;
export function getClubById(dc: DataConnect, vars: GetClubByIdVariables, options?: ExecuteQueryOptions): QueryPromise<GetClubByIdData, GetClubByIdVariables>;

interface GetMaxUserIdRef {
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<GetMaxUserIdData, undefined>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect): QueryRef<GetMaxUserIdData, undefined>;
  operationName: string;
}
export const getMaxUserIdRef: GetMaxUserIdRef;

export function getMaxUserId(options?: ExecuteQueryOptions): QueryPromise<GetMaxUserIdData, undefined>;
export function getMaxUserId(dc: DataConnect, options?: ExecuteQueryOptions): QueryPromise<GetMaxUserIdData, undefined>;

