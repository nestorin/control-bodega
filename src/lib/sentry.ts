/**
 * Configuración de Sentry para monitoreo de errores
 *
 * Este archivo configura Sentry para capturar errores en producción
 * y provee logs estructurados para debugging.
 */

import * as Sentry from "@sentry/react";

const version = "1.0.0";

// Configuración base de Sentry
const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN;

// Solo inicializar si tenemos DSN
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 1.0,
    release: `tarimaqr@${version}`,
    environment: import.meta.env.MODE || "development",
    beforeSend(event, hint) {
      // Filtrar errores comunes que no son críticos
      if (
        event.exception?.values?.some(
          (val) =>
            val.type === "AbortError" || val.type === "TypeError" || val.type === "NetworkError",
        )
      ) {
        return null; // No enviar estos errores
      }

      // Agregar contexto útil
      event.tags = {
        ...event.tags,
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        language: navigator.language,
      };

      return event;
    },
  });

  console.info("Sentry initialized successfully");
} else {
  console.warn("Sentry DSN not found - monitoring disabled");
}

/**
 * Captura un error con contexto adicional
 *
 * @param error - Error a capturar
 * @param context - Información adicional para el reporte
 */
export function captureError(error: Error, context?: Record<string, any>) {
  if (SENTRY_DSN) {
    Sentry.captureException(error, {
      contexts: {
        ...context,
        app: {
          version: version,
          environment: import.meta.env.MODE || "development",
        },
      },
    });
  } else {
    console.error("Sentry not configured:", error, context);
  }
}

/**
 * Registra un mensaje de log estructurado
 *
 * @param level - Nivel del log (info, warn, error)
 * @param message - Mensaje a registrar
 * @param data - Datos adicionales
 */
export function log(level: "info" | "warn" | "error", message: string, data?: Record<string, any>) {
  if (SENTRY_DSN) {
    const logEvent = {
      level,
      message,
      ...data,
      timestamp: new Date().toISOString(),
    };

    // Enviar evento como breadcrumb o mensaje
    if (level === "error") {
      captureError(new Error(message), data);
    } else {
      Sentry.addBreadcrumb({
        message,
        data,
        level: level === "warn" ? "warning" : level,
        timestamp: Date.now() / 1000,
      });
    }
  } else {
    // En modo desarrollo, solo console.log
    const logFn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
    logFn(`[${level.toUpperCase()}] ${message}`, data);
  }
}

/**
 * Inicia una transacción de performance
 *
 * @param name - Nombre de la transacción
 * @param op - Operación (ej: "http.request", "db.query")
 */
export function startTransaction(name: string, op: string) {
  if (SENTRY_DSN) {
    return Sentry.startInactiveSpan({
      name,
      op,
    });
  }
  return null;
}

/**
 * Configura contexto de usuario para Sentry
 *
 * @param userId - ID del usuario
 * @param userData - Datos adicionales del usuario
 */
export function setUserContext(userId: string, userData?: Record<string, any>) {
  if (SENTRY_DSN) {
    Sentry.setUser({
      id: userId,
      ...userData,
    });
  }
}
