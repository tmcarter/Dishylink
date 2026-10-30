// Single-satellite orbit tracker: one satellite's full orbit, sampled with SGP4,
// shown either as a ground track on an equirectangular map or as the true
// elliptical ring around a 3D Earth. Plain SVG — no extra rendering deps.

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { loadStarlinkTles, type TleRecord } from "../../lib/satellites";
import {
  EARTH_RADIUS_KM,
  positionNow,
  sampleOrbit,
  splitAtAntimeridian,
  type OrbitPath,
  type OrbitSample,
} from "../../lib/orbitPath";
import { SegmentedControl } from "../ui/segmented-control";
import { Loading } from "../ui/loading";
import { Callout } from "../ui/callout";
import { SkyControl } from "./SkyControl";

type OrbitViewMode = "map" | "globe";
const VIEW_KEY = "dishylink.orbitView";

interface OrbitTrackerProps {
  satelliteName: string;
  onClose: () => void;
}

export function OrbitTracker({ satelliteName, onClose }: OrbitTrackerProps) {
  const { t } = useTranslation();
  const [tle, setTle] = useState<TleRecord | null>(null);
  const [failed, setFailed] = useState(false);
  const [mode, setMode] = useState<OrbitViewMode>(() =>
    localStorage.getItem(VIEW_KEY) === "globe" ? "globe" : "map",
  );
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let live = true;
    loadStarlinkTles()
      .then((records) => {
        if (!live) return;
        const found = records.find((r) => r.name === satelliteName);
        if (found) setTle(found);
        else setFailed(true);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [satelliteName]);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Resample the path once a minute; the marker moves every second.
  const minute = Math.floor(now.getTime() / 60_000);
  const orbit = useMemo(
    () => (tle ? sampleOrbit(tle, new Date(minute * 60_000)) : null),
    [tle, minute],
  );
  const current = useMemo(() => (tle ? positionNow(tle, now) : null), [tle, now]);

  const chooseMode = (next: OrbitViewMode) => {
    setMode(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // storage unavailable — keep it for this session only
    }
  };

  return (
    <div
      data-theme='dark'
      className='fixed inset-0 z-[60] flex flex-col bg-page p-6 text-foreground'
    >
      <div className='flex items-center gap-3'>
        <h1 className='m-0 text-[15px] font-semibold'>
          {t("orbit.title", { name: satelliteName.replace(/\s*\[DTC\]\s*/, "") })}
        </h1>
        <SegmentedControl
          label={t("orbit.viewLabel")}
          value={mode}
          onChange={chooseMode}
          options={[
            { value: "map", label: t("orbit.mapView") },
            { value: "globe", label: t("orbit.globeView") },
          ]}
        />
        <div className='ml-auto'>
          <SkyControl label={t("common.close")} onClick={onClose}>
            ✕
          </SkyControl>
        </div>
      </div>

      {failed && <Callout tone='error'>{t("orbit.notFound")}</Callout>}
      {!failed && !orbit && <Loading message={t("orbit.loading")} />}

      {orbit && (
        <div className='mt-4 flex min-h-0 flex-1 gap-4'>
          <div className='min-w-0 flex-1'>
            {mode === "map" ? (
              <GroundTrack orbit={orbit} current={current} />
            ) : (
              <OrbitGlobe orbit={orbit} current={current} />
            )}
          </div>
          <OrbitFacts orbit={orbit} current={current} />
        </div>
      )}
    </div>
  );
}

function OrbitFacts({ orbit, current }: { orbit: OrbitPath; current: OrbitSample | null }) {
  const { t } = useTranslation();
  const rows: Array<[string, string]> = [
    [t("orbit.period"), `${orbit.periodMin.toFixed(1)} min`],
    [t("orbit.apogee"), `${orbit.apogeeKm.toFixed(0)} km`],
    [t("orbit.perigee"), `${orbit.perigeeKm.toFixed(0)} km`],
    [t("orbit.inclination"), `${orbit.inclinationDeg.toFixed(2)}°`],
    [t("orbit.eccentricity"), orbit.eccentricity.toFixed(5)],
  ];
  if (current) {
    rows.push(
      [t("orbit.latitude"), `${current.latDeg.toFixed(2)}°`],
      [t("orbit.longitude"), `${current.lonDeg.toFixed(2)}°`],
      [t("satellite.altitude"), `${current.altitudeKm.toFixed(0)} km`],
    );
  }
  return (
    <div className='w-[220px] shrink-0 rounded-xl border border-[#28282896] bg-[#00000094] p-4'>
      <div className='grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-1 font-mono text-[11.5px] tabular-nums [&>span:nth-child(odd)]:text-muted-foreground [&>span:nth-child(even)]:text-right'>
        {rows.map(([k, v]) => (
          <FactPair key={k} label={k} value={v} />
        ))}
      </div>
    </div>
  );
}

function FactPair({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span>{label}</span>
      <span>{value}</span>
    </>
  );
}

const MAP_W = 720;
const MAP_H = 360;
const mapX = (lon: number) => ((lon + 180) / 360) * MAP_W;
const mapY = (lat: number) => ((90 - lat) / 180) * MAP_H;

function GroundTrack({ orbit, current }: { orbit: OrbitPath; current: OrbitSample | null }) {
  const runs = splitAtAntimeridian(orbit.samples);
  const grid: number[] = [-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150];
  return (
    <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} className='h-full w-full' role='img'>
      <rect width={MAP_W} height={MAP_H} fill='#0b1524' stroke='#28282896' />
      {grid.map((lon) => (
        <line key={`lon${lon}`} x1={mapX(lon)} x2={mapX(lon)} y1={0} y2={MAP_H} stroke='#1c2a3d' />
      ))}
      {[-60, -30, 0, 30, 60].map((lat) => (
        <line
          key={`lat${lat}`}
          x1={0}
          x2={MAP_W}
          y1={mapY(lat)}
          y2={mapY(lat)}
          stroke={lat === 0 ? "#2c4260" : "#1c2a3d"}
        />
      ))}
      {runs.map((run, i) => (
        <polyline
          key={i}
          fill='none'
          stroke='var(--chart-warm)'
          strokeWidth={1.6}
          points={run.map((s) => `${mapX(s.lonDeg)},${mapY(s.latDeg)}`).join(" ")}
        />
      ))}
      {current && <circle cx={mapX(current.lonDeg)} cy={mapY(current.latDeg)} r={5} fill='#fff' />}
    </svg>
  );
}

/** Rotates ECI into a view tilted so the orbit plane reads as an ellipse, then
 *  projects orthographically. Back-half points are dimmed by depth. */
function OrbitGlobe({ orbit, current }: { orbit: OrbitPath; current: OrbitSample | null }) {
  const [yawDeg, setYawDeg] = useState(30);
  const [drag, setDrag] = useState<number | null>(null);
  const size = 520;
  const maxR = Math.max(...orbit.samples.map((s) => Math.hypot(...s.eci)));
  const scale = (size / 2 - 16) / maxR;
  const tilt = (20 * Math.PI) / 180;
  const yaw = (yawDeg * Math.PI) / 180;
  const project = ([x, y, z]: [number, number, number]) => {
    // Yaw about Z (Earth axis), then tilt about X so we look slightly down.
    const x1 = x * Math.cos(yaw) - y * Math.sin(yaw);
    const y1 = x * Math.sin(yaw) + y * Math.cos(yaw);
    const y2 = y1 * Math.cos(tilt) - z * Math.sin(tilt);
    const z2 = y1 * Math.sin(tilt) + z * Math.cos(tilt);
    return { sx: size / 2 + x1 * scale, sy: size / 2 - z2 * scale, depth: y2 };
  };
  const pts = orbit.samples.map((s) => project(s.eci));
  const earthR = EARTH_RADIUS_KM * scale;
  const segments = pts.slice(1).map((p, i) => ({ a: pts[i], b: p }));
  const cur = current ? project(current.eci) : null;
  // Positive depth = behind the Earth from the viewer.
  const hidden = (p: { sx: number; sy: number; depth: number }) =>
    p.depth > 0 && Math.hypot(p.sx - size / 2, p.sy - size / 2) < earthR;
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className='h-full w-full touch-none'
      style={{ cursor: drag === null ? "grab" : "grabbing" }}
      onPointerDown={(e) => setDrag(e.clientX)}
      onPointerUp={() => setDrag(null)}
      onPointerLeave={() => setDrag(null)}
      onPointerMove={(e) => {
        if (drag === null) return;
        setYawDeg((v) => v + (e.clientX - drag) * 0.4);
        setDrag(e.clientX);
      }}
      role='img'
    >
      <defs>
        <radialGradient id='orbit-earth' cx='40%' cy='35%'>
          <stop offset='0%' stopColor='#2f6fb0' />
          <stop offset='100%' stopColor='#0b2240' />
        </radialGradient>
      </defs>
      {segments.map(({ a, b }, i) =>
        hidden(a) && hidden(b) ? null : a.depth > 0 ? (
          <line
            key={`b${i}`}
            x1={a.sx}
            y1={a.sy}
            x2={b.sx}
            y2={b.sy}
            stroke='var(--chart-warm)'
            strokeOpacity={0.35}
            strokeWidth={1.4}
          />
        ) : null,
      )}
      <circle cx={size / 2} cy={size / 2} r={earthR} fill='url(#orbit-earth)' />
      {segments.map(({ a, b }, i) =>
        a.depth <= 0 ? (
          <line
            key={`f${i}`}
            x1={a.sx}
            y1={a.sy}
            x2={b.sx}
            y2={b.sy}
            stroke='var(--chart-warm)'
            strokeWidth={2}
          />
        ) : null,
      )}
      {cur && !hidden(cur) && <circle cx={cur.sx} cy={cur.sy} r={5} fill='#fff' />}
    </svg>
  );
}
