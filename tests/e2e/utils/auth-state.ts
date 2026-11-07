import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export const E2E_AUTH_STATE_PATH = join(
  resolve(
    process.env.PLAYWRIGHT_ARTIFACTS_DIR ??
      process.env.RUNNER_TEMP ??
      join(tmpdir(), "control-bodega-e2e"),
  ),
  "auth-user.json",
);
