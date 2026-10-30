const INTERNAL_FUNCTION_CODES = new Set(["internal", "functions/internal"]);

export function palletRegistrationErrorMessage(error: unknown): string {
  const code =
    typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
      ? error.code
      : undefined;

  if (code && INTERNAL_FUNCTION_CODES.has(code)) {
    return "No se pudo registrar la tarima por un error interno. La tarima no se guardó; intentá nuevamente.";
  }

  return "No se pudo registrar la tarima. Verificá tu conexión y permisos e intentá nuevamente.";
}
