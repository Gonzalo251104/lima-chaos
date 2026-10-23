import { describe, expect, it } from 'vitest';
import javierPradoData from '../../public/assets/data/levels/javier_prado.json';
import vehiclesData from '../../public/assets/data/vehicles.json';
import { LevelData, VehicleArchetype } from '../../src/simulation/graph/GraphTypes';
import { WorldSimulation } from '../../src/simulation/WorldSimulation';
import { getCongestionHeatmapColor, RoutePainter } from '../../src/ui/RoutePainter';

describe('RoutePainter Interactive Controller & Heatmap Colors', () => {
  const archetypes = vehiclesData as VehicleArchetype[];
  const combiPirata = archetypes.find((v) => v.id === 'combi_pirata')!;

  it('creates a bidirectional transit route via drag-to-connect across Bus Stops', () => {
    const sim = new WorldSimulation({
      levelData: javierPradoData as LevelData,
      seed: 42,
    });
    const painter = new RoutePainter(sim);

    // Cannot start painting on an intersection node
    expect(painter.startPaintingAtStop('trebol_jp')).toBe(false);

    // Start painting on puente_nuevo -> drag to clinica_rp -> drag to la_molina
    expect(painter.startPaintingAtStop('puente_nuevo')).toBe(true);
    expect(painter.dragOverStop('clinica_rp')).toBe(true);
    expect(painter.dragOverStop('la_molina')).toBe(true);

    const route = painter.commitPaintedRoute(true);
    expect(route).not.toBeNull();
    expect(route!.id).toBe('line_red');
    expect(route!.stopIds).toEqual([
      'puente_nuevo',
      'clinica_rp',
      'la_molina',
      'clinica_rp',
      'puente_nuevo',
    ]);
    expect(sim.getRoute('line_red')).toEqual(route);
  });

  it('assigns fleet vehicles to newly painted routes and propagates ATU evasion toggles', () => {
    const sim = new WorldSimulation({
      levelData: javierPradoData as LevelData,
    });
    const painter = new RoutePainter(sim);

    painter.startPaintingAtStop('puente_nuevo');
    painter.dragOverStop('clinica_rp');
    const redRoute = painter.commitPaintedRoute(true)!;

    const vehicle = sim.addVehicle({
      id: 'combi_test',
      archetype: combiPirata,
      route: redRoute,
    })!;

    // Paint Line 2 (Green)
    painter.setActiveLineIndex(1);
    painter.startPaintingAtStop('clinica_rp');
    painter.dragOverStop('la_molina');
    const greenRoute = painter.commitPaintedRoute(true)!;

    expect(painter.assignVehicleToRoute(vehicle.id, greenRoute.id)).toBe(true);
    expect(vehicle.getRoute().id).toBe('line_green');

    // Toggle ATU evasion on line_green
    const nextEvade = painter.toggleEvadeAtu('line_green');
    expect(vehicle.getRoute().evadeAtuCheckpoints).toBe(nextEvade);
  });

  it('interpolates congestion heatmap colors from Green (0.0) to Yellow (0.5) to Deep Red (1.0)', () => {
    expect(getCongestionHeatmapColor(0)).toBe(0x22c55e);
    expect(getCongestionHeatmapColor(0.5)).toBe(0xeab308);
    expect(getCongestionHeatmapColor(1.0)).toBe(0xdc2626);
  });
});
