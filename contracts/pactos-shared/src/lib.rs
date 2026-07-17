#![no_std]

//! Shared, storage-efficient PactOS contract types.

use soroban_sdk::{contracterror, contracttype, Address, BytesN, Vec};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum PactosError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    NotFound = 4,
    AlreadyExists = 5,
    InvalidInput = 6,
    InvalidStateTransition = 7,
    InvalidStatus = 8,
    ArithmeticOverflow = 9,
    InvalidSplit = 10,
    Expired = 11,
    NotExpired = 12,
    AlreadyReleased = 13,
    AlreadyRefunded = 14,
    MissingApproval = 15,
    ReentrantExecution = 16,
    ProgramInvalid = 17,
    ProgramTooLarge = 18,
    FeeTooHigh = 19,
    InsufficientBalance = 20,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum AgreementStatus {
    Draft,
    Deployed,
    Funded,
    Active,
    Executing,
    Paused,
    Completed,
    Cancelled,
    Archived,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Opcode {
    When,
    If,
    Wait,
    Transfer,
    Split,
    Escrow,
    Approve,
    Return,
    Notify,
    End,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Role {
    Owner,
    Operator,
    Approver,
    Auditor,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Agreement {
    pub id: BytesN<32>,
    pub creator: Address,
    pub participants: Vec<Address>,
    pub asset: Address,
    pub rule_hash: BytesN<32>,
    pub metadata_hash: BytesN<32>,
    pub schedule: u64,
    pub status: AgreementStatus,
    pub version: u32,
    pub created_at: u64,
    pub updated_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SplitRecipient {
    pub recipient: Address,
    pub basis_points: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AdlInstruction {
    pub opcode: Opcode,
    /// Hash/reference to off-chain compiled operands; never stores large metadata on-chain.
    pub operand_hash: BytesN<32>,
    pub next: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EscrowRecord {
    pub id: BytesN<32>,
    pub depositor: Address,
    pub beneficiary: Address,
    pub asset: Address,
    pub amount: i128,
    pub expires_at: u64,
    pub released: bool,
    pub refunded: bool,
}
