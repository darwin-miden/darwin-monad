// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {BasketVault} from "./BasketVault.sol";
import {BasketFactory} from "./BasketFactory.sol";
import {PriceOracle} from "./PriceOracle.sol";

/// @title BasketLens
/// @notice Read-only aggregation for frontends: assets, basket composition, NAV and holdings in one call.
contract BasketLens {
    BasketFactory public immutable factory;
    PriceOracle public immutable oracle;

    struct Asset {
        address token;
        string symbol;
        string name;
        uint8 decimals;
        uint256 price; // USD, 18 decimals, per 1e18 units
        uint256 updatedAt;
    }

    struct Leg {
        address token;
        string symbol;
        uint256 units; // per 1e18 shares
        uint256 price; // USD, 18 decimals
        uint256 value; // USD value per share, 18 decimals
        uint256 weightBps; // current weight at market prices
    }

    struct BasketView {
        address vault;
        string name;
        string symbol;
        string description;
        address owner;
        uint256 totalSupply;
        uint256 nav; // USD per share, 18 decimals
        uint256 tvl; // USD, 18 decimals
        uint16 mintFeeBps;
        uint16 redeemFeeBps;
        uint64 createdAt;
        Leg[] legs;
    }

    struct Holding {
        address vault;
        string symbol;
        uint256 balance;
        uint256 value; // USD, 18 decimals
    }

    constructor(BasketFactory factory_, PriceOracle oracle_) {
        factory = factory_;
        oracle = oracle_;
    }

    function getAssets() external view returns (Asset[] memory out) {
        address[] memory tokens = factory.assets();
        out = new Asset[](tokens.length);
        for (uint256 i; i < tokens.length; ++i) {
            IERC20Metadata t = IERC20Metadata(tokens[i]);
            (uint256 price, uint256 updatedAt) = oracle.getPriceData(tokens[i]);
            out[i] = Asset(tokens[i], t.symbol(), t.name(), t.decimals(), price, updatedAt);
        }
    }

    function getBasket(address vault) public view returns (BasketView memory b) {
        BasketVault v = BasketVault(vault);
        (address[] memory tokens, uint256[] memory units) = v.constituents();

        b.vault = vault;
        b.name = v.name();
        b.symbol = v.symbol();
        b.description = v.description();
        b.owner = v.owner();
        b.totalSupply = v.totalSupply();
        b.mintFeeBps = v.mintFeeBps();
        b.redeemFeeBps = v.redeemFeeBps();
        b.createdAt = v.createdAt();
        b.legs = new Leg[](tokens.length);

        for (uint256 i; i < tokens.length; ++i) {
            (uint256 price,) = oracle.getPriceData(tokens[i]);
            uint256 value = units[i] * price / 1e18;
            b.nav += value;
            b.legs[i] = Leg(tokens[i], IERC20Metadata(tokens[i]).symbol(), units[i], price, value, 0);
        }
        if (b.nav != 0) {
            for (uint256 i; i < tokens.length; ++i) {
                b.legs[i].weightBps = b.legs[i].value * 10_000 / b.nav;
            }
        }
        b.tvl = b.nav * b.totalSupply / 1e18;
    }

    function getBaskets(uint256 offset, uint256 limit) external view returns (BasketView[] memory out) {
        uint256 total = factory.deployedCount();
        if (offset >= total) return new BasketView[](0);
        uint256 end = offset + limit > total ? total : offset + limit;
        out = new BasketView[](end - offset);
        for (uint256 i = offset; i < end; ++i) {
            out[i - offset] = getBasket(factory.deployed(i));
        }
    }

    function getHoldings(address user) external view returns (Holding[] memory out) {
        address[] memory all = factory.baskets();
        uint256 count;
        for (uint256 i; i < all.length; ++i) {
            if (BasketVault(all[i]).balanceOf(user) != 0) ++count;
        }
        out = new Holding[](count);
        uint256 j;
        for (uint256 i; i < all.length; ++i) {
            uint256 bal = BasketVault(all[i]).balanceOf(user);
            if (bal == 0) continue;
            BasketView memory b = getBasket(all[i]);
            out[j++] = Holding(all[i], b.symbol, bal, b.nav * bal / 1e18);
        }
    }
}
