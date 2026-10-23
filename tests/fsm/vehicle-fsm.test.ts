import { describe, expect, it } from 'vitest';
import javierPradoData from '../../public/assets/data/levels/javier_prado.json';
import vehiclesData from '../../public/assets/data/vehicles.json';
import { EventBus } from '../../src/core/EventBus';
import { EconomyManager } from '../../src/simulation/economy/EconomyManager';
import { BusStopNode } from '../../src/simulation/entities/BusStopNode';
import { Passenger } from '../../src/simulation/entities/Passenger';
import { TrafficLight } from '../../src/simulation/entities/TrafficLight';
import { VehicleAgent } from '../../src/simulation/entities/VehicleAgent';
import { VehicleSimulationContext } from '../../src/simulation/fsm/VehicleState';
import {
  LevelData,
  RouteDefinition,
  VehicleArchetype,
} from '../../src/simulation/graph/GraphTypes';
import { Pathfinder } from '../../src/simulation/graph/Pathfinder';
import { RoadGraph } from '../../src/simulation/graph/RoadGraph';

describe('VehicleAgent & Finite State Machine (FSM)', () => {
  const archetypes = vehiclesData as VehicleArchetype[];
  const combiPirata = archetypes.find((v) => v.id === 'combi_pirata')!;
  const custerChicha = archetypes.find((v) => v.id === 'custer_chicha')!;

  const defaultRoute: RouteDefinition = {
    id: 'route_jp_main',
    name: 'Puente Nuevo - La Molina',
    color: '#ef4444',
    stopIds: ['puente_nuevo', 'clinica_rp', 'la_molina', 'puente_nuevo'],
    evadeAtuCheckpoints: false,
  };

  function setupTestContext() {
    const eventBus = new EventBus();
    const graph = new RoadGraph(javierPradoData as LevelData);
    const pathfinder = new Pathfinder(graph);
    const economy = new EconomyManager(500, eventBus);
    const busStops = new Map<string, BusStopNode>();
    const trafficLights = new Map<string, TrafficLight>();
    const vehicles: VehicleAgent[] = [];

    for (const node of graph.getAllNodes()) {
      if (node.type === 'BUS_STOP') {
        busStops.set(node.id, new BusStopNode(node));
      } else if (node.type === 'INTERSECTION' && node.trafficLightCycleSec) {
        trafficLights.set(node.id, new TrafficLight(node.id, node.trafficLightCycleSec));
      }
    }

    const context: VehicleSimulationContext = {
      graph,
      pathfinder,
      busStops,
      trafficLights,
      economy,
      eventBus,
      getVehiclesOnEdge: (edgeId: string, excludeVehicleId?: string) =>
        vehicles.filter(
          (v) => v.id !== excludeVehicleId && v.getCurrentEdge()?.id === edgeId,
        ),
    };

    return { context, vehicles, busStops, trafficLights, economy, graph, eventBus };
  }

  it('transitions from CRUISING to BOARDING upon reaching a bus stop and respects passenger capacity', () => {
    const { context, vehicles, busStops, economy } = setupTestContext();

    const combi = new VehicleAgent({
      id: 'v1',
      archetype: combiPirata, // capacity: 16, boardingSecondsPerPassenger: 1.2
      route: defaultRoute,
      isPlayerOwned: true,
    });
    vehicles.push(combi);

    // Populate 20 waiting passengers at clinica_rp heading to la_molina (more than capacity 16)
    const clinicaStop = busStops.get('clinica_rp')!;
    for (let i = 0; i < 20; i++) {
      clinicaStop.enqueuePassenger(
        new Passenger({
          id: `p_${i}`,
          originStopId: 'clinica_rp',
          destinationStopId: 'la_molina',
          fareAmount: 1.5,
        }),
      );
    }

    // Start cruising from puente_nuevo -> trebol_jp (e1: 1200m) -> clinica_rp (e2_main: 1500m)
    combi.departCurrentStop(context);
    expect(combi.getStateName()).toBe('CRUISING');
    expect(combi.getCurrentEdge()?.id).toBe('e1');

    // Advance enough seconds to cross e1 and e2_main while traffic light at trebol_jp is GREEN
    for (let step = 0; step < 300; step++) {
      combi.update(1.0, context);
      if (combi.getStateName() === 'BOARDING') {
        break;
      }
    }

    expect(combi.getStateName()).toBe('BOARDING');
    expect(combi.getCurrentNodeId()).toBe('clinica_rp');

    // Tick boarding for 25 seconds (16 passengers * 1.2s = 19.2s needed to fill capacity 16)
    combi.update(25.0, context);

    expect(combi.getPassengerCount()).toBe(16);
    expect(clinicaStop.getQueueLength()).toBe(4); // 20 - 16 = 4 remaining in FIFO queue
    expect(combi.getStateName()).toBe('CRUISING'); // Departed once full!
    expect(economy.getDailyReport().passengersServed).toBe(16);
    expect(economy.getDailyReport().fareRevenue).toBeCloseTo(16 * 1.5, 2);
  });

  it('halts at the end of an edge when the intersection traffic light is RED', () => {
    const { context, trafficLights } = setupTestContext();

    const combi = new VehicleAgent({
      id: 'v_redlight',
      archetype: combiPirata,
      route: defaultRoute,
    });

    combi.departCurrentStop(context);
    const trebolLight = trafficLights.get('trebol_jp')!;
    trebolLight.setPhase('RED');

    // Advance 120 seconds (more than enough to finish 1200m on e1)
    combi.update(120, context);

    // Must still be waiting at the end of e1 because trebol_jp is RED
    expect(combi.getCurrentEdge()?.id).toBe('e1');
    expect(combi.hasReachedEndOfEdge()).toBe(true);

    // Switch light to GREEN and update 1s -> crosses intersection onto e2_main
    trebolLight.setPhase('GREEN');
    combi.update(1, context);
    expect(combi.getCurrentEdge()?.id).toBe('e2_main');
  });

  it('transitions to OVERTAKING ("Correteo") when rival vehicle shares the same edge and correteo is enabled', () => {
    const { context, vehicles } = setupTestContext();

    const playerCombi = new VehicleAgent({
      id: 'player_combi',
      archetype: combiPirata,
      route: defaultRoute,
      isPlayerOwned: true,
    });
    const rivalCombi = new VehicleAgent({
      id: 'rival_combi',
      archetype: combiPirata,
      route: defaultRoute,
      isPlayerOwned: false,
    });

    vehicles.push(playerCombi, rivalCombi);
    playerCombi.departCurrentStop(context);
    rivalCombi.departCurrentStop(context);

    playerCombi.setCorreteoEnabled(true);
    playerCombi.update(1.0, context);

    expect(playerCombi.getStateName()).toBe('OVERTAKING');

    // Update both vehicles for 10 seconds -> playerCombi in OVERTAKING (+30% boost) travels farther than rivalCombi
    playerCombi.update(10.0, context);
    rivalCombi.update(10.0, context);

    expect(playerCombi.getDistanceOnCurrentEdgeMeters()).toBeGreaterThan(
      rivalCombi.getDistanceOnCurrentEdgeMeters(),
    );
  });

  it('transitions informal combi to INSPECTED at an ATU checkpoint and deducts fine, while formal custer passes freely', () => {
    const { context, graph, economy } = setupTestContext();

    // Activate ATU checkpoint on e1
    graph.setAtuCheckpoint('e1', true);

    const informalCombi = new VehicleAgent({
      id: 'informal_1',
      archetype: combiPirata, // hasLegalPermit: false, atuFineAmount: 120
      route: defaultRoute,
      isPlayerOwned: true,
    });

    const formalCuster = new VehicleAgent({
      id: 'formal_1',
      archetype: custerChicha, // hasLegalPermit: true, atuFineAmount: 0
      route: defaultRoute,
      isPlayerOwned: true,
    });

    informalCombi.departCurrentStop(context);
    formalCuster.departCurrentStop(context);

    // Advance enough time to reach the end of e1
    informalCombi.update(120, context);
    formalCuster.update(120, context);

    expect(informalCombi.getStateName()).toBe('INSPECTED');
    expect(economy.getDailyReport().finesPaid).toBe(120);

    // Formal custer was not detained in INSPECTED state
    expect(formalCuster.getStateName()).toBe('CRUISING');
    expect(formalCuster.getCurrentEdge()?.id).toBe('e2_main');

    // After 15s inspection timer completes, informal combi resumes CRUISING onto e2_main
    informalCombi.update(15, context);
    expect(informalCombi.getStateName()).toBe('CRUISING');
    expect(informalCombi.getCurrentEdge()?.id).toBe('e2_main');
  });
});
