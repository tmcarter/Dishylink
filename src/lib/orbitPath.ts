// One satellite's full orbit, sampled from its TLE with SGP4.
//
// The orbit is sampled across exactly one period starting at `at`, and the
// loop is closed by repeating the first point, so the inertial (ECI) samples
// trace the true ellipse while the geodetic samples trace the ground track
// the Earth's rotation smears it into.

import * as satelliteJs from "satellite.js";
import type { TleRecord } from "./satellites";

export const EARTH_RADIUS_KM = 6378.137;
const RAD = 180 / Math.PI;

export interface OrbitSample {
  timeMs: number;
  /** ECI position, km. */
  eci: [number, number, number];
  latDeg: number;
  lonDeg: number;
  altitudeKm: number;
}

export interface OrbitPath {
  name: string;
  periodMin: number;
  inclinationDeg: number;
  eccentricity: number;
  apogeeKm: number;
  perigeeKm: number;
  /** N samples plus the closing repeat of the first. */
  samples: OrbitSample[];
  current: OrbitSample;
}

export function satrecFromTle(tle: TleRecord): satelliteJs.SatRec {
  return satelliteJs.twoline2satrec(tle.line1, tle.line2);
}

function sampleAt(satrec: satelliteJs.SatRec, date: Date): OrbitSample | null {
  const pv = satelliteJs.propagate(satrec, date);
  const position = pv?.position;
  if (!position || typeof position === "boolean") return null;
  const gmst = satelliteJs.gstime(date);
  const geo = satelliteJs.eciToGeodetic(position, gmst);
  return {
    timeMs: date.getTime(),
    eci: [position.x, position.y, position.z],
    latDeg: geo.latitude * RAD,
    lonDeg: satelliteJs.degreesLong(geo.longitude),
    altitudeKm: geo.height,
  };
}

export function sampleOrbit(tle: TleRecord, at: Date = new Date(), count = 180): OrbitPath | null {
  const satrec = satrecFromTle(tle);
  // no is mean motion in rad/min.
  if (!satrec.no) return null;
  const periodMin = (2 * Math.PI) / satrec.no;
  const samples: OrbitSample[] = [];
  for (let i = 0; i < count; i++) {
    const s = sampleAt(satrec, new Date(at.getTime() + (i / count) * periodMin * 60_000));
    if (s) samples.push(s);
  }
  if (samples.length < 2) return null;
  samples.push(samples[0]);
  // Semi-major axis from mean motion (Kepler's third law), km.
  const mu = 398600.4418;
  const nRadS = satrec.no / 60;
  const a = Math.cbrt(mu / (nRadS * nRadS));
  return {
    name: tle.name,
    periodMin,
    inclinationDeg: satrec.inclo * RAD,
    eccentricity: satrec.ecco,
    apogeeKm: a * (1 + satrec.ecco) - EARTH_RADIUS_KM,
    perigeeKm: a * (1 - satrec.ecco) - EARTH_RADIUS_KM,
    samples,
    current: samples[0],
  };
}

/** Current position only — cheap enough to call every second. */
export function positionNow(tle: TleRecord, at: Date = new Date()): OrbitSample | null {
  return sampleAt(satrecFromTle(tle), at);
}

/** Splits a ground track wherever it wraps the antimeridian, so a map line
 *  does not streak across the whole chart. */
export function splitAtAntimeridian(samples: OrbitSample[]): OrbitSample[][] {
  const runs: OrbitSample[][] = [];
  let run: OrbitSample[] = [];
  for (const s of samples) {
    const prev = run[run.length - 1];
    if (prev && Math.abs(s.lonDeg - prev.lonDeg) > 180) {
      runs.push(run);
      run = [];
    }
    run.push(s);
  }
  if (run.length) runs.push(run);
  return runs;
}
