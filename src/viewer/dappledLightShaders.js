// Screen-space reconstruction of the Microsoft AI reference (2026-09-05).
// An elliptical illumination field, sine warp and stretched Voronoi cells
// produce the dappled shape; a separate lens pass softens the cell boundaries.
// No models, environment lighting, image downloads or perspective projection.
export const SCREEN_VERTEX = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export const DAPPLED_FIELD_FRAGMENT = /* glsl */`
  varying vec2 vUv;
  uniform float uAspect;
  uniform float uTime;
  uniform vec2 uPointer;
  uniform float uRadius;
  uniform float uDensity;
  uniform float uAngle;
  uniform float uStretch;
  uniform float uScatter;
  uniform float uWave;
  uniform vec3 uBackground;
  uniform vec3 uShadow;
  uniform vec3 uLight;

  vec2 cellRandom(vec2 cell) {
    return fract(sin(vec2(dot(cell, vec2(127.1, 311.7)),
                          dot(cell, vec2(269.5, 183.3)))) * 43758.5453);
  }

  void main() {
    vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0) * uDensity;
    float c = cos(uAngle), s = sin(uAngle);
    p = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
    p.y *= 1.0 - uStretch;
    vec2 cell = floor(p), local = fract(p), winner = vec2(0.5);
    float nearest = 100.0;
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 neighbor = vec2(float(x), float(y));
        vec2 seed = cellRandom(cell + neighbor);
        vec2 site = 0.5 + 0.5 * sin(5.0 + uTime * 0.2 + 6.2831 * seed);
        vec2 delta = neighbor + site - local;
        float d = dot(delta, delta);
        if (d < nearest) { nearest = d; winner = site; }
      }
    }

    // Inverse-map the cells through the sine field into the illumination mask.
    // Clamp at each conceptual image pass, just like a finite 2D render target.
    vec2 sampleUV = clamp(vUv + (winner - 0.5) * 0.4 * uScatter, 0.0, 1.0);
    sampleUV.x += sin((sampleUV.y * 2.0 - 0.5) * 7.0 + uTime * 0.2617732) * uWave;
    sampleUV = clamp(sampleUV, 0.0, 1.0);
    float distanceToLight = length((sampleUV - uPointer) * vec2(uAspect * 0.54, 0.46));
    float shade = smoothstep(uRadius * 0.25, uRadius * 0.75, distanceToLight);
    vec3 field = mix(uBackground, uShadow, shade);
    // Collapse the three source-over field stages into one analytical pass.
    field = mix(uLight, field, shade * shade * shade);
    gl_FragColor = vec4(field, shade);
  }
`;

export const DAPPLED_BLUR_FRAGMENT = /* glsl */`
  varying vec2 vUv;
  uniform sampler2D uField;
  uniform float uAspect;
  uniform float uSoftness;
  void main() {
    vec3 sum = vec3(0.0), weights = vec3(0.0);
    float alpha = 0.0, radius = 1.0;
    vec2 pixel = vec2(1.0 / uAspect, 1.0) * 0.003 * uSoftness;
    for (int i = 0; i < 50; i++) {
      radius += 1.0 / radius;
      float angle = float(i) * 2.39996323;
      float jitter = 1.0 + 0.05 * (sin(angle * 0.1) * 0.5 + 0.5) * sin(angle * 0.7);
      vec2 offset = vec2(cos(angle), sin(angle)) * (radius - 1.0) * pixel * jitter;
      vec4 sampleColor = texture2D(uField, vUv + offset);
      vec3 weight = 5.0 + 150.0 * pow(sampleColor.rgb, vec3(9.0));
      sum += sampleColor.rgb * weight;
      weights += weight;
      alpha += sampleColor.a;
    }
    gl_FragColor = vec4(sum / weights, alpha / 50.0);
  }
`;

export const DAPPLED_OUTPUT_FRAGMENT = /* glsl */`
  varying vec2 vUv;
  uniform sampler2D uBlurred;
  uniform vec2 uBlurTexel;
  uniform float uContrast;
  uniform float uGrain;
  uniform vec3 uBackground;
  uniform vec3 uLight;

  vec3 overlay(vec3 base, vec3 paint) {
    return mix(2.0 * base * paint, 1.0 - 2.0 * (1.0 - base) * (1.0 - paint), step(0.5, base));
  }

  void main() {
    // Small reconstruction filter removes the lens sampling's serrated edges
    // when its half-resolution result is enlarged to a high-DPI canvas.
    vec4 field = texture2D(uBlurred, vUv) * 0.5;
    field += texture2D(uBlurred, vUv + uBlurTexel * vec2(1.0, 1.0)) * 0.125;
    field += texture2D(uBlurred, vUv + uBlurTexel * vec2(-1.0, 1.0)) * 0.125;
    field += texture2D(uBlurred, vUv + uBlurTexel * vec2(1.0, -1.0)) * 0.125;
    field += texture2D(uBlurred, vUv - uBlurTexel) * 0.125;
    float alpha = field.a;
    vec3 blurred = field.rgb;
    vec3 light = mix(uLight, blurred, alpha * alpha);

    // A subtle warm paper wash, generated locally instead of a remote bitmap.
    float diagonal = smoothstep(-0.5, 1.4, vUv.x * 0.85 + vUv.y * 0.35);
    float wash = sin(vUv.x * 3.8 + vUv.y * 2.4) * 0.5 + 0.5;
    vec3 paper = mix(vec3(0.91, 0.50, 0.30), vec3(0.94, 0.77, 0.52), diagonal);
    paper += (wash - 0.5) * 0.022;
    vec3 base = mix(uBackground, overlay(uBackground, paper), 0.61);
    vec3 color = base * mix(vec3(1.0), light, uContrast);
    float grain = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) - 0.5;
    // Intentionally display-referred sRGB: do not apply ACES or another gamma.
    gl_FragColor = vec4(clamp(color + grain * uGrain / 255.0, 0.0, 1.0), 1.0);
  }
`;
