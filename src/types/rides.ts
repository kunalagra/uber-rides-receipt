/**
 * Core ride data interface representing a single Uber trip.
 * This interface matches the structure expected from Uber's GraphQL API.
 */
export interface RideData {
	/** Unique identifier for the ride */
	rideId: string;
	/** ISO timestamp when the ride started */
	startTime: string;
	/** ISO timestamp when the ride ended */
	endTime: string;
	/** Pickup location address */
	startLocation: string;
	/** Dropoff location address */
	endLocation: string;
	/** Total fare amount */
	totalAmount: number;
	/** Currency code (e.g., 'USD', 'EUR') */
	currency: string;
	/** Name of the driver */
	driverName: string;
	/** Vehicle type (e.g., 'UberX', 'Auto', 'Moto') */
	vehicleType?: string;
	/** Ride status (e.g., 'COMPLETED', 'CANCELED') */
	status?: string;
	/** URL to download the PDF receipt */
	invoiceUrl: string;
}

/**
 * Request parameters for fetching rides
 */
export interface FetchRidesRequest {
	/** Start of date range (ISO string) */
	startDate: string;
	/** End of date range (ISO string) */
	endDate: string;
}

/**
 * Response from the rides API
 */
export interface FetchRidesResponse {
	rides: RideData[];
	/** Total number of rides in the response */
	totalCount: number;
	/** Whether there are more rides to fetch (for pagination) */
	hasMore: boolean;
}

/**
 * GraphQL query variables for Uber's internal API
 * (for future implementation with real API)
 */
export interface UberGraphQLVariables {
	startDate: string;
	endDate: string;
	cursor?: string;
	limit?: number;
}

/**
 * Headers required for Uber's internal API
 * (to be filled in when connecting to real API)
 */
export interface UberAPIHeaders {
	authorization: string;
	"x-csrf-token": string;
	cookie: string;
	"content-type": string;
}

/**
 * Summary data for selected rides
 */
export interface RidesSummary {
	selectedCount: number;
	totalAmount: number;
	currency: string;
	rides: RideData[];
}

/**
 * Date range for filtering rides
 */
export interface DateRange {
	from: Date | undefined;
	to: Date | undefined;
}
