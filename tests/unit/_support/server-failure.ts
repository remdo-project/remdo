import process from 'node:process';
import { startServerErrorReporting } from '#platform/server-error-reporting';

await startServerErrorReporting();
const failure = new Error(process.argv[3]);
setTimeout(() => {
  if (process.argv[2] === 'reject') {
    void Promise.reject(failure);
  } else {
    throw failure;
  }
});
