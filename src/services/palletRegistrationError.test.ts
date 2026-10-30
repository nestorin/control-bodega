import { describe, expect, it } from "vitest";
import { palletRegistrationErrorMessage } from "./palletRegistrationError";

describe("palletRegistrationErrorMessage", () => {
  it("does not mislabel known callable internal errors as connection or permission failures", () => {
    expect(palletRegistrationErrorMessage({ code: "functions/internal" })).toBe(
      "No se pudo registrar la tarima por un error interno. La tarima no se guardó; intentá nuevamente.",
    );
  });

  it("keeps the connection and permission guidance for other errors", () => {
    expect(palletRegistrationErrorMessage({ code: "functions/permission-denied" })).toContain(
      "conexión y permisos",
    );
  });
});
