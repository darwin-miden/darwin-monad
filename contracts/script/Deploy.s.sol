// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {TestUSD} from "../src/mocks/TestUSD.sol";
import {PriceOracle} from "../src/PriceOracle.sol";
import {StockMarket} from "../src/StockMarket.sol";
import {StockToken} from "../src/StockToken.sol";
import {BasketFactory} from "../src/BasketFactory.sol";
import {BasketRouter} from "../src/BasketRouter.sol";
import {BasketLens} from "../src/BasketLens.sol";

/// @notice Deploys the Darwin core and lists tokenized stocks at live prices. Seed baskets with Seed.s.sol.
///         Run `python3 scripts/fetch-prices.py` first to refresh deployments/prices.json.
contract Deploy is Script {
    uint256 constant MARKET_RESERVE = 50_000_000e6;
    uint256 constant DEPLOYER_USD = 1_000_000e6;

    TestUSD usd;
    PriceOracle oracle;
    StockMarket market;
    BasketFactory factory;
    BasketRouter router;
    BasketLens lens;
    address deployer;

    function run() external {
        string memory json = vm.readFile("deployments/prices.json");
        string[] memory symbols = vm.parseJsonStringArray(json, ".symbols");
        string[] memory names = vm.parseJsonStringArray(json, ".names");
        uint256[] memory prices = vm.parseJsonUintArray(json, ".prices");

        uint256 pk = vm.envUint("PRIVATE_KEY");
        deployer = vm.addr(pk);
        vm.startBroadcast(pk);

        usd = new TestUSD(deployer);
        oracle = new PriceOracle(deployer);
        market = new StockMarket(deployer, IERC20(address(usd)), oracle, 10);
        factory = new BasketFactory(deployer, deployer);
        router = new BasketRouter(IERC20(address(usd)), market, factory);
        lens = new BasketLens(factory, oracle);

        address[] memory tokens = new address[](symbols.length);
        for (uint256 i; i < symbols.length; ++i) {
            StockToken t = new StockToken(string.concat(names[i], " (Darwin)"), symbols[i], address(market));
            market.listStock(address(t));
            factory.addAsset(address(t));
            tokens[i] = address(t);
        }
        oracle.setPrices(tokens, prices);

        usd.mint(address(market), MARKET_RESERVE);
        usd.mint(deployer, DEPLOYER_USD);

        vm.stopBroadcast();

        string memory o = "deployment";
        vm.serializeUint(o, "chainId", block.chainid);
        vm.serializeUint(o, "startBlock", block.number);
        vm.serializeAddress(o, "usd", address(usd));
        vm.serializeAddress(o, "oracle", address(oracle));
        vm.serializeAddress(o, "market", address(market));
        vm.serializeAddress(o, "factory", address(factory));
        vm.serializeAddress(o, "router", address(router));
        vm.serializeAddress(o, "lens", address(lens));
        vm.serializeString(o, "symbols", symbols);
        string memory out = vm.serializeAddress(o, "stocks", tokens);
        vm.writeJson(out, string.concat("deployments/", vm.toString(block.chainid), ".json"));

        console.log("factory", address(factory));
        console.log("router ", address(router));
        console.log("lens   ", address(lens));
    }
}
