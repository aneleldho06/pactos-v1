#![no_std]

//! Compact, immutable execution receipts. Indexed details belong in events/off-chain indexers.

use pactos_shared::PactosError;
use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, BytesN, Env};

#[contracttype]
#[derive(Clone)]
enum DataKey { Admin, Sequence(BytesN<32>) }

#[contract]
pub struct AuditModule;

#[contractimpl]
impl AuditModule {
    pub fn initialize(env: Env, admin: Address) -> Result<(), PactosError> {
        if env.storage().instance().has(&DataKey::Admin) { return Err(PactosError::AlreadyInitialized); }
        admin.require_auth(); env.storage().instance().set(&DataKey::Admin, &admin); Ok(())
    }
    /// Only the configured runtime may append records; event data is a compact immutable hash.
    pub fn record(env: Env, agreement_id: BytesN<32>, execution_hash: BytesN<32>) -> Result<u64, PactosError> {
        Self::admin(&env)?.require_auth();
        let key = DataKey::Sequence(agreement_id.clone()); let sequence: u64 = env.storage().persistent().get(&key).unwrap_or(0);
        let next = sequence.checked_add(1).ok_or(PactosError::ArithmeticOverflow)?;
        env.storage().persistent().set(&key, &next);
        env.events().publish((symbol_short!("audit_rec"), agreement_id, next), execution_hash); Ok(next)
    }
    pub fn sequence(env: Env, agreement_id: BytesN<32>) -> u64 { env.storage().persistent().get(&DataKey::Sequence(agreement_id)).unwrap_or(0) }
    fn admin(env: &Env) -> Result<Address, PactosError> { env.storage().instance().get(&DataKey::Admin).ok_or(PactosError::NotInitialized) }
}
