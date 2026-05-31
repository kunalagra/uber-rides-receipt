import { createFileRoute } from "@tanstack/react-router";
import type { RowSelectionState, SortingState } from "@tanstack/react-table";
import { format, startOfMonth } from "date-fns";
import { Calendar, Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AuthSetupModal } from "@/components/AuthSetupModal";
import { DateRangePicker } from "@/components/DateRangePicker";
import { Navbar } from "@/components/Navbar";
import { RidesTable } from "@/components/RidesTable";
import { SelectionSummary } from "@/components/SelectionSummary";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { downloadBlob, generateCsv, generateSummaryPdf } from "@/lib/pdf-utils";
import {
	DEFAULT_PROVIDER_ID,
	getProvider,
	loadSelectedProviderId,
	PROVIDER_LIST,
	saveSelectedProviderId,
} from "@/providers/registry";
import type {
	NormalizedRide,
	ProviderId,
	ProviderUser,
} from "@/providers/types";
import type { DateRange } from "@/types/rides";

export const Route = createFileRoute("/")({ component: ReceiptsDashboard });

function ReceiptsDashboard() {
	// Provider state
	const [providerId, setProviderId] = useState<ProviderId>(DEFAULT_PROVIDER_ID);
	const provider = getProvider(providerId);

	// Auth state (auth is provider-specific, opaque here)
	const [auth, setAuth] = useState<unknown>(null);
	const [user, setUser] = useState<ProviderUser | null>(null);
	const isAuthenticated = auth != null;

	// Rides data state
	const [rides, setRides] = useState<NormalizedRide[]>([]);
	const [isLoadingRides, setIsLoadingRides] = useState(false);
	const [hasSearched, setHasSearched] = useState(false);

	// Table state
	const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
	const [sorting, setSorting] = useState<SortingState>([]);

	// Filter state
	const [statusFilter, setStatusFilter] = useState<"all" | "COMPLETED">(
		"COMPLETED",
	);

	// Auth modal state
	const [authModalOpen, setAuthModalOpen] = useState(false);

	// Date range state - default to 1st of current month to today
	const [dateRange, setDateRange] = useState<DateRange>({
		from: startOfMonth(new Date()),
		to: new Date(),
	});

	// Fetch progress / download state
	const [fetchProgress, setFetchProgress] = useState<string>("");
	const [isDownloading, setIsDownloading] = useState(false);

	// Reset all ride/selection state (used on provider switch + auth change)
	const resetRideState = useCallback(() => {
		setRides([]);
		setRowSelection({});
		setHasSearched(false);
		setFetchProgress("");
	}, []);

	// Restore a provider's stored session (auth + user) on load / switch
	const restoreSession = useCallback(async (id: ProviderId) => {
		const desc = getProvider(id);
		const stored = localStorage.getItem(desc.authStorageKey);
		if (!stored) {
			setAuth(null);
			setUser(null);
			return;
		}
		try {
			const parsedAuth = JSON.parse(stored);
			const result = await desc.restoreUser(parsedAuth);
			if ("user" in result) {
				setAuth(parsedAuth);
				setUser(result.user);
			} else {
				// Invalid/expired credentials → clear this provider's session
				localStorage.removeItem(desc.authStorageKey);
				setAuth(null);
				setUser(null);
			}
		} catch {
			localStorage.removeItem(desc.authStorageKey);
			setAuth(null);
			setUser(null);
		}
	}, []);

	// On mount: pick last-used provider and restore its session
	useEffect(() => {
		const id = loadSelectedProviderId();
		setProviderId(id);
		restoreSession(id);
	}, [restoreSession]);

	// Filter rides by status
	const filteredRides = useMemo(() => {
		if (statusFilter === "all") return rides;
		return rides.filter((ride) => ride.status === statusFilter);
	}, [rides, statusFilter]);

	// Calculate summary from selection
	const summary = useMemo(() => {
		const selectedRides = filteredRides.filter(
			(ride) => rowSelection[ride.rideId],
		);
		const totalAmount = selectedRides.reduce(
			(sum, ride) => sum + ride.totalAmount,
			0,
		);
		return {
			selectedCount: selectedRides.length,
			totalAmount,
			currency: selectedRides[0]?.currency || "INR",
			rides: selectedRides,
		};
	}, [filteredRides, rowSelection]);

	// Switch provider
	const handleSelectProvider = useCallback(
		(id: ProviderId) => {
			if (id === providerId) return;
			setProviderId(id);
			saveSelectedProviderId(id);
			resetRideState();
			restoreSession(id);
		},
		[providerId, resetRideState, restoreSession],
	);

	// Handle auth success
	const handleAuthSuccess = (newAuth: unknown, newUser: ProviderUser) => {
		setAuth(newAuth);
		setUser(newUser);
		resetRideState();
	};

	// Handle logout (scoped to active provider)
	const handleLogout = () => {
		localStorage.removeItem(provider.authStorageKey);
		setAuth(null);
		setUser(null);
		resetRideState();
	};

	// Fetch all rides within date range
	const handleFetchRides = useCallback(async () => {
		if (!auth || !dateRange.from) return;

		setIsLoadingRides(true);
		setRowSelection({});
		setHasSearched(true);
		setFetchProgress("Fetching rides...");

		try {
			const fetched = await provider.fetchRides(
				auth,
				dateRange,
				setFetchProgress,
			);
			setRides(fetched);
			setFetchProgress("");
		} catch (error) {
			console.error("Failed to fetch rides:", error);
			setFetchProgress("");
		} finally {
			setIsLoadingRides(false);
		}
	}, [auth, dateRange, provider]);

	const accountName = user
		? `${user.firstName} ${user.lastName}`.trim()
		: undefined;

	const buildSummaryPayload = useCallback(
		(ridesForPayload: NormalizedRide[]) => ({
			selectedCount: ridesForPayload.length,
			totalAmount: ridesForPayload.reduce((s, r) => s + r.totalAmount, 0),
			currency: ridesForPayload[0]?.currency || summary.currency,
			rides: ridesForPayload.map((r) => ({
				rideId: r.rideId,
				startTime: r.startTime,
				endTime: r.endTime,
				startLocation: r.startLocation,
				endLocation: r.endLocation,
				totalAmount: r.totalAmount,
				currency: r.currency,
				driverName: r.driverName,
				vehicleType: r.vehicleType,
				status: r.status,
				invoiceUrl: "",
			})),
		}),
		[summary.currency],
	);

	// Download report handler (summary + all receipts) — receiptPdf providers only
	const handleDownloadReport = useCallback(async () => {
		if (!auth || summary.selectedCount === 0 || !provider.fetchReceiptPdfs)
			return;

		setIsDownloading(true);
		try {
			const pdfs = await provider.fetchReceiptPdfs(auth, summary.rides);
			const validPdfs = pdfs.filter(
				(pdf): pdf is { rideId: string; pdfBase64: string } =>
					pdf.pdfBase64 !== null,
			);

			if (validPdfs.length === 0) {
				console.error("No PDFs were successfully fetched");
				return;
			}

			const pdfSummary = buildSummaryPayload(
				summary.rides.filter((r) =>
					validPdfs.some((p) => p.rideId === r.rideId),
				),
			);
			const mergedPdf = await generateSummaryPdf(
				pdfSummary,
				accountName,
				validPdfs,
				`${provider.name} Expense Summary`,
			);

			const filename = `${provider.id}_expenses_${format(new Date(), "yyyy-MM-dd")}.pdf`;
			downloadBlob(mergedPdf, filename, "application/pdf");
		} catch (error) {
			console.error("Failed to download receipts:", error);
		} finally {
			setIsDownloading(false);
		}
	}, [auth, summary, provider, accountName, buildSummaryPayload]);

	// Download invoices handler (receipts only, no summary) — receiptPdf providers only
	const handleDownloadInvoices = useCallback(async () => {
		if (!auth || summary.selectedCount === 0 || !provider.fetchReceiptPdfs)
			return;

		setIsDownloading(true);
		try {
			const pdfs = await provider.fetchReceiptPdfs(auth, summary.rides);
			const validPdfs = pdfs.filter(
				(pdf): pdf is { rideId: string; pdfBase64: string } =>
					pdf.pdfBase64 !== null,
			);

			if (validPdfs.length === 0) {
				console.error("No PDFs were successfully fetched");
				return;
			}

			const { PDFDocument } = await import("pdf-lib");
			const mergedPdf = await PDFDocument.create();

			for (const pdfData of validPdfs) {
				try {
					const pdfBytes = Uint8Array.from(atob(pdfData.pdfBase64), (c) =>
						c.charCodeAt(0),
					);
					const pdfToMerge = await PDFDocument.load(pdfBytes);
					const copiedPages = await mergedPdf.copyPages(
						pdfToMerge,
						pdfToMerge.getPageIndices(),
					);
					for (const page of copiedPages) {
						mergedPdf.addPage(page);
					}
				} catch (error) {
					console.error(
						`Failed to merge PDF for ride ${pdfData.rideId}:`,
						error,
					);
				}
			}

			const mergedPdfBytes = await mergedPdf.save();
			const filename = `${provider.id}_invoices_${format(new Date(), "yyyy-MM-dd")}.pdf`;
			downloadBlob(mergedPdfBytes, filename, "application/pdf");
		} catch (error) {
			console.error("Failed to download invoices:", error);
		} finally {
			setIsDownloading(false);
		}
	}, [auth, summary, provider]);

	// Download summary PDF handler (all providers)
	const handleDownloadSummaryPdf = useCallback(async () => {
		if (summary.selectedCount === 0) return;
		const pdfSummary = buildSummaryPayload(summary.rides);
		const pdfBytes = await generateSummaryPdf(
			pdfSummary,
			accountName,
			undefined,
			`${provider.name} Expense Summary`,
		);
		const filename = `${provider.id}_summary_${format(new Date(), "yyyy-MM-dd")}.pdf`;
		downloadBlob(pdfBytes, filename, "application/pdf");
	}, [summary, accountName, provider.id, provider.name, buildSummaryPayload]);

	// Download CSV handler (all providers)
	const handleDownloadCsv = useCallback(() => {
		if (summary.selectedCount === 0) return;
		const csv = generateCsv(buildSummaryPayload(summary.rides));
		const filename = `${provider.id}_expenses_${format(new Date(), "yyyy-MM-dd")}.csv`;
		downloadBlob(csv, filename, "text/csv");
	}, [summary, provider.id, buildSummaryPayload]);

	const ProviderIcon = provider.icon;

	return (
		<div className="min-h-screen bg-background">
			<Navbar
				user={user}
				isAuthenticated={isAuthenticated}
				providers={PROVIDER_LIST}
				selectedProviderId={providerId}
				onSelectProvider={handleSelectProvider}
				onOpenAuthModal={() => setAuthModalOpen(true)}
				onLogout={handleLogout}
			/>

			<AuthSetupModal
				provider={provider}
				onAuthSuccess={handleAuthSuccess}
				open={authModalOpen}
				onOpenChange={setAuthModalOpen}
			/>

			<div className="container mx-auto px-4 py-6 pb-24 max-w-6xl">
				{/* Fetch Rides Section */}
				{isAuthenticated && (
					<Card className="mb-6">
						<CardHeader className="pb-4">
							<CardTitle className="text-lg flex items-center gap-2">
								<Calendar className="h-5 w-5" />
								Fetch Rides by Date Range
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="flex flex-col gap-4">
								<div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
									<DateRangePicker
										dateRange={dateRange}
										onDateRangeChange={setDateRange}
									/>
									<Button
										onClick={handleFetchRides}
										disabled={isLoadingRides || !dateRange.from}
										className="min-w-[160px]"
									>
										{isLoadingRides ? (
											<>
												<Loader2 className="mr-2 h-4 w-4 animate-spin" />
												Fetching...
											</>
										) : (
											<>
												<RefreshCw className="mr-2 h-4 w-4" />
												Fetch Rides
											</>
										)}
									</Button>
								</div>
								{fetchProgress && (
									<p className="text-sm text-muted-foreground flex items-center gap-2">
										<Loader2 className="h-3 w-3 animate-spin" />
										{fetchProgress}
									</p>
								)}
								{!fetchProgress && (
									<p className="text-sm text-muted-foreground">
										Select a date range and click Fetch to load all rides within
										that period
									</p>
								)}
							</div>
						</CardContent>
					</Card>
				)}

				{/* Rides Table */}
				{hasSearched && (
					<Card>
						<CardContent className="pt-6">
							{isLoadingRides && rides.length === 0 ? (
								<div className="flex items-center justify-center h-48">
									<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
								</div>
							) : (
								<RidesTable
									rides={rides}
									rowSelection={rowSelection}
									onRowSelectionChange={setRowSelection}
									sorting={sorting}
									onSortingChange={setSorting}
									statusFilter={statusFilter}
									onStatusFilterChange={setStatusFilter}
								/>
							)}
						</CardContent>
					</Card>
				)}

				{/* Empty State - Not Authenticated */}
				{!isAuthenticated && (
					<Card>
						<CardContent className="flex flex-col items-center justify-center py-16">
							<ProviderIcon className="h-16 w-16 text-muted-foreground mb-4" />
							<h3 className="text-xl font-semibold mb-2">
								Connect Your {provider.name} Account
							</h3>
							<p className="text-muted-foreground text-center max-w-md mb-6">
								To view and download your ride receipts, you need to connect
								your {provider.name} account.
							</p>
							<Button onClick={() => setAuthModalOpen(true)}>
								Connect {provider.name} Account
							</Button>
						</CardContent>
					</Card>
				)}

				{/* Empty State - Authenticated but no search */}
				{isAuthenticated && !hasSearched && (
					<Card>
						<CardContent className="flex flex-col items-center justify-center py-16">
							<ProviderIcon className="h-16 w-16 text-muted-foreground mb-4" />
							<h3 className="text-xl font-semibold mb-2">Ready to Fetch</h3>
							<p className="text-muted-foreground text-center max-w-md">
								Select a date range above and click "Fetch Rides" to load your{" "}
								{provider.name} ride history.
							</p>
						</CardContent>
					</Card>
				)}
			</div>

			{/* Sticky Bottom Action Bar */}
			{hasSearched && (
				<SelectionSummary
					summary={summary}
					isLoading={isDownloading}
					userName={accountName}
					providerName={provider.name}
					supportsReceiptPdf={provider.capabilities.receiptPdf}
					onDownloadReport={handleDownloadReport}
					onDownloadInvoices={handleDownloadInvoices}
					onDownloadSummaryPdf={handleDownloadSummaryPdf}
					onDownloadCsv={handleDownloadCsv}
				/>
			)}
		</div>
	);
}
