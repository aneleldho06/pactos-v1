import { getNetwork, requestAccess, signMessage } from "@stellar/freighter-api";
import { api, type AuthSession } from "./api";
import { config } from "./config";

function errorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error) return String(error.message);
  return "The wallet request could not be completed.";
}

function signatureToBase64(signature: string | { toString(encoding?: string): string }) {
  return typeof signature === "string" ? signature : signature.toString("base64");
}

/**
 * Step 1: Request wallet access from Freighter.
 * Returns the wallet address immediately — no signature or backend call yet.
 */
export async function requestWalletAccess(signal?: AbortSignal): Promise<string> {
  const access = await requestAccess();
  if (access.error || !access.address) throw new Error(errorMessage(access.error));

  const network = await getNetwork();
  if (network.error || network.networkPassphrase !== config.stellarNetworkPassphrase) {
    throw new Error("Switch Freighter to Stellar Testnet before signing in.");
  }

  return access.address;
}

/**
 * Step 2: Authenticate a connected wallet by signing a challenge.
 * Requires the wallet address already obtained from requestWalletAccess().
 */
export async function authenticateWallet(
  walletAddress: string,
  signal?: AbortSignal,
): Promise<AuthSession> {
  const challenge = await api.auth.challenge(walletAddress, signal);
  const signed = await signMessage(challenge.message, {
    address: walletAddress,
    networkPassphrase: config.stellarNetworkPassphrase,
  });
  if (signed.error || !signed.signedMessage) throw new Error(errorMessage(signed.error));
  if (signed.signerAddress !== walletAddress)
    throw new Error("Freighter signed with a different wallet address.");

  return api.auth.verify(
    {
      walletAddress,
      nonce: challenge.nonce,
      signature: signatureToBase64(signed.signedMessage),
    },
    signal,
  );
}

/**
 * Full flow: requestAccess + authenticate in one call.
 * Kept for backward compatibility — existing callers are unaffected.
 */
export async function authenticateWithFreighter(signal?: AbortSignal): Promise<AuthSession> {
  const address = await requestWalletAccess(signal);
  return authenticateWallet(address, signal);
}
