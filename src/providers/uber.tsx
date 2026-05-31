import { endOfDay, startOfDay } from "date-fns";
import { Car } from "lucide-react";
import {
	fetchActivities,
	fetchCurrentUser,
	fetchMultipleReceiptPdfs,
	fetchMultipleTripDetails,
} from "@/server/uber-api";
import type { DateRange } from "@/types/rides";
import type { TransformedRide, UberAuthCredentials } from "@/types/uber-api";
import type {
	ConnectResult,
	NormalizedRide,
	ProviderDescriptor,
} from "./types";

const TRIP_DETAIL_BATCH_SIZE = 10;

const instructions = (
	<>
		<strong>How to get your cookies:</strong>
		<ol className="mt-2 ml-4 list-decimal space-y-1 text-sm">
			<li>
				Open{" "}
				<a
					href="https://riders.uber.com/trips"
					target="_blank"
					rel="noopener noreferrer"
					className="underline text-primary"
				>
					riders.uber.com/trips
				</a>{" "}
				and log in
			</li>
			<li>Open Developer Tools (F12 or Cmd+Option+I)</li>
			<li>Go to the Network tab</li>
			<li>Refresh the page</li>
			<li>
				Click on any "graphql" request and copy the "cookie" header value under
				the Request Header
			</li>
		</ol>
	</>
);

const withProvider = (ride: TransformedRide): NormalizedRide => ({
	...ride,
	provider: "uber",
});

export const uberProvider: ProviderDescriptor = {
	id: "uber",
	name: "Uber",
	icon: Car,
	authStorageKey: "uber_auth",
	capabilities: {
		receiptPdf: true,
		serverDateFilter: true,
	},
	auth: {
		instructions,
		fields: [
			{
				key: "cookie",
				label: "Cookie Header",
				placeholder: "Paste your cookie header value here...",
				type: "textarea",
			},
		],
	},

	async connect(input): Promise<ConnectResult> {
		const cookie = input.cookie?.trim();
		if (!cookie) {
			return { error: "Cookie is required" };
		}
		const auth: UberAuthCredentials = { cookie, csrfToken: "x" };
		const result = await fetchCurrentUser({ data: { auth } });
		if (result.error || !result.user) {
			if (result.status === 404) {
				return {
					error:
						"Authentication failed. Your cookie may be invalid or expired. Please get a fresh cookie from Uber.",
					status: 404,
				};
			}
			return {
				error: result.error || "Failed to authenticate.",
				status: result.status,
			};
		}
		const { user } = result;
		return {
			auth,
			user: {
				firstName: user.firstName,
				lastName: user.lastName,
				email: user.email,
				pictureUrl: user.pictureUrl,
			},
		};
	},

	async restoreUser(auth) {
		const credentials = auth as UberAuthCredentials;
		const result = await fetchCurrentUser({ data: { auth: credentials } });
		if (result.error || !result.user) {
			return {
				error: result.error || "Session expired.",
				status: result.status,
			};
		}
		const { user } = result;
		return {
			user: {
				firstName: user.firstName,
				lastName: user.lastName,
				email: user.email,
				pictureUrl: user.pictureUrl,
			},
		};
	},

	async fetchRides(
		auth,
		range: DateRange,
		onProgress,
	): Promise<NormalizedRide[]> {
		const credentials = auth as UberAuthCredentials;
		const startTimeMs = startOfDay(range.from ?? new Date()).getTime();
		const endTimeMs = endOfDay(range.to ?? new Date()).getTime();

		// Step 1: page through activities (server filters by date range).
		const allActivities: TransformedRide[] = [];
		let pageToken: string | undefined;
		let pageCount = 0;

		while (true) {
			pageCount++;
			onProgress?.(
				`Fetching activities (page ${pageCount}, ${allActivities.length} rides)...`,
			);

			const result = await fetchActivities({
				data: {
					auth: credentials,
					limit: 50,
					nextPageToken: pageToken,
					startTimeMs,
					endTimeMs,
				},
			});

			if (result.error) {
				console.error("Failed to fetch activities:", result.error);
				break;
			}

			allActivities.push(...result.activities);

			if (!result.nextPageToken) break;
			pageToken = result.nextPageToken;
		}

		if (allActivities.length === 0) return [];

		// Step 2: enrich with trip details in batches.
		const tripUUIDs = allActivities.map((a) => a.rideId);
		const enriched: TransformedRide[] = [];

		for (let i = 0; i < tripUUIDs.length; i += TRIP_DETAIL_BATCH_SIZE) {
			const batch = tripUUIDs.slice(i, i + TRIP_DETAIL_BATCH_SIZE);
			onProgress?.(
				`Fetching trip details (${Math.min(
					i + TRIP_DETAIL_BATCH_SIZE,
					tripUUIDs.length,
				)}/${tripUUIDs.length})...`,
			);

			const detailsResult = await fetchMultipleTripDetails({
				data: { auth: credentials, tripUUIDs: batch },
			});

			if (detailsResult.rides.length > 0) {
				enriched.push(...detailsResult.rides);
			} else {
				// Fall back to basic activity rows for this batch.
				enriched.push(...allActivities.filter((a) => batch.includes(a.rideId)));
			}
		}

		return enriched.map(withProvider);
	},

	async fetchReceiptPdfs(auth, rides) {
		const credentials = auth as UberAuthCredentials;
		const { pdfs } = await fetchMultipleReceiptPdfs({
			data: {
				auth: credentials,
				trips: rides.map((ride) => ({
					tripUUID: ride.rideId,
					isAutoRide: ride.isAutoRide,
				})),
			},
		});
		return pdfs;
	},
};
