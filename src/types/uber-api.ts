/**
 * Uber Authentication credentials stored in browser
 */
export interface UberAuthCredentials {
	cookie: string;
	csrfToken: string;
}

/**
 * Current User response from Uber GraphQL API
 */
export interface UberCurrentUser {
	firstName: string;
	lastName: string;
	email: string;
	formattedNumber: string;
	pictureUrl: string;
	rating: string;
	uuid: string;
	tenancy: string;
	signupCountry: string;
}

/**
 * Activity from Uber Activities API
 */
export interface UberActivity {
	uuid: string;
	title: string;
	subtitle: string;
	description: string;
	cardURL: string;
	imageURL: {
		light: string;
		dark: string;
	};
	buttons: Array<{
		isDefault: boolean;
		startEnhancerIcon: string;
		text: string;
		url: string;
	}>;
}

/**
 * Activities response
 */
export interface UberActivitiesResponse {
	data: {
		activities: {
			cityID: number;
			past: {
				activities: UberActivity[];
				nextPageToken: string | null;
			};
			upcoming: {
				activities: UberActivity[];
			};
		};
	};
}

/**
 * Trip details from GetTrip API
 */
export interface UberTrip {
	beginTripTime: string;
	dropoffTime: string;
	cityID: number;
	countryID: number;
	driver: string;
	fare: string;
	status: string;
	uuid: string;
	vehicleDisplayName: string;
	waypoints: string[];
	isRidepoolTrip: boolean;
	marketplace: string;
}

/**
 * GetTrip response
 */
export interface UberGetTripResponse {
	data: {
		getTrip: {
			trip: UberTrip;
			mapURL: string;
			rating: string;
			receipt: {
				carYear: string;
				distance: string;
				distanceLabel: string;
				duration: string;
				vehicleType: string;
			};
		};
	};
}

/**
 * Invoice files response
 */
export interface UberInvoiceFilesResponse {
	data: {
		invoiceFiles: {
			archiveURL: string | null;
			files: Array<{
				downloadURL: string;
			}>;
		};
	};
}

/**
 * Transformed ride data for our app
 */
export interface TransformedRide {
	rideId: string;
	startTime: string;
	endTime: string;
	startLocation: string;
	endLocation: string;
	totalAmount: number;
	currency: string;
	driverName: string;
	vehicleType: string;
	status: string;
	mapUrl: string;
	isAutoRide: boolean;
}
