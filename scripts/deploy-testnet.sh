#!/usr/bin/env bash
set -euo pipefail

# Requires: stellar CLI >= 27 and a funded source identity (see .env.example).
: "${STELLAR_NETWORK:=testnet}"
: "${STELLAR_SOURCE_ACCOUNT:?Set STELLAR_SOURCE_ACCOUNT to a Stellar CLI identity alias}"

stellar contract build
for contract in agreement_registry permission_module distribution_module escrow_module treasury_module audit_module agreement_runtime; do
  wasm="target/wasm32v1-none/release/${contract}.wasm"
  stellar contract deploy --wasm "$wasm" --source-account "$STELLAR_SOURCE_ACCOUNT" --network "$STELLAR_NETWORK" --alias "pactos_${contract}"
done
