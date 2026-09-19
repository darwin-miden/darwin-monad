// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {BasketVault} from "./BasketVault.sol";

/// @title BasketFactory
/// @notice Permissionless basket deployment over an allowlist of tokenized stocks.
contract BasketFactory is Ownable {
    address public feeRecipient;

    address[] internal _assets;
    mapping(address => bool) public isAsset;

    address[] internal _baskets;
    mapping(address => bool) public isBasket;

    event AssetAdded(address indexed token);
    event FeeRecipientSet(address indexed feeRecipient);
    event BasketDeployed(
        address indexed vault, address indexed creator, string name, string symbol, uint256 index
    );

    error UnknownAsset(address token);
    error AssetExists(address token);
    error ZeroAddress();

    constructor(address owner_, address feeRecipient_) Ownable(owner_) {
        if (feeRecipient_ == address(0)) revert ZeroAddress();
        feeRecipient = feeRecipient_;
        emit FeeRecipientSet(feeRecipient_);
    }

    // ---------------------------------------------------------------- admin

    function addAsset(address token) external onlyOwner {
        if (isAsset[token]) revert AssetExists(token);
        isAsset[token] = true;
        _assets.push(token);
        emit AssetAdded(token);
    }

    function setFeeRecipient(address feeRecipient_) external onlyOwner {
        if (feeRecipient_ == address(0)) revert ZeroAddress();
        feeRecipient = feeRecipient_;
        emit FeeRecipientSet(feeRecipient_);
    }

    // ---------------------------------------------------------------- deploy

    /// @notice Deploys a new basket owned by the caller.
    /// @param units Amount of each token (in its own decimals) backing one full share (1e18).
    function deploy(
        string calldata name,
        string calldata symbol,
        string calldata description,
        address[] calldata tokens,
        uint256[] calldata units,
        uint16 mintFeeBps,
        uint16 redeemFeeBps
    ) external returns (address vault) {
        for (uint256 i; i < tokens.length; ++i) {
            if (!isAsset[tokens[i]]) revert UnknownAsset(tokens[i]);
        }
        vault = address(
            new BasketVault(name, symbol, description, msg.sender, tokens, units, mintFeeBps, redeemFeeBps)
        );
        isBasket[vault] = true;
        _baskets.push(vault);
        emit BasketDeployed(vault, msg.sender, name, symbol, _baskets.length - 1);
    }

    // ---------------------------------------------------------------- views

    function assets() external view returns (address[] memory) {
        return _assets;
    }

    function deployedCount() external view returns (uint256) {
        return _baskets.length;
    }

    function deployed(uint256 index) external view returns (address) {
        return _baskets[index];
    }

    function baskets() external view returns (address[] memory) {
        return _baskets;
    }
}
