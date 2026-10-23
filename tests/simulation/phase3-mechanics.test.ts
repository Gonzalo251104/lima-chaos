import { describe, expect, it } from 'vitest';
import javierPradoData from '../../public/assets/data/levels/javier_prado.json';
import vehiclesData from '../../public/assets/data/vehicles.json';
import {
  LevelData,
  RouteDefinition,
  VehicleArchetype,
} from '../../src/simulation/graph/GraphTypes';
import { WorldSimulation } from '../../src/simulation/WorldSimulation';

describe('Phase 3: Rival AI, Dynamic ATU Checkpoints, Fleet Shop & Cobrador Upgrades', () => {
  const archetypes = vehiclesData as VehicleArchetype[];
  const combiPirata = archetypes.find((v) => v.id === 'combi_pirata')!;

  const playerRoute: RouteDefinition = {
    id: 'line_red',
    name: 'Línea 1: Expreso Rojo',
    color: '#ef4444',
    stopIds: ['puente_nuevo', 'clinica_rp', 'la_molina', 'clinica_rp', 'puente_nuevo'],
    evadeAtuCheckpoints: true,
  };

  it('spawns Rival AI Combis on the highest-demand stops and enables fleet-wide Correteo', () => {
    const sim = new WorldSimulation({
      levelData: javierPradoData as LevelData,
      seed: 101,
    });
    sim.registerRoute(playerRoute);

    const playerCombi = sim.purchasePlayerVehicle(combiPirata, 'line_red')!;
    expect(playerCombi).not.toBeNull();
    expect(sim.economy.getCash()).toBe(500 - 250);

    const rival = sim.spawnRivalCombi(combiPirata, 'rival_alpha')!;
    expect(rival).not.toBeNull();
    expect(rival.isPlayerOwned).toBe(false);
    expect(rival.isCorreteoEnabled()).toBe(true);
    expect(sim.getRivalVehicles().length).toBe(1);

    sim.setFleetCorreteo(true);
    expect(playerCombi.isCorreteoEnabled()).toBe(true);
  });

  it('hires the "Garganta de Lata" Cobrador upgrade and reduces boarding time by 40%', () => {
    const sim = new WorldSimulation({
      levelData: javierPradoData as LevelData,
      seed: 202,
    });
    sim.registerRoute(playerRoute);

    const v = sim.addVehicle({
      id: 'combi_up',
      archetype: combiPirata, // boardingSecondsPerPassenger = 1.2
      route: playerRoute,
      isPlayerOwned: true,
    })!;

    expect(v.getEffectiveBoardingSecondsPerPassenger()).toBeCloseTo(1.2, 4);

    const upgraded = sim.hireCobradorUpgrade(v.id);
    expect(upgraded).toBe(true);
    expect(v.hasCobrador()).toBe(true);
    expect(sim.economy.getCash()).toBe(500 - WorldSimulation.COBRADOR_UPGRADE_COST);
    // 1.2 * 0.6 = 0.72 seconds per passenger (-40% boarding time!)
    expect(v.getEffectiveBoardingSecondsPerPassenger()).toBeCloseTo(0.72, 4);

    // Cannot purchase the same upgrade twice on the same vehicle
    expect(sim.hireCobradorUpgrade(v.id)).toBe(false);
  });

  it('dynamically spawns and clears 3-hour ATU checkpoints on main avenues when enabled', () => {
    const sim = new WorldSimulation({
      levelData: javierPradoData as LevelData,
      seed: 303,
      enableDynamicAtuCheckpoints: true,
    });

    const spawnedCheckpoints: string[] = [];
    const clearedCheckpoints: string[] = [];

    sim.eventBus.on('atu:checkpoint-spawned', ({ edgeId, durationMinutes }) => {
      spawnedCheckpoints.push(edgeId);
      expect(durationMinutes).toBe(180);
      const edge = sim.graph.getEdge(edgeId)!;
      expect(edge.isAuxiliary).toBe(false);
    });

    sim.eventBus.on('atu:checkpoint-cleared', ({ edgeId }) => {
      clearedCheckpoints.push(edgeId);
    });

    // Advance 600 in-game minutes (10 hours)
    for (let m = 0; m < 600; m++) {
      sim.tick(1000);
    }

    expect(spawnedCheckpoints.length).toBeGreaterThanOrEqual(2);
    expect(clearedCheckpoints.length).toBeGreaterThanOrEqual(1);
  });
});
