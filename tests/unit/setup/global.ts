import { applyVitestPreviewCacheEnv } from '../../../config/vitest-preview-env';
import '@testing-library/jest-dom/vitest';
import './setup-browser-mocks';

applyVitestPreviewCacheEnv();
