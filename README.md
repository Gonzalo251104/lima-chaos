# LimaCaos: Combi Tycoon (`lima-chaos`)

A 2D top-down real-time urban transit strategy and arcade simulation game set in Lima, Peru. Players manage an informal-to-formal transit fleet (Combis, Cústers, Corredores) across iconic congested avenues, competing against rival AI lines, adjusting routes around traffic jams and ATU checkpoints, and balancing daily cashflow before passenger patience runs out.

## Architecture

The codebase enforces strict separation between the **Pure TypeScript Simulation Core** (`src/simulation/`) and the **Phaser 3 Presentation Layer** (`src/scenes/`, `src/ui/`):

- **Simulation Core (`src/simulation/`)**: Zero Phaser dependencies. Implements the directed road graph, dynamic $A^*$ pathfinder with BPR quadratic congestion curves and ATU checkpoint evasion penalties, passenger demand queues, economy manager, and vehicle Finite State Machines (`Cruising`, `Boarding`, `Overtaking`, `Inspected`).
- **Core Utilities (`src/core/`)**: Seeded deterministic PRNG (`Random`), strictly typed `EventBus`, and `GameClock` with Lima rush-hour multipliers.
- **Presentation Layer (`src/scenes/`, `src/ui/`)**: Phaser 3 WebGL scenes and interactive route editor communicating via `EventBus`.

## Getting Started

```bash
npm install
npm run test
npm run dev
```
