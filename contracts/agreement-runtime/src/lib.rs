#![no_std]

//! Deterministic ADL program registry and execution coordinator.
//!
//! Operand values are committed by hash. Token settlement is delegated to the
//! distribution/escrow contracts so each financial primitive has a small audit surface.

use pactos_shared::{AdlInstruction, Opcode, PactosError};
use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, BytesN, Env, Vec};

const MAX_INSTRUCTIONS: u32 = 64;
#[contracttype]
#[derive(Clone)]
enum DataKey { Admin, Program(BytesN<32>), Locked(BytesN<32>), ExecutionNonce(BytesN<32>) }

#[contract]
pub struct AgreementRuntime;

#[contractimpl]
impl AgreementRuntime {
    pub fn initialize(env: Env, admin: Address) -> Result<(), PactosError> {
        if env.storage().instance().has(&DataKey::Admin) { return Err(PactosError::AlreadyInitialized); }
        admin.require_auth(); env.storage().instance().set(&DataKey::Admin, &admin); Ok(())
    }
    /// Installs a compiled, bounded ADL program. The registry owner must authorize this call.
    pub fn install_program(env: Env, agreement_id: BytesN<32>, owner: Address, program: Vec<AdlInstruction>) -> Result<(), PactosError> {
        owner.require_auth(); Self::admin(&env)?;
        Self::validate_program(&program)?;
        let key = DataKey::Program(agreement_id.clone());
        if env.storage().persistent().has(&key) { return Err(PactosError::AlreadyExists); }
        env.storage().persistent().set(&key, &program);
        env.events().publish((symbol_short!("proginst"), agreement_id), program.len()); Ok(())
    }
    /// Executes only deterministic control-flow steps. Settlement opcodes are emitted with their
    /// operand commitment and must be fulfilled atomically by the calling orchestration transaction.
    pub fn execute(env: Env, agreement_id: BytesN<32>, executor: Address) -> Result<u64, PactosError> {
        executor.require_auth(); Self::admin(&env)?;
        let lock_key = DataKey::Locked(agreement_id.clone());
        if env.storage().temporary().has(&lock_key) { return Err(PactosError::ReentrantExecution); }
        env.storage().temporary().set(&lock_key, &true);
        let result = Self::execute_inner(&env, agreement_id.clone());
        env.storage().temporary().remove(&lock_key);
        result
    }
    pub fn execution_nonce(env: Env, agreement_id: BytesN<32>) -> u64 { env.storage().persistent().get(&DataKey::ExecutionNonce(agreement_id)).unwrap_or(0) }

    fn execute_inner(env: &Env, agreement_id: BytesN<32>) -> Result<u64, PactosError> {
        let program: Vec<AdlInstruction> = env.storage().persistent().get(&DataKey::Program(agreement_id.clone())).ok_or(PactosError::NotFound)?;
        let key = DataKey::ExecutionNonce(agreement_id.clone()); let current: u64 = env.storage().persistent().get(&key).unwrap_or(0);
        let nonce = current.checked_add(1).ok_or(PactosError::ArithmeticOverflow)?;
        env.events().publish((symbol_short!("execstart"), agreement_id.clone(), nonce), ());
        for instruction in program.iter() {
            env.events().publish((symbol_short!("adl_step"), agreement_id.clone(), nonce), (instruction.opcode, instruction.operand_hash));
        }
        env.storage().persistent().set(&key, &nonce);
        env.events().publish((symbol_short!("exec_done"), agreement_id, nonce), ()); Ok(nonce)
    }
    fn validate_program(program: &Vec<AdlInstruction>) -> Result<(), PactosError> {
        let len = program.len();
        if len == 0 || len > MAX_INSTRUCTIONS { return Err(PactosError::ProgramTooLarge); }
        let last = program.get(len - 1).ok_or(PactosError::ProgramInvalid)?;
        if last.opcode != Opcode::End || last.next != len { return Err(PactosError::ProgramInvalid); }
        for (index, instruction) in program.iter().enumerate() {
            if instruction.next > len || (instruction.opcode != Opcode::End && instruction.next <= index as u32) { return Err(PactosError::ProgramInvalid); }
        }
        Ok(())
    }
    fn admin(env: &Env) -> Result<Address, PactosError> { env.storage().instance().get(&DataKey::Admin).ok_or(PactosError::NotInitialized) }
}
