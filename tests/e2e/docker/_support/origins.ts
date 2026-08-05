import process from 'node:process';

// The Docker runner (tools/docker-test.sh) sets both origins. Host networking
// lets both the browser and container reach the source through the same
// localhost origin.
// eslint-disable-next-line node/no-process-env -- the Docker runner sets the origins.
const { REMDO_E2E_HOME_ORIGIN, REMDO_E2E_SOURCE_ORIGIN } = process.env;

if (!REMDO_E2E_HOME_ORIGIN || !REMDO_E2E_SOURCE_ORIGIN) {
  throw new Error('REMDO_E2E_HOME_ORIGIN and REMDO_E2E_SOURCE_ORIGIN are required for Docker E2E.');
}
export const homeOrigin = REMDO_E2E_HOME_ORIGIN;
export const sourceOrigin = REMDO_E2E_SOURCE_ORIGIN;
