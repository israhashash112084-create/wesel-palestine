/**
 * Generates candidate detour waypoints around a checkpoint.
 * The points are created relative to the route direction:
 * left, right, before, after.
 *
 * @param {{ lat: number, lng: number }} from
 * @param {{ lat: number, lng: number }} to
 * @param {{ latitude: number|string, longitude: number|string }} checkpoint
 * @param {number} offsetKm
 * @returns {Array<{ lat: number, lng: number }>}
 */
export const generateDetourWaypoints = (from, to, checkpoint, offsetKm = 8) => {
  const cpLat = Number(checkpoint.latitude);
  const cpLng = Number(checkpoint.longitude);

  const dLat = to.lat - from.lat;
  const dLng = to.lng - from.lng;
  const length = Math.sqrt(dLat ** 2 + dLng ** 2);

  if (!length) return [];

  const normLat = dLat / length;
  const normLng = dLng / length;

  // perpendicular vector
  const perpLat = -normLng;
  const perpLng = normLat;

  // rough conversion: 1 degree ≈ 111 km
  const offsetDeg = offsetKm / 111;

  return [
    {
      lat: cpLat + perpLat * offsetDeg,
      lng: cpLng + perpLng * offsetDeg,
    },
    {
      lat: cpLat - perpLat * offsetDeg,
      lng: cpLng - perpLng * offsetDeg,
    },
    {
      lat: cpLat + normLat * offsetDeg,
      lng: cpLng + normLng * offsetDeg,
    },
    {
      lat: cpLat - normLat * offsetDeg,
      lng: cpLng - normLng * offsetDeg,
    },
  ];
};