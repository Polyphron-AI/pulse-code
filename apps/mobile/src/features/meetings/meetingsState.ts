import { createMeetingEnvironmentAtoms } from "@t3tools/client-runtime/state/meetings";

import { connectionAtomRuntime } from "../../connection/runtime";

export const meetingEnvironment = createMeetingEnvironmentAtoms(connectionAtomRuntime);
