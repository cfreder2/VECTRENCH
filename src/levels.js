// GENERATED FILE -- do not edit.
//
// Source of truth is levels/*.json; regenerate with `node tools/levels.mjs --sync`.
// These are the pre-built levels: authored specs rather than parsed prose, so
// they are exactly what was tuned and audited, seed included.

export const PREBUILT = [
  {
    label: "SHAKEDOWN",
    blurb: "The first minute of this game. It opens almost empty and wide on purpose: nothing shoots at you until you have flown a while, and the one bulkhead waits until you have already learned to climb.",
    spec: {
      "name": "SHAKEDOWN",
      "seed": 4211,
      "speed": {
        "start": 230,
        "end": 300
      },
      "finale": "port",
      "sections": [
        {
          "name": "open approach",
          "length": 3000,
          "width": 112,
          "depth": 88,
          "curviness": 0.08,
          "hilliness": 0.15,
          "roughness": 0.3,
          "obstacles": 0.1,
          "kinds": [
            "pylon"
          ],
          "turrets": 0,
          "wallguns": 0,
          "drones": 0.15,
          "seals": 0,
          "hue": 0.5
        },
        {
          "name": "first columns",
          "length": 3000,
          "width": 100,
          "depth": 96,
          "curviness": 0.18,
          "hilliness": 0.22,
          "roughness": 0.36,
          "obstacles": 0.22,
          "kinds": [
            "pylon"
          ],
          "turrets": 0.1,
          "wallguns": 0,
          "drones": 0.25,
          "seals": 0,
          "hue": 0.5
        },
        {
          "name": "the bend",
          "length": 3000,
          "width": 88,
          "depth": 108,
          "curviness": 0.38,
          "hilliness": 0.3,
          "roughness": 0.42,
          "obstacles": 0.3,
          "kinds": [
            "pylon",
            "fang"
          ],
          "turrets": 0.18,
          "wallguns": 0.12,
          "drones": 0.28,
          "seals": 0,
          "hue": 0.51
        },
        {
          "name": "hanging fangs",
          "length": 3000,
          "width": 80,
          "depth": 116,
          "curviness": 0.42,
          "hilliness": 0.35,
          "roughness": 0.46,
          "obstacles": 0.38,
          "kinds": [
            "pylon",
            "fang"
          ],
          "turrets": 0.25,
          "wallguns": 0.2,
          "drones": 0.3,
          "seals": 0,
          "hue": 0.51
        },
        {
          "name": "one bulkhead",
          "length": 3000,
          "width": 74,
          "depth": 124,
          "curviness": 0.36,
          "hilliness": 0.32,
          "roughness": 0.45,
          "obstacles": 0.3,
          "kinds": [
            "pylon",
            "fang"
          ],
          "turrets": 0.5,
          "wallguns": 0.18,
          "drones": 0.25,
          "seals": 1,
          "hue": 0.52
        },
        {
          "name": "run to the port",
          "length": 3000,
          "width": 68,
          "depth": 120,
          "curviness": 0.4,
          "hilliness": 0.3,
          "roughness": 0.45,
          "obstacles": 0.36,
          "kinds": [
            "fang",
            "gate"
          ],
          "turrets": 0.3,
          "wallguns": 0.3,
          "drones": 0.2,
          "seals": 0,
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
        "start": 260,
        "end": 430
      },
      "finale": "port",
      "sections": [
        {
          "name": "wide mouth",
          "length": 4350,
          "width": 118,
          "depth": 110,
          "curviness": 0.12,
          "hilliness": 0.2,
          "roughness": 0.35,
          "obstacles": 0.12,
          "kinds": [
            "pylon"
          ],
          "turrets": 0.05,
          "wallguns": 0,
          "drones": 0.2,
          "seals": 0,
          "hue": 0.13
        },
        {
          "name": "first narrowing",
          "length": 4350,
          "width": 96,
          "depth": 128,
          "curviness": 0.3,
          "hilliness": 0.28,
          "roughness": 0.45,
          "obstacles": 0.26,
          "kinds": [
            "pylon",
            "fang"
          ],
          "turrets": 0.15,
          "wallguns": 0.12,
          "drones": 0.25,
          "seals": 0,
          "hue": 0.13
        },
        {
          "name": "the narrows",
          "length": 4350,
          "width": 74,
          "depth": 145,
          "curviness": 0.5,
          "hilliness": 0.4,
          "roughness": 0.52,
          "obstacles": 0.4,
          "kinds": [
            "pylon",
            "fang",
            "gate"
          ],
          "turrets": 0.3,
          "wallguns": 0.3,
          "drones": 0.3,
          "seals": 1,
          "hue": 0.12
        },
        {
          "name": "deep water",
          "length": 4350,
          "width": 62,
          "depth": 158,
          "curviness": 0.62,
          "hilliness": 0.45,
          "roughness": 0.58,
          "obstacles": 0.48,
          "kinds": [
            "fang",
            "gate"
          ],
          "turrets": 0.45,
          "wallguns": 0.4,
          "drones": 0.28,
          "seals": 1,
          "hue": 0.11
        },
        {
          "name": "sealed deep",
          "length": 4350,
          "width": 54,
          "depth": 168,
          "curviness": 0.66,
          "hilliness": 0.48,
          "roughness": 0.6,
          "obstacles": 0.44,
          "kinds": [
            "fang",
            "gate",
            "ring"
          ],
          "turrets": 0.6,
          "wallguns": 0.35,
          "drones": 0.24,
          "seals": 1,
          "hue": 0.1
        },
        {
          "name": "the choke",
          "length": 4350,
          "width": 44,
          "depth": 156,
          "curviness": 0.5,
          "hilliness": 0.35,
          "roughness": 0.52,
          "obstacles": 0.5,
          "kinds": [
            "ring",
            "gate"
          ],
          "turrets": 0.35,
          "wallguns": 0.45,
          "drones": 0.2,
          "seals": 0,
          "hue": 0.09
        },
        {
          "name": "last light",
          "length": 4350,
          "width": 40,
          "depth": 150,
          "curviness": 0.42,
          "hilliness": 0.3,
          "roughness": 0.48,
          "obstacles": 0.45,
          "kinds": [
            "ring"
          ],
          "turrets": 0.3,
          "wallguns": 0.4,
          "drones": 0.18,
          "seals": 0,
          "hue": 0.08
        }
      ]
    },
  },
  {
    label: "REACTOR",
    blurb: "Everything at once, on fire, at speed. It still starts gently -- then staggered slabs, an iris chain, four bulkheads, and a core that will not open until you hold the lock.",
    spec: {
      "name": "REACTOR",
      "seed": 66613,
      "speed": {
        "start": 300,
        "end": 500
      },
      "finale": "port",
      "sections": [
        {
          "name": "the descent",
          "length": 5200,
          "width": 100,
          "depth": 130,
          "curviness": 0.15,
          "hilliness": 0.3,
          "roughness": 0.5,
          "obstacles": 0.14,
          "kinds": [
            "pylon"
          ],
          "turrets": 0.08,
          "wallguns": 0,
          "drones": 0.25,
          "seals": 0,
          "hue": 0.02
        },
        {
          "name": "into the red",
          "length": 5200,
          "width": 82,
          "depth": 150,
          "curviness": 0.35,
          "hilliness": 0.45,
          "roughness": 0.6,
          "obstacles": 0.3,
          "kinds": [
            "pylon",
            "stack"
          ],
          "turrets": 0.2,
          "wallguns": 0.2,
          "drones": 0.3,
          "seals": 0,
          "hue": 0.02
        },
        {
          "name": "slab field",
          "length": 5200,
          "width": 66,
          "depth": 168,
          "curviness": 0.5,
          "hilliness": 0.55,
          "roughness": 0.65,
          "obstacles": 0.45,
          "kinds": [
            "stack",
            "pylon"
          ],
          "turrets": 0.3,
          "wallguns": 0.35,
          "drones": 0.35,
          "seals": 1,
          "hue": 0.01
        },
        {
          "name": "gauntlet",
          "length": 5200,
          "width": 56,
          "depth": 180,
          "curviness": 0.65,
          "hilliness": 0.55,
          "roughness": 0.65,
          "obstacles": 0.55,
          "kinds": [
            "stack",
            "gate",
            "fang"
          ],
          "turrets": 0.45,
          "wallguns": 0.45,
          "drones": 0.35,
          "seals": 0,
          "hue": 0.01
        },
        {
          "name": "sealed core",
          "length": 5200,
          "width": 50,
          "depth": 192,
          "curviness": 0.7,
          "hilliness": 0.5,
          "roughness": 0.6,
          "obstacles": 0.5,
          "kinds": [
            "gate",
            "fang",
            "ring"
          ],
          "turrets": 0.62,
          "wallguns": 0.42,
          "drones": 0.3,
          "seals": 2,
          "hue": 0.01
        },
        {
          "name": "iris chain",
          "length": 5200,
          "width": 44,
          "depth": 196,
          "curviness": 0.75,
          "hilliness": 0.45,
          "roughness": 0.55,
          "obstacles": 0.55,
          "kinds": [
            "ring",
            "gate"
          ],
          "turrets": 0.55,
          "wallguns": 0.5,
          "drones": 0.28,
          "seals": 0,
          "hue": 0.04
        },
        {
          "name": "last bulkhead",
          "length": 5200,
          "width": 40,
          "depth": 190,
          "curviness": 0.6,
          "hilliness": 0.4,
          "roughness": 0.55,
          "obstacles": 0.5,
          "kinds": [
            "ring",
            "gate"
          ],
          "turrets": 0.6,
          "wallguns": 0.5,
          "drones": 0.26,
          "seals": 1,
          "hue": 0.03
        },
        {
          "name": "core approach",
          "length": 5200,
          "width": 36,
          "depth": 180,
          "curviness": 0.42,
          "hilliness": 0.3,
          "roughness": 0.45,
          "obstacles": 0.42,
          "kinds": [
            "ring"
          ],
          "turrets": 0.4,
          "wallguns": 0.5,
          "drones": 0.22,
          "seals": 0,
          "hue": 0
        }
      ]
    },
  },
];
