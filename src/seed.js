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

  // Placed to read sensibly in both the rings and the triangle lens.
  const funders = add('Federal funders', 'resource', -230, -530);
  const policy = add('Provincial ministries', 'problem', 230, -530);
  const network = add('University & college partners', 'ally', -250, -250);
  const teachers = add('Teachers & parents', 'other', 250, -250);
  const instructors = add('STEM instructors', 'ally', -110, 60);
  const youth = add('Youth participants', 'other', 110, 150);

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
