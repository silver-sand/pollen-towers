export function floorY(floorIndex, floorHeight = 2.5) {
  return 1 + floorIndex * floorHeight;
}

// Roof slab center. Walls are `floorHeight - 0.3` tall, so the roof must clear
// the top floor's wall top by more than the slab's half thickness to avoid
// coincident faces (z-fighting). `floorHeight + 0.1` keeps a 0.2 gap.
export function roofY(floorCount, floorHeight = 2.5) {
  return floorY(floorCount - 1, floorHeight) + floorHeight + 0.1;
}

export function stepFloor(currentFloor, direction, totalFloors) {
  return Math.max(0, Math.min(totalFloors - 1, currentFloor + direction));
}
