import {
	Ban,
	Download,
	FileSpreadsheet,
	FileText,
	MoreVertical,
	User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import type { TransformedRide } from "@/types/uber-api";

interface RidesSummary {
	selectedCount: number;
	totalAmount: number;
	currency: string;
	rides: TransformedRide[];
}

interface SelectionSummaryProps {
	summary: RidesSummary;
	isLoading: boolean;
	userName?: string;
	/** Active provider's display name, used in capability labels. */
	providerName: string;
	/** Whether the active provider exposes per-ride receipt PDFs. */
	supportsReceiptPdf: boolean;
	onDownloadReport: () => void;
	onDownloadInvoices: () => void;
	onDownloadSummaryPdf: () => void;
	onDownloadCsv: () => void;
}

export function SelectionSummary({
	summary,
	isLoading,
	userName,
	providerName,
	supportsReceiptPdf,
	onDownloadReport,
	onDownloadInvoices,
	onDownloadSummaryPdf,
	onDownloadCsv,
}: SelectionSummaryProps) {
	const hasSelection = summary.selectedCount > 0;
	// Providers without receipt PDFs (e.g. Rapido) can only export a summary.
	const primaryAction = supportsReceiptPdf
		? onDownloadReport
		: onDownloadSummaryPdf;
	const primaryLabel = supportsReceiptPdf
		? "Download Report"
		: "Download Summary";

	return (
		<div
			className={`fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur-sm transition-all duration-300 ${
				hasSelection
					? "translate-y-0 opacity-100"
					: "translate-y-full opacity-0 pointer-events-none"
			}`}
		>
			<div className="container mx-auto max-w-6xl px-4 py-3">
				<div className="flex items-center justify-between gap-4">
					<div className="flex items-center gap-6">
						{userName && (
							<>
								<div className="flex items-center gap-1.5 text-sm">
									<User className="h-3.5 w-3.5 text-muted-foreground" />
									<span className="font-medium">{userName}</span>
								</div>
								<Separator
									orientation="vertical"
									className="h-6 hidden sm:block"
								/>
							</>
						)}
						<div className="flex items-center gap-1.5">
							<span className="text-2xl font-bold">
								{summary.selectedCount}
							</span>
							<span className="text-sm text-muted-foreground">
								{summary.selectedCount === 1 ? "ride" : "rides"} selected
							</span>
						</div>
						<Separator orientation="vertical" className="h-6 hidden sm:block" />
						<div className="flex items-center gap-1.5">
							<span className="text-2xl font-bold">
								{summary.currency} {summary.totalAmount.toFixed(2)}
							</span>
							<span className="text-sm text-muted-foreground hidden sm:inline">
								total
							</span>
						</div>
					</div>

					<div className="flex items-center">
						<div className="flex items-center">
							<Button
								onClick={primaryAction}
								disabled={!hasSelection || isLoading}
								className="rounded-r-none border-r-0"
							>
								<Download className="mr-2 h-4 w-4" />
								{isLoading ? "Downloading..." : primaryLabel}
							</Button>

							<DropdownMenu>
								<DropdownMenuTrigger
									render={(props) => (
										<Button
											{...props}
											variant="default"
											disabled={!hasSelection || isLoading}
											className="rounded-l-none px-3"
										>
											<MoreVertical className="h-4 w-4" />
											<span className="sr-only">More options</span>
										</Button>
									)}
								/>
								<DropdownMenuContent align="end" side="top">
									{supportsReceiptPdf ? (
										<>
											<DropdownMenuItem onClick={onDownloadInvoices}>
												<Download className="mr-2 h-4 w-4" />
												Download Invoices
											</DropdownMenuItem>
											<DropdownMenuItem onClick={onDownloadSummaryPdf}>
												<FileText className="mr-2 h-4 w-4" />
												PDF Summary
											</DropdownMenuItem>
										</>
									) : (
										<>
											<DropdownMenuItem disabled>
												<Ban className="mr-2 h-4 w-4" />
												Invoices not available for {providerName}
											</DropdownMenuItem>
											<DropdownMenuSeparator />
										</>
									)}
									<DropdownMenuItem onClick={onDownloadCsv}>
										<FileSpreadsheet className="mr-2 h-4 w-4" />
										CSV Summary
									</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
