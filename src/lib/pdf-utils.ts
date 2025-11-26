import { format, isValid, parseISO } from "date-fns";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { PDFDocument } from "pdf-lib";
import type { RidesSummary } from "@/types/rides";

// Cache for loaded font
let cachedFontBytes: ArrayBuffer | null = null;

/**
 * Load Google Sans Flex font from public folder
 */
async function loadGoogleSansFont(): Promise<ArrayBuffer> {
	if (cachedFontBytes) {
		return cachedFontBytes;
	}

	const response = await fetch("/fonts/GoogleSansFlex.ttf");
	if (!response.ok) {
		throw new Error("Failed to load Google Sans Flex font");
	}

	cachedFontBytes = await response.arrayBuffer();
	return cachedFontBytes;
}

/**
 * Safely parse a date string that might be ISO format or a custom format
 */
function safeParseDate(dateStr: string): Date | null {
	if (!dateStr) return null;

	// Try ISO format first
	const isoDate = parseISO(dateStr);
	if (isValid(isoDate)) return isoDate;

	// Try creating a Date object directly
	const directDate = new Date(dateStr);
	if (isValid(directDate)) return directDate;

	return null;
}

/**
 * Format a date string safely, returning the original if parsing fails
 */
function safeFormatDate(
	dateStr: string,
	formatStr: string,
	fallback?: string,
): string {
	const date = safeParseDate(dateStr);
	if (date) {
		return format(date, formatStr);
	}
	return fallback || dateStr || "N/A";
}

/**
 * Sanitize text for PDF rendering - remove problematic characters
 */
function sanitizeText(text: string): string {
	if (!text) return "";
	// Keep only printable ASCII and basic extended Latin characters
	let result = "";
	for (const char of text) {
		const code = char.charCodeAt(0);
		// Keep printable ASCII (32-126) and extended Latin (160-383)
		if ((code >= 32 && code <= 126) || (code >= 160 && code <= 383)) {
			result += char;
		}
	}
	return result.trim();
}

/**
 * Get currency symbol for a currency code
 */
function getCurrencySymbol(currency: string): string {
	const symbols: Record<string, string> = {
		INR: "\u20B9",
		USD: "$",
		EUR: "\u20AC",
		GBP: "\u00A3",
	};
	return symbols[currency] || `${currency} `;
}

/**
 * Format amount with currency symbol
 */
function formatCurrency(amount: number, currency: string): string {
	const symbol = getCurrencySymbol(currency);
	return `${symbol}${amount.toFixed(2)}`;
}

/**
 * Generates a summary PDF using jsPDF with a table.
 * Uses landscape orientation to fit full addresses and additional details.
 * Optionally merges receipt PDFs if provided.
 */
export async function generateSummaryPdf(
	summary: RidesSummary,
	accountName?: string,
	pdfDataArray?: { rideId: string; pdfBase64: string }[],
): Promise<Uint8Array> {
	// Use landscape orientation for more space
	const doc = new jsPDF({ orientation: "landscape" });
	const pageWidth = doc.internal.pageSize.width;

	// Load and register Google Sans Flex font
	const fontBytes = await loadGoogleSansFont();
	const fontBase64 = btoa(
		new Uint8Array(fontBytes).reduce(
			(data, byte) => data + String.fromCharCode(byte),
			"",
		),
	);
	doc.addFileToVFS("GoogleSansFlex.ttf", fontBase64);
	doc.addFont("GoogleSansFlex.ttf", "GoogleSansFlex", "normal");

	const dateStr = format(new Date(), "MMMM d, yyyy");

	// Title
	doc.setFont("GoogleSansFlex", "normal");
	doc.setFontSize(24);
	doc.text("Uber Expense Summary", 14, 25);

	// Account name (left) and Generated date (right) on same line
	let yPos = 33;
	doc.setFontSize(10);
	doc.setTextColor(100);
	if (accountName) {
		doc.text(`Account: ${accountName}`, 14, yPos);
	}
	doc.text(`Generated: ${dateStr}`, pageWidth - 14, yPos, { align: "right" });
	yPos += 8;

	// Ruler line after header
	doc.setDrawColor(0);
	doc.setLineWidth(0.5);
	doc.line(14, yPos, pageWidth - 14, yPos);

	// Table data with No., pickup/dropoff datetime, addresses, driver, and vehicle type
	const tableData = summary.rides.map((ride, index) => [
		(index + 1).toString(),
		safeFormatDate(ride.startTime, "MMM d, yyyy HH:mm"),
		safeFormatDate(ride.endTime, "MMM d, yyyy HH:mm", "N/A"),
		sanitizeText(ride.driverName || "N/A"),
		sanitizeText(ride.vehicleType || "N/A"),
		sanitizeText(ride.startLocation || "N/A"),
		sanitizeText(ride.endLocation || "N/A"),
		formatCurrency(ride.totalAmount, ride.currency),
	]);

	// Add summary row
	tableData.push([
		"",
		"",
		"",
		"",
		"",
		"",
		"Grand Total:",
		formatCurrency(summary.totalAmount, summary.currency),
	]);

	// Generate table with more columns
	autoTable(doc, {
		startY: yPos + 5,
		head: [
			[
				"No.",
				"Pickup",
				"Dropoff",
				"Driver",
				"Vehicle",
				"Pickup Address",
				"Destination Address",
				"Amount",
			],
		],
		body: tableData,
		theme: "striped",
		styles: {
			font: "GoogleSansFlex",
		},
		headStyles: {
			fillColor: [0, 0, 0],
			textColor: [255, 255, 255],
			fontStyle: "normal",
			fontSize: 9,
		},
		bodyStyles: {
			fontSize: 8,
		},
		footStyles: {
			fillColor: [240, 240, 240],
			textColor: [0, 0, 0],
			fontStyle: "normal",
		},
		columnStyles: {
			0: { cellWidth: 12, halign: "center" }, // No.
			1: { cellWidth: 36 }, // Pickup (date + time)
			2: { cellWidth: 36 }, // Dropoff (date + time)
			3: { cellWidth: 26 }, // Driver
			4: { cellWidth: 20 }, // Vehicle
			5: { cellWidth: 58 }, // Pickup Address
			6: { cellWidth: 58 }, // Destination Address
			7: { cellWidth: 24, halign: "center" }, // Amount
		},
		didParseCell: (data) => {
			// Make last row bold (using larger font instead since we have a variable font)
			if (data.row.index === tableData.length - 1) {
				data.cell.styles.fillColor = [240, 240, 240];
			}
		},
	});

	// Footer on summary pages
	const summaryPageCount = doc.getNumberOfPages();
	for (let i = 1; i <= summaryPageCount; i++) {
		doc.setPage(i);
		doc.setFont("GoogleSansFlex", "normal");
		doc.setFontSize(8);
		doc.setTextColor(150);
		doc.text(
			`Page ${i}`,
			doc.internal.pageSize.width / 2,
			doc.internal.pageSize.height - 10,
			{ align: "center" },
		);
	}

	const summaryPdfBytes = new Uint8Array(doc.output("arraybuffer"));

	// If no receipt PDFs provided, return just the summary
	if (!pdfDataArray || pdfDataArray.length === 0) {
		return summaryPdfBytes;
	}

	// Merge summary with receipt PDFs using pdf-lib
	const mergedPdf = await PDFDocument.create();

	// Add summary pages
	const summaryDoc = await PDFDocument.load(summaryPdfBytes);
	const summaryPages = await mergedPdf.copyPages(
		summaryDoc,
		summaryDoc.getPageIndices(),
	);
	for (const page of summaryPages) {
		mergedPdf.addPage(page);
	}

	// Append individual receipt PDFs
	for (const pdfData of pdfDataArray) {
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
			console.error(`Failed to merge PDF for ride ${pdfData.rideId}:`, error);
		}
	}

	return mergedPdf.save();
}

/**
 * Generates a CSV export of the rides with all available data.
 */
export function generateCsv(summary: RidesSummary): string {
	const headers = [
		"Ride ID",
		"Pickup",
		"Dropoff",
		"Driver",
		"Vehicle Type",
		"Status",
		"Pickup Address",
		"Destination Address",
		"Amount",
		"Currency",
	];

	const rows = summary.rides.map((ride) => {
		const startDate = safeParseDate(ride.startTime);
		const endDate = safeParseDate(ride.endTime);
		return [
			ride.rideId,
			startDate ? startDate.toISOString() : "",
			endDate ? endDate.toISOString() : "",
			`"${(ride.driverName || "").replace(/"/g, '""')}"`,
			`"${(ride.vehicleType || "").replace(/"/g, '""')}"`,
			`"${(ride.status || "").replace(/"/g, '""')}"`,
			`"${(ride.startLocation || "").replace(/"/g, '""')}"`,
			`"${(ride.endLocation || "").replace(/"/g, '""')}"`,
			ride.totalAmount.toFixed(2),
			ride.currency,
		];
	});

	// Add total row
	rows.push([
		"",
		"",
		"",
		"",
		"",
		"",
		"",
		"Total:",
		summary.totalAmount.toFixed(2),
		summary.currency,
	]);

	const csvContent = [
		headers.join(","),
		...rows.map((row) => row.join(",")),
	].join("\n");

	return csvContent;
}

/**
 * Triggers a download in the browser.
 */
export function downloadBlob(
	data: Uint8Array | string,
	filename: string,
	mimeType: string,
): void {
	const blob = new Blob([data as BlobPart], { type: mimeType });
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
	URL.revokeObjectURL(url);
}
