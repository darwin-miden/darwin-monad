// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {TestUSD} from "../src/mocks/TestUSD.sol";
import {PriceOracle} from "../src/PriceOracle.sol";
import {StockMarket} from "../src/StockMarket.sol";
import {StockToken} from "../src/StockToken.sol";
import {BasketFactory} from "../src/BasketFactory.sol";
import {BasketVault} from "../src/BasketVault.sol";
import {BasketRouter} from "../src/BasketRouter.sol";

/// @notice Drives random sequences of routed buys/sells, in-kind mints/redeems, transfers,
///         price moves and fee withdrawals against one basket.
contract Handler is Test {
    TestUSD usd;
    PriceOracle oracle;
    StockMarket market;
    BasketRouter router;
    BasketVault public vault;
    address admin;
    address[] public actors;
    address[] tokens;

    uint256 public usdSpent;
    uint256 public usdReceived;

    constructor(
        TestUSD usd_,
        PriceOracle oracle_,
        StockMarket market_,
        BasketRouter router_,
        BasketVault vault_,
        address admin_,
        address[] memory tokens_
    ) {
        usd = usd_;
        oracle = oracle_;
        market = market_;
        router = router_;
        vault = vault_;
        admin = admin_;
        tokens = tokens_;
        for (uint256 i; i < 3; ++i) {
            address a = makeAddr(string.concat("actor", vm.toString(i)));
            actors.push(a);
            vm.prank(admin);
            usd.mint(a, 1_000_000e6);
            vm.startPrank(a);
            usd.approve(address(router), type(uint256).max);
            usd.approve(address(market), type(uint256).max);
            vault.approve(address(router), type(uint256).max);
            for (uint256 j; j < tokens_.length; ++j) {
                IERC20(tokens_[j]).approve(address(vault), type(uint256).max);
            }
            vm.stopPrank();
        }
    }

    function _actor(uint256 seed) internal view returns (address) {
        return actors[seed % actors.length];
    }

    function buy(uint256 seed, uint256 usdIn) external {
        address a = _actor(seed);
        usdIn = bound(usdIn, 1e6, 50_000e6);
        if (usd.balanceOf(a) < usdIn) return;
        uint256 before = usd.balanceOf(a);
        vm.prank(a);
        router.buy(address(vault), usdIn, 0, a, block.timestamp);
        uint256 spent = before - usd.balanceOf(a);
        assertLe(spent, usdIn, "router overspent");
        usdSpent += spent;
    }

    function sell(uint256 seed, uint256 frac) external {
        address a = _actor(seed);
        uint256 bal = vault.balanceOf(a);
        uint256 shares = bal * bound(frac, 1, 100) / 100;
        if (shares == 0) return;
        uint256 quoted = router.quoteSell(address(vault), shares);
        vm.prank(a);
        uint256 out = router.sell(address(vault), shares, quoted, a, block.timestamp);
        assertEq(out, quoted, "sell != quote");
        usdReceived += out;
    }

    function redeemInKind(uint256 seed, uint256 frac) external {
        address a = _actor(seed);
        uint256 shares = vault.balanceOf(a) * bound(frac, 1, 100) / 100;
        if (shares == 0) return;
        uint256[] memory preview = vault.previewRedeem(shares);
        vm.prank(a);
        uint256[] memory out = vault.redeem(shares, a, new uint256[](0), block.timestamp);
        for (uint256 i; i < out.length; ++i) {
            assertEq(out[i], preview[i], "redeem != preview");
        }
    }

    function mintInKind(uint256 seed, uint256 shares) external {
        address a = _actor(seed);
        shares = bound(shares, 1e15, 5e18);
        uint256[] memory need = vault.previewMint(shares);
        for (uint256 i; i < need.length; ++i) {
            if (IERC20(tokens[i]).balanceOf(a) < need[i]) return;
        }
        vm.prank(a);
        vault.mint(shares, a, need, block.timestamp);
    }

    function transferShares(uint256 from, uint256 to, uint256 frac) external {
        address a = _actor(from);
        address b = _actor(to);
        uint256 amount = vault.balanceOf(a) * bound(frac, 0, 100) / 100;
        vm.prank(a);
        vault.transfer(b, amount);
    }

    function movePrice(uint256 which, uint256 bps) external {
        address token = tokens[which % tokens.length];
        uint256 price = oracle.getPrice(token);
        uint256 next = price * bound(bps, 5_000, 20_000) / 10_000; // -50% .. +100%
        if (next == 0) return;
        address[] memory t = new address[](1);
        t[0] = token;
        uint256[] memory p = new uint256[](1);
        p[0] = next;
        vm.prank(admin);
        oracle.setPrices(t, p);
    }

    function withdrawFees(uint256 which) external {
        if (which % 2 == 0) {
            address owner = vault.owner();
            vm.prank(owner);
            vault.withdrawTreasury(owner);
        } else {
            vault.sweepProtocolFees();
        }
    }

    function actorCount() external view returns (uint256) {
        return actors.length;
    }
}

contract InvariantsTest is Test {
    address admin = makeAddr("admin");
    address creator = makeAddr("creator");
    TestUSD usd;
    PriceOracle oracle;
    StockMarket market;
    BasketFactory factory;
    BasketRouter router;
    BasketVault vault;
    Handler handler;
    address[] tokens;

    function setUp() public {
        vm.startPrank(admin);
        usd = new TestUSD(admin);
        oracle = new PriceOracle(admin);
        market = new StockMarket(admin, IERC20(address(usd)), oracle, 10);
        factory = new BasketFactory(admin, admin);
        router = new BasketRouter(IERC20(address(usd)), market, factory);
        string[4] memory syms = ["AAPL", "NVDA", "TSLA", "COIN"];
        uint256[4] memory prices = [uint256(336e18), 222e18, 364e18, 194e18];
        uint256[] memory units = new uint256[](4);
        for (uint256 i; i < 4; ++i) {
            StockToken t = new StockToken(syms[i], syms[i], address(market));
            market.listStock(address(t));
            factory.addAsset(address(t));
            tokens.push(address(t));
            address[] memory one = new address[](1);
            one[0] = address(t);
            uint256[] memory p = new uint256[](1);
            p[0] = prices[i];
            oracle.setPrices(one, p);
            units[i] = 25e18 * 1e18 / prices[i]; // $25 of each at launch
        }
        usd.mint(address(market), 1_000_000_000e6);
        vm.stopPrank();

        vm.prank(creator);
        vault = BasketVault(factory.deploy("Inv", "INV", "", tokens, units, 100, 100));

        handler = new Handler(usd, oracle, market, router, vault, admin, tokens);
        targetContract(address(handler));
    }

    /// Every outstanding share is fully backed by its fixed units, for every constituent.
    function invariant_backingCoversSupply() public view {
        (address[] memory t, uint256[] memory u) = vault.constituents();
        uint256 supply = vault.totalSupply();
        for (uint256 i; i < t.length; ++i) {
            assertGe(vault.backing(t[i]) * 1e18, supply * u[i], "under-backed");
        }
    }

    /// The vault always holds at least what its accounting buckets claim.
    function invariant_balancesCoverBuckets() public view {
        (address[] memory t,) = vault.constituents();
        for (uint256 i; i < t.length; ++i) {
            uint256 claimed = vault.backing(t[i]) + vault.treasury(t[i]) + vault.protocolFees(t[i]);
            assertGe(IERC20(t[i]).balanceOf(address(vault)), claimed, "insolvent bucket");
        }
    }

    /// Units per share never change, whatever prices do.
    function invariant_unitsAreFixed() public view {
        (, uint256[] memory u) = vault.constituents();
        for (uint256 i; i < u.length; ++i) {
            assertEq(u[i], 25e18 * 1e18 / [uint256(336e18), 222e18, 364e18, 194e18][i]);
        }
    }

    /// The last holder can always exit completely: a full redeem of the whole supply succeeds.
    function invariant_everyoneCanExit() public {
        uint256 snap = vm.snapshotState();
        for (uint256 i; i < handler.actorCount(); ++i) {
            address a = handler.actors(i);
            uint256 bal = vault.balanceOf(a);
            if (bal == 0) continue;
            vm.prank(a);
            vault.redeem(bal, a, new uint256[](0), block.timestamp);
        }
        assertEq(vault.totalSupply(), 0);
        vm.revertToState(snap);
    }
}
