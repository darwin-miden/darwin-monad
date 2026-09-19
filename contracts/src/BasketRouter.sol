// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {BasketVault} from "./BasketVault.sol";
import {BasketFactory} from "./BasketFactory.sol";
import {StockMarket} from "./StockMarket.sol";

/// @title BasketRouter
/// @notice Converts between USD and complete basket shares in a single transaction:
///         buys every constituent on the StockMarket, mints through the vault, and the reverse on sells.
contract BasketRouter is ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable usd;
    StockMarket public immutable market;
    BasketFactory public immutable factory;

    event Bought(address indexed vault, address indexed buyer, address indexed to, uint256 usdIn, uint256 shares);
    event Sold(address indexed vault, address indexed seller, address indexed to, uint256 shares, uint256 usdOut);

    error UnknownBasket(address vault);
    error Expired();
    error Slippage();
    error ZeroAmount();

    constructor(IERC20 usd_, StockMarket market_, BasketFactory factory_) {
        usd = usd_;
        market = market_;
        factory = factory_;
        usd_.forceApprove(address(market_), type(uint256).max);
    }

    modifier checked(address vault, uint256 deadline) {
        if (!factory.isBasket(vault)) revert UnknownBasket(vault);
        if (block.timestamp > deadline) revert Expired();
        _;
    }

    // ---------------------------------------------------------------- quotes

    /// @notice USD required to buy exactly `shares`, including vault fees and market spread.
    function quoteBuyExact(address vault, uint256 shares) public view returns (uint256 usdIn) {
        (address[] memory tokens,) = BasketVault(vault).constituents();
        uint256[] memory amounts = BasketVault(vault).previewMint(shares);
        for (uint256 i; i < tokens.length; ++i) {
            usdIn += market.quoteBuyExactOut(tokens[i], amounts[i]);
        }
    }

    /// @notice Shares received for exactly `usdIn` (any rounding dust is refunded).
    function quoteBuy(address vault, uint256 usdIn) public view returns (uint256 shares) {
        uint256 costPerShare = quoteBuyExact(vault, 1e18);
        // Every leg rounds up by at most one USD unit; keep that headroom so the exact-out buy fits.
        uint256 headroom = 2 * BasketVault(vault).constituentCount();
        if (usdIn <= headroom) return 0;
        shares = (usdIn - headroom) * 1e18 / costPerShare;
    }

    /// @notice USD received for selling `shares`, net of vault fees and market spread.
    function quoteSell(address vault, uint256 shares) public view returns (uint256 usdOut) {
        (address[] memory tokens,) = BasketVault(vault).constituents();
        uint256[] memory amounts = BasketVault(vault).previewRedeem(shares);
        for (uint256 i; i < tokens.length; ++i) {
            usdOut += market.quoteSell(tokens[i], amounts[i]);
        }
    }

    // ---------------------------------------------------------------- trades

    /// @notice Spends exactly `usdIn` (minus refunded dust) on basket shares.
    function buy(address vault, uint256 usdIn, uint256 minShares, address to, uint256 deadline)
        external
        nonReentrant
        checked(vault, deadline)
        returns (uint256 shares)
    {
        shares = quoteBuy(vault, usdIn);
        if (shares == 0) revert ZeroAmount();
        if (shares < minShares) revert Slippage();
        usd.safeTransferFrom(msg.sender, address(this), usdIn);
        uint256 spent = _acquireAndMint(vault, shares, to);
        if (usdIn > spent) usd.safeTransfer(msg.sender, usdIn - spent);
        emit Bought(vault, msg.sender, to, spent, shares);
    }

    /// @notice Buys exactly `shares`, spending at most `maxUsdIn`.
    function buyExact(address vault, uint256 shares, uint256 maxUsdIn, address to, uint256 deadline)
        external
        nonReentrant
        checked(vault, deadline)
        returns (uint256 usdIn)
    {
        usdIn = quoteBuyExact(vault, shares);
        if (usdIn > maxUsdIn) revert Slippage();
        usd.safeTransferFrom(msg.sender, address(this), usdIn);
        uint256 spent = _acquireAndMint(vault, shares, to);
        if (usdIn > spent) usd.safeTransfer(msg.sender, usdIn - spent);
        emit Bought(vault, msg.sender, to, spent, shares);
    }

    /// @notice Redeems `shares` and sells every constituent back to USD.
    function sell(address vault, uint256 shares, uint256 minUsdOut, address to, uint256 deadline)
        external
        nonReentrant
        checked(vault, deadline)
        returns (uint256 usdOut)
    {
        if (shares == 0) revert ZeroAmount();
        IERC20(vault).safeTransferFrom(msg.sender, address(this), shares);
        (address[] memory tokens,) = BasketVault(vault).constituents();
        uint256[] memory amounts = BasketVault(vault).redeem(shares, address(this), new uint256[](0), block.timestamp);
        for (uint256 i; i < tokens.length; ++i) {
            if (amounts[i] == 0) continue;
            IERC20(tokens[i]).forceApprove(address(market), amounts[i]);
            usdOut += market.sell(tokens[i], amounts[i], 0, to);
        }
        if (usdOut < minUsdOut) revert Slippage();
        emit Sold(vault, msg.sender, to, shares, usdOut);
    }

    function _acquireAndMint(address vault, uint256 shares, address to) internal returns (uint256 spent) {
        (address[] memory tokens,) = BasketVault(vault).constituents();
        uint256[] memory amounts = BasketVault(vault).previewMint(shares);
        for (uint256 i; i < tokens.length; ++i) {
            spent += market.buyExactOut(tokens[i], amounts[i], type(uint256).max, address(this));
            IERC20(tokens[i]).forceApprove(vault, amounts[i]);
        }
        BasketVault(vault).mint(shares, to, amounts, block.timestamp);
    }
}
