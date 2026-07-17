#![no_std]

//! Canonical registry for PactOS agreement identity, ownership, and lifecycle.

use pactos_shared::{Agreement, AgreementStatus, PactosError};
use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, BytesN, Env};

const INSTANCE_TTL_THRESHOLD: u32 = 1_000;
const INSTANCE_TTL_BUMP: u32 = 100_000;

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Admin,
    Agreement(BytesN<32>),
}

#[contract]
pub struct AgreementRegistry;

#[contractimpl]
impl AgreementRegistry {
    pub fn initialize(env: Env, admin: Address) -> Result<(), PactosError> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(PactosError::AlreadyInitialized);
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        Self::bump_instance(&env);
        Ok(())
    }

    pub fn register(env: Env, agreement: Agreement) -> Result<(), PactosError> {
        Self::require_initialized(&env)?;
        agreement.creator.require_auth();
        if agreement.id == BytesN::from_array(&env, &[0; 32])
            || agreement.participants.len() == 0
            || agreement.version != 1
            || agreement.status != AgreementStatus::Draft
        {
            return Err(PactosError::InvalidInput);
        }
        let key = DataKey::Agreement(agreement.id.clone());
        if env.storage().persistent().has(&key) {
            return Err(PactosError::AlreadyExists);
        }
        let mut stored = agreement;
        let now = env.ledger().timestamp();
        stored.created_at = now;
        stored.updated_at = now;
        env.storage().persistent().set(&key, &stored);
        env.events().publish((symbol_short!("agrc"), stored.id.clone()), stored.creator.clone());
        Ok(())
    }

    pub fn get(env: Env, id: BytesN<32>) -> Result<Agreement, PactosError> {
        Self::require_initialized(&env)?;
        env.storage().persistent().get(&DataKey::Agreement(id)).ok_or(PactosError::NotFound)
    }

    pub fn transition(env: Env, id: BytesN<32>, next: AgreementStatus) -> Result<Agreement, PactosError> {
        let admin = Self::admin(&env)?;
        let key = DataKey::Agreement(id.clone());
        let mut agreement: Agreement = env.storage().persistent().get(&key).ok_or(PactosError::NotFound)?;
        if agreement.creator != admin { agreement.creator.require_auth(); } else { admin.require_auth(); }
        if !Self::valid_transition(&agreement.status, &next) {
            return Err(PactosError::InvalidStateTransition);
        }
        agreement.status = next;
        agreement.version = agreement.version.checked_add(1).ok_or(PactosError::ArithmeticOverflow)?;
        agreement.updated_at = env.ledger().timestamp();
        env.storage().persistent().set(&key, &agreement);
        env.events().publish((symbol_short!("agrs"), id), agreement.status.clone());
        Ok(agreement)
    }

    pub fn update_hashes(env: Env, id: BytesN<32>, rule_hash: BytesN<32>, metadata_hash: BytesN<32>) -> Result<(), PactosError> {
        let key = DataKey::Agreement(id.clone());
        let mut agreement: Agreement = env.storage().persistent().get(&key).ok_or(PactosError::NotFound)?;
        agreement.creator.require_auth();
        if agreement.status != AgreementStatus::Draft && agreement.status != AgreementStatus::Paused {
            return Err(PactosError::InvalidStatus);
        }
        agreement.rule_hash = rule_hash;
        agreement.metadata_hash = metadata_hash;
        agreement.version = agreement.version.checked_add(1).ok_or(PactosError::ArithmeticOverflow)?;
        agreement.updated_at = env.ledger().timestamp();
        env.storage().persistent().set(&key, &agreement);
        env.events().publish((symbol_short!("agru"), id), agreement.version);
        Ok(())
    }

    fn valid_transition(current: &AgreementStatus, next: &AgreementStatus) -> bool {
        matches!(
            (current, next),
            (AgreementStatus::Draft, AgreementStatus::Deployed)
                | (AgreementStatus::Draft, AgreementStatus::Cancelled)
                | (AgreementStatus::Deployed, AgreementStatus::Funded)
                | (AgreementStatus::Deployed, AgreementStatus::Paused)
                | (AgreementStatus::Funded, AgreementStatus::Active)
                | (AgreementStatus::Funded, AgreementStatus::Cancelled)
                | (AgreementStatus::Active, AgreementStatus::Executing)
                | (AgreementStatus::Active, AgreementStatus::Paused)
                | (AgreementStatus::Active, AgreementStatus::Completed)
                | (AgreementStatus::Executing, AgreementStatus::Active)
                | (AgreementStatus::Executing, AgreementStatus::Paused)
                | (AgreementStatus::Executing, AgreementStatus::Completed)
                | (AgreementStatus::Paused, AgreementStatus::Active)
                | (AgreementStatus::Paused, AgreementStatus::Cancelled)
                | (AgreementStatus::Completed, AgreementStatus::Archived)
                | (AgreementStatus::Cancelled, AgreementStatus::Archived)
        )
    }

    fn require_initialized(env: &Env) -> Result<(), PactosError> { Self::admin(env).map(|_| ()) }
    fn admin(env: &Env) -> Result<Address, PactosError> { env.storage().instance().get(&DataKey::Admin).ok_or(PactosError::NotInitialized) }
    fn bump_instance(env: &Env) { env.storage().instance().extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_BUMP); }
}
