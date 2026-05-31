import { createServerFn } from "@tanstack/react-start";
import {
	decodeRapidoToken,
	filterRidesByDateRange,
	isPageOlderThanRangeStart,
	normalizeRapidoOrder,
	type RapidoOrder,
	stripBearerPrefix,
} from "@/providers/rapido-normalize";
import type { NormalizedRide, ProviderUser } from "@/providers/types";

const RAPIDO_ORDER_URL = "https://m.rapido.bike/pwa/api/order";
const PAGE_SIZE = 50;
/** Safety cap so a bad response can never loop forever. */
const MAX_PAGES = 100;

/**
 * Rapido credentials stored in the browser: just the Bearer JWT.
 */
export interface RapidoAuthCredentials {
	token: string;
}

class RapidoAPIError extends Error {
	constructor(
		public status: number,
		message: string,
	) {
		super(message);
		this.name = "RapidoAPIError";
	}
}

interface RapidoOrderResponse {
	data?: {
		data?: {
			orders?: RapidoOrder[];
			meta?: { totalCount?: number };
		};
	};
}

/**
 * Build the static + dynamic headers Rapido's PWA API expects.
 */
function buildHeaders(token: string, customerId: string): HeadersInit {
	return {
		accept: "application/json, text/plain, */*",
		"content-type": "application/json",
		appid: "2",
		appversion: "214",
		authorization: `Bearer ${stripBearerPrefix(token)}`,
		"x-consumer-username": `${customerId}:`,
		"channel-entity": "customer",
		"channel-name": "pwa",
		"channel-host": "browser",
		user: JSON.stringify({ _id: customerId }),
	};
}

/**
 * Fetch one page of orders from Rapido.
 */
async function fetchOrderPage(
	token: string,
	customerId: string,
	offset: number,
): Promise<{ orders: RapidoOrder[]; totalCount: number }> {
	const response = await fetch(RAPIDO_ORDER_URL, {
		method: "POST",
		headers: buildHeaders(token, customerId),
		body: JSON.stringify({ customerId, limit: PAGE_SIZE, offset }),
	});

	if (!response.ok) {
		throw new RapidoAPIError(
			response.status,
			`Rapido API error: ${response.status} ${response.statusText}`,
		);
	}

	const body = (await response.json()) as RapidoOrderResponse;
	const orders = body.data?.data?.orders ?? [];
	const totalCount = body.data?.data?.meta?.totalCount ?? orders.length;
	return { orders, totalCount };
}

/**
 * Validate a Rapido token and resolve the current user.
 */
export const fetchRapidoUser = createServerFn({ method: "POST" })
	.inputValidator((data: { auth: RapidoAuthCredentials }) => {
		if (!data.auth?.token) {
			throw new Error("Rapido token is required");
		}
		return data;
	})
	.handler(
		async ({
			data,
		}): Promise<{ user: ProviderUser | null; error?: string }> => {
			const decoded = decodeRapidoToken(data.auth.token);
			if (!decoded) {
				return {
					user: null,
					error: "Token is invalid. Paste a fresh Bearer token from Rapido.",
				};
			}
			return {
				user: {
					firstName: decoded.firstName,
					lastName: decoded.lastName,
					email: decoded.email,
				},
			};
		},
	);

/**
 * Fetch all orders within an optional date range, normalized to NormalizedRide.
 * Paginates by offset (newest-first) and stops once the requested range start
 * is passed or all orders have been retrieved.
 */
export const fetchRapidoOrders = createServerFn({ method: "POST" })
	.inputValidator(
		(data: { auth: RapidoAuthCredentials; fromMs?: number; toMs?: number }) => {
			if (!data.auth?.token) {
				throw new Error("Rapido token is required");
			}
			return data;
		},
	)
	.handler(
		async ({
			data,
		}): Promise<{
			rides: NormalizedRide[];
			error?: string;
			status?: number;
		}> => {
			const decoded = decodeRapidoToken(data.auth.token);
			if (!decoded) {
				return {
					rides: [],
					error: "Token is invalid. Paste a fresh Bearer token from Rapido.",
				};
			}

			try {
				const allOrders: RapidoOrder[] = [];
				let offset = 0;

				for (let page = 0; page < MAX_PAGES; page++) {
					const { orders, totalCount } = await fetchOrderPage(
						data.auth.token,
						decoded.customerId,
						offset,
					);

					allOrders.push(...orders);

					// Stop: no more orders, all retrieved, or page predates range start.
					if (orders.length === 0) break;
					if (allOrders.length >= totalCount) break;
					if (isPageOlderThanRangeStart(orders, data.fromMs)) break;

					offset += PAGE_SIZE;
				}

				const rides = filterRidesByDateRange(
					allOrders.map(normalizeRapidoOrder),
					{
						from: data.fromMs ? new Date(data.fromMs) : undefined,
						to: data.toMs ? new Date(data.toMs) : undefined,
					},
				);

				return { rides };
			} catch (error) {
				console.error("Failed to fetch Rapido orders:", error);
				const status =
					error instanceof RapidoAPIError ? error.status : undefined;
				return {
					rides: [],
					error: error instanceof Error ? error.message : "Unknown error",
					status,
				};
			}
		},
	);
