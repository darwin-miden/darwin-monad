// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {PriceOracle} from "./PriceOracle.sol";
import {StockToken} from "./StockToken.sol";

/// @title StockMarket
/// @notice Oracle-priced issuer for tokenized stocks. Mints stock against USD on buys and burns
///         stock against its USD reserve on sells, charging a flat spread. This stands in for the
///         per-stock liquidity pools a mainnet deployment would route through.
contract StockMarket is Ownable {
    using SafeERC20 for IERC20;

    uint256 public constant BPS = 10_000;
    uint256 public constant MAX_SPREAD_BPS = 100;
    /// @dev stock (18d) * price (18d) / SCALE = USD (6d)
    uint256 internal constant SCALE = 1e30;

    IERC20 public immutable usd;
    PriceOracle public immutable oracle;
    uint256 public spreadBps;

    address[] internal _stocks;
    mapping(address => bool) public isListed;

    event StockListed(address indexed stock);
    event SpreadSet(uint256 spreadBps);
    event Bought(address indexed stock, address indexed to, uint256 usdIn, uint256 amountOut);
    event Sold(address indexed stock, address indexed to, uint256 amountIn, uint256 usdOut);

    error NotListed(address stock);
    error AlreadyListed(address stock);
    error Slippage();
    error SpreadTooHigh();

    constructor(address owner_, IERC20 usd_, PriceOracle oracle_, uint256 spreadBps_) Ownable(owner_) {
        if (spreadBps_ > MAX_SPREAD_BPS) revert SpreadTooHigh();
        usd = usd_;
        oracle = oracle_;
        spreadBps = spreadBps_;
    }

    // ---------------------------------------------------------------- admin

    function listStock(address stock) external onlyOwner {
        if (isListed[stock]) revert AlreadyListed(stock);
        isListed[stock] = true;
        _stocks.push(stock);
        emit StockListed(stock);
    }

    function setSpread(uint256 spreadBps_) external onlyOwner {
        if (spreadBps_ > MAX_SPREAD_BPS) revert SpreadTooHigh();
        spreadBps = spreadBps_;
        emit SpreadSet(spreadBps_);
    }

    function withdrawReserve(address to, uint256 amount) external onlyOwner {
        usd.safeTransfer(to, amount);
    }

    function stocks() external view returns (address[] memory) {
        return _stocks;
    }

    // ---------------------------------------------------------------- quotes

    function quoteBuyExactOut(address stock, uint256 amountOut) public view returns (uint256 usdIn) {
        uint256 price = _price(stock);
        usdIn = Math.mulDiv(amountOut, price * (BPS + spreadBps), SCALE * BPS, Math.Rounding.Ceil);
    }

    function quoteBuy(address stock, uint256 usdIn) public view returns (uint256 amountOut) {
        uint256 price = _price(stock);
        amountOut = Math.mulDiv(usdIn, SCALE * BPS, price * (BPS + spreadBps));
    }

    function quoteSell(address stock, uint256 amountIn) public view returns (uint256 usdOut) {
        uint256 price = _price(stock);
        usdOut = Math.mulDiv(amountIn, price * (BPS - spreadBps), SCALE * BPS);
    }

    // ---------------------------------------------------------------- trades

    function buyExactOut(address stock, uint256 amountOut, uint256 maxUsdIn, address to)
        external
        returns (uint256 usdIn)
    {
        usdIn = quoteBuyExactOut(stock, amountOut);
        if (usdIn > maxUsdIn) revert Slippage();
        usd.safeTransferFrom(msg.sender, address(this), usdIn);
        StockToken(stock).mint(to, amountOut);
        emit Bought(stock, to, usdIn, amountOut);
    }

    function buy(address stock, uint256 usdIn, uint256 minOut, address to) external returns (uint256 amountOut) {
        amountOut = quoteBuy(stock, usdIn);
        if (amountOut < minOut) revert Slippage();
        usd.safeTransferFrom(msg.sender, address(this), usdIn);
        StockToken(stock).mint(to, amountOut);
        emit Bought(stock, to, usdIn, amountOut);
    }

    function sell(address stock, uint256 amountIn, uint256 minUsdOut, address to) external returns (uint256 usdOut) {
        usdOut = quoteSell(stock, amountIn);
        if (usdOut < minUsdOut) revert Slippage();
        IERC20(stock).safeTransferFrom(msg.sender, address(this), amountIn);
        StockToken(stock).burn(amountIn);
        usd.safeTransfer(to, usdOut);
        emit Sold(stock, to, amountIn, usdOut);
    }

    function _price(address stock) internal view returns (uint256) {
        if (!isListed[stock]) revert NotListed(stock);
        return oracle.getPrice(stock);
    }
}
