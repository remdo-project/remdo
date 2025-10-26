import { installBrowserMocks } from './browser-mocks';
import { configurePreview } from './preview';

let bootPromise: Promise<void> | null = null;

export async function bootstrapEnv(): Promise<void> {
  if (!bootPromise) {
    bootPromise = (async () => {
      installBrowserMocks();
      await configurePreview();
    })().catch((error) => {
      bootPromise = null;
      throw error;
    });
  }

  await bootPromise;
}
