# Captura Tarima Specification

## Purpose

Refactors the CapturaTarima screen to extract QR scanner logic into a dedicated hook, type the QR reader ref properly, and fix a race condition between localStorage and Firestore writes.

## Requirements

### Requirement: Extract Scanner Logic

The system SHALL move all QR scanner logic out of the screen component into a reusable hook.

#### Scenario: useScanner hook provides scanner API

- GIVEN a component needs QR scanning
- WHEN `useScanner()` is called
- THEN it returns:
  - `qrReaderRef` (typed ref for @zxing/browser)
  - `isScanning` state
  - `startScanning()` function
  - `stopScanning()` function
  - `onScanSuccess` callback handler
  - `scanError` state

#### Scenario: Hook handles scanner lifecycle

- GIVEN `useScanner` is used
- WHEN component mounts
- THEN scanner is not started automatically
- WHEN `startScanning()` is called
- THEN camera permission is requested
- AND scanning begins
- WHEN `stopScanning()` is called
- THEN camera stream is stopped
- AND resources are cleaned up
- WHEN component unmounts
- THEN `stopScanning()` is called automatically

### Requirement: Typed QR Reader Ref

The system SHALL properly type the QR reader ref using @zxing/browser types.

#### Scenario: qrReaderRef has correct type

- GIVEN `useScanner` returns `qrReaderRef`
- WHEN inspected
- THEN type is `React.RefObject<HTMLVideoElement>` (or appropriate @zxing/browser type)
- AND TypeScript strict mode passes
- AND no `any` types are used

### Requirement: Fix Race Condition

The system SHALL fix the race condition between localStorage backup and Firestore writes during pallet capture.

#### Scenario: Atomic pallet save

- GIVEN a pallet is captured with QR code
- WHEN saving to both localStorage and Firestore
- THEN writes are coordinated to prevent data loss:
  - localStorage is updated first (immediate backup)
  - Firestore write follows
  - On Firestore success, localStorage backup is cleared
  - On Firestore failure, localStorage retains data for retry
- AND no intermediate state loses data

#### Scenario: Recovery after failure

- GIVEN a Firestore write failed previously
- WHEN app restarts or user retries
- THEN localStorage backup is detected
- AND user is prompted to sync pending data
- AND sync retries Firestore write
- AND on success, localStorage backup is cleared

### Requirement: Screen Uses Hook

The system SHALL update CapturaTarima screen to consume the extracted hook.

#### Scenario: Screen delegates scanner to hook

- GIVEN CapturaTarimaScreen is rendered
- WHEN scanner functionality is needed
- THEN screen calls `useScanner()`
- AND uses returned API instead of inline logic
- AND screen focuses on UI rendering only

#### Scenario: Screen handles scan results via context

- GIVEN a QR code is scanned
- WHEN `onScanSuccess` fires
- THEN scanned code is passed to `useReceptionFlow().viewTarimaDetalle(qrCode)`
- AND navigation is handled by reception flow hook
