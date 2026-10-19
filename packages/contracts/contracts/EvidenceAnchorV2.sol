// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

/// @title EvidenceAnchorV2
/// @notice Anchors DigiVault document-version commitments (docs/03 §v2) and
///         heads of the hash-chained audit log, for public, independent
///         verification. Stores hashes only: no documents, no PII.
/// @dev    Differences from v1 (ADR-019, ADR-028):
///         - two-step ownership transfer, so a typo can't brick the contract;
///         - writes come from an owner-managed allow-list of anchorers, so the
///           signing key can be rotated without redeploying;
///         - a compromised anchorer can be revoked from a point in time:
///           its anchors from then on stop counting as trusted (verify(),
///           isTrusted()), while anchors before it, and those of keys that
///           were merely retired, stay valid;
///         - each document anchor can carry the current audit-log head, and
///           heads can also be anchored on their own; their seq must rise.
///         Anchors are write-once, as in v1.
contract EvidenceAnchorV2 {
    struct Anchor {
        bytes32 commitment;
        uint64 timestamp;
        address anchoredBy;
    }

    address public owner;
    address public pendingOwner;

    mapping(address => bool) private anchorers;
    /// @notice 0 = never revoked; otherwise anchors by this account with a
    ///         timestamp >= this value are not trusted.
    mapping(address => uint64) public distrustedFrom;

    mapping(bytes32 => Anchor) private anchors;

    uint64 private auditSeq;
    bytes32 private auditHead;
    uint64 private auditTimestamp;
    address public latestAuditHeadBy;

    event OwnershipProposed(address indexed currentOwner, address indexed proposedOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event AnchorerAdded(address indexed account);
    event AnchorerRemoved(address indexed account);
    event AnchorerRevoked(address indexed account, uint64 compromisedSince);
    event DocumentAnchored(bytes32 indexed docId, bytes32 commitment, uint256 timestamp, address indexed anchoredBy);
    event AuditHeadAnchored(uint64 indexed seq, bytes32 head, uint256 timestamp, address indexed anchoredBy);

    error NotOwner();
    error NotPendingOwner();
    error NotAnchorer();
    error ZeroAddress();
    error ZeroValue();
    error AlreadyAnchored(bytes32 docId);
    error AlreadyAnchorer(address account);
    error RevokedAccount(address account);
    error UnknownAnchorer(address account);
    error InvalidRevocationTime(uint64 compromisedSince);
    error AuditSeqNotIncreasing(uint64 latest, uint64 given);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyAnchorer() {
        if (!anchorers[msg.sender]) revert NotAnchorer();
        _;
    }

    constructor(address firstAnchorer) {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
        _addAnchorer(firstAnchorer);
    }

    // --- Ownership (two-step) ----------------------------------------------

    /// @notice Proposes a new owner; address(0) cancels a pending proposal.
    function proposeOwner(address proposed) external onlyOwner {
        pendingOwner = proposed;
        emit OwnershipProposed(owner, proposed);
    }

    function acceptOwnership() external {
        if (pendingOwner == address(0) || msg.sender != pendingOwner) revert NotPendingOwner();
        emit OwnershipTransferred(owner, msg.sender);
        owner = msg.sender;
        pendingOwner = address(0);
    }

    // --- Anchorer allow-list -----------------------------------------------

    function addAnchorer(address account) external onlyOwner {
        _addAnchorer(account);
    }

    /// @notice Retires an anchorer (planned key rotation). Its past anchors stay trusted.
    function removeAnchorer(address account) external onlyOwner {
        if (!anchorers[account]) revert UnknownAnchorer(account);
        anchorers[account] = false;
        emit AnchorerRemoved(account);
    }

    /// @notice Revokes a compromised key: removes it if listed, and distrusts
    ///         its anchors from `compromisedSince` (unix seconds, > 0, not in
    ///         the future) onward. Can be called again to move the time earlier,
    ///         never later. A revoked account can never be re-added.
    function revokeAnchorer(address account, uint64 compromisedSince) external onlyOwner {
        if (account == address(0)) revert ZeroAddress();
        if (compromisedSince == 0 || compromisedSince > block.timestamp) revert InvalidRevocationTime(compromisedSince);
        uint64 current = distrustedFrom[account];
        if (current == 0 || compromisedSince < current) distrustedFrom[account] = compromisedSince;
        if (anchorers[account]) {
            anchorers[account] = false;
            emit AnchorerRemoved(account);
        }
        emit AnchorerRevoked(account, distrustedFrom[account]);
    }

    function isAnchorer(address account) external view returns (bool) {
        return anchorers[account];
    }

    function _addAnchorer(address account) private {
        if (account == address(0)) revert ZeroAddress();
        if (distrustedFrom[account] != 0) revert RevokedAccount(account);
        if (anchorers[account]) revert AlreadyAnchorer(account);
        anchorers[account] = true;
        emit AnchorerAdded(account);
    }

    // --- Anchoring -----------------------------------------------------------

    /// @notice Anchors a document version's commitment, write-once per docId.
    /// @param docId     keccak256 of the app's document version ID
    /// @param commitment the version's commitment C (docs/03 §v2)
    /// @param seq_      audit-log head seq to anchor alongside, or 0 for none
    /// @param head_     audit-log entry hash at `seq_` (ignored when seq_ is 0)
    function anchor(bytes32 docId, bytes32 commitment, uint64 seq_, bytes32 head_) external onlyAnchorer {
        if (commitment == bytes32(0)) revert ZeroValue();
        if (anchors[docId].timestamp != 0) revert AlreadyAnchored(docId);
        anchors[docId] = Anchor({commitment: commitment, timestamp: uint64(block.timestamp), anchoredBy: msg.sender});
        emit DocumentAnchored(docId, commitment, block.timestamp, msg.sender);
        if (seq_ != 0) _recordAuditHead(seq_, head_);
    }

    /// @notice Anchors an audit-log head on its own; seq must exceed the last anchored one.
    function anchorAuditHead(uint64 seq_, bytes32 head_) external onlyAnchorer {
        if (seq_ == 0) revert ZeroValue();
        _recordAuditHead(seq_, head_);
    }

    function _recordAuditHead(uint64 seq_, bytes32 head_) private {
        if (head_ == bytes32(0)) revert ZeroValue();
        if (seq_ <= auditSeq) revert AuditSeqNotIncreasing(auditSeq, seq_);
        auditSeq = seq_;
        auditHead = head_;
        auditTimestamp = uint64(block.timestamp);
        latestAuditHeadBy = msg.sender;
        emit AuditHeadAnchored(seq_, head_, block.timestamp, msg.sender);
    }

    // --- Reads (Court Verification Portal) -----------------------------------

    /// @notice Same shape as v1's getAnchor; all zero when docId was never anchored.
    function getAnchor(bytes32 docId) external view returns (bytes32 commitment, uint256 timestamp, address anchoredBy) {
        Anchor memory a = anchors[docId];
        return (a.commitment, a.timestamp, a.anchoredBy);
    }

    /// @notice True when docId is anchored by an account not revoked as of the anchor's time.
    function isTrusted(bytes32 docId) public view returns (bool) {
        Anchor memory a = anchors[docId];
        if (a.timestamp == 0) return false;
        uint64 since = distrustedFrom[a.anchoredBy];
        return since == 0 || a.timestamp < since;
    }

    /// @notice True only when docId is anchored with exactly this commitment, by a trusted anchor.
    function verify(bytes32 docId, bytes32 commitment) external view returns (bool) {
        return anchors[docId].commitment == commitment && isTrusted(docId);
    }

    function latestAuditHead() external view returns (uint64 seq, bytes32 head, uint256 timestamp) {
        return (auditSeq, auditHead, auditTimestamp);
    }
}
