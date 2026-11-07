# UI Context Specification

## Purpose

Manages pure UI state including mobile detection, sidebar visibility, and header configuration. Contains no business logic — only presentation state.

## Requirements

### Requirement: Mobile Detection

The system SHALL detect and expose whether the current viewport is mobile.

#### Scenario: Detect mobile on mount

- GIVEN the UIProvider mounts
- WHEN the component initializes
- THEN `isMobile` is set based on viewport width (breakpoint: 768px)

#### Scenario: Update on resize

- GIVEN the viewport is resized
- WHEN width crosses the mobile breakpoint
- THEN `isMobile` updates accordingly
- AND listeners are cleaned up on unmount

### Requirement: Sidebar State Management

The system SHALL manage sidebar open/close state for desktop and mobile.

#### Scenario: Open sidebar on desktop

- GIVEN desktop viewport
- WHEN `setSidebarOpen(true)` is called
- THEN `sidebarOpen` becomes true
- AND sidebar is visible

#### Scenario: Close sidebar on mobile after navigation

- GIVEN mobile viewport
- WHEN a navigation item is selected
- THEN `sidebarOpen` becomes false automatically
- AND overlay is dismissed

#### Scenario: Toggle sidebar

- GIVEN any viewport
- WHEN `setSidebarOpen(!sidebarOpen)` is called
- THEN sidebar state toggles

### Requirement: Header Configuration

The system SHALL provide derived header configuration based on current screen and reception state.

#### Scenario: Header for reception list screen

- GIVEN screen is `recepciones`
- WHEN `header` is accessed
- THEN header config shows title "Recepciones"
- AND shows back button: false
- AND shows actions: new reception button

#### Scenario: Header for step screens

- GIVEN screen is `nueva-step1`, `captura-evidencia`, or `captura-tarima`
- WHEN `header` is accessed
- THEN header config shows step-appropriate title
- AND shows back button: true
- AND shows reception reference if `currentReception` exists

#### Scenario: Header for pallet detail

- GIVEN screen is `tarima-detalle`
- WHEN `header` is accessed
- THEN header config shows pallet QR code in title
- AND shows back button: true

#### Scenario: Header for edit mode

- GIVEN `editId` is set (editing existing reception)
- WHEN `header` is accessed
- THEN header config shows "Editar Recepción"
- AND shows back button: true
- AND shows save action

### Requirement: No Business Logic

The system SHALL NOT contain any business logic, data fetching, or state mutations beyond UI presentation.

#### Scenario: UIContext only exposes UI state

- GIVEN any consumer uses UIContext
- WHEN accessing context values
- THEN only `isMobile`, `sidebarOpen`, `setSidebarOpen`, and `header` are available
- AND no data loading, mutations, or navigation functions exist