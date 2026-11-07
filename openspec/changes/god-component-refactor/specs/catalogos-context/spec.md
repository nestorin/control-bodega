# Catalogos Context Specification

## Purpose

Manages loading, caching, and synchronization of reference catalogs (products, suppliers, conversions, warehouses) from Firestore. Provides read-only access to catalog data for all screens and components.

## Requirements

### Requirement: Catalog Data Loading

The system SHALL load all reference catalogs from Firestore on initialization and provide them to consumers.

#### Scenario: Initial catalog load

- GIVEN the CatalogosProvider mounts
- WHEN `loadCatalogos()` executes
- THEN `catalogoProductos`, `catalogoProveedores`, `catalogoConversiones`, `catalogoAlmacenes` are populated from Firestore
- AND `catalogosLoading` is true during load
- AND `catalogosLoading` becomes false on completion

#### Scenario: Catalog load failure

- GIVEN Firestore is unavailable or query fails
- WHEN `loadCatalogos()` executes
- THEN `catalogosError` is set with error details
- AND `catalogosLoading` becomes false
- AND existing cached data (if any) remains accessible

### Requirement: Catalog Refresh

The system SHALL allow manual refresh of catalog data.

#### Scenario: Manual catalog refresh

- GIVEN catalogs are loaded
- WHEN `refreshCatalogos()` is called
- THEN `catalogosLoading` becomes true
- THEN all catalogs are re-fetched from Firestore
- AND `catalogosLoading` becomes false on completion
- AND `catalogosError` is cleared on success

### Requirement: Product Catalog Access

The system SHALL provide read access to the product catalog with search/filter capabilities.

#### Scenario: Get product by ID

- GIVEN `catalogoProductos` is loaded
- WHEN consumer requests product by ID
- THEN the matching product is returned
- AND returns undefined if not found

#### Scenario: Filter products by supplier

- GIVEN `catalogoProductos` is loaded
- WHEN filtering by supplier ID
- THEN only products for that supplier are returned

### Requirement: Supplier Catalog Access

The system SHALL provide read access to the supplier catalog.

#### Scenario: Get supplier by ID

- GIVEN `catalogoProveedores` is loaded
- WHEN consumer requests supplier by ID
- THEN the matching supplier is returned

### Requirement: Conversions Catalog Access

The system SHALL provide read access to the conversions catalog for unit conversion calculations.

#### Scenario: Get conversions for product

- GIVEN `catalogoConversiones` is loaded
- WHEN consumer requests conversions for a product
- THEN all matching conversion rules are returned

### Requirement: Warehouses Catalog Access

The system SHALL provide read access to the warehouses catalog for inventory management.

#### Scenario: Get warehouse by ID

- GIVEN `catalogoAlmacenes` is loaded
- WHEN consumer requests warehouse by ID
- THEN the matching warehouse is returned

#### Scenario: Get active warehouse

- GIVEN `catalogoAlmacenes` is loaded
- WHEN `almacenActivo` is requested
- THEN the currently active warehouse is returned (derived from context or default)

### Requirement: Loading and Error States

The system SHALL expose loading and error states for UI feedback.

#### Scenario: Show loading indicator

- GIVEN catalogs are loading
- WHEN `catalogosLoading` is true
- THEN UI can display a loading spinner

#### Scenario: Show error message

- GIVEN a catalog load error occurred
- WHEN `catalogosError` is set
- THEN UI can display an error message with retry option
