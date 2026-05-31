import { describe, expect, test } from "bun:test";
import {
	decodeRapidoToken,
	filterRidesByDateRange,
	isPageOlderThanRangeStart,
	normalizeRapidoOrder,
	type RapidoOrder,
	stripBearerPrefix,
} from "./rapido-normalize";

// Synthetic JWT (HS256 header + fake payload + dummy signature). The decode
// path does not verify the signature, so this exercises the same code path
// as a real token without containing any real PII.
const SAMPLE_TOKEN =
	"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiIwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAiLCJmaXJzdE5hbWUiOiJUZXN0IiwibGFzdE5hbWUiOiJVc2VyIiwibW9iaWxlIjoiMDAwMDAwMDAwMCIsImVtYWlsIjoidGVzdEBleGFtcGxlLmNvbSIsInJvbGVzIjpbImN1c3RvbWVyIl0sInVzZXJJZCI6IjAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMCIsInNvdXJjZSI6InB3YSIsImlhdCI6MTcwMDAwMDAwMCwiaXNzIjoidGVzdC1pc3N1ZXIifQ.signature";

describe("stripBearerPrefix", () => {
	test("removes a case-insensitive 'Bearer ' prefix and trims", () => {
		expect(stripBearerPrefix("Bearer abc.def.ghi")).toBe("abc.def.ghi");
		expect(stripBearerPrefix("  bearer   abc.def.ghi  ")).toBe("abc.def.ghi");
	});

	test("leaves a raw token unchanged", () => {
		expect(stripBearerPrefix("abc.def.ghi")).toBe("abc.def.ghi");
	});
});

describe("decodeRapidoToken", () => {
	test("extracts customerId and user fields from the JWT payload", () => {
		const decoded = decodeRapidoToken(SAMPLE_TOKEN);
		expect(decoded).toEqual({
			customerId: "000000000000000000000000",
			firstName: "Test",
			lastName: "User",
			email: "test@example.com",
			mobile: "0000000000",
		});
	});

	test("tolerates a leading 'Bearer ' prefix", () => {
		const decoded = decodeRapidoToken(`Bearer ${SAMPLE_TOKEN}`);
		expect(decoded?.customerId).toBe("000000000000000000000000");
	});

	test("returns null for a malformed token", () => {
		expect(decodeRapidoToken("not-a-jwt")).toBeNull();
		expect(decodeRapidoToken("")).toBeNull();
	});

	test("returns null when payload has no customerId", () => {
		// header.payload.sig where payload = base64url({"foo":"bar"})
		const payload = btoa(JSON.stringify({ foo: "bar" }))
			.replace(/\+/g, "-")
			.replace(/\//g, "_")
			.replace(/=+$/, "");
		expect(decodeRapidoToken(`h.${payload}.s`)).toBeNull();
	});
});

// Synthetic fixtures mirroring the API response shape (no real PII).
const droppedRide: RapidoOrder = {
	_id: "aaaaaaaaaaaaaaaaaaaaaaaa",
	createdOn: 1778232081797,
	lastModifiedOn: 1778233136936,
	amount: 75,
	status: "dropped",
	serviceName: "Auto",
	pickupLocation: { address: "1 Pickup Road, Example City" },
	dropLocation: { address: "2 Dropoff Road, Example City" },
	rider: { name: "Driver One" },
};

const cancelled: RapidoOrder = {
	_id: "bbbbbbbbbbbbbbbbbbbbbbbb",
	createdOn: 1777892260161,
	lastModifiedOn: 1777892467356,
	amount: 0,
	status: "customerCancelled",
	serviceName: "Auto",
	pickupLocation: { address: "1 Pickup Road, Example City" },
	dropLocation: { address: "3 Other Road, Example City" },
	rider: { name: "" },
};

describe("normalizeRapidoOrder", () => {
	test("maps a completed ride to a NormalizedRide", () => {
		expect(normalizeRapidoOrder(droppedRide)).toEqual({
			rideId: "aaaaaaaaaaaaaaaaaaaaaaaa",
			startTime: new Date(1778232081797).toISOString(),
			endTime: new Date(1778233136936).toISOString(),
			startLocation: "1 Pickup Road, Example City",
			endLocation: "2 Dropoff Road, Example City",
			totalAmount: 75,
			currency: "INR",
			driverName: "Driver One",
			vehicleType: "Auto",
			status: "COMPLETED",
			mapUrl: "",
			isAutoRide: false,
			provider: "rapido",
		});
	});

	test("maps a customerCancelled ride to CANCELLED with zero amount", () => {
		const ride = normalizeRapidoOrder(cancelled);
		expect(ride.status).toBe("CANCELLED");
		expect(ride.totalAmount).toBe(0);
	});
});

describe("filterRidesByDateRange", () => {
	const rides = [droppedRide, cancelled].map(normalizeRapidoOrder);
	// droppedRide = 2026-05-08, cancelled = 2026-05-04 (createdOn epochs above)

	test("includes only rides within [from, to] inclusive of the full day", () => {
		const result = filterRidesByDateRange(rides, {
			from: new Date("2026-05-07T00:00:00Z"),
			to: new Date("2026-05-09T00:00:00Z"),
		});
		expect(result.map((r) => r.rideId)).toEqual(["aaaaaaaaaaaaaaaaaaaaaaaa"]);
	});

	test("returns all rides when range has no bounds", () => {
		expect(
			filterRidesByDateRange(rides, { from: undefined, to: undefined }),
		).toHaveLength(2);
	});
});

describe("isPageOlderThanRangeStart", () => {
	test("true when the oldest order in the page predates the range start", () => {
		// page oldest = cancelled (2026-05-04); start = 2026-05-06
		expect(
			isPageOlderThanRangeStart(
				[droppedRide, cancelled],
				new Date("2026-05-06T00:00:00Z").getTime(),
			),
		).toBe(true);
	});

	test("false when no range start is given", () => {
		expect(isPageOlderThanRangeStart([droppedRide, cancelled], undefined)).toBe(
			false,
		);
	});

	test("false for an empty page", () => {
		expect(isPageOlderThanRangeStart([], 123)).toBe(false);
	});
});
