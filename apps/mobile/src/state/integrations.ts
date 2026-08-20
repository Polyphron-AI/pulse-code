import {
  aggregateIntegrationConnections,
  createIntegrationRpcEnvironmentAtoms,
  supportsIntegrations,
} from "@t3tools/client-runtime/state/integrations";

import { connectionAtomRuntime } from "../connection/runtime";

/**
 * Mobile uses the same authenticated environment supervisor as every other RPC surface.
 * Credentials remain server-owned; this module only exposes redacted connection snapshots.
 */
export const integrationEnvironment = createIntegrationRpcEnvironmentAtoms(connectionAtomRuntime);

export {
  aggregateIntegrationConnections as aggregateMobileIntegrationConnections,
  supportsIntegrations as supportsMobileIntegrations,
};
