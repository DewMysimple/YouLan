import * as THREE from 'three';

// Codrops' scroll-driven sinusoidal path, sampled into a reusable ribbon.
// Fixed buffers avoid rebuilding/discarding a TubeGeometry on every input frame.
export function createGalleryTrail(scene) {
  const segments = 128;
  const positions = new Float32Array((segments + 1) * 6);
  const uv = new Float32Array((segments + 1) * 4);
  const indices = [];
  for (let i = 0; i <= segments; i++) {
    uv.set([i / segments, 0, i / segments, 1], i * 4);
    if (i < segments) { const k = i * 2; indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: false, toneMapped: false, side: THREE.DoubleSide,
    uniforms: { opacity: { value: .5 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: 'varying vec2 vUv; uniform float opacity; void main(){ float edge=1.-smoothstep(.25,1.,abs(vUv.y*2.-1.)); gl_FragColor=vec4(.965,.98,1.,opacity*edge*smoothstep(0.,.3,vUv.x)); }',
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = '纵深花廊·空间光带'; mesh.frustumCulled = false; mesh.renderOrder = 20;
  scene.add(mesh);
  const particleGeometry = new THREE.BufferGeometry();
  particleGeometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(24 * 3), 3));
  particleGeometry.setAttribute('aSeed', new THREE.Float32BufferAttribute(Array.from({ length: 24 }, (_, i) => (i + .5) / 24), 1));
  const particleMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: false, toneMapped: false,
    uniforms: { time: { value: 0 }, head: { value: new THREE.Vector3() }, opacity: { value: 0 }, pixelRatio: { value: 1 } },
    vertexShader: `attribute float aSeed; uniform float time; uniform vec3 head; uniform float pixelRatio; varying float alpha;
      void main(){ float life=fract(time*.38+aSeed); float angle=aSeed*157.;
        vec3 p=head+vec3(cos(angle),sin(angle),sin(angle*2.))*.34*life;
        alpha=(1.-life)*.7; gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);
        gl_PointSize=(1.5+2.*aSeed)*pixelRatio; }`,
    fragmentShader: 'uniform float opacity; varying float alpha; void main(){ float a=1.-smoothstep(.1,.5,length(gl_PointCoord-.5)); gl_FragColor=vec4(1.,1.,1.,a*alpha*opacity); }',
  });
  const particles = new THREE.Points(particleGeometry, particleMaterial);
  particles.name = '纵深花廊·光带微粒'; particles.frustumCulled = false; particles.renderOrder = 21;
  scene.add(particles);
  const point = new THREE.Vector3(), previous = new THREE.Vector3(), tangent = new THREE.Vector3();
  let last = 0, direction = 1, turn = 0;
  function path(t, gap, narrow, target) {
    const depth = -.1 + t * 1.1;
    return target.set((-.96 + Math.sin(t * Math.PI * 2 * 1.85) * 3) * (narrow ? .35 : .85),
      -1.05 + Math.sin(t * Math.PI * 2 * 2.1) * .78,
      gap - t * gap * 4 + 1.65 - (4.78 + depth * 6.52));
  }
  return {
    update(progress, time, parameters, narrow, reduced, pixelRatio) {
      const nextDirection = Math.abs(progress - last) > .00001 ? Math.sign(progress - last) : direction;
      if (nextDirection !== direction) { turn = progress; direction = nextDirection; }
      last = progress;
      const length = Math.min(.2, Math.abs(progress - turn) + .006);
      for (let i = 0; i <= segments; i++) {
        const t = Math.max(0, Math.min(1, progress - direction * length * (1 - i / segments)));
        path(t, parameters.gap, narrow, point);
        path(t + .0001, parameters.gap, narrow, previous);
        tangent.subVectors(previous, point);
        const normalLength = Math.hypot(tangent.x, tangent.y) || 1;
        const radius = parameters.trailWidth * (.15 + .85 * i / segments);
        const dx = -tangent.y / normalLength * radius, dy = tangent.x / normalLength * radius;
        positions.set([point.x + dx, point.y + dy, point.z, point.x - dx, point.y - dy, point.z], i * 6);
      }
      geometry.attributes.position.needsUpdate = true;
      const opacity = parameters.trailOpacity * (1 - THREE.MathUtils.smoothstep(progress, .94, 1));
      material.uniforms.opacity.value = opacity;
      mesh.visible = parameters.trail;
      particles.visible = parameters.trail && parameters.sparkles && !reduced;
      particleMaterial.uniforms.head.value.copy(point);
      particleMaterial.uniforms.time.value = time;
      particleMaterial.uniforms.opacity.value = opacity;
      particleMaterial.uniforms.pixelRatio.value = pixelRatio;
    },
    reset() { last = 0; direction = 1; turn = 0; },
    dispose() { scene.remove(mesh, particles); geometry.dispose(); material.dispose(); particleGeometry.dispose(); particleMaterial.dispose(); },
  };
}
