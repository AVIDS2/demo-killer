pragma solidity ^0.8.0;
contract Vault {
    mapping(address => uint256) public balances;
    function withdraw(uint256 amount) public {
        (bool success,) = msg.sender.call{value: amount}("");
        balances[msg.sender] -= amount;
    }
}
