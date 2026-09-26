// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title EvidenceAnchor
/// @notice Anchors DigiVault document-version Merkle roots on-chain for
///         public, independent verification. Deliberately minimal — this
///         contract's only job is to make a root hash provably exist at a
///         given time, from a given anchoring account. It does not store
///         documents, does not store PII, and does not gate access.
contract EvidenceAnchor {
    address public owner;

    struct Anchor {
        bytes32 merkleRoot;
        uint256 timestamp;
        address anchoredBy;
    }

    // documentVersionId (keccak256 of the app's internal version ID) => Anchor
    mapping(bytes32 => Anchor) public anchors;

    event RootAnchored(
        bytes32 indexed documentVersionId,
        bytes32 merkleRoot,
        uint256 timestamp,
        address anchoredBy
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "EvidenceAnchor: caller is not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    /// @notice Anchor a Merkle root for a given document version.
    /// @dev Intentionally does not allow overwriting an existing anchor —
    ///      once anchored, a root is permanent. This mirrors the MinIO
    ///      Object Lock guarantee on the off-chain side.
    function anchorRoot(bytes32 documentVersionId, bytes32 merkleRoot) external onlyOwner {
        require(
            anchors[documentVersionId].timestamp == 0,
            "EvidenceAnchor: root already anchored for this version"
        );

        anchors[documentVersionId] = Anchor({
            merkleRoot: merkleRoot,
            timestamp: block.timestamp,
            anchoredBy: msg.sender
        });

        emit RootAnchored(documentVersionId, merkleRoot, block.timestamp, msg.sender);
    }

    /// @notice Public read used by the standalone Court Verification Portal.
    function getAnchor(bytes32 documentVersionId)
        external
        view
        returns (bytes32 merkleRoot, uint256 timestamp, address anchoredBy)
    {
        Anchor memory a = anchors[documentVersionId];
        return (a.merkleRoot, a.timestamp, a.anchoredBy);
    }
}
