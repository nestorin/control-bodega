# Conversion Calculator Specification

## Purpose

Provides pure domain logic for unit conversions, sticker generation, and pallet distribution calculations. Contains no React dependencies — pure TypeScript functions that are easily testable.

## Requirements

### Requirement: Calculate Conversions and Stickers

The system SHALL calculate conversion tables and sticker data from matched products and conversion properties.

#### Scenario: Calculate conversions for single product

- GIVEN a matched product with conversion rules
- WHEN `calculateConversionesYStickers(matchedProducts, conversionProps)` is called
- THEN a conversion table is returned with:
  - Original units and quantities
  - Converted units and quantities per conversion rule
  - Sticker data for each conversion (QR code payload, quantity per sticker)

#### Scenario: Calculate conversions for multiple products

- GIVEN multiple matched products with conversion rules
- WHEN `calculateConversionesYStickers(matchedProducts, conversionProps)` is called
- THEN a combined conversion table is returned for all products
- AND each product's conversions are calculated independently

#### Scenario: Handle missing conversion rules

- GIVEN a product has no conversion rules in catalog
- WHEN `calculateConversionesYStickers` is called
- THEN the product is included with original units only
- AND no conversion rows are generated for that product

### Requirement: Calculate Total Pallets

The system SHALL calculate the total number of pallets needed from a conversion table.

#### Scenario: Calculate total pallets from conversions

- GIVEN a conversion table with quantities per pallet
- WHEN `calculateTotalTarimas(conversionesTabla)` is called
- THEN the total number of pallets is returned
- AND calculation sums all pallet quantities across products

#### Scenario: Handle empty conversion table

- GIVEN an empty conversion table
- WHEN `calculateTotalTarimas` is called
- THEN 0 is returned

### Requirement: Distribute Boxes Per Pallet

The system SHALL distribute boxes evenly across pallets for a given conversion.

#### Scenario: Distribute boxes evenly

- GIVEN a conversion with total boxes and target pallet count
- WHEN `distributeCajasPerTarima(conversion, tarimas)` is called
- THEN an array of box counts per pallet is returned
- AND the sum equals total boxes
- AND distribution is as even as possible (difference ≤ 1)

#### Scenario: Distribute when boxes < pallets

- GIVEN fewer boxes than pallets
- WHEN `distributeCajasPerTarima` is called
- THEN some pallets get 1 box, others get 0
- AND no pallet gets more than 1 box

#### Scenario: Distribute exact division

- GIVEN boxes divisible by pallets
- WHEN `distributeCajasPerTarima` is called
- THEN all pallets get the same count

### Requirement: Pure Functions

The system SHALL expose only pure functions with no side effects.

#### Scenario: No external dependencies

- GIVEN any calculator function
- WHEN called with same inputs
- THEN always returns same output
- AND no I/O, no state mutation, no React hooks

#### Scenario: Serializable inputs and outputs

- GIVEN calculator functions
- WHEN inputs are plain objects/primitives
- THEN outputs are plain objects/primitives
- AND suitable for JSON serialization