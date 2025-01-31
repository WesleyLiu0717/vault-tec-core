// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "./base/BasePool.sol";
import "./interfaces/ITimeLockNonTransferablePool.sol";

contract TimeLockNonTransferablePool is BasePool, ITimeLockNonTransferablePool {
    using Math for uint256;
    using SafeERC20 for IERC20;

    uint256 public immutable maxBonus;
    uint256 public immutable minLockDuration;
    uint256 public immutable maxLockDuration;
    uint256 public constant MIN_LOCK_DURATION_FOR_SAFETY = 10 minutes;
    uint256 public constant forceWithdrawFeeDivider = 100; // 1%

    mapping(address => Deposit[]) public depositsOf;

    struct Deposit {
        uint256 amount;
        uint64 start;
        uint64 end;
    }

    constructor(
        string memory _name,
        string memory _symbol,
        address _depositToken,
        address _rewardToken,
        address _escrowPool,
        uint256 _escrowPortion,
        uint256 _escrowDuration,
        uint256 _maxBonus,
        uint256 _minLockDuration,
        uint256 _maxLockDuration
    ) BasePool(_name, _symbol, _depositToken, _rewardToken, _escrowPool, _escrowPortion, _escrowDuration) {
        require(
            _minLockDuration >= MIN_LOCK_DURATION_FOR_SAFETY,
            "TimeLockNonTransferablePool.constructor: min lock duration must be greater or equal to mininmum lock duration for safety"
        );
        require(
            _maxLockDuration >= _minLockDuration,
            "TimeLockNonTransferablePool.constructor: max lock duration must be greater or equal to mininmum lock duration"
        );
        maxBonus = _maxBonus;
        minLockDuration = _minLockDuration;
        maxLockDuration = _maxLockDuration;
    }

    event Deposited(uint256 amount, uint256 duration, address indexed receiver, address indexed from);
    event Withdrawn(uint256 indexed depositId, address indexed receiver, address indexed from, uint256 amount);

    function _transfer(address _from, address _to, uint256 _amount) internal override {
        revert("NON_TRANSFERABLE");
    }

    function deposit(uint256 _amount, uint256 _duration, address _receiver) external override nonReentrant {
        require(_receiver != address(0), "TimeLockNonTransferablePool.deposit: receiver cannot be zero address");
        require(_amount > 0, "TimeLockNonTransferablePool.deposit: cannot deposit 0");
        // Don't allow locking > maxLockDuration
        uint256 duration = _duration.min(maxLockDuration);
        // Enforce min lockup duration to prevent flash loan or MEV transaction ordering
        duration = duration.max(minLockDuration);

        depositToken.safeTransferFrom(_msgSender(), address(this), _amount);

        depositsOf[_receiver].push(
            Deposit({
                amount: _amount,
                start: uint64(block.timestamp),
                end: uint64(block.timestamp) + uint64(duration)
            })
        );

        uint256 mintAmount = (_amount * getMultiplier(duration)) / 1e18;

        _mint(_receiver, mintAmount);
        emit Deposited(_amount, duration, _receiver, _msgSender());
    }

    function withdraw(uint256 _depositId, address _receiver) external nonReentrant {
        require(_receiver != address(0), "TimeLockNonTransferablePool.withdraw: receiver cannot be zero address");
        Deposit memory userDeposit = depositsOf[_msgSender()][_depositId];
        require(block.timestamp >= userDeposit.end, "TimeLockNonTransferablePool.withdraw: too soon");

        //                      No risk of wrapping around on casting to uint256 since deposit end always > deposit start and types are 64 bits
        uint256 shareAmount = (userDeposit.amount * getMultiplier(uint256(userDeposit.end - userDeposit.start))) / 1e18;

        // remove Deposit
        depositsOf[_msgSender()][_depositId] = depositsOf[_msgSender()][depositsOf[_msgSender()].length - 1];
        depositsOf[_msgSender()].pop();

        // burn pool shares
        _burn(_msgSender(), shareAmount);

        // return tokens
        depositToken.safeTransfer(_receiver, userDeposit.amount);
        emit Withdrawn(_depositId, _receiver, _msgSender(), userDeposit.amount);
    }

    function forceWithdraw(uint256 _depositId, address _depositor) external nonReentrant {
        Deposit memory userDeposit = depositsOf[_depositor][_depositId];
        require(block.timestamp >= userDeposit.end, "TimeLockNonTransferablePool.withdraw: too soon");

        // No risk of wrapping around on casting to uint256 since deposit end always > deposit start and types are 64 bits
        uint256 shareAmount = (userDeposit.amount * getMultiplier(uint256(userDeposit.end - userDeposit.start))) / 1e18;

        // remove Deposit
        depositsOf[_depositor][_depositId] = depositsOf[_depositor][depositsOf[_depositor].length - 1];
        depositsOf[_depositor].pop();

        // burn pool shares
        _burn(_depositor, shareAmount);

        // calculate fee
        uint256 fee = userDeposit.amount / forceWithdrawFeeDivider;

        // return tokens
        depositToken.safeTransfer(msg.sender, fee);
        depositToken.safeTransfer(_depositor, userDeposit.amount - fee);
        emit Withdrawn(_depositId, _depositor, _msgSender(), userDeposit.amount);
    }

    function getMultiplier(uint256 _lockDuration) public view returns (uint256) {
        return 1e18 + ((maxBonus * _lockDuration) / maxLockDuration);
    }

    function getTotalDeposit(address _account) public view returns (uint256) {
        uint256 total;
        for (uint256 i = 0; i < depositsOf[_account].length; i++) {
            total += depositsOf[_account][i].amount;
        }

        return total;
    }

    function getDepositsOf(address _account) public view returns (Deposit[] memory) {
        return depositsOf[_account];
    }

    function getDepositsOfLength(address _account) public view returns (uint256) {
        return depositsOf[_account].length;
    }
}
