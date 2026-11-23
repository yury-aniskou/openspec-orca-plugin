# Spec Delta

## Purpose
Gives the user the full list of models available for each agent, searchable, without depending on a hand-maintained list.

## ADDED Requirements

### Requirement: Full model list per agent
The system SHALL offer every model of the providers an agent can use, taken from the public models.dev catalog, in the model picker of the panel and the board.

#### Scenario: Agent with a single provider
- **WHEN** the agent is claude and the catalog is loaded
- **THEN** the picker lists the catalog's Anthropic models

#### Scenario: Multi-provider agent
- **WHEN** the agent is opencode
- **THEN** models are listed as `provider/model` across all catalog providers

### Requirement: Search
The system SHALL filter the model list as the user types, matching model id and display name case-insensitively, and SHALL accept typed text that matches no listed model as a custom model.

#### Scenario: Filter
- **WHEN** the user types `son 4`
- **THEN** only models whose id or name contain both `son` and `4` are shown

#### Scenario: Custom text
- **WHEN** the typed text matches nothing and the user confirms it
- **THEN** that text is used as the model if it passes validation

### Requirement: Cache and offline fallback
The system SHALL cache the catalog for 24 hours, refresh it on request, and fall back to the built-in suggestions when the catalog cannot be fetched or parsed, telling the user the list is not complete.

#### Scenario: Offline
- **WHEN** the catalog cannot be fetched and no cache exists
- **THEN** the built-in suggestions are shown with a notice, and launching still works

#### Scenario: Fresh cache
- **WHEN** the cache is younger than 24 hours
- **THEN** no network request is made
