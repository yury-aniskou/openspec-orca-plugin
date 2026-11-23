# Spec Delta

## Purpose
Let the user choose the provider (agent CLI) and model for each OpenSpec launch, and start the CLI with them.

## ADDED Requirements

### Requirement: Choose provider and model
The panel and the board SHALL let the user choose a provider from the supported agent CLIs and a model before launching, with the last choice remembered per plugin. The model field SHALL offer the provider's suggested models and accept any text. An empty model SHALL mean the CLI's own default.

#### Scenario: Pick a model
- **WHEN** the user selects provider `claude` and model `opus` and presses Apply
- **THEN** the agent is started with model `opus`

#### Scenario: Remembered choice
- **WHEN** the user reopens the panel after choosing `codex` and `gpt-5`
- **THEN** those are preselected

#### Scenario: Empty model
- **WHEN** the model is empty
- **THEN** the agent starts with no model flag

### Requirement: Start the CLI with the model
When a model is chosen, the worker SHALL open a terminal whose command is the provider's CLI with its model flag, wait until the agent shows an input prompt on a stable screen, and then send the OpenSpec command. When no model is chosen it SHALL launch as before. If the agent is not ready in time, the command SHALL NOT be sent and an error SHALL be shown.

#### Scenario: Claude with a model
- **WHEN** the provider is `claude`, the model `opus` and the step `apply` for `add-auth`
- **THEN** a terminal runs `claude --model opus` and then receives `/openspec-apply-change add-auth`

#### Scenario: Agent never ready
- **WHEN** the CLI does not show an input prompt within the timeout
- **THEN** no OpenSpec command is typed and the user sees an error

### Requirement: Model flag per provider
The plugin SHALL know a model flag template for each provider and SHALL let settings override it. A model value SHALL be quoted so it cannot add shell syntax; a value with a character outside letters, digits and `. _ : / -` SHALL be refused before any terminal is created.

#### Scenario: Unsafe model
- **WHEN** the model is `opus; rm -rf ~`
- **THEN** the launch is refused with an error and no terminal is created

#### Scenario: Overridden template
- **WHEN** settings set the `codex` template to `--model {model}`
- **THEN** the command is `codex --model <model>`

### Requirement: Default settings
The plugin SHALL provide settings for a default model and extra CLI arguments, applied when the launch does not choose otherwise.

#### Scenario: Default model
- **WHEN** the `model` setting is `sonnet` and the user launches without choosing
- **THEN** the agent starts with model `sonnet`
