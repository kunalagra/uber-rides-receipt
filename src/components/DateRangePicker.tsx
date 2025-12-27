import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { DateRange } from "@/types/rides";

interface DateRangePickerProps {
	dateRange: DateRange;
	onDateRangeChange: (range: DateRange) => void;
	className?: string;
}

export function DateRangePicker({
	dateRange,
	onDateRangeChange,
	className,
}: DateRangePickerProps) {
	const [isOpen, setIsOpen] = useState(false);

	const handleSelect = (range: { from?: Date; to?: Date } | undefined) => {
		if (range) {
			onDateRangeChange({
				from: range.from,
				to: range.to,
			});
		}
	};

	return (
		<Popover open={isOpen} onOpenChange={setIsOpen}>
			<PopoverTrigger
				render={(props) => (
					<Button
						{...props}
						variant="outline"
						className={cn(
							"w-[280px] justify-start text-left font-normal",
							!dateRange.from && "text-muted-foreground",
							className,
						)}
					>
						<CalendarIcon className="mr-2 h-4 w-4" />
						{dateRange.from ? (
							dateRange.to ? (
								<>
									{format(dateRange.from, "LLL dd, y")} -{" "}
									{format(dateRange.to, "LLL dd, y")}
								</>
							) : (
								format(dateRange.from, "LLL dd, y")
							)
						) : (
							<span>Pick a date range</span>
						)}
					</Button>
				)}
			/>
			<PopoverContent className="w-auto p-0" align="start">
				<Calendar
					initialFocus
					mode="range"
					defaultMonth={dateRange.from}
					selected={{
						from: dateRange.from,
						to: dateRange.to,
					}}
					onSelect={handleSelect}
					numberOfMonths={2}
				/>
			</PopoverContent>
		</Popover>
	);
}
