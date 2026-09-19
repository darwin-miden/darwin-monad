// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title PriceOracle
/// @notice Push oracle for stock prices. A keeper publishes USD prices (18 decimals, per 1e18 token units).
contract PriceOracle is Ownable {
    struct PriceData {
        uint128 price;
        uint64 updatedAt;
    }

    mapping(address => PriceData) internal _prices;
    mapping(address => bool) public isKeeper;

    event KeeperSet(address indexed keeper, bool allowed);
    event PriceUpdated(address indexed token, uint256 price, uint256 updatedAt);

    error NotKeeper();
    error LengthMismatch();
    error NoPrice(address token);
    error ZeroPrice();

    constructor(address owner_) Ownable(owner_) {
        isKeeper[owner_] = true;
        emit KeeperSet(owner_, true);
    }

    function setKeeper(address keeper, bool allowed) external onlyOwner {
        isKeeper[keeper] = allowed;
        emit KeeperSet(keeper, allowed);
    }

    function setPrices(address[] calldata tokens, uint256[] calldata prices) external {
        if (!isKeeper[msg.sender]) revert NotKeeper();
        if (tokens.length != prices.length) revert LengthMismatch();
        for (uint256 i; i < tokens.length; ++i) {
            if (prices[i] == 0) revert ZeroPrice();
            _prices[tokens[i]] = PriceData(uint128(prices[i]), uint64(block.timestamp));
            emit PriceUpdated(tokens[i], prices[i], block.timestamp);
        }
    }

    /// @return price USD value of 1e18 token units, scaled to 18 decimals.
    function getPrice(address token) external view returns (uint256 price) {
        price = _prices[token].price;
        if (price == 0) revert NoPrice(token);
    }

    function getPriceData(address token) external view returns (uint256 price, uint256 updatedAt) {
        PriceData memory p = _prices[token];
        return (p.price, p.updatedAt);
    }
}
