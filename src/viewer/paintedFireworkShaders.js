// World-space trajectories with view-facing ribbon widths. OrbitControls can
// reveal the crown depth without turning the individual brush strokes edge-on.
export const PAINTED_VERTEX = `
attribute vec4 stroke;
attribute vec3 parentStroke;
attribute float shellIndex;
attribute vec3 ink, tipInk;
uniform vec4 shells[10];
uniform vec3 centers[10];
uniform vec2 resolution;
uniform float clockTime, sizeScale, curl, brushWidth, secondary, tailRatio, depthSpread;
varying vec2 vBrush;
varying vec3 vInk;
varying float vAlpha, vSeed;

vec2 curve(float t, float angle, float depth, float seed, float radius) {
  float travel = t * 1.36;
  float spread = travel - (.19 + curl * .48) * travel * travel;
  vec2 direction = vec2(cos(angle), sin(angle));
  vec2 p = direction * spread * radius * depth;
  p.y -= radius * (.16 + curl * .34) * travel * travel;
  p.x += sin(seed * 5.7) * radius * .065 * t * t;
  p += vec2(-direction.y, direction.x) * sin(t * 5.0 + seed * 9.0) * radius * .01 * t;
  return p;
}
void main() {
  vec4 shell = shells[int(shellIndex)];
  float age = clockTime - shell.z;
  float shortSide = min(resolution.x, resolution.y);
  float radius = shortSide * shell.w * sizeScale;
  vec2 origin = shell.xy * resolution;
  float angle = stroke.x;
  float depth = stroke.y;
  float seed = stroke.z;
  float kind = stroke.w;
  float launch = .95;
  float localAge = age - launch - seed * .16;
  float life = 3.5 + seed * .7;
  float phase = localAge / life;
  float head = 1.0 - pow(1.0 - clamp(phase / .65, 0.0, 1.0), 3.0);
  float tail = pow(clamp((phase - .14) / .86, 0.0, 1.0), 3.0);
  float opacity = (1.0 - smoothstep(.73, 1.0, phase)) * step(0.0, phase);
  opacity *= step(.01, depth);
  vec2 offset = vec2(0.0);
  float parentZ = 0.0;
  // Tip flowers reuse the outer parent trajectory, then open into small crowns.
  if (kind > 0.5 && kind < 1.5) {
    offset = curve(.96, parentStroke.x, parentStroke.y, parentStroke.z, radius);
    parentZ = sin(parentStroke.z * 31.0) * sqrt(max(0.0, 1.0-parentStroke.y*parentStroke.y)) * radius * depthSpread * .96;
    phase = (age - launch - 1.75 - parentStroke.z * .16) / 1.35;
    head = 1.0 - pow(1.0 - clamp(phase / .64, 0.0, 1.0), 3.0);
    tail = pow(clamp((phase - .14) / .86, 0.0, 1.0), 3.0);
    opacity = (1.0 - smoothstep(.72, 1.0, phase)) * step(0.0, phase) * step(seed, secondary);
    radius *= .18;
    depth = .8 + depth * .2;
  }
  float along = mix(tail, max(tail, head), uv.x);
  vec2 p = curve(along, angle, depth, seed, radius) + offset;
  vec2 tangent = curve(along + .002, angle, depth, seed, radius) - curve(along, angle, depth, seed, radius);
  float width = shortSide * .0062 * brushWidth * sizeScale * (.42 + .58 * depth);
  float taper = mix(tailRatio, 1.0, along);
  if (fract(seed * 13.0) < .3) taper = .16 + .84 * pow(max(0.0, sin(along * 3.1415926)), .8);
  width *= taper * (.92 + .08 * sin(along * 89.0 + seed * 91.0));
  if (kind > .5) width *= .45;
  if (kind > 1.5) {
    float progress = clamp(age / launch, 0.0, 1.0);
    head = 1.0 - pow(1.0 - progress, 2.0);
    tail = max(0.0, head - .26);
    along = mix(tail, head, uv.x);
    vec2 start = vec2(origin.x + sin(seed * 17.0) * shortSide * .09, -shortSide * .06);
    p = mix(start, origin, along) - origin;
    p.x += sin(along * 3.1415926) * shortSide * .045 * sin(seed * 8.0);
    tangent = vec2(origin.x - start.x, origin.y - start.y);
    width = shortSide * .003 * brushWidth * (.12 + .88 * uv.x);
    opacity = step(0.0, age) * (1.0 - smoothstep(launch, launch + .1, age));
  }
  float z = parentZ + sin(seed * 31.0) * sqrt(max(0.0,1.0-depth*depth)) * radius * depthSpread * along;
  if(kind>1.5)z=0.0;
  float worldScale = 23.4 / resolution.y;
  vec3 world = centers[int(shellIndex)] + vec3(p, z) * worldScale;
  vec4 view = modelViewMatrix * vec4(world, 1.0);
  vec3 viewTangent = mat3(modelViewMatrix) * vec3(tangent, .002 * sin(seed*31.0) * radius * depthSpread);
  vec2 normal = normalize(vec2(-viewTangent.y, viewTangent.x) + vec2(.00001));
  view.xy += normal * position.y * width * .5 * worldScale;
  gl_Position = projectionMatrix * view;
  vBrush = vec2(uv.x, position.y);
  vInk = mix(ink, tipInk, smoothstep(.2, 1.0, along));
  vAlpha = opacity * smoothstep(0.0, .18, uv.x) * (.14 + .86 * along);
  vSeed = seed;
}`;

export const PAINTED_FRAGMENT = `
precision highp float;
uniform float brilliance, grain;
varying vec2 vBrush;
varying vec3 vInk;
varying float vAlpha, vSeed;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  float edge = 1.0 - smoothstep(.66, 1.0, abs(vBrush.y));
  float paper = hash(floor(gl_FragCoord.xy * .85) + vSeed * 19.0);
  float pigment = 1.0 - grain * (.18 + .34 * paper);
  float alpha = vAlpha * edge * pigment;
  if (alpha < .002) discard;
  vec3 color = vInk * brilliance * (1.0 + .14 * (1.0 - abs(vBrush.y)));
  gl_FragColor = vec4(color, alpha);
}`;

export const SKY_VERTEX = `varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy, .999, 1.0);}`;
export const SKY_FRAGMENT = `
varying vec2 vUv;
uniform vec3 skyTop, skyBottom;
uniform float grain, skyTime;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
void main(){
  vec2 uv = vUv;
  vec3 color = mix(skyBottom, skyTop, smoothstep(0.0,1.0,uv.y));
  vec2 glow = (uv - vec2(.76,.65)) * vec2(2.2,1.6);
  float wash = exp(-dot(glow, glow)) * .55;
  wash += .16 * sin(uv.x * 7.0 + uv.y * 3.0 + skyTime * .08);
  color *= 1.0 + wash;
  color *= 1.0 + (hash(floor(gl_FragCoord.xy))-.5) * grain * .12;
  gl_FragColor=vec4(color,1.0);
}`;

export const GLITTER_VERTEX = `
attribute vec3 spark;
uniform vec4 shells[10];
uniform vec3 centers[10];
uniform vec2 resolution;
uniform float clockTime, sizeScale, pixelRatio;
varying float vAlpha, vKind;
void main(){
  vec4 shell = shells[int(spark.x)];
  float age = clockTime-shell.z-.95;
  float radius = min(resolution.x,resolution.y)*shell.w*sizeScale;
  float seed = spark.z;
  float delay = seed*.36;
  float t = max(0.0,age-delay);
  vec2 pos = shell.xy*resolution;
  float travel = (1.0-exp(-t*3.0))*radius*(.25+seed*.65);
  pos += vec2(cos(seed*81.0),sin(seed*81.0))*travel;
  pos.y -= radius*.06*t*t;
  vKind = spark.y;
  vAlpha = step(delay,age)*(1.0-smoothstep(.3,1.1,t));
  float size = (2.0+seed*3.0)*sizeScale;
  if(spark.y<.5){pos=shell.xy*resolution;size=76.0*sizeScale;vAlpha=step(0.0,age)*exp(-max(age,0.0)*12.0)*.55;}
  vec3 world=centers[int(spark.x)]+vec3(pos-shell.xy*resolution,0.0)*(23.4/resolution.y);
  vec4 view=modelViewMatrix*vec4(world,1.0);
  gl_PointSize = size*pixelRatio*29.0/max(1.0,-view.z);
  gl_Position = projectionMatrix*view;
}`;
export const GLITTER_FRAGMENT = `
varying float vAlpha, vKind;
void main(){
  vec2 p=gl_PointCoord*2.0-1.0;
  float r=length(p);
  float shape=vKind<.5?exp(-r*r*9.0):max(exp(-abs(p.x)*15.0)*exp(-abs(p.y)*2.0),exp(-abs(p.y)*15.0)*exp(-abs(p.x)*2.0));
  float alpha=shape*vAlpha*(1.0-smoothstep(.7,1.0,r));
  if(alpha<.002)discard;
  gl_FragColor=vec4(vec3(1.25,1.1,.85),alpha);
}`;
