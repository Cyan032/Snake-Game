/* Arcadia – 3D-Hintergrund: Flug über ein Neon-Gitter zwischen Wireframe-Bergen, Retro-Sonne und Sternen. */
(() => {
  'use strict';
  const canvas = document.getElementById('scene');
  if (!canvas || !window.THREE) return;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  } catch (e) {
    return; // ohne WebGL bleibt der Farbverlauf als Hintergrund
  }
  const BG = 0x150834;
  renderer.setClearColor(BG);
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(BG, 30, 110);
  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 300);
  camera.position.set(0, 2.4, 8);

  // Boden: Gitter + Berge in einem Shader, die Bewegung läuft komplett auf der Grafikkarte
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(160, 220, 160, 220),
    new THREE.ShaderMaterial({
      extensions: { derivatives: true },
      uniforms: { uTime: { value: 0 }, uFogColor: { value: new THREE.Color(BG) } },
      vertexShader: `
        uniform float uTime;
        varying vec2 vPos;
        varying float vH;
        varying float vDepth;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
        }
        void main() {
          // Vorwärtsflug: Die Landschaft rückt in ganzen Gitterschritten weiter (feste Berghöhen)
          // und gleitet dazwischen weich – so zittern die Gipfel nicht.
          float s = uTime * 6.0, si = floor(s);
          vec3 p = position;                       // Ebene liegt in x/y, wird unten flach gedreht
          p.y -= s - si;
          float z = position.y + si;
          float side = smoothstep(7.0, 26.0, abs(p.x));
          float h = (noise(vec2(p.x * 0.12, z * 0.12)) * 0.7 + noise(vec2(p.x * 0.35, z * 0.35)) * 0.3);
          p.z = h * side * 22.0;
          vPos = vec2(p.x, z);
          vH = side * h;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vDepth = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform vec3 uFogColor;
        varying vec2 vPos;
        varying float vH;
        varying float vDepth;
        // Linien in Bildschirm-Pixeln: immer scharf, egal wie nah oder steil
        float gridLine(float v) {
          float d = (0.5 - abs(fract(v) - 0.5)) / max(fwidth(v), 1e-4);
          return 1.0 - smoothstep(0.6, 1.6, d);
        }
        void main() {
          float g = max(gridLine(vPos.x / 2.0), gridLine(vPos.y / 2.0));
          vec3 base = mix(vec3(0.05, 0.01, 0.12), vec3(0.12, 0.03, 0.22), vH);
          vec3 line = mix(vec3(1.0, 0.24, 0.65), vec3(0.16, 0.94, 1.0), smoothstep(0.15, 0.6, vH));
          vec3 col = mix(base, line, g);
          float fog = smoothstep(30.0, 110.0, vDepth);
          gl_FragColor = vec4(mix(col, uFogColor, fog), 1.0);
        }`,
    })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.z = -95;
  scene.add(ground);

  // Retro-Sonne mit Streifen und Leuchten
  const sunMat = new THREE.ShaderMaterial({
    transparent: true,
    fog: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform float uTime;
      varying vec2 vUv;
      void main() {
        vec2 c = vUv - 0.5;
        float d = length(c);
        if (d > 0.5) discard;
        vec3 col = mix(vec3(1.0, 0.24, 0.65), vec3(1.0, 0.85, 0.25), smoothstep(0.0, 1.0, vUv.y));
        float y = vUv.y;
        float band = step(0.5, fract(y * 18.0 + uTime * 0.4));
        float cut = y < 0.48 ? band * smoothstep(0.48, 0.05, y) : 0.0;
        if (cut > 0.5) discard;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const sun = new THREE.Mesh(new THREE.PlaneGeometry(46, 46), sunMat);
  sun.position.set(0, 13, -150);
  scene.add(sun);
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(110, 110),
    new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'varying vec2 vUv; void main() { float d = length(vUv - 0.5); float a = smoothstep(0.5, 0.0, d) * 0.55; gl_FragColor = vec4(1.0, 0.25, 0.6, a * a); }',
    })
  );
  glow.position.set(0, 13, -152);
  scene.add(glow);

  // Sterne
  const starCount = 1400, starPos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const a = Math.random() * Math.PI * 2, r = 120 + Math.random() * 60;
    starPos[i * 3] = Math.cos(a) * r;
    starPos[i * 3 + 1] = 8 + Math.random() * 110;
    starPos[i * 3 + 2] = -Math.abs(Math.sin(a) * r) - 20;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85 }));
  scene.add(stars);

  // Kamera folgt leicht der Maus (nicht der Geräteneigung, das wackelt)
  let tx = 0, ty = 0;
  addEventListener('pointermove', (e) => { tx = e.clientX / innerWidth - 0.5; ty = e.clientY / innerHeight - 0.5; });

  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w / h < 0.8 ? 75 : 62;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  const clock = new THREE.Clock();
  function frame() {
    const t = clock.getElapsedTime();
    ground.material.uniforms.uTime.value = t;
    sunMat.uniforms.uTime.value = t;
    stars.material.opacity = 0.7 + Math.sin(t * 1.7) * 0.15;
    camera.position.x += (tx * 3 - camera.position.x) * 0.05;
    camera.position.y += (2.4 - ty * 1.2 - camera.position.y) * 0.05;
    camera.lookAt(camera.position.x * 0.3, 3.2, -40);
    renderer.render(scene, camera);
    if (!still) requestAnimationFrame(frame);
  }
  frame();
})();
