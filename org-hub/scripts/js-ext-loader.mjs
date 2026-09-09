// Node ESM resolution hook: append ".js" to extensionless relative imports.
//
// The frontend is bundled by webpack, which resolves `./lib/fields` happily.
// Node's ESM loader does not, so the sample-data check registers this hook to
// run the same source files unmodified.

import {register} from 'node:module';
import {pathToFileURL} from 'node:url';

export async function resolve(specifier, context, next) {
    try {
        return await next(specifier, context);
    } catch (err) {
        if (specifier.startsWith('.') && !specifier.endsWith('.js')) {
            return next(specifier + '.js', context);
        }
        throw err;
    }
}

register(pathToFileURL(import.meta.filename));
