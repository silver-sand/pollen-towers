export function floorY(floorIndex, floorHeight = 2.5) {
  return 1 + floorIndex * floorHeight;
}

export function roofY(floorCount, floorHeight = 2.5, slabOffset = 2.4) {
  return floorY(floorCount - 1, floorHeight) + slabOffset;
}

export function stepFloor(currentFloor, direction, totalFloors) {
  return Math.max(0, Math.min(totalFloors - 1, currentFloor + direction));
}
