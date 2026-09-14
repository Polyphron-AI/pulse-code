/**
 * Web-local alias for the shared provider-instance view. The logic moved to
 * `packages/client-runtime` when mobile needed it too; this keeps the many
 * existing `../providerInstances` imports pointing somewhere sensible.
 */
export * from "@t3tools/client-runtime/state/provider-instances";
