// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title StockToken
/// @notice 18-decimal tokenized stock. Supply is controlled by the issuer (the StockMarket),
///         which mints against USD at the oracle price and burns on the way out.
contract StockToken is ERC20 {
    address public immutable issuer;

    error OnlyIssuer();

    constructor(string memory name_, string memory symbol_, address issuer_) ERC20(name_, symbol_) {
        issuer = issuer_;
    }

    modifier onlyIssuer() {
        if (msg.sender != issuer) revert OnlyIssuer();
        _;
    }

    function mint(address to, uint256 amount) external onlyIssuer {
        _mint(to, amount);
    }

    /// @notice Burns tokens held by the issuer itself.
    function burn(uint256 amount) external onlyIssuer {
        _burn(msg.sender, amount);
    }
}
