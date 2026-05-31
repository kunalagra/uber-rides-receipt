import {
	type ColumnDef,
	type ColumnFiltersState,
	type FilterFn,
	flexRender,
	getCoreRowModel,
	getFilteredRowModel,
	getSortedRowModel,
	type RowSelectionState,
	type SortingState,
	useReactTable,
} from "@tanstack/react-table";
import { format } from "date-fns";
import {
	ArrowDown,
	ArrowUp,
	ArrowUpDown,
	Bike,
	Car,
	Search,
	Truck,
	X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import type { TransformedRide } from "@/types/uber-api";

interface RidesTableProps {
	rides: TransformedRide[];
	rowSelection: RowSelectionState;
	onRowSelectionChange: (selection: RowSelectionState) => void;
	sorting: SortingState;
	onSortingChange: (sorting: SortingState) => void;
	statusFilter: "all" | "COMPLETED";
	onStatusFilterChange: (value: "all" | "COMPLETED") => void;
}

function formatDateTime(dateStr: string): { date: string; time: string } {
	try {
		const d = new Date(dateStr);
		if (Number.isNaN(d.getTime())) {
			return { date: dateStr, time: "" };
		}
		return {
			date: format(d, "MMM d, yyyy"),
			time: format(d, "h:mm a"),
		};
	} catch {
		return { date: dateStr, time: "" };
	}
}

function getVehicleIcon(vehicleType: string) {
	const lower = vehicleType?.toLowerCase() || "";
	if (lower.includes("moto") || lower.includes("bike")) {
		return <Bike className="h-3 w-3" />;
	}
	if (lower.includes("auto") || lower.includes("tuk")) {
		return <Truck className="h-3 w-3" />;
	}
	return <Car className="h-3 w-3" />;
}

// Custom global filter that searches across route, driver, and vehicle type
const globalFilterFn: FilterFn<TransformedRide> = (
	row,
	_columnId,
	filterValue,
) => {
	const query = (filterValue as string).toLowerCase();
	if (!query) return true;

	const start = (row.original.startLocation || "").toLowerCase();
	const end = (row.original.endLocation || "").toLowerCase();
	const driver = (row.original.driverName || "").toLowerCase();
	const vehicle = (row.original.vehicleType || "").toLowerCase();

	return (
		start.includes(query) ||
		end.includes(query) ||
		driver.includes(query) ||
		vehicle.includes(query)
	);
};

export function RidesTable({
	rides,
	onRowSelectionChange,
	rowSelection,
	onSortingChange,
	sorting,
	statusFilter,
	onStatusFilterChange,
}: RidesTableProps) {
	// Filter state
	const [searchQuery, setSearchQuery] = useState("");
	const [vehicleTypeFilter, setVehicleTypeFilter] = useState<string[]>([]);
	const [amountMin, setAmountMin] = useState<string>("");
	const [amountMax, setAmountMax] = useState<string>("");
	const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

	// Shift+click tracking
	const lastSelectedIndexRef = useRef<number | null>(null);

	// Extract unique vehicle types from ride data
	const availableVehicleTypes = useMemo(() => {
		const types = new Set<string>();
		for (const ride of rides) {
			if (ride.vehicleType) {
				types.add(ride.vehicleType);
			}
		}
		return Array.from(types).sort();
	}, [rides]);

	// Count active filters
	const activeFilterCount = useMemo(() => {
		let count = 0;
		if (searchQuery) count++;
		if (vehicleTypeFilter.length > 0) count++;
		if (amountMin || amountMax) count++;
		if (statusFilter !== "COMPLETED") count++;
		return count;
	}, [searchQuery, vehicleTypeFilter, amountMin, amountMax, statusFilter]);

	// Update column filters when vehicle type or amount filters change
	useEffect(() => {
		const filters: ColumnFiltersState = [];

		if (vehicleTypeFilter.length > 0) {
			filters.push({ id: "vehicleType", value: vehicleTypeFilter });
		}
		if (amountMin || amountMax) {
			filters.push({
				id: "totalAmount",
				value: {
					min: amountMin ? Number.parseFloat(amountMin) : undefined,
					max: amountMax ? Number.parseFloat(amountMax) : undefined,
				},
			});
		}
		if (statusFilter !== "all") {
			filters.push({ id: "status", value: statusFilter });
		}

		setColumnFilters(filters);
	}, [vehicleTypeFilter, amountMin, amountMax, statusFilter]);

	const clearAllFilters = useCallback(() => {
		setSearchQuery("");
		setVehicleTypeFilter([]);
		setAmountMin("");
		setAmountMax("");
		onStatusFilterChange("COMPLETED");
	}, [onStatusFilterChange]);

	const toggleVehicleType = useCallback((type: string) => {
		setVehicleTypeFilter((prev) =>
			prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
		);
	}, []);

	// Vehicle type column filter
	const vehicleTypeFilterFn: FilterFn<TransformedRide> = useCallback(
		(row, _columnId, filterValue) => {
			const types = filterValue as string[];
			if (!types || types.length === 0) return true;
			return types.includes(row.original.vehicleType || "");
		},
		[],
	);

	// Amount range column filter
	const amountRangeFilterFn: FilterFn<TransformedRide> = useCallback(
		(row, _columnId, filterValue) => {
			const { min, max } = filterValue as {
				min?: number;
				max?: number;
			};
			const amount = row.original.totalAmount;
			if (min !== undefined && amount < min) return false;
			if (max !== undefined && amount > max) return false;
			return true;
		},
		[],
	);

	// Status column filter
	const statusFilterFn: FilterFn<TransformedRide> = useCallback(
		(row, _columnId, filterValue) => {
			if (filterValue === "all") return true;
			return row.original.status === filterValue;
		},
		[],
	);

	const columns = useMemo<ColumnDef<TransformedRide>[]>(
		() => [
			{
				id: "select",
				header: ({ table }) => (
					<Checkbox
						checked={
							table.getFilteredRowModel().rows.length > 0 &&
							table
								.getFilteredRowModel()
								.rows.every((row) => row.getIsSelected())
						}
						onCheckedChange={(value) => {
							// Only toggle filtered rows
							const filteredRows = table.getFilteredRowModel().rows;
							if (value) {
								const newSelection = { ...rowSelection };
								for (const row of filteredRows) {
									newSelection[row.original.rideId] = true;
								}
								onRowSelectionChange(newSelection);
							} else {
								const filteredIds = new Set(
									filteredRows.map((r) => r.original.rideId),
								);
								const newSelection = { ...rowSelection };
								for (const id of filteredIds) {
									delete newSelection[id];
								}
								onRowSelectionChange(newSelection);
							}
						}}
						aria-label="Select all filtered"
					/>
				),
				cell: ({ row }) => (
					<Checkbox
						checked={row.getIsSelected()}
						onCheckedChange={(value) => row.toggleSelected(!!value)}
						aria-label="Select row"
					/>
				),
				enableSorting: false,
				enableHiding: false,
				size: 40,
			},
			{
				accessorKey: "startTime",
				sortingFn: "datetime",
				header: ({ column }) => {
					return (
						<button
							type="button"
							className="flex items-center gap-1 hover:text-foreground transition-colors"
							onClick={() =>
								column.toggleSorting(column.getIsSorted() === "asc")
							}
						>
							Date/Time
							{column.getIsSorted() === "asc" ? (
								<ArrowUp className="h-4 w-4" />
							) : column.getIsSorted() === "desc" ? (
								<ArrowDown className="h-4 w-4" />
							) : (
								<ArrowUpDown className="h-4 w-4 opacity-50" />
							)}
						</button>
					);
				},
				cell: ({ row }) => {
					const startTime = row.getValue("startTime") as string;
					const endTime = row.original.endTime;
					const start = formatDateTime(startTime);
					const end = endTime ? formatDateTime(endTime) : null;

					return (
						<div className="flex flex-col text-sm">
							<span className="font-medium">{start.date}</span>
							{start.time && (
								<span className="text-muted-foreground">
									{start.time}
									{end?.time && ` → ${end.time}`}
								</span>
							)}
						</div>
					);
				},
			},
			{
				id: "route",
				header: "Route",
				cell: ({ row }) => {
					const start = row.original.startLocation;
					const end = row.original.endLocation;

					const truncate = (str: string, len = 40) =>
						str.length > len ? `${str.slice(0, len)}...` : str;

					return (
						<div className="flex flex-col max-w-[350px] text-sm">
							{start && (
								<div className="flex items-start gap-1">
									<span className="text-green-500 font-bold mt-0.5">●</span>
									<span className="truncate" title={start}>
										{truncate(start)}
									</span>
								</div>
							)}
							{end && (
								<div className="flex items-start gap-1">
									<span className="text-red-500 font-bold mt-0.5">●</span>
									<span className="truncate text-muted-foreground" title={end}>
										{truncate(end)}
									</span>
								</div>
							)}
							{!start && !end && (
								<span className="text-muted-foreground italic">
									No route info
								</span>
							)}
						</div>
					);
				},
				enableSorting: false,
			},
			{
				accessorKey: "vehicleType",
				header: "Type",
				cell: ({ row }) => {
					const vehicleType = row.getValue("vehicleType") as string;
					return (
						<Badge variant="secondary" className="gap-1 font-normal">
							{getVehicleIcon(vehicleType)}
							{vehicleType || "Unknown"}
						</Badge>
					);
				},
				filterFn: vehicleTypeFilterFn,
			},
			{
				accessorKey: "status",
				header: () => null,
				cell: () => null,
				filterFn: statusFilterFn,
				enableHiding: true,
				size: 0,
			},
			{
				accessorKey: "driverName",
				header: "Driver",
				cell: ({ row }) => {
					const driver = row.getValue("driverName") as string;
					return driver ? (
						<span className="text-sm font-medium">{driver}</span>
					) : (
						<span className="text-sm text-muted-foreground italic">—</span>
					);
				},
			},
			{
				accessorKey: "totalAmount",
				header: ({ column }) => {
					return (
						<button
							type="button"
							className="flex items-center gap-1 hover:text-foreground transition-colors ml-auto"
							onClick={() =>
								column.toggleSorting(column.getIsSorted() === "asc")
							}
						>
							Amount
							{column.getIsSorted() === "asc" ? (
								<ArrowUp className="h-4 w-4" />
							) : column.getIsSorted() === "desc" ? (
								<ArrowDown className="h-4 w-4" />
							) : (
								<ArrowUpDown className="h-4 w-4 opacity-50" />
							)}
						</button>
					);
				},
				cell: ({ row }) => {
					const amount = row.getValue("totalAmount") as number;
					const currency = row.original.currency;
					const currencySymbol =
						currency === "INR"
							? "₹"
							: currency === "USD"
								? "$"
								: currency === "EUR"
									? "€"
									: currency === "GBP"
										? "£"
										: currency || "₹";

					return (
						<div className="flex items-center justify-end gap-2">
							<span className="text-right font-medium">
								{currencySymbol}
								{amount.toFixed(2)}
							</span>
						</div>
					);
				},
				filterFn: amountRangeFilterFn,
			},
		],
		[
			vehicleTypeFilterFn,
			amountRangeFilterFn,
			statusFilterFn,
			rowSelection,
			onRowSelectionChange,
		],
	);

	const table = useReactTable({
		data: rides,
		columns,
		state: {
			rowSelection,
			sorting,
			globalFilter: searchQuery,
			columnFilters,
		},
		enableRowSelection: true,
		onRowSelectionChange: (updater) => {
			const newSelection =
				typeof updater === "function" ? updater(rowSelection) : updater;
			onRowSelectionChange(newSelection);
		},
		onSortingChange: (updater) => {
			const newSorting =
				typeof updater === "function" ? updater(sorting) : updater;
			onSortingChange(newSorting);
		},
		globalFilterFn,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		getRowId: (row) => row.rideId,
	});

	// Shift+click range selection handler
	const handleRowClick = useCallback(
		(e: React.MouseEvent, rowIndex: number) => {
			const filteredRows = table.getFilteredRowModel().rows;
			const clickedRow = filteredRows[rowIndex];
			if (!clickedRow) return;

			if (e.shiftKey && lastSelectedIndexRef.current !== null) {
				const start = Math.min(lastSelectedIndexRef.current, rowIndex);
				const end = Math.max(lastSelectedIndexRef.current, rowIndex);
				const newSelection = { ...rowSelection };
				for (let i = start; i <= end; i++) {
					const row = filteredRows[i];
					if (row) {
						newSelection[row.original.rideId] = true;
					}
				}
				onRowSelectionChange(newSelection);
			} else {
				clickedRow.toggleSelected();
			}

			lastSelectedIndexRef.current = rowIndex;
		},
		[table, rowSelection, onRowSelectionChange],
	);

	const filteredRowCount = table.getFilteredRowModel().rows.length;
	const totalRowCount = rides.length;
	const selectedCount = Object.keys(rowSelection).length;

	return (
		<div className="flex flex-col gap-4">
			{/* Filter Toolbar */}
			<div className="flex flex-col gap-3 pb-4">
				{/* Row 1: Search + Status */}
				<div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
					{/* Search */}
					<div className="relative flex-1 min-w-0 w-full sm:max-w-sm">
						<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
						<Input
							placeholder="Search rides by location, driver, vehicle..."
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							className="pl-9 h-9"
						/>
						{searchQuery && (
							<button
								type="button"
								onClick={() => setSearchQuery("")}
								className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
							>
								<X className="h-3.5 w-3.5" />
							</button>
						)}
					</div>

					{/* Status Toggle */}
					<div className="flex items-center gap-1.5 rounded-lg border bg-muted/30 p-1">
						<button
							type="button"
							onClick={() => onStatusFilterChange("COMPLETED")}
							className={`px-3 py-1 rounded-md text-sm font-medium transition-all ${
								statusFilter === "COMPLETED"
									? "bg-background text-foreground shadow-sm"
									: "text-muted-foreground hover:text-foreground"
							}`}
						>
							Completed
						</button>
						<button
							type="button"
							onClick={() => onStatusFilterChange("all")}
							className={`px-3 py-1 rounded-md text-sm font-medium transition-all ${
								statusFilter === "all"
									? "bg-background text-foreground shadow-sm"
									: "text-muted-foreground hover:text-foreground"
							}`}
						>
							All
						</button>
					</div>

					{/* Amount Range */}
					<div className="flex items-center gap-1.5">
						<span className="text-sm text-muted-foreground whitespace-nowrap">
							Amount:
						</span>
						<Input
							type="number"
							placeholder="Min"
							value={amountMin}
							onChange={(e) => setAmountMin(e.target.value)}
							className="w-20 h-9 text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
						/>
						<span className="text-muted-foreground">–</span>
						<Input
							type="number"
							placeholder="Max"
							value={amountMax}
							onChange={(e) => setAmountMax(e.target.value)}
							className="w-20 h-9 text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
						/>
					</div>
				</div>

				{/* Row 2: Vehicle Type Chips + Filter info */}
				<div className="flex flex-wrap items-center gap-2">
					{/* Vehicle type chips */}
					{availableVehicleTypes.length > 0 && (
						<>
							<span className="text-sm text-muted-foreground">Type:</span>
							{availableVehicleTypes.map((type) => {
								const isActive = vehicleTypeFilter.includes(type);
								return (
									<button
										key={type}
										type="button"
										onClick={() => toggleVehicleType(type)}
										className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all border ${
											isActive
												? "bg-primary text-primary-foreground border-primary"
												: "bg-muted/50 text-muted-foreground border-transparent hover:bg-muted hover:text-foreground"
										}`}
									>
										{getVehicleIcon(type)}
										{type}
									</button>
								);
							})}
						</>
					)}

					{/* Spacer */}
					<div className="flex-1" />

					{/* Filter info + Clear */}
					<div className="flex items-center gap-2 text-sm">
						<span className="text-muted-foreground">
							{filteredRowCount === totalRowCount
								? `${totalRowCount} rides`
								: `${filteredRowCount} of ${totalRowCount} rides`}
						</span>
						{selectedCount > 0 && (
							<Badge variant="secondary" className="font-normal">
								{selectedCount} selected
							</Badge>
						)}
						{activeFilterCount > 0 && (
							<Button
								variant="ghost"
								size="sm"
								onClick={clearAllFilters}
								className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
							>
								<X className="h-3 w-3" />
								Clear filters
								<Badge
									variant="secondary"
									className="ml-0.5 h-4 min-w-4 px-1 text-[10px]"
								>
									{activeFilterCount}
								</Badge>
							</Button>
						)}
					</div>
				</div>
			</div>

			{/* Table */}
			<div className="rounded-md border">
				<Table>
					<TableHeader>
						{table.getHeaderGroups().map((headerGroup) => (
							<TableRow key={headerGroup.id}>
								{headerGroup.headers.map((header) => {
									// Hide the hidden status column
									if (header.column.id === "status") return null;
									return (
										<TableHead
											key={header.id}
											style={{ width: header.column.getSize() }}
										>
											{header.isPlaceholder
												? null
												: flexRender(
														header.column.columnDef.header,
														header.getContext(),
													)}
										</TableHead>
									);
								})}
							</TableRow>
						))}
					</TableHeader>
					<TableBody>
						{table.getFilteredRowModel().rows?.length ? (
							table.getFilteredRowModel().rows.map((row, index) => (
								<TableRow
									key={row.id}
									data-state={row.getIsSelected() && "selected"}
									className="cursor-pointer hover:bg-muted/50 transition-colors"
									onClick={(e) => handleRowClick(e, index)}
								>
									{row.getVisibleCells().map((cell) => {
										// Hide the hidden status column
										if (cell.column.id === "status") return null;
										return (
											<TableCell key={cell.id}>
												{flexRender(
													cell.column.columnDef.cell,
													cell.getContext(),
												)}
											</TableCell>
										);
									})}
								</TableRow>
							))
						) : (
							<TableRow>
								<TableCell
									colSpan={columns.length - 1}
									className="h-32 text-center"
								>
									<div className="flex flex-col items-center gap-2">
										{totalRowCount === 0 ? (
											<>
												<Car className="h-8 w-8 text-muted-foreground/50" />
												<p className="text-muted-foreground">
													No rides found. Try fetching your ride history.
												</p>
											</>
										) : (
											<>
												<Search className="h-8 w-8 text-muted-foreground/50" />
												<p className="text-muted-foreground">
													No rides match your filters.
												</p>
												<Button
													variant="outline"
													size="sm"
													onClick={clearAllFilters}
													className="mt-1"
												>
													Clear all filters
												</Button>
											</>
										)}
									</div>
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>
			</div>
		</div>
	);
}
