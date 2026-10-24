import { createMap, ops, applyOp } from './core/ops.js';

/** A small starter map so the board isn't empty on first open. */
export function seedMap() {
  const map = createMap({ name: 'Example STEM ecosystem' });
  const layerId = map.layers[0].id;
  const add = (label, category, x, y) => {
    const op = ops.addActor({ label, category, x, y, layerId });
    applyOp(map, op);
    return op.id;
  };

  const funders = add('Federal funders', 'resource', 420, 170);
  const policy = add('Provincial ministries', 'problem', 760, 200);
  const network = add('University & college partners', 'ally', 420, 510);
  const teachers = add('Teachers & parents', 'other', 780, 480);
  const instructors = add('STEM instructors', 'ally', 420, 850);
  const youth = add('Youth participants', 'other', 780, 850);

  const connect = (from, to, type, label = '') =>
    applyOp(map, ops.addConnector({ from: { actorId: from }, to: { actorId: to }, type, label, layerId }));

  connect(funders, network, 'resource-flow', 'funding');
  connect(network, instructors, 'relationship', 'hires & trains');
  connect(instructors, youth, 'relationship', 'programs');
  connect(youth, teachers, 'feedback', 'experience');
  connect(teachers, policy, 'learning', 'evidence');
  connect(network, funders, 'feedback', 'impact data');
  return map;
}
