import { describe, expect, it } from 'vitest';
import javierPradoData from '../../public/assets/data/levels/javier_prado.json';
import { LevelData } from '../../src/simulation/graph/GraphTypes';
import { Pathfinder } from '../../src/simulation/graph/Pathfinder';
import { RoadGraph } from '../../src/simulation/graph/RoadGraph';

describe('RoadGraph & Dynamic A* Pathfinder', () => {
  const createGraph = () => new RoadGraph(javierPradoData as LevelData);

  it('selects the faster main avenue (e2_main) when roads are uncongested', () => {
    const graph = createGraph();
    const pathfinder = new Pathfinder(graph);

    const path = pathfinder.findShortestPath('puente_nuevo', 'clinica_rp', {
      speedMultiplier: 1.0,
      hasLegalPermit: false,
      evadeAtuCheckpoints: true,
    });

    expect(path).not.toBeNull();
    expect(path!.nodes).toEqual(['puente_nuevo', 'trebol_jp', 'clinica_rp']);
    expect(path!.edges.map((e) => e.id)).toEqual(['e1', 'e2_main']);
    // Cost of e1: 1200 / 45 = 26.666... + Cost of e2_main: 1500 / 50 = 30 => ~56.67
    expect(path!.totalCost).toBeCloseTo(1200 / 45 + 1500 / 50, 4);
  });

  it('reroutes onto the auxiliary road (e2_aux) when main avenue (e2_main) congestion spikes', () => {
    const graph = createGraph();
    const pathfinder = new Pathfinder(graph);

    // Put 8 vehicles on e2_main (capacity 10) -> ratio = 0.8 -> BPR = 1 + 2.5 * 0.64 = 2.6
    // Cost of e2_main becomes 30 * 2.6 = 78, whereas e2_aux is 1750 / 35 = 50
    graph.setVehicleCountOnEdge('e2_main', 8);

    const path = pathfinder.findShortestPath('trebol_jp', 'clinica_rp', {
      speedMultiplier: 1.0,
      hasLegalPermit: true,
      evadeAtuCheckpoints: false,
    });

    expect(path).not.toBeNull();
    expect(path!.edges.map((e) => e.id)).toEqual(['e2_aux']);
    expect(path!.totalCost).toBeCloseTo(1750 / 35, 4);
  });

  it('reroutes an informal combi onto e2_aux when an ATU checkpoint is active on e2_main and evasion is enabled', () => {
    const graph = createGraph();
    const pathfinder = new Pathfinder(graph);

    graph.setAtuCheckpoint('e2_main', true);

    const informalEvadingPath = pathfinder.findShortestPath('trebol_jp', 'clinica_rp', {
      speedMultiplier: 1.25,
      hasLegalPermit: false,
      evadeAtuCheckpoints: true,
    });

    expect(informalEvadingPath).not.toBeNull();
    expect(informalEvadingPath!.edges.map((e) => e.id)).toEqual(['e2_aux']);
  });

  it('keeps a formal vehicle on e2_main even when an ATU checkpoint is active', () => {
    const graph = createGraph();
    const pathfinder = new Pathfinder(graph);

    graph.setAtuCheckpoint('e2_main', true);

    const formalPath = pathfinder.findShortestPath('trebol_jp', 'clinica_rp', {
      speedMultiplier: 1.1,
      hasLegalPermit: true,
      evadeAtuCheckpoints: true,
    });

    expect(formalPath).not.toBeNull();
    expect(formalPath!.edges.map((e) => e.id)).toEqual(['e2_main']);
  });

  it('keeps an informal vehicle on e2_main if evadeAtuCheckpoints doctrine is disabled', () => {
    const graph = createGraph();
    const pathfinder = new Pathfinder(graph);

    graph.setAtuCheckpoint('e2_main', true);

    const recklessInformalPath = pathfinder.findShortestPath('trebol_jp', 'clinica_rp', {
      speedMultiplier: 1.25,
      hasLegalPermit: false,
      evadeAtuCheckpoints: false,
    });

    expect(recklessInformalPath).not.toBeNull();
    expect(recklessInformalPath!.edges.map((e) => e.id)).toEqual(['e2_main']);
  });

  it('computes a multi-stop round-trip route across Javier Prado', () => {
    const graph = createGraph();
    const pathfinder = new Pathfinder(graph);

    const multiStop = pathfinder.findMultiStopPath(
      ['puente_nuevo', 'clinica_rp', 'la_molina', 'puente_nuevo'],
      {
        speedMultiplier: 1.0,
        hasLegalPermit: true,
        evadeAtuCheckpoints: false,
      },
    );

    expect(multiStop).not.toBeNull();
    expect(multiStop!.edges.map((e) => e.id)).toEqual([
      'e1',
      'e2_main',
      'e3_main',
      'e3_return',
      'e2_return',
      'e1_return',
    ]);
    expect(multiStop!.totalDistanceMeters).toBe(9000);
  });
});
