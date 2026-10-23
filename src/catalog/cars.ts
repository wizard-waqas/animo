import type { Vec2 } from "../engine/math";

/**
 * Procedural cartoon cars. Local space: forward is +Z, the car's left (driver side, US) is +X.
 * All numbers are meters.
 */
export interface CarShape {
  label: string;
  color: string;
  length: number;
  width: number;
  wheelRadius: number;
  wheelbase: number;
  bodyBottom: number;
  /** Top of the doors / bottom of the windows. */
  beltline: number;
  roof: number;
  cabinLength: number;
  /** Z center of the cabin. */
  cabinCenter: number;
  rearDoors: boolean;
  extra?: "pickup-bed" | "taxi-sign" | "spoiler" | "roof-rack" | "cargo" | "police";
}

export const CARS = {
  sedan: {
    label: "Sedan (4 doors)", color: "#e63946",
    length: 4.4, width: 1.9, wheelRadius: 0.37, wheelbase: 2.7,
    bodyBottom: 0.3, beltline: 0.95, roof: 1.68, cabinLength: 2.3, cabinCenter: -0.2, rearDoors: true,
  },
  compact: {
    label: "Compact hatchback (2 doors)", color: "#ffb703",
    length: 3.6, width: 1.78, wheelRadius: 0.34, wheelbase: 2.3,
    bodyBottom: 0.3, beltline: 0.93, roof: 1.66, cabinLength: 2.0, cabinCenter: -0.25, rearDoors: false,
  },
  suv: {
    label: "SUV (4 doors, roof rack)", color: "#2a9d8f",
    length: 4.7, width: 2.0, wheelRadius: 0.43, wheelbase: 2.85,
    bodyBottom: 0.42, beltline: 1.12, roof: 1.95, cabinLength: 3.0, cabinCenter: -0.4, rearDoors: true,
    extra: "roof-rack",
  },
  pickup: {
    label: "Pickup truck (2 doors, open bed)", color: "#457b9d",
    length: 5.3, width: 2.0, wheelRadius: 0.45, wheelbase: 3.3,
    bodyBottom: 0.45, beltline: 1.12, roof: 1.92, cabinLength: 1.7, cabinCenter: 0.55, rearDoors: false,
    extra: "pickup-bed",
  },
  van: {
    label: "Work van (2 doors, tall)", color: "#f1faee",
    length: 5.0, width: 2.0, wheelRadius: 0.39, wheelbase: 3.1,
    bodyBottom: 0.36, beltline: 1.05, roof: 2.35, cabinLength: 4.3, cabinCenter: -0.3, rearDoors: false,
    extra: "cargo",
  },
  sports: {
    label: "Sports car (2 doors, spoiler)", color: "#fb8500",
    length: 4.3, width: 1.95, wheelRadius: 0.37, wheelbase: 2.55,
    bodyBottom: 0.22, beltline: 0.76, roof: 1.42, cabinLength: 1.8, cabinCenter: -0.3, rearDoors: false,
    extra: "spoiler",
  },
  taxi: {
    label: "Taxi (sedan with roof sign)", color: "#ffd60a",
    length: 4.4, width: 1.9, wheelRadius: 0.37, wheelbase: 2.7,
    bodyBottom: 0.3, beltline: 0.95, roof: 1.68, cabinLength: 2.3, cabinCenter: -0.2, rearDoors: true,
    extra: "taxi-sign",
  },
  police: {
    label: "Police cruiser (black & white, light bar, siren)", color: "#1b1e2b",
    length: 4.6, width: 1.95, wheelRadius: 0.38, wheelbase: 2.8,
    bodyBottom: 0.3, beltline: 0.97, roof: 1.7, cabinLength: 2.3, cabinCenter: -0.2, rearDoors: true,
    extra: "police",
  },
} satisfies Record<string, CarShape>;

export type CarModel = keyof typeof CARS;
export const CAR_MODELS = Object.keys(CARS) as CarModel[];

export const SEAT_NAMES = ["driver", "passenger", "rear-left", "rear-right"] as const;
export type SeatName = (typeof SEAT_NAMES)[number];

export interface SeatLayout {
  /** Local [x, z] of the seat. */
  seat: Vec2;
  /** Height of the sitting character's hips. */
  hipHeight: number;
  /** Local [x, z] where a person stands to get in (outside the door). */
  doorStand: Vec2;
  /** +1 left side, -1 right side. */
  side: 1 | -1;
  door: { centerZ: number; length: number };
}

export const seatLayout = (shape: CarShape, seat: SeatName): SeatLayout | undefined => {
  const isRear = seat === "rear-left" || seat === "rear-right";
  if (isRear && !shape.rearDoors) return undefined;
  const side = seat === "driver" || seat === "rear-left" ? 1 : -1;
  const frontSeatZ = shape.cabinCenter + shape.cabinLength * (shape.rearDoors ? 0.17 : 0.12);
  const rearSeatZ = shape.cabinCenter - shape.cabinLength * 0.24;
  const seatZ = isRear ? rearSeatZ : frontSeatZ;
  const doorLength = Math.min(shape.cabinLength * (shape.rearDoors ? 0.44 : 0.5), 1.15);
  return {
    seat: [side * shape.width * 0.22, seatZ],
    hipHeight: shape.beltline - 0.46,
    doorStand: [side * (shape.width / 2 + 0.6), seatZ],
    side,
    door: { centerZ: seatZ + 0.12, length: doorLength },
  };
};

export const availableSeats = (shape: CarShape) => SEAT_NAMES.filter((seat) => seatLayout(shape, seat));
