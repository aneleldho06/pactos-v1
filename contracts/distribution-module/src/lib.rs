#![no_std]

//! Atomic basis-point settlement for a single Soroban token asset.

use pactos_shared::{PactosError, SplitRecipient};
use soroban_sdk::{contract, contractimpl, symbol_short, token, Address, Env, Vec};

const BPS_DENOMINATOR: u32 = 10_000;

#[contract]
pub struct DistributionModule;

#[contractimpl]
impl DistributionModule {
    /// Transfers the full amount atomically. Any failed recipient transfer reverts all transfers.
    pub fn distribute(env: Env, payer: Address, asset: Address, amount: i128, recipients: Vec<SplitRecipient>) -> Result<(), PactosError> {
        payer.require_auth();
        if amount <= 0 || recipients.len() == 0 { return Err(PactosError::InvalidInput); }
        let mut total_bps = 0_u32;
        for recipient in recipients.iter() {
            if recipient.basis_points == 0 { return Err(PactosError::InvalidSplit); }
            total_bps = total_bps.checked_add(recipient.basis_points).ok_or(PactosError::ArithmeticOverflow)?;
        }
        if total_bps != BPS_DENOMINATOR { return Err(PactosError::InvalidSplit); }
        let token = token::Client::new(&env, &asset);
        let mut paid = 0_i128;
        for (index, recipient) in recipients.iter().enumerate() {
            // Assign integer-division dust to the final recipient so the debited amount is exact.
            let payout = if index as u32 + 1 == recipients.len() {
                amount.checked_sub(paid).ok_or(PactosError::ArithmeticOverflow)?
            } else {
                amount.checked_mul(recipient.basis_points as i128).ok_or(PactosError::ArithmeticOverflow)?
                    .checked_div(BPS_DENOMINATOR as i128).ok_or(PactosError::ArithmeticOverflow)?
            };
            paid = paid.checked_add(payout).ok_or(PactosError::ArithmeticOverflow)?;
            token.transfer(&payer, &recipient.recipient, &payout);
            env.events().publish((symbol_short!("payout"), asset.clone(), recipient.recipient), payout);
        }
        Ok(())
    }
}
