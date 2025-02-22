import 'ses';
import rawTest from 'ava';
import { wrapTest } from '@endo/ses-ava';

lockdown({
  domainTaming: 'unsafe',
  // supertest compat
  overrideTaming: 'severe',
  // debugging
  errorTaming: 'unsafe-debug',
});

const test: typeof rawTest = wrapTest(rawTest);

export { test };