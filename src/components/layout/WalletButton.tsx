import { useState, useCallback } from "react";
import { Check, Copy, LoaderCircle, Wallet, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { requestWalletAccess, authenticateWallet } from "@/lib/wallet-auth";
import { useSessionStore, type AuthStatus } from "@/lib/stores";
import { cn } from "@/lib/utils";

/* ──────────────────────────────────────────────
   Helpers
   ────────────────────────────────────────────── */

function truncateAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Failed to copy address.");
    }
  }, [text]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="rounded p-1 transition-colors hover:bg-muted"
      aria-label="Copy wallet address"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-success" />
      ) : (
        <Copy className="h-3.5 w-3.5 text-muted-foreground" />
      )}
    </button>
  );
}

/* ──────────────────────────────────────────────
   Wallet status card (shown inside popover)
   ────────────────────────────────────────────── */

function WalletStatusCard({
  walletAddress,
  authStatus,
  authError,
  onRetry,
  onDisconnect,
}: {
  walletAddress: string;
  authStatus: AuthStatus;
  authError: string | null;
  onRetry: () => void;
  onDisconnect: () => void;
}) {
  const isAuthenticated = authStatus === "authenticated";
  const isVerifying = authStatus === "verifying";
  const isFailed = authStatus === "failed";

  return (
    <div className="flex flex-col gap-3">
      {/* Status indicator + address */}
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "h-2.5 w-2.5 shrink-0 rounded-full transition-colors",
            isAuthenticated
              ? "bg-success shadow-[0_0_6px_var(--color-success)]"
              : isFailed
                ? "bg-destructive shadow-[0_0_6px_var(--color-destructive)]"
                : "bg-success shadow-[0_0_6px_var(--color-success)]",
          )}
        />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-foreground">
            {isAuthenticated ? "Authenticated" : "Wallet Connected"}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-xs text-muted-foreground">
              {truncateAddress(walletAddress)}
            </span>
            <CopyButton text={walletAddress} />
          </div>
        </div>
      </div>

      {/* Auth status messages */}
      {isVerifying && (
        <div className="flex items-center gap-2 rounded-sm border border-border bg-muted/50 px-3 py-2">
          <LoaderCircle className="h-3.5 w-3.5 animate-spin text-primary" />
          <span className="text-xs text-muted-foreground">Verifying wallet ownership…</span>
        </div>
      )}

      {isAuthenticated && (
        <div className="flex items-center gap-2 rounded-sm border border-success/30 bg-success/10 px-3 py-2">
          <Check className="h-3.5 w-3.5 text-success" />
          <span className="text-xs font-medium text-success">✅ Authenticated</span>
        </div>
      )}

      {isFailed && (
        <div className="flex flex-col gap-2 rounded-sm border border-destructive/30 bg-destructive/10 px-3 py-2">
          <div className="flex items-center gap-2">
            <XCircle className="h-3.5 w-3.5 text-destructive" />
            <span className="text-xs font-medium text-destructive">Authentication failed</span>
          </div>
          {authError && <p className="pl-5.5 text-xs text-destructive/80">{authError}</p>}
          <Button
            variant="outline"
            size="sm"
            className="mt-1 w-full"
            onClick={onRetry}
          >
            Retry authentication
          </Button>
        </div>
      )}

      {/* Disconnect */}
      <button
        type="button"
        onClick={onDisconnect}
        className="text-xs text-muted-foreground transition-colors hover:text-destructive"
      >
        Disconnect wallet
      </button>
    </div>
  );
}

/* ──────────────────────────────────────────────
   Main WalletButton component
   ────────────────────────────────────────────── */

type WalletButtonProps = {
  variant?: "default" | "ghost";
  size?: "sm" | "default";
  className?: string;
};

export function WalletButton({ variant = "default", size = "sm", className }: WalletButtonProps) {
  const walletAddress = useSessionStore((s) => s.walletAddress);
  const connectionStatus = useSessionStore((s) => s.connectionStatus);
  const authStatus = useSessionStore((s) => s.authStatus);
  const authError = useSessionStore((s) => s.authError);
  const setWalletAddress = useSessionStore((s) => s.setWalletAddress);
  const setConnectionStatus = useSessionStore((s) => s.setConnectionStatus);
  const setAuthStatus = useSessionStore((s) => s.setAuthStatus);
  const setSession = useSessionStore((s) => s.setSession);
  const clearSession = useSessionStore((s) => s.clearSession);
  const resetAuth = useSessionStore((s) => s.resetAuth);

  const [popoverOpen, setPopoverOpen] = useState(false);

  /* ── Step 1: Connect wallet (requestAccess only) ── */
  const connect = useCallback(async () => {
    setConnectionStatus("connecting");
    try {
      const address = await requestWalletAccess();
      setWalletAddress(address);
      setConnectionStatus("connected");
      setAuthStatus("verifying");
      // Step 2 starts automatically
      await authenticate(address);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Wallet connection failed.";
      // requestAccess failed — reset everything
      setConnectionStatus("disconnected");
      setAuthStatus("idle");
      toast.error(message);
    }
  }, []);

  /* ── Step 2: Authenticate (sign + verify) ── */
  const authenticate = useCallback(async (address: string) => {
    setAuthStatus("verifying");
    try {
      const session = await authenticateWallet(address);
      setSession(session);
      // setSession already sets authStatus to "authenticated"
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Authentication failed.";
      setAuthStatus("failed", message);
      // Wallet stays connected — do NOT clear walletAddress
    }
  }, []);

  /* ── Retry authentication ── */
  const retry = useCallback(async () => {
    const address = useSessionStore.getState().walletAddress;
    if (!address) return;
    await authenticate(address);
  }, [authenticate]);

  /* ── Disconnect ── */
  const disconnect = useCallback(() => {
    clearSession();
    setPopoverOpen(false);
  }, []);

  /* ── Connecting state (Freighter popup open) ── */
  const isConnecting = connectionStatus === "connecting";

  /* ── Connected: show popover trigger ── */
  const isConnected = connectionStatus === "connected" && walletAddress;

  if (isConnected) {
    const isAuthenticated = authStatus === "authenticated";
    const isFailed = authStatus === "failed";

    return (
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <Button
            variant={variant}
            size={size}
            className={cn(
              "gap-2 transition-colors",
              isAuthenticated && "border-success/50 text-success",
              isFailed && "border-destructive/50 text-destructive",
              className,
            )}
          >
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                isAuthenticated
                  ? "bg-success shadow-[0_0_4px_var(--color-success)]"
                  : isFailed
                    ? "bg-destructive shadow-[0_0_4px_var(--color-destructive)]"
                    : "bg-success shadow-[0_0_4px_var(--color-success)]",
              )}
            />
            {truncateAddress(walletAddress)}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          sideOffset={8}
          className="w-72 border-[3px] border-foreground bg-card shadow-[4px_4px_0_0_var(--color-foreground)]"
        >
          <WalletStatusCard
            walletAddress={walletAddress}
            authStatus={authStatus}
            authError={authError}
            onRetry={retry}
            onDisconnect={disconnect}
          />
        </PopoverContent>
      </Popover>
    );
  }

  /* ── Disconnected / Connecting ── */
  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      onClick={connect}
      disabled={isConnecting}
    >
      {isConnecting ? (
        <LoaderCircle className="h-4 w-4 animate-spin" />
      ) : (
        <Wallet className="h-4 w-4" />
      )}
      {isConnecting ? "Connecting…" : "Connect wallet"}
    </Button>
  );
}
