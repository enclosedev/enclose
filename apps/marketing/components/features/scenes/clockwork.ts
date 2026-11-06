// Made by scripts/renders.ts: the clock's movement and its hands, a picture of each part
// (public/renders/clockwork), each cut alike, `tall` times as tall as it is wide; how far
// each moves on it, as shares of its width, for each one of how far the clock is pulled
// apart; and where the middle of the whole is, together and pulled apart as far as
// 1.6, as shares of its width and its height.
export const CLOCKWORK = {
  "most": 1.6,
  "tall": 0.9456,
  "middle": [
    0.4413,
    0.5747
  ],
  "middleApart": [
    0.5,
    0.5
  ],
  "layers": [
    {
      "id": "seconds-hand",
      "dx": -0.0882,
      "dy": 0.0681,
      "z": -746.5955
    },
    {
      "id": "hour-hand",
      "dx": -0.155,
      "dy": 0.1126,
      "z": -711.3122
    },
    {
      "id": "minute-hand",
      "dx": -0.1744,
      "dy": 0.1321,
      "z": -687.7285
    },
    {
      "id": "front-plate",
      "dx": 0.0402,
      "dy": -0.03,
      "z": -772.4609
    },
    {
      "id": "pillars",
      "dx": 0.1516,
      "dy": -0.115,
      "z": -829.5867
    },
    {
      "id": "back-plate",
      "dx": 0.1821,
      "dy": -0.1358,
      "z": -839.9756
    },
    {
      "id": "centre-wheel",
      "dx": 0.0738,
      "dy": -0.055,
      "z": -785.4693
    },
    {
      "id": "third-wheel",
      "dx": 0.0925,
      "dy": -0.073,
      "z": -799.2871
    },
    {
      "id": "fourth-wheel",
      "dx": 0.1088,
      "dy": -0.0844,
      "z": -821.0197
    },
    {
      "id": "minute-wheel",
      "dx": -0.0481,
      "dy": 0.0341,
      "z": -741.9962
    },
    {
      "id": "hour-wheel",
      "dx": -0.0718,
      "dy": 0.0536,
      "z": -733.8371
    },
    {
      "id": "motor",
      "dx": 0.2219,
      "dy": -0.1633,
      "z": -856.399
    },
    {
      "id": "movement-screws",
      "dx": -0.0231,
      "dy": 0.0175,
      "z": -760.6602
    },
    {
      "id": "plate-screws",
      "dx": 0.2058,
      "dy": -0.1561,
      "z": -857.2706
    },
    {
      "id": "motor-screws",
      "dx": 0.2383,
      "dy": -0.1758,
      "z": -860.5601
    }
  ]
} as const
