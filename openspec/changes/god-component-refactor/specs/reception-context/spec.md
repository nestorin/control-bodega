# Reception Context Specification

## Purpose

Provides global reception state management and navigation coordination for the reception workflow. This context consolidates all reception-related state that was previously scattered across `AppLayout` in `App.tsx`.

## Requirements

### Requirement: Reception State Management

The system SHALL provide a centralized store for all reception session data including current reception, session state, editing state, selected items, and pallet tracking.

#### Scenario: Initialize new reception session

- GIVEN the application starts
- WHEN the ReceptionProvider mounts
- THEN a new empty reception session is initialized
- AND `currentReception` is null
- AND `receptionSession` is in initial state

#### Scenario: Set current reception data

- GIVEN a reception session exists
- WHEN `setCurrentReception(data)` is called with valid reception data
- THEN `currentReception` is updated with the provided data
- AND the session state reflects the new reception

#### Scenario: Update reception session state

- GIVEN an active reception
- WHEN `receptionSession.transition(toState)` is called
- THEN the session state transitions to the new state
- AND invalid transitions are rejected

### Requirement: Navigation Coordination

The system SHALL coordinate screen navigation and active navigation state for the reception flow.

#### Scenario: Navigate to a screen

- GIVEN the app is on any screen
- WHEN `navigate(screen, navOptions?)` is called
- THEN the app navigates to the target screen
- AND `activeNav` is updated if navOptions provided
- AND `screen` state reflects the new screen

#### Scenario: Navigate with reception context

- GIVEN a reception is in progress
- WHEN navigating between reception steps (step1 → evidence → pallets)
- THEN navigation preserves reception context
- AND `tarimaActual` is maintained across steps

### Requirement: Editing State Management

The system SHALL manage editing state for existing receptions.

#### Scenario: Enter edit mode for existing reception

- GIVEN a list of receptions
- WHEN `editReception(id)` is called
- THEN `editId` is set to the reception ID
- AND `editReceptionData` is populated with the reception data
- AND `screen` navigates to `editar-recepcion`

#### Scenario: Exit edit mode

- GIVEN edit mode is active
- WHEN `cancelEdit()` is called
- THEN `editId` is cleared
- AND `editReceptionData` is cleared
- AND `screen` returns to reception list

### Requirement: Selection State Management

The system SHALL manage selection state for QR codes, evidence, and pallets.

#### Scenario: Select QR code for pallet detail

- GIVEN a QR code is scanned or selected
- WHEN `setScannedQrCode(code)` is called
- THEN `scannedQrCode` is set
- AND navigation can proceed to `tarima-detalle`

#### Scenario: Select evidence item

- GIVEN an evidence item is selected
- WHEN `setSelectedEvidencia(item)` is called
- THEN `selectedEvidencia` is updated

#### Scenario: Track current pallet

- GIVEN a pallet is being processed
- WHEN `setTarimaActual(pallet)` is called
- THEN `tarimaActual` is updated
- AND pallet data persists across screen navigation