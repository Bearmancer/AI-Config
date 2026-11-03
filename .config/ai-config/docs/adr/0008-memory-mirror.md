# Memory mirror: omo owns the push, the home repo owns nothing of it

Context: omo keeps its memory in a local git repository and pushes it to a private GitHub repository, Bearmancer/omo-memory. The home repo and omo must not both try to manage it.

Decision: Omo alone clones, pushes and configures its memory repository. The URL lives in the memory repository's own local git config (`omo.memoryRepository.url`), where omo reads it. The home repo tracks the `memory` block of `~/.omo/omo.jsonc` as ordinary config and nothing else about memory: no restore step, no state read, no cell for it. The setup script does not touch it.

Alternatives rejected: a global git config key (omo never reads it); the home repo pushing (the memory repository is omo's own git, not the home repo's to copy); a doctor cell for the mirror (omo alone knows when a push is due).

## Consequences

- An existing memory repository is never cloned over, reset or touched by anything in this repo.
- The mirror URL is non-secret, so naming it in a doc cannot leak anything.
