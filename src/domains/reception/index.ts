/**
 * Reception Domain - Barrel Export
 *
 * Estructura:
 * - receptionMachine.ts: State Machine (estados, transiciones)
 * - receptionDomain.ts: Lógica pura de dominio (mappers, cálculos, validaciones)
 * - useReceptionProgramming.ts: Hook adaptador (React + Firebase)
 * - ocrToReception.ts: Mapper OCR → ReceptionLineState
 * - programacionToApp.ts: Mapper ProgramacionRecepcion → AppReceptionState
 * - validation.ts: Validación en frontera
 */

export * from "./receptionMachine";
export * from "./receptionDomain";
export * from "./useReceptionProgramming";
