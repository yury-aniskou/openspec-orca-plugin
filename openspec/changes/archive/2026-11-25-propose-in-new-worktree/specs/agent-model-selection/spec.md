## MODIFIED Requirements

### Requirement: Choose provider and model
The panel and the board SHALL let the user choose a provider from the supported agent CLIs and a model only when starting a stage, in the launch dialog; the panel SHALL NOT show provider or model fields while no stage is being started. The last choice SHALL be remembered per plugin. The model field SHALL offer the provider's suggested models and accept any text. An empty model SHALL mean the CLI's own default.

#### Scenario: Pick a model
- **WHEN** the user presses Apply, selects provider `claude` and model `opus` in the dialog and confirms
- **THEN** the agent is started with model `opus`

#### Scenario: No pickers before starting
- **WHEN** the panel is open and no stage action was pressed
- **THEN** no provider or model field is shown outside the Stages tab

#### Scenario: Remembered choice
- **WHEN** the user opens a stage dialog after choosing `codex` and `gpt-5`
- **THEN** those are preselected

#### Scenario: Empty model
- **WHEN** the model is empty
- **THEN** the agent starts with no model flag
