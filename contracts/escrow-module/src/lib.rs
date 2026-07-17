#![no_std]

//! Custodial milestone escrow. Assets are held by this contract address until settlement.

use pactos_shared::{EscrowRecord, PactosError};
use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, token, Address, BytesN, Env};

#[contracttype]
#[derive(Clone)]
enum DataKey { Admin, Escrow(BytesN<32>) }

#[contract]
pub struct EscrowModule;

#[contractimpl]
impl EscrowModule {
    pub fn initialize(env: Env, admin: Address) -> Result<(), PactosError> {
        if env.storage().instance().has(&DataKey::Admin) { return Err(PactosError::AlreadyInitialized); }
        admin.require_auth(); env.storage().instance().set(&DataKey::Admin, &admin); Ok(())
    }
    pub fn lock(env: Env, id: BytesN<32>, depositor: Address, beneficiary: Address, asset: Address, amount: i128, expires_at: u64) -> Result<(), PactosError> {
        if amount <= 0 || expires_at <= env.ledger().timestamp() { return Err(PactosError::InvalidInput); }
        depositor.require_auth();
        let key = DataKey::Escrow(id.clone());
        if env.storage().persistent().has(&key) { return Err(PactosError::AlreadyExists); }
        let vault = env.current_contract_address();
        token::Client::new(&env, &asset).transfer(&depositor, &vault, &amount);
        let record = EscrowRecord { id: id.clone(), depositor, beneficiary, asset, amount, expires_at, released: false, refunded: false };
        env.storage().persistent().set(&key, &record);
        env.events().publish((symbol_short!("esclock"), id), amount); Ok(())
    }
    pub fn release(env: Env, id: BytesN<32>) -> Result<(), PactosError> {
        Self::admin(&env)?.require_auth();
        let key = DataKey::Escrow(id.clone()); let mut record: EscrowRecord = env.storage().persistent().get(&key).ok_or(PactosError::NotFound)?;
        if record.released { return Err(PactosError::AlreadyReleased); }
        if record.refunded { return Err(PactosError::AlreadyRefunded); }
        token::Client::new(&env, &record.asset).transfer(&env.current_contract_address(), &record.beneficiary, &record.amount);
        record.released = true; env.storage().persistent().set(&key, &record);
        env.events().publish((symbol_short!("escrel"), id), record.amount); Ok(())
    }
    pub fn refund(env: Env, id: BytesN<32>) -> Result<(), PactosError> {
        let key = DataKey::Escrow(id.clone()); let mut record: EscrowRecord = env.storage().persistent().get(&key).ok_or(PactosError::NotFound)?;
        if record.released { return Err(PactosError::AlreadyReleased); }
        if record.refunded { return Err(PactosError::AlreadyRefunded); }
        if env.ledger().timestamp() < record.expires_at { return Err(PactosError::NotExpired); }
        token::Client::new(&env, &record.asset).transfer(&env.current_contract_address(), &record.depositor, &record.amount);
        record.refunded = true; env.storage().persistent().set(&key, &record);
        env.events().publish((symbol_short!("escrefund"), id), record.amount); Ok(())
    }
    pub fn get(env: Env, id: BytesN<32>) -> Result<EscrowRecord, PactosError> { env.storage().persistent().get(&DataKey::Escrow(id)).ok_or(PactosError::NotFound) }
    fn admin(env: &Env) -> Result<Address, PactosError> { env.storage().instance().get(&DataKey::Admin).ok_or(PactosError::NotInitialized) }
}
