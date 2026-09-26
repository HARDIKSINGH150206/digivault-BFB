import type { GlobeConfig } from "@/lib/client/globe";

// Four regional clusters instead of one dense blob over India: NCRB's own
// domestic network, plus international law-enforcement liaison points
// (INTERPOL-style cooperation hubs) in Europe, North America, and
// Asia-Pacific — so the globe reads as active in multiple places as it
// rotates, not just one spot.
const CITIES = {
  // India — NCRB HQ network.
  delhi: { lat: 28.6139, lng: 77.209 },
  mumbai: { lat: 19.076, lng: 72.8777 },
  bengaluru: { lat: 12.9716, lng: 77.5946 },
  chennai: { lat: 13.0827, lng: 80.2707 },
  kolkata: { lat: 22.5726, lng: 88.3639 },
  hyderabad: { lat: 17.385, lng: 78.4867 },
  guwahati: { lat: 26.1445, lng: 91.7362 },

  // Europe.
  london: { lat: 51.5072, lng: -0.1276 },
  paris: { lat: 48.8566, lng: 2.3522 },
  berlin: { lat: 52.52, lng: 13.405 },
  madrid: { lat: 40.4168, lng: -3.7038 },

  // North America.
  washington: { lat: 38.9072, lng: -77.0369 },
  newyork: { lat: 40.7128, lng: -74.006 },
  toronto: { lat: 43.6532, lng: -79.3832 },
  losangeles: { lat: 34.0522, lng: -118.2437 },

  // Asia-Pacific.
  singapore: { lat: 1.3521, lng: 103.8198 },
  tokyo: { lat: 35.6762, lng: 139.6503 },
  hongkong: { lat: 22.3193, lng: 114.1694 },
  sydney: { lat: -33.8688, lng: 151.2093 },
};

const ACCENT_COLORS = ["#4a90c4", "#3b82f6", "#60a5fa"];

function arc(order: number, from: keyof typeof CITIES, to: keyof typeof CITIES, arcAlt: number, colorIndex = 0) {
  return {
    order,
    startLat: CITIES[from].lat,
    startLng: CITIES[from].lng,
    endLat: CITIES[to].lat,
    endLng: CITIES[to].lng,
    arcAlt,
    color: ACCENT_COLORS[colorIndex % ACCENT_COLORS.length],
  };
}

export const loginGlobeArcs = [
  // India (7)
  arc(1, "delhi", "mumbai", 0.25, 0),
  arc(1, "delhi", "bengaluru", 0.35, 1),
  arc(2, "delhi", "chennai", 0.3, 2),
  arc(2, "delhi", "kolkata", 0.2, 0),
  arc(3, "delhi", "hyderabad", 0.25, 1),
  arc(3, "delhi", "guwahati", 0.3, 2),
  arc(4, "mumbai", "bengaluru", 0.2, 0),

  // Europe (5)
  arc(4, "london", "paris", 0.15, 1),
  arc(5, "london", "berlin", 0.2, 2),
  arc(5, "paris", "berlin", 0.15, 0),
  arc(6, "london", "madrid", 0.2, 1),
  arc(6, "paris", "madrid", 0.15, 2),

  // North America (4)
  arc(7, "washington", "newyork", 0.1, 0),
  arc(7, "washington", "toronto", 0.15, 1),
  arc(8, "washington", "losangeles", 0.3, 2),
  arc(8, "newyork", "toronto", 0.12, 0),

  // Asia-Pacific (5)
  arc(9, "singapore", "tokyo", 0.3, 1),
  arc(9, "singapore", "hongkong", 0.15, 2),
  arc(10, "singapore", "sydney", 0.35, 0),
  arc(10, "tokyo", "hongkong", 0.2, 1),
  arc(11, "tokyo", "sydney", 0.35, 2),

  // International liaison (3) — ties the regional clusters together.
  arc(11, "delhi", "london", 0.4, 0),
  arc(12, "delhi", "singapore", 0.35, 1),
  arc(12, "washington", "london", 0.35, 2),
];

export const loginGlobeConfig: GlobeConfig = {
  pointSize: 3.5,
  // A deep navy/indigo rather than a light sky blue — reads as "dark blue
  // that pairs with black," not a bright cyan accent competing with it.
  globeColor: "#0a1630",
  showAtmosphere: true,
  atmosphereColor: "#2f5cad",
  atmosphereAltitude: 0.22,
  emissive: "#0c1d3d",
  emissiveIntensity: 0.4,
  shininess: 0.75,
  polygonColor: "rgba(70, 120, 200, 0.9)",
  ambientLight: "#3f6bab",
  directionalLeftLight: "#ffffff",
  directionalTopLight: "#ffffff",
  pointLight: "#4a7fc4",
  ambientLightIntensity: 1.3,
  directionalLightIntensity: 1.2,
  pointLightIntensity: 1.6,
  // Pulled back from the previous pass (was arcTime 1100 / gap 6 / rings
  // 2-3) — that read as too busy in one place; slower and sparser now that
  // activity is spread across four regions.
  arcTime: 1600,
  arcLength: 0.85,
  arcDashGap: 11,
  rings: 1,
  maxRings: 2,
  // Center of India.
  initialPosition: { lat: 22.5, lng: 80 },
  autoRotate: true,
  autoRotateSpeed: 0.4,
};
