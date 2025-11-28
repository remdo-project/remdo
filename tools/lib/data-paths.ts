import path from 'node:path';
import { cwd } from 'node:process';

export const DATA_DIR = path.resolve(cwd(), 'data');
