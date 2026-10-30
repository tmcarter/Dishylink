import { describe, expect, it } from "vitest";
import { sampleOrbit, splitAtAntimeridian, EARTH_RADIUS_KM } from "./orbitPath";

// ISS (ZARYA), a well-known element set.
const ISS = {
  name: "ISS (ZARYA)",
  line1: "1 25544U 98067A   24001.50000000  .00016717  00000-0  30306-3 0  9995",
  line2: "2 25544  51.6416 247.4627 0006703 130.5360 325.0288 15.50377579432561",
};
const at = new Date("2024-01-01T12:00:00Z");

describe("sampleOrbit", () => {
  const orbit = sampleOrbit(ISS, at, 120)!;

  it("covers one period and closes the loop", () => {
    expect(orbit.samples).toHaveLength(121);
    expect(orbit.samples[120]).toBe(orbit.samples[0]);
    expect(orbit.periodMin).toBeGreaterThan(90);
    expect(orbit.periodMin).toBeLessThan(95);
  });

  it("reports the orbital elements", () => {
    expect(orbit.inclinationDeg).toBeCloseTo(51.64, 1);
    expect(orbit.apogeeKm).toBeGreaterThan(orbit.perigeeKm);
    expect(orbit.perigeeKm).toBeGreaterThan(350);
    expect(orbit.apogeeKm).toBeLessThan(450);
  });

  it("keeps every sample in orbit and within the inclination band", () => {
    for (const s of orbit.samples) {
      const r = Math.hypot(...s.eci);
      expect(r - EARTH_RADIUS_KM).toBeGreaterThan(300);
      expect(Math.abs(s.latDeg)).toBeLessThanOrEqual(orbit.inclinationDeg + 0.5);
    }
  });

  it("splits the ground track at the antimeridian", () => {
    const runs = splitAtAntimeridian(orbit.samples);
    for (const run of runs) {
      for (let i = 1; i < run.length; i++) {
        expect(Math.abs(run[i].lonDeg - run[i - 1].lonDeg)).toBeLessThan(180);
      }
    }
  });
});
