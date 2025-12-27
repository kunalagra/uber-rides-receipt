import {
	Download,
	FileSpreadsheet,
	FileText,
	MoreVertical,
	User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
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
	onDownloadReport: () => void;
	onDownloadInvoices: () => void;
	onDownloadSummaryPdf: () => void;
	onDownloadCsv: () => void;
}

export function SelectionSummary({
	summary,
	isLoading,
	userName,
	onDownloadReport,
	onDownloadInvoices,
	onDownloadSummaryPdf,
	onDownloadCsv,
}: SelectionSummaryProps) {
	const hasSelection = summary.selectedCount > 0;

	return (
		<Card className="p-4">
			<div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
				<div className="flex items-center gap-6">
					{userName && (
						<>
							<div className="flex flex-col">
								<span className="text-sm text-muted-foreground">Account</span>
								<span className="text-lg font-medium flex items-center gap-1">
									<User className="h-4 w-4" />
									{userName}
								</span>
							</div>
							<Separator
								orientation="vertical"
								className="h-12 hidden sm:block"
							/>
						</>
					)}
					<div className="flex flex-col">
						<span className="text-sm text-muted-foreground">Selected</span>
						<span className="text-2xl font-bold">
							{summary.selectedCount}{" "}
							{summary.selectedCount === 1 ? "ride" : "rides"}
						</span>
					</div>
					<Separator orientation="vertical" className="h-12 hidden sm:block" />
					<div className="flex flex-col">
						<span className="text-sm text-muted-foreground">Total Amount</span>
						<span className="text-2xl font-bold">
							{summary.currency} {summary.totalAmount.toFixed(2)}
						</span>
					</div>
				</div>

				<div className="flex items-center w-full sm:w-auto">
					<div className="flex items-center flex-1 sm:flex-none">
						<Button
							onClick={onDownloadReport}
							disabled={!hasSelection || isLoading}
							className="flex-1 sm:flex-none rounded-r-none border-r-0"
						>
							<Download className="mr-2 h-4 w-4" />
							{isLoading ? "Downloading..." : "Download Report"}
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
							<DropdownMenuContent align="end">
								<DropdownMenuItem onClick={onDownloadInvoices}>
									<Download className="mr-2 h-4 w-4" />
									Download Invoices
								</DropdownMenuItem>
								<DropdownMenuItem onClick={onDownloadSummaryPdf}>
									<FileText className="mr-2 h-4 w-4" />
									PDF Summary
								</DropdownMenuItem>
								<DropdownMenuItem onClick={onDownloadCsv}>
									<FileSpreadsheet className="mr-2 h-4 w-4" />
									CSV Summary
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
				</div>
			</div>
		</Card>
	);
}
