// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {TestUSD} from "../src/mocks/TestUSD.sol";
import {PriceOracle} from "../src/PriceOracle.sol";
import {BasketFactory} from "../src/BasketFactory.sol";
import {BasketRouter} from "../src/BasketRouter.sol";

/// @notice Creates the starter baskets on an existing deployment (deployments/<chainId>.json) at $100 / share,
///         and buys an initial position in each unless SEED_BUY=false.
contract Seed is Script {
    uint256 constant NAV = 100e18;

    mapping(string => address) internal stockOf;

    TestUSD usd;
    PriceOracle oracle;
    BasketFactory factory;
    BasketRouter router;
    address deployer;
    bool buy;

    function run() external {
        string memory json = vm.readFile(string.concat("deployments/", vm.toString(block.chainid), ".json"));
        usd = TestUSD(vm.parseJsonAddress(json, ".usd"));
        oracle = PriceOracle(vm.parseJsonAddress(json, ".oracle"));
        factory = BasketFactory(vm.parseJsonAddress(json, ".factory"));
        router = BasketRouter(vm.parseJsonAddress(json, ".router"));
        string[] memory symbols = vm.parseJsonStringArray(json, ".symbols");
        address[] memory stocks = vm.parseJsonAddressArray(json, ".stocks");
        for (uint256 i; i < symbols.length; ++i) {
            stockOf[symbols[i]] = stocks[i];
        }
        buy = vm.envOr("SEED_BUY", true);

        uint256 pk = vm.envUint("PRIVATE_KEY");
        deployer = vm.addr(pk);
        vm.startBroadcast(pk);
        if (buy) usd.approve(address(router), type(uint256).max);

        _seed(
            "Magnificent 7",
            "MAG7",
            "The seven mega-caps driving the index, equal-weighted at launch.",
            _s7("AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META", "TSLA"),
            _w7(1429, 1429, 1429, 1429, 1428, 1428, 1428),
            25_000e6
        );
        _seed(
            "AI Compute",
            "AICORE",
            "Chips and software powering the AI build-out.",
            _s4("NVDA", "AVGO", "AMD", "PLTR"),
            _w4(4000, 2500, 2000, 1500),
            18_000e6
        );
        _seed(
            "Crypto Equities",
            "CRYPTO",
            "Listed companies with direct crypto exposure.",
            _s3("COIN", "MSTR", "HOOD"),
            _w3(4000, 3000, 3000),
            9_000e6
        );
        _seed(
            "AI & Big Tech Titans",
            "TITANS",
            "Four platform giants, 25% each at launch.",
            _s4("META", "GOOGL", "NVDA", "AAPL"),
            _w4(2500, 2500, 2500, 2500),
            12_000e6
        );
        _seed(
            "Screen Time",
            "SCREEN",
            "Where attention goes: streaming, social and devices.",
            _s4("NFLX", "META", "AAPL", "AMZN"),
            _w4(3000, 3000, 2000, 2000),
            6_000e6
        );

        vm.stopBroadcast();
    }

    function _seed(
        string memory name,
        string memory symbol,
        string memory description,
        string[] memory syms,
        uint256[] memory weightsBps,
        uint256 buyUsd
    ) internal {
        address[] memory tokens = new address[](syms.length);
        uint256[] memory units = new uint256[](syms.length);
        for (uint256 i; i < syms.length; ++i) {
            tokens[i] = stockOf[syms[i]];
            require(tokens[i] != address(0), string.concat("unknown stock ", syms[i]));
            units[i] = NAV * weightsBps[i] / 10_000 * 1e18 / oracle.getPrice(tokens[i]);
        }
        address vault = factory.deploy(name, symbol, description, tokens, units, 10, 10);
        if (buy) router.buy(vault, buyUsd, 0, deployer, block.timestamp + 1 hours);
        console.log(symbol, vault);
    }

    function _s3(string memory a, string memory b, string memory c) internal pure returns (string[] memory s) {
        s = new string[](3);
        (s[0], s[1], s[2]) = (a, b, c);
    }

    function _s4(string memory a, string memory b, string memory c, string memory d)
        internal
        pure
        returns (string[] memory s)
    {
        s = new string[](4);
        (s[0], s[1], s[2], s[3]) = (a, b, c, d);
    }

    function _s7(
        string memory a,
        string memory b,
        string memory c,
        string memory d,
        string memory e,
        string memory f,
        string memory g
    ) internal pure returns (string[] memory s) {
        s = new string[](7);
        (s[0], s[1], s[2], s[3], s[4], s[5], s[6]) = (a, b, c, d, e, f, g);
    }

    function _w3(uint256 a, uint256 b, uint256 c) internal pure returns (uint256[] memory w) {
        w = new uint256[](3);
        (w[0], w[1], w[2]) = (a, b, c);
    }

    function _w4(uint256 a, uint256 b, uint256 c, uint256 d) internal pure returns (uint256[] memory w) {
        w = new uint256[](4);
        (w[0], w[1], w[2], w[3]) = (a, b, c, d);
    }

    function _w7(uint256 a, uint256 b, uint256 c, uint256 d, uint256 e, uint256 f, uint256 g)
        internal
        pure
        returns (uint256[] memory w)
    {
        w = new uint256[](7);
        (w[0], w[1], w[2], w[3], w[4], w[5], w[6]) = (a, b, c, d, e, f, g);
    }
}
