import { useEffect, useRef, type ReactNode } from 'react';
import * as THREE from 'three';
import type { TwinPayload, WellSummary } from '../lib/types';
import { STATUS_COLOR } from '../lib/format';
import { useApp } from '../store';

/* --------------------------------------------------------------------------
 * Shared canvas plumbing
 * ------------------------------------------------------------------------ */

interface SceneContext {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  mount: HTMLDivElement;
  overlay: HTMLDivElement;
}

type FrameHook = (delta: number, elapsed: number) => void;

function useThreeScene(
  build: (ctx: SceneContext) => FrameHook | void,
  deps: unknown[],
  opts: { background?: string } = {},
) {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch {
      // WebGL unavailable — leave the styled container in place.
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(opts.background ?? 0x000000, 0);
    if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    mount.appendChild(renderer.domElement);

    const overlay = document.createElement('div');
    overlay.style.position = 'absolute';
    overlay.style.inset = '0';
    overlay.style.pointerEvents = 'none';
    overlay.style.overflow = 'hidden';
    mount.appendChild(overlay);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 600);

    const ctx: SceneContext = { renderer, scene, camera, mount, overlay };
    const frameHook = build(ctx);

    const resize = () => {
      const width = mount.clientWidth || 640;
      const height = mount.clientHeight || 420;
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(mount);

    let raf = 0;
    const clock = new THREE.Clock();
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const delta = Math.min(0.05, clock.getDelta());
      const elapsed = clock.elapsedTime;
      frameHook?.(delta, elapsed);
      renderer.render(scene, camera);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      frameHook?.(-1, -1);
      mount.removeChild(overlay);
      renderer.domElement.remove();
      renderer.dispose();
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(material)) material.forEach((item) => item.dispose());
        else material?.dispose();
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return mountRef;
}

/* --------------------------------------------------------------------------
 * Hero — rotating 3D oil field
 * ------------------------------------------------------------------------ */

const FORMATION_TINTS: Record<string, number> = {
  'Tipam Sandstone': 0x38bdf8,
  'Girujan Clay': 0xf59e0b,
  Namsang: 0x22d3ee,
  Bokabil: 0xa78bfa,
  Barail: 0xf97316,
  Kopili: 0xef4444,
  Sylhet: 0x10b981,
  Basement: 0xec4899,
};

function tintFor(name: string): number {
  const key = Object.keys(FORMATION_TINTS).find((candidate) => name.includes(candidate));
  return key ? FORMATION_TINTS[key] : 0x3b82f6;
}

export function HeroScene({ wells }: { wells: WellSummary[] }) {
  const { theme } = useApp();
  const mountRef = useThreeScene(
    ({ scene, camera, renderer }) => {
      // Theme-aware palette: the previous scene was tuned for the dark shell
      // only (near-black terrain, dense dark fog, ultra-faint slabs) and
      // effectively vanished on the light theme.
      const isLight = theme === 'light';
      scene.fog = new THREE.FogExp2(isLight ? 0xdcebf8 : 0x050b18, isLight ? 0.0105 : 0.0125);

      scene.add(new THREE.AmbientLight(isLight ? 0xffffff : 0x9cc8ef, isLight ? 1.0 : 1.05));
      const key = new THREE.DirectionalLight(0xdff3ff, isLight ? 1.4 : 1.5);
      key.position.set(18, 34, 22);
      scene.add(key);
      const rim = new THREE.PointLight(0x22d3ee, 190, 130);
      rim.position.set(-24, 14, -18);
      scene.add(rim);
      const warm = new THREE.PointLight(0xf97316, 130, 110);
      warm.position.set(22, 6, 16);
      scene.add(warm);

      const root = new THREE.Group();
      scene.add(root);

      // ---- Terrain -------------------------------------------------------
      const terrainGeometry = new THREE.PlaneGeometry(78, 78, 74, 74);
      const positions = terrainGeometry.attributes.position as THREE.BufferAttribute;
      for (let index = 0; index < positions.count; index += 1) {
        const x = positions.getX(index);
        const y = positions.getY(index);
        const height =
          Math.sin(x * 0.14) * Math.cos(y * 0.12) * 1.5 +
          Math.sin((x + y) * 0.06) * 1.9 +
          Math.cos(x * 0.31) * 0.5;
        positions.setZ(index, height);
      }
      terrainGeometry.computeVertexNormals();

      const terrain = new THREE.Mesh(
        terrainGeometry,
        new THREE.MeshStandardMaterial({
          color: isLight ? 0x9fc2dd : 0x1d4a7a,
          metalness: isLight ? 0.1 : 0.22,
          roughness: isLight ? 0.85 : 0.6,
          flatShading: true,
          // Translucent ground: the drilled wells and formation zones sit below
          // it and must stay readable through the surface.
          transparent: true,
          opacity: isLight ? 0.5 : 0.42,
          depthWrite: false,
        }),
      );
      terrain.rotation.x = -Math.PI / 2;
      terrain.position.y = -0.4;
      root.add(terrain);

      const grid = new THREE.GridHelper(78, 42, isLight ? 0x8fb4d4 : 0x2f88b8, isLight ? 0xbfd6ea : 0x1f5f80);
      (grid.material as THREE.Material).transparent = true;
      (grid.material as THREE.Material).opacity = isLight ? 0.45 : 0.5;
      grid.position.y = 0.55;
      root.add(grid);

      // ---- Formation heat zones -----------------------------------------
      // Everything subsurface shares one scale: DEPTH_UNIT world-units per
      // metre, chosen so the deepest well (~5.5 km) reaches ~28 units below
      // the pad — comfortably inside the camera frame. (The old code stacked
      // an extra ×12 that put wells 250+ units underground, far outside the
      // view, which is why the wells looked missing.)
      const DEPTH_UNIT = 0.0052;
      const depths = [1500, 2500, 3300, 4100, 5000];
      const formationNames = ['Tipam Sandstone', 'Girujan Clay', 'Bokabil', 'Barail', 'Kopili Shale'];
      const slabMeshes: THREE.Mesh[] = [];
      depths.forEach((depth, index) => {
        const radius = 30 - index * 1.6;
        const slabY = -depth * DEPTH_UNIT;
        const slab = new THREE.Mesh(
          new THREE.CylinderGeometry(radius, radius, 1.15, 56, 1, true),
          new THREE.MeshBasicMaterial({
            color: tintFor(formationNames[index]),
            transparent: true,
            opacity: (isLight ? 0.1 : 0.09) + index * 0.016,
            side: THREE.DoubleSide,
            depthWrite: false,
          }),
        );
        slab.position.y = slabY;
        root.add(slab);
        slabMeshes.push(slab);

        const ring = new THREE.Mesh(
          new THREE.RingGeometry(radius - 0.22, radius, 72),
          new THREE.MeshBasicMaterial({
            color: tintFor(formationNames[index]),
            transparent: true,
            opacity: 0.55,
            side: THREE.DoubleSide,
            depthWrite: false,
          }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = slabY;
        root.add(ring);
      });

      // ---- Wells ---------------------------------------------------------
      const cluster = wells
        .filter((well) => well.status !== 'HISTORICAL' || well.riskScore > 55)
        .slice(0, 20);
      if (cluster.length === 0) cluster.push(...wells.slice(0, 8));

      const wellVisuals: { curve: THREE.CatmullRomCurve3; color: THREE.Color; tip: THREE.Mesh }[] = [];
      const bitHalos: THREE.Mesh[] = [];
      // Normalise the cluster into a fixed footprint. Raw lat/lon deltas span
      // several degrees across basins, which flung most wells outside the
      // camera frame; mapping by rank keeps every well on the pad.
      const lons = cluster.map((well) => well.lon);
      const lats = cluster.map((well) => well.lat);
      const lonMin = Math.min(...lons);
      const lonMax = Math.max(...lons);
      const latMin = Math.min(...lats);
      const latMax = Math.max(...lats);
      const lonSpan = Math.max(1e-6, lonMax - lonMin);
      const latSpan = Math.max(1e-6, latMax - latMin);
      const FOOTPRINT = 12;

      cluster.forEach((well, index) => {
        const color = new THREE.Color(STATUS_COLOR[well.status]);
        const nx = lonSpan < 0.02 ? (index / cluster.length - 0.5) * 1.3 : (well.lon - lonMin) / lonSpan - 0.5;
        const nz = latSpan < 0.02 ? (((index * 7) % cluster.length) / cluster.length - 0.5) * 1.3 : (well.lat - latMin) / latSpan - 0.5;
        const x = nx * FOOTPRINT * 2 + Math.sin(index * 12.9898) * 1.1;
        const z = nz * FOOTPRINT * 2 + Math.cos(index * 78.233) * 1.1;
        const depth = Math.max(6, well.totalDepthMd * DEPTH_UNIT);
        const deviated = well.isDeviated;
        const lean = deviated ? Math.min(7, well.targetInclination * 0.2 + 1.6) : 0.15;
        const heading = index * 2.4;

        const points: THREE.Vector3[] = [];
        const segments = 16;
        for (let step = 0; step <= segments; step += 1) {
          const t = step / segments;
          points.push(
            new THREE.Vector3(
              x + Math.sin(heading) * lean * t * t,
              -depth * t,
              z + Math.cos(heading) * lean * t * t,
            ),
          );
        }
        const curve = new THREE.CatmullRomCurve3(points);
        const tube = new THREE.Mesh(
          new THREE.TubeGeometry(curve, 34, well.status === 'ACTIVE' ? 0.26 : 0.16, 6, false),
          new THREE.MeshBasicMaterial({
            // On the pale light stage the tubes need full opacity plus a darker
            // tone to hold contrast against the sky/terrain.
            color: isLight ? color.clone().multiplyScalar(0.72) : color,
            transparent: true,
            opacity: isLight ? 1 : well.status === 'ACTIVE' ? 1 : 0.8,
          }),
        );
        root.add(tube);

        // Wellhead
        const head = new THREE.Mesh(
          new THREE.CylinderGeometry(0.32, 0.42, 1.5, 8),
          new THREE.MeshStandardMaterial({ color: isLight ? 0x4c6b88 : 0x9cc4e2, metalness: 0.72, roughness: 0.34 }),
        );
        head.position.set(x, 0.55, z);
        root.add(head);

        const tip = new THREE.Mesh(
          new THREE.SphereGeometry(well.status === 'CRITICAL' ? 0.55 : 0.4, 14, 14),
          new THREE.MeshBasicMaterial({ color: isLight ? color.clone().multiplyScalar(0.7) : color }),
        );
        tip.position.copy(points[points.length - 1]);
        root.add(tip);

        // Glowing halo around the bit so the drill front reads at a glance.
        const bitHalo = new THREE.Mesh(
          new THREE.SphereGeometry(well.status === 'CRITICAL' ? 0.95 : 0.72, 14, 14),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: isLight ? 0.3 : 0.22, depthWrite: false }),
        );
        bitHalo.position.copy(tip.position);
        root.add(bitHalo);
        bitHalos.push(bitHalo);

        // Risk pulse at critical wells
        if (well.status === 'CRITICAL' || well.riskScore > 72) {
          const pulse = new THREE.Mesh(
            new THREE.RingGeometry(0.9, 1.15, 40),
            new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }),
          );
          pulse.rotation.x = -Math.PI / 2;
          pulse.position.set(x, 0.7, z);
          root.add(pulse);
          pulse.userData.isPulse = true;
        }

        wellVisuals.push({ curve, color, tip });
      });

      // ---- Telemetry streams --------------------------------------------
      const particleCount = Math.min(260, wellVisuals.length * 14);
      const particlePositions = new Float32Array(particleCount * 3);
      const particleColors = new Float32Array(particleCount * 3);
      const particleState = Array.from({ length: particleCount }, (_, index) => ({
        well: index % Math.max(1, wellVisuals.length),
        progress: Math.random(),
        speed: 0.045 + Math.random() * 0.12,
      }));
      for (let index = 0; index < particleCount; index += 1) {
        const color = wellVisuals[particleState[index].well]?.color ?? new THREE.Color(0x22d3ee);
        particleColors[index * 3] = 0.35 + color.r * 0.65;
        particleColors[index * 3 + 1] = 0.45 + color.g * 0.55;
        particleColors[index * 3 + 2] = 0.6 + color.b * 0.4;
      }
      const particleGeometry = new THREE.BufferGeometry();
      particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
      particleGeometry.setAttribute('color', new THREE.BufferAttribute(particleColors, 3));
      const particles = new THREE.Points(
        particleGeometry,
        new THREE.PointsMaterial({ size: 0.52, vertexColors: true, transparent: true, opacity: 0.98, sizeAttenuation: true }),
      );
      root.add(particles);

      // ---- Camera --------------------------------------------------------
      // Framed to contain the whole pad (±15 footprint) and the deepest bit
      // (~-29) in the narrow hero stage.
      camera.position.set(24, 24, 46);
      camera.lookAt(0, -10, 0);

      const pulses: THREE.Mesh[] = [];
      root.traverse((object) => {
        if (object.userData.isPulse) pulses.push(object as THREE.Mesh);
      });

      return (delta, elapsed) => {
        if (delta < 0) return;
        root.rotation.y += delta * 0.055;
        const positions2 = particleGeometry.attributes.position as THREE.BufferAttribute;
        for (let index = 0; index < particleState.length; index += 1) {
          const state = particleState[index];
          const visual = wellVisuals[state.well];
          if (!visual) continue;
          state.progress += state.speed * delta;
          if (state.progress > 1) state.progress -= 1;
          const point = visual.curve.getPointAt(Math.max(0.001, Math.min(0.999, 1 - state.progress)));
          positions2.setXYZ(index, point.x, point.y, point.z);
        }
        positions2.needsUpdate = true;

        pulses.forEach((pulse, index) => {
          const phase = (elapsed * 0.55 + index * 0.31) % 1;
          const scale = 1 + phase * 3.6;
          pulse.scale.set(scale, scale, 1);
          (pulse.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.5 * (1 - phase));
        });

        slabMeshes.forEach((slab, index) => {
          (slab.material as THREE.MeshBasicMaterial).opacity =
            (isLight ? 0.1 : 0.09) + index * 0.016 + Math.sin(elapsed * 0.7 + index) * 0.02;
        });

        // Drill-bit halos breathe so active drilling fronts stay visible.
        bitHalos.forEach((halo, index) => {
          const breathe = 1 + Math.sin(elapsed * 2.2 + index * 1.3) * 0.16;
          halo.scale.set(breathe, breathe, breathe);
          (halo.material as THREE.MeshBasicMaterial).opacity =
            0.16 + Math.sin(elapsed * 2.2 + index * 1.3) * 0.08;
        });

        renderer.domElement.style.filter = 'none';
      };
    },
    [wells.length, theme],
  );

  return (
    <div
      ref={mountRef}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      aria-label="Rotating 3D oil field visualisation"
    />
  );
}

/* --------------------------------------------------------------------------
 * Digital twin
 * ------------------------------------------------------------------------ */

export function TwinScene({
  twin,
  autoRotate = true,
  showPlanned = true,
  showNearby = true,
  showRisk = true,
  highlightZone,
}: {
  twin: TwinPayload;
  autoRotate?: boolean;
  showPlanned?: boolean;
  showNearby?: boolean;
  showRisk?: boolean;
  highlightZone?: string | null;
}) {
  const stateRef = useRef({ autoRotate, showPlanned, showNearby, showRisk, highlightZone });
  stateRef.current = { autoRotate, showPlanned, showNearby, showRisk, highlightZone };

  const mountRef = useThreeScene(
    ({ scene, camera, renderer, mount, overlay }) => {
      scene.add(new THREE.AmbientLight(0x9ecdf0, 0.85));
      const key = new THREE.DirectionalLight(0xe6f6ff, 1.0);
      key.position.set(24, 40, 26);
      scene.add(key);
      const accent = new THREE.PointLight(0x22d3ee, 240, 160);
      accent.position.set(-20, 8, -16);
      scene.add(accent);

      const depthScale = 26 / Math.max(1000, twin.activeWell.totalDepthMd);
      const halfSpan = 15;
      const height = twin.activeWell.totalDepthMd * depthScale;

      const root = new THREE.Group();
      scene.add(root);

      // ---- Earth block ---------------------------------------------------
      const block = new THREE.Mesh(
        new THREE.BoxGeometry(halfSpan * 2, height, halfSpan * 2),
        new THREE.MeshStandardMaterial({
          color: 0x0a1a2e,
          transparent: true,
          opacity: 0.13,
          metalness: 0.1,
          roughness: 0.95,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      block.position.y = -height / 2;
      root.add(block);
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(halfSpan * 2, height, halfSpan * 2)),
        new THREE.LineBasicMaterial({ color: 0x2f6f8f, transparent: true, opacity: 0.42 }),
      );
      edges.position.y = -height / 2;
      root.add(edges);

      // ---- Formation zones ----------------------------------------------
      const zoneMeshes: { name: string; mesh: THREE.Mesh; top: number; base: number }[] = [];
      twin.formationZones.forEach((zone) => {
        const zoneHeight = Math.max(0.35, (zone.base - zone.top) * depthScale);
        const color = tintFor(zone.name);
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(halfSpan * 2 - 0.4, zoneHeight, halfSpan * 2 - 0.4),
          new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.13,
            depthWrite: false,
          }),
        );
        mesh.position.y = -((zone.top + zone.base) / 2) * depthScale;
        root.add(mesh);

        const band = new THREE.Mesh(
          new THREE.BoxGeometry(halfSpan * 2 - 0.4, 0.06, halfSpan * 2 - 0.4),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.62 }),
        );
        band.position.y = -zone.top * depthScale;
        root.add(band);

        zoneMeshes.push({ name: zone.name, mesh, top: zone.top, base: zone.base });
      });

      // ---- Reservoir disc -------------------------------------------------
      const reservoirDepth = twin.activeWell.totalDepthMd * 0.94;
      const reservoir = new THREE.Mesh(
        new THREE.CylinderGeometry(halfSpan * 0.86, halfSpan * 0.86, 0.5, 48),
        new THREE.MeshBasicMaterial({ color: 0x10b981, transparent: true, opacity: 0.34, depthWrite: false }),
      );
      reservoir.position.y = -reservoirDepth * depthScale;
      root.add(reservoir);

      // ---- Risk zones -----------------------------------------------------
      const riskGroup = new THREE.Group();
      twin.riskBands
        .filter((band) => band.band === 'HIGH' || band.band === 'CRITICAL')
        .forEach((band) => {
          const slab = new THREE.Mesh(
            new THREE.BoxGeometry(halfSpan * 1.35, 100 * depthScale, halfSpan * 1.35),
            new THREE.MeshBasicMaterial({
              color: band.band === 'CRITICAL' ? 0xef4444 : 0xf97316,
              transparent: true,
              opacity: band.band === 'CRITICAL' ? 0.28 : 0.15,
              depthWrite: false,
            }),
          );
          slab.position.y = -(band.depth + 50) * depthScale;
          riskGroup.add(slab);
        });
      root.add(riskGroup);

      // ---- Active well trajectory ----------------------------------------
      const toVector = (station: TwinPayload['trajectory'][number]) =>
        new THREE.Vector3(station.easting * depthScale * 0.55, -station.tvd * depthScale, station.northing * depthScale * 0.55);

      const drilledPoints = twin.trajectory.map(toVector);
      const drilled = new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(drilledPoints), 90, 0.16, 8, false),
        new THREE.MeshStandardMaterial({ color: 0x22d3ee, emissive: 0x0e7490, emissiveIntensity: 0.9, metalness: 0.4, roughness: 0.3 }),
      );
      root.add(drilled);

      const plannedGroup = new THREE.Group();
      if (twin.plannedTrajectory.length > 1) {
        const last = drilledPoints[drilledPoints.length - 1];
        const plannedPoints = [last, ...twin.plannedTrajectory.map(toVector)];
        const plannedCurve = new THREE.CatmullRomCurve3(plannedPoints);
        const plannedTube = new THREE.Mesh(
          new THREE.TubeGeometry(plannedCurve, 60, 0.085, 6, false),
          new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.6 }),
        );
        plannedGroup.add(plannedTube);
        // Dashes along the plan
        for (let step = 0; step < 26; step += 1) {
          const t = step / 26;
          const point = plannedCurve.getPointAt(t);
          const dot = new THREE.Mesh(
            new THREE.SphereGeometry(0.1, 8, 8),
            new THREE.MeshBasicMaterial({ color: 0xfcd34d }),
          );
          dot.position.copy(point);
          plannedGroup.add(dot);
        }
      }
      root.add(plannedGroup);

      // Bit marker
      const bit = new THREE.Mesh(
        new THREE.SphereGeometry(0.44, 18, 18),
        new THREE.MeshBasicMaterial({ color: 0xf97316 }),
      );
      bit.position.copy(drilledPoints[drilledPoints.length - 1]);
      root.add(bit);
      const bitHalo = new THREE.Mesh(
        new THREE.RingGeometry(0.62, 0.86, 40),
        new THREE.MeshBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }),
      );
      bitHalo.position.copy(bit.position);
      root.add(bitHalo);

      // ---- Nearby wells ---------------------------------------------------
      const nearbyGroup = new THREE.Group();
      twin.nearbyWells.forEach((well) => {
        const color = new THREE.Color(STATUS_COLOR[well.status] ?? '#22c55e');
        const points = well.trajectory.length
          ? well.trajectory.map(
              (station) =>
                new THREE.Vector3(
                  well.dx * depthScale * 0.55 + station.easting * depthScale * 0.55,
                  -station.tvd * depthScale,
                  well.dy * depthScale * 0.55 + station.northing * depthScale * 0.55,
                ),
            )
          : [new THREE.Vector3(well.dx * depthScale * 0.55, 0, well.dy * depthScale * 0.55)];
        if (points.length < 2) points.push(new THREE.Vector3(points[0].x, -well.totalDepthMd * depthScale, points[0].z));
        const tube = new THREE.Mesh(
          new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 40, 0.055, 5, false),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55 }),
        );
        nearbyGroup.add(tube);

        const cap = new THREE.Mesh(
          new THREE.SphereGeometry(0.2, 10, 10),
          new THREE.MeshBasicMaterial({ color }),
        );
        cap.position.set(well.dx * depthScale * 0.55, 0, well.dy * depthScale * 0.55);
        nearbyGroup.add(cap);
      });
      root.add(nearbyGroup);

      // ---- HTML labels ----------------------------------------------------
      const labels = twin.formationZones.map((zone) => {
        const element = document.createElement('div');
        element.textContent = `${zone.name} · ${Math.round(zone.top)} m`;
        element.style.position = 'absolute';
        element.style.fontSize = '10.5px';
        element.style.padding = '2px 7px';
        element.style.borderRadius = '7px';
        element.style.background = 'rgba(5,11,24,.78)';
        element.style.border = '1px solid rgba(122,176,224,.26)';
        element.style.color = '#cfe4f7';
        element.style.whiteSpace = 'nowrap';
        element.style.transform = 'translate(-100%, -50%)';
        element.style.transition = 'border-color .2s';
        overlay.appendChild(element);
        return { element, y: -zone.top * depthScale, name: zone.name };
      });
      const bitLabel = document.createElement('div');
      bitLabel.textContent = 'BIT';
      Object.assign(bitLabel.style, {
        position: 'absolute',
        fontSize: '9.5px',
        fontWeight: '700',
        letterSpacing: '.08em',
        padding: '2px 6px',
        borderRadius: '6px',
        background: 'rgba(249,115,22,.9)',
        color: '#fff',
        transform: 'translate(14px, -50%)',
      } as CSSStyleDeclaration);
      overlay.appendChild(bitLabel);

      // ---- Camera & custom orbit -----------------------------------------
      let theta = Math.PI * 0.28;
      let phi = Math.PI * 0.34;
      let radius = 52;
      const target = new THREE.Vector3(0, -height * 0.42, 0);
      const applyCamera = () => {
        camera.position.set(
          target.x + radius * Math.sin(phi) * Math.cos(theta),
          target.y + radius * Math.cos(phi),
          target.z + radius * Math.sin(phi) * Math.sin(theta),
        );
        camera.lookAt(target);
      };
      applyCamera();

      let dragging = false;
      let lastX = 0;
      let lastY = 0;
      const onPointerDown = (event: PointerEvent) => {
        dragging = true;
        lastX = event.clientX;
        lastY = event.clientY;
        mount.setPointerCapture(event.pointerId);
      };
      const onPointerMove = (event: PointerEvent) => {
        if (!dragging) return;
        theta += (event.clientX - lastX) * 0.0062;
        phi = Math.max(0.16, Math.min(Math.PI * 0.86, phi - (event.clientY - lastY) * 0.005));
        lastX = event.clientX;
        lastY = event.clientY;
        applyCamera();
      };
      const onPointerUp = (event: PointerEvent) => {
        dragging = false;
        if (mount.hasPointerCapture(event.pointerId)) mount.releasePointerCapture(event.pointerId);
      };
      const onWheel = (event: WheelEvent) => {
        event.preventDefault();
        radius = Math.max(20, Math.min(110, radius + event.deltaY * 0.035));
        applyCamera();
      };
      mount.style.cursor = 'grab';
      mount.addEventListener('pointerdown', onPointerDown);
      mount.addEventListener('pointermove', onPointerMove);
      mount.addEventListener('pointerup', onPointerUp);
      mount.addEventListener('wheel', onWheel, { passive: false });

      const projected = new THREE.Vector3();

      return (delta, elapsed) => {
        if (delta < 0) {
          mount.removeEventListener('pointerdown', onPointerDown);
          mount.removeEventListener('pointermove', onPointerMove);
          mount.removeEventListener('pointerup', onPointerUp);
          mount.removeEventListener('wheel', onWheel);
          labels.forEach((label) => label.element.remove());
          bitLabel.remove();
          return;
        }

        const flags = stateRef.current;
        if (flags.autoRotate && !dragging) {
          theta += delta * 0.09;
          applyCamera();
        }

        plannedGroup.visible = flags.showPlanned;
        nearbyGroup.visible = flags.showNearby;
        riskGroup.visible = flags.showRisk;

        const pulse = 1 + Math.sin(elapsed * 3.1) * 0.14;
        bitHalo.scale.set(pulse, pulse, 1);
        bitHalo.lookAt(camera.position);
        (bitHalo.material as THREE.MeshBasicMaterial).opacity = 0.32 + Math.sin(elapsed * 3.1) * 0.2;

        const width = mount.clientWidth;
        const heightPx = mount.clientHeight;
        labels.forEach((label) => {
          projected.set(0, label.y, 0).project(camera);
          const x = (projected.x * 0.5 + 0.5) * width;
          const y = (-projected.y * 0.5 + 0.5) * heightPx;
          const visible = projected.z < 1 && x > -100 && x < width + 100;
          label.element.style.display = visible ? 'block' : 'none';
          label.element.style.left = `${Math.round(14 + width / 2 + (x - width / 2) * 0.06)}px`;
          label.element.style.top = `${Math.round(y)}px`;
          const active = flags.highlightZone === label.name;
          label.element.style.borderColor = active ? 'rgba(34,211,238,.9)' : 'rgba(122,176,224,.26)';
          label.element.style.color = active ? '#7dd3fc' : '#cfe4f7';
        });

        projected.copy(bit.position).project(camera);
        bitLabel.style.left = `${Math.round((projected.x * 0.5 + 0.5) * width + 10)}px`;
        bitLabel.style.top = `${Math.round((-projected.y * 0.5 + 0.5) * heightPx)}px`;

        zoneMeshes.forEach((zone) => {
          const material = zone.mesh.material as THREE.MeshBasicMaterial;
          material.opacity = flags.highlightZone === zone.name ? 0.34 : 0.13;
        });

        // Grid floor for scale reference
        renderer.domElement.style.touchAction = 'none';
      };
    },
    [twin.activeWell.id, twin.formationZones.length],
  );

  return <div ref={mountRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />;
}

export function SceneFrame({ children, height = 460, caption }: { children: ReactNode; height?: number; caption?: ReactNode }) {
  return (
    <div className="glass" style={{ position: 'relative', overflow: 'hidden', padding: 0 }}>
      <div style={{ position: 'relative', height }}>{children}</div>
      {caption && <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)' }}>{caption}</div>}
    </div>
  );
}
