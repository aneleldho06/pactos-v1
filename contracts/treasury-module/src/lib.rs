#![no_std]

//! Protocol-fee configuration and token custody.

use pactos_shared::PactosError;
use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, token, Address, Env};

const MAX_FEE_BPS: u32 = 1_000;
const BPS_DENOMINATOR: i128 = 10_000;
#[contracttype]
#[derive(Clone)]
enum DataKey { Admin, FeeBps }

#[contract]
pub struct TreasuryModule;

#[contractimpl]
impl TreasuryModule {
    pub fn initialize(env: Env, admin: Address, fee_bps: u32) -> Result<(), PactosError> {
        if env.storage().instance().has(&DataKey::Admin) { return Err(PactosError::AlreadyInitialized); }
        if fee_bps > MAX_FEE_BPS { return Err(PactosError::FeeTooHigh); }
        admin.require_auth(); env.storage().instance().set(&DataKey::Admin, &admin); env.storage().instance().set(&DataKey::FeeBps, &fee_bps); Ok(())
    }
    pub fn set_fee_bps(env: Env, fee_bps: u32) -> Result<(), PactosError> {
        Self::admin(&env)?.require_auth(); if fee_bps > MAX_FEE_BPS { return Err(PactosError::FeeTooHigh); }
        env.storage().instance().set(&DataKey::FeeBps, &fee_bps); env.events().publish((symbol_short!("feecfg"),), fee_bps); Ok(())
    }
    pub fn collect(env: Env, payer: Address, asset: Address, gross_amount: i128) -> Result<i128, PactosError> {
        payer.require_auth(); if gross_amount <= 0 { return Err(PactosError::InvalidInput); }
        let bps: u32 = env.storage().instance().get(&DataKey::FeeBps).ok_or(PactosError::NotInitialized)?;
        let fee = gross_amount.checked_mul(bps as i128).ok_or(PactosError::ArithmeticOverflow)?.checked_div(BPS_DENOMINATOR).ok_or(PactosError::ArithmeticOverflow)?;
        if fee > 0 { token::Client::new(&env, &asset).transfer(&payer, &env.current_contract_address(), &fee); }
        env.events().publish((symbol_short!("feecoll"), asset), fee); Ok(fee)
    }
    pub fn withdraw(env: Env, asset: Address, recipient: Address, amount: i128) -> Result<(), PactosError> {
        Self::admin(&env)?.require_auth(); if amount <= 0 { return Err(PactosError::InvalidInput); }
        token::Client::new(&env, &asset).transfer(&env.current_contract_address(), &recipient, &amount);
        env.events().publish((symbol_short!("treas_wd"), asset, recipient), amount); Ok(())
    }
    pub fn fee_bps(env: Env) -> Result<u32, PactosError> { env.storage().instance().get(&DataKey::FeeBps).ok_or(PactosError::NotInitialized) }
    fn admin(env: &Env) -> Result<Address, PactosError> { env.storage().instance().get(&DataKey::Admin).ok_or(PactosError::NotInitialized) }
}
