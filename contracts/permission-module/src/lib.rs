#![no_std]

//! Agreement-scoped delegation and threshold approval checks.

use pactos_shared::{PactosError, Role};
use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, BytesN, Env, Vec};

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Admin,
    Role(BytesN<32>, Address),
    Approval(BytesN<32>, BytesN<32>, Address),
    Threshold(BytesN<32>),
}

#[contract]
pub struct PermissionModule;

#[contractimpl]
impl PermissionModule {
    pub fn initialize(env: Env, admin: Address) -> Result<(), PactosError> {
        if env.storage().instance().has(&DataKey::Admin) { return Err(PactosError::AlreadyInitialized); }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        Ok(())
    }

    pub fn grant_role(env: Env, agreement_id: BytesN<32>, actor: Address, role: Role) -> Result<(), PactosError> {
        Self::admin(&env)?.require_auth();
        env.storage().persistent().set(&DataKey::Role(agreement_id.clone(), actor.clone()), &role);
        env.events().publish((symbol_short!("rolegrnt"), agreement_id, actor), role);
        Ok(())
    }

    pub fn revoke_role(env: Env, agreement_id: BytesN<32>, actor: Address) -> Result<(), PactosError> {
        Self::admin(&env)?.require_auth();
        env.storage().persistent().remove(&DataKey::Role(agreement_id.clone(), actor.clone()));
        env.events().publish((symbol_short!("rolerevk"), agreement_id), actor);
        Ok(())
    }

    pub fn set_threshold(env: Env, agreement_id: BytesN<32>, threshold: u32) -> Result<(), PactosError> {
        Self::admin(&env)?.require_auth();
        if threshold == 0 { return Err(PactosError::InvalidInput); }
        env.storage().persistent().set(&DataKey::Threshold(agreement_id.clone()), &threshold);
        env.events().publish((symbol_short!("threshold"), agreement_id), threshold);
        Ok(())
    }

    pub fn grant_approval(env: Env, agreement_id: BytesN<32>, action_hash: BytesN<32>, approver: Address) -> Result<(), PactosError> {
        approver.require_auth();
        if !Self::has_role_internal(&env, &agreement_id, &approver, Role::Approver) { return Err(PactosError::Unauthorized); }
        let key = DataKey::Approval(agreement_id.clone(), action_hash.clone(), approver.clone());
        if env.storage().persistent().has(&key) { return Err(PactosError::AlreadyExists); }
        env.storage().persistent().set(&key, &true);
        env.events().publish((symbol_short!("approval"), agreement_id, action_hash), approver);
        Ok(())
    }

    pub fn has_role(env: Env, agreement_id: BytesN<32>, actor: Address, role: Role) -> Result<bool, PactosError> {
        Self::admin(&env)?;
        Ok(Self::has_role_internal(&env, &agreement_id, &actor, role))
    }

    pub fn approvals_met(env: Env, agreement_id: BytesN<32>, action_hash: BytesN<32>, approvers: Vec<Address>) -> Result<bool, PactosError> {
        Self::admin(&env)?;
        let threshold: u32 = env.storage().persistent().get(&DataKey::Threshold(agreement_id.clone())).ok_or(PactosError::NotFound)?;
        let mut count = 0_u32;
        for approver in approvers.iter() {
            if env.storage().persistent().has(&DataKey::Approval(agreement_id.clone(), action_hash.clone(), approver)) {
                count = count.checked_add(1).ok_or(PactosError::ArithmeticOverflow)?;
            }
        }
        Ok(count >= threshold)
    }

    fn has_role_internal(env: &Env, agreement_id: &BytesN<32>, actor: &Address, role: Role) -> bool {
        env.storage().persistent().get(&DataKey::Role(agreement_id.clone(), actor.clone())).map(|stored: Role| stored == role).unwrap_or(false)
    }
    fn admin(env: &Env) -> Result<Address, PactosError> { env.storage().instance().get(&DataKey::Admin).ok_or(PactosError::NotInitialized) }
}
