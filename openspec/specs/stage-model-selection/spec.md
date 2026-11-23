# stage-model-selection Specification

## Purpose
Lets the user choose the agent and model separately for each OpenSpec stage, confirm them before anything starts, and keep per-stage defaults.

## Requirements

### Requirement: Confirm before launch
The system SHALL show a dialog with the agent and model when the user triggers a stage action, and SHALL NOT start an agent until the user confirms.

#### Scenario: Confirm
- **WHEN** the user clicks Apply on a change and confirms the dialog
- **THEN** an agent starts with the chosen agent and model and receives the apply command

#### Scenario: Cancel
- **WHEN** the user cancels the dialog
- **THEN** no terminal is created

### Requirement: Per-stage defaults
The system SHALL prefill the dialog from the default for the stage, then the last global choice, then the plugin settings, and SHALL let the user save the shown choice as the default for that stage.

#### Scenario: Stage default prefilled
- **WHEN** a default of model `sonnet` is saved for archive and the user opens the archive dialog
- **THEN** the model field shows `sonnet`

#### Scenario: Defaults per stage are independent
- **WHEN** propose has default `opus` and apply has default `haiku`
- **THEN** each dialog shows its own model

#### Scenario: Setting provides defaults
- **WHEN** the `stageDefaults` setting contains a model for a stage and nothing was saved from the dialog
- **THEN** the dialog shows that model

### Requirement: Validation
The system SHALL refuse unsafe model text and malformed `stageDefaults` before creating a terminal, with a message naming the problem.

#### Scenario: Invalid model
- **WHEN** the confirmed model contains a space or shell metacharacter
- **THEN** the launch is refused and no terminal is created
