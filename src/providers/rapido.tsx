import { Bike } from "lucide-react";
import { stripBearerPrefix } from "@/providers/rapido-normalize";
import {
	fetchRapidoOrders,
	fetchRapidoUser,
	type RapidoAuthCredentials,
} from "@/server/rapido-api";
import type { DateRange } from "@/types/rides";
import type {
	ConnectResult,
	NormalizedRide,
	ProviderDescriptor,
} from "./types";

const instructions = (
	<>
		<strong>How to get your Rapido token:</strong>
		<ol className="mt-2 ml-4 list-decimal space-y-1 text-sm">
			<li>
				Open{" "}
				<a
					href="https://m.rapido.bike/my-rides"
					target="_blank"
					rel="noopener noreferrer"
					className="underline text-primary"
				>
					m.rapido.bike/my-rides
				</a>{" "}
				and log in
			</li>
			<li>Open Developer Tools (F12 or Cmd+Option+I)</li>
			<li>Go to the Network tab</li>
			<li>Refresh the page</li>
			<li>
				Click the <code>order</code> request and copy the value of the{" "}
				<code>authorization</code> request header (the long token after{" "}
				<code>Bearer</code>)
			</li>
		</ol>
		<p className="mt-3 text-xs text-muted-foreground">
			Note: Rapido does not issue per-ride tax invoices, so only summary and CSV
			exports are available — individual receipt PDFs are not supported.
		</p>
	</>
);

export const rapidoProvider: ProviderDescriptor = {
	id: "rapido",
	name: "Rapido",
	icon: Bike,
	authStorageKey: "rapido_auth",
	capabilities: {
		receiptPdf: false,
		serverDateFilter: false,
	},
	auth: {
		instructions,
		fields: [
			{
				key: "token",
				label: "Bearer Token",
				placeholder: "Paste the Bearer token value here...",
				type: "textarea",
			},
		],
	},

	async connect(input): Promise<ConnectResult> {
		const token = stripBearerPrefix(input.token ?? "");
		if (!token) {
			return { error: "Token is required" };
		}
		const auth: RapidoAuthCredentials = { token };
		const result = await fetchRapidoUser({ data: { auth } });
		if (result.error || !result.user) {
			return { error: result.error || "Failed to authenticate." };
		}
		return { auth, user: result.user };
	},

	async restoreUser(auth) {
		const credentials = auth as RapidoAuthCredentials;
		const result = await fetchRapidoUser({ data: { auth: credentials } });
		if (result.error || !result.user) {
			return { error: result.error || "Token expired." };
		}
		return { user: result.user };
	},

	async fetchRides(auth, range: DateRange): Promise<NormalizedRide[]> {
		const credentials = auth as RapidoAuthCredentials;
		const fromMs = range.from ? new Date(range.from).getTime() : undefined;
		const toMs = range.to ? new Date(range.to).getTime() : undefined;

		const result = await fetchRapidoOrders({
			data: { auth: credentials, fromMs, toMs },
		});
		if (result.error) {
			console.error("Failed to fetch Rapido rides:", result.error);
		}
		return result.rides;
	},
};
