import { createServerFn } from "@tanstack/react-start";
import {
	ACTIVITIES_QUERY,
	buildActivitiesVariables,
	CURRENT_USER_QUERY,
	GET_INVOICE_FILES_QUERY,
	GET_TRIP_QUERY,
} from "@/lib/uber-queries";
import type {
	TransformedRide,
	UberActivitiesResponse,
	UberAuthCredentials,
	UberCurrentUser,
	UberGetTripResponse,
	UberInvoiceFilesResponse,
} from "@/types/uber-api";

const UBER_GRAPHQL_URL = "https://riders.uber.com/graphql";

/**
 * Makes a GraphQL request to Uber's API
 */
async function uberGraphQL<T>(
	auth: UberAuthCredentials,
	body: object,
): Promise<T> {
	const response = await fetch(UBER_GRAPHQL_URL, {
		method: "POST",
		headers: {
			accept: "*/*",
			"accept-language": "en-GB,en;q=0.9",
			"content-type": "application/json",
			"x-csrf-token": auth.csrfToken,
			"x-uber-rv-session-type": "desktop_session",
			cookie: auth.cookie,
		},
		body: JSON.stringify(body),
	});

	if (!response.ok) {
		throw new Error(
			`Uber API error: ${response.status} ${response.statusText}`,
		);
	}

	return response.json() as Promise<T>;
}

/**
 * Fetch current user info
 */
export const fetchCurrentUser = createServerFn({ method: "POST" })
	.inputValidator((data: { auth: UberAuthCredentials }) => {
		if (!data.auth?.cookie || !data.auth?.csrfToken) {
			throw new Error("Auth credentials are required");
		}
		return data;
	})
	.handler(
		async ({
			data,
		}): Promise<{ user: UberCurrentUser | null; error?: string }> => {
			try {
				const response = await uberGraphQL<{
					data: { currentUser: UberCurrentUser };
				}>(data.auth, CURRENT_USER_QUERY);
				return { user: response.data.currentUser };
			} catch (error) {
				console.error("Failed to fetch current user:", error);
				return {
					user: null,
					error: error instanceof Error ? error.message : "Unknown error",
				};
			}
		},
	);

/**
 * Fetch activities (rides) with pagination
 */
export const fetchActivities = createServerFn({ method: "POST" })
	.inputValidator(
		(data: {
			auth: UberAuthCredentials;
			limit?: number;
			nextPageToken?: string;
			startTimeMs?: number;
			endTimeMs?: number;
		}) => {
			if (!data.auth?.cookie || !data.auth?.csrfToken) {
				throw new Error("Auth credentials are required");
			}
			return data;
		},
	)
	.handler(
		async ({
			data,
		}): Promise<{
			activities: TransformedRide[];
			nextPageToken: string | null;
			error?: string;
		}> => {
			try {
				const variables = buildActivitiesVariables({
					limit: data.limit,
					nextPageToken: data.nextPageToken,
					startTimeMs: data.startTimeMs,
					endTimeMs: data.endTimeMs,
				});

				const response = await uberGraphQL<UberActivitiesResponse>(data.auth, {
					...ACTIVITIES_QUERY,
					variables,
				});

				// Transform activities to our ride format
				const activities = response.data.activities.past.activities.map(
					(activity) => {
						// Parse amount from description (e.g., "₹84.38" or "$12.50")
						const amountMatch = activity.description.match(
							/[₹$€£]?([\d,]+\.?\d*)/,
						);
						const amount = amountMatch
							? Number.parseFloat(amountMatch[1].replace(",", ""))
							: 0;

						// Determine currency from description
						let currency = "USD";
						if (activity.description.includes("₹")) currency = "INR";
						else if (activity.description.includes("€")) currency = "EUR";
						else if (activity.description.includes("£")) currency = "GBP";

						// Parse date from subtitle (e.g., "16 Nov • 22:33")
						// Add current year to make it parseable
						const subtitleParts = activity.subtitle.split(" • ");
						const datePart = subtitleParts[0]; // "16 Nov"
						const timePart = subtitleParts[1] || "00:00"; // "22:33"
						const currentYear = new Date().getFullYear();
						const dateStr = `${datePart} ${currentYear} ${timePart}`;

						// Check if it's an auto ride based on image URL
						const isAutoRide =
							activity.imageURL.light.includes("TukTuk") ||
							activity.imageURL.light.includes("Auto") ||
							activity.imageURL.light.includes("Moto");

						return {
							rideId: activity.uuid,
							startTime: dateStr,
							endTime: "",
							startLocation: activity.title,
							endLocation: "",
							totalAmount: amount,
							currency,
							driverName: "",
							vehicleType: isAutoRide ? "Auto" : "Car",
							status: "COMPLETED",
							mapUrl: activity.imageURL.dark || activity.imageURL.light,
							isAutoRide,
						} satisfies TransformedRide;
					},
				);

				return {
					activities,
					nextPageToken: response.data.activities.past.nextPageToken,
				};
			} catch (error) {
				console.error("Failed to fetch activities:", error);
				return {
					activities: [],
					nextPageToken: null,
					error: error instanceof Error ? error.message : "Unknown error",
				};
			}
		},
	);

/**
 * Helper to determine vehicle type from receipt
 */
function getVehicleInfo(vehicleType: string): {
	type: string;
	isAuto: boolean;
	isBike: boolean;
} {
	const lower = vehicleType?.toLowerCase() || "";
	const isBike = lower.includes("moto") || lower.includes("bike");
	const isAuto = lower.includes("auto") || lower.includes("tuk");

	return {
		type: vehicleType || "Car",
		isAuto: isAuto || isBike, // Both use simple receipt URL
		isBike,
	};
}

/**
 * Fetch trip details
 */
export const fetchTripDetails = createServerFn({ method: "POST" })
	.inputValidator((data: { auth: UberAuthCredentials; tripUUID: string }) => {
		if (!data.auth?.cookie || !data.auth?.csrfToken) {
			throw new Error("Auth credentials are required");
		}
		if (!data.tripUUID) {
			throw new Error("Trip UUID is required");
		}
		return data;
	})
	.handler(
		async ({
			data,
		}): Promise<{ ride: TransformedRide | null; error?: string }> => {
			try {
				const response = await uberGraphQL<UberGetTripResponse>(data.auth, {
					...GET_TRIP_QUERY,
					variables: { tripUUID: data.tripUUID },
				});

				const trip = response.data.getTrip.trip;
				const receipt = response.data.getTrip.receipt;

				// Parse fare amount
				const fareMatch = trip.fare.match(/[₹$€£]?([\d,]+\.?\d*)/);
				const amount = fareMatch
					? Number.parseFloat(fareMatch[1].replace(",", ""))
					: 0;

				// Determine currency
				let currency = "USD";
				if (trip.fare.includes("₹")) currency = "INR";
				else if (trip.fare.includes("€")) currency = "EUR";
				else if (trip.fare.includes("£")) currency = "GBP";

				const vehicleInfo = getVehicleInfo(receipt.vehicleType);

				return {
					ride: {
						rideId: trip.uuid,
						startTime: trip.beginTripTime,
						endTime: trip.dropoffTime,
						startLocation: trip.waypoints[0] || "",
						endLocation: trip.waypoints[trip.waypoints.length - 1] || "",
						totalAmount: amount,
						currency,
						driverName: trip.driver,
						vehicleType: vehicleInfo.type,
						status: trip.status,
						mapUrl: response.data.getTrip.mapURL,
						isAutoRide: vehicleInfo.isAuto,
					},
				};
			} catch (error) {
				console.error("Failed to fetch trip details:", error);
				return {
					ride: null,
					error: error instanceof Error ? error.message : "Unknown error",
				};
			}
		},
	);

/**
 * Fetch multiple trip details in parallel
 */
export const fetchMultipleTripDetails = createServerFn({ method: "POST" })
	.inputValidator(
		(data: { auth: UberAuthCredentials; tripUUIDs: string[] }) => {
			if (!data.auth?.cookie || !data.auth?.csrfToken) {
				throw new Error("Auth credentials are required");
			}
			if (!data.tripUUIDs || data.tripUUIDs.length === 0) {
				throw new Error("Trip UUIDs are required");
			}
			return data;
		},
	)
	.handler(
		async ({
			data,
		}): Promise<{ rides: TransformedRide[]; errors: string[] }> => {
			const results = await Promise.all(
				data.tripUUIDs.map(async (tripUUID) => {
					try {
						const response = await uberGraphQL<UberGetTripResponse>(data.auth, {
							...GET_TRIP_QUERY,
							variables: { tripUUID },
						});

						const trip = response.data.getTrip.trip;
						const receipt = response.data.getTrip.receipt;

						// Parse fare amount
						const fareMatch = trip.fare.match(/[₹$€£]?([\d,]+\.?\d*)/);
						const amount = fareMatch
							? Number.parseFloat(fareMatch[1].replace(",", ""))
							: 0;

						// Determine currency
						let currency = "USD";
						if (trip.fare.includes("₹")) currency = "INR";
						else if (trip.fare.includes("€")) currency = "EUR";
						else if (trip.fare.includes("£")) currency = "GBP";

						const vehicleInfo = getVehicleInfo(receipt.vehicleType);

						return {
							success: true as const,
							ride: {
								rideId: trip.uuid,
								startTime: trip.beginTripTime,
								endTime: trip.dropoffTime,
								startLocation: trip.waypoints[0] || "",
								endLocation: trip.waypoints[trip.waypoints.length - 1] || "",
								totalAmount: amount,
								currency,
								driverName: trip.driver,
								vehicleType: vehicleInfo.type,
								status: trip.status,
								mapUrl: response.data.getTrip.mapURL,
								isAutoRide: vehicleInfo.isAuto,
							} satisfies TransformedRide,
						};
					} catch (error) {
						return {
							success: false as const,
							error: `Failed to fetch ${tripUUID}: ${error instanceof Error ? error.message : "Unknown"}`,
						};
					}
				}),
			);

			const rides: TransformedRide[] = [];
			const errors: string[] = [];

			for (const result of results) {
				if (result.success) {
					rides.push(result.ride);
				} else {
					errors.push(result.error);
				}
			}

			return { rides, errors };
		},
	);

/**
 * Fetch receipt PDF for a trip
 */
export const fetchReceiptPdf = createServerFn({ method: "POST" })
	.inputValidator(
		(data: {
			auth: UberAuthCredentials;
			tripUUID: string;
			isAutoRide: boolean;
		}) => {
			if (!data.auth?.cookie || !data.auth?.csrfToken) {
				throw new Error("Auth credentials are required");
			}
			if (!data.tripUUID) {
				throw new Error("Trip UUID is required");
			}
			return data;
		},
	)
	.handler(
		async ({ data }): Promise<{ pdfBase64: string | null; error?: string }> => {
			try {
				let pdfUrl: string = "";
				let useReceiptFallback = false;

				if (data.isAutoRide) {
					// For auto rides, always use direct receipt PDF URL
					const timestamp = Date.now();
					pdfUrl = `https://riders.uber.com/trips/${data.tripUUID}/receipt?contentType=PDF&timestamp=${timestamp}`;
				} else {
					// For non-auto (Uber) rides, try invoice first
					try {
						const invoiceResponse = await uberGraphQL<UberInvoiceFilesResponse>(
							data.auth,
							{
								...GET_INVOICE_FILES_QUERY,
								variables: { tripUUID: data.tripUUID },
							},
						);

						const files = invoiceResponse.data.invoiceFiles.files;
						if (!files || files.length === 0) {
							// No invoice found, fallback to receipt
							useReceiptFallback = true;
						} else {
							pdfUrl = files[0].downloadURL;
						}
					} catch (invoiceError) {
						// Invoice fetch failed, fallback to receipt
						console.warn(
							"Invoice fetch failed, falling back to receipt:",
							invoiceError,
						);
						useReceiptFallback = true;
					}

					// Use receipt as fallback for Uber rides
					if (useReceiptFallback) {
						const timestamp = Date.now();
						pdfUrl = `https://riders.uber.com/trips/${data.tripUUID}/receipt?contentType=PDF&timestamp=${timestamp}`;
					}
				}

				// Fetch the PDF
				const pdfResponse = await fetch(pdfUrl, {
					headers: {
						cookie: data.auth.cookie,
					},
				});

				if (!pdfResponse.ok) {
					throw new Error(`Failed to fetch PDF: ${pdfResponse.status}`);
				}

				const pdfBuffer = await pdfResponse.arrayBuffer();
				const base64 = Buffer.from(pdfBuffer).toString("base64");

				return { pdfBase64: base64 };
			} catch (error) {
				console.error("Failed to fetch receipt PDF:", error);
				return {
					pdfBase64: null,
					error: error instanceof Error ? error.message : "Unknown error",
				};
			}
		},
	);

/**
 * Fetch multiple receipt PDFs
 */
export const fetchMultipleReceiptPdfs = createServerFn({ method: "POST" })
	.inputValidator(
		(data: {
			auth: UberAuthCredentials;
			trips: Array<{ tripUUID: string; isAutoRide: boolean }>;
		}) => {
			if (!data.auth?.cookie || !data.auth?.csrfToken) {
				throw new Error("Auth credentials are required");
			}
			if (!data.trips || data.trips.length === 0) {
				throw new Error("At least one trip is required");
			}
			return data;
		},
	)
	.handler(
		async ({
			data,
		}): Promise<{
			pdfs: Array<{ rideId: string; pdfBase64: string | null; error?: string }>;
		}> => {
			const pdfs = await Promise.all(
				data.trips.map(async (trip) => {
					try {
						let pdfUrl: string = "";
						let useReceiptFallback = false;

						if (trip.isAutoRide) {
							// For auto rides, always use direct receipt PDF URL
							const timestamp = Date.now();
							pdfUrl = `https://riders.uber.com/trips/${trip.tripUUID}/receipt?contentType=PDF&timestamp=${timestamp}`;
						} else {
							// For non-auto (Uber) rides, try invoice first
							try {
								const invoiceResponse =
									await uberGraphQL<UberInvoiceFilesResponse>(data.auth, {
										...GET_INVOICE_FILES_QUERY,
										variables: { tripUUID: trip.tripUUID },
									});

								const files = invoiceResponse.data.invoiceFiles.files;
								if (!files || files.length === 0) {
									// No invoice found, fallback to receipt
									useReceiptFallback = true;
								} else {
									pdfUrl = files[0].downloadURL;
								}
							} catch (invoiceError) {
								// Invoice fetch failed, fallback to receipt
								console.warn(
									`Invoice fetch failed for ${trip.tripUUID}, falling back to receipt:`,
									invoiceError,
								);
								useReceiptFallback = true;
							}

							// Use receipt as fallback for Uber rides
							if (useReceiptFallback) {
								const timestamp = Date.now();
								pdfUrl = `https://riders.uber.com/trips/${trip.tripUUID}/receipt?contentType=PDF&timestamp=${timestamp}`;
							}
						}

						const pdfResponse = await fetch(pdfUrl, {
							headers: {
								cookie: data.auth.cookie,
							},
						});

						if (!pdfResponse.ok) {
							throw new Error(`Failed to fetch PDF: ${pdfResponse.status}`);
						}

						const pdfBuffer = await pdfResponse.arrayBuffer();
						const base64 = Buffer.from(pdfBuffer).toString("base64");

						return { rideId: trip.tripUUID, pdfBase64: base64 };
					} catch (error) {
						return {
							rideId: trip.tripUUID,
							pdfBase64: null,
							error: error instanceof Error ? error.message : "Unknown error",
						};
					}
				}),
			);

			return { pdfs };
		},
	);
