import type { ProviderAdapterError } from "../Errors.ts";
import type { ProviderAdapterShape } from "./ProviderAdapter.ts";

/** Per-instance OMP adapter contract. */
export interface OmpAdapterShape extends ProviderAdapterShape<ProviderAdapterError> {}
