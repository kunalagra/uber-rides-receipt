import { AlertCircle, Loader2 } from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ProviderDescriptor, ProviderUser } from "@/providers/types";

interface AuthSetupModalProps {
	provider: ProviderDescriptor;
	onAuthSuccess: (auth: unknown, user: ProviderUser) => void;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function AuthSetupModal({
	provider,
	onAuthSuccess,
	open,
	onOpenChange,
}: AuthSetupModalProps) {
	const [values, setValues] = useState<Record<string, string>>({});
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const setField = (key: string, value: string) => {
		setValues((prev) => ({ ...prev, [key]: value }));
	};

	const handleSubmit = async () => {
		const missing = provider.auth.fields.find(
			(field) => !values[field.key]?.trim(),
		);
		if (missing) {
			setError(`${missing.label} is required`);
			return;
		}

		setIsLoading(true);
		setError(null);

		try {
			const result = await provider.connect(values);

			if ("error" in result) {
				setError(result.error);
				return;
			}

			localStorage.setItem(
				provider.authStorageKey,
				JSON.stringify(result.auth),
			);
			onAuthSuccess(result.auth, result.user);
			onOpenChange(false);
			setValues({});
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
					<DialogTitle>Connect Your {provider.name} Account</DialogTitle>
					<DialogDescription>
						To fetch your ride history, provide your {provider.name} session
						credentials. Follow the instructions below.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					<Alert>
						<AlertCircle className="h-4 w-4" />
						<AlertDescription>{provider.auth.instructions}</AlertDescription>
					</Alert>

					{provider.auth.fields.map((field) => (
						<div key={field.key} className="space-y-2">
							<Label htmlFor={`auth-${field.key}`}>{field.label}</Label>
							{field.type === "textarea" ? (
								<Textarea
									id={`auth-${field.key}`}
									placeholder={field.placeholder}
									value={values[field.key] ?? ""}
									onChange={(e) => setField(field.key, e.target.value)}
									className="h-[120px] font-mono text-xs w-full resize-none overflow-y-auto overflow-x-hidden break-all"
								/>
							) : (
								<Input
									id={`auth-${field.key}`}
									placeholder={field.placeholder}
									value={values[field.key] ?? ""}
									onChange={(e) => setField(field.key, e.target.value)}
									className="font-mono text-xs"
								/>
							)}
						</div>
					))}

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
