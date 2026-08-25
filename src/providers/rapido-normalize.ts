import type { DateRange } from "@/types/rides";
import type { NormalizedRide } from "./types";

/**
 * Subset of a Rapido order (from POST /pwa/api/order) that we consume.
 * The real payload has many more fields; only these are needed.
 */
export interface RapidoOrder {
	_id: string;
	/** Order creation (booking) time — precedes pickup by the allocation wait. */
	createdOn: number;
	/**
	 * Last-touched timestamp. NOT a dropoff time: later mutations (payment
	 * settlement, rating) push it hours past the ride, so it is not used for
	 * endTime. Kept only because it is part of the payload we read.
	 */
	lastModifiedOn?: number;
	/**
	 * Billed ride duration in minutes (float). This is the figure Rapido itself
	 * prints on the invoice — `invoice.BODY` renders it as `Math.round(rideTime)`
	 * minutes. Populated on cancelled orders too, where it is a stale booking
	 * estimate and must be ignored.
	 */
	rideTime?: number;
	amount: number;
	status: string;
	serviceName: string;
	pickupLocation: { address: string };
	dropLocation: { address: string };
	rider: { name: string };
}

/** Decoded fields we care about from the Rapido JWT payload. */
export interface DecodedRapidoToken {
	customerId: string;
	firstName: string;
	lastName: string;
	email: string;
	mobile: string;
}

/**
 * Base64url-decode a JWT payload segment to a JSON object.
 */
function decodeJwtPayload(segment: string): Record<string, unknown> | null {
	try {
		let base64 = segment.replace(/-/g, "+").replace(/_/g, "/");
		// Pad to a multiple of 4.
		while (base64.length % 4 !== 0) {
			base64 += "=";
		}
		const json = atob(base64);
		return JSON.parse(json) as Record<string, unknown>;
	} catch {
		return null;
	}
}

/**
 * Strip a leading "Bearer " prefix (and surrounding whitespace) so a token
 * pasted straight from an Authorization header is normalized to the raw JWT.
 */
export function stripBearerPrefix(token: string): string {
	return token
		.trim()
		.replace(/^Bearer\s+/i, "")
		.trim();
}

/**
 * Decode a Rapido Bearer JWT (no signature verification) and extract the
 * customerId and user display fields. Tolerates a leading "Bearer " prefix.
 * Returns null when the token is malformed or carries no customerId.
 */
export function decodeRapidoToken(token: string): DecodedRapidoToken | null {
	if (!token) return null;
	const raw = stripBearerPrefix(token);
	const parts = raw.split(".");
	if (parts.length !== 3) return null;

	const payload = decodeJwtPayload(parts[1]);
	if (!payload) return null;

	const customerId =
		(payload._id as string) || (payload.userId as string) || "";
	if (!customerId) return null;

	return {
		customerId,
		firstName: (payload.firstName as string) || "",
		lastName: (payload.lastName as string) || "",
		email: (payload.email as string) || "",
		mobile: (payload.mobile as string) || "",
	};
}

/**
 * Derive a dropoff timestamp as booking time + billed ride duration.
 *
 * Rapido's payload carries no pickup or dropoff timestamp, so this is the
 * closest available: it runs early by the driver-allocation wait (a few
 * minutes), where the previous `lastModifiedOn` proxy ran late by hours.
 * Only completed rides get one — on cancelled orders `rideTime` is the
 * booking estimate, and Rapido omits it from their own invoice.
 */
function endTimeFor(order: RapidoOrder): string {
	if (order.status !== "dropped") return "";
	if (!order.rideTime || order.rideTime <= 0) return "";
	return new Date(order.createdOn + order.rideTime * 60_000).toISOString();
}

/**
 * Normalize a single Rapido order into the canonical NormalizedRide shape.
 */
export function normalizeRapidoOrder(order: RapidoOrder): NormalizedRide {
	return {
		rideId: order._id,
		startTime: new Date(order.createdOn).toISOString(),
		endTime: endTimeFor(order),
		startLocation: order.pickupLocation?.address || "",
		endLocation: order.dropLocation?.address || "",
		totalAmount: order.amount,
		currency: "INR",
		driverName: order.rider?.name || "",
		vehicleType: order.serviceName || "",
		status: order.status === "dropped" ? "COMPLETED" : "CANCELLED",
		mapUrl: "",
		isAutoRide: false,
		provider: "rapido",
	};
}

/**
 * Filter normalized rides to those whose startTime falls within the range.
 * `to` is treated as end-of-day so the whole selected day is included.
 */
export function filterRidesByDateRange(
	rides: NormalizedRide[],
	range: DateRange,
): NormalizedRide[] {
	const fromMs = range.from ? startOfDayMs(range.from) : undefined;
	const toMs = range.to ? endOfDayMs(range.to) : undefined;

	return rides.filter((ride) => {
		const t = new Date(ride.startTime).getTime();
		if (fromMs !== undefined && t < fromMs) return false;
		if (toMs !== undefined && t > toMs) return false;
		return true;
	});
}

/**
 * Whether the oldest order in a (newest-first) page predates the range start,
 * signalling that pagination can stop. Returns false when there is no start
 * bound or the page is empty.
 */
export function isPageOlderThanRangeStart(
	orders: RapidoOrder[],
	fromMs: number | undefined,
): boolean {
	if (fromMs === undefined) return false;
	if (orders.length === 0) return false;
	const oldest = orders[orders.length - 1];
	return oldest.createdOn < fromMs;
}

function startOfDayMs(date: Date): number {
	const d = new Date(date);
	d.setHours(0, 0, 0, 0);
	return d.getTime();
}

function endOfDayMs(date: Date): number {
	const d = new Date(date);
	d.setHours(23, 59, 59, 999);
	return d.getTime();
}
