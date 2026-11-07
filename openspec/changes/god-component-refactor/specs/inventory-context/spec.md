# Inventory Context Specification

## Purpose

Manages per-warehouse inventory CRUD operations. Provides functions to initialize, increase, and decrease inventory levels, and tracks the active warehouse.

## Requirements

### Requirement: Inventory State Management

The system SHALL maintain inventory state per warehouse.

#### Scenario: Initialize inventory for warehouse

- GIVEN a warehouse is activated
- WHEN `inicializarInventarioAlmacen(almacenId)` is called
- THEN inventory for that warehouse is loaded/initialized
- AND `inventario` reflects the warehouse's stock levels

#### Scenario: Switch active warehouse

- GIVEN multiple warehouses exist
- WHEN `handleActivarAlmacen(almacenId)` is called
- THEN `almacenActivo` is updated
- AND `inicializarInventarioAlmacen` is called for the new warehouse

### Requirement: Increase Inventory

The system SHALL allow increasing inventory levels for products in the active warehouse.

#### Scenario: Add stock to inventory

- GIVEN inventory is initialized for active warehouse
- WHEN `aumentarInventario(productId, cantidad)` is called
- THEN the product's stock is increased by the specified amount
- AND the update is persisted to Firestore
- AND local `inventario` state reflects the change immediately

#### Scenario: Add stock for new product

- GIVEN product is not yet in inventory
- WHEN `aumentarInventario(productId, cantidad)` is called
- THEN the product is added to inventory with the specified quantity
- AND the entry is created in Firestore

### Requirement: Decrease Inventory

The system SHALL allow decreasing inventory levels for products in the active warehouse.

#### Scenario: Remove stock from inventory

- GIVEN inventory has sufficient stock for product
- WHEN `reducirInventario(productId, cantidad)` is called
- THEN the product's stock is decreased by the specified amount
- AND the update is persisted to Firestore
- AND local `inventario` state reflects the change immediately

#### Scenario: Prevent negative inventory

- GIVEN inventory has insufficient stock for product
- WHEN `reducirInventario(productId, cantidad)` is called with amount exceeding stock
- THEN the operation is rejected
- AND an error is returned
- AND inventory state remains unchanged

### Requirement: Active Warehouse Tracking

The system SHALL track and provide the currently active warehouse.

#### Scenario: Get active warehouse

- GIVEN a warehouse has been activated
- WHEN `almacenActivo` is accessed
- THEN the active warehouse object is returned

#### Scenario: Default warehouse on init

- GIVEN no warehouse has been explicitly activated
- WHEN the context initializes
- THEN a default warehouse is set as active (first in catalog or configured default)
