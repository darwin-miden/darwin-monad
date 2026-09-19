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
import {BasketLens} from "../src/BasketLens.sol";

contract BasketTest is Test {
    address admin = makeAddr("admin");
    address treasuryAddr = makeAddr("protocolTreasury");
    address creator = makeAddr("creator");
    address alice = makeAddr("alice");

    TestUSD usd;
    PriceOracle oracle;
    StockMarket market;
    BasketFactory factory;
    BasketRouter router;
    BasketLens lens;
    StockToken aapl;
    StockToken nvda;
    StockToken tsla;
    BasketVault vault;

    function setUp() public {
        vm.startPrank(admin);
        usd = new TestUSD(admin);
        oracle = new PriceOracle(admin);
        market = new StockMarket(admin, IERC20(address(usd)), oracle, 10);
        factory = new BasketFactory(admin, treasuryAddr);
        router = new BasketRouter(IERC20(address(usd)), market, factory);
        lens = new BasketLens(factory, oracle);

        aapl = _stock("Apple", "AAPL", 200e18);
        nvda = _stock("NVIDIA", "NVDA", 100e18);
        tsla = _stock("Tesla", "TSLA", 400e18);
        usd.mint(address(market), 10_000_000e6);
        vm.stopPrank();

        // $100 NAV basket: 40% AAPL, 40% NVDA, 20% TSLA.
        address[] memory tokens = new address[](3);
        tokens[0] = address(aapl);
        tokens[1] = address(nvda);
        tokens[2] = address(tsla);
        uint256[] memory units = new uint256[](3);
        units[0] = 0.2e18; // $40
        units[1] = 0.4e18; // $40
        units[2] = 0.05e18; // $20
        vm.prank(creator);
        vault = BasketVault(factory.deploy("AI Titans", "TITANS", "Big tech", tokens, units, 10, 10));

        vm.prank(alice);
        usd.faucet();
    }

    function _stock(string memory name, string memory symbol, uint256 price) internal returns (StockToken t) {
        t = new StockToken(name, symbol, address(market));
        market.listStock(address(t));
        factory.addAsset(address(t));
        address[] memory tokens = new address[](1);
        tokens[0] = address(t);
        uint256[] memory prices = new uint256[](1);
        prices[0] = price;
        oracle.setPrices(tokens, prices);
    }

    function test_navAndWeights() public view {
        BasketLens.BasketView memory b = lens.getBasket(address(vault));
        assertEq(b.nav, 100e18);
        assertEq(b.legs[0].weightBps, 4000);
        assertEq(b.legs[1].weightBps, 4000);
        assertEq(b.legs[2].weightBps, 2000);
        assertEq(b.owner, creator);
    }

    function test_routerBuyAndSell() public {
        vm.startPrank(alice);
        usd.approve(address(router), type(uint256).max);
        uint256 quoted = router.quoteBuy(address(vault), 1_000e6);
        uint256 shares = router.buy(address(vault), 1_000e6, quoted, alice, block.timestamp);
        assertEq(shares, quoted);
        assertEq(vault.balanceOf(alice), shares);
        // 10 bps owner + 30 bps protocol + 10 bps spread = ~0.5% cost
        assertApproxEqRel(shares, 9.95e18, 0.001e18);
        assertGe(usd.balanceOf(alice), 9_000e6); // dust refunded, never overspent

        // backing covers every outstanding share
        (address[] memory tokens, uint256[] memory units) = vault.constituents();
        for (uint256 i; i < tokens.length; ++i) {
            assertGe(vault.backing(tokens[i]), shares * units[i] / 1e18);
            assertGe(IERC20(tokens[i]).balanceOf(address(vault)), vault.backing(tokens[i]));
        }

        vault.approve(address(router), shares);
        uint256 quotedOut = router.quoteSell(address(vault), shares);
        uint256 out = router.sell(address(vault), shares, quotedOut, alice, block.timestamp);
        assertEq(out, quotedOut);
        assertEq(vault.totalSupply(), 0);
        // round trip loses ~0.9% (mint fees 0.4%, redeem fees 0.3%, spread 0.1% x2)
        assertApproxEqRel(usd.balanceOf(alice), 10_000e6 - 9e6, 0.0005e18);
        vm.stopPrank();
    }

    function test_buyExact() public {
        vm.startPrank(alice);
        usd.approve(address(router), type(uint256).max);
        uint256 cost = router.quoteBuyExact(address(vault), 3e18);
        uint256 paid = router.buyExact(address(vault), 3e18, cost, alice, block.timestamp);
        assertEq(paid, cost);
        assertEq(vault.balanceOf(alice), 3e18);
        vm.stopPrank();
    }

    function test_priceMoveChangesNavNotUnits() public {
        vm.startPrank(alice);
        usd.approve(address(router), type(uint256).max);
        router.buy(address(vault), 1_000e6, 0, alice, block.timestamp);
        vm.stopPrank();

        address[] memory tokens = new address[](1);
        tokens[0] = address(nvda);
        uint256[] memory prices = new uint256[](1);
        prices[0] = 150e18; // NVDA +50%
        vm.prank(admin);
        oracle.setPrices(tokens, prices);

        BasketLens.BasketView memory b = lens.getBasket(address(vault));
        assertEq(b.nav, 120e18);
        assertEq(b.legs[1].units, 0.4e18);
        assertEq(b.legs[1].weightBps, 5000);
    }

    function test_directMintRedeemAndFees() public {
        // Alice acquires constituents herself, mints directly, then redeems in kind.
        uint256[] memory need = vault.previewMint(1e18);
        vm.startPrank(alice);
        usd.approve(address(market), type(uint256).max);
        market.buyExactOut(address(aapl), need[0], type(uint256).max, alice);
        market.buyExactOut(address(nvda), need[1], type(uint256).max, alice);
        market.buyExactOut(address(tsla), need[2], type(uint256).max, alice);
        aapl.approve(address(vault), need[0]);
        nvda.approve(address(vault), need[1]);
        tsla.approve(address(vault), need[2]);
        vault.mint(1e18, alice, need, block.timestamp);
        assertEq(vault.balanceOf(alice), 1e18);
        assertEq(need[0], 0.2e18 + 0.0002e18 + 0.0006e18);

        uint256[] memory outs = vault.redeem(1e18, alice, new uint256[](0), block.timestamp);
        assertEq(outs[0], 0.2e18 - 0.0002e18 - 0.0004e18);
        vm.stopPrank();

        assertEq(vault.treasury(address(aapl)), 0.0004e18);
        assertEq(vault.protocolFees(address(aapl)), 0.001e18);

        vm.prank(creator);
        vault.withdrawTreasury(creator);
        assertEq(aapl.balanceOf(creator), 0.0004e18);

        vault.sweepProtocolFees();
        assertEq(aapl.balanceOf(treasuryAddr), 0.001e18);
    }

    function test_revertsOnUnknownAssetAndDuplicates() public {
        address[] memory tokens = new address[](2);
        tokens[0] = address(aapl);
        tokens[1] = address(usd);
        uint256[] memory units = new uint256[](2);
        units[0] = 1;
        units[1] = 1;
        vm.expectRevert(abi.encodeWithSelector(BasketFactory.UnknownAsset.selector, address(usd)));
        factory.deploy("x", "X", "", tokens, units, 0, 0);

        tokens[1] = address(aapl);
        vm.expectRevert(BasketVault.InvalidConstituents.selector);
        factory.deploy("x", "X", "", tokens, units, 0, 0);
    }

    function test_ownerFeeCap() public {
        vm.prank(creator);
        vm.expectRevert(BasketVault.FeeTooHigh.selector);
        vault.setFees(101, 0);
    }

    function test_holdings() public {
        vm.startPrank(alice);
        usd.approve(address(router), type(uint256).max);
        router.buy(address(vault), 500e6, 0, alice, block.timestamp);
        vm.stopPrank();
        BasketLens.Holding[] memory h = lens.getHoldings(alice);
        assertEq(h.length, 1);
        assertEq(h[0].vault, address(vault));
        assertApproxEqRel(h[0].value, 497.5e18, 0.001e18);
    }

    function testFuzz_buyNeverOverspends(uint256 usdIn) public {
        usdIn = bound(usdIn, 1e6, 10_000e6);
        vm.startPrank(alice);
        usd.approve(address(router), type(uint256).max);
        uint256 before = usd.balanceOf(alice);
        uint256 shares = router.buy(address(vault), usdIn, 0, alice, block.timestamp);
        assertLe(before - usd.balanceOf(alice), usdIn);
        assertEq(vault.balanceOf(alice), shares);
        vm.stopPrank();
    }
}
