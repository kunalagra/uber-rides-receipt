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

/**
 * Whether a status means the token itself was rejected, as opposed to the
 * request merely failing. Rapido answers 401 for a bad/absent Bearer token;
 * everything else (notably transient 500s from their gateway) leaves the
 * session intact.
 */
export function isRapidoAuthStatus(status?: number): boolean {
	return status === 401 || status === 403;
}

/** Narrow an unknown thrown value to { status, message }. */
function describeError(error: unknown): { status?: number; message: string } {
	return {
		status: error instanceof RapidoAPIError ? error.status : undefined,
		message: error instanceof Error ? error.message : "Unknown error",
	};
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
	limit: number = PAGE_SIZE,
): Promise<{ orders: RapidoOrder[]; totalCount: number }> {
	const response = await fetch(RAPIDO_ORDER_URL, {
		method: "POST",
		headers: buildHeaders(token, customerId),
		body: JSON.stringify({ customerId, limit, offset }),
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
 *
 * The profile fields live in the JWT, but decoding alone proves nothing: the
 * token carries no `exp` claim, so a revoked or expired one decodes exactly
 * like a live one. The only way to know it still works is to spend a request
 * on it, so this issues the smallest possible order query (one row) and reads
 * the status. `user` is still filled from the token — on a transient failure
 * the caller keeps a usable session instead of being forced to re-auth.
 */
export const fetchRapidoUser = createServerFn({ method: "POST" })
	.validator((data: { auth: RapidoAuthCredentials }) => {
		if (!data.auth?.token) {
			throw new Error("Rapido token is required");
		}
		return data;
	})
	.handler(
		async ({
			data,
		}): Promise<{
			user: ProviderUser | null;
			error?: string;
			status?: number;
		}> => {
			const decoded = decodeRapidoToken(data.auth.token);
			if (!decoded) {
				return {
					user: null,
					error: "Token is invalid. Paste a fresh Bearer token from Rapido.",
					status: 401,
				};
			}

			const user: ProviderUser = {
				firstName: decoded.firstName,
				lastName: decoded.lastName,
				email: decoded.email,
			};

			try {
				await fetchOrderPage(data.auth.token, decoded.customerId, 0, 1);
				return { user };
			} catch (error) {
				console.error("Failed to validate Rapido token:", error);
				const { status, message } = describeError(error);
				if (isRapidoAuthStatus(status)) {
					return {
						user: null,
						error:
							"Your Rapido session has expired. Paste a fresh Bearer token.",
						status,
					};
				}
				// Reachability problem, not an auth problem — keep the session.
				return { user, error: message, status };
			}
		},
	);

/**
 * Fetch all orders within an optional date range, normalized to NormalizedRide.
 * Paginates by offset (newest-first) and stops once the requested range start
 * is passed or all orders have been retrieved.
 */
export const fetchRapidoOrders = createServerFn({ method: "POST" })
	.validator(
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
				const { status, message } = describeError(error);
				return { rides: [], error: message, status };
			}
		},
	);
