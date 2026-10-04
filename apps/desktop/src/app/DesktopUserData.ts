import { desktopUserDataDirName } from "@t3tools/shared/productIdentity";
import * as Effect from "effect/Effect";
import * as Path from "effect/Path";

/** Select Pulse's profile without probing or migrating official T3 Code state.
 * Startup must remain synchronous so Clerk registers its scheme before Electron is ready.
 */
export const resolveUserDataPath = Effect.fn("desktop.userData.resolveUserDataPath")(
  function* (input: { readonly appDataDirectory: string; readonly isDevelopment: boolean }) {
    const path = yield* Path.Path;
    return path.join(input.appDataDirectory, desktopUserDataDirName(input.isDevelopment));
  },
);
