import { rapidoProvider } from "./rapido";
import type { ProviderDescriptor, ProviderId } from "./types";
import { uberProvider } from "./uber";

/**
 * All supported ride providers. To add a provider, author its descriptor and
 * add one entry here — no other code needs to change.
 */
export const PROVIDERS: Record<ProviderId, ProviderDescriptor> = {
	uber: uberProvider,
	rapido: rapidoProvider,
};

/** Providers in display order for the switcher. */
export const PROVIDER_LIST: ProviderDescriptor[] = [
	uberProvider,
	rapidoProvider,
];

export const DEFAULT_PROVIDER_ID: ProviderId = "uber";

const SELECTED_PROVIDER_KEY = "selected_provider";

export function getProvider(id: ProviderId): ProviderDescriptor {
	return PROVIDERS[id];
}

export function isProviderId(value: string | null): value is ProviderId {
	return value === "uber" || value === "rapido";
}

export function loadSelectedProviderId(): ProviderId {
	if (typeof window === "undefined") return DEFAULT_PROVIDER_ID;
	const stored = localStorage.getItem(SELECTED_PROVIDER_KEY);
	return isProviderId(stored) ? stored : DEFAULT_PROVIDER_ID;
}

export function saveSelectedProviderId(id: ProviderId): void {
	if (typeof window === "undefined") return;
	localStorage.setItem(SELECTED_PROVIDER_KEY, id);
}
