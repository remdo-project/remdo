import type { DataCollection } from '@sentry/core';

export const ERROR_REPORT_DATA_COLLECTION: DataCollection = {
  userInfo: false,
  cookies: false,
  httpHeaders: { request: { allow: ['User-Agent'] }, response: false },
  httpBodies: [],
  urlQueryParams: false,
  stackFrameVariables: false,
};
