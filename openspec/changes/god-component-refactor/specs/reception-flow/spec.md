# Reception Flow Specification

## Purpose

Encapsulates all navigation and state transition logic for the reception workflow. Provides a clean API for screens to trigger reception flow steps without knowing navigation implementation details.

## Requirements

### Requirement: Start New Reception

The system SHALL initiate a new reception flow from the reception list.

#### Scenario: Start from programacion-recepcion

- GIVEN user is on `programacion-recepcion` screen
- WHEN `startNewReception()` is called
- THEN navigation goes to `nueva-step1`
- AND a new empty reception session is initialized

#### Scenario: Start directly from reception list

- GIVEN user is on `recepciones` screen
- WHEN `startNewReception()` is called
- THEN navigation goes to `nueva-step1`
- AND a new empty reception session is initialized

### Requirement: Continue to Evidence Capture

The system SHALL transition from step 1 to evidence capture.

#### Scenario: Continue from step 1 to evidence

- GIVEN user is on `nueva-step1` with valid step 1 data
- WHEN `continueToEvidence(step1Data)` is called
- THEN step 1 data is saved to reception session
- AND navigation goes to `captura-evidencia`

#### Scenario: Validate step 1 before continuing

- GIVEN user is on `nueva-step1` with incomplete data
- WHEN `continueToEvidence(step1Data)` is called
- THEN validation runs on step 1 data
- AND if invalid, navigation does not proceed
- AND validation errors are returned

### Requirement: Continue to Pallet Capture

The system SHALL transition from evidence capture to pallet capture.

#### Scenario: Continue from evidence to pallets

- GIVEN user is on `captura-evidencia` with evidence captured
- WHEN `continueToPallets(evidenceData)` is called
- THEN evidence data is saved to reception session
- AND navigation goes to `captura-tarima`

#### Scenario: Validate evidence before continuing

- GIVEN user is on `captura-evidencia` with no evidence
- WHEN `continueToPallets(evidenceData)` is called
- THEN validation runs on evidence data
- AND if invalid, navigation does not proceed

### Requirement: Complete Reception

The system SHALL finalize the reception and persist to Firestore.

#### Scenario: Complete reception successfully

- GIVEN user is on `captura-tarima` with all pallets captured
- WHEN `completeReception()` is called
- THEN reception data is assembled from session
- AND data is written to Firestore
- AND localStorage backup is cleared
- AND navigation goes to `completada` screen
- AND reception session is reset

#### Scenario: Complete with validation

- GIVEN user is on `captura-tarima` with missing required data
- WHEN `completeReception()` is called
- THEN validation runs on complete reception data
- AND if invalid, completion is blocked
- AND validation errors are returned

### Requirement: Edit Existing Reception

The system SHALL load an existing reception for editing.

#### Scenario: Enter edit mode

- GIVEN user selects a reception from the list
- WHEN `editReception(receptionId)` is called
- THEN reception data is fetched from Firestore
- AND `editId` is set
- AND `editReceptionData` is populated
- AND navigation goes to `editar-recepcion`

#### Scenario: Save edited reception

- GIVEN user is in edit mode with modified data
- WHEN `completeReception()` is called (in edit context)
- THEN updated data is written to Firestore
- AND navigation returns to `recepciones`
- AND edit state is cleared

### Requirement: View Pallet Detail

The system SHALL navigate to pallet detail view.

#### Scenario: View pallet detail from QR

- GIVEN a QR code is scanned or selected
- WHEN `viewTarimaDetalle(qrCode)` is called
- THEN `scannedQrCode` is set in reception context
- AND navigation goes to `tarima-detalle`

### Requirement: Cancel Flow

The system SHALL allow canceling the reception flow at any step.

#### Scenario: Cancel from any step

- GIVEN user is in any reception step
- WHEN `cancelReception()` is called
- THEN localStorage backup is preserved (if enabled)
- AND reception session is reset
- AND navigation returns to `recepciones`