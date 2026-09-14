/* Original first-person weapon and gloved-hand meshes. Materials come from home.css. */
export function createArsenal(T, materials) {
  function mesh(geometry, material, parent, position = [0, 0, 0]) {
    const m = new T.Mesh(geometry, materials[material]);
    m.position.set(...position); m.userData.materialToken = material; parent.add(m); return m;
  }
  function box(parent, material, p, s) { return mesh(new T.BoxGeometry(...s), material, parent, p); }
  function oval(parent, material, p, s) { const m = mesh(new T.SphereGeometry(1, 16, 12), material, parent, p); m.scale.set(...s); return m; }
  function barrel(parent, material, p, radius, length) {
    const m = mesh(new T.CylinderGeometry(radius, radius, length, 20), material, parent, p); m.rotation.x = Math.PI / 2; return m;
  }
  function limb(parent, material, a, b, radius) {
    const start = new T.Vector3(...a), end = new T.Vector3(...b), delta = end.clone().sub(start);
    const m = mesh(new T.CapsuleGeometry(radius, Math.max(0.01, delta.length() - radius * 2), 5, 12), material, parent);
    m.position.copy(start.add(end).multiplyScalar(0.5)); m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), delta.normalize()); return m;
  }
  function hand(parent, p, support = false) {
    const g = new T.Group(); g.position.set(...p); parent.add(g);
    oval(g, 'rubber', [0, 0, 0], [0.066, 0.085, 0.048]);
    oval(g, 'cloth', [0, -0.015, 0.027], [0.06, 0.059, 0.022]);
    for (let i = 0; i < 4; i++) {
      const x = -0.045 + i * 0.03;
      limb(g, 'rubber', [x, 0.055, 0], [x, 0.077, -0.045], 0.018);
      limb(g, 'rubber', [x, 0.077, -0.045], [x, 0.026, -0.071], 0.017);
      oval(g, 'steel', [x, 0.047, 0.04], [0.011, 0.013, 0.006]);
    }
    limb(g, 'rubber', [0.059, -0.01, 0], [0.072, 0.036, -0.045], 0.025);
    limb(g, 'cloth', [0, -0.1, 0.015], [support ? -0.16 : 0.12, -0.3, 0.42], 0.069);
    barrel(g, 'rubber', [0, -0.092, 0.035], 0.071, 0.07).rotation.x = 0;
    return g;
  }
  function rifle(type) {
    const g = new T.Group(), parts = {};
    const sniper = type === 'sniper', shotgun = type === 'shotgun';
    box(g, 'gun', [0, 0, 0], [0.135, 0.16, sniper ? 0.64 : 0.48]);
    box(g, 'rubber', [0, -0.028, 0.44], [0.12, 0.19, 0.34]);
    box(g, 'gun', [0, 0.016, 0.28], [0.06, 0.085, 0.18]);
    box(g, 'rubber', [0, -0.05, 0.63], [0.145, 0.25, 0.035]);
    const pistolGrip = box(g, 'rubber', [0, -0.16, 0.09], [0.085, 0.23, 0.12]); pistolGrip.rotation.x = -0.24;
    box(g, 'steel', [0.076, 0.035, -0.04], [0.012, 0.065, 0.16]);
    for (let i = 0; i < 9; i++) box(g, 'steel', [0, 0.1, -0.27 + i * 0.055], [0.14, 0.016, 0.022]);
    const guard = mesh(new T.TorusGeometry(0.059, 0.009, 6, 18), 'gun', g, [0, -0.128, -0.07]); guard.rotation.y = Math.PI / 2;
    barrel(g, 'gun', [0, 0.025, sniper ? -0.85 : -0.7], 0.031, sniper ? 0.78 : 0.65);
    barrel(g, 'steel', [0, 0.025, sniper ? -1.27 : -1.04], 0.039, 0.13);
    barrel(g, 'rubber', [0, 0.025, sniper ? -1.34 : -1.115], 0.027, 0.008);
    if (sniper) {
      box(g, 'cloth', [0, -0.05, -0.43], [0.15, 0.12, 0.42]);
      barrel(g, 'gun', [0, 0.245, -0.02], 0.06, 0.5);
      barrel(g, 'gun', [0, 0.245, -0.31], 0.093, 0.14);
      barrel(g, 'glass', [0, 0.245, -0.386], 0.075, 0.012);
      barrel(g, 'rubber', [0, 0.245, 0.29], 0.081, 0.12);
      box(g, 'steel', [0, 0.15, -0.12], [0.07, 0.12, 0.08]);
      box(g, 'steel', [0, 0.15, 0.15], [0.07, 0.12, 0.08]);
      barrel(g, 'gun', [0, 0.327, -0.04], 0.048, 0.055).rotation.x = 0;
      const bolt = new T.Group(); g.add(bolt); bolt.position.set(0.1, 0.03, 0.13);
      limb(bolt, 'steel', [0, 0, 0], [0.09, -0.065, 0], 0.017);
      oval(bolt, 'gun', [0.1, -0.075, 0], [0.032, 0.032, 0.032]); parts.bolt = bolt;
      parts.magazine = box(g, 'gun', [0, -0.16, -0.16], [0.095, 0.18, 0.17]);
    } else if (shotgun) {
      barrel(g, 'gun', [0, -0.057, -0.65], 0.036, 0.65);
      const pump = new T.Group(); g.add(pump); pump.position.z = -0.46;
      barrel(pump, 'rubber', [0, -0.05, 0], 0.075, 0.28);
      for (let i = 0; i < 7; i++) barrel(pump, 'steel', [0, -0.05, -0.12 + i * 0.04], 0.078, 0.012);
      parts.pump = pump;
      for (let i = 0; i < 4; i++) { barrel(g, 'enemy', [-0.084, -0.012, -0.12 + i * 0.05], 0.017, 0.1).rotation.x = 0; }
    } else {
      box(g, 'gun', [0, -0.01, -0.47], [0.13, 0.14, 0.36]);
      for (let i = 0; i < 6; i++) {
        box(g, 'rubber', [0.068, 0.01, -0.6 + i * 0.047], [0.008, 0.045, 0.027]);
        box(g, 'steel', [0, 0.084, -0.6 + i * 0.047], [0.145, 0.018, 0.014]);
      }
      parts.magazine = box(g, 'gun', [0, -0.21, -0.16], [0.095, 0.3, 0.16]); parts.magazine.rotation.x = -0.15;
      for (let i = 0; i < 3; i++) box(g, 'steel', [0.049, -0.18, -0.21 + i * 0.047], [0.005, 0.18, 0.009]);
      box(g, 'gun', [0, 0.16, -0.71], [0.025, 0.16, 0.035]);
      box(g, 'gun', [0, 0.14, 0.11], [0.09, 0.08, 0.04]);
      box(g, 'glass', [0, 0.16, 0.133], [0.045, 0.032, 0.008]);
    }
    parts.rightHand = hand(g, [0.044, -0.15, 0.13]);
    parts.leftHand = hand(g, [-0.01, -0.12, -0.48], true); parts.leftHand.rotation.z = Math.PI / 2;
    g.userData.parts = parts; g.userData.muzzleZ = sniper ? -1.37 : -1.14; return g;
  }
  function pistol() {
    const g = new T.Group();
    box(g, 'gun', [0, 0, -0.13], [0.105, 0.13, 0.38]);
    const slide = box(g, 'steel', [0, 0.055, -0.14], [0.108, 0.1, 0.39]);
    box(g, 'rubber', [0, -0.15, 0.015], [0.09, 0.24, 0.125]).rotation.x = -0.2;
    barrel(g, 'rubber', [0, 0.062, -0.344], 0.03, 0.015);
    box(g, 'gun', [0, 0.12, -0.28], [0.025, 0.04, 0.03]);
    box(g, 'gun', [0, 0.12, 0.02], [0.08, 0.04, 0.035]);
    for (let i = 0; i < 5; i++) box(g, 'rubber', [0.056, 0.05, -0.05 + i * 0.022], [0.006, 0.07, 0.009]);
    const rightHand = hand(g, [0.035, -0.13, 0.035]);
    const leftHand = hand(g, [-0.068, -0.16, -0.015], true); leftHand.rotation.z = -0.4;
    g.userData.parts = { slide, rightHand, leftHand }; g.userData.muzzleZ = -0.36; return g;
  }
  function knife() {
    const g = new T.Group();
    barrel(g, 'rubber', [0, -0.035, 0.08], 0.048, 0.22);
    for (let i = 0; i < 6; i++) barrel(g, 'gun', [0, -0.035, i * 0.032], 0.051, 0.01);
    box(g, 'steel', [0, -0.035, -0.035], [0.18, 0.025, 0.026]);
    const shape = new T.Shape(); shape.moveTo(-0.045, 0); shape.lineTo(0.045, 0); shape.lineTo(0.042, 0.3); shape.lineTo(0, 0.44); shape.lineTo(-0.045, 0.31); shape.closePath();
    const blade = mesh(new T.ExtrudeGeometry(shape, { depth: 0.008, bevelEnabled: true, bevelSize: 0.003, bevelThickness: 0.002, bevelSegments: 2, steps: 1 }), 'steel', g, [0, -0.03, -0.05]); blade.rotation.x = -Math.PI / 2;
    const rightHand = hand(g, [0.035, -0.08, 0.1]); g.userData.parts = { rightHand }; return g;
  }
  function grenade() {
    const g = new T.Group(); oval(g, 'cloth', [0, 0, 0], [0.068, 0.087, 0.068]);
    for (let i = 0; i < 4; i++) { const ring = mesh(new T.TorusGeometry(0.067, 0.004, 4, 16), 'rubber', g, [0, -0.05 + i * 0.033, 0]); ring.rotation.x = Math.PI / 2; }
    barrel(g, 'steel', [0, 0.085, 0], 0.024, 0.04).rotation.x = 0;
    box(g, 'steel', [0.052, 0.028, 0], [0.016, 0.17, 0.032]).rotation.z = 0.23;
    const pin = mesh(new T.TorusGeometry(0.029, 0.004, 5, 18), 'steel', g, [-0.036, 0.097, 0]); pin.rotation.y = Math.PI / 2;
    g.userData.parts = { rightHand: hand(g, [0.02, -0.09, 0.025]) }; return g;
  }
  const models = { rifle: rifle('rifle'), sniper: rifle('sniper'), shotgun: rifle('shotgun'), pistol: pistol(), knife: knife(), grenade: grenade() };
  Object.values(models).forEach(g => {
    g.traverse(o => { if (o.isMesh) { o.renderOrder = 10; o.castShadow = false; o.receiveShadow = false; o.material = o.material.clone(); o.material.depthTest = false; } });
  });
  return models;
}
