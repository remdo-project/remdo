import './browser-mocks';
import { previewSetup } from './preview';

let bootPromise: Promise<void> | null = null;

export async function bootstrapEnv(): Promise<void> {
  if (!bootPromise) {
    bootPromise = previewSetup.catch((error) => {
      bootPromise = null;
      throw error;
    });
  }

  await bootPromise;
}
