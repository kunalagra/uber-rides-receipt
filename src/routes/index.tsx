import { createFileRoute } from "@tanstack/react-router";
import type { RowSelectionState, SortingState } from "@tanstack/react-table";
import { endOfDay, format, startOfDay, startOfMonth } from "date-fns";
import { Calendar, Car, Filter, Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AuthSetupModal } from "@/components/AuthSetupModal";
import { DateRangePicker } from "@/components/DateRangePicker";
import { Navbar } from "@/components/Navbar";
import { RidesTable } from "@/components/RidesTable";
import { SelectionSummary } from "@/components/SelectionSummary";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { downloadBlob, generateCsv, generateSummaryPdf } from "@/lib/pdf-utils";
import {
	fetchActivities,
	fetchCurrentUser,
	fetchMultipleReceiptPdfs,
	fetchMultipleTripDetails,
} from "@/server/uber-api";
import type { DateRange } from "@/types/rides";
import type {
	TransformedRide,
	UberAuthCredentials,
	UberCurrentUser,
} from "@/types/uber-api";

export const Route = createFileRoute("/")({ component: UberReceiptsDashboard });

function UberReceiptsDashboard() {
	// Auth state
	const [auth, setAuth] = useState<UberAuthCredentials | null>(null);
	const [user, setUser] = useState<UberCurrentUser | null>(null);

	// Rides data state
	const [rides, setRides] = useState<TransformedRide[]>([]);
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

	// Fetch progress state
	const [fetchProgress, setFetchProgress] = useState<string>("");

	// Download state
	const [isDownloading, setIsDownloading] = useState(false);

	// Filter rides by status
	const filteredRides = useMemo(() => {
		if (statusFilter === "all") return rides;
		return rides.filter((ride) => ride.status === statusFilter);
	}, [rides, statusFilter]);

	// Load auth from localStorage on mount
	useEffect(() => {
		const storedAuth = localStorage.getItem("uber_auth");
		if (storedAuth) {
			try {
				const parsedAuth = JSON.parse(storedAuth) as UberAuthCredentials;
				setAuth(parsedAuth);

				// Fetch user info
				fetchCurrentUser({ data: { auth: parsedAuth } }).then((result) => {
					if (result.user) {
						setUser(result.user);
					} else if (result.status === 404) {
						// 404 means cookie has expired - auto logout
						console.log("Session expired (404), logging out...");
						localStorage.removeItem("uber_auth");
						setAuth(null);
						setUser(null);
					}
				});
			} catch {
				localStorage.removeItem("uber_auth");
			}
		}
	}, []);

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
			currency: selectedRides[0]?.currency || "₹",
			rides: selectedRides,
		};
	}, [filteredRides, rowSelection]);

	// Handle auth success
	const handleAuthSuccess = (
		newAuth: UberAuthCredentials,
		newUser: UberCurrentUser,
	) => {
		setAuth(newAuth);
		setUser(newUser);
		setRides([]);
		setRowSelection({});
		setHasSearched(false);
	};

	// Handle logout
	const handleLogout = () => {
		localStorage.removeItem("uber_auth");
		setAuth(null);
		setUser(null);
		setRides([]);
		setRowSelection({});
		setHasSearched(false);
	};

	// Fetch all rides within date range
	const handleFetchRides = useCallback(async () => {
		if (!auth || !dateRange.from) return;

		setIsLoadingRides(true);
		setRowSelection({});
		setHasSearched(true);
		setFetchProgress("Fetching activities...");

		// Convert date range to timestamps (milliseconds)
		const startDate = startOfDay(dateRange.from);
		// For end date, use end of the day to include the entire selected day
		const endDate = endOfDay(dateRange.to ?? new Date());
		const startTimeMs = startDate.getTime();
		const endTimeMs = endDate.getTime();

		try {
			// Step 1: Fetch all activities with date range filter
			const allActivities: TransformedRide[] = [];
			let pageToken: string | undefined;
			let pageCount = 0;

			while (true) {
				pageCount++;
				setFetchProgress(
					`Fetching activities (page ${pageCount}, ${allActivities.length} rides)...`,
				);

				const result = await fetchActivities({
					data: {
						auth,
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

				// Add all activities (API already filtered by date range)
				allActivities.push(...result.activities);

				// Check if there are more pages
				if (!result.nextPageToken) {
					break;
				}
				pageToken = result.nextPageToken;
			}

			setFetchProgress(
				`Fetching trip details for ${allActivities.length} rides...`,
			);

			// Step 2: Fetch detailed trip info for all activities
			if (allActivities.length > 0) {
				const tripUUIDs = allActivities.map((a) => a.rideId);

				// Fetch in batches of 10 to avoid overwhelming the API
				const batchSize = 10;
				const enrichedRides: TransformedRide[] = [];

				for (let i = 0; i < tripUUIDs.length; i += batchSize) {
					const batch = tripUUIDs.slice(i, i + batchSize);
					setFetchProgress(
						`Fetching trip details (${Math.min(i + batchSize, tripUUIDs.length)}/${tripUUIDs.length})...`,
					);

					const detailsResult = await fetchMultipleTripDetails({
						data: {
							auth,
							tripUUIDs: batch,
						},
					});

					if (detailsResult.rides.length > 0) {
						enrichedRides.push(...detailsResult.rides);
					} else {
						// Fall back to basic activities for this batch
						const batchActivities = allActivities.filter((a) =>
							batch.includes(a.rideId),
						);
						enrichedRides.push(...batchActivities);
					}
				}

				setRides(enrichedRides);
			} else {
				setRides([]);
			}

			setFetchProgress("");
		} catch (error) {
			console.error("Failed to fetch rides:", error);
			setFetchProgress("");
		} finally {
			setIsLoadingRides(false);
		}
	}, [auth, dateRange]);

	// Download report handler (summary + all receipts)
	const handleDownloadReport = useCallback(async () => {
		if (!auth || summary.selectedCount === 0) return;

		setIsDownloading(true);

		try {
			// Fetch all PDFs from server
			const { pdfs } = await fetchMultipleReceiptPdfs({
				data: {
					auth,
					trips: summary.rides.map((ride) => ({
						tripUUID: ride.rideId,
						isAutoRide: ride.isAutoRide,
					})),
				},
			});

			// Filter out failed PDFs
			const validPdfs = pdfs.filter(
				(pdf): pdf is { rideId: string; pdfBase64: string } =>
					pdf.pdfBase64 !== null,
			);

			if (validPdfs.length === 0) {
				console.error("No PDFs were successfully fetched");
				return;
			}

			// Create summary for PDF cover
			const pdfSummary = {
				selectedCount: validPdfs.length,
				totalAmount: summary.totalAmount,
				currency: summary.currency,
				rides: summary.rides.map((r) => ({
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
			};

			// Generate summary PDF with merged receipts
			const accountName = user
				? `${user.firstName} ${user.lastName}`
				: undefined;
			const mergedPdf = await generateSummaryPdf(
				pdfSummary,
				accountName,
				validPdfs,
			);

			// Trigger download
			const filename = `uber_expenses_${format(new Date(), "yyyy-MM-dd")}.pdf`;
			downloadBlob(mergedPdf, filename, "application/pdf");
		} catch (error) {
			console.error("Failed to download receipts:", error);
		} finally {
			setIsDownloading(false);
		}
	}, [auth, summary, user]);

	// Download invoices handler (receipts only, no summary)
	const handleDownloadInvoices = useCallback(async () => {
		if (!auth || summary.selectedCount === 0) return;

		setIsDownloading(true);

		try {
			// Fetch all PDFs from server
			const { pdfs } = await fetchMultipleReceiptPdfs({
				data: {
					auth,
					trips: summary.rides.map((ride) => ({
						tripUUID: ride.rideId,
						isAutoRide: ride.isAutoRide,
					})),
				},
			});

			// Filter out failed PDFs
			const validPdfs = pdfs.filter(
				(pdf): pdf is { rideId: string; pdfBase64: string } =>
					pdf.pdfBase64 !== null,
			);

			if (validPdfs.length === 0) {
				console.error("No PDFs were successfully fetched");
				return;
			}

			// Import PDFDocument for merging
			const { PDFDocument } = await import("pdf-lib");

			// Merge all receipt PDFs without summary
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

			// Trigger download
			const filename = `uber_invoices_${format(new Date(), "yyyy-MM-dd")}.pdf`;
			downloadBlob(mergedPdfBytes, filename, "application/pdf");
		} catch (error) {
			console.error("Failed to download invoices:", error);
		} finally {
			setIsDownloading(false);
		}
	}, [auth, summary]);

	// Download summary PDF handler
	const handleDownloadSummaryPdf = useCallback(async () => {
		if (summary.selectedCount === 0) return;

		const pdfSummary = {
			selectedCount: summary.selectedCount,
			totalAmount: summary.totalAmount,
			currency: summary.currency,
			rides: summary.rides.map((r) => ({
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
		};

		const accountName = user ? `${user.firstName} ${user.lastName}` : undefined;
		const pdfBytes = await generateSummaryPdf(pdfSummary, accountName);
		const filename = `uber_summary_${format(new Date(), "yyyy-MM-dd")}.pdf`;
		downloadBlob(pdfBytes, filename, "application/pdf");
	}, [summary, user]);

	// Download CSV handler
	const handleDownloadCsv = useCallback(() => {
		if (summary.selectedCount === 0) return;

		const csvSummary = {
			selectedCount: summary.selectedCount,
			totalAmount: summary.totalAmount,
			currency: summary.currency,
			rides: summary.rides.map((r) => ({
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
		};

		const csv = generateCsv(csvSummary);
		const filename = `uber_expenses_${format(new Date(), "yyyy-MM-dd")}.csv`;
		downloadBlob(csv, filename, "text/csv");
	}, [summary]);

	return (
		<div className="min-h-screen bg-background">
			{/* Navbar */}
			<Navbar
				user={user}
				isAuthenticated={!!auth}
				onOpenAuthModal={() => setAuthModalOpen(true)}
				onLogout={handleLogout}
			/>

			{/* Auth Modal */}
			<AuthSetupModal
				onAuthSuccess={handleAuthSuccess}
				open={authModalOpen}
				onOpenChange={setAuthModalOpen}
			/>

			<div className="container mx-auto px-4 py-6 max-w-6xl">
				{/* Fetch Rides Section */}
				{auth && (
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

				{/* Selection Summary (shown when rides are loaded) */}
				{hasSearched && filteredRides.length > 0 && (
					<div className="mb-6">
						<SelectionSummary
							summary={summary}
							isLoading={isDownloading}
							userName={user ? `${user.firstName} ${user.lastName}` : undefined}
							onDownloadReport={handleDownloadReport}
							onDownloadInvoices={handleDownloadInvoices}
							onDownloadSummaryPdf={handleDownloadSummaryPdf}
							onDownloadCsv={handleDownloadCsv}
						/>
					</div>
				)}

				{/* Rides Table */}
				{hasSearched && (
					<Card>
						<CardHeader>
							<CardTitle className="text-lg flex items-center justify-between">
								<div className="flex items-center gap-3">
									<span>
										Rides{" "}
										{filteredRides.length > 0 && (
											<span className="text-muted-foreground font-normal">
												({filteredRides.length}
												{filteredRides.length !== rides.length &&
													` of ${rides.length}`}
												)
											</span>
										)}
									</span>
									{/* Status Filter */}
									<DropdownMenu>
										<DropdownMenuTrigger
											render={(props) => (
												<Button
													{...props}
													variant="outline"
													size="sm"
													className="gap-1"
												>
													<Filter className="h-3 w-3" />
													<Badge
														variant={
															statusFilter === "COMPLETED"
																? "default"
																: "secondary"
														}
														className="ml-1"
													>
														{statusFilter === "COMPLETED" ? "Completed" : "All"}
													</Badge>
												</Button>
											)}
										/>
										<DropdownMenuContent align="start">
											<DropdownMenuItem
												onClick={() => setStatusFilter("COMPLETED")}
											>
												Completed Only
											</DropdownMenuItem>
											<DropdownMenuItem onClick={() => setStatusFilter("all")}>
												All Rides
											</DropdownMenuItem>
										</DropdownMenuContent>
									</DropdownMenu>
								</div>
								{filteredRides.length > 0 && (
									<Button
										variant="outline"
										size="sm"
										onClick={() => {
											const allSelected =
												Object.keys(rowSelection).length ===
												filteredRides.length;
											if (allSelected) {
												setRowSelection({});
											} else {
												const newSelection: RowSelectionState = {};
												for (const ride of filteredRides) {
													newSelection[ride.rideId] = true;
												}
												setRowSelection(newSelection);
											}
										}}
									>
										{Object.keys(rowSelection).length === filteredRides.length
											? "Deselect All"
											: "Select All"}
									</Button>
								)}
							</CardTitle>
						</CardHeader>
						<CardContent>
							{isLoadingRides && rides.length === 0 ? (
								<div className="flex items-center justify-center h-48">
									<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
								</div>
							) : (
								<RidesTable
									rides={filteredRides}
									rowSelection={rowSelection}
									onRowSelectionChange={setRowSelection}
									sorting={sorting}
									onSortingChange={setSorting}
								/>
							)}
						</CardContent>
					</Card>
				)}

				{/* Empty State - Not Authenticated */}
				{!auth && (
					<Card>
						<CardContent className="flex flex-col items-center justify-center py-16">
							<Car className="h-16 w-16 text-muted-foreground mb-4" />
							<h3 className="text-xl font-semibold mb-2">
								Connect Your Uber Account
							</h3>
							<p className="text-muted-foreground text-center max-w-md mb-6">
								To view and download your ride receipts, you need to connect
								your Uber account by providing your session cookies.
							</p>
							<Button onClick={() => setAuthModalOpen(true)}>
								Connect Uber Account
							</Button>
						</CardContent>
					</Card>
				)}

				{/* Empty State - Authenticated but no search */}
				{auth && !hasSearched && (
					<Card>
						<CardContent className="flex flex-col items-center justify-center py-16">
							<Car className="h-16 w-16 text-muted-foreground mb-4" />
							<h3 className="text-xl font-semibold mb-2">Ready to Fetch</h3>
							<p className="text-muted-foreground text-center max-w-md">
								Click "Fetch Ride History" above to load your recent Uber rides.
							</p>
						</CardContent>
					</Card>
				)}
			</div>
		</div>
	);
}
