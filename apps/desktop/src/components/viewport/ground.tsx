// The ground under the model, ruled into squares, and the world's three axes through the
// middle of it. They are the world's and not the model's: a cut leaves them whole, and a
// model pulled apart leaves them where they are.
//
// The squares are a power of ten millimetres across - one, ten, a hundred, and on either
// way - whichever keeps their lines a comfortable distance apart on the screen, with
// every tenth line heavier. That is settled for each point of the ground by itself, from
// how large a millimetre is drawn there: the ground near the eye is ruled finer than the
// ground far off, and no line is ever too near the next to be told from it. Lines come
// and go by degrees as the view is zoomed, so the squares are never very small on the
// screen nor very large, however near the view is or far.
//
// Ground and axes go on for ever. So neither is a thing put in the scene, which would
// have an edge somewhere, and be cut off where the camera stops drawing. They are worked
// out for each pixel of the view instead: which place on the ground is seen there, or how
// near an axis passes, and how far off that is, for the model to hide what is behind it.
// All that takes them away is being seen along themselves: the ground towards the
// horizon, and an axis towards the point it runs away to.
import * as React from "react"
import * as THREE from "three"
import { useThree } from "@react-three/fiber"

import type { ThemeColors } from "@/lib/css-color"

/** The nearest that two lines are drawn to each other, in pixels. */
const GAP = 8
/** How strongly the lines are drawn: the ordinary ones, and every tenth. */
const INK = { fine: 0.1, tenth: 0.24 }
/** The axes: how wide in pixels, and how strong. */
const AXIS = { width: 1.5, strength: 0.9 }
/**
 * How squarely each has to be seen, from 0 along itself to 1 square on: to be drawn at
 * all, and to be drawn in full.
 */
const SQUARE = {
  ground: { none: 0.01, full: 0.12 },
  axis: { none: 0.02, full: 0.15 },
}
const NOT_PICKED = () => {}

/** One triangle that covers the screen, whichever way the camera looks. */
const SCREEN = new THREE.BufferGeometry().setAttribute(
  "position",
  new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3)
)

const vertexShader = `
  varying vec2 seen;
  void main() {
    seen = position.xy;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }`

/** What ground and axes are both drawn from. */
const SIGHT = `
  uniform vec2 spread;
  uniform float dpr;
  // where on the screen this is: from -1 to 1, across and up
  varying vec2 seen;

  // which way the eye looks from here, as the camera has it
  vec3 look() {
    return normalize(vec3(seen * spread, -1.0));
  }

  // how much of the screen a pixel is, across and up
  vec2 pixel() {
    return vec2(dFdx(seen.x), dFdy(seen.y));
  }

  // How far off what is drawn here is, as the view counts it: so that the model hides
  // what is behind it. Nearer or further than the camera draws, it is drawn all the same.
  void away(float counted) {
    gl_FragDepth = clamp(counted, -1.0, 1.0) * 0.5 + 0.5;
  }`

const RULED = {
  vertexShader,
  fragmentShader: `
    ${SIGHT}
    uniform vec3 ink;
    uniform mat3 onGround;
    uniform vec3 depth;
    uniform mat3 turned;

    // the place on the ground that is seen here, in mm; and how many mm a pixel of the
    // screen is there, across the lines that run each way
    vec2 at;
    vec2 grain;

    // How much of this pixel the lines \`gap\` mm apart cover.
    float ruled(float gap) {
      vec2 across = at / gap;
      // how far off the nearest line is each way, in pixels
      vec2 off = abs(fract(across - 0.5) - 0.5) * gap / grain;
      // the two through the middle of the world are the axes, which are drawn for themselves
      off += step(abs(across), vec2(0.5)) * 1e3;
      return clamp(0.5 * (dpr + 1.0) - min(off.x, off.y), 0.0, 1.0);
    }

    void main() {
      vec2 size = pixel();
      // up from the ground is the third of the model's axes
      float square = abs(dot(look(), turned[2]));
      vec3 found = onGround * vec3(seen, 1.0);
      // none of it is seen along itself, nor above the horizon
      if (square <= ${SQUARE.ground.none.toFixed(3)} || found.z <= 0.0) discard;
      at = found.xy / found.z;
      // how far that place moves for a pixel across the screen, and for one up it
      vec2 across = (onGround[0].xy - at * onGround[0].z) / found.z * size.x;
      vec2 up = (onGround[1].xy - at * onGround[1].z) / found.z * size.y;
      grain = vec2(length(vec2(across.x, up.x)), length(vec2(across.y, up.y)));
      // The finest lines here are the least power of ten apart that keeps them from
      // crowding. With room to spare they are drawn in full; with none, not at all.
      float level = log(max(grain.x, grain.y) * dpr * ${GAP.toFixed(1)}) / log(10.0);
      float gap = pow(10.0, ceil(level));
      float room = ceil(level) - level;
      // Every tenth of them is on its way to being the finest, and every hundredth is
      // every tenth by then: so nothing jumps when the finest give out.
      float fine = ${INK.fine.toFixed(3)};
      float tenth = ${INK.tenth.toFixed(3)};
      float alpha = max(
        max(ruled(gap) * fine * room, ruled(gap * 10.0) * mix(fine, tenth, room)),
        ruled(gap * 100.0) * tenth
      );
      alpha *= smoothstep(
        ${SQUARE.ground.none.toFixed(3)}, ${SQUARE.ground.full.toFixed(3)}, square
      );
      away(dot(depth, vec3(seen, 1.0)));
      gl_FragColor = vec4(ink, alpha);
      #include <colorspace_fragment>
    }`,
}

const AXES = {
  vertexShader,
  fragmentShader: `
    ${SIGHT}
    uniform vec3 colour[3];
    uniform mat4 placed;
    uniform mat3 turned;

    void main() {
      vec2 size = pixel();
      vec3 eye = look();
      // where the middle of the world is on the screen
      vec4 middle = placed[3];
      // the axis that most of this pixel is: how much of it, and how far off
      float most = 0.0;
      float off = 0.0;
      vec3 tint = vec3(0.0);
      for (int axis = 0; axis < 3; axis++) {
        float square = length(cross(eye, turned[axis]));
        if (square <= ${SQUARE.axis.none.toFixed(3)}) continue;
        // which way the axis goes from the middle, on the screen: the line it makes
        // across it, and how many pixels from that line this one is
        vec4 way = placed[axis];
        vec3 line = cross(middle.xyw, way.xyw);
        float wide = length(line.xy * size);
        if (wide <= 0.0) continue;
        float aside = abs(dot(line, vec3(seen, 1.0))) / wide;
        // how far along the axis is seen here, in mm: not behind the eye, where the
        // same line across the screen carries on
        vec2 run = way.xy - seen * way.w;
        float along = dot(seen * middle.w - middle.xy, run) / dot(run, run);
        float ahead = middle.w + along * way.w;
        if (ahead <= 0.0) continue;
        float drawn =
          clamp(0.5 * (${AXIS.width.toFixed(2)} * dpr + 1.0) - aside, 0.0, 1.0) *
          smoothstep(
            ${SQUARE.axis.none.toFixed(3)}, ${SQUARE.axis.full.toFixed(3)}, square
          );
        if (drawn > most) {
          most = drawn;
          off = (middle.z + along * way.z) / ahead;
          tint = colour[axis];
        }
      }
      if (most <= 0.0) discard;
      away(off);
      gl_FragColor = vec4(tint, most * ${AXIS.strength.toFixed(3)});
      #include <colorspace_fragment>
    }`,
}

/** Drawn over whatever is behind, and hidden by whatever is in front. */
const OVER = { transparent: true, depthWrite: false }

export function Ground({
  colors,
  order,
}: {
  colors: ThemeColors
  /** when it is drawn, among everything else in the view */
  order: number
}) {
  const dpr = useThree((state) => state.viewport.dpr)
  const ground = React.useRef<THREE.Mesh>(null)

  const sight = React.useMemo(
    () => ({
      /** from the model's frame to the screen, with how far off */
      placed: { value: new THREE.Matrix4() },
      /** which way the model's axes go, as the camera has them */
      turned: { value: new THREE.Matrix3() },
      /** from a place on the screen to the place on the ground that is seen there */
      onGround: { value: new THREE.Matrix3() },
      /** and to how far off that is */
      depth: { value: new THREE.Vector3() },
      /** how the lines of sight spread across the view: not at all, with no lens */
      spread: { value: new THREE.Vector2() },
    }),
    []
  )
  // Found as the view is drawn, which is the one time the camera is sure to be where it
  // is drawn from.
  const find = React.useMemo(() => {
    const toCamera = new THREE.Matrix4()
    const toScreen = new THREE.Matrix3()
    return (
      _renderer: THREE.WebGLRenderer,
      _scene: THREE.Scene,
      camera: THREE.Camera
    ) => {
      if (!ground.current) return
      toCamera.multiplyMatrices(
        camera.matrixWorldInverse,
        ground.current.matrixWorld
      )
      sight.turned.value.setFromMatrix4(toCamera)
      sight.placed.value.multiplyMatrices(camera.projectionMatrix, toCamera)
      const lens = camera.projectionMatrix.elements
      if ((camera as THREE.OrthographicCamera).isOrthographicCamera)
        sight.spread.value.set(0, 0)
      else sight.spread.value.set(1 / lens[0], 1 / lens[5])
      // The ground is where the model's z is nought. So where a place on it goes on the
      // screen takes its other two numbers and one more, and gives three: which can be
      // turned round, to go from the screen to the ground. Seen exactly along itself the
      // ground is nowhere on the screen, and that comes to nothing.
      const m = sight.placed.value.elements
      toScreen.set(m[0], m[4], m[12], m[1], m[5], m[13], m[3], m[7], m[15])
      sight.onGround.value.copy(toScreen).invert()
      // how far off a place on the ground is, taken straight from where it is on the screen
      sight.depth.value
        .set(m[2], m[6], m[14])
        .applyMatrix3(toScreen.copy(sight.onGround.value).transpose())
    }
  }, [sight])

  const ruled = React.useMemo(
    () =>
      new THREE.ShaderMaterial({
        ...RULED,
        ...OVER,
        uniforms: {
          ink: { value: colors.foreground },
          dpr: { value: dpr },
          onGround: sight.onGround,
          depth: sight.depth,
          turned: sight.turned,
          spread: sight.spread,
        },
      }),
    [colors.foreground, dpr, sight]
  )
  React.useEffect(() => () => ruled.dispose(), [ruled])

  const axes = React.useMemo(
    () =>
      new THREE.ShaderMaterial({
        ...AXES,
        ...OVER,
        uniforms: {
          // the colours they have in the corner of the view
          colour: { value: [colors.axes.x, colors.axes.y, colors.axes.z] },
          dpr: { value: dpr },
          placed: sight.placed,
          turned: sight.turned,
          spread: sight.spread,
        },
      }),
    [colors.axes, dpr, sight]
  )
  React.useEffect(() => () => axes.dispose(), [axes])

  return (
    <>
      <mesh
        ref={ground}
        geometry={SCREEN}
        material={ruled}
        frustumCulled={false}
        renderOrder={order}
        raycast={NOT_PICKED}
        onBeforeRender={find}
      />
      <mesh
        geometry={SCREEN}
        material={axes}
        frustumCulled={false}
        // over the squares
        renderOrder={order + 0.01}
        raycast={NOT_PICKED}
        onBeforeRender={find}
      />
    </>
  )
}
