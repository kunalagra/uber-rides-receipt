import { AlertCircle, Loader2 } from "lucide-react";
import { useId, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { fetchCurrentUser } from "@/server/uber-api";
import type { UberAuthCredentials, UberCurrentUser } from "@/types/uber-api";

interface AuthSetupModalProps {
	onAuthSuccess: (auth: UberAuthCredentials, user: UberCurrentUser) => void;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function AuthSetupModal({
	onAuthSuccess,
	open,
	onOpenChange,
}: AuthSetupModalProps) {
	const cookieId = useId();
	const [cookie, setCookie] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleSubmit = async () => {
		if (!cookie.trim()) {
			setError("Cookie is required");
			return;
		}

		setIsLoading(true);
		setError(null);

		try {
			const auth: UberAuthCredentials = {
				cookie: cookie.trim(),
				csrfToken: "x",
			};

			// Test the credentials by fetching current user
			const result = await fetchCurrentUser({ data: { auth } });

			if (result.error || !result.user) {
				setError(
					result.error ||
						"Failed to authenticate. Please check your credentials.",
				);
				return;
			}

			// Store auth in localStorage
			localStorage.setItem("uber_auth", JSON.stringify(auth));

			// Call success callback
			onAuthSuccess(auth, result.user);
			onOpenChange(false);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Authentication failed");
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-2xl w-[95vw] max-h-[90vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>Connect Your Uber Account</DialogTitle>
					<DialogDescription>
						To fetch your ride history, you need to provide your Uber session
						cookies. Follow the instructions below.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					<Alert>
						<AlertCircle className="h-4 w-4" />
						<AlertDescription>
							<strong>How to get your cookies:</strong>
							<ol className="mt-2 ml-4 list-decimal space-y-1 text-sm">
								<li>
									Open{" "}
									<a
										href="https://riders.uber.com"
										target="_blank"
										rel="noopener noreferrer"
										className="underline text-primary"
									>
										riders.uber.com
									</a>{" "}
									and log in
								</li>
								<li>Open Developer Tools (F12 or Cmd+Option+I)</li>
								<li>Go to the Network tab</li>
								<li>Refresh the page</li>
								<li>
									Click on any "graphql" request and copy the "cookie" header
									value
								</li>
							</ol>
						</AlertDescription>
					</Alert>

					<div className="space-y-2">
						<Label htmlFor={cookieId}>Cookie Header</Label>
						<Textarea
							id={cookieId}
							placeholder="Paste your cookie header value here..."
							value={cookie}
							onChange={(e) => setCookie(e.target.value)}
							className="h-[120px] font-mono text-xs w-full resize-none overflow-y-auto overflow-x-hidden break-all"
						/>
					</div>

					{error && (
						<Alert variant="destructive">
							<AlertCircle className="h-4 w-4" />
							<AlertDescription>{error}</AlertDescription>
						</Alert>
					)}

					<div className="flex justify-end gap-2">
						<Button variant="outline" onClick={() => onOpenChange(false)}>
							Cancel
						</Button>
						<Button onClick={handleSubmit} disabled={isLoading}>
							{isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
							{isLoading ? "Connecting..." : "Connect"}
						</Button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
