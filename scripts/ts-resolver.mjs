// Node's ESM resolver never guesses extensions (unlike TS/Next's "bundler"
// moduleResolution, which requires them omitted). lib/*.ts files are typed
// against Next's rules and stay extensionless in their own imports, so
// plain `node --experimental-strip-types` scripts that reach into lib/
// need this hook to append ".ts" on a relative-import miss. Registered via
// --import scripts/register-ts-resolver.mjs.
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (err.code === "ERR_MODULE_NOT_FOUND" && specifier.startsWith(".")) {
      return nextResolve(`${specifier}.ts`, context);
    }
    throw err;
  }
}
