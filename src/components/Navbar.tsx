import { Key, LogOut, Moon, MoreVertical, Sun, User } from "lucide-react";
import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type {
	ProviderDescriptor,
	ProviderId,
	ProviderUser,
} from "@/providers/types";

interface NavbarProps {
	user: ProviderUser | null;
	isAuthenticated: boolean;
	providers: ProviderDescriptor[];
	selectedProviderId: ProviderId;
	onSelectProvider: (id: ProviderId) => void;
	onOpenAuthModal: () => void;
	onLogout: () => void;
}

export function Navbar({
	user,
	isAuthenticated,
	providers,
	selectedProviderId,
	onSelectProvider,
	onOpenAuthModal,
	onLogout,
}: NavbarProps) {
	const [isDarkMode, setIsDarkMode] = useState(() => {
		if (typeof window !== "undefined") {
			return document.documentElement.classList.contains("dark");
		}
		return false;
	});

	const toggleDarkMode = () => {
		const newMode = !isDarkMode;
		setIsDarkMode(newMode);
		if (newMode) {
			document.documentElement.classList.add("dark");
			localStorage.setItem("theme", "dark");
		} else {
			document.documentElement.classList.remove("dark");
			localStorage.setItem("theme", "light");
		}
	};

	const userInitials = user
		? `${user.firstName?.[0] || ""}${user.lastName?.[0] || ""}`
		: "";

	return (
		<nav className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
			<div className="container mx-auto flex h-14 items-center justify-between px-4">
				{/* Provider switcher */}
				<div className="flex items-center gap-1 rounded-lg border bg-muted/30 p-1">
					{providers.map((p) => {
						const Icon = p.icon;
						const isActive = p.id === selectedProviderId;
						return (
							<button
								key={p.id}
								type="button"
								onClick={() => onSelectProvider(p.id)}
								className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-sm font-medium transition-all ${
									isActive
										? "bg-background text-foreground shadow-sm"
										: "text-muted-foreground hover:text-foreground"
								}`}
							>
								<Icon className="h-4 w-4" />
								<span className="hidden sm:inline">{p.name}</span>
							</button>
						);
					})}
				</div>

				{/* Right side actions */}
				<div className="flex items-center gap-2">
					{/* Dark mode toggle */}
					<Button
						variant="ghost"
						size="icon"
						onClick={toggleDarkMode}
						title={isDarkMode ? "Light mode" : "Dark mode"}
					>
						{isDarkMode ? (
							<Sun className="h-5 w-5" />
						) : (
							<Moon className="h-5 w-5" />
						)}
					</Button>

					{/* Profile dropdown */}
					<DropdownMenu>
						<DropdownMenuGroup>
							<DropdownMenuTrigger
								render={(props) =>
									isAuthenticated && user ? (
										<Button
											{...props}
											variant="ghost"
											className="relative h-9 w-9 rounded-full"
										>
											<Avatar className="h-9 w-9">
												<AvatarImage
													src={user.pictureUrl}
													alt={`${user.firstName}'s profile`}
												/>
												<AvatarFallback className="bg-primary text-primary-foreground">
													{userInitials}
												</AvatarFallback>
											</Avatar>
										</Button>
									) : (
										<Button {...props} variant="ghost" size="icon">
											<MoreVertical className="h-5 w-5" />
										</Button>
									)
								}
							/>
							<DropdownMenuContent align="end" className="w-56">
								{isAuthenticated && user ? (
									<>
										<DropdownMenuLabel className="font-normal">
											<div className="flex flex-col space-y-1">
												<p className="text-sm font-medium leading-none">
													{user.firstName} {user.lastName}
												</p>
												<p className="text-xs leading-none text-muted-foreground">
													{user.email}
												</p>
											</div>
										</DropdownMenuLabel>
										<DropdownMenuSeparator />
										<DropdownMenuItem onClick={onOpenAuthModal}>
											<Key className="mr-2 h-4 w-4" />
											Update Auth
										</DropdownMenuItem>
										<DropdownMenuSeparator />
										<DropdownMenuItem onClick={onLogout}>
											<LogOut className="mr-2 h-4 w-4" />
											Logout
										</DropdownMenuItem>
									</>
								) : (
									<DropdownMenuItem onClick={onOpenAuthModal}>
										<User className="mr-2 h-4 w-4" />
										Connect Account
									</DropdownMenuItem>
								)}
							</DropdownMenuContent>
						</DropdownMenuGroup>
					</DropdownMenu>
				</div>
			</div>
		</nav>
	);
}
