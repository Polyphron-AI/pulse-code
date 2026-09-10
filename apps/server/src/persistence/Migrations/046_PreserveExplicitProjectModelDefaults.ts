import * as Effect from "effect/Effect";

// Pulse's project.create API accepts explicit model choices. Historical events
// do not identify whether a value was chosen or automatically seeded, so the
// upstream blanket cleanup would erase valid user preferences and event history.
// Keep the migration slot, preserving existing choices; updated creation paths
// no longer seed defaults, and users can reset existing defaults in settings.
export default Effect.void;
