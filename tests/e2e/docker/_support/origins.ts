import process from 'node:process';
import { config } from '#config';

// The Docker runner (tools/docker-test.sh) sets both origins; the source falls
// back to the local dev server for standalone runs. Host networking lets both
// the browser and container reach the source through the same localhost origin.
// eslint-disable-next-line node/no-process-env -- the Docker runner sets the origins.
const { REMDO_E2E_HOME_ORIGIN, REMDO_E2E_SOURCE_ORIGIN } = process.env;

export const sourceOrigin = REMDO_E2E_SOURCE_ORIGIN ?? `http://localhost:${config.env.PORT}`;

if (!REMDO_E2E_HOME_ORIGIN) {
  throw new Error('REMDO_E2E_HOME_ORIGIN is required for Docker E2E.');
}
export const homeOrigin = REMDO_E2E_HOME_ORIGIN;
