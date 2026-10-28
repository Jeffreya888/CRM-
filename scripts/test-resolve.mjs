// Lets Node's test runner (type stripping) resolve extensionless TypeScript
// imports the way Metro/TypeScript do, e.g. `import { APP_NAME } from './config'`.
import { register } from 'node:module';

register('data:text/javascript,' + encodeURIComponent(`
  export async function resolve(specifier, context, next) {
    try {
      return await next(specifier, context);
    } catch (err) {
      if (err?.code === 'ERR_MODULE_NOT_FOUND' && /^\\.{1,2}\\//.test(specifier) && !/\\.[cm]?[jt]sx?$/.test(specifier)) {
        return next(specifier + '.ts', context);
      }
      throw err;
    }
  }
`));
