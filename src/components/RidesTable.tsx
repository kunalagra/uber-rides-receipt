import {
	type ColumnDef,
	flexRender,
	getCoreRowModel,
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
	Truck,
} from "lucide-react";
import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
}

function formatDateTime(dateStr: string): { date: string; time: string } {
	try {
		const d = new Date(dateStr);
		if (Number.isNaN(d.getTime())) {
			// If it's already formatted like "16 Nov 22:33", just return it
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

export function RidesTable({
	rides,
	onRowSelectionChange,
	rowSelection,
	onSortingChange,
	sorting,
}: RidesTableProps) {
	const columns = useMemo<ColumnDef<TransformedRide>[]>(
		() => [
			{
				id: "select",
				header: ({ table }) => (
					<Checkbox
						checked={
							table.getIsAllPageRowsSelected() ||
							(table.getIsSomePageRowsSelected() && "indeterminate")
						}
						onCheckedChange={(value) =>
							table.toggleAllPageRowsSelected(!!value)
						}
						aria-label="Select all"
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

					// Truncate long addresses
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
					const currencySymbol = currency || "₹";

					return (
						<div className="flex items-center justify-end gap-2">
							<span className="text-right font-medium">
								{currencySymbol}
								{amount.toFixed(2)}
							</span>
						</div>
					);
				},
			},
		],
		[],
	);

	const table = useReactTable({
		data: rides,
		columns,
		state: {
			rowSelection,
			sorting,
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
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getRowId: (row) => row.rideId,
	});

	return (
		<div className="rounded-md border">
			<Table>
				<TableHeader>
					{table.getHeaderGroups().map((headerGroup) => (
						<TableRow key={headerGroup.id}>
							{headerGroup.headers.map((header) => (
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
							))}
						</TableRow>
					))}
				</TableHeader>
				<TableBody>
					{table.getRowModel().rows?.length ? (
						table.getRowModel().rows.map((row) => (
							<TableRow
								key={row.id}
								data-state={row.getIsSelected() && "selected"}
								className="cursor-pointer"
								onClick={() => row.toggleSelected()}
							>
								{row.getVisibleCells().map((cell) => (
									<TableCell key={cell.id}>
										{flexRender(cell.column.columnDef.cell, cell.getContext())}
									</TableCell>
								))}
							</TableRow>
						))
					) : (
						<TableRow>
							<TableCell colSpan={columns.length} className="h-24 text-center">
								No rides found. Try fetching your ride history.
							</TableCell>
						</TableRow>
					)}
				</TableBody>
			</Table>
		</div>
	);
}
