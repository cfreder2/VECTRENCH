// GENERATED FILE -- do not edit.
//
// Source of truth is levels/*.json; regenerate with `node tools/levels.mjs --sync`.
// These are the pre-built levels: authored specs rather than parsed prose, so
// they are exactly what was tuned and audited, seed included.

export const PREBUILT = [
  {
    label: "SHAKEDOWN",
    blurb: "The tutorial that is not a tutorial. Wide, bright and forgiving, with one bulkhead near the end so you meet the climb before it can kill you.",
    spec: {
      "name": "SHAKEDOWN",
      "seed": 4211,
      "speed": {
        "start": 250,
        "end": 330
      },
      "finale": "port",
      "sections": [
        {
          "name": "open approach",
          "length": 900,
          "width": 104,
          "depth": 92,
          "curviness": 0.14,
          "hilliness": 0.2,
          "roughness": 0.3,
          "obstacles": 0.35,
          "kinds": [
            "pylon"
          ],
          "turrets": 0.1,
          "wallguns": 0,
          "drones": 0.3,
          "seals": 0,
          "hue": 0.5
        },
        {
          "name": "first fangs",
          "length": 1100,
          "width": 78,
          "depth": 112,
          "curviness": 0.34,
          "hilliness": 0.3,
          "roughness": 0.42,
          "obstacles": 0.55,
          "kinds": [
            "pylon",
            "fang"
          ],
          "turrets": 0.2,
          "wallguns": 0.16,
          "drones": 0.42,
          "seals": 0,
          "hue": 0.5
        },
        {
          "name": "one bulkhead",
          "length": 1100,
          "width": 70,
          "depth": 122,
          "curviness": 0.3,
          "hilliness": 0.32,
          "roughness": 0.45,
          "obstacles": 0.5,
          "kinds": [
            "pylon",
            "fang"
          ],
          "turrets": 0.46,
          "wallguns": 0.2,
          "drones": 0.4,
          "seals": 1,
          "hue": 0.52
        }
      ]
    },
  },
  {
    label: "BULKHEAD RUN",
    blurb: "The brief this game was built to. A wide mouth that narrows for the rest of your life, sealed three times, with the surface guns waiting every time you are forced over the rim.",
    spec: {
      "name": "BULKHEAD RUN",
      "seed": 90210,
      "speed": {
        "start": 300,
        "end": 470
      },
      "finale": "port",
      "sections": [
        {
          "name": "wide mouth",
          "length": 800,
          "width": 112,
          "depth": 128,
          "curviness": 0.2,
          "hilliness": 0.28,
          "roughness": 0.4,
          "obstacles": 0.36,
          "kinds": [
            "pylon",
            "fang"
          ],
          "turrets": 0.2,
          "wallguns": 0.14,
          "drones": 0.26,
          "seals": 0,
          "hue": 0.13
        },
        {
          "name": "the narrows",
          "length": 1400,
          "width": 56,
          "depth": 150,
          "curviness": 0.6,
          "hilliness": 0.44,
          "roughness": 0.55,
          "obstacles": 0.66,
          "kinds": [
            "pylon",
            "fang",
            "gate"
          ],
          "turrets": 0.36,
          "wallguns": 0.42,
          "drones": 0.3,
          "seals": 1,
          "hue": 0.12
        },
        {
          "name": "sealed deep",
          "length": 1800,
          "width": 48,
          "depth": 168,
          "curviness": 0.68,
          "hilliness": 0.5,
          "roughness": 0.6,
          "obstacles": 0.62,
          "kinds": [
            "fang",
            "gate",
            "ring"
          ],
          "turrets": 0.68,
          "wallguns": 0.38,
          "drones": 0.24,
          "seals": 2,
          "hue": 0.1
        },
        {
          "name": "the choke",
          "length": 900,
          "width": 38,
          "depth": 148,
          "curviness": 0.48,
          "hilliness": 0.35,
          "roughness": 0.5,
          "obstacles": 0.58,
          "kinds": [
            "ring",
            "gate"
          ],
          "turrets": 0.3,
          "wallguns": 0.48,
          "drones": 0.2,
          "seals": 0,
          "hue": 0.08
        }
      ]
    },
  },
  {
    label: "REACTOR",
    blurb: "Everything at once, on fire, at speed. Staggered slabs, an iris chain, four bulkheads and a core that will not open until you hold the lock.",
    spec: {
      "name": "REACTOR",
      "seed": 66613,
      "speed": {
        "start": 380,
        "end": 560
      },
      "finale": "port",
      "sections": [
        {
          "name": "descent",
          "length": 1000,
          "width": 62,
          "depth": 168,
          "curviness": 0.5,
          "hilliness": 0.58,
          "roughness": 0.68,
          "obstacles": 0.75,
          "kinds": [
            "stack",
            "pylon"
          ],
          "turrets": 0.3,
          "wallguns": 0.48,
          "drones": 0.5,
          "seals": 1,
          "hue": 0.02
        },
        {
          "name": "slab gauntlet",
          "length": 1800,
          "width": 46,
          "depth": 186,
          "curviness": 0.72,
          "hilliness": 0.58,
          "roughness": 0.65,
          "obstacles": 0.95,
          "kinds": [
            "stack",
            "gate",
            "fang"
          ],
          "turrets": 0.5,
          "wallguns": 0.56,
          "drones": 0.6,
          "seals": 2,
          "hue": 0.01
        },
        {
          "name": "iris chain",
          "length": 1300,
          "width": 40,
          "depth": 196,
          "curviness": 0.78,
          "hilliness": 0.46,
          "roughness": 0.55,
          "obstacles": 0.9,
          "kinds": [
            "ring",
            "gate"
          ],
          "turrets": 0.58,
          "wallguns": 0.52,
          "drones": 0.55,
          "seals": 1,
          "hue": 0.04
        },
        {
          "name": "core approach",
          "length": 800,
          "width": 34,
          "depth": 176,
          "curviness": 0.42,
          "hilliness": 0.3,
          "roughness": 0.45,
          "obstacles": 0.62,
          "kinds": [
            "ring"
          ],
          "turrets": 0.4,
          "wallguns": 0.58,
          "drones": 0.4,
          "seals": 0,
          "hue": 0
        }
      ]
    },
  },
];
