# No harness config holds a deprecated key

Context: The owner ruled on 2026-10-26: "Never use deprecated legacy values ever." Each harness config names its JSON schema in `$schema`, and the schema marks retired keys `deprecated`. A scan found Kilo's top-level `permission`, OpenCode's `permission` and `provider`, and OpenCode's `experimental.batch_tool` and `experimental.continue_loop_on_deny`.

Decision: No tracked config holds a key its own schema marks deprecated. When the schema names a replacement the runtime accepts, the config uses the replacement. When the runtime rejects the replacement, the key is dropped and the harness runs on its default. A deprecated key is never kept because nothing better works yet.

A key a later schema scan flags is removed in the change that finds it, and a reviewer checks new config against the schema before committing.

Alternatives rejected: keeping a deprecated key until the runtime accepts its replacement (the owner refused it); a doctor check that fetches each schema on every run (doctor must not need the network).

## Consequences

- Kilo 7.8.17 and 7.8.18 reject `permissions` ("V2 permissions are not supported by OpenCode V1"), so Kilo has no permission block.
- OpenCode uses `permissions` and `providers`. Its model hiding relies on the `providers` key (see [0009](0009-model-routing.md)).
- Removing a key is a normal edit and a normal commit.
