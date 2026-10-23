import { describe, expect, it } from 'vitest';
import javierPradoData from '../../public/assets/data/levels/javier_prado.json';
import vehiclesData from '../../public/assets/data/vehicles.json';
import { GameClock } from '../../src/core/GameClock';
import {
  LevelData,
  RouteDefinition,
  VehicleArchetype,
} from '../../src/simulation/graph/GraphTypes';
import { WorldSimulation } from '../../src/simulation/WorldSimulation';

describe('WorldSimulation Headless 18-Hour Day', () => {
  const archetypes = vehiclesData as VehicleArchetype[];
  const combiPirata = archetypes.find((v) => v.id === 'combi_pirata')!;
  const custerChicha = archetypes.find((v) => v.id === 'custer_chicha')!;

  const mainRoute: RouteDefinition = {
    id: 'route_javier_prado_full',
    name: 'Puente Nuevo <-> La Molina',
    color: '#10b981',
    stopIds: ['puente_nuevo', 'clinica_rp', 'la_molina', 'clinica_rp', 'puente_nuevo'],
    evadeAtuCheckpoints: true,
  };

  it('simulates a full 18-hour Lima day (05:00 - 23:00) in <50ms with positive net profit', () => {
    const sim = new WorldSimulation({
      levelData: javierPradoData as LevelData,
      seed: 2026,
      gameMinutesPerRealSecond: 1.0,
    });

    // Deploy 2 Combis and 1 Custer on the Javier Prado corridor
    sim.addVehicle({
      id: 'combi_1',
      archetype: combiPirata,
      route: mainRoute,
      isPlayerOwned: true,
      purchaseVehicle: false,
    });
    sim.addVehicle({
      id: 'combi_2',
      archetype: combiPirata,
      route: mainRoute,
      isPlayerOwned: true,
      purchaseVehicle: false,
    });
    sim.addVehicle({
      id: 'custer_1',
      archetype: custerChicha,
      route: mainRoute,
      isPlayerOwned: true,
      purchaseVehicle: false,
    });

    const startTimeMs = performance.now();

    // 18 hours = 1080 minutes = 1080 ticks of 1000ms each
    for (let minute = 0; minute < 1080; minute++) {
      if (minute === 60) {
        // Spawn an ATU checkpoint on e2_main at 06:00 AM (before vehicles reach Trébol intersection) for 3 hours (180 mins)
        sim.spawnAtuCheckpoint('e2_main', 180);
      }
      sim.tick(1000);
    }

    const elapsedMs = performance.now() - startTimeMs;

    expect(sim.clock.isDayOver()).toBe(true);
    expect(sim.clock.getFormattedTime()).toBe('23:00');
    expect(elapsedMs).toBeLessThan(50);

    const report = sim.getDailyReport();
    expect(report.passengersServed).toBeGreaterThan(100);
    expect(report.fareRevenue).toBeGreaterThan(150);
    expect(report.fuelExpenses).toBeGreaterThan(0);
    expect(report.netOperatingProfit).toBeGreaterThan(100);
    // Because evadeAtuCheckpoints is true, informal combis rerouted onto e2_aux and paid 0 fines!
    expect(report.finesPaid).toBe(0);
  });

  it('produces 100% identical daily financial results when run twice with the same PRNG seed', () => {
    const runSeededDay = (seed: number) => {
      const sim = new WorldSimulation({
        levelData: javierPradoData as LevelData,
        seed,
      });
      sim.addVehicle({
        id: 'combi_det',
        archetype: combiPirata,
        route: mainRoute,
        isPlayerOwned: true,
      });
      for (let i = 0; i < 1080; i++) {
        sim.tick(1000);
      }
      return sim.getDailyReport();
    };

    const runA = runSeededDay(99999);
    const runB = runSeededDay(99999);

    expect(runA).toEqual(runB);
  });

  it('applies Rush Hour multipliers during 07:00-09:00 and 17:30-20:00', () => {
    const clock = new GameClock(1.0);
    expect(clock.getFormattedTime()).toBe('05:00');
    expect(clock.isRushHour()).toBe(false);
    expect(clock.getDemandMultiplier()).toBe(1.0);

    clock.setCurrentMinutes(7 * 60 + 30); // 07:30
    expect(clock.isRushHour()).toBe(true);
    expect(clock.getDemandMultiplier()).toBe(GameClock.RUSH_HOUR_MULTIPLIER);

    clock.setCurrentMinutes(12 * 60); // 12:00
    expect(clock.isRushHour()).toBe(false);

    clock.setCurrentMinutes(18 * 60); // 18:00
    expect(clock.isRushHour()).toBe(true);
    expect(clock.getDemandMultiplier()).toBe(GameClock.RUSH_HOUR_MULTIPLIER);
  });
});
