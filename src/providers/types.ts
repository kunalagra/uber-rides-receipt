import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { DateRange } from "@/types/rides";
import type { TransformedRide } from "@/types/uber-api";

/**
 * Identifier for a supported ride provider.
 * Adding a new provider starts by extending this union.
 */
export type ProviderId = "uber" | "rapido";

/**
 * Canonical, provider-agnostic ride shape consumed by the table, summary,
 * and export code. Extends the existing TransformedRide so NormalizedRide[]
 * remains assignable to components/functions still typed against
 * TransformedRide.
 */
export interface NormalizedRide extends TransformedRide {
	provider: ProviderId;
}

/**
 * Minimal user info shown in the navbar / used as the account name.
 * Each provider maps its own user payload onto this shape.
 */
export interface ProviderUser {
	firstName: string;
	lastName: string;
	email: string;
	pictureUrl?: string;
}

/**
 * A single credential field rendered in the auth modal.
 */
export interface AuthField {
	/** Key the collected value is stored under and passed to connect(). */
	key: string;
	label: string;
	placeholder?: string;
	type: "textarea" | "text";
}

/**
 * A failed provider call.
 *
 * `authFailed` distinguishes "these credentials are rejected" from "the call
 * did not go through". Only the former should drop the session — the provider
 * APIs return transient 5xx, and logging the user out on one would force a
 * needless re-auth. Each provider decides which statuses qualify, since the
 * mapping is provider-specific (Uber answers 404 for a dead cookie).
 */
export interface ProviderFailure {
	error: string;
	/** HTTP status when one was observed. */
	status?: number;
	/** true → stored credentials are rejected; the caller should log out. */
	authFailed?: boolean;
}

/**
 * Result of a connect() attempt: either credentials + user, or a failure.
 * `auth` is opaque at the registry boundary and narrowed inside each provider.
 */
export type ConnectResult =
	| { auth: unknown; user: ProviderUser }
	| ProviderFailure;

/**
 * Result of a fetchRides() call. Rides are returned even on a partial failure;
 * `authFailed` tells the dashboard the session is dead rather than empty.
 */
export interface FetchRidesResult {
	rides: NormalizedRide[];
	error?: string;
	status?: number;
	/** true → credentials were rejected mid-fetch; the caller should log out. */
	authFailed?: boolean;
}

/**
 * The single contract a provider implements. The dashboard, auth modal,
 * navbar, and export code are driven entirely by this descriptor, so adding
 * a provider means authoring one descriptor and registering it.
 */
export interface ProviderDescriptor {
	id: ProviderId;
	/** Display label used in the provider switcher. */
	name: string;
	icon: LucideIcon;
	/** localStorage key for this provider's credentials (independent per provider). */
	authStorageKey: string;
	capabilities: {
		/** true → expose Report/Invoices (per-ride receipt) downloads. */
		receiptPdf: boolean;
		/** true → provider filters by date server-side; false → filter client-side. */
		serverDateFilter: boolean;
	};
	auth: {
		instructions: ReactNode;
		fields: AuthField[];
	};
	/** Validate credentials and resolve the current user. */
	connect(input: Record<string, string>): Promise<ConnectResult>;
	/** Re-resolve the user from previously stored credentials (on app load). */
	restoreUser(auth: unknown): Promise<{ user: ProviderUser } | ProviderFailure>;
	/** Fetch rides in the given date range, normalized to NormalizedRide. */
	fetchRides(
		auth: unknown,
		range: DateRange,
		onProgress?: (message: string) => void,
	): Promise<FetchRidesResult>;
	/** Optional: fetch per-ride receipt PDFs (only when capabilities.receiptPdf). */
	fetchReceiptPdfs?(
		auth: unknown,
		rides: NormalizedRide[],
	): Promise<{ rideId: string; pdfBase64: string | null; error?: string }[]>;
}
