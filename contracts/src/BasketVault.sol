// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

interface IFeeRecipientSource {
    function feeRecipient() external view returns (address);
}

/// @title BasketVault
/// @notice ERC-20 basket share backed by a fixed quantity of every constituent.
///         One full share (1e18) always maps to `units[token]` of each token: prices move the
///         basket's value and weights, but the token quantities are never rebalanced.
contract BasketVault is ERC20, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant BPS = 10_000;
    uint256 public constant MAX_OWNER_FEE_BPS = 100;
    uint256 public constant PROTOCOL_MINT_FEE_BPS = 30;
    uint256 public constant PROTOCOL_REDEEM_FEE_BPS = 20;
    uint256 public constant MIN_MINT_SHARES = 1e15;
    uint256 public constant MAX_CONSTITUENTS = 16;

    address public immutable factory;
    uint64 public immutable createdAt;
    address public owner;
    uint16 public mintFeeBps;
    uint16 public redeemFeeBps;
    string public description;

    address[] internal _tokens;
    /// @notice Amount of each constituent backing one full share (1e18).
    mapping(address => uint256) public units;
    /// @notice Constituent balance reserved for share holders.
    mapping(address => uint256) public backing;
    /// @notice Basket-owner fee revenue, withdrawable by the owner.
    mapping(address => uint256) public treasury;
    /// @notice Protocol fee revenue, sweepable by anyone to the factory fee recipient.
    mapping(address => uint256) public protocolFees;

    event Minted(address indexed caller, address indexed to, uint256 shares, uint256[] amountsIn);
    event Redeemed(address indexed caller, address indexed to, uint256 shares, uint256[] amountsOut);
    event FeesSet(uint16 mintFeeBps, uint16 redeemFeeBps);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event TreasuryWithdrawn(address indexed to, address indexed token, uint256 amount);
    event ProtocolFeesSwept(address indexed to, address indexed token, uint256 amount);

    error OnlyOwner();
    error InvalidConstituents();
    error FeeTooHigh();
    error Expired();
    error BelowMinimum();
    error LimitExceeded(uint256 index);
    error ZeroAddress();

    constructor(
        string memory name_,
        string memory symbol_,
        string memory description_,
        address owner_,
        address[] memory tokens_,
        uint256[] memory units_,
        uint16 mintFeeBps_,
        uint16 redeemFeeBps_
    ) ERC20(name_, symbol_) {
        uint256 n = tokens_.length;
        if (n == 0 || n > MAX_CONSTITUENTS || n != units_.length) revert InvalidConstituents();
        if (owner_ == address(0)) revert ZeroAddress();
        for (uint256 i; i < n; ++i) {
            if (tokens_[i] == address(0) || units_[i] == 0 || units[tokens_[i]] != 0) revert InvalidConstituents();
            units[tokens_[i]] = units_[i];
        }
        _tokens = tokens_;
        factory = msg.sender;
        createdAt = uint64(block.timestamp);
        owner = owner_;
        description = description_;
        _setFees(mintFeeBps_, redeemFeeBps_);
        emit OwnershipTransferred(address(0), owner_);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    modifier notExpired(uint256 deadline) {
        if (block.timestamp > deadline) revert Expired();
        _;
    }

    // ---------------------------------------------------------------- views

    function constituents() external view returns (address[] memory tokens, uint256[] memory unitsPerShare) {
        tokens = _tokens;
        unitsPerShare = new uint256[](tokens.length);
        for (uint256 i; i < tokens.length; ++i) {
            unitsPerShare[i] = units[tokens[i]];
        }
    }

    function constituentCount() external view returns (uint256) {
        return _tokens.length;
    }

    /// @notice Constituent amounts (backing + fees) required to mint `shares`. Rounds up.
    function previewMint(uint256 shares) public view returns (uint256[] memory amountsIn) {
        uint256 n = _tokens.length;
        amountsIn = new uint256[](n);
        for (uint256 i; i < n; ++i) {
            (uint256 base, uint256 ownerFee, uint256 protocolFee) = _mintLeg(shares, units[_tokens[i]]);
            amountsIn[i] = base + ownerFee + protocolFee;
        }
    }

    /// @notice Constituent amounts paid out (net of fees) when redeeming `shares`. Rounds down.
    function previewRedeem(uint256 shares) public view returns (uint256[] memory amountsOut) {
        uint256 n = _tokens.length;
        amountsOut = new uint256[](n);
        for (uint256 i; i < n; ++i) {
            (uint256 gross, uint256 ownerFee, uint256 protocolFee) = _redeemLeg(shares, units[_tokens[i]]);
            amountsOut[i] = gross - ownerFee - protocolFee;
        }
    }

    // ---------------------------------------------------------------- mint / redeem

    /// @notice Mints `shares` by pulling every constituent from the caller.
    /// @param maxIn Optional per-constituent input limits (empty array to skip).
    function mint(uint256 shares, address to, uint256[] calldata maxIn, uint256 deadline)
        external
        nonReentrant
        notExpired(deadline)
        returns (uint256[] memory amountsIn)
    {
        if (shares < MIN_MINT_SHARES) revert BelowMinimum();
        if (to == address(0)) revert ZeroAddress();
        uint256 n = _tokens.length;
        bool checkLimits = maxIn.length != 0;
        if (checkLimits && maxIn.length != n) revert InvalidConstituents();

        amountsIn = new uint256[](n);
        for (uint256 i; i < n; ++i) {
            address token = _tokens[i];
            (uint256 base, uint256 ownerFee, uint256 protocolFee) = _mintLeg(shares, units[token]);
            uint256 total = base + ownerFee + protocolFee;
            if (checkLimits && total > maxIn[i]) revert LimitExceeded(i);

            backing[token] += base;
            treasury[token] += ownerFee;
            protocolFees[token] += protocolFee;
            amountsIn[i] = total;
            IERC20(token).safeTransferFrom(msg.sender, address(this), total);
        }
        _mint(to, shares);
        emit Minted(msg.sender, to, shares, amountsIn);
    }

    /// @notice Burns `shares` from the caller and pays out every constituent pro rata.
    /// @param minOut Optional per-constituent output limits (empty array to skip).
    function redeem(uint256 shares, address to, uint256[] calldata minOut, uint256 deadline)
        external
        nonReentrant
        notExpired(deadline)
        returns (uint256[] memory amountsOut)
    {
        if (shares == 0) revert BelowMinimum();
        if (to == address(0)) revert ZeroAddress();
        uint256 n = _tokens.length;
        bool checkLimits = minOut.length != 0;
        if (checkLimits && minOut.length != n) revert InvalidConstituents();

        _burn(msg.sender, shares);
        amountsOut = new uint256[](n);
        for (uint256 i; i < n; ++i) {
            address token = _tokens[i];
            (uint256 gross, uint256 ownerFee, uint256 protocolFee) = _redeemLeg(shares, units[token]);
            uint256 net = gross - ownerFee - protocolFee;
            if (checkLimits && net < minOut[i]) revert LimitExceeded(i);

            backing[token] -= gross;
            treasury[token] += ownerFee;
            protocolFees[token] += protocolFee;
            amountsOut[i] = net;
            IERC20(token).safeTransfer(to, net);
        }
        emit Redeemed(msg.sender, to, shares, amountsOut);
    }

    // ---------------------------------------------------------------- owner / fees

    function setFees(uint16 mintFeeBps_, uint16 redeemFeeBps_) external onlyOwner {
        _setFees(mintFeeBps_, redeemFeeBps_);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function withdrawTreasury(address to) external onlyOwner {
        for (uint256 i; i < _tokens.length; ++i) {
            address token = _tokens[i];
            uint256 amount = treasury[token];
            if (amount == 0) continue;
            treasury[token] = 0;
            IERC20(token).safeTransfer(to, amount);
            emit TreasuryWithdrawn(to, token, amount);
        }
    }

    function sweepProtocolFees() external {
        address to = IFeeRecipientSource(factory).feeRecipient();
        for (uint256 i; i < _tokens.length; ++i) {
            address token = _tokens[i];
            uint256 amount = protocolFees[token];
            if (amount == 0) continue;
            protocolFees[token] = 0;
            IERC20(token).safeTransfer(to, amount);
            emit ProtocolFeesSwept(to, token, amount);
        }
    }

    // ---------------------------------------------------------------- internal

    function _setFees(uint16 mintFeeBps_, uint16 redeemFeeBps_) internal {
        if (mintFeeBps_ > MAX_OWNER_FEE_BPS || redeemFeeBps_ > MAX_OWNER_FEE_BPS) revert FeeTooHigh();
        mintFeeBps = mintFeeBps_;
        redeemFeeBps = redeemFeeBps_;
        emit FeesSet(mintFeeBps_, redeemFeeBps_);
    }

    function _mintLeg(uint256 shares, uint256 unitsPerShare)
        internal
        view
        returns (uint256 base, uint256 ownerFee, uint256 protocolFee)
    {
        base = Math.mulDiv(shares, unitsPerShare, 1e18, Math.Rounding.Ceil);
        ownerFee = Math.mulDiv(base, mintFeeBps, BPS, Math.Rounding.Ceil);
        protocolFee = Math.mulDiv(base, PROTOCOL_MINT_FEE_BPS, BPS, Math.Rounding.Ceil);
    }

    function _redeemLeg(uint256 shares, uint256 unitsPerShare)
        internal
        view
        returns (uint256 gross, uint256 ownerFee, uint256 protocolFee)
    {
        gross = Math.mulDiv(shares, unitsPerShare, 1e18);
        ownerFee = Math.mulDiv(gross, redeemFeeBps, BPS);
        protocolFee = Math.mulDiv(gross, PROTOCOL_REDEEM_FEE_BPS, BPS);
    }
}
