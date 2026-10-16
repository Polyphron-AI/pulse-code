import { showBootError } from "./lib/bootError";

if (import.meta.env.DEV && new URL(window.location.href).searchParams.has("fixture")) {
  void import("./components/workspace/dev/workspaceMockupEntry")
    .then(({ startWorkspaceMockup }) => startWorkspaceMockup())
    .catch(showBootError);
} else {
  void import("./main").then(({ startup }) => startup).catch(showBootError);
}
